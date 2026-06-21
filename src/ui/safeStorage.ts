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

export const readJsonPreference = <T>(key: string): T | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    // Missing/blocked storage or malformed JSON — fall back to defaults.
    return null;
  }
};

export const writeJsonPreference = (key: string, value: unknown) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Preference persistence is best-effort; blocked storage should not break the app.
  }
};
