import { X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useFocusTrap } from "./focusTrap";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  label: string;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

// Distance (px) the sheet must be dragged down before release dismisses it.
const DISMISS_THRESHOLD = 96;

// One reusable phone bottom sheet: slides up over a backdrop, dismissable by tapping
// the backdrop, swiping the grab handle down, the close button, or Esc. The header
// and footer stay pinned while the body scrolls. Mirrors HelpPopover's focus
// contract — focus moves in on open and is restored to the prior element on close.
export const BottomSheet = ({ open, onClose, label, title, children, footer }: BottomSheetProps) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without re-running the focus effect; callers often pass a
  // fresh closure each render (the clock re-renders ancestors every frame).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startYRef = useRef(0);

  useFocusTrap(sheetRef, open, () => onCloseRef.current());

  useEffect(() => {
    if (!open) {
      return;
    }

    setDragY(0);
    setDragging(false);
  }, [open]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("button, input, select, textarea, a")) {
      return;
    }

    startYRef.current = event.clientY;
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) {
      return;
    }
    // Only track downward drags; ignore upward pull.
    setDragY(Math.max(0, event.clientY - startYRef.current));
  };

  const endDrag = () => {
    if (!dragging) {
      return;
    }
    setDragging(false);
    if (dragY > DISMISS_THRESHOLD) {
      onCloseRef.current();
    } else {
      setDragY(0);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="sheet-root">
      <div className="sheet-backdrop" onClick={onClose} aria-hidden />
      <div
        ref={sheetRef}
        className={`sheet${dragging ? " dragging" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        <div
          className="sheet-drag"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span className="sheet-grip" aria-hidden />
          <div className="sheet-head">
            <span className="sheet-title">{title}</span>
            <button
              className="icon-button subtle sheet-close"
              type="button"
              onClick={onClose}
              aria-label={`Close ${label}`}
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
};
