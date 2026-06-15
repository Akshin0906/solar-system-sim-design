export const readBooleanPreference = (key: string) => {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
};

export const writeBooleanPreference = (key: string, value: boolean) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, value ? "true" : "false");
  } catch {
    // Preference persistence is best-effort; blocked storage should not break the app.
  }
};
