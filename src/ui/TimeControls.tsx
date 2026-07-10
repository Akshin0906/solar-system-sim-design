import { AlertTriangle, CalendarClock, Gauge, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward } from "lucide-react";
import type { CSSProperties } from "react";
import { DAY_MS, TIME_PRESETS, type TimePresetId } from "../data/constants";
import { useScenarioStore } from "../scenarios/scenarioStore";
import {
  MAX_TIME_SCALE,
  MIN_TIME_SCALE,
  SIMULATION_WINDOW_DAYS,
  getDateMsFromEpochDays,
  getDaysFromEpoch,
  isOrbitModelExtrapolated,
  useTimeStore,
} from "../simulation/timeStore";
import { formatNowDelta, formatTimeScale } from "../simulation/units";
import { BottomSheet } from "./BottomSheet";
import { InstrumentSelect } from "./InstrumentSelect";
import { useUiStore } from "./uiStore";
import { useIsMobile } from "./useMediaQuery";

const scrubDateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "2-digit",
});

const minScrubDays = -SIMULATION_WINDOW_DAYS;
const maxScrubDays = SIMULATION_WINDOW_DAYS;
const minSpeed = MIN_TIME_SCALE;
const maxSpeed = MAX_TIME_SCALE;

const speedToSlider = (speed: number) => {
  const min = Math.log10(minSpeed);
  const max = Math.log10(maxSpeed);
  const boundedSpeed = Math.min(Math.max(speed, minSpeed), maxSpeed);
  return ((Math.log10(boundedSpeed) - min) / (max - min)) * 100;
};

const sliderToSpeed = (slider: number) => {
  const min = Math.log10(minSpeed);
  const max = Math.log10(maxSpeed);
  return 10 ** (min + (slider / 100) * (max - min));
};

const rangeProgressStyle = (progress: number) =>
  ({
    "--range-progress": `${Math.min(Math.max(progress, 0), 100)}%`,
  }) as CSSProperties;

// These three leaves each subscribe to the simulation clock so they re-render ~30x/s
// (the scrubber thumb and live date must), while the parent TimeControls panel — its
// transport buttons, preset dropdown, and speed slider — no longer reconciles per tick.
const TimelineScrubber = () => {
  const simulationDateMs = useTimeStore((state) => state.simulationDateMs);
  const setSimulationDateMs = useTimeStore((state) => state.setSimulationDateMs);
  const scrubDays = Math.max(minScrubDays, Math.min(maxScrubDays, getDaysFromEpoch(simulationDateMs)));
  const nowDeltaLabel = formatNowDelta((simulationDateMs - Date.now()) / DAY_MS);
  const timelineProgress = ((scrubDays - minScrubDays) / (maxScrubDays - minScrubDays)) * 100;

  return (
    <label className="range-shell scrub-range" style={rangeProgressStyle(timelineProgress)}>
      <CalendarClock size={14} aria-hidden />
      <input
        type="range"
        min={minScrubDays}
        max={maxScrubDays}
        step={1}
        // Quantize to the integer step so the thumb sits exactly on a valid stop. The
        // underlying date (and aria-valuetext) stay full-precision; only the thumb position
        // is rounded, which avoids the visible jump when first dragging from a "now" offset.
        value={Math.round(scrubDays)}
        onChange={(event) => setSimulationDateMs(getDateMsFromEpochDays(Number(event.target.value)))}
        aria-label="Timeline"
        aria-valuetext={scrubDateFormatter.format(new Date(simulationDateMs))}
      />
      <span className="range-value" aria-hidden="true">{nowDeltaLabel}</span>
    </label>
  );
};

const SheetDate = () => {
  const simulationDateMs = useTimeStore((state) => state.simulationDateMs);
  const extrapolated = isOrbitModelExtrapolated(simulationDateMs);

  return (
    <div className="sheet-date-status">
      <span className="sheet-date-line">{scrubDateFormatter.format(new Date(simulationDateMs))}</span>
      {extrapolated && (
        <span className="orbit-model-warning" role="status">
          <AlertTriangle size={13} aria-hidden /> Extrapolated outside the validated 1800–2050 orbit model
        </span>
      )}
    </div>
  );
};

const OrbitModelWarning = () => {
  const simulationDateMs = useTimeStore((state) => state.simulationDateMs);
  if (!isOrbitModelExtrapolated(simulationDateMs)) {
    return null;
  }

  return (
    <span className="orbit-model-warning desktop-orbit-warning" role="status">
      <AlertTriangle size={13} aria-hidden /> Orbit positions extrapolated beyond the validated 1800–2050 model
    </span>
  );
};

// Mobile transport chip: surfaces the absolute sim date (otherwise unreachable on a
// phone without opening the sheet) plus the speed and now-delta.
const SpeedChip = ({ active, speedLabel, onOpen }: { active: boolean; speedLabel: string; onOpen: () => void }) => {
  const simulationDateMs = useTimeStore((state) => state.simulationDateMs);
  const absoluteDateLabel = scrubDateFormatter.format(new Date(simulationDateMs));
  const nowDeltaLabel = formatNowDelta((simulationDateMs - Date.now()) / DAY_MS);
  const extrapolated = isOrbitModelExtrapolated(simulationDateMs);

  return (
    <button
      className={`speed-chip ${active ? "active" : ""} ${extrapolated ? "extrapolated" : ""}`.trim()}
      type="button"
      onClick={onOpen}
      aria-label={`Time and speed: ${absoluteDateLabel}, ${speedLabel}, ${nowDeltaLabel} from now${
        extrapolated ? ", orbit positions extrapolated beyond the validated 1800 to 2050 model" : ""
      }`}
      aria-haspopup="dialog"
    >
      {extrapolated ? <AlertTriangle size={15} aria-hidden /> : <Gauge size={15} aria-hidden />}
      <span className="speed-chip-value">{absoluteDateLabel}</span>
      <span className="speed-chip-delta">
        {extrapolated ? `Extrapolated model · ${speedLabel}` : `${speedLabel} · ${nowDeltaLabel}`}
      </span>
    </button>
  );
};

export const TimeControls = () => {
  const isPaused = useTimeStore((state) => state.isPaused);
  const direction = useTimeStore((state) => state.direction);
  const preset = useTimeStore((state) => state.preset);
  const timeScale = useTimeStore((state) => state.timeScale);
  const togglePaused = useTimeStore((state) => state.togglePaused);
  const stepDays = useTimeStore((state) => state.stepDays);
  const setDirection = useTimeStore((state) => state.setDirection);
  const setPreset = useTimeStore((state) => state.setPreset);
  const setTimeScale = useTimeStore((state) => state.setTimeScale);
  const jumpToNow = useTimeStore((state) => state.jumpToNow);
  const isMobile = useIsMobile();
  const activeSheet = useUiStore((state) => state.activeSheet);
  const openSheet = useUiStore((state) => state.openSheet);
  const closeSheet = useUiStore((state) => state.closeSheet);
  // A running scenario freezes and locks the J2000 clock (it has its own transport in the
  // Doomsday panel), so disable this bar while one owns the view rather than leaving dead
  // controls that silently no-op against the locked clock.
  const scenarioActive = useScenarioStore((state) => state.activeScenarioId !== null);
  const speedLabel = formatTimeScale(timeScale);

  const presetOptions = [
    ...(preset === "custom"
      ? [
          {
            value: "custom",
            label: "Custom",
            description: "Set by the slider",
            disabled: true,
          },
        ]
      : []),
    ...TIME_PRESETS.map((item) => ({
      value: item.id,
      label: item.label,
      description: item.id === "real-time" ? "Clock speed" : "Simulation speed",
    })),
  ];
  const speedProgress = speedToSlider(timeScale);

  const presetSelect = (
    <InstrumentSelect
      className="time-preset-select"
      value={preset}
      onChange={(value) => {
        if (value !== "custom") {
          setPreset(value as TimePresetId);
        }
      }}
      ariaLabel="Speed preset"
      side="auto"
      options={presetOptions}
    />
  );

  const speedSlider = (
    <label className="range-shell speed-range" style={rangeProgressStyle(speedProgress)}>
      <Gauge size={14} aria-hidden />
      <input
        type="range"
        min={0}
        max={100}
        step={0.2}
        value={speedToSlider(timeScale)}
        onChange={(event) => setTimeScale(sliderToSpeed(Number(event.target.value)))}
        aria-label="Speed"
        aria-valuetext={speedLabel}
      />
      <span className="range-value" aria-hidden="true">{speedLabel}</span>
    </label>
  );

  if (isMobile) {
    return (
      <>
        <section className="transport-bar" aria-label="Time controls" inert={scenarioActive || undefined}>
          <button className="icon-button transport" type="button" onClick={() => stepDays(-1)} aria-label="Step backward">
            <SkipBack size={18} />
          </button>
          <button
            className="icon-button transport primary"
            type="button"
            onClick={togglePaused}
            aria-label={isPaused ? "Play" : "Pause"}
          >
            {isPaused ? <Play size={20} /> : <Pause size={20} />}
          </button>
          <button className="icon-button transport" type="button" onClick={() => stepDays(1)} aria-label="Step forward">
            <SkipForward size={18} />
          </button>
          <SpeedChip active={activeSheet === "speed"} speedLabel={speedLabel} onOpen={() => openSheet("speed")} />
        </section>
        <BottomSheet
          open={activeSheet === "speed"}
          onClose={closeSheet}
          label="Speed and time"
          title="Speed & time"
          footer={
            <button className="reset-time sheet-now" type="button" onClick={jumpToNow}>
              Jump to now
            </button>
          }
        >
          <div className="speed-sheet">
            <div className="sheet-field">
              <SheetDate />
              <span className="sheet-field-label">Time direction</span>
              <div className="segmented-control direction-control">
                <button
                  type="button"
                  className={direction === 1 ? "selected" : ""}
                  onClick={() => setDirection(1)}
                  aria-pressed={direction === 1}
                >
                  <RotateCw size={15} aria-hidden /> Forward
                </button>
                <button
                  type="button"
                  className={direction === -1 ? "selected" : ""}
                  onClick={() => setDirection(-1)}
                  aria-pressed={direction === -1}
                >
                  <RotateCcw size={15} aria-hidden /> Reverse
                </button>
              </div>
            </div>
            <div className="sheet-field">
              <span className="sheet-field-label">Speed preset</span>
              <div className="sheet-select">{presetSelect}</div>
            </div>
            <div className="sheet-field">
              <span className="sheet-field-label">Speed</span>
              {speedSlider}
            </div>
            <div className="sheet-field">
              <span className="sheet-field-label">Timeline</span>
              <TimelineScrubber />
            </div>
          </div>
        </BottomSheet>
      </>
    );
  }

  return (
    <section className="time-controls" aria-label="Time controls" inert={scenarioActive || undefined}>
      <button className="icon-button transport" type="button" onClick={() => stepDays(-1)} title="Step backward" aria-label="Step backward">
        <SkipBack size={17} />
      </button>
      <button className="icon-button transport primary" type="button" onClick={togglePaused} title={isPaused ? "Play" : "Pause"} aria-label={isPaused ? "Play" : "Pause"}>
        {isPaused ? <Play size={18} /> : <Pause size={18} />}
      </button>
      <button className="icon-button transport" type="button" onClick={() => stepDays(1)} title="Step forward" aria-label="Step forward">
        <SkipForward size={17} />
      </button>
      <button
        className={`icon-button transport ${direction === -1 ? "active" : ""}`}
        type="button"
        onClick={() => setDirection(direction === 1 ? -1 : 1)}
        title={direction === 1 ? "Forward time" : "Reverse time"}
        aria-label={direction === 1 ? "Forward time" : "Reverse time"}
        aria-pressed={direction === -1}
      >
        {direction === 1 ? <RotateCw size={16} /> : <RotateCcw size={16} />}
      </button>
      {presetSelect}
      {speedSlider}
      <TimelineScrubber />
      <button className="reset-time" type="button" onClick={jumpToNow}>
        Now
      </button>
      <OrbitModelWarning />
    </section>
  );
};
