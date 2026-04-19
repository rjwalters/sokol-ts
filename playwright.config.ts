import { defineConfig } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: isCI ? 2 : 1,
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    launchOptions: {
      args: [
        "--enable-unsafe-webgpu",
        "--enable-features=Vulkan",
        "--use-angle=vulkan",
        // Software Vulkan renderer for Linux CI without a GPU
        ...(isCI ? ["--use-vulkan=swiftshader"] : []),
      ],
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
