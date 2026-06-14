import { CalendarDays, CircleHelp, Rocket, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const selectedId = useSelectionStore((state) => state.selectedId);
  const simulationDateMs = useTimeStore((state) => state.simulationDateMs);
  const rocketPanelOpen = useRocketStore((state) => state.panelOpen);
  const toggleRocketPanel = useRocketStore((state) => state.togglePanel);
  const isMobile = useIsMobile();
  const activeSheet = useUiStore((state) => state.activeSheet);
  const toggleSheet = useUiStore((state) => state.toggleSheet);
  const selected = bodiesById.get(selectedId);

  // On phones the rocket panel and view controls become bottom sheets, so reflect
  // sheet state on those buttons; on desktop the rocket button keeps its own panel.
  const rocketActive = isMobile ? activeSheet === "rocket" : rocketPanelOpen;
  const viewActive = activeSheet === "view";

  useEffect(() => {
    const openSearch = () => {
      setHelpOpen(false);
      setSearchOpen(true);
    };
    const closeSearch = () => setSearchOpen(false);

    window.addEventListener("solar:open-search", openSearch);
    window.addEventListener("solar:close-search", closeSearch);
    return () => {
      window.removeEventListener("solar:open-search", openSearch);
      window.removeEventListener("solar:close-search", closeSearch);
    };
  }, []);

  const handleRocket = () => {
    setSearchOpen(false);
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
        <span>{dateFormatter.format(new Date(simulationDateMs))}</span>
      </div>
      <div className="top-actions">
        <button
          className={`icon-button ${searchOpen ? "active" : ""}`}
          type="button"
          onClick={() => {
            setHelpOpen(false);
            setSearchOpen((value) => !value);
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
              setSearchOpen(false);
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
          title="Rocket launch"
          aria-label="Rocket launch"
          aria-pressed={isMobile ? rocketActive : undefined}
        >
          <Rocket size={16} />
        </button>
        <button
          ref={helpButtonRef}
          className={`icon-button ${helpOpen ? "active" : ""}`}
          type="button"
          onClick={() => {
            setSearchOpen(false);
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
      <SearchCommand open={searchOpen} onClose={() => setSearchOpen(false)} />
      <HelpPopover open={helpOpen} onClose={() => setHelpOpen(false)} triggerRef={helpButtonRef} />
    </header>
  );
};
