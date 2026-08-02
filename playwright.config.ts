import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4397);
const baseURL = `http://127.0.0.1:${port}`;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // WebGL-heavy pages can share a constrained GPU/software renderer locally and in CI.
  // Two simultaneous scenes starve each other's initialization even when stable alone.
  workers: 1,
  // WebGL scenario and authored-tour flows exercise real camera settling plus software
  // rendering. They are stable but legitimately exceed 30s on constrained runners.
  timeout: isCI ? 90_000 : 75_000,
  expect: {
    timeout: isCI ? 20_000 : 8_000,
  },
  reporter: isCI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    colorScheme: "dark",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
