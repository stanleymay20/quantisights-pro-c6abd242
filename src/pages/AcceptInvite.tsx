import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

const AcceptInvite = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "login_required">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setStatus("login_required");
      return;
    }

    if (!token) {
      setStatus("error");
      setMessage("Invalid invitation link");
      return;
    }

    const accept = async () => {
      try {
        const { data, error } = await supabase.rpc("accept_invitation", { _token: token });
        if (error) throw error;

        const result = data as Record<string, unknown> | null;
        if (result?.error) {
          setStatus("error");
          setMessage(result.error as string);
        } else {
          setStatus("success");
          setMessage((result?.message as string) || "You have joined the organization!");
        }
      } catch (err: unknown) {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Unknown error");
      }
    };

    accept();
  }, [user, authLoading, token]);

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center py-12 gap-4">
          {status === "loading" && (
            <>
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
              <p className="text-muted-foreground">Accepting invitation...</p>
            </>
          )}

          {status === "login_required" && (
            <>
              <XCircle className="w-12 h-12 text-warning" />
              <h2 className="text-[16px] font-semibold">Login Required</h2>
              <p className="text-muted-foreground text-center">
                Please log in or create an account to accept this invitation.
              </p>
              <Button onClick={() => navigate(`/login?redirect=/accept-invite?token=${token}`)}>
                Go to Login
              </Button>
            </>
          )}

          {status === "success" && (
            <>
              <CheckCircle2 className="w-12 h-12 text-success" />
              <h2 className="text-[16px] font-semibold">Welcome!</h2>
              <p className="text-muted-foreground text-center">{message}</p>
              <Button onClick={() => navigate("/dashboard")}>Go to Dashboard</Button>
            </>
          )}

          {status === "error" && (
            <>
              <XCircle className="w-12 h-12 text-destructive" />
              <h2 className="text-[16px] font-semibold">Error</h2>
              <p className="text-muted-foreground text-center">{message}</p>
              <Button variant="outline" onClick={() => navigate("/")}>
                Go Home
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AcceptInvite;
