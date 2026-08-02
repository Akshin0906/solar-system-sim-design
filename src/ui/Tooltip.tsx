import { cloneElement, useEffect, useId, useState, type ReactElement } from "react";

type TooltipChild = ReactElement<{ "aria-describedby"?: string }>;

export const Tooltip = ({ label, children }: { label: string; children: TooltipChild }) => {
  const tooltipId = useId();
  const [pointerInside, setPointerInside] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const active = pointerInside || focusInside;
  const visible = active && !dismissed;

  useEffect(() => {
    if (!active) {
      setDismissed(false);
    }
  }, [active]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }

    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDismissed(true);
      }
    };
    document.addEventListener("keydown", dismissOnEscape, true);
    return () => document.removeEventListener("keydown", dismissOnEscape, true);
  }, [visible]);

  const existingDescription = children.props["aria-describedby"];
  const describedBy = visible
    ? [existingDescription, tooltipId].filter(Boolean).join(" ")
    : existingDescription;

  return (
    <span
      className="tooltip-trigger"
      data-tooltip-visible={visible ? "true" : undefined}
      onPointerEnter={() => setPointerInside(true)}
      onPointerLeave={() => setPointerInside(false)}
      onFocusCapture={() => setFocusInside(true)}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setFocusInside(false);
        }
      }}
    >
      {cloneElement(children, { "aria-describedby": describedBy || undefined })}
      <span className="tooltip-surface" aria-hidden={!visible}>
        <span id={tooltipId} className="tooltip-bubble" role="tooltip">
          {label}
        </span>
      </span>
    </span>
  );
};
