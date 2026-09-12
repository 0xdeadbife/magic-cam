import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/pages",
  outputDir: "test-results/pages",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:4174/pages-check/",
    headless: true,
    viewport: { width: 1100, height: 800 },
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
  },
  webServer: {
    command: "node scripts/serve-pages-test.mjs",
    url: "http://127.0.0.1:4174/pages-check/",
    reuseExistingServer: false,
    timeout: 15000,
  },
});
