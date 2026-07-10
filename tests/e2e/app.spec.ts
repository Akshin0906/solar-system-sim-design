import { expect, test, type Locator, type Page } from "@playwright/test";

const hideDiscoveryHint = async (page: Page) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("solar-system-sim.discoveryHintDismissed", "true");
  });
};

const openApp = async (page: Page) => {
  await hideDiscoveryHint(page);
  await page.goto("/");
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

  test("renders the simulator controls and canvas", async ({ page }) => {
    await openApp(page);
    await expect(page.locator(".top-bar")).toBeVisible();
    await expect(page.getByRole("complementary")).toContainText("Earth");
    await expect(page.getByRole("region", { name: "Time controls" })).toBeVisible();

    const timeline = page.getByRole("slider", { name: "Timeline" });
    await timeline.evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = input.max;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(page.getByText("Orbit positions extrapolated beyond the validated 1800–2050 model")).toBeVisible();
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
    await expectNoOverlap(rocket, page.locator(".doomsday-dock"), "rocket and Doomsday launcher");

    await page.getByRole("button", { name: "Close rocket panel" }).click();
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.getByRole("button", { name: "Open Doomsday scenarios" }).click();
    await expectNoOverlap(
      page.getByRole("region", { name: "Doomsday scenarios" }),
      page.locator(".scale-controls"),
      "Doomsday and view controls on a short laptop",
    );

    await page.getByRole("button", { name: "Help and shortcuts" }).click();
    const help = page.getByRole("dialog", { name: "Help and shortcuts" });
    await expect(help).toBeVisible();
    await expectNoOverlap(help, page.getByRole("complementary"), "help and object inspector");
  });

  test("ranks an exact Titan match first and selects it with Enter", async ({ page }) => {
    await openApp(page);
    await selectTitanFromSearch(page);
    await expect(page.getByRole("complementary")).toContainText("Titan");
    await expect(page.getByRole("combobox", { name: "Camera preset" })).toContainText("Focused body");
  });

  test("makes physical transfer arrival intent explicit", async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: "Rocket preview" }).click();
    const rocket = page.getByRole("region", { name: "Rocket preview" });

    await rocket.getByRole("combobox", { name: "Destination" }).click();
    await page.getByRole("option", { name: /^Mars/ }).click();
    await rocket.getByRole("combobox", { name: "Mission mode" }).click();
    await page.getByRole("option", { name: /^Hohmann coast/ }).click();

    const arrival = rocket.getByRole("radiogroup", { name: "Arrival outcome" });
    await expect(arrival).toBeVisible();
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
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
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
    await page.goto(`/?${params.toString()}`);
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
    await page.goto(`/?${freeView.toString()}`);
    await expect(page.locator("canvas.solar-canvas")).toHaveAttribute(
      "data-camera-pose",
      JSON.stringify({ position: [24, 18, 36], target: [1, 2, 3], up: [0, 1, 0] }),
    );
    await expect(page.getByRole("combobox", { name: "Camera preset" })).toContainText("Free look");
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
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
    await page.goto(`/?${startingView.toString()}`);
    await expect(page.locator("#main-controls")).toBeVisible();
    const canvas = page.locator("canvas.solar-canvas");
    const composedPose = JSON.stringify({ position: [42, 24, 48], target: [8, 0, 4], up: [0, 1, 0] });
    await expect(canvas).toHaveAttribute("data-camera-pose", composedPose);
    await expect(page.locator(".focus-title strong")).toHaveText("Titan");
    await expect(page.getByRole("combobox", { name: "Camera preset" })).toContainText("Free look");

    await page.getByRole("button", { name: "Guided experiences" }).click();
    const experience = page.getByRole("region", { name: "Guided experiences" });
    await expect(experience).toBeVisible();
    await experience.getByRole("button", { name: /Scale Revelation/ }).click();
    const scaleWatch = page.getByRole("region", { name: "Scale Revelation watch" });
    await expect(scaleWatch.getByText("Space is mostly absence")).toBeVisible();
    await scaleWatch.getByRole("button", { name: "Open guided details" }).click();
    await expect(experience.getByText("Space is mostly absence")).toBeVisible();
    await expect(page.getByRole("radio", { name: "Real" })).toHaveAttribute("aria-checked", "true");

    await experience.getByRole("button", { name: "Next stop" }).click();
    await expect(experience.getByText("Keep the map, reveal the worlds")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Camera preset" })).toContainText("Earth/Moon");
    await expect(experience.getByText("Size enlarged")).toBeVisible();

    await page.keyboard.press("Escape");
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
    await expect(page.getByRole("combobox", { name: "Camera preset" })).toContainText("Earth/Moon");

    await experience.getByRole("button", { name: "Hold maximum" }).click();
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    await experience.getByRole("button", { name: "Exit & restore" }).click();
    await expect(page.locator(".focus-title strong")).toHaveText("Titan");
    await expect(page.getByRole("combobox", { name: "Camera preset" })).toContainText("Free look");
    await expect(canvas).toHaveAttribute("data-camera-pose", composedPose!);
  });

  test("collapses a scenario into a reversible watch mode", async ({ page }) => {
    await openApp(page);
    await selectTitanFromSearch(page);
    await page.getByRole("button", { name: "Pause" }).click();

    await page.getByRole("button", { name: "Open Doomsday scenarios" }).click();
    await page.getByRole("button", { name: "Sun becomes a red giant" }).click();

    const watch = page.getByRole("region", { name: "Sun becomes a red giant watch controls" });
    await expect(watch).toBeVisible();
    await expect(watch.getByText("N-body planets")).toBeVisible();
    await expect(page.getByRole("region", { name: "Doomsday scenarios" })).toHaveCount(0);
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
});

test.describe("mobile", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("renders the mobile transport and canvas", async ({ page }) => {
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
    await expectNoOverlap(tourWatch, transport, "tour watch HUD and mobile transport");
    await tourWatch.getByRole("button", { name: "Open guided details" }).click();
    await expect(experience.getByText("Earth and its companion")).toBeVisible();
    await expectNoOverlap(experience, transport, "active tour and mobile transport");
  });
});
