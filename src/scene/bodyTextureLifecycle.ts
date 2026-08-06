import { useEffect, useState } from "react";
import {
  CanvasTexture,
  LinearFilter,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from "three";
import { configurePlanetTexture } from "./planetVisuals";

export const createCoronaTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 192;
  const context = canvas.getContext("2d");

  if (context) {
    const gradient = context.createRadialGradient(96, 96, 8, 96, 96, 96);
    gradient.addColorStop(0, "rgba(255, 224, 166, 0.32)");
    gradient.addColorStop(0.34, "rgba(247, 178, 96, 0.18)");
    gradient.addColorStop(0.7, "rgba(247, 178, 96, 0.055)");
    gradient.addColorStop(1, "rgba(247, 178, 96, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  return texture;
};

const createImpostorDiscTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 48;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(19, 16, 1, 24, 24, 22);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.72, "rgba(226, 231, 238, 1)");
    gradient.addColorStop(0.92, "rgba(92, 101, 116, 0.92)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  return texture;
};

let sharedImpostorDiscTexture: Texture | undefined;
export const getSharedImpostorDiscTexture = () => {
  sharedImpostorDiscTexture ??= createImpostorDiscTexture();
  return sharedImpostorDiscTexture;
};

export const configureOptionalTexture = (
  texture: Texture | undefined,
  maxAnisotropy: number,
  repeatHorizontally = true,
) => texture ? configurePlanetTexture(texture, maxAnisotropy, repeatHorizontally) : undefined;

type BodyImageTextureState = {
  texture?: Texture;
  status: "deferred" | "unavailable" | "loading" | "loaded" | "failed";
};

export const useBodyImageTexture = (url: string | undefined, maxAnisotropy: number, enabled: boolean) => {
  const [state, setState] = useState<BodyImageTextureState>(() => ({
    status: url ? (enabled ? "loading" : "deferred") : "unavailable",
  }));

  useEffect(() => {
    if (!url) {
      setState({ status: "unavailable" });
      return undefined;
    }
    if (!enabled) {
      setState({ status: "deferred" });
      return undefined;
    }

    setState({ status: "loading" });
    let disposed = false;
    const loader = new TextureLoader();
    const loadedTexture = loader.load(
      url,
      (nextTexture) => {
        if (disposed) {
          nextTexture.dispose();
          return;
        }

        nextTexture.colorSpace = SRGBColorSpace;
        configurePlanetTexture(nextTexture, maxAnisotropy);
        setState({ status: "loaded", texture: nextTexture });
      },
      undefined,
      () => {
        if (!disposed) {
          setState({ status: "failed" });
        }
      },
    );

    return () => {
      disposed = true;
      loadedTexture.dispose();
    };
  }, [enabled, maxAnisotropy, url]);

  return state;
};

type IdleTextureJob = {
  cancelled: boolean;
  run: () => void;
};

const idleTextureJobs: IdleTextureJob[] = [];
let idleTextureCallbackId: number | undefined;
let idleTextureFallbackId: number | undefined;

// Hydrate procedural maps one at a time so forced work never turns into a
// startup-long task. Flat calibrated materials remain available while queued.
const scheduleNextIdleTextureJob = () => {
  if (
    typeof window === "undefined" ||
    idleTextureJobs.length === 0 ||
    idleTextureCallbackId !== undefined ||
    idleTextureFallbackId !== undefined
  ) {
    return;
  }

  const runOne = (deadline?: IdleDeadline) => {
    idleTextureCallbackId = undefined;
    idleTextureFallbackId = undefined;
    if (deadline && !deadline.didTimeout && deadline.timeRemaining() < 4) {
      scheduleNextIdleTextureJob();
      return;
    }

    let nextJob = idleTextureJobs.shift();
    while (nextJob?.cancelled) {
      nextJob = idleTextureJobs.shift();
    }

    try {
      nextJob?.run();
    } finally {
      scheduleNextIdleTextureJob();
    }
  };

  if ("requestIdleCallback" in window && typeof window.requestIdleCallback === "function") {
    idleTextureCallbackId = window.requestIdleCallback(runOne);
  } else {
    idleTextureFallbackId = window.setTimeout(() => runOne(), 0);
  }
};

const enqueueIdleTextureJob = (run: () => void) => {
  const job: IdleTextureJob = { cancelled: false, run };
  idleTextureJobs.push(job);
  scheduleNextIdleTextureJob();
  return () => {
    job.cancelled = true;
  };
};

export const useIdleTexture = (
  factory: () => Texture | undefined,
  dependencies: readonly unknown[],
  enabled = true,
) => {
  const [texture, setTexture] = useState<Texture>();

  useEffect(() => {
    if (!enabled) {
      setTexture(undefined);
      return undefined;
    }

    let disposed = false;
    let createdTexture: Texture | undefined;
    setTexture(undefined);

    const load = () => {
      const nextTexture = factory();
      if (disposed) {
        nextTexture?.dispose();
        return;
      }
      createdTexture = nextTexture;
      setTexture(nextTexture);
    };

    const cancelJob = enqueueIdleTextureJob(load);
    return () => {
      disposed = true;
      cancelJob();
      createdTexture?.dispose();
    };
    // The expensive body-specific factory dependencies are intentionally supplied
    // by each caller, including the enabled predicate whenever it can change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  return texture;
};
