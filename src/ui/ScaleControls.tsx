import { Eye, Orbit, Route, Tags } from "lucide-react";
import { SCALE_MODES, type LabelDensity, type ScaleMode } from "../simulation/units";
import { useScaleStore } from "../simulation/scaleStore";
import { useSelectionStore } from "../simulation/selectionStore";

const labelOptions: Array<{ id: LabelDensity; label: string }> = [
  { id: "minimal", label: "Minimal" },
  { id: "standard", label: "Standard" },
  { id: "full", label: "Full" },
];

export const ScaleControls = () => {
  const mode = useScaleStore((state) => state.mode);
  const labelDensity = useScaleStore((state) => state.labelDensity);
  const showOrbits = useScaleStore((state) => state.showOrbits);
  const showTrails = useScaleStore((state) => state.showTrails);
  const setMode = useScaleStore((state) => state.setMode);
  const setLabelDensity = useScaleStore((state) => state.setLabelDensity);
  const setShowOrbits = useScaleStore((state) => state.setShowOrbits);
  const setShowTrails = useScaleStore((state) => state.setShowTrails);
  const cameraMode = useSelectionStore((state) => state.cameraMode);
  const setCameraMode = useSelectionStore((state) => state.setCameraMode);

  return (
    <section className="scale-controls" aria-label="Scale and view controls">
      <div className="segmented-control">
        {SCALE_MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={mode === item.id ? "selected" : ""}
            onClick={() => setMode(item.id as ScaleMode)}
            title={item.note}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="view-buttons">
        <button
          className={`icon-button ${cameraMode === "overview" ? "active" : ""}`}
          type="button"
          onClick={() => setCameraMode("overview")}
          title="Solar system overview"
          aria-label="Solar system overview"
        >
          <Eye size={16} />
        </button>
        <button
          className={`icon-button ${cameraMode === "inner" ? "active" : ""}`}
          type="button"
          onClick={() => setCameraMode("inner")}
          title="Inner planets"
          aria-label="Inner planets"
        >
          <Orbit size={16} />
        </button>
        <button
          className={`icon-button ${cameraMode === "outer" ? "active" : ""}`}
          type="button"
          onClick={() => setCameraMode("outer")}
          title="Outer planets"
          aria-label="Outer planets"
        >
          <Route size={16} />
        </button>
      </div>
      <label className="compact-select">
        <Tags size={14} />
        <select value={labelDensity} onChange={(event) => setLabelDensity(event.target.value as LabelDensity)} aria-label="Label density">
          {labelOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <div className="toggle-row">
        <label>
          <input type="checkbox" checked={showOrbits} onChange={(event) => setShowOrbits(event.target.checked)} />
          <span>Orbits</span>
        </label>
        <label>
          <input type="checkbox" checked={showTrails} onChange={(event) => setShowTrails(event.target.checked)} />
          <span>Trails</span>
        </label>
      </div>
      <p className="scale-note">{SCALE_MODES.find((item) => item.id === mode)?.note}</p>
    </section>
  );
};
