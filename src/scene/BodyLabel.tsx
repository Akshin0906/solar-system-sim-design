import { Html } from "@react-three/drei";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import { SCENE_HTML_Z_INDEX_RANGE } from "../ui/htmlLayering";
import { BODY_LABEL_DISTANCE_FACTOR } from "./labelScaling";
import type { BodyEmphasis } from "./planetVisuals";
import type { ScaleMode } from "../simulation/units";

const labelStyle = {
  transform: "translate3d(-50%, -50%, 0) scale(var(--body-label-scale, 1))",
  transformOrigin: "center center",
};

type BodySelectionAction = (bodyId: string) => void;

export const useBodyLabelButton = (
  bodyId: string,
  selectBody: BodySelectionAction,
  focusBody: BodySelectionAction,
) => {
  const detachButtonRef = useRef<(() => void) | null>(null);

  const attachButton = useCallback(
    (button: HTMLButtonElement | null) => {
      detachButtonRef.current?.();
      detachButtonRef.current = null;

      if (!button) {
        return;
      }

      const stop = (event: Event) => {
        event.stopPropagation();
      };
      const select = (event: Event) => {
        stop(event);
        selectBody(bodyId);
      };
      const focus = (event: Event) => {
        stop(event);
        focusBody(bodyId);
      };
      const selectFromKeyboard = (event: KeyboardEvent) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        event.preventDefault();
        select(event);
      };
      const stoppedEvents = ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "dblclick"];

      stoppedEvents.forEach((eventName) => button.addEventListener(eventName, stop, true));
      button.addEventListener("click", select, true);
      button.addEventListener("dblclick", focus, true);
      button.addEventListener("keydown", selectFromKeyboard, true);
      detachButtonRef.current = () => {
        stoppedEvents.forEach((eventName) => button.removeEventListener(eventName, stop, true));
        button.removeEventListener("click", select, true);
        button.removeEventListener("dblclick", focus, true);
        button.removeEventListener("keydown", selectFromKeyboard, true);
      };
    },
    [bodyId, focusBody, selectBody],
  );

  useEffect(() => () => detachButtonRef.current?.(), []);

  return attachButton;
};

type BodyLabelProps = {
  bodyId: string;
  bodyName: string;
  mode: ScaleMode;
  offset: number;
  selected: boolean;
  emphasis: BodyEmphasis;
  suppressed: boolean;
  labelRef: RefObject<HTMLDivElement | null>;
  attachButton: (button: HTMLButtonElement | null) => void;
};

export const BodyLabel = ({
  bodyId,
  bodyName,
  mode,
  offset,
  selected,
  emphasis,
  suppressed,
  labelRef,
  attachButton,
}: BodyLabelProps) => {
  const className = [
    "body-label",
    selected ? "selected" : "",
    emphasis === "muted" ? "quiet-label" : "",
    emphasis === "related" ? "related-label" : "",
    suppressed ? "suppressed-label" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Html
      ref={labelRef}
      position={[0, offset, 0]}
      center
      distanceFactor={mode === "real" ? undefined : BODY_LABEL_DISTANCE_FACTOR}
      zIndexRange={SCENE_HTML_Z_INDEX_RANGE}
      className="body-label-anchor"
      style={labelStyle}
    >
      <button
        ref={attachButton}
        className={className}
        type="button"
        // Labels stay mouse/click-selectable but are kept OUT of the keyboard tab
        // order: otherwise ~14 tiny, arbitrarily-positioned scene buttons sit ahead
        // of the toolbar in an order unrelated to visual layout. Keyboard selection
        // is handled by the command palette instead.
        tabIndex={-1}
        aria-hidden={suppressed ? "true" : undefined}
        aria-label={`Select ${bodyName}`}
        data-body-id={bodyId}
      >
        {bodyName}
      </button>
    </Html>
  );
};
