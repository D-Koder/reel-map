import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const apiHandlers = {
  '/api/enrich-reel': require('../api/enrich-reel.js'),
  '/api/scrape-location': require('../api/scrape-location.js'),
  '/api/report-lookup': require('../api/report-lookup.js'),
};

function localApi() {
  process.env.PUPPETEER_EXECUTABLE_PATH ||= require('puppeteer').executablePath();
  return {
    name: 'local-api-handlers',
    configureServer(server) {
      for (const [path, handler] of Object.entries(apiHandlers)) {
        server.middlewares.use(path, (req, res, next) => {
          if (req.method !== 'POST') return next();
          let body = '';
          req.setEncoding('utf8');
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', async () => {
            try {
              req.body = JSON.parse(body || '{}');
              await handler(req, {
                status(code) {
                  res.statusCode = code;
                  return this;
                },
                json(payload) {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(payload));
                },
              });
            } catch (error) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: error.message || 'Local API request failed' }));
            }
          });
        });
      }
    },
  };
}

// The commit this build is from: Vercel says which, else git, else "dev".
function buildCommit() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}
const version = { commit: buildCommit(), builtAt: new Date().toISOString() };

// Writes version.json next to the app. Settings reads it from the server to tell when a newer build
// is live than the one running, i.e. the page needs a refresh.
function versionFile() {
  return {
    name: 'version-file',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(version) });
    },
  };
}

export default defineConfig({
  plugins: [react(), localApi(), versionFile()],
  define: { __APP_VERSION__: JSON.stringify(version) },
});
