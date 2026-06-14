import { CalendarClock, Gauge, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward } from "lucide-react";
import { DAY_MS, TIME_PRESETS, type TimePresetId } from "../data/constants";
import {
  MAX_TIME_SCALE,
  MIN_TIME_SCALE,
  SIMULATION_WINDOW_DAYS,
  getDateMsFromEpochDays,
  getDaysFromEpoch,
  useTimeStore,
} from "../simulation/timeStore";
import { formatNowDelta, formatTimeScale } from "../simulation/units";
import { BottomSheet } from "./BottomSheet";
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

export const TimeControls = () => {
  const isPaused = useTimeStore((state) => state.isPaused);
  const direction = useTimeStore((state) => state.direction);
  const preset = useTimeStore((state) => state.preset);
  const simulationDateMs = useTimeStore((state) => state.simulationDateMs);
  const timeScale = useTimeStore((state) => state.timeScale);
  const togglePaused = useTimeStore((state) => state.togglePaused);
  const stepDays = useTimeStore((state) => state.stepDays);
  const setDirection = useTimeStore((state) => state.setDirection);
  const setPreset = useTimeStore((state) => state.setPreset);
  const setTimeScale = useTimeStore((state) => state.setTimeScale);
  const setSimulationDateMs = useTimeStore((state) => state.setSimulationDateMs);
  const isMobile = useIsMobile();
  const activeSheet = useUiStore((state) => state.activeSheet);
  const openSheet = useUiStore((state) => state.openSheet);
  const closeSheet = useUiStore((state) => state.closeSheet);
  const scrubDays = Math.max(minScrubDays, Math.min(maxScrubDays, getDaysFromEpoch(simulationDateMs)));
  const speedLabel = formatTimeScale(timeScale);
  const nowDeltaLabel = formatNowDelta((simulationDateMs - Date.now()) / DAY_MS);

  const presetSelect = (
    <select
      value={preset}
      onChange={(event) => {
        if (event.target.value !== "custom") {
          setPreset(event.target.value as TimePresetId);
        }
      }}
      aria-label="Speed preset"
    >
      {preset === "custom" && <option value="custom">Custom</option>}
      {TIME_PRESETS.map((item) => (
        <option key={item.id} value={item.id}>
          {item.label}
        </option>
      ))}
    </select>
  );

  const speedSlider = (
    <label className="range-shell speed-range">
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

  const timelineSlider = (
    <label className="range-shell scrub-range">
      <CalendarClock size={14} aria-hidden />
      <input
        type="range"
        min={minScrubDays}
        max={maxScrubDays}
        step={1}
        value={scrubDays}
        onChange={(event) => setSimulationDateMs(getDateMsFromEpochDays(Number(event.target.value)))}
        aria-label="Timeline"
        aria-valuetext={scrubDateFormatter.format(new Date(simulationDateMs))}
      />
      <span className="range-value" aria-hidden="true">{nowDeltaLabel}</span>
    </label>
  );

  if (isMobile) {
    return (
      <>
        <section className="transport-bar" aria-label="Time controls">
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
          <button
            className={`speed-chip ${activeSheet === "speed" ? "active" : ""}`}
            type="button"
            onClick={() => openSheet("speed")}
            aria-label={`Speed and timeline, currently ${speedLabel}`}
            aria-haspopup="dialog"
          >
            <Gauge size={15} aria-hidden />
            <span className="speed-chip-value">{speedLabel}</span>
            <span className="speed-chip-delta">{nowDeltaLabel}</span>
          </button>
        </section>
        <BottomSheet
          open={activeSheet === "speed"}
          onClose={closeSheet}
          label="Speed and time"
          title="Speed & time"
          footer={
            <button className="reset-time sheet-now" type="button" onClick={() => setSimulationDateMs(Date.now())}>
              Jump to now
            </button>
          }
        >
          <div className="speed-sheet">
            <div className="sheet-field">
              <span className="sheet-field-label">Time direction</span>
              <div className="segmented-control direction-control">
                <button type="button" className={direction === 1 ? "selected" : ""} onClick={() => setDirection(1)}>
                  <RotateCw size={15} aria-hidden /> Forward
                </button>
                <button type="button" className={direction === -1 ? "selected" : ""} onClick={() => setDirection(-1)}>
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
              {timelineSlider}
            </div>
          </div>
        </BottomSheet>
      </>
    );
  }

  return (
    <section className="time-controls" aria-label="Time controls">
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
      >
        {direction === 1 ? <RotateCw size={16} /> : <RotateCcw size={16} />}
      </button>
      {presetSelect}
      {speedSlider}
      {timelineSlider}
      <button className="reset-time" type="button" onClick={() => setSimulationDateMs(Date.now())}>
        Now
      </button>
    </section>
  );
};
