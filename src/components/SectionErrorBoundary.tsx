import { Component, ErrorInfo, ReactNode } from "react";
import { reportError } from "@/lib/error-reporter";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  sectionName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Lightweight ErrorBoundary for dashboard sections.
 * Unlike the global ErrorBoundary, this renders an inline fallback
 * so the rest of the page remains functional.
 */
class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[SectionErrorBoundary:${this.props.sectionName ?? "unknown"}]`, error.message);
    reportError({
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
      severity: "error",
      context: `SectionErrorBoundary:${this.props.sectionName ?? "unknown"}`,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="w-6 h-6 text-destructive/70" />
          <p className="text-sm font-medium text-foreground">
            {this.props.sectionName ? `${this.props.sectionName} encountered an error` : "Something went wrong"}
          </p>
          <p className="text-xs text-muted-foreground max-w-sm">
            This section failed to render. The rest of the page is unaffected.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-medium hover:brightness-110 transition-all mt-1"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default SectionErrorBoundary;
