export type RendererMode = "primary" | "fallback";
export type RendererStatus = "idle" | "running" | "stopped" | "disposed";
export type RendererModePreference = "auto" | RendererMode;

export interface RendererFrameInfo {
  timestamp: number;
  deltaMs: number;
  elapsedMs: number;
}

export interface RendererFoundation {
  readonly mode: RendererMode;
  readonly status: RendererStatus;
  start: () => void;
  stop: () => void;
  dispose: () => void;
}

export interface RendererFoundationOptions {
  canvas: HTMLCanvasElement;
  modePreference?: RendererModePreference;
  now?: () => number;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (requestId: number) => void;
  getWebGLContext?: (canvas: HTMLCanvasElement) => WebGLRenderingContext | null;
  onModeResolved?: (mode: RendererMode) => void;
  onStart?: (mode: RendererMode) => void;
  onFrame?: (frame: RendererFrameInfo) => void;
  onStop?: (mode: RendererMode) => void;
  onDispose?: (mode: RendererMode) => void;
}

function getDefaultWebGLContext(canvas: HTMLCanvasElement): WebGLRenderingContext | null {
  try {
    const context = canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl");

    return context as WebGLRenderingContext | null;
  } catch {
    return null;
  }
}

export function detectWebGLSupport(
  canvas: HTMLCanvasElement,
  getWebGLContext: (canvasElement: HTMLCanvasElement) => WebGLRenderingContext | null =
    getDefaultWebGLContext
): boolean {
  return getWebGLContext(canvas) !== null;
}

export function createRendererFoundation(options: RendererFoundationOptions): RendererFoundation {
  const requestFrame = options.requestFrame ?? window.requestAnimationFrame.bind(window);
  const cancelFrame = options.cancelFrame ?? window.cancelAnimationFrame.bind(window);
  const now = options.now ?? (() => performance.now());
  const modePreference = options.modePreference ?? "auto";
  const mode =
    modePreference === "auto"
      ? detectWebGLSupport(options.canvas, options.getWebGLContext)
        ? "primary"
        : "fallback"
      : modePreference;

  options.onModeResolved?.(mode);

  let status: RendererStatus = "idle";
  let rafHandle: number | null = null;
  let startedAt = 0;
  let previousFrameTime = 0;

  const tick = (timestamp: number): void => {
    if (status !== "running" || mode !== "primary") {
      return;
    }

    const deltaMs = previousFrameTime === 0 ? 0 : timestamp - previousFrameTime;
    previousFrameTime = timestamp;

    options.onFrame?.({
      timestamp,
      deltaMs,
      elapsedMs: timestamp - startedAt
    });

    rafHandle = requestFrame(tick);
  };

  const start = (): void => {
    if (status === "disposed" || status === "running") {
      return;
    }

    status = "running";
    startedAt = now();
    previousFrameTime = 0;
    options.onStart?.(mode);

    if (mode === "primary") {
      rafHandle = requestFrame(tick);
    }
  };

  const stop = (): void => {
    if (status === "disposed" || status !== "running") {
      return;
    }

    if (rafHandle !== null) {
      cancelFrame(rafHandle);
      rafHandle = null;
    }

    status = "stopped";
    options.onStop?.(mode);
  };

  const dispose = (): void => {
    if (status === "disposed") {
      return;
    }

    if (status === "running") {
      stop();
    }

    status = "disposed";
    options.onDispose?.(mode);
  };

  return {
    get mode() {
      return mode;
    },
    get status() {
      return status;
    },
    start,
    stop,
    dispose
  };
}
