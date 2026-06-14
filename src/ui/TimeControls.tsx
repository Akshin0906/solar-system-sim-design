import { Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward } from "lucide-react";
import { DAY_MS, TIME_PRESETS, type TimePresetId } from "../data/constants";
import {
  getDateMsFromEpochDays,
  getDaysFromEpoch,
  useTimeStore,
} from "../simulation/timeStore";

const minScrubDays = -365.256 * 100;
const maxScrubDays = 365.256 * 100;
const minSpeed = 1;
const maxSpeed = TIME_PRESETS[TIME_PRESETS.length - 1].secondsPerSecond;

const speedToSlider = (speed: number) => {
  const min = Math.log10(minSpeed);
  const max = Math.log10(maxSpeed);
  return ((Math.log10(speed) - min) / (max - min)) * 100;
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
  const scrubDays = Math.max(minScrubDays, Math.min(maxScrubDays, getDaysFromEpoch(simulationDateMs)));

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
      <select value={preset} onChange={(event) => setPreset(event.target.value as TimePresetId)} aria-label="Speed preset">
        {TIME_PRESETS.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      <label className="range-shell speed-range">
        <input
          type="range"
          min={0}
          max={100}
          step={0.2}
          value={speedToSlider(timeScale)}
          onChange={(event) => setTimeScale(sliderToSpeed(Number(event.target.value)))}
          aria-label="Speed"
        />
      </label>
      <label className="range-shell scrub-range">
        <input
          type="range"
          min={minScrubDays}
          max={maxScrubDays}
          step={1}
          value={scrubDays}
          onChange={(event) => setSimulationDateMs(getDateMsFromEpochDays(Number(event.target.value)))}
          aria-label="Timeline"
        />
      </label>
      <button className="reset-time" type="button" onClick={() => setSimulationDateMs(Date.now())}>
        Now
      </button>
    </section>
  );
};
