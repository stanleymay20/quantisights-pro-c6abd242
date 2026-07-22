import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSentryStatus, captureError } from "@/lib/sentry";
import { getPostHogStatus, track } from "@/lib/analytics";
import { usePermissions } from "@/hooks/usePermissions";

export default function ObservabilityCheck() {
  const [, refresh] = useState(0);
  const [sentryCaptureAttempted, setSentryCaptureAttempted] = useState(false);
  const [posthogCaptureAttempted, setPosthogCaptureAttempted] = useState(false);
  const { orgRole, isLoading } = usePermissions();
  const sentry = getSentryStatus();
  const posthog = getPostHogStatus();
  const canCapture = import.meta.env.DEV || orgRole === "owner" || orgRole === "admin";

  const captureSentryDiagnostic = () => {
    setSentryCaptureAttempted(true);
    captureError(new Error("quantivis_observability_diagnostic"), { diagnostic: true });
  };

  const capturePosthogDiagnostic = () => {
    setPosthogCaptureAttempted(true);
    track("quantivis_observability_diagnostic", { diagnostic: true });
  };

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Observability Check</h1>
      <p className="text-sm text-muted-foreground">
        Internal diagnostic state only. Successful ingestion must be confirmed in the provider console.
      </p>
      <p className="text-sm text-warning">Provider ingestion not verified.</p>
      <Card><CardHeader><CardTitle>Sentry</CardTitle></CardHeader><CardContent className="text-sm space-y-2">
        <p>Configured: {String(sentry.configured)}</p>
        <p>Initialized: {String(sentry.initialized)}</p>
        <p>Environment: {sentry.environment}</p>
        <p>Release: {sentry.release}</p>
        {canCapture && !isLoading && (
          <Button onClick={captureSentryDiagnostic}>Send Sentry diagnostic</Button>
        )}
        {sentryCaptureAttempted && <p>Capture attempted. Confirm receipt in the Sentry provider console.</p>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>PostHog</CardTitle></CardHeader><CardContent className="text-sm space-y-2">
        <p>Configured: {String(posthog.configured)}</p>
        <p>Initialized: {String(posthog.initialized)}</p>
        <p>Loaded: {String(posthog.loaded)}</p>
        <p>Host: {posthog.host}</p>
        <p>Consent: {posthog.consent}</p>
        <div className="flex gap-2">
          {canCapture && !isLoading && (
            <Button onClick={capturePosthogDiagnostic}>Send PostHog diagnostic</Button>
          )}
          <Button variant="outline" onClick={() => refresh((value) => value + 1)}>Refresh state</Button>
        </div>
        {posthogCaptureAttempted && <p>Capture attempted. Confirm receipt in the PostHog provider console.</p>}
      </CardContent></Card>
    </main>
  );
}
