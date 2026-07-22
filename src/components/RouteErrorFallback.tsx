import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  error?: Error | null;
  resetError?: () => void;
}

/**
 * Route-level error fallback — shown when a lazy-loaded page crashes.
 * Offers retry + navigate home, preventing a full app crash.
 */
const RouteErrorFallback = ({ error, resetError }: Props) => {
  const navigate = useNavigate();

  const handleGoHome = useCallback(() => {
    resetError?.();
    navigate("/dashboard");
  }, [navigate, resetError]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-destructive" />
        </div>
        <div className="space-y-2">
          <h2 className="text-[16px] font-semibold text-foreground">This page encountered an error</h2>
          <p className="text-sm text-muted-foreground">
            {error?.message || "An unexpected error occurred while loading this page."}
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" size="sm" onClick={() => resetError?.()}>
            <RotateCcw className="w-4 h-4 mr-1.5" />
            Retry
          </Button>
          <Button size="sm" onClick={handleGoHome}>
            <Home className="w-4 h-4 mr-1.5" />
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RouteErrorFallback;
