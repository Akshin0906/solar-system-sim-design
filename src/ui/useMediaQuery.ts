import { useEffect, useState } from "react";

// SSR-safe media-query subscription. Reads the initial match synchronously when a
// window exists, then keeps in sync via a change listener.
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    // Sync immediately in case the query changed between render and effect.
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
};

// The compact/touch breakpoint, kept in lockstep with the matching media rules
// in App.css so JS and CSS agree on when panels become bottom sheets.
export const MOBILE_QUERY = "(max-width: 900px), (pointer: coarse)";

export const useIsMobile = () => useMediaQuery(MOBILE_QUERY);

export const useReducedMotion = () => useMediaQuery("(prefers-reduced-motion: reduce)");
