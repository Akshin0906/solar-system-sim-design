import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportClientDiagnostic } from "../observability/clientDiagnostics";

type ErrorBoundaryProps = {
  children: ReactNode;
  // Render prop so callers can offer recovery. `reset` clears the caught error and
  // re-renders the children — useful when the failure was transient.
  fallback?: (reset: () => void) => ReactNode;
  onError?: (error: Error) => void;
  onReset?: () => void;
};

type ErrorBoundaryState = {
  error: Error | null;
};

// A single reusable error boundary. The app previously had a sophisticated recovery
// path for WebGL context loss but nothing for an ordinary render-time throw — any
// exception in a panel or the scene unmounted the whole tree to a blank page with no
// recovery and no signal. This catches those, surfaces a diagnostic, and renders a
// recoverable fallback. Works both in the DOM tree and inside the R3F <Canvas>
// reconciler (React propagates render-phase errors to the nearest boundary either way;
// errors thrown asynchronously inside useFrame are not catchable here, as with any
// React boundary).
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep a privacy-conscious, copyable diagnostic locally. Deployments can additionally
    // provide VITE_ERROR_REPORT_ENDPOINT to receive the same structured payload.
    console.error("Unhandled render error:", error, info.componentStack);
    reportClientDiagnostic("render-error", error, {
      componentStack: info.componentStack?.slice(0, 1_200) ?? null,
    });
    this.props.onError?.(error);
  }

  reset = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return this.props.fallback ? this.props.fallback(this.reset) : null;
    }

    return this.props.children;
  }
}
