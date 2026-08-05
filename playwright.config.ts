import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4397);
const baseURL = `http://127.0.0.1:${port}`;
const appPath = process.env.PLAYWRIGHT_APP_PATH ?? "/";
const isCI = Boolean(process.env.CI);
const usePrebuiltArtifact = process.env.PLAYWRIGHT_PREBUILT === "1";
const previewCommand = `node scripts/serve-built-app.mjs --port ${port}`;

if (!appPath.startsWith("/") || !appPath.endsWith("/")) {
  throw new Error("PLAYWRIGHT_APP_PATH must begin and end with '/'.");
}

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
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium", contextOptions: { reducedMotion: "no-preference" } },
    },
    {
      name: "chromium-reduced-motion",
      grep: /@smoke/,
      use: { browserName: "chromium", contextOptions: { reducedMotion: "reduce" } },
    },
    {
      name: "webkit",
      grep: /@smoke/,
      use: { browserName: "webkit", contextOptions: { reducedMotion: "reduce" } },
    },
  ],
  webServer: {
    command: `${usePrebuiltArtifact ? "" : "npm run build && "}${previewCommand}`,
    url: `${baseURL}${appPath}`,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
    timeout: 180_000,
  },
});
