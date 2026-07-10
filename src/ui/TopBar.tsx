import { CalendarDays, CircleHelp, Rocket, Search, SlidersHorizontal } from "lucide-react";
import { useRef } from "react";
import { bodiesById } from "../data";
import { useSelectionStore } from "../simulation/selectionStore";
import { useTimeStore } from "../simulation/timeStore";
import { useRocketStore } from "../features/rockets/rocketStore";
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

const SEARCH_DIALOG_ID = "search-command-dialog";
const VIEW_SHEET_ID = "view-settings-sheet";
const ROCKET_PANEL_ID = "rocket-preview-panel";
const ROCKET_SHEET_ID = "rocket-preview-sheet";
const HELP_POPOVER_ID = "help-popover";

export const TopBar = () => {
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const selectedId = useSelectionStore((state) => state.selectedId);
  const rocketPanelOpen = useRocketStore((state) => state.panelOpen);
  const toggleRocketPanel = useRocketStore((state) => state.togglePanel);
  const isMobile = useIsMobile();
  const activeSheet = useUiStore((state) => state.activeSheet);
  const searchOpen = useUiStore((state) => state.searchOpen);
  const helpOpen = useUiStore((state) => state.helpOpen);
  const closeSearch = useUiStore((state) => state.closeSearch);
  const closeHelp = useUiStore((state) => state.closeHelp);
  const toggleSearch = useUiStore((state) => state.toggleSearch);
  const toggleHelp = useUiStore((state) => state.toggleHelp);
  const toggleSheet = useUiStore((state) => state.toggleSheet);
  const selected = bodiesById.get(selectedId);

  // On phones the rocket panel and view controls become bottom sheets, so reflect
  // sheet state on those buttons; on desktop the rocket button keeps its own panel.
  const rocketActive = isMobile ? activeSheet === "rocket" : rocketPanelOpen;
  const viewActive = activeSheet === "view";
  const rocketControlId = isMobile ? ROCKET_SHEET_ID : ROCKET_PANEL_ID;

  const handleRocket = () => {
    closeSearch();
    closeHelp();
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
        <CalendarDays size={15} aria-hidden />
        <span className="sr-only">Simulation date </span>
        <SimClock />
      </div>
      <div className="top-actions">
        <button
          ref={searchButtonRef}
          className={`icon-button tooltip-trigger ${searchOpen ? "active" : ""}`}
          type="button"
          onClick={toggleSearch}
          data-tooltip={`Search objects (/ or ${commandKey})`}
          aria-label="Search objects"
          aria-haspopup="dialog"
          aria-expanded={searchOpen}
          aria-controls={searchOpen ? SEARCH_DIALOG_ID : undefined}
          aria-pressed={searchOpen}
        >
          <Search size={16} aria-hidden />
        </button>
        {isMobile && (
          <button
            className={`icon-button tooltip-trigger ${viewActive ? "active" : ""}`}
            type="button"
            onClick={() => {
              closeSearch();
              closeHelp();
              toggleSheet("view");
            }}
            data-tooltip="View settings"
            aria-label="View settings"
            aria-haspopup="dialog"
            aria-expanded={viewActive}
            aria-controls={viewActive ? VIEW_SHEET_ID : undefined}
            aria-pressed={viewActive}
          >
            <SlidersHorizontal size={16} aria-hidden />
          </button>
        )}
        <button
          className={`icon-button tooltip-trigger ${rocketActive ? "active" : ""}`}
          type="button"
          onClick={handleRocket}
          data-tooltip="Rocket preview"
          aria-label="Rocket preview"
          aria-haspopup={isMobile ? "dialog" : undefined}
          aria-expanded={rocketActive}
          aria-controls={rocketActive ? rocketControlId : undefined}
          aria-pressed={rocketActive}
        >
          <Rocket size={16} aria-hidden />
        </button>
        <button
          ref={helpButtonRef}
          className={`icon-button tooltip-trigger ${helpOpen ? "active" : ""}`}
          type="button"
          onClick={toggleHelp}
          data-tooltip="Help and shortcuts"
          aria-label="Help and shortcuts"
          aria-haspopup="dialog"
          aria-expanded={helpOpen}
          aria-controls={helpOpen ? HELP_POPOVER_ID : undefined}
        >
          <CircleHelp size={16} aria-hidden />
        </button>
      </div>
      <SearchCommand open={searchOpen} onClose={closeSearch} restoreFocusRef={searchButtonRef} />
      <HelpPopover open={helpOpen} onClose={closeHelp} triggerRef={helpButtonRef} />
    </header>
  );
};

const SimClock = () => {
  const simulationDateMs = useTimeStore((state) => state.simulationDateMs);

  // Not aria-hidden: a screen-reader user navigating the top bar should be able to read
  // the current simulation date. It is a plain (non-live) value, so it is read on demand
  // rather than re-announced every tick — the polite live region in App handles changes.
  return <span>{dateFormatter.format(new Date(simulationDateMs))}</span>;
};
