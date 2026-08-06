export type ClientDiagnosticKind =
  | "render-error"
  | "service-worker-registration-failure"
  | "unhandled-error"
  | "unhandled-rejection"
  | "webgl-context-lost"
  | "webgl-context-restored"
  | "webgl-init-failure";

export type ClientDiagnostic = {
  build: string;
  detail?: Record<string, string | number | boolean | null>;
  kind: ClientDiagnosticKind;
  message: string;
  name: string;
  path: string;
  stack?: string;
  timestamp: string;
  userAgent: string;
  viewport: string;
};

const STORAGE_KEY = "solar-system-sim.diagnostics.v1";
const MAX_REPORTS = 20;
const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 4_000;
const MAX_DETAIL_STRING_LENGTH = 1_200;

// Error messages and stacks can contain the current URL. Retain the useful origin and
// source path while stripping query/hash state before anything is stored or copied.
export const sanitizeDiagnosticText = (value: string, maxLength: number) =>
  value
    .replace(/https?:\/\/[^\s"'<>]+/g, (match) => {
      try {
        const url = new URL(match);
        return `${url.origin}${url.pathname}`;
      } catch {
        return "[url removed]";
      }
    })
    .slice(0, maxLength);

export const resolveSameOriginDiagnosticEndpoint = (endpoint: string, origin: string) => {
  try {
    const endpointUrl = new URL(endpoint, origin);
    return endpointUrl.origin === origin ? endpointUrl.href : null;
  } catch {
    return null;
  }
};

const sanitizeDetail = (detail: ClientDiagnostic["detail"]) =>
  detail
    ? Object.fromEntries(
        Object.entries(detail).map(([key, value]) => [
          key,
          typeof value === "string"
            ? sanitizeDiagnosticText(value, MAX_DETAIL_STRING_LENGTH)
            : value,
        ]),
      )
    : undefined;

const errorParts = (value: unknown) => {
  if (value instanceof Error) {
    return {
      name: sanitizeDiagnosticText(value.name || "Error", 80),
      message: sanitizeDiagnosticText(value.message || "Unknown error", MAX_MESSAGE_LENGTH),
      stack: value.stack
        ? sanitizeDiagnosticText(value.stack.split("\n").slice(0, 12).join("\n"), MAX_STACK_LENGTH)
        : undefined,
    };
  }

  return {
    name: "NonErrorRejection",
    message:
      typeof value === "string"
        ? sanitizeDiagnosticText(value, MAX_MESSAGE_LENGTH)
        : "A non-Error value was reported",
    stack: undefined,
  };
};

export const readClientDiagnostics = (): ClientDiagnostic[] => {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? (parsed as ClientDiagnostic[]).slice(-MAX_REPORTS) : [];
  } catch {
    return [];
  }
};

export const reportClientDiagnostic = (
  kind: ClientDiagnosticKind,
  error: unknown,
  detail?: ClientDiagnostic["detail"],
) => {
  const parts = errorParts(error);
  const report: ClientDiagnostic = {
    build: import.meta.env.VITE_BUILD_SHA || "local",
    detail: sanitizeDetail(detail),
    kind,
    message: parts.message,
    name: parts.name,
    path: window.location.pathname,
    stack: parts.stack,
    timestamp: new Date().toISOString(),
    userAgent: window.navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
  };

  try {
    const reports = [...readClientDiagnostics(), report].slice(-MAX_REPORTS);
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  } catch {
    // Diagnostics must never become another application failure.
  }

  const endpoint = import.meta.env.VITE_ERROR_REPORT_ENDPOINT;
  if (endpoint && "sendBeacon" in navigator) {
    const endpointUrl = resolveSameOriginDiagnosticEndpoint(endpoint, window.location.origin);
    if (endpointUrl) {
      try {
        // Keep remote diagnostics inside the deployed origin. This matches the app's
        // restrictive connect-src CSP and prevents a build-time typo from exfiltrating
        // browser details to an unrelated host.
        navigator.sendBeacon(
          endpointUrl,
          new Blob([JSON.stringify(report)], { type: "application/json" }),
        );
      } catch {
        // Remote reporting is optional; the local diagnostic remains available.
      }
    }
  }

  return report;
};

export const copyClientDiagnostics = async () => {
  const payload = JSON.stringify(readClientDiagnostics(), null, 2);
  if (!payload || payload === "[]" || !navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(payload);
    return true;
  } catch {
    return false;
  }
};

const diagnosticSourcePath = (filename: string) => {
  if (!filename) {
    return "unknown";
  }
  try {
    return new URL(filename, window.location.href).pathname;
  } catch {
    return "unparseable";
  }
};

export const installGlobalErrorDiagnostics = () => {
  const handleError = (event: ErrorEvent) => {
    reportClientDiagnostic("unhandled-error", event.error ?? event.message, {
      column: event.colno,
      line: event.lineno,
      source: diagnosticSourcePath(event.filename),
    });
  };
  const handleRejection = (event: PromiseRejectionEvent) => {
    reportClientDiagnostic("unhandled-rejection", event.reason);
  };

  window.addEventListener("error", handleError);
  window.addEventListener("unhandledrejection", handleRejection);

  return () => {
    window.removeEventListener("error", handleError);
    window.removeEventListener("unhandledrejection", handleRejection);
  };
};
