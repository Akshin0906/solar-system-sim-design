import { Rocket, RotateCcw, X } from "lucide-react";
import { useTimeStore } from "../../simulation/timeStore";
import { categoryLabel, confidenceLabel, rocketCatalog, rocketsById } from "./rocketCatalog";
import { RocketTelemetry } from "./RocketTelemetry";
import { useRocketStore } from "./rocketStore";

// Compact launch panel. Hidden by default (toggled from the top bar) so the
// default solar-system view stays uncluttered. When a rocket is in flight it shows
// live telemetry and a reset control instead of cluttering the scene with extra UI.
export const RocketLauncherPanel = () => {
  const panelOpen = useRocketStore((state) => state.panelOpen);
  const selectedRocketId = useRocketStore((state) => state.selectedRocketId);
  const activeRocketId = useRocketStore((state) => state.activeRocketId);
  const launchDateMs = useRocketStore((state) => state.launchDateMs);
  const selectRocket = useRocketStore((state) => state.selectRocket);
  const launch = useRocketStore((state) => state.launch);
  const clear = useRocketStore((state) => state.clear);
  const setPanelOpen = useRocketStore((state) => state.setPanelOpen);

  if (!panelOpen) {
    return null;
  }

  const selected = rocketsById.get(selectedRocketId) ?? rocketCatalog[0];
  const active = activeRocketId ? rocketsById.get(activeRocketId) : undefined;

  const handleLaunch = () => {
    launch(selected.id, useTimeStore.getState().simulationDateMs);
  };

  return (
    <section className="rocket-panel" aria-label="Rocket launcher">
      <header className="rocket-panel-head">
        <div className="rocket-panel-title">
          <Rocket size={15} />
          <span>Rocket launch</span>
        </div>
        <button
          type="button"
          className="rocket-icon-button"
          onClick={() => setPanelOpen(false)}
          title="Close rocket panel"
          aria-label="Close rocket panel"
        >
          <X size={15} />
        </button>
      </header>

      <label className="rocket-select">
        <span className="rocket-select-label">Profile</span>
        <select
          value={selectedRocketId}
          onChange={(event) => selectRocket(event.target.value)}
          aria-label="Rocket profile"
        >
          {rocketCatalog.map((rocket) => (
            <option key={rocket.id} value={rocket.id}>
              {rocket.name}
            </option>
          ))}
        </select>
      </label>

      {!active && (
        <>
          <div className="rocket-meta">
            <span className="rocket-kicker">{categoryLabel[selected.category]}</span>
            <span className={`rocket-badge ${selected.sourceConfidence}`}>
              {confidenceLabel[selected.sourceConfidence]}
            </span>
          </div>
          <p className="rocket-blurb">{selected.blurb}</p>
        </>
      )}

      <button type="button" className="rocket-launch-button" onClick={handleLaunch}>
        <Rocket size={15} />
        {active ? `Relaunch ${selected.name}` : `Launch from Earth`}
      </button>

      {active && launchDateMs !== null && (
        <>
          <RocketTelemetry profile={active} launchDateMs={launchDateMs} />
          <button type="button" className="rocket-reset-button" onClick={clear}>
            <RotateCcw size={14} />
            Reset rocket
          </button>
        </>
      )}
    </section>
  );
};
