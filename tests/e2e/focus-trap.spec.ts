import { expect, test, type Page } from "@playwright/test";

const appPath = process.env.PLAYWRIGHT_APP_PATH ?? "/";
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
  await page.addInitScript(() => {
    window.localStorage.setItem("solar-system-sim.discoveryHintDismissed", "true");
  });
});

test.afterEach(async ({ page }) => {
  expect(runtimeProblems.get(page) ?? [], "the app should not emit console or page errors").toEqual([]);
});

test.describe("modal focus management", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test(
    "@cross-browser excludes hidden descendants and completes forward and reverse tab cycles",
    async ({ page }) => {
      await page.goto(appPath);
      await expect(page.locator("#main-controls")).toBeVisible();

      const trigger = page.getByRole("button", { name: "View settings" });
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "View settings" });
      const closeButton = dialog.getByRole("button", { name: "Close View settings" });
      await expect(closeButton).toBeFocused();

      // Put every exclusion case at the end of the live modal. An aria-hidden child is
      // still in the browser's native tab order, and a closed details subtree is still
      // returned by querySelectorAll, so the trap itself has to filter both correctly.
      await dialog.evaluate((container) => {
        const body = container.querySelector<HTMLElement>(".sheet-body") ?? container;

        const ariaHidden = document.createElement("div");
        ariaHidden.setAttribute("aria-hidden", "true");
        ariaHidden.dataset.focusTrapExcluded = "true";
        const ariaHiddenButton = document.createElement("button");
        ariaHiddenButton.type = "button";
        ariaHiddenButton.textContent = "Aria-hidden action";
        ariaHidden.append(ariaHiddenButton);
        body.append(ariaHidden);

        const hidden = document.createElement("div");
        hidden.hidden = true;
        hidden.dataset.focusTrapExcluded = "true";
        const hiddenButton = document.createElement("button");
        hiddenButton.type = "button";
        hiddenButton.textContent = "Hidden action";
        hidden.append(hiddenButton);
        body.append(hidden);

        const inert = document.createElement("div");
        inert.setAttribute("inert", "");
        inert.dataset.focusTrapExcluded = "true";
        const inertButton = document.createElement("button");
        inertButton.type = "button";
        inertButton.textContent = "Inert action";
        inert.append(inertButton);
        body.append(inert);

        const collapsed = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = "Injected collapsed controls";
        summary.dataset.focusTestId = "injected-summary";
        const collapsedButton = document.createElement("button");
        collapsedButton.type = "button";
        collapsedButton.textContent = "Collapsed action";
        collapsedButton.dataset.focusTrapExcluded = "true";
        collapsed.append(summary, collapsedButton);
        body.append(collapsed);

        const candidates = container.querySelectorAll<HTMLElement>(
          "a[href], button, input, select, textarea, summary, [contenteditable], [tabindex]",
        );
        candidates.forEach((candidate, index) => {
          candidate.dataset.focusTestId ||= `focus-candidate-${index}`;
        });
        closeButtonFor(container)?.setAttribute("data-focus-cycle-start", "true");

        function closeButtonFor(root: Element) {
          return Array.from(root.querySelectorAll<HTMLElement>("button")).find(
            (button) => button.getAttribute("aria-label") === "Close View settings",
          );
        }
      });

      const readFocus = () =>
        dialog.evaluate((container) => {
          const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          return {
            id: active?.dataset.focusTestId ?? "no-focus-id",
            inside: Boolean(active && container.contains(active)),
            excluded: Boolean(active?.closest("[data-focus-trap-excluded='true']")),
            atStart: active?.dataset.focusCycleStart === "true",
          };
        });

      const completeCycle = async (key: "Tab" | "Shift+Tab") => {
        const visited: string[] = [];
        let remainingAttempts = 40;
        while (remainingAttempts > 0) {
          remainingAttempts -= 1;
          await page.keyboard.press(key);
          const focus = await readFocus();
          expect(focus.inside, `${key} focus must remain inside the modal`).toBe(true);
          expect(focus.excluded, `${key} must skip hidden, inert, and collapsed descendants`).toBe(false);
          if (focus.atStart) {
            return visited;
          }
          expect(visited, `${key} must not loop before returning to the first control`).not.toContain(focus.id);
          visited.push(focus.id);
        }
        throw new Error(`${key} did not complete a focus cycle`);
      };

      const forward = await completeCycle("Tab");
      expect(forward).toContain("injected-summary");
      const reverse = await completeCycle("Shift+Tab");
      expect(reverse[0], "reverse tabbing must wrap from the first control to the last").toBe(
        "injected-summary",
      );
      expect([...reverse].sort(), "forward and reverse cycles must cover the same controls").toEqual(
        [...forward].sort(),
      );

      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger, "closing the modal must restore focus to its invoking control").toBeFocused();
    },
  );
});
