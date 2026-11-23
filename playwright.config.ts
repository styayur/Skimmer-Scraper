import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.SKIMMER_TEST_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    // Capture the first failure's screenshot and record trace/video on retry.
    // Software-rendered flights share the runner with those recorders.
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    video: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
        },
      },
    },
  ],
  webServer: {
    command: `npm run preview -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
