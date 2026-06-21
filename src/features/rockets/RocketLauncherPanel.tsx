import { LocateFixed, Rocket, RotateCcw, X } from "lucide-react";
import { useScaleStore } from "../../simulation/scaleStore";
import { useSelectionStore } from "../../simulation/selectionStore";
import { useTimeStore } from "../../simulation/timeStore";
import { InstrumentSelect } from "../../ui/InstrumentSelect";
import { destinationGroupOrder, destinationsById, rocketDestinations } from "./destinationCatalog";
import { rocketMissionModes } from "./missionOptions";
import { categoryLabel, confidenceLabel, rocketCatalog, rocketsById } from "./rocketCatalog";
import { RocketTelemetry } from "./RocketTelemetry";
import { RocketTransferPreview } from "./RocketTransferPreview";
import { useRocketStore } from "./rocketStore";
import { getCachedRocketView } from "./useRocketView";

type RocketLauncherPanelProps = {
  forceOpen?: boolean;
  embedded?: boolean;
  onClose?: () => void;
};

// Compact launch panel. Hidden by default (toggled from the top bar) so the
// default solar-system view stays uncluttered. When a rocket is in flight it shows
// live telemetry. The header and the action buttons stay pinned while the selects
// and telemetry scroll, so Launch/Reset are always reachable on short viewports.
export const RocketLauncherPanel = ({ forceOpen = false, embedded = false, onClose }: RocketLauncherPanelProps) => {
  const panelOpen = useRocketStore((state) => state.panelOpen);
  const selectedRocketId = useRocketStore((state) => state.selectedRocketId);
  const selectedDestinationId = useRocketStore((state) => state.selectedDestinationId);
  const selectedMissionMode = useRocketStore((state) => state.selectedMissionMode);
  const simulationDateMs = useTimeStore((state) => state.simulationDateMs);
  const activeRocketId = useRocketStore((state) => state.activeRocketId);
  const activeDestinationId = useRocketStore((state) => state.activeDestinationId);
  const activeMissionMode = useRocketStore((state) => state.activeMissionMode);
  const launchDateMs = useRocketStore((state) => state.launchDateMs);
  const selectRocket = useRocketStore((state) => state.selectRocket);
  const selectDestination = useRocketStore((state) => state.selectDestination);
  const selectMissionMode = useRocketStore((state) => state.selectMissionMode);
  const launch = useRocketStore((state) => state.launch);
  const clear = useRocketStore((state) => state.clear);
  const setPanelOpen = useRocketStore((state) => state.setPanelOpen);
  const cameraMode = useSelectionStore((state) => state.cameraMode);
  const followRocket = useSelectionStore((state) => state.followRocket);

  if (!panelOpen && !forceOpen) {
    return null;
  }

  const selected = rocketsById.get(selectedRocketId) ?? rocketCatalog[0];
  const selectedDestination = destinationsById.get(selectedDestinationId) ?? rocketDestinations[0];
  const active = activeRocketId ? rocketsById.get(activeRocketId) : undefined;
  const activeDestination = activeDestinationId ? destinationsById.get(activeDestinationId) ?? null : null;
  const effectiveMissionMode = selectedDestination.bodyId ? selectedMissionMode : "direct";
  const destinationGroups = destinationGroupOrder
    .map((group) => ({
      group,
      destinations: rocketDestinations.filter((destination) => destination.group === group),
    }))
    .filter(({ destinations }) => destinations.length > 0);
  const rocketOptions = rocketCatalog.map((rocket) => ({
    value: rocket.id,
    label: rocket.name,
    description: `${categoryLabel[rocket.category]} · ${confidenceLabel[rocket.sourceConfidence]}`,
    meta: (
      <span
        className={`rocket-dot ${rocket.sourceConfidence}`}
        style={{ backgroundColor: rocket.accentColor, color: rocket.accentColor }}
        aria-hidden
      />
    ),
  }));
  const destinationOptions = destinationGroups.map(({ group, destinations }) => ({
    label: group,
    options: destinations.map((destination) => ({
      value: destination.id,
      label: destination.label,
      description: destination.bodyId ? "Track an existing body" : "Outward cruise preview",
    })),
  }));
  const missionOptions = rocketMissionModes.map((modeOption) => ({
    value: modeOption.id,
    label: modeOption.label,
    description: modeOption.note,
  }));

  const handleLaunch = () => {
    launch(selected.id, selectedDestination.id, effectiveMissionMode, simulationDateMs);
  };

  const handleFollowRocket = () => {
    if (active && launchDateMs !== null) {
      const view = getCachedRocketView(
        active,
        launchDateMs,
        useTimeStore.getState().simulationDateMs,
        useScaleStore.getState().mode,
        activeDestination,
        activeMissionMode,
      );
      followRocket(view.scenePosition);
    }
  };

  const handleReset = () => {
    // clear() now also releases the rocket-follow camera, so this stays a single call.
    clear();
  };

  const handleClose = () => {
    if (embedded) {
      onClose?.();
      return;
    }

    setPanelOpen(false);
  };

  const launchLabel = !selectedDestination.bodyId
    ? "Preview free flight"
    : effectiveMissionMode === "transfer"
      ? `Preview transfer to ${selectedDestination.label}`
      : `Preview direct aim to ${selectedDestination.label}`;
  const conceptNote = <p className="rocket-note rocket-concept-note">Educational concept preview, not mission planning.</p>;
  const panelActions = (
    <div className="rocket-panel-actions">
      <button type="button" className="rocket-launch-button" onClick={handleLaunch}>
        <Rocket size={15} />
        {active ? "Restart preview" : launchLabel}
      </button>
      {active && (
        <button
          type="button"
          className={`rocket-reset-button${cameraMode === "rocket-follow" ? " active" : ""}`}
          onClick={handleFollowRocket}
        >
          <LocateFixed size={14} />
          Follow rocket
        </button>
      )}
      {active && (
        <button type="button" className="rocket-reset-button" onClick={handleReset}>
          <RotateCcw size={14} />
          Reset rocket
        </button>
      )}
    </div>
  );

  return (
    <section
      id={embedded ? undefined : "rocket-preview-panel"}
      className={`rocket-panel${embedded ? " rocket-panel-sheet" : ""}`}
      aria-label="Rocket preview"
    >
      {!embedded && (
        <header className="rocket-panel-head">
          <div className="rocket-panel-title">
            <Rocket size={15} />
            <span>Rocket preview</span>
          </div>
          <button
            type="button"
            className="rocket-icon-button"
            onClick={handleClose}
            title="Close rocket panel"
            aria-label="Close rocket panel"
          >
            <X size={15} />
          </button>
        </header>
      )}

      {embedded && conceptNote}
      {embedded && panelActions}

      <div className="rocket-panel-body">
        {!embedded && conceptNote}

        {!active && effectiveMissionMode === "transfer" && selectedDestination.bodyId && (
          <RocketTransferPreview
            destination={selectedDestination}
            launchDateMs={simulationDateMs}
            profile={selected}
          />
        )}

        {/* When a rocket is active, telemetry is the priority — show it first so the
            full readout is visible; the selects (for reconfiguring a relaunch) follow. */}
        {active && launchDateMs !== null && (
          <RocketTelemetry
            profile={active}
            destination={activeDestination}
            missionMode={activeMissionMode}
            launchDateMs={launchDateMs}
          />
        )}

        <InstrumentSelect
          className="rocket-select"
          value={selectedRocketId}
          onChange={selectRocket}
          ariaLabel="Rocket profile"
          label="Profile"
          options={rocketOptions}
        />

        <InstrumentSelect
          className="rocket-select"
          value={selectedDestinationId}
          onChange={selectDestination}
          ariaLabel="Destination"
          label="Target"
          groups={destinationOptions}
        />

        <InstrumentSelect
          className="rocket-select"
          value={effectiveMissionMode}
          onChange={(value) => selectMissionMode(value as typeof selectedMissionMode)}
          ariaLabel="Mission mode"
          label="Mode"
          disabled={!selectedDestination.bodyId}
          options={missionOptions}
        />

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
      </div>

      {!embedded && panelActions}
    </section>
  );
};
