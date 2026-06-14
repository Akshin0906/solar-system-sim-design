import { CalendarDays, Rocket, Search, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { bodiesById } from "../data";
import { useSelectionStore } from "../simulation/selectionStore";
import { useTimeStore } from "../simulation/timeStore";
import { useRocketStore } from "../future/rockets/rocketStore";
import { SearchCommand } from "./SearchCommand";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export const TopBar = () => {
  const [searchOpen, setSearchOpen] = useState(false);
  const selectedId = useSelectionStore((state) => state.selectedId);
  const simulationDateMs = useTimeStore((state) => state.simulationDateMs);
  const rocketPanelOpen = useRocketStore((state) => state.panelOpen);
  const toggleRocketPanel = useRocketStore((state) => state.togglePanel);
  const selected = bodiesById.get(selectedId);

  useEffect(() => {
    const openSearch = () => setSearchOpen(true);
    const closeSearch = () => setSearchOpen(false);

    window.addEventListener("solar:open-search", openSearch);
    window.addEventListener("solar:close-search", closeSearch);
    return () => {
      window.removeEventListener("solar:open-search", openSearch);
      window.removeEventListener("solar:close-search", closeSearch);
    };
  }, []);

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
          className="icon-button"
          type="button"
          onClick={() => setSearchOpen((value) => !value)}
          title="Search objects"
          aria-label="Search objects"
        >
          <Search size={16} />
        </button>
        <button
          className={`icon-button ${rocketPanelOpen ? "active" : ""}`}
          type="button"
          onClick={toggleRocketPanel}
          title="Rocket launch"
          aria-label="Rocket launch"
        >
          <Rocket size={16} />
        </button>
        <button className="icon-button" type="button" title="View settings" aria-label="View settings">
          <Settings2 size={16} />
        </button>
      </div>
      <SearchCommand open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
};
