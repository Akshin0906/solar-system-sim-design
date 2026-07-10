import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  MoonStar,
  RotateCcw,
  Ruler,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  AUTHORED_TOURS,
  authoredTourById,
  useExperienceStore,
  type ExperienceFidelity,
} from "../features/experiences";
import { useTimeStore } from "../simulation/timeStore";
import "../features/experiences/experiences.css";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const titleForExperience = (id: ReturnType<typeof useExperienceStore.getState>["activeExperienceId"]) => {
  if (id === "eclipse-chase") {
    return "Eclipse Chase";
  }
  return id ? authoredTourById.get(id)?.shortTitle ?? "Guided experience" : "Guided experiences";
};

const FidelityBadges = ({ badges }: { badges: readonly ExperienceFidelity[] }) => (
  <ul className="experience-fidelity" aria-label="Experience fidelity">
    {badges.map((badge) => (
      <li key={`${badge.tier}-${badge.label}`}>
        <span className={`experience-badge ${badge.tier}`}>{badge.label}</span>
        <small>{badge.detail}</small>
      </li>
    ))}
  </ul>
);

const ExperienceMenu = () => {
  const startEclipseChase = useExperienceStore((state) => state.startEclipseChase);
  const startTour = useExperienceStore((state) => state.startTour);

  return (
    <div className="experience-menu">
      <p className="experience-intro">
        Let the simulator direct the camera and clock for a moment. Exit any experience to restore exactly where you
        were.
      </p>
      <button className="experience-card eclipse" type="button" onClick={startEclipseChase}>
        <span className="experience-card-icon" aria-hidden>
          <MoonStar size={18} />
        </span>
        <span>
          <strong>Eclipse Chase</strong>
          <small>Compute the next Sun–Moon–Earth shadow alignment from the live orbital model.</small>
        </span>
        <ChevronRight size={16} aria-hidden />
      </button>
      {AUTHORED_TOURS.map((tour) => (
        <button className="experience-card" type="button" key={tour.id} onClick={() => startTour(tour.id)}>
          <span className="experience-card-icon" aria-hidden>
            {tour.id === "scale-revelation" ? <Ruler size={18} /> : <Sparkles size={18} />}
          </span>
          <span>
            <strong>{tour.shortTitle}</strong>
            <small>{tour.description}</small>
          </span>
          <ChevronRight size={16} aria-hidden />
        </button>
      ))}
    </div>
  );
};

const ActiveExperience = () => {
  const activeExperienceId = useExperienceStore((state) => state.activeExperienceId);
  const activeTourId = useExperienceStore((state) => state.activeTourId);
  const activeStopIndex = useExperienceStore((state) => state.activeStopIndex);
  const activeStop = useExperienceStore((state) => state.activeStop);
  const eclipse = useExperienceStore((state) => state.eclipse);
  const previousStop = useExperienceStore((state) => state.previousStop);
  const nextStop = useExperienceStore((state) => state.nextStop);
  const goToStop = useExperienceStore((state) => state.goToStop);
  const replayEclipse = useExperienceStore((state) => state.replayEclipse);
  const jumpToEclipseMaximum = useExperienceStore((state) => state.jumpToEclipseMaximum);
  const stop = useExperienceStore((state) => state.stop);
  const simulationDateMs = useTimeStore((state) => state.simulationDateMs);
  const activeTour = activeTourId ? authoredTourById.get(activeTourId) : undefined;

  if (!activeExperienceId || !activeStop) {
    return null;
  }

  const lastStop = activeTour ? activeStopIndex === activeTour.stops.length - 1 : false;

  return (
    <div className="experience-active">
      <div className="experience-live-row">
        <span className="experience-live-mark"><i /> Director active</span>
        <button className="experience-exit" type="button" onClick={stop}>
          Exit & restore
        </button>
      </div>

      <div className="experience-story" aria-live="polite">
        <span>{activeStop.eyebrow}</span>
        <h3>{activeStop.title}</h3>
        <p>{activeStop.narration}</p>
        <p className="experience-watch"><Crosshair size={14} aria-hidden /> {activeStop.watchFor}</p>
      </div>

      {eclipse && (
        <div className="experience-eclipse-readout">
          <div>
            <span>Maximum alignment</span>
            <strong>{dateFormatter.format(new Date(eclipse.maximumDateMs))}</strong>
          </div>
          <div>
            <span>Simulation clock</span>
            <strong>{dateFormatter.format(new Date(simulationDateMs))}</strong>
          </div>
          <div className="experience-eclipse-actions">
            <button type="button" onClick={replayEclipse}><RotateCcw size={14} aria-hidden /> Replay approach</button>
            <button type="button" onClick={jumpToEclipseMaximum}><Crosshair size={14} aria-hidden /> Hold maximum</button>
          </div>
        </div>
      )}

      {activeTour && (
        <div className="experience-director-controls">
          <div className="experience-progress" aria-label={`Stop ${activeStopIndex + 1} of ${activeTour.stops.length}`}>
            {activeTour.stops.map((stopItem, index) => (
              <button
                key={stopItem.id}
                type="button"
                className={index === activeStopIndex ? "active" : ""}
                onClick={() => goToStop(index)}
                aria-label={`Go to stop ${index + 1}: ${stopItem.title}`}
                aria-current={index === activeStopIndex ? "step" : undefined}
              />
            ))}
          </div>
          <div className="experience-step-actions">
            <button type="button" onClick={previousStop} disabled={activeStopIndex === 0}>
              <ChevronLeft size={15} aria-hidden /> Previous
            </button>
            <button type="button" className="primary" onClick={lastStop ? stop : nextStop}>
              {lastStop ? "Finish & restore" : "Next stop"}
              {!lastStop && <ChevronRight size={15} aria-hidden />}
            </button>
          </div>
        </div>
      )}

      <FidelityBadges badges={activeStop.fidelity} />
    </div>
  );
};

export const ExperiencePanel = () => {
  const [open, setOpen] = useState(false);
  const previousActiveRef = useRef<ReturnType<typeof useExperienceStore.getState>["activeExperienceId"]>(null);
  const activeExperienceId = useExperienceStore((state) => state.activeExperienceId);
  const activeStop = useExperienceStore((state) => state.activeStop);
  const notice = useExperienceStore((state) => state.notice);
  const clearNotice = useExperienceStore((state) => state.clearNotice);
  const stop = useExperienceStore((state) => state.stop);

  useEffect(() => {
    if (!previousActiveRef.current && activeExperienceId) {
      // Reveal the directed scene instead of leaving the full script over the camera
      // target. The compact watch HUD keeps the narration and exit affordance present.
      setOpen(false);
    }
    previousActiveRef.current = activeExperienceId;
  }, [activeExperienceId]);

  return (
    <div className={`experience-dock${activeExperienceId ? " active" : ""}`}>
      {activeExperienceId && activeStop && !open ? (
        <section className="experience-mini" aria-label={`${titleForExperience(activeExperienceId)} watch`}>
          <span className="experience-mini-icon" aria-hidden><Sparkles size={15} /></span>
          <span className="experience-mini-copy">
            <strong>{activeStop.title}</strong>
            <small>{activeStop.watchFor}</small>
          </span>
          <span className="experience-mini-actions">
            <button type="button" onClick={() => setOpen(true)} aria-label="Open guided details">
              Details
            </button>
            <button type="button" onClick={stop} aria-label="Exit guided experience">
              <X size={14} aria-hidden />
            </button>
          </span>
        </section>
      ) : (
        <button
          className="experience-launch"
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={open ? "experience-panel" : undefined}
        >
          <Sparkles size={15} aria-hidden />
          <span>{titleForExperience(activeExperienceId)}</span>
          {activeExperienceId && <i aria-label="Director active" />}
        </button>
      )}

      {open && (
        <section id="experience-panel" className="experience-panel" aria-label="Guided experiences">
          <header className="experience-panel-head">
            <div>
              <span>Authored mode</span>
              <h2>{titleForExperience(activeExperienceId)}</h2>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close guided experiences">
              <X size={16} aria-hidden />
            </button>
          </header>
          {notice && (
            <div className="experience-notice" role="alert">
              <span>{notice}</span>
              <button type="button" onClick={clearNotice} aria-label="Dismiss message"><X size={13} /></button>
            </div>
          )}
          {activeExperienceId ? <ActiveExperience /> : <ExperienceMenu />}
        </section>
      )}
    </div>
  );
};
