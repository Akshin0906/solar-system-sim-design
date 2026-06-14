// Platform-aware label for the search command key, shared by the top-bar tooltip
// and the help popover so they never disagree across operating systems.
const isMac = typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform);

export const commandKey = isMac ? "⌘K" : "Ctrl K";
