import { CalendarDays, CircleHelp, Rocket, Search, SlidersHorizontal } from "lucide-react";
import { useRef, useState } from "react";
import { bodiesById } from "../data";
import { useSelectionStore } from "../simulation/selectionStore";
import { useTimeStore } from "../simulation/timeStore";
import { useRocketStore } from "../future/rockets/rocketStore";
import { SearchCommand } from "./SearchCommand";
import { HelpPopover } from "./HelpPopover";
import { commandKey } from "./shortcuts";
import { useUiStore } from "./uiStore";
import { useIsMobile } from "./useMediaQuery";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export const TopBar = () => {
  const [helpOpen, setHelpOpen] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const selectedId = useSelectionStore((state) => state.selectedId);
  const rocketPanelOpen = useRocketStore((state) => state.panelOpen);
  const toggleRocketPanel = useRocketStore((state) => state.togglePanel);
  const isMobile = useIsMobile();
  const activeSheet = useUiStore((state) => state.activeSheet);
  const searchOpen = useUiStore((state) => state.searchOpen);
  const closeSearch = useUiStore((state) => state.closeSearch);
  const toggleSearch = useUiStore((state) => state.toggleSearch);
  const toggleSheet = useUiStore((state) => state.toggleSheet);
  const selected = bodiesById.get(selectedId);

  // On phones the rocket panel and view controls become bottom sheets, so reflect
  // sheet state on those buttons; on desktop the rocket button keeps its own panel.
  const rocketActive = isMobile ? activeSheet === "rocket" : rocketPanelOpen;
  const viewActive = activeSheet === "view";

  const handleRocket = () => {
    closeSearch();
    setHelpOpen(false);
    if (isMobile) {
      toggleSheet("rocket");
    } else {
      toggleRocketPanel();
    }
  };

  return (
    <header className="top-bar">
      <div className="focus-title">
        <span className="focus-kicker">Solar System</span>
        <strong>{selected?.name ?? "Overview"}</strong>
      </div>
      <div className="top-date" title="Simulation date">
        <CalendarDays size={15} />
        <SimClock />
      </div>
      <div className="top-actions">
        <button
          className={`icon-button ${searchOpen ? "active" : ""}`}
          type="button"
          onClick={() => {
            setHelpOpen(false);
            toggleSearch();
          }}
          title={`Search objects (/ or ${commandKey})`}
          aria-label="Search objects"
        >
          <Search size={16} />
        </button>
        {isMobile && (
          <button
            className={`icon-button ${viewActive ? "active" : ""}`}
            type="button"
            onClick={() => {
              closeSearch();
              setHelpOpen(false);
              toggleSheet("view");
            }}
            title="View settings"
            aria-label="View settings"
            aria-pressed={viewActive}
          >
            <SlidersHorizontal size={16} />
          </button>
        )}
        <button
          className={`icon-button ${rocketActive ? "active" : ""}`}
          type="button"
          onClick={handleRocket}
          title="Rocket preview"
          aria-label="Rocket preview"
          aria-pressed={isMobile ? rocketActive : undefined}
        >
          <Rocket size={16} />
        </button>
        <button
          ref={helpButtonRef}
          className={`icon-button ${helpOpen ? "active" : ""}`}
          type="button"
          onClick={() => {
            closeSearch();
            setHelpOpen((value) => !value);
          }}
          title="Help & shortcuts"
          aria-label="Help and shortcuts"
          aria-haspopup="dialog"
          aria-expanded={helpOpen}
          aria-controls="help-popover"
        >
          <CircleHelp size={16} />
        </button>
      </div>
      <SearchCommand open={searchOpen} onClose={closeSearch} />
      <HelpPopover open={helpOpen} onClose={() => setHelpOpen(false)} triggerRef={helpButtonRef} />
    </header>
  );
};

const SimClock = () => {
  const simulationDateMs = useTimeStore((state) => state.simulationDateMs);

  return <span aria-hidden="true">{dateFormatter.format(new Date(simulationDateMs))}</span>;
};
