import { Pause, Play, Skull, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DAY_SECONDS } from "../data/constants";
import { bodiesById } from "../data";
import { useRocketStore } from "../features/rockets/rocketStore";
import { SCENARIOS, scenarioById } from "../scenarios/registry";
import {
  SCENARIO_MAX_TIME_SCALE,
  SCENARIO_MIN_TIME_SCALE,
  useScenarioStore,
} from "../scenarios/scenarioStore";
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

// A discrete choice (interloper type, impact target, …), rendered as a segmented control.
// Each option commits immediately — re-seeding from T+0 like any other param edit.
const ChoiceControl = ({
  param,
  value,
  onCommit,
}: {
  param: ScenarioParam;
  value: number;
  onCommit: (key: string, value: number) => void;
}) => {
  const options = param.options ?? [];
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div className="doomsday-choice">
      <span className="doomsday-choice-label">
        {param.label} <em>{selected?.label}</em>
      </span>
      <div className="doomsday-segments" role="group" aria-label={param.label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`doomsday-segment${option.value === value ? " active" : ""}`}
            aria-pressed={option.value === value}
            title={param.help}
            onClick={() => onCommit(param.key, option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
};

// Route a param to the right control: segmented control for a choice, slider otherwise.
const ParamControl = (props: {
  param: ScenarioParam;
  value: number;
  onCommit: (key: string, value: number) => void;
}) => (props.param.options ? <ChoiceControl {...props} /> : <ParamSlider {...props} />);

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

// The Doomsday control surface — the "watch and play" half of the scenario system.
// Reused verbatim in the desktop dock and the mobile bottom sheet.
const ScenarioControls = () => {
  const activeScenarioId = useScenarioStore((state) => state.activeScenarioId);
  const status = useScenarioStore((state) => state.status);
  const params = useScenarioStore((state) => state.params);
  const timeScale = useScenarioStore((state) => state.timeScaleDaysPerSec);
  const elapsed = useScenarioStore((state) => state.elapsedSimSeconds);
  const consumedIds = useScenarioStore((state) => state.consumedIds);
  const liveFragmentCount = useScenarioStore((state) => state.liveFragmentCount);
  const fragmentCapHit = useScenarioStore((state) => state.fragmentCapHit);
  const throttled = useScenarioStore((state) => state.throttled);
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
          min={SCENARIO_MIN_TIME_SCALE}
          max={SCENARIO_MAX_TIME_SCALE}
          step={1}
          value={timeScale}
          aria-valuetext={`${timeScale} days per second`}
          onChange={(event) => setTimeScale(Number(event.target.value))}
        />
      </label>

      {active.params.map((param) => (
        <ParamControl key={param.key} param={param} value={params[param.key] ?? param.default} onCommit={setParam} />
      ))}

      {destroyed.length > 0 && (
        <p className="doomsday-destroyed">Destroyed: {destroyed.join(", ")}</p>
      )}

      {liveFragmentCount > 0 && (
        <p className="doomsday-debris">
          Debris: {liveFragmentCount} shard{liveFragmentCount === 1 ? "" : "s"}
          {fragmentCapHit > 0 ? ` · capped at ${fragmentCapHit} (excess coalesced)` : ""}
        </p>
      )}

      {throttled && (
        <p className="doomsday-throttle">Sim-time can’t keep up at this speed — lower the speed for accurate timing.</p>
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
  const isMobile = useIsMobile();
  const activeSheet = useUiStore((state) => state.activeSheet);
  const toggleSheet = useUiStore((state) => state.toggleSheet);
  const closeSheet = useUiStore((state) => state.closeSheet);
  const inspectorPresented = useUiStore((state) => state.inspectorPresented);
  const doomsdayPanelOpen = useUiStore((state) => state.doomsdayPanelOpen);
  const toggleDoomsdayPanel = useUiStore((state) => state.toggleDoomsdayPanel);
  const closeDoomsdayPanel = useUiStore((state) => state.closeDoomsdayPanel);
  const activeScenarioId = useScenarioStore((state) => state.activeScenarioId);
  const rocketPanelOpen = useRocketStore((state) => state.panelOpen);
  const setRocketPanelOpen = useRocketStore((state) => state.setPanelOpen);

  // Desktop: keep the two left-column panels mutually exclusive (mirrors how mobile's
  // single activeSheet does it). Opening the rocket panel closes Doomsday; the Doomsday
  // open paths close the rocket panel directly, so this stays a one-directional rule and
  // can't ping-pong. No-op on mobile, which uses bottom sheets.
  useEffect(() => {
    if (!isMobile && rocketPanelOpen && doomsdayPanelOpen) {
      closeDoomsdayPanel();
    }
  }, [closeDoomsdayPanel, doomsdayPanelOpen, isMobile, rocketPanelOpen]);

  const launchLabel = (
    <>
      <Skull size={14} aria-hidden /> Doomsday
      {activeScenarioId ? <span className="doomsday-live-dot" aria-hidden /> : null}
    </>
  );

  if (isMobile) {
    return (
      <>
        {/* Raise the dock above the inspector peek bar when a body is selected so the
            Doomsday chip and the peek bar don't overlap in the bottom-left corner. */}
        <div className={`doomsday-dock${inspectorPresented ? " raised" : ""}`}>
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

  const handleToggle = () => {
    // Opening Doomsday closes the rocket panel so the two left-edge panels never overlap.
    if (!doomsdayPanelOpen) {
      setRocketPanelOpen(false);
    }
    toggleDoomsdayPanel();
  };

  return (
    <div className="doomsday-dock">
      {doomsdayPanelOpen && (
        <section id="doomsday-panel-region" className="doomsday-panel" aria-label="Doomsday scenarios">
          <ScenarioControls />
        </section>
      )}
      <button
        type="button"
        className={`doomsday-launch${activeScenarioId ? " live" : ""}`}
        onClick={handleToggle}
        aria-expanded={doomsdayPanelOpen}
        aria-controls="doomsday-panel-region"
      >
        {launchLabel}
      </button>
    </div>
  );
};
