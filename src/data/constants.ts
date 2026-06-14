export const AU_KM = 149_597_870.7;
export const EARTH_RADIUS_KM = 6_371;
export const J2000_EPOCH = "2000-01-01T12:00:00.000Z";
export const DAY_MS = 86_400_000;
export const DAY_SECONDS = 86_400;

export const TIME_PRESETS = [
  { id: "real-time", label: "Real-time", secondsPerSecond: 1 },
  { id: "hour", label: "1 hour/sec", secondsPerSecond: 3_600 },
  { id: "day", label: "1 day/sec", secondsPerSecond: DAY_SECONDS },
  { id: "week", label: "1 week/sec", secondsPerSecond: DAY_SECONDS * 7 },
  { id: "month", label: "1 month/sec", secondsPerSecond: DAY_SECONDS * 30.437 },
  { id: "year", label: "1 year/sec", secondsPerSecond: DAY_SECONDS * 365.256 },
  { id: "decade", label: "10 years/sec", secondsPerSecond: DAY_SECONDS * 3_652.56 },
] as const;

export type TimePresetId = (typeof TIME_PRESETS)[number]["id"];
