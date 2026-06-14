import { X } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";
import { commandKey } from "./shortcuts";

type HelpPopoverProps = {
  open: boolean;
  onClose: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
};

// Opt-in shortcut/controls reference. Keeps the canvas free of tutorial text
// (per DESIGN.md) while giving the previously-dead settings button a real job.
export const HelpPopover = ({ open, onClose, triggerRef }: HelpPopoverProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without re-running the focus effect every parent
  // render (TopBar re-renders each frame with the clock).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Dialog focus contract: move focus into the popover on open, restore it to the
  // trigger on close.
  useEffect(() => {
    if (!open) {
      return;
    }

    containerRef.current?.focus();
    return () => triggerRef?.current?.focus();
  }, [open, triggerRef]);

  if (!open) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      id="help-popover"
      className="help-popover"
      role="dialog"
      aria-label="Help and shortcuts"
      tabIndex={-1}
    >
      <div className="help-head">
        <span>Shortcuts</span>
        <button className="icon-button subtle" type="button" onClick={onClose} title="Close help" aria-label="Close help">
          <X size={15} />
        </button>
      </div>
      <dl className="help-list">
        <div>
          <dt>Play / pause</dt>
          <dd>
            <kbd>Space</kbd>
          </dd>
        </div>
        <div>
          <dt>Step a day</dt>
          <dd>
            <kbd>←</kbd>
            <kbd>→</kbd>
          </dd>
        </div>
        <div>
          <dt>Search objects</dt>
          <dd>
            <kbd>/</kbd>
            <kbd>{commandKey}</kbd>
          </dd>
        </div>
        <div>
          <dt>Close popovers</dt>
          <dd>
            <kbd>Esc</kbd>
          </dd>
        </div>
      </dl>
      <div className="help-divider" />
      <dl className="help-list">
        <div>
          <dt>Rotate view</dt>
          <dd>Drag</dd>
        </div>
        <div>
          <dt>Zoom</dt>
          <dd>Scroll</dd>
        </div>
        <div>
          <dt>Pan</dt>
          <dd>Right-drag</dd>
        </div>
        <div>
          <dt>Inspect a body</dt>
          <dd>Click it</dd>
        </div>
      </dl>
    </div>
  );
};
