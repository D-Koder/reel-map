const { AsyncLocalStorage } = require('node:async_hooks');

// Keeps the console lines one request writes, so they can be saved with its lookup_debug row.
// One server runs several requests at once, so each request's lines are kept apart by AsyncLocalStorage.
const store = new AsyncLocalStorage();
const MAX_LINES = 500;
let patched = false;

function patchConsole() {
  if (patched) return;
  patched = true;
  for (const level of ['log', 'info', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      const lines = store.getStore();
      if (lines && lines.length < MAX_LINES) {
        const text = args.map((arg) => {
          if (typeof arg === 'string') return arg;
          if (arg instanceof Error) return arg.stack || arg.message;
          try { return JSON.stringify(arg); } catch { return String(arg); }
        }).join(' ');
        lines.push(`[${new Date().toISOString().slice(11, 19)}] ${level.toUpperCase()} ${text}`);
      }
      original(...args);
    };
  }
}

// Runs fn, keeping every console line it writes (the lines are still printed as usual).
function captureConsole(fn) {
  patchConsole();
  return store.run([], fn);
}

// The lines kept so far in this request, or [] outside captureConsole.
function capturedLines() {
  return [...(store.getStore() || [])];
}

module.exports = { captureConsole, capturedLines };
