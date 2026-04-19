import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: "http://localhost:5173",
    // WebGPU needs the full browser, not the headless shell
    headless: false,
    launchOptions: {
      args: ["--enable-unsafe-webgpu"],
    },
    viewport: { width: 800, height: 600 },
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: {
    command: "npx vite --port 5173",
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
});
