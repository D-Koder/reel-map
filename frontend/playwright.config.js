import { defineConfig, devices } from '@playwright/test';

// Browser tests drive the real app (npm run dev) signed in as the TEST accounts.
// frontend/.env.local must point at the TEST Supabase project and have VITE_MAPBOX_TOKEN.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    ...devices['iPhone 13'],
    browserName: 'chromium',
    // The map needs WebGL; headless Chromium gets it from SwiftShader.
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    geolocation: { latitude: -37.8183, longitude: 144.9671 },
    permissions: ['geolocation'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
