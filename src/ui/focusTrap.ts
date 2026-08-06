import { useEffect, useRef, type RefObject } from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]",
].join(",");

const isHiddenFromFocus = (element: HTMLElement, container: HTMLElement) => {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    if (current.hidden || current.hasAttribute("inert") || current.getAttribute("aria-hidden") === "true") {
      return true;
    }

    // A closed <details> exposes only its first <summary>. Browsers remove the rest
    // from sequential focus navigation even though querySelectorAll still finds it.
    if (current instanceof HTMLDetailsElement && !current.open) {
      const summary = Array.from(current.children).find(
        (child) => child instanceof HTMLElement && child.tagName === "SUMMARY",
      );
      if (!(summary instanceof HTMLElement) || !summary.contains(element)) {
        return true;
      }
    }

    if (current === container) {
      break;
    }
  }

  const style = window.getComputedStyle(element);
  return (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.visibility === "collapse" ||
    element.getClientRects().length === 0
  );
};

const getFocusableElements = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => element.tabIndex >= 0 && !element.matches(":disabled") && !isHiddenFromFocus(element, container),
  );

type FocusReturnTarget = {
  element: HTMLElement;
  id: string | null;
  ariaLabel: string | null;
};

const describeFocusReturnTarget = (element: HTMLElement | null): FocusReturnTarget | null =>
  element
    ? {
        element,
        id: element.id || null,
        ariaLabel: element.getAttribute("aria-label"),
      }
    : null;

const resolveFocusReturnTarget = (target: FocusReturnTarget | null) => {
  if (!target) {
    return null;
  }
  if (target.element.isConnected) {
    return target.element;
  }
  if (target.id) {
    const replacement = document.getElementById(target.id);
    if (replacement instanceof HTMLElement) {
      return replacement;
    }
  }
  if (target.ariaLabel) {
    return (
      Array.from(document.querySelectorAll<HTMLElement>("[aria-label]")).find(
        (candidate) => candidate.getAttribute("aria-label") === target.ariaLabel,
      ) ?? null
    );
  }
  return null;
};

export const useFocusTrap = (
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void,
  restoreFocusRef?: RefObject<HTMLElement | null>,
) => {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  const lastPointerTargetRef = useRef<HTMLElement | null>(null);
  const pointerWasLastInputRef = useRef(false);

  // Safari does not necessarily focus a button when it is clicked. Remember the
  // pointer activator while the trap is closed so opening a modal can still restore
  // to the right control instead of whatever happened to be focused beforehand.
  useEffect(() => {
    if (active) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      pointerWasLastInputRef.current = true;
      lastPointerTargetRef.current =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(
              "a[href], button, input:not([type='hidden']), select, textarea, summary, [tabindex]",
            )
          : null;
    };
    const handleKeyDown = () => {
      pointerWasLastInputRef.current = false;
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [active]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const focusedTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const restoreTarget = describeFocusReturnTarget(
      restoreFocusRef?.current ??
        (pointerWasLastInputRef.current && lastPointerTargetRef.current
          ? lastPointerTargetRef.current
          : focusedTarget),
    );
    const focusFirst = () => {
      const focusables = getFocusableElements(container);
      (focusables[0] ?? container).focus();
    };

    const focusFrame = window.requestAnimationFrame(focusFirst);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onEscapeRef.current?.();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusables = getFocusableElements(container);
      if (focusables.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      // Drive every Tab move from the filtered list instead of only wrapping at the
      // edges. This also skips aria-hidden/inert descendants, which the browser may
      // otherwise leave in its native tab order, and recovers if focus was moved out.
      const activeIndex =
        document.activeElement instanceof HTMLElement ? focusables.indexOf(document.activeElement) : -1;
      const offset = event.shiftKey ? -1 : 1;
      const nextIndex =
        activeIndex < 0
          ? event.shiftKey
            ? focusables.length - 1
            : 0
          : (activeIndex + offset + focusables.length) % focusables.length;
      event.preventDefault();
      focusables[nextIndex].focus();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown, true);
      // Restore after the closing commit has removed its focused descendant. WebKit
      // can otherwise move focus back to <body> after a synchronous cleanup focus().
      window.requestAnimationFrame(() => {
        resolveFocusReturnTarget(restoreTarget)?.focus();
      });
    };
  }, [active, containerRef, restoreFocusRef]);
};
