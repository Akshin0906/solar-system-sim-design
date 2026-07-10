import { LocateFixed, Rocket, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useScenarioStore } from "../../scenarios/scenarioStore";
import { useScaleStore } from "../../simulation/scaleStore";
import { useSelectionStore } from "../../simulation/selectionStore";
import { useTimeStore } from "../../simulation/timeStore";
import { InstrumentSelect } from "../../ui/InstrumentSelect";
import { useUiStore } from "../../ui/uiStore";
import { destinationGroupOrder, destinationsById, rocketDestinations, type RocketDestination } from "./destinationCatalog";
import {
  arrivalModeLabel,
  missionModesForDestination,
  resolveMissionModeForDestination,
  rocketArrivalModes,
  rocketLaunchModes,
  rocketMissionModes,
  type RocketMissionMode,
} from "./missionOptions";
import { rocketCatalog, rocketsById, type RocketProfile } from "./rocketCatalog";
import {
  directCurveConfidenceLabel,
  formatCapabilityBenchmark,
  hardwareKindLabel,
  hardwareStatusLabel,
  hardwareStatusTone,
  rocketReferences,
} from "./rocketEvidence";
import { RocketTelemetry } from "./RocketTelemetry";
import { RocketTransferPreview } from "./RocketTransferPreview";
import { missionStatusLabel } from "./rocketState";
import { useRocketStore } from "./rocketStore";
import { getCachedRocketView, useActiveRocketView } from "./useRocketView";

type RocketLauncherPanelProps = {
  forceOpen?: boolean;
  embedded?: boolean;
  onClose?: () => void;
};

const PendingTransferPreview = ({
  destination,
  missionMode,
  profile,
}: {
  destination: RocketDestination;
  missionMode: RocketMissionMode;
  profile: RocketProfile;
}) => {
  const launchDateMs = useTimeStore((state) => state.simulationDateMs);

  return (
    <RocketTransferPreview
      destination={destination}
      launchDateMs={launchDateMs}
      missionMode={missionMode}
      profile={profile}
    />
  );
};

const RocketEvidenceSummary = ({ profile }: { profile: RocketProfile }) => (
  <div className="rocket-evidence-summary">
    <div className="rocket-meta">
      <span className="rocket-kicker">{hardwareKindLabel[profile.hardware.kind]}</span>
      <span className={`rocket-badge ${hardwareStatusTone[profile.hardware.status]}`}>
        {hardwareStatusLabel[profile.hardware.status]}
      </span>
      <span className={`rocket-badge curve-${profile.directCurve.confidence}`}>
        {directCurveConfidenceLabel[profile.directCurve.confidence]}
      </span>
    </div>
    <p className="rocket-blurb">{profile.summary}</p>
    <div className="rocket-claim-grid">
      <div>
        <span>Hardware evidence</span>
        <p>{profile.hardware.note}</p>
      </div>
      <div>
        <span>Direct/free curve</span>
        <p>{profile.directCurve.note}</p>
      </div>
    </div>
    <details className="rocket-evidence-details">
      <summary>Sources &amp; payload benchmarks</summary>
      <p className="rocket-note">
        Payload figures are source context, not a vehicle-selection result. Mission payload, configuration, launch site,
        declination, reserves, and margins are not modeled.
      </p>
      {profile.capabilityBenchmarks.length > 0 ? (
        <ul className="rocket-benchmark-list">
          {profile.capabilityBenchmarks.map((benchmark) => (
            <li key={benchmark.id}>
              <strong>{benchmark.label}</strong>
              <span>{formatCapabilityBenchmark(benchmark)}</span>
              <small>
                {benchmark.configuration}. {benchmark.caveat}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rocket-note">No operational payload/C3 benchmark is asserted for this entry.</p>
      )}
      <ul className="rocket-source-list">
        {profile.hardware.sourceIds.map((sourceId) => {
          const source = rocketReferences[sourceId];
          return (
            <li key={sourceId}>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.publisher}: {source.title}
              </a>
              <span>{source.supports}</span>
            </li>
          );
        })}
      </ul>
    </details>
  </div>
);

// Compact launch panel. Hidden by default (toggled from the top bar) so the
// default solar-system view stays uncluttered. When a rocket is in flight it shows
// live telemetry. The header and the action buttons stay pinned while the selects
// and telemetry scroll, so Launch/Reset are always reachable on short viewports.
export const RocketLauncherPanel = ({ forceOpen = false, embedded = false, onClose }: RocketLauncherPanelProps) => {
  const panelOpen = useRocketStore((state) => state.panelOpen);
  const selectedRocketId = useRocketStore((state) => state.selectedRocketId);
  const selectedDestinationId = useRocketStore((state) => state.selectedDestinationId);
  const selectedMissionMode = useRocketStore((state) => state.selectedMissionMode);
  const selectedLaunchMode = useRocketStore((state) => state.selectedLaunchMode);
  const selectedArrivalMode = useRocketStore((state) => state.selectedArrivalMode);
  const activeRocketId = useRocketStore((state) => state.activeRocketId);
  const activeDestinationId = useRocketStore((state) => state.activeDestinationId);
  const activeMissionMode = useRocketStore((state) => state.activeMissionMode);
  const activeLaunchMode = useRocketStore((state) => state.activeLaunchMode);
  const activeArrivalMode = useRocketStore((state) => state.activeArrivalMode);
  const launchDateMs = useRocketStore((state) => state.launchDateMs);
  const selectRocket = useRocketStore((state) => state.selectRocket);
  const selectDestination = useRocketStore((state) => state.selectDestination);
  const selectMissionMode = useRocketStore((state) => state.selectMissionMode);
  const selectLaunchMode = useRocketStore((state) => state.selectLaunchMode);
  const selectArrivalMode = useRocketStore((state) => state.selectArrivalMode);
  const launch = useRocketStore((state) => state.launch);
  const clear = useRocketStore((state) => state.clear);
  const setPanelOpen = useRocketStore((state) => state.setPanelOpen);
  const cameraMode = useSelectionStore((state) => state.cameraMode);
  const followRocket = useSelectionStore((state) => state.followRocket);
  const beginRocketWatch = useUiStore((state) => state.beginRocketWatch);
  const endRocketWatch = useUiStore((state) => state.endRocketWatch);
  const scenarioActive = useScenarioStore((state) => state.activeScenarioId !== null);

  if (!panelOpen && !forceOpen) {
    return null;
  }

  const selected = rocketsById.get(selectedRocketId) ?? rocketCatalog[0];
  const selectedDestination = destinationsById.get(selectedDestinationId) ?? rocketDestinations[0];
  const active = activeRocketId ? rocketsById.get(activeRocketId) : undefined;
  const activeDestination = activeDestinationId ? destinationsById.get(activeDestinationId) ?? null : null;
  const effectiveMissionMode = resolveMissionModeForDestination(selectedMissionMode, selectedDestination.bodyId);
  const destinationGroups = destinationGroupOrder
    .map((group) => ({
      group,
      destinations: rocketDestinations.filter((destination) => destination.group === group),
    }))
    .filter(({ destinations }) => destinations.length > 0);
  const rocketOptions = rocketCatalog.map((rocket) => ({
    value: rocket.id,
    label: rocket.name,
    description: `${hardwareStatusLabel[rocket.hardware.status]} · ${directCurveConfidenceLabel[rocket.directCurve.confidence]}`,
    meta: (
      <span
        className={`rocket-dot ${hardwareStatusTone[rocket.hardware.status]}`}
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
  const missionOptions = missionModesForDestination(selectedDestination.bodyId).map((modeOption) => ({
    value: modeOption.id,
    label: modeOption.label,
    description:
      selectedDestination.bodyId === "moon" && modeOption.id === "hohmann"
        ? "An Earth-centered two-body transfer to the Moon; Lambert targeting is not exposed for this local model."
        : modeOption.note,
  }));
  const launchOptions = rocketLaunchModes.map((modeOption) => ({
    value: modeOption.id,
    label: modeOption.label,
    description: modeOption.note,
  }));

  const handleLaunch = () => {
    if (scenarioActive) {
      return;
    }

    const launchDate = useTimeStore.getState().simulationDateMs;
    const view = getCachedRocketView(
      selected,
      launchDate,
      launchDate,
      useScaleStore.getState().mode,
      selectedDestination,
      effectiveMissionMode,
      selectedLaunchMode,
      selectedArrivalMode,
    );
    beginRocketWatch();
    launch(
      selected.id,
      selectedDestination.id,
      effectiveMissionMode,
      selectedLaunchMode,
      selectedArrivalMode,
      launchDate,
    );
    followRocket(view.scenePosition);
    if (embedded) {
      onClose?.();
    }
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
        activeLaunchMode,
        activeArrivalMode,
      );
      followRocket(view.scenePosition);
    }
  };

  const handleReset = () => {
    // Retire the marker, then restore the camera and clock snapshot captured on launch.
    clear();
    endRocketWatch();
  };

  const handleClose = () => {
    if (embedded) {
      onClose?.();
      return;
    }

    setPanelOpen(false);
  };

  const selectedMissionLabel = rocketMissionModes.find((option) => option.id === effectiveMissionMode)?.label ?? "Mission";
  const selectedArrivalOption = rocketArrivalModes.find((option) => option.id === selectedArrivalMode) ?? rocketArrivalModes[0];
  const launchLabel = !selectedDestination.bodyId
    ? "Preview free flight"
    : `Preview ${selectedMissionLabel.toLowerCase()} to ${selectedDestination.label}`;
  const conceptNote = <p className="rocket-note rocket-concept-note">Educational concept preview, not mission planning.</p>;
  const panelActions = (
    <div className="rocket-panel-actions">
      <button type="button" className="rocket-launch-button" onClick={handleLaunch} disabled={scenarioActive}>
        <Rocket size={15} />
        {scenarioActive ? "Exit scenario to launch" : active ? "Restart preview" : launchLabel}
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
          Exit preview
        </button>
      )}
    </div>
  );
  const setupFields = (
    <div className="rocket-setup-fields">
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

      <InstrumentSelect
        className="rocket-select"
        value={selectedLaunchMode}
        onChange={(value) => selectLaunchMode(value as typeof selectedLaunchMode)}
        ariaLabel="Launch assumption"
        label="Launch"
        options={launchOptions}
      />

      {effectiveMissionMode !== "direct" && selectedDestination.bodyId && (
        <div className="rocket-arrival-control">
          <span id="rocket-arrival-label" className="rocket-arrival-label">
            Arrival outcome
          </span>
          <div className="rocket-arrival-segments" role="radiogroup" aria-labelledby="rocket-arrival-label">
            {rocketArrivalModes.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selectedArrivalMode === option.id}
                aria-describedby="rocket-arrival-note"
                className={selectedArrivalMode === option.id ? "selected" : ""}
                onClick={() => selectArrivalMode(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p id="rocket-arrival-note" className="rocket-note">
            {selectedArrivalOption.note}
          </p>
        </div>
      )}
    </div>
  );

  return (
    <section
      id={embedded ? undefined : "rocket-preview-panel"}
      className={`rocket-panel${embedded ? " rocket-panel-sheet" : ""}${active ? " watching" : ""}`}
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

        {!active && effectiveMissionMode !== "direct" && selectedDestination.bodyId && (
          <PendingTransferPreview destination={selectedDestination} missionMode={effectiveMissionMode} profile={selected} />
        )}

        {/* When a rocket is active, telemetry is the priority — show it first so the
            full readout is visible; the selects (for reconfiguring a relaunch) follow. */}
        {active && launchDateMs !== null && (
          <RocketTelemetry
            profile={active}
            destination={activeDestination}
            missionMode={activeMissionMode}
            launchMode={activeLaunchMode}
            arrivalMode={activeArrivalMode}
            launchDateMs={launchDateMs}
          />
        )}

        {active ? (
          <details className="rocket-reconfigure">
            <summary>
              <SlidersHorizontal size={14} aria-hidden /> Change mission setup
            </summary>
            {setupFields}
          </details>
        ) : (
          setupFields
        )}

        {!active && (
          <RocketEvidenceSummary profile={selected} />
        )}
      </div>

      {!embedded && panelActions}
    </section>
  );
};

export const RocketWatchHud = ({ onOpenControls }: { onOpenControls: () => void }) => {
  const { activeArrivalMode, destination, profile, view } = useActiveRocketView();
  const cameraMode = useSelectionStore((state) => state.cameraMode);
  const followRocket = useSelectionStore((state) => state.followRocket);
  const clear = useRocketStore((state) => state.clear);
  const endRocketWatch = useUiStore((state) => state.endRocketWatch);

  if (!profile || !view) {
    return null;
  }

  const reset = () => {
    clear();
    endRocketWatch();
  };

  return (
    <section className="rocket-watch-hud" aria-label={`${profile.name} mission watch`}>
      <span className="rocket-watch-kicker">
        <Rocket size={13} aria-hidden /> Mission watch
      </span>
      <strong>{profile.name}</strong>
      <span className="rocket-watch-status">
        {missionStatusLabel[view.status]}
        {destination
          ? ` · ${destination.label}${view.missionMode === "direct" ? "" : ` · ${arrivalModeLabel[activeArrivalMode]}`}`
          : " · Free flight"}
      </span>
      <div className="rocket-watch-actions">
        <button
          type="button"
          className={`rocket-reset-button${cameraMode === "rocket-follow" ? " active" : ""}`}
          onClick={() => followRocket(view.scenePosition)}
          aria-pressed={cameraMode === "rocket-follow"}
        >
          <LocateFixed size={14} aria-hidden /> Follow
        </button>
        <button type="button" className="rocket-reset-button" onClick={onOpenControls}>
          <SlidersHorizontal size={14} aria-hidden /> Details
        </button>
        <button type="button" className="icon-button" onClick={reset} aria-label="Exit rocket preview" title="Exit and restore view">
          <X size={15} />
        </button>
      </div>
    </section>
  );
};
