import { Camera, Check, Share2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { usePhotoModeStore } from "./photoModeStore";
import { createSharedViewUrl } from "./viewState";
import { Tooltip } from "../../ui/Tooltip";
import "./shareView.css";

export const ViewShareActions = ({ labelled = false }: { labelled?: boolean }) => {
  const togglePhotoMode = usePhotoModeStore((state) => state.toggle);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "address">("idle");

  useEffect(() => {
    if (shareStatus === "idle") {
      return;
    }
    const timer = window.setTimeout(() => setShareStatus("idle"), 2_000);
    return () => window.clearTimeout(timer);
  }, [shareStatus]);

  const copyLink = async () => {
    const url = createSharedViewUrl(window.location.href);
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus("copied");
    } catch {
      window.history.replaceState(null, "", url);
      setShareStatus("address");
    }
  };

  const shareFeedback = shareStatus === "copied" ? "View link copied" : "View link added to address bar";
  const photoButton = (
    <button
      className={`icon-button view-share-button${labelled ? " labelled" : ""}`}
      type="button"
      onClick={togglePhotoMode}
      aria-label="Enter photo mode"
    >
      <Camera size={16} aria-hidden />
      {labelled && <span>Photo mode</span>}
    </button>
  );
  const shareButton = (
    <button
      className={`icon-button view-share-button${labelled ? " labelled" : ""}${shareStatus !== "idle" ? " active" : ""}`}
      type="button"
      onClick={copyLink}
      aria-label={shareStatus === "idle" ? "Copy shareable view link" : shareFeedback}
    >
      {shareStatus !== "idle" ? <Check size={16} aria-hidden /> : <Share2 size={16} aria-hidden />}
      {labelled && <span>{shareStatus === "idle" ? "Copy view link" : shareFeedback}</span>}
    </button>
  );

  return (
    <>
      {labelled ? photoButton : <Tooltip label="Photo mode">{photoButton}</Tooltip>}
      {labelled ? (
        shareButton
      ) : (
        <Tooltip label={shareStatus === "idle" ? "Copy view link" : shareFeedback}>{shareButton}</Tooltip>
      )}
      {shareStatus !== "idle" && (
        <span className="sr-only" role="status" aria-live="polite">
          {shareFeedback}
        </span>
      )}
    </>
  );
};

export const PhotoModeExit = () => {
  const active = usePhotoModeStore((state) => state.active);
  const setActive = usePhotoModeStore((state) => state.setActive);

  if (!active) {
    return null;
  }

  return (
    <div className="photo-mode-exit">
      <span>Photo mode</span>
      <button type="button" onClick={() => setActive(false)}>
        <X size={15} aria-hidden /> Show controls
      </button>
    </div>
  );
};
