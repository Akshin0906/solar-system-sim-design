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
});
