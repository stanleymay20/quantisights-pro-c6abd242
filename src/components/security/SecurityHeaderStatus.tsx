import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

type HeaderVerification = "checking" | "verified" | "unverified";

export default function SecurityHeaderStatus() {
  const [status, setStatus] = useState<HeaderVerification>("checking");

  useEffect(() => {
    const verifyHeaders = async () => {
      try {
        const response = await fetch(window.location.href, {
          method: "HEAD",
          cache: "no-store",
          credentials: "same-origin",
        });
        const csp = response.headers.get("content-security-policy") ?? "";
        const frameOptions = response.headers.get("x-frame-options") ?? "";
        const contentTypeOptions = response.headers.get("x-content-type-options") ?? "";
        const referrerPolicy = response.headers.get("referrer-policy") ?? "";
        const framingProtected = csp.includes("frame-ancestors") || Boolean(frameOptions);

        setStatus(
          csp &&
          framingProtected &&
          contentTypeOptions.toLowerCase() === "nosniff" &&
          Boolean(referrerPolicy)
            ? "verified"
            : "unverified",
        );
      } catch {
        setStatus("unverified");
      }
    };

    void verifyHeaders();
  }, []);

  if (status === "checking") return null;

  if (status === "verified") {
    return (
      <Alert className="border-success/30 bg-success/5">
        <CheckCircle2 className="h-4 w-4 text-success" />
        <AlertTitle>Deployment headers observed</AlertTitle>
        <AlertDescription>
          Required security headers were present in the current HTTP response.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="border-warning/40 bg-warning/5">
      <AlertTriangle className="h-4 w-4 text-warning" />
      <AlertTitle>Hosting verification pending</AlertTitle>
      <AlertDescription>
        Security headers not verified on current deployment.
      </AlertDescription>
    </Alert>
  );
}
