import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const apiHandlers = {
  '/api/enrich-reel': require('../api/enrich-reel.js'),
  '/api/scrape-location': require('../api/scrape-location.js'),
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

export default defineConfig({
  plugins: [react(), localApi()],
});
