import { X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { commandKey } from "./shortcuts";
import { useIsMobile } from "./useMediaQuery";

type HelpPopoverProps = {
  open: boolean;
  onClose: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
};

type BuildIdentity = {
  commit: string;
  repository: string | null;
  workflowRun: string | null;
};

const BuildIdentityLink = ({ open }: { open: boolean }) => {
  const [identity, setIdentity] = useState<BuildIdentity | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}build-info.json`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Build identity returned ${response.status}`);
        }
        return await response.json() as BuildIdentity;
      })
      .then((value) => {
        if (/^[0-9a-f]{40}$/.test(value.commit)) {
          setIdentity(value);
        }
      })
      .catch(() => {
        // Local development and older cached builds may not have an identity file.
      });

    return () => controller.abort();
  }, [open]);

  if (!identity) {
    return null;
  }

  const commitUrl = identity.repository
    ? `https://github.com/${identity.repository}/commit/${identity.commit}`
    : null;
  return (
    <div className="help-build" aria-label="Deployed build identity">
      <span>Build</span>
      {commitUrl ? (
        <a href={commitUrl} target="_blank" rel="noreferrer">
          {identity.commit.slice(0, 7)}
        </a>
      ) : (
        <code>{identity.commit.slice(0, 7)}</code>
      )}
      {identity.workflowRun && (
        <a href={identity.workflowRun} target="_blank" rel="noreferrer">
          CI run
        </a>
      )}
    </div>
  );
};

// Opt-in shortcut/controls reference. Keeps the canvas free of persistent tutorial text
// while giving the compact help button a clear job.
export const HelpPopover = ({ open, onClose, triggerRef }: HelpPopoverProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const isMobile = useIsMobile();

  // Help is a non-modal popover: focus moves into it when opened, but Tab may
  // continue into the rest of the toolbar/app. Escape and the close button
  // return focus to the trigger; an outside pointer press simply dismisses it.
  useEffect(() => {
    if (!open) {
      return;
    }

    const focusFrame = window.requestAnimationFrame(() => containerRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
      window.requestAnimationFrame(() => triggerRef?.current?.focus());
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (containerRef.current?.contains(target) || triggerRef?.current?.contains(target)) {
        return;
      }
      onCloseRef.current();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [open, triggerRef]);

  const closeAndRestoreFocus = () => {
    onClose();
    window.requestAnimationFrame(() => triggerRef?.current?.focus());
  };

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
        <span>{isMobile ? "Touch controls" : "Shortcuts"}</span>
        <button className="icon-button subtle" type="button" onClick={closeAndRestoreFocus} title="Close help" aria-label="Close help">
          <X size={15} />
        </button>
      </div>
      {!isMobile && (
        <>
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
        </>
      )}
      <dl className="help-list">
        <div>
          <dt>Rotate view</dt>
          <dd>Drag</dd>
        </div>
        <div>
          <dt>Zoom</dt>
          <dd>{isMobile ? "Pinch" : "Scroll"}</dd>
        </div>
        <div>
          <dt>Pan</dt>
          <dd>{isMobile ? "Two-finger drag" : "Right-drag"}</dd>
        </div>
        <div>
          <dt>Inspect a body</dt>
          <dd>{isMobile ? "Tap it" : "Click it"}</dd>
        </div>
        <div>
          <dt>Go to a body</dt>
          <dd>{isMobile ? "Choose it in Search" : "Double-click or choose it in Search"}</dd>
        </div>
        <div>
          <dt>Surface observer</dt>
          <dd>Choose Observe in a body’s inspector</dd>
        </div>
        <div>
          <dt>Clean screenshot</dt>
          <dd>Use Photo mode in the top bar</dd>
        </div>
      </dl>
      <BuildIdentityLink open={open} />
    </div>
  );
};
