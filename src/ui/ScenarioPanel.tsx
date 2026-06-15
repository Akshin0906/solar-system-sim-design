import { Pause, Play, Skull, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DAY_SECONDS } from "../data/constants";
import { bodiesById } from "../data";
import { SCENARIOS, scenarioById } from "../scenarios/registry";
import { useScenarioStore } from "../scenarios/scenarioStore";
import type { ScenarioParam } from "../scenarios/types";
import { BottomSheet } from "./BottomSheet";
import { useUiStore } from "./uiStore";
import { useIsMobile } from "./useMediaQuery";

const formatParam = (value: number, unit?: string) => `${value}${unit ? ` ${unit}` : ""}`;

// A sandbox slider that shows its value live while dragging but only COMMITS (which
// re-seeds the scenario from T+0) on release — so dragging the thumb doesn't restart
// the catastrophe dozens of times and reset T+ on every intermediate value.
const ParamSlider = ({
  param,
  value,
  onCommit,
}: {
  param: ScenarioParam;
  value: number;
  onCommit: (key: string, value: number) => void;
}) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (draft !== value) {
      onCommit(param.key, draft);
    }
  };

  return (
    <label className="doomsday-slider">
      <span>
        {param.label} <em>{formatParam(draft, param.unit)}</em>
      </span>
      <input
        type="range"
        min={param.min}
        max={param.max}
        step={param.step}
        value={draft}
        aria-valuetext={formatParam(draft, param.unit)}
        title={param.help}
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </label>
  );
};

const formatElapsed = (seconds: number) => {
  const days = seconds / DAY_SECONDS;
  if (days >= 365.256) {
    return `${(days / 365.256).toFixed(days > 3_652 ? 0 : 1)} yr`;
  }
  if (days >= 1) {
    return `${days.toFixed(days > 30 ? 0 : 1)} d`;
  }
  return `${(seconds / 3_600).toFixed(1)} h`;
};

const MIN_SCALE = 1;
const MAX_SCALE = 300;

// The Doomsday control surface — the "watch and play" half of the scenario system.
// Reused verbatim in the desktop dock and the mobile bottom sheet.
const ScenarioControls = () => {
  const activeScenarioId = useScenarioStore((state) => state.activeScenarioId);
  const status = useScenarioStore((state) => state.status);
  const params = useScenarioStore((state) => state.params);
  const timeScale = useScenarioStore((state) => state.timeScaleDaysPerSec);
  const elapsed = useScenarioStore((state) => state.elapsedSimSeconds);
  const consumedIds = useScenarioStore((state) => state.consumedIds);
  const start = useScenarioStore((state) => state.start);
  const stop = useScenarioStore((state) => state.stop);
  const togglePause = useScenarioStore((state) => state.togglePause);
  const setParam = useScenarioStore((state) => state.setParam);
  const setTimeScale = useScenarioStore((state) => state.setTimeScale);

  const active = activeScenarioId ? scenarioById.get(activeScenarioId) : null;

  if (!active) {
    return (
      <div className="doomsday-controls">
        <p className="doomsday-intro">
          Hand the solar system to a live gravity simulation and watch it come apart. Pick a scenario — tweak the
          sliders to go off-script. Exit any time to restore the real system.
        </p>
        <ul className="doomsday-list">
          {SCENARIOS.map((scenario) => (
            <li key={scenario.id}>
              <button type="button" className="doomsday-scenario-btn" onClick={() => start(scenario.id)}>
                <strong>{scenario.name}</strong>
                <span>{scenario.tagline}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const destroyed = consumedIds.map((id) => bodiesById.get(id)?.name ?? id);

  return (
    <div className="doomsday-controls">
      <div className="doomsday-active-head">
        <div>
          <strong>{active.name}</strong>
          <span className="doomsday-clock">
            T+ {formatElapsed(elapsed)} · {status === "paused" ? "paused" : "running"}
          </span>
        </div>
        <div className="doomsday-transport">
          <button
            type="button"
            className="icon-button"
            onClick={togglePause}
            aria-label={status === "paused" ? "Resume scenario" : "Pause scenario"}
            title={status === "paused" ? "Resume" : "Pause"}
          >
            {status === "paused" ? <Play size={15} /> : <Pause size={15} />}
          </button>
          <button type="button" className="icon-button" onClick={stop} aria-label="Exit scenario" title="Exit — restore system">
            <X size={15} />
          </button>
        </div>
      </div>

      <label className="doomsday-slider">
        <span>
          Speed <em>{timeScale} days/s</em>
        </span>
        <input
          type="range"
          min={MIN_SCALE}
          max={MAX_SCALE}
          step={1}
          value={timeScale}
          aria-valuetext={`${timeScale} days per second`}
          onChange={(event) => setTimeScale(Number(event.target.value))}
        />
      </label>

      {active.params.map((param) => (
        <ParamSlider key={param.key} param={param} value={params[param.key] ?? param.default} onCommit={setParam} />
      ))}

      {destroyed.length > 0 && (
        <p className="doomsday-destroyed">Destroyed: {destroyed.join(", ")}</p>
      )}

      <div className="doomsday-science">
        <p className="doomsday-science-time">{active.science.realTimescale}</p>
        <p>{active.science.summary}</p>
        <p className="doomsday-science-watch">{active.science.watch}</p>
      </div>
    </div>
  );
};

export const ScenarioPanel = () => {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const activeSheet = useUiStore((state) => state.activeSheet);
  const toggleSheet = useUiStore((state) => state.toggleSheet);
  const closeSheet = useUiStore((state) => state.closeSheet);
  const activeScenarioId = useScenarioStore((state) => state.activeScenarioId);

  const launchLabel = (
    <>
      <Skull size={14} aria-hidden /> Doomsday
      {activeScenarioId ? <span className="doomsday-live-dot" aria-hidden /> : null}
    </>
  );

  if (isMobile) {
    return (
      <>
        <div className="doomsday-dock">
          <button
            type="button"
            className={`doomsday-launch${activeScenarioId ? " live" : ""}`}
            onClick={() => toggleSheet("scenario")}
            aria-haspopup="dialog"
          >
            {launchLabel}
          </button>
        </div>
        <BottomSheet
          open={activeSheet === "scenario"}
          onClose={closeSheet}
          id="doomsday-sheet"
          label="Doomsday scenarios"
          title="Doomsday"
        >
          <ScenarioControls />
        </BottomSheet>
      </>
    );
  }

  return (
    <div className="doomsday-dock">
      {open && (
        <section id="doomsday-panel-region" className="doomsday-panel" aria-label="Doomsday scenarios">
          <ScenarioControls />
        </section>
      )}
      <button
        type="button"
        className={`doomsday-launch${activeScenarioId ? " live" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="doomsday-panel-region"
      >
        {launchLabel}
      </button>
    </div>
  );
};
