import { expect, test, type Locator, type Page } from "@playwright/test";

const appPath = process.env.PLAYWRIGHT_APP_PATH ?? "/";
const appUrl = (params?: URLSearchParams) => `${appPath}${params ? `?${params.toString()}` : ""}`;
const runtimeProblems = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const problems: string[] = [];
  runtimeProblems.set(page, problems);
  page.on("console", (message) => {
    if (message.type() === "error") {
      problems.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
});

test.afterEach(async ({ page }) => {
  expect(runtimeProblems.get(page) ?? [], "the app should not emit console or page errors").toEqual([]);
});

const hideDiscoveryHint = async (page: Page) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("solar-system-sim.discoveryHintDismissed", "true");
  });
};

const openApp = async (page: Page) => {
  await hideDiscoveryHint(page);
  await page.goto(appUrl());
  await expect(page.locator("#main-controls")).toBeVisible();
  await expect(page.getByRole("img", { name: "Interactive 3D solar system simulation" })).toBeVisible();
};

const expectNoOverlap = async (first: Locator, second: Locator, label: string) => {
  const [firstBox, secondBox] = await Promise.all([first.boundingBox(), second.boundingBox()]);
  expect(firstBox, `${label}: first surface should be visible`).not.toBeNull();
  expect(secondBox, `${label}: second surface should be visible`).not.toBeNull();

  if (!firstBox || !secondBox) {
    return;
  }

  const overlaps =
    firstBox.x < secondBox.x + secondBox.width &&
    firstBox.x + firstBox.width > secondBox.x &&
    firstBox.y < secondBox.y + secondBox.height &&
    firstBox.y + firstBox.height > secondBox.y;

  expect(overlaps, `${label}: ${JSON.stringify(firstBox)} overlaps ${JSON.stringify(secondBox)}`).toBe(false);
};

const expectInLeftRail = async (page: Page, surface: Locator, label: string) => {
  const [box, viewport] = await Promise.all([surface.boundingBox(), Promise.resolve(page.viewportSize())]);
  expect(box, `${label}: guided surface should be visible`).not.toBeNull();
  expect(viewport, `${label}: viewport should be available`).not.toBeNull();

  if (!box || !viewport) {
    return;
  }

  const viewportCenterX = viewport.width / 2;
  expect(box.x, `${label}: guided surface should be edge anchored`).toBeLessThanOrEqual(32);
  expect(
    box.x + box.width,
    `${label}: guided surface should leave the centered camera target clear`,
  ).toBeLessThan(viewportCenterX - 24);
};

const selectTitanFromSearch = async (page: Page) => {
  await page.getByRole("button", { name: "Search objects" }).click();
  const input = page.getByRole("combobox", { name: "Search commands and objects" });
  await input.fill("Titan");
  await expect(input).toHaveAttribute("aria-activedescendant", "command-item-body-titan");
  await input.press("Enter");
  await expect(page.locator(".focus-title strong")).toHaveText("Titan");
};

const goToBodyFromSearch = async (page: Page, bodyName: string) => {
  await page.getByRole("button", { name: "Search objects" }).click();
  const input = page.getByRole("combobox", { name: "Search commands and objects" });
  await input.fill(bodyName);
  await input.press("Enter");
  await expect(page.locator(".focus-title strong")).toHaveText(bodyName);
};

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("offers action-first onboarding without obscuring the simulator", async ({ page }) => {
    await page.goto(appUrl());
    const gettingStarted = page.getByRole("complementary", { name: "Start exploring" });
    await expect(gettingStarted).toBeVisible();
    await expect(gettingStarted.getByRole("button", { name: "Find a world" })).toBeVisible();
    await expect(gettingStarted.getByRole("button", { name: "Take a tour" })).toBeVisible();
    await expect(gettingStarted.getByRole("button", { name: "Plan a mission" })).toBeVisible();
    await gettingStarted.getByRole("button", { name: "Find a world" }).click();
    await expect(page.getByRole("dialog", { name: "Search and commands" })).toBeVisible();
    await expect(gettingStarted).toHaveCount(0);
  });

  test("@smoke renders the simulator controls and canvas", async ({ page }) => {
    await openApp(page);
    await expect(page.locator(".top-bar")).toBeVisible();
    await expect(page.getByRole("complementary")).toContainText("Earth");
    await expect(page.getByRole("region", { name: "Time controls" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();

    const timeline = page.getByRole("slider", { name: "Timeline" });
    await timeline.evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = input.max;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(page.getByText("Orbit positions extrapolated beyond the validated 1800–2050 model")).toBeVisible();
  });

  test("installs a lean app shell and caches visited textures for offline use", async ({ page, context }) => {
    await openApp(page);
    const initialCacheState = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) {
        return null;
      }
      await navigator.serviceWorker.ready;
      const cacheNames = await caches.keys();
      const shellCacheName = cacheNames.find(
        (name) => name.startsWith("solar-system-sim-") && !name.endsWith("-textures-v2"),
      );
      const textureCacheName = cacheNames.find((name) => name.endsWith("-textures-v2"));
      const shellPaths = shellCacheName
        ? (await (await caches.open(shellCacheName)).keys()).map((request) => new URL(request.url).pathname)
        : [];
      const texturePaths = textureCacheName
        ? (await (await caches.open(textureCacheName)).keys()).map((request) => new URL(request.url).pathname)
        : [];
      return { shellCacheName, shellPaths, textureCacheName, texturePaths };
    });
    expect(initialCacheState?.shellCacheName).toBeTruthy();
    expect(initialCacheState?.textureCacheName).toBeTruthy();
    expect(initialCacheState?.shellPaths.some((path) => path.includes("/textures/"))).toBe(false);
    expect(initialCacheState?.texturePaths).toEqual([]);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#main-controls")).toBeVisible();
    await goToBodyFromSearch(page, "Saturn");
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const textureCacheName = (await caches.keys()).find((name) => name.endsWith("-textures-v2"));
          if (!textureCacheName) {
            return false;
          }
          const requests = await (await caches.open(textureCacheName)).keys();
          return requests.some((request) => new URL(request.url).pathname.endsWith("/textures/saturn.jpg"));
        }),
      )
      .toBe(true);

    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator("#main-controls")).toBeVisible();
      await expect(page.getByRole("img", { name: "Interactive 3D solar system simulation" })).toBeVisible();
      await goToBodyFromSearch(page, "Saturn");
    } finally {
      await context.setOffline(false);
    }
  });

  test("keeps icon help hoverable and lets Escape dismiss only the tooltip first", async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: "Guided experiences", exact: true }).click();
    await page.getByRole("button", { name: /^Scale Revelation/ }).click();
    const guidedWatch = page.getByRole("region", { name: "Scale Revelation watch" });
    await expect(guidedWatch).toBeVisible();

    const search = page.getByRole("button", { name: "Search objects" });
    await search.focus();
    const tooltip = page.getByRole("tooltip", { name: /Search objects/ });
    await expect(tooltip).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(tooltip).toBeHidden();
    await expect(guidedWatch).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(guidedWatch).toHaveCount(0);
    await page.keyboard.press("Tab");

    await search.hover();
    await expect(tooltip).toBeVisible();
    await tooltip.hover();
    await expect(tooltip).toBeVisible();
  });

  test("renders the Earth and Saturn hero shaders without console errors", async ({ page }) => {
    const shaderErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" || message.text().includes("THREE.WebGLProgram: Shader Error")) {
        shaderErrors.push(message.text());
      }
    });

    await openApp(page);
    await goToBodyFromSearch(page, "Saturn");
    await goToBodyFromSearch(page, "Earth");
    await page.evaluate(
      () => new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))),
    );

    expect(shaderErrors).toEqual([]);
  });

  test("keeps desktop panels clear at a laptop viewport", async ({ page }) => {
    await openApp(page);

    await page.getByRole("button", { name: "Rocket preview" }).click();
    const rocket = page.getByRole("region", { name: "Rocket preview" });
    await expect(rocket).toBeVisible();
    await expectNoOverlap(rocket, page.locator(".scale-controls"), "rocket and view controls");
    await expectNoOverlap(rocket, page.getByRole("region", { name: "Time controls" }), "rocket and time controls");
    await expectNoOverlap(rocket, page.locator(".doomsday-dock"), "rocket and what-if launcher");

    await page.getByRole("button", { name: "Close rocket panel" }).click();
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.getByRole("button", { name: "Open what-if scenarios" }).click();
    await expectNoOverlap(
      page.getByRole("region", { name: "What-if scenarios" }),
      page.locator(".scale-controls"),
      "what-if lab and view controls on a short laptop",
    );

    await page.getByRole("button", { name: "Help and shortcuts" }).click();
    const help = page.getByRole("dialog", { name: "Help and shortcuts" });
    await expect(help).toBeVisible();
    await expectNoOverlap(help, page.getByRole("complementary"), "help and object inspector");
  });

  test("@cross-browser ranks an exact Titan match first and selects it with Enter", async ({ page }) => {
    await openApp(page);
    await selectTitanFromSearch(page);
    await expect(page.getByRole("complementary")).toContainText("Titan");
    await expect(page.getByRole("combobox", { name: "Camera preset" })).toContainText("Focused body");
  });

  test("makes physical transfer arrival intent explicit", async ({ page }) => {
    await hideDiscoveryHint(page);
    const missionView = new URLSearchParams({
      view: "1",
      body: "earth",
      camera: "overview",
      scale: "readable",
      date: String(Date.parse("2026-06-14T12:00:00.000Z")),
      paused: "1",
      dir: "1",
      speed: "3600",
      labels: "standard",
      grid: "0",
      orbits: "1",
      trails: "1",
    });
    await page.goto(appUrl(missionView));
    await expect(page.locator("#main-controls")).toBeVisible();
    await page.getByRole("button", { name: "Rocket preview" }).click();
    const rocket = page.getByRole("region", { name: "Rocket preview" });

    await rocket.getByRole("combobox", { name: "Destination" }).click();
    await page.getByRole("option", { name: /^Neptune/ }).click();
    await rocket.getByRole("combobox", { name: "Mission mode" }).click();
    await page.getByRole("option", { name: /^Hohmann coast/ }).click();

    const arrival = rocket.getByRole("radiogroup", { name: "Arrival outcome" });
    await expect(arrival).toBeVisible();
    await expect(arrival.getByRole("radio", { name: "Capture" })).toBeDisabled();
    await expect(rocket.getByText(/Capture unavailable: this trajectory misses Neptune/i)).toBeVisible();

    await rocket.getByRole("combobox", { name: "Mission mode" }).click();
    await page.getByRole("option", { name: /^Lambert intercept/ }).click();
    await expect(arrival.getByRole("radio", { name: "Capture" })).toBeEnabled();
    await arrival.getByRole("radio", { name: "Capture" }).click();
    await expect(arrival.getByRole("radio", { name: "Capture" })).toHaveAttribute("aria-checked", "true");
    await expect(rocket.getByText(/applies the displayed idealized arrival burn/i)).toBeVisible();

    await rocket.getByRole("combobox", { name: "Destination" }).click();
    await page.getByRole("option", { name: /^Moon/ }).click();
    await rocket.getByRole("combobox", { name: "Mission mode" }).click();
    await expect(page.getByRole("option", { name: /^Hohmann coast/ })).toBeVisible();
    await expect(page.getByRole("option", { name: /^Lambert intercept/ })).toHaveCount(0);
  });

  test("surfaces model trust, observer view, photo mode, and deep-linked view state", async ({ page }) => {
    await hideDiscoveryHint(page);
    const params = new URLSearchParams({
      view: "1",
      body: "saturn",
      camera: "observer",
      scale: "readable",
      date: String(Date.parse("2026-07-10T00:00:00.000Z")),
      paused: "1",
      dir: "1",
      speed: "3600",
      labels: "minimal",
      grid: "0",
      orbits: "1",
      trails: "0",
    });
    await page.goto(appUrl(params));
    await expect(page.locator("#main-controls")).toBeVisible();
    await expect(page.locator(".focus-title strong")).toHaveText("Saturn");
    await expect(page.getByRole("combobox", { name: "Camera preset" })).toContainText("Terminator observer");
    await expect(page.getByRole("radio", { name: "Readable" })).toHaveAttribute("aria-checked", "true");

    const trust = page.getByRole("region", { name: "Scientific model fidelity" });
    await expect(trust).toContainText("Validated approximation");
    await expect(page.getByText(/Terminator observer: the camera follows just above/)).toBeVisible();

    await page.getByRole("button", { name: "Enter photo mode" }).click();
    await expect(page.locator(".app-shell")).toHaveClass(/photo-mode/);
    await expect(page.getByRole("button", { name: "Show controls" })).toBeVisible();
    await page.getByRole("button", { name: "Show controls" }).click();
    await expect(page.locator(".app-shell")).not.toHaveClass(/photo-mode/);

    const freeView = new URLSearchParams({
      view: "1",
      body: "earth",
      camera: "free",
      scale: "compressed",
      date: String(Date.parse("2026-07-10T00:00:00.000Z")),
      paused: "1",
      dir: "1",
      speed: "3600",
      labels: "standard",
      grid: "1",
      orbits: "1",
      trails: "1",
      cp: "24,18,36",
      ct: "1,2,3",
      cu: "0,1,0",
    });
    await page.goto(appUrl(freeView));
    await expect(page.locator("canvas.solar-canvas")).toHaveAttribute(
      "data-camera-pose",
      JSON.stringify({ position: [24, 18, 36], target: [1, 2, 3], up: [0, 1, 0] }),
    );
    await expect(page.getByRole("combobox", { name: "Camera preset" })).toContainText("Free look");

    const hostileView = new URLSearchParams({
      view: "1",
      body: "earth",
      camera: "free",
      scale: "readable",
      date: String(Date.parse("2026-07-10T00:00:00.000Z")),
      paused: "1",
      dir: "1",
      speed: "3600",
      labels: "standard",
      grid: "0",
      orbits: "1",
      trails: "0",
      cp: "10000,10000,10000",
      ct: "9999,9999,9999",
      cu: "0,1,0",
    });
    await page.goto(appUrl(hostileView));
    const recoveredCanvas = page.locator("canvas.solar-canvas");
    await expect(recoveredCanvas).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Camera preset" })).toContainText("Solar system");
    await expect(recoveredCanvas).not.toHaveAttribute(
      "data-camera-pose",
      JSON.stringify({ position: [10000, 10000, 10000], target: [9999, 9999, 9999], up: [0, 1, 0] }),
    );
  });

  test("directs and restores authored scale and eclipse experiences", async ({ page }) => {
    await hideDiscoveryHint(page);
    const startingView = new URLSearchParams({
      view: "1",
      body: "titan",
      camera: "free",
      scale: "compressed",
      date: String(Date.parse("2026-07-10T00:00:00.000Z")),
      paused: "1",
      dir: "1",
      speed: "3600",
      labels: "standard",
      grid: "1",
      orbits: "1",
      trails: "1",
      cp: "42,24,48",
      ct: "8,0,4",
      cu: "0,1,0",
    });
    await page.goto(appUrl(startingView));
    await expect(page.locator("#main-controls")).toBeVisible();
    const canvas = page.locator("canvas.solar-canvas");
    const composedPose = JSON.stringify({ position: [42, 24, 48], target: [8, 0, 4], up: [0, 1, 0] });
    await expect(canvas).toHaveAttribute("data-camera-pose", composedPose);
    await expect(page.locator(".focus-title strong")).toHaveText("Titan");
    await expect(page.getByRole("combobox", { name: "Camera preset" })).toContainText("Free look");

    await page.getByRole("button", { name: "Guided experiences" }).click();
    const experience = page.getByRole("region", { name: "Guided experiences" });
    await expect(experience).toBeVisible();
    await expect(page.locator(".scale-controls")).toBeVisible();
    await expect(page.locator(".object-inspector")).toBeVisible();
    await experience.getByRole("button", { name: /Scale Revelation/ }).click();
    const scaleWatch = page.getByRole("region", { name: "Scale Revelation watch" });
    await expect(scaleWatch.getByText("Space is mostly absence")).toBeVisible();
    await expect(page.locator("#main-controls")).toHaveClass(/guided-experience-active/);
    await expect(page.locator(".scale-controls")).toHaveCount(0);
    await expect(page.locator(".object-inspector")).toHaveCount(0);
    await expect(page.locator(".doomsday-dock")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Rocket preview" })).toHaveCount(0);
    await scaleWatch.getByRole("button", { name: "Open guided details" }).click();
    await expect(experience.getByText("Space is mostly absence")).toBeVisible();
    await expect(experience.getByRole("button", { name: "Collapse guided details" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Director active/ })).toHaveCount(0);
    await expectInLeftRail(page, experience, "Scale Revelation details");
    await expectNoOverlap(experience, page.locator(".top-bar"), "guided details and top bar");
    await expectNoOverlap(
      experience,
      page.getByRole("region", { name: "Time controls" }),
      "guided details and time controls",
    );
    await expect(experience.getByText("Lens 1 of 4 · Real")).toBeVisible();

    await experience.getByRole("button", { name: "Next stop" }).click();
    await expect(experience.getByText("Keep the map, reveal the worlds")).toBeVisible();
    await expect(page.locator(".focus-title strong")).toHaveText("Earth");
    await expect(experience.getByText("Size enlarged")).toBeVisible();
    await expectNoOverlap(
      experience,
      page.locator('[data-body-id="earth"]'),
      "guided details and the Earth scene label",
    );

    await page.keyboard.press("Escape");
    await expect(page.locator("#main-controls")).not.toHaveClass(/guided-experience-active/);
    await expect(page.locator(".scale-controls")).toBeVisible();
    await expect(page.locator(".object-inspector")).toBeVisible();
    await expect(page.locator(".doomsday-dock")).toBeVisible();
    await expect(page.getByRole("button", { name: "Rocket preview" })).toBeVisible();
    await expect(page.locator(".focus-title strong")).toHaveText("Titan");
    await expect(page.getByRole("combobox", { name: "Camera preset" })).toContainText("Free look");
    await expect(canvas).toHaveAttribute("data-camera-pose", composedPose!);
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();

    await experience.getByRole("button", { name: /Eclipse Chase/ }).click();
    const eclipseWatch = page.getByRole("region", { name: "Eclipse Chase watch" });
    await expect(eclipseWatch.getByText("The shadow line finds Earth")).toBeVisible();
    await eclipseWatch.getByRole("button", { name: "Open guided details" }).click();
    await expect(experience.getByText("The shadow line finds Earth")).toBeVisible();
    await expect(experience.getByText("Maximum alignment", { exact: true })).toBeVisible();
    await expect(experience.getByText(/Mean elements/)).toBeVisible();
    await expect(page.locator(".focus-title strong")).toHaveText("Earth");
    await expectInLeftRail(page, experience, "Eclipse Chase details");

    await experience.getByRole("button", { name: "Hold maximum" }).click();
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    await experience.getByRole("button", { name: "Exit & restore" }).click();
    await expect(page.locator(".focus-title strong")).toHaveText("Titan");
    await expect(page.getByRole("combobox", { name: "Camera preset" })).toContainText("Free look");
    await expect(canvas).toHaveAttribute("data-camera-pose", composedPose!);
  });

  test("@cross-browser collapses a scenario into a reversible watch mode", async ({ page }) => {
    await openApp(page);
    await selectTitanFromSearch(page);
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Open what-if scenarios" }).click();
    await page.getByRole("button", { name: "Sun becomes a red giant" }).click();

    const watch = page.getByRole("region", { name: "Sun becomes a red giant watch controls" });
    await expect(watch).toBeVisible();
    await expect(watch.getByText("N-body planets")).toBeVisible();
    await expect(page.getByRole("region", { name: "What-if scenarios" })).toHaveCount(0);
    const scenarioTransport = page.getByRole("region", { name: "Time controls" });
    await expect(scenarioTransport).toContainText("Sun becomes a red giant");
    await expectNoOverlap(watch, scenarioTransport, "scenario watch HUD and scenario transport");
    await expect(page.getByRole("button", { name: "Step backward" })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Camera preset" })).toContainText("Inner planets");

    await watch.getByRole("button", { name: "Exit scenario" }).click();
    await expect(page.locator(".focus-title strong")).toHaveText("Titan");
    await expect(page.getByRole("combobox", { name: "Camera preset" })).toContainText("Focused body");
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  });

  test("offers recovery when every orientation aid is hidden", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "solar-system-sim.view",
        JSON.stringify({
          mode: "readable",
          labelDensity: "off",
          showGrid: false,
          showOrbits: false,
          showTrails: false,
        }),
      );
    });
    await openApp(page);

    const recovery = page.getByRole("complementary", { name: "View recovery" });
    await expect(recovery).toBeVisible();
    await recovery.getByRole("button", { name: "Restore view" }).click();
    await expect(recovery).toHaveCount(0);
    await expect(page.locator(".focus-title strong")).toHaveText("Earth");
    await expect(page.getByRole("combobox", { name: "Camera preset" })).toContainText("Solar system");
    await page.locator("details.view-layer-disclosure > summary").click();
    await expect(page.getByRole("checkbox", { name: "Orbits" })).toBeChecked();
  });

  test("allows only one modal popover at a time", async ({ page }) => {
    await openApp(page);

    await page.getByRole("button", { name: "Help and shortcuts" }).click();
    await expect(page.getByRole("dialog", { name: "Help and shortcuts" })).toBeVisible();

    await page.keyboard.press("/");
    await expect(page.getByRole("dialog", { name: "Search and commands" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Help and shortcuts" })).toHaveCount(0);
  });

  test("blocks background pointer input while the search dialog is modal", async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: "Search objects" }).click();
    const dialog = page.getByRole("dialog", { name: "Search and commands" });
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();

    await page.locator(".command-modal-backdrop").click({ position: { x: 8, y: 300 } });
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  });
});

test.describe("mobile", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("@cross-browser renders the mobile transport and canvas", async ({ page }) => {
    await openApp(page);
    await expect(page.locator("#main-controls")).toHaveAttribute("data-mobile", "true");
    await expect(page.getByRole("region", { name: "Time controls" })).toBeVisible();
    await expect(page.getByRole("button", { name: "View settings" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Show Earth details" })).toHaveCount(0);

    await page.getByRole("button", { name: "View settings" }).click();
    const viewSheet = page.getByRole("dialog", { name: "View settings" });
    await expect(viewSheet.getByRole("button", { name: "Enter photo mode" })).toBeVisible();
    await expect(viewSheet.getByRole("button", { name: "Copy shareable view link" })).toBeVisible();
  });

  test("keeps first-run actions usable on a narrow phone", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(appUrl());
    await expect(page.locator("#main-controls")).toBeVisible();

    const gettingStarted = page.getByRole("complementary", { name: "Start exploring" });
    await expect(gettingStarted).toBeVisible();
    await expectNoOverlap(
      gettingStarted,
      page.getByRole("region", { name: "Time controls" }),
      "first-run actions and narrow-phone transport",
    );
    for (const name of ["Find a world", "Take a tour", "Plan a mission"]) {
      const action = gettingStarted.getByRole("button", { name });
      await expect(action).toBeVisible();
      const box = await action.boundingBox();
      expect(box?.height, `${name} should retain a 44px touch target`).toBeGreaterThanOrEqual(44);
    }

    const scenarios = page.getByRole("button", { name: "Open what-if scenarios" });
    await expect(scenarios).toBeHidden();
    await gettingStarted.getByRole("button", { name: "Dismiss getting started" }).click();
    await expect(scenarios).toBeVisible();
  });

  test("collapses object details to the peek and can reopen them", async ({ page }) => {
    await openApp(page);
    await selectTitanFromSearch(page);

    const showDetails = page.getByRole("button", { name: "Show Titan details" });
    await expect(showDetails).toBeVisible();
    await showDetails.click();
    await expect(page.getByRole("dialog", { name: "Titan details" })).toBeVisible();

    await page.getByRole("button", { name: "Close Titan details" }).click();
    await expect(showDetails).toBeVisible();
    await showDetails.click();
    await expect(page.getByRole("dialog", { name: "Titan details" })).toBeVisible();
  });

  test("turns a launch sheet into a compact mission watch HUD", async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: "Rocket preview" }).click();
    const rocketSheet = page.getByRole("dialog", { name: "Rocket preview" });
    await expect(rocketSheet).toBeVisible();
    await rocketSheet.locator(".rocket-launch-button").click();

    await expect(rocketSheet).toHaveCount(0);
    const watch = page.locator(".rocket-watch-hud");
    await expect(watch).toBeVisible();
    await expectNoOverlap(watch, page.getByRole("region", { name: "Time controls" }), "rocket watch HUD and transport");
    await expect(watch.getByRole("button", { name: "Follow" })).toHaveAttribute("aria-pressed", "true");
    await watch.getByRole("button", { name: "Exit rocket preview" }).click();
    await expect(watch).toHaveCount(0);
  });

  test("keeps guided experiences clear of the mobile transport", async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: "Guided experiences" }).click();
    const experience = page.getByRole("region", { name: "Guided experiences" });
    const transport = page.getByRole("region", { name: "Time controls" });
    await expect(experience).toBeVisible();
    await expectNoOverlap(experience, transport, "experience menu and mobile transport");

    await experience.getByRole("button", { name: /Three Worlds/ }).click();
    const tourWatch = page.getByRole("region", { name: "Three Worlds watch" });
    await expect(tourWatch.getByText("Earth and its companion")).toBeVisible();
    await expect(page.getByRole("button", { name: "View settings" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Rocket preview" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open what-if scenarios" })).toHaveCount(0);
    await expect(page.locator(".inspector-peek")).toHaveCount(0);
    await expectNoOverlap(tourWatch, transport, "tour watch HUD and mobile transport");
    await tourWatch.getByRole("button", { name: "Open guided details" }).click();
    await expect(experience.getByText("Earth and its companion")).toBeVisible();
    await expectNoOverlap(experience, transport, "active tour and mobile transport");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "View settings" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rocket preview" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open what-if scenarios" })).toBeVisible();
    await expect(page.locator(".inspector-peek")).toHaveCount(0);
  });
});
