import { Eye, Orbit, Route, Tags } from "lucide-react";
import { SCALE_MODES, type LabelDensity, type ScaleMode } from "../simulation/units";
import { useScaleStore } from "../simulation/scaleStore";
import { type CameraMode, useSelectionStore } from "../simulation/selectionStore";
import { BottomSheet } from "./BottomSheet";
import { InstrumentSelect } from "./InstrumentSelect";
import { useUiStore } from "./uiStore";
import { useIsMobile } from "./useMediaQuery";

const labelOptions: Array<{ id: LabelDensity; label: string }> = [
  { id: "minimal", label: "Minimal" },
  { id: "standard", label: "Standard" },
  { id: "full", label: "Full" },
];

type CameraPresetId =
  | "overview"
  | "inner"
  | "outer"
  | "earth-moon"
  | "jupiter-system"
  | "saturn-system"
  | "kuiper-belt";

const cameraPresetOptions: Array<{ id: CameraPresetId; label: string; description: string }> = [
  { id: "overview", label: "Solar system", description: "Frame the full system" },
  { id: "inner", label: "Inner planets", description: "Mercury through Mars" },
  { id: "outer", label: "Outer planets", description: "Jupiter through Neptune" },
  { id: "earth-moon", label: "Earth/Moon", description: "Frame Earth and the Moon" },
  { id: "jupiter-system", label: "Jupiter system", description: "Jupiter and major moons" },
  { id: "saturn-system", label: "Saturn system", description: "Saturn and major moons" },
  { id: "kuiper-belt", label: "Kuiper belt", description: "Frame the distant belt" },
];

const cameraPresetIds = new Set<CameraMode>(cameraPresetOptions.map((option) => option.id));

const cameraModeFallbackLabel: Partial<Record<CameraMode, string>> = {
  free: "Free look",
  focus: "Focused body",
  follow: "Following body",
  moons: "Moon system",
  "rocket-follow": "Following rocket",
};

export const ScaleControls = () => {
  const mode = useScaleStore((state) => state.mode);
  const labelDensity = useScaleStore((state) => state.labelDensity);
  const showGrid = useScaleStore((state) => state.showGrid);
  const showOrbits = useScaleStore((state) => state.showOrbits);
  const showTrails = useScaleStore((state) => state.showTrails);
  const setMode = useScaleStore((state) => state.setMode);
  const setLabelDensity = useScaleStore((state) => state.setLabelDensity);
  const setShowGrid = useScaleStore((state) => state.setShowGrid);
  const setShowOrbits = useScaleStore((state) => state.setShowOrbits);
  const setShowTrails = useScaleStore((state) => state.setShowTrails);
  const cameraMode = useSelectionStore((state) => state.cameraMode);
  const setCameraMode = useSelectionStore((state) => state.setCameraMode);
  const selectBody = useSelectionStore((state) => state.selectBody);
  const isMobile = useIsMobile();
  const activeSheet = useUiStore((state) => state.activeSheet);
  const closeSheet = useUiStore((state) => state.closeSheet);
  const cameraPresetValue = cameraPresetIds.has(cameraMode) ? (cameraMode as CameraPresetId) : "custom";
  const cameraOptions = [
    ...(cameraPresetValue === "custom"
      ? [
          {
            value: "custom",
            label: cameraModeFallbackLabel[cameraMode] ?? "Custom view",
            description: "Current camera mode",
            disabled: true,
          },
        ]
      : []),
    ...cameraPresetOptions.map((option) => ({
      value: option.id,
      label: option.label,
      description: option.description,
    })),
  ];

  const selectCameraPreset = (value: string) => {
    if (value === "earth-moon") {
      selectBody("earth");
    } else if (value === "jupiter-system") {
      selectBody("jupiter");
    } else if (value === "saturn-system") {
      selectBody("saturn");
    }

    if (value !== "custom") {
      setCameraMode(value as CameraPresetId);
    }
  };

  const controls = (
    <>
      <div className="segmented-control" role="radiogroup" aria-label="Scale mode">
        {SCALE_MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={mode === item.id}
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
          aria-pressed={cameraMode === "overview"}
        >
          <Eye size={16} />
        </button>
        <button
          className={`icon-button ${cameraMode === "inner" ? "active" : ""}`}
          type="button"
          onClick={() => setCameraMode("inner")}
          title="Inner planets"
          aria-label="Inner planets"
          aria-pressed={cameraMode === "inner"}
        >
          <Orbit size={16} />
        </button>
        <button
          className={`icon-button ${cameraMode === "outer" ? "active" : ""}`}
          type="button"
          onClick={() => setCameraMode("outer")}
          title="Outer planets"
          aria-label="Outer planets"
          aria-pressed={cameraMode === "outer"}
        >
          <Route size={16} />
        </button>
        {cameraMode === "free" && (
          <span className="free-look-pill" role="status" title="Free look">
            Free
          </span>
        )}
      </div>
      <InstrumentSelect
        className="compact-select camera-preset-select"
        value={cameraPresetValue}
        onChange={selectCameraPreset}
        ariaLabel="Camera preset"
        label="Camera"
        icon={<Eye size={14} aria-hidden />}
        options={cameraOptions}
      />
      <InstrumentSelect
        className="compact-select"
        value={labelDensity}
        onChange={(value) => setLabelDensity(value as LabelDensity)}
        ariaLabel="Label density"
        label="Labels"
        icon={<Tags size={14} aria-hidden />}
        options={labelOptions.map((item) => ({
          value: item.id,
          label: item.label,
          description:
            item.id === "minimal" ? "Focused names only" : item.id === "standard" ? "Major bodies and context" : "All available labels",
        }))}
      />
      <div className="toggle-row">
        <label>
          <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
          <span>Grid</span>
        </label>
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
    </>
  );

  if (isMobile) {
    return (
      <BottomSheet
        open={activeSheet === "view"}
        onClose={closeSheet}
        id="view-settings-sheet"
        label="View settings"
        title="View"
      >
        <div className="sheet-scale">{controls}</div>
      </BottomSheet>
    );
  }

  return (
    <section className="scale-controls" aria-label="Scale and view controls">
      {controls}
    </section>
  );
};
