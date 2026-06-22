import {
  CircleDot,
  Crosshair,
  Eye,
  Grid3X3,
  LocateFixed,
  Orbit,
  Pause,
  Play,
  Rocket,
  Route,
  Search,
  Skull,
  TimerReset,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { selectableBodies } from "../data";
import { useRocketStore } from "../features/rockets/rocketStore";
import { useScaleStore } from "../simulation/scaleStore";
import { useSelectionStore } from "../simulation/selectionStore";
import { useTimeStore } from "../simulation/timeStore";
import { formatBodyType } from "../simulation/units";
import { useFocusTrap } from "./focusTrap";
import { useUiStore } from "./uiStore";
import { useIsMobile } from "./useMediaQuery";

type SearchCommandProps = {
  open: boolean;
  onClose: () => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
};

type CommandItem = {
  id: string;
  group: "Actions" | "View" | "Objects";
  title: string;
  subtitle: string;
  keywords: string;
  icon: ReactNode;
  action: () => void;
  active?: boolean;
  shortcut?: string;
};

const normalize = (value: string) => value.toLowerCase();
const clampCommandActiveIndex = (index: number, itemCount: number) =>
  itemCount <= 0 ? 0 : Math.min(Math.max(index, 0), itemCount - 1);

export const SearchCommand = ({ open, onClose, restoreFocusRef }: SearchCommandProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const isMobile = useIsMobile();
  const selectedId = useSelectionStore((state) => state.selectedId);
  const cameraMode = useSelectionStore((state) => state.cameraMode);
  const selectBody = useSelectionStore((state) => state.selectBody);
  const setCameraMode = useSelectionStore((state) => state.setCameraMode);
  const isPaused = useTimeStore((state) => state.isPaused);
  const togglePaused = useTimeStore((state) => state.togglePaused);
  const setSimulationDateMs = useTimeStore((state) => state.setSimulationDateMs);
  const showGrid = useScaleStore((state) => state.showGrid);
  const showOrbits = useScaleStore((state) => state.showOrbits);
  const showTrails = useScaleStore((state) => state.showTrails);
  const setShowGrid = useScaleStore((state) => state.setShowGrid);
  const setShowOrbits = useScaleStore((state) => state.setShowOrbits);
  const setShowTrails = useScaleStore((state) => state.setShowTrails);
  const setRocketPanelOpen = useRocketStore((state) => state.setPanelOpen);
  const openSheet = useUiStore((state) => state.openSheet);
  const openDoomsdayPanel = useUiStore((state) => state.openDoomsdayPanel);

  useFocusTrap(containerRef, open, onClose, restoreFocusRef);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  const commandItems = useMemo<CommandItem[]>(
    () => [
      {
        id: "toggle-time",
        group: "Actions",
        title: isPaused ? "Play simulation" : "Pause simulation",
        subtitle: "Toggle the time transport",
        keywords: "play pause time transport space",
        icon: isPaused ? <Play size={16} /> : <Pause size={16} />,
        action: togglePaused,
        shortcut: "Space",
      },
      {
        id: "jump-now",
        group: "Actions",
        title: "Jump to now",
        subtitle: "Reset the simulation clock",
        keywords: "now today reset date clock",
        icon: <TimerReset size={16} />,
        action: () => setSimulationDateMs(Date.now()),
      },
      {
        id: "rocket-preview",
        group: "Actions",
        title: "Rocket preview",
        subtitle: "Open launch controls",
        keywords: "rocket launch mission preview transfer",
        icon: <Rocket size={16} />,
        action: () => {
          if (isMobile) {
            openSheet("rocket");
          } else {
            setRocketPanelOpen(true);
          }
        },
      },
      {
        id: "doomsday",
        group: "Actions",
        title: "Doomsday scenarios",
        subtitle: "Run a live catastrophe simulation",
        keywords: "doomsday scenario catastrophe red giant black hole rogue impact collision destroy apocalypse",
        icon: <Skull size={16} />,
        action: () => {
          if (isMobile) {
            openSheet("scenario");
          } else {
            // Mirror the panel's mutual exclusivity: opening Doomsday closes the rocket panel.
            setRocketPanelOpen(false);
            openDoomsdayPanel();
          }
        },
      },
      {
        id: "camera-focus",
        group: "View",
        title: "Focus selected body",
        subtitle: "Center the camera on the current selection",
        keywords: "camera focus selected body",
        icon: <Crosshair size={16} />,
        active: cameraMode === "focus",
        action: () => setCameraMode("focus"),
      },
      {
        id: "camera-follow",
        group: "View",
        title: "Follow selected body",
        subtitle: "Track the current orbiting body",
        keywords: "camera follow selected body track",
        icon: <LocateFixed size={16} />,
        active: cameraMode === "follow",
        action: () => setCameraMode("follow"),
      },
      {
        id: "camera-overview",
        group: "View",
        title: "Solar system overview",
        subtitle: "Frame the full system",
        keywords: "camera overview all system",
        icon: <Eye size={16} />,
        active: cameraMode === "overview",
        action: () => setCameraMode("overview"),
      },
      {
        id: "camera-inner",
        group: "View",
        title: "Inner planets",
        subtitle: "Frame Mercury through Mars",
        keywords: "camera inner planets mercury venus earth mars",
        icon: <Orbit size={16} />,
        active: cameraMode === "inner",
        action: () => setCameraMode("inner"),
      },
      {
        id: "camera-outer",
        group: "View",
        title: "Outer planets",
        subtitle: "Frame Jupiter through Neptune",
        keywords: "camera outer planets jupiter saturn uranus neptune",
        icon: <Route size={16} />,
        active: cameraMode === "outer",
        action: () => setCameraMode("outer"),
      },
      {
        id: "toggle-grid",
        group: "View",
        title: `${showGrid ? "Hide" : "Show"} ecliptic grid`,
        subtitle: showGrid ? "Grid is visible" : "Grid is hidden",
        keywords: "grid ecliptic plane visibility",
        icon: <Grid3X3 size={16} />,
        active: showGrid,
        action: () => setShowGrid(!showGrid),
      },
      {
        id: "toggle-orbits",
        group: "View",
        title: `${showOrbits ? "Hide" : "Show"} orbit rings`,
        subtitle: showOrbits ? "Orbit rings are visible" : "Orbit rings are hidden",
        keywords: "orbit rings paths visibility",
        icon: <Orbit size={16} />,
        active: showOrbits,
        action: () => setShowOrbits(!showOrbits),
      },
      {
        id: "toggle-trails",
        group: "View",
        title: `${showTrails ? "Hide" : "Show"} motion trails`,
        subtitle: showTrails ? "Motion trails are visible" : "Motion trails are hidden",
        keywords: "motion trails paths visibility",
        icon: <Route size={16} />,
        active: showTrails,
        action: () => setShowTrails(!showTrails),
      },
      ...selectableBodies.map((body) => ({
        id: `body-${body.id}`,
        group: "Objects" as const,
        title: body.name,
        subtitle: formatBodyType(body.type),
        keywords: `${body.name} ${body.type} ${body.parentId ?? ""}`,
        icon: <CircleDot size={16} />,
        active: body.id === selectedId,
        action: () => selectBody(body.id),
      })),
    ],
    [
      cameraMode,
      isMobile,
      isPaused,
      openDoomsdayPanel,
      openSheet,
      selectBody,
      selectedId,
      setCameraMode,
      setRocketPanelOpen,
      setShowGrid,
      setShowOrbits,
      setShowTrails,
      setSimulationDateMs,
      showGrid,
      showOrbits,
      showTrails,
      togglePaused,
    ],
  );

  const getVisibleItems = useCallback(
    (rawQuery: string) => {
      const cleanQuery = normalize(rawQuery.trim());

      if (!cleanQuery) {
        return [
          ...commandItems.filter((item) => item.group === "Actions"),
          ...commandItems.filter((item) => item.group === "View").slice(0, 6),
          ...commandItems.filter((item) => item.group === "Objects").slice(0, 10),
        ];
      }

      return commandItems
        .filter((item) => {
          const haystack = normalize(`${item.title} ${item.subtitle} ${item.keywords}`);
          return haystack.includes(cleanQuery);
        })
        .slice(0, 18);
    },
    [commandItems],
  );

  const visibleItems = useMemo(() => getVisibleItems(query), [getVisibleItems, query]);
  const safeActiveIndex = clampCommandActiveIndex(activeIndex, visibleItems.length);
  const activeItemId = visibleItems[safeActiveIndex]?.id;

  // How many results a query actually matched, so the list can signal when it has been
  // capped (otherwise a broad term silently hides matches and reads as "no such object").
  const totalFilteredCount = useMemo(() => {
    const cleanQuery = normalize(query.trim());
    if (!cleanQuery) {
      return visibleItems.length;
    }
    return commandItems.filter((item) =>
      normalize(`${item.title} ${item.subtitle} ${item.keywords}`).includes(cleanQuery),
    ).length;
  }, [commandItems, query, visibleItems.length]);
  const resultsTruncated = totalFilteredCount > visibleItems.length;

  useEffect(() => {
    setActiveIndex((index) => clampCommandActiveIndex(index, visibleItems.length));
  }, [visibleItems.length]);

  useEffect(() => {
    if (!open || !activeItemId) {
      return;
    }

    activeItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeItemId, open]);

  const executeItem = (item: CommandItem) => {
    item.action();
    onClose();
    setQuery("");
  };

  const handleQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
    setActiveIndex(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    const keyboardItems = event.currentTarget.value === query ? visibleItems : getVisibleItems(event.currentTarget.value);

    if (keyboardItems.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (clampCommandActiveIndex(index, keyboardItems.length) + 1) % keyboardItems.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (index) => (clampCommandActiveIndex(index, keyboardItems.length) - 1 + keyboardItems.length) % keyboardItems.length,
      );
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(keyboardItems.length - 1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const item = keyboardItems[clampCommandActiveIndex(activeIndex, keyboardItems.length)];
      if (item) {
        executeItem(item);
      }
    }
  };

  if (!open) {
    return null;
  }

  let renderedIndex = -1;
  let lastGroup: CommandItem["group"] | null = null;

  return (
    <div
      ref={containerRef}
      id="search-command-dialog"
      className="search-popover command-popover"
      role="dialog"
      aria-modal="true"
      aria-label="Search and commands"
      tabIndex={-1}
    >
      <div className="search-input-wrap">
        <Search size={15} aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={handleQueryChange}
          placeholder="Search or run a command"
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-label="Search commands and objects"
          aria-expanded="true"
          aria-controls="command-results"
          aria-activedescendant={visibleItems[safeActiveIndex] ? `command-item-${visibleItems[safeActiveIndex].id}` : undefined}
        />
        <button className="icon-button subtle" type="button" onClick={onClose} data-tooltip="Close search" aria-label="Close search">
          <X size={15} />
        </button>
      </div>
      <div id="command-results" className="search-results command-results" role="listbox">
        {visibleItems.length === 0 && (
          <div className="command-empty">
            <span>No matches</span>
            <small>Try a planet, camera mode, or display toggle.</small>
          </div>
        )}
        {visibleItems.map((item) => {
          renderedIndex += 1;
          const currentIndex = renderedIndex;
          const active = renderedIndex === safeActiveIndex;
          const showGroup = item.group !== lastGroup;
          lastGroup = item.group;

          return (
            <div className="command-result-block" key={item.id}>
              {showGroup && <div className="command-group-label">{item.group}</div>}
              <button
                id={`command-item-${item.id}`}
                className={`search-result command-result ${active ? "active" : ""} ${item.active ? "selected" : ""}`.trim()}
                type="button"
                role="option"
                ref={active ? activeItemRef : undefined}
                aria-selected={active}
                onMouseEnter={() => setActiveIndex(currentIndex)}
                onClick={() => executeItem(item)}
              >
                <span className="command-result-icon" aria-hidden>
                  {item.icon}
                </span>
                <span className="command-result-copy">
                  <span>{item.title}</span>
                  <small>{item.subtitle}</small>
                </span>
                {item.shortcut && <kbd>{item.shortcut}</kbd>}
                {item.active && <span className="command-active-dot" aria-hidden />}
              </button>
            </div>
          );
        })}
        {resultsTruncated && (
          <p className="command-overflow" role="note">
            Showing {visibleItems.length} of {totalFilteredCount} — refine your search to narrow results.
          </p>
        )}
      </div>
    </div>
  );
};
