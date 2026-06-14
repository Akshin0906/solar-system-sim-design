import { ChevronUp, Crosshair, LocateFixed, Satellite, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { bodies, bodiesById, childBodiesByParentId } from "../data";
import { useSelectionStore } from "../simulation/selectionStore";
import { useTimeStore } from "../simulation/timeStore";
import { estimateOrbitalSpeedKmS, getOrbitRadiusKm } from "../simulation/solveOrbit";
import { formatDistance, formatPeriod, formatRadius } from "../simulation/units";
import { BottomSheet } from "./BottomSheet";
import { useUiStore } from "./uiStore";
import { useIsMobile } from "./useMediaQuery";

const titleCaseType = (value: string) =>
  value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase())
    .trim();

export const ObjectInspector = () => {
  const selectedId = useSelectionStore((state) => state.selectedId);
  const cameraMode = useSelectionStore((state) => state.cameraMode);
  const setCameraMode = useSelectionStore((state) => state.setCameraMode);
  const isMobile = useIsMobile();
  const inspectorPresented = useUiStore((state) => state.inspectorPresented);
  const activeSheet = useUiStore((state) => state.activeSheet);
  const openSheet = useUiStore((state) => state.openSheet);
  const presentInspector = useUiStore((state) => state.presentInspector);
  const dismissInspector = useUiStore((state) => state.dismissInspector);
  const body = bodiesById.get(selectedId) ?? bodies[0];
  const parent = body.parentId ? bodiesById.get(body.parentId) : undefined;
  const moons = childBodiesByParentId[body.id]?.filter((child) => child.type === "moon") ?? [];

  // Present the inspector whenever the user actively selects a different body. The
  // initial default selection (Earth) is skipped so phones open to a clean scene.
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    presentInspector();
  }, [selectedId, presentInspector]);

  const details = (
    <>
      <dl className="inspector-details">
        <div>
          <dt>Parent</dt>
          <dd>{parent?.name ?? "None"}</dd>
        </div>
        <div>
          <dt>Radius</dt>
          <dd>{formatRadius(body.physical.radiusKm)}</dd>
        </div>
        <div>
          <dt>Distance (est.)</dt>
          <dd>
            <BodyDistance body={body} />
          </dd>
        </div>
        <div>
          <dt>Period</dt>
          <dd>{body.orbit ? formatPeriod(body.orbit.orbitalPeriodDays) : "N/A"}</dd>
        </div>
        <div>
          <dt>Speed (Kepler)</dt>
          <dd>
            <BodySpeed body={body} />
          </dd>
        </div>
        {body.physical.rotationPeriodHours && (
          <div>
            <dt>Rotation</dt>
            <dd>{`${Math.abs(body.physical.rotationPeriodHours).toFixed(1)} h`}</dd>
          </div>
        )}
        {moons.length > 0 && (
          <div>
            <dt>Moons</dt>
            <dd>{moons.length}</dd>
          </div>
        )}
      </dl>
      {moons.length > 0 && (
        <div className="moon-list">
          {moons.slice(0, 6).map((moon) => (
            <button key={moon.id} type="button" onClick={() => useSelectionStore.getState().focusBody(moon.id)}>
              {moon.name}
            </button>
          ))}
        </div>
      )}
    </>
  );

  const actions = (
    <div className="inspector-actions">
      <button className={cameraMode === "focus" ? "active" : ""} type="button" onClick={() => setCameraMode("focus")}>
        <Crosshair size={15} />
        Focus
      </button>
      <button className={cameraMode === "follow" ? "active" : ""} type="button" onClick={() => setCameraMode("follow")}>
        <LocateFixed size={15} />
        Follow
      </button>
      {moons.length > 0 && (
        <button className={cameraMode === "moons" ? "active" : ""} type="button" onClick={() => setCameraMode("moons")}>
          <Satellite size={15} />
          Moons
        </button>
      )}
    </div>
  );

  if (isMobile) {
    if (!inspectorPresented) {
      return null;
    }

    const expanded = activeSheet === "inspector";

    return (
      <>
        {!expanded && (
          <div className="inspector-peek">
            <button
              className="inspector-peek-main"
              type="button"
              onClick={() => openSheet("inspector")}
              aria-label={`Show ${body.name} details`}
            >
              <span className="inspector-peek-text">
                <span className="inspector-peek-name">{body.name}</span>
                <span className="inspector-peek-stat">
                  {titleCaseType(body.type)} · <BodyDistance body={body} />
                </span>
              </span>
              <ChevronUp size={18} aria-hidden />
            </button>
            <button
              className="icon-button subtle inspector-peek-close"
              type="button"
              onClick={dismissInspector}
              aria-label="Dismiss inspector"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <BottomSheet open={expanded} onClose={dismissInspector} label={`${body.name} details`} title={body.name} footer={actions}>
          <p className="inspector-kicker">{titleCaseType(body.type)}</p>
          {details}
        </BottomSheet>
      </>
    );
  }

  return (
    <aside className="object-inspector">
      <div className="inspector-heading">
        <span>{titleCaseType(body.type)}</span>
        <h2>{body.name}</h2>
      </div>
      {details}
      {actions}
    </aside>
  );
};

const BodyDistance = ({ body }: { body: (typeof bodies)[number] }) => {
  const dateMs = useTimeStore((state) => state.simulationDateMs);
  const distance = body.orbit ? getOrbitRadiusKm(body, new Date(dateMs)) : 0;

  return <>{distance ? formatDistance(distance) : "Center"}</>;
};

const BodySpeed = ({ body }: { body: (typeof bodies)[number] }) => {
  const dateMs = useTimeStore((state) => state.simulationDateMs);
  const speed = body.orbit ? estimateOrbitalSpeedKmS(body, new Date(dateMs)) : 0;

  return <>{speed ? `${speed.toFixed(speed > 10 ? 1 : 2)} km/s` : "N/A"}</>;
};
