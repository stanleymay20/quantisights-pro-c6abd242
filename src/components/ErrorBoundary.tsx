import { Component, ErrorInfo, ReactNode } from "react";
import { reportError } from "@/lib/error-reporter";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error.message);
    console.error("[ErrorBoundary] Component stack:", info.componentStack);
    reportError({
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
      severity: "fatal",
      context: "ErrorBoundary",
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-dvh flex items-center justify-center bg-background px-4">
            <div className="glass-card p-8 max-w-md w-full text-center rounded-xl space-y-4">
              <h2 className="text-[16px] font-semibold tracking-tight mb-2">Something went wrong</h2>
              <p className="text-sm text-muted-foreground">
                An unexpected error occurred. Our team has been notified.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => this.setState({ hasError: false, error: null })}
                  className="px-5 py-2.5 rounded-lg bg-secondary text-foreground text-sm font-medium hover:brightness-110 transition-all"
                >
                  Try Again
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:brightness-110 transition-all"
                >
                  Reload Page
                </button>
              </div>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
