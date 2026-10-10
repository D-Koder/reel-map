#!/usr/bin/env node
// Local live-log runner for the Instagram and Google Maps scrapers.
// Calls the same handlers the app uses (api/scrape-reel.js, api/scrape-location.js,
// api/enrich-reel.js) and streams their console output to the browser over SSE.
// Binds to 127.0.0.1 only because it launches real scrapers.

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const util = require('node:util');

const PORT = Number(process.env.PORT) || 4174;
const HOST = '127.0.0.1';
const MAX_BODY_BYTES = 64 * 1024;

const apiDir = path.join(__dirname, '..', '..', 'api');
const scrapeReel = require(path.join(apiDir, 'scrape-reel.js'));
const scrapeLocation = require(path.join(apiDir, 'scrape-location.js'));
const enrichReel = require(path.join(apiDir, 'enrich-reel.js'));

// Same response shape the Vercel handlers expect (status().json()).
function invoke(handler, body) {
  const response = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return Promise.resolve(handler({ method: 'POST', body }, response)).then(() => response);
}

const MODES = {
  instagram: {
    fields: ['reelUrl'],
    run: (input) => invoke(scrapeReel, { reelUrl: input.reelUrl }),
  },
  'maps-search': {
    fields: ['query'],
    run: (input) => invoke(scrapeLocation, { action: 'search', query: input.query, location: input.query }),
  },
  'maps-details': {
    fields: ['placeUrl', 'placeName', 'query'],
    run: (input) => invoke(scrapeLocation, {
      action: 'details',
      query: input.query,
      placeUrl: input.placeUrl,
      placeName: input.placeName,
    }),
  },
  pipeline: {
    fields: ['reelUrl'],
    run: (input) => invoke(enrichReel, { reelUrl: input.reelUrl }),
  },
};

const clients = new Set();
let runCounter = 0;
let queue = Promise.resolve();
let activeRun = null;

function broadcast(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) client.write(payload);
}

// Keeps the original console methods so server output still reaches the terminal.
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

function formatArgs(args) {
  return args.map((arg) => (typeof arg === 'string' ? arg : util.inspect(arg, { depth: 4, breakLength: Infinity }))).join(' ');
}

function captureConsole(runNo) {
  const levels = { log: 'info', info: 'info', warn: 'warn', error: 'error' };
  for (const [method, level] of Object.entries(levels)) {
    console[method] = (...args) => {
      originalConsole[method](...args);
      broadcast({ type: 'log', run: runNo, level, time: new Date().toISOString(), message: formatArgs(args) });
    };
  }
}

function restoreConsole() {
  Object.assign(console, originalConsole);
}

async function runScrape(mode, input) {
  const runNo = ++runCounter;
  activeRun = runNo;
  broadcast({ type: 'start', run: runNo, mode, input, time: new Date().toISOString() });
  captureConsole(runNo);
  try {
    const response = await MODES[mode].run(input);
    broadcast({ type: 'done', run: runNo, status: response.statusCode, result: response.body, time: new Date().toISOString() });
    return { status: response.statusCode, body: response.body };
  } catch (error) {
    broadcast({ type: 'failed', run: runNo, message: error.message, time: new Date().toISOString() });
    return { status: 500, body: { error: error.message } };
  } finally {
    restoreConsole();
    activeRun = null;
  }
}

// One scrape at a time: console capture is process-wide, so runs must not overlap.
let pendingRuns = 0;

function enqueueRun(mode, input) {
  if (pendingRuns > 0) {
    broadcast({ type: 'queued', mode, ahead: pendingRuns, time: new Date().toISOString() });
  }
  pendingRuns += 1;
  const next = queue.then(() => runScrape(mode, input));
  queue = next.catch(() => {}).finally(() => { pendingRuns -= 1; });
  return next;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('Body must be JSON'));
      }
    });
    req.on('error', reject);
  });
}

function validateInput(mode, body) {
  const input = {};
  for (const field of MODES[mode].fields) {
    input[field] = typeof body[field] === 'string' ? body[field].trim() : '';
  }
  if (mode === 'instagram' || mode === 'pipeline') {
    if (!input.reelUrl) return { error: 'Paste an Instagram reel or post link' };
  }
  if (mode === 'maps-search' && !input.query) return { error: 'Enter a place name or address' };
  if (mode === 'maps-details' && !input.placeUrl) return { error: 'Paste a Google Maps place link' };
  return { input };
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function handleEvents(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(`data: ${JSON.stringify({ type: 'hello', modes: Object.keys(MODES), running: activeRun })}\n\n`);
  clients.add(res);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

async function handleRun(req, res) {
  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }
  const mode = body.mode;
  if (!MODES[mode]) return sendJson(res, 400, { error: `Unknown mode "${mode}"` });
  const { input, error } = validateInput(mode, body);
  if (error) return sendJson(res, 400, { error });

  const result = await enqueueRun(mode, input);
  return sendJson(res, result.status, result.body);
}

const page = path.join(__dirname, 'index.html');

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(page));
    }
    if (req.method === 'GET' && req.url === '/events') return handleEvents(req, res);
    if (req.method === 'POST' && req.url === '/run') return await handleRun(req, res);
    return sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  originalConsole.log(`Live scraper running at http://${HOST}:${PORT}`);
});
