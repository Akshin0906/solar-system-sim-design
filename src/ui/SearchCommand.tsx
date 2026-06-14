import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { selectableBodies } from "../data";
import { useSelectionStore } from "../simulation/selectionStore";
import { useFocusTrap } from "./focusTrap";

type SearchCommandProps = {
  open: boolean;
  onClose: () => void;
};

export const SearchCommand = ({ open, onClose }: SearchCommandProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const focusBody = useSelectionStore((state) => state.focusBody);

  useFocusTrap(containerRef, open, onClose);

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  const results = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) {
      return selectableBodies.slice(0, 10);
    }

    return selectableBodies
      .filter((body) => body.name.toLowerCase().includes(cleanQuery) || body.type.toLowerCase().includes(cleanQuery))
      .slice(0, 12);
  }, [query]);

  if (!open) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="search-popover"
      role="dialog"
      aria-modal="true"
      aria-label="Search objects"
      tabIndex={-1}
    >
      <div className="search-input-wrap">
        <Search size={15} aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search objects"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onClose();
            }
          }}
        />
        <button className="icon-button subtle" type="button" onClick={onClose} title="Close search" aria-label="Close search">
          <X size={15} />
        </button>
      </div>
      <div className="search-results">
        {results.map((body) => (
          <button
            key={body.id}
            className="search-result"
            type="button"
            onClick={() => {
              focusBody(body.id);
              onClose();
              setQuery("");
            }}
          >
            <span>{body.name}</span>
            <small>{body.type}</small>
          </button>
        ))}
      </div>
    </div>
  );
};
