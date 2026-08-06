import { expect, test, type Page } from "@playwright/test";

const appPath = process.env.PLAYWRIGHT_APP_PATH ?? "/";

const hideDiscoveryHint = async (page: Page) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("solar-system-sim.discoveryHintDismissed", "true");
  });
};

test.describe("rendering reliability", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("recovers visibly from WebGL context loss", async ({ page }) => {
    await hideDiscoveryHint(page);
    await page.goto(appPath);
    const canvas = page.locator("canvas.solar-canvas");
    const recoveryStatus = page.locator("section.webgl-fallback[role='status']");
    await expect(canvas).toBeVisible();

    const canLoseContext = await canvas.evaluate((element) => {
      const canvasElement = element as HTMLCanvasElement;
      const context = canvasElement.getContext("webgl2") ?? canvasElement.getContext("webgl");
      const extension = context?.getExtension("WEBGL_lose_context");
      (window as typeof window & { __solarWebglLossExtension?: WEBGL_lose_context })
        .__solarWebglLossExtension = extension ?? undefined;
      extension?.loseContext();
      return Boolean(extension);
    });
    expect(canLoseContext, "the Chromium renderer should expose WEBGL_lose_context").toBe(true);
    await expect(recoveryStatus).toContainText("Restoring WebGL");

    await canvas.evaluate((element) => {
      void element;
      (window as typeof window & { __solarWebglLossExtension?: WEBGL_lose_context })
        .__solarWebglLossExtension?.restoreContext();
    });
    await expect(recoveryStatus).toHaveCount(0);
    await expect(canvas).toBeVisible();
  });

  test("offers bounded, sanitized, copyable diagnostics when WebGL cannot initialize", async ({ context, page }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.addInitScript(() => {
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function patchedGetContext(
        this: HTMLCanvasElement,
        contextId: string,
        ...options: unknown[]
      ) {
        if (contextId === "webgl" || contextId === "webgl2" || contextId === "experimental-webgl") {
          throw new Error("WebGL disabled by reliability test");
        }
        return originalGetContext.call(this, contextId, ...options);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });

    await page.goto(appPath);
    const fallback = page.getByRole("alert");
    await expect(fallback).toContainText("WebGL unavailable");
    await expect(fallback.getByRole("button", { name: "Retry" })).toBeVisible();
    const copyButton = fallback.getByRole("button", { name: "Copy diagnostics" });
    await expect(copyButton).toBeVisible();

    await page.evaluate(() => {
      for (let index = 0; index < 25; index += 1) {
        const error = new Error(
          `diagnostic ${index} https://example.test/app.js?token=private#account`,
        );
        error.stack = `Error: diagnostic ${index}\n    at https://example.test/bundle.js?token=private#account`;
        window.dispatchEvent(
          new ErrorEvent("error", {
            error,
            filename: "https://example.test/bundle.js?token=private#account",
            lineno: index + 1,
            message: error.message,
          }),
        );
      }
    });

    await copyButton.click();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    const reports = JSON.parse(clipboard) as Array<{ kind: string; message: string; stack?: string }>;
    expect(reports).toHaveLength(20);
    expect(reports[0]?.message).toContain("diagnostic 5 https://example.test/app.js");
    expect(reports.at(-1)?.message).toContain("diagnostic 24 https://example.test/app.js");
    expect(clipboard).not.toContain("token=private");
    expect(clipboard).not.toContain("#account");
  });

  test("records a service-worker registration failure without breaking the app", async ({ page }) => {
    await hideDiscoveryHint(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: {
          register: () => Promise.reject(new Error("Registration denied")),
        },
      });
    });

    await page.goto(appPath);
    await expect(page.locator("canvas.solar-canvas")).toBeVisible();
    await expect.poll(async () => page.evaluate(() => window.sessionStorage.getItem("solar-system-sim.diagnostics.v1")))
      .toContain("service-worker-registration-failure");
  });

  test("@cross-browser renders a nonblank, chromatic scene", async ({ page }) => {
    await hideDiscoveryHint(page);
    await page.goto(appPath);
    const canvas = page.locator("canvas.solar-canvas");
    await expect(canvas).toBeVisible();

    const screenshot = await canvas.screenshot({ type: "png" });
    const source = `data:image/png;base64,${screenshot.toString("base64")}`;
    const stats = await page.evaluate(async (imageSource) => {
      const image = new Image();
      image.src = imageSource;
      await image.decode();
      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = image.naturalWidth;
      sampleCanvas.height = image.naturalHeight;
      const context = sampleCanvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        throw new Error("Could not sample the scene screenshot");
      }
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
      let chromatic = 0;
      let lit = 0;
      let minimum = 255;
      let maximum = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        const brightness = Math.max(red, green, blue);
        minimum = Math.min(minimum, brightness);
        maximum = Math.max(maximum, brightness);
        if (red + green + blue > 36) {
          lit += 1;
        }
        if (brightness > 42 && Math.max(red, green, blue) - Math.min(red, green, blue) > 12) {
          chromatic += 1;
        }
      }
      const total = pixels.length / 4;
      return {
        chromaticRatio: chromatic / total,
        contrastRange: maximum - minimum,
        litRatio: lit / total,
      };
    }, source);

    expect(stats.contrastRange, "the scene should contain meaningful luminance contrast").toBeGreaterThan(48);
    expect(stats.litRatio, "the canvas should contain rendered bodies and guides").toBeGreaterThan(0.01);
    expect(stats.chromaticRatio, "the scene should contain colored planetary or solar pixels").toBeGreaterThan(0.0005);
  });
});
