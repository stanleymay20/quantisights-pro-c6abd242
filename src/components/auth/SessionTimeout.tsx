import { useEffect, useRef, useState, useCallback, forwardRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Clock } from "lucide-react";

const DEFAULT_SESSION_TIMEOUT_MINUTES = 30;
const SAFE_POLICY_ERROR_TIMEOUT_MINUTES = 15;
const MIN_SESSION_TIMEOUT_MINUTES = 15;
const MAX_SESSION_TIMEOUT_MINUTES = 480;
const WARNING_BEFORE_MS = 2 * 60 * 1000; // warn 2 min before

const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart"] as const;

const clampSessionTimeout = (minutes: number) =>
  Math.min(MAX_SESSION_TIMEOUT_MINUTES, Math.max(MIN_SESSION_TIMEOUT_MINUTES, minutes));

const SessionTimeout = forwardRef<HTMLDivElement>((_, _ref) => {
  const { user, signOut } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(120);
  const [inactivityLimitMs, setInactivityLimitMs] = useState(
    DEFAULT_SESSION_TIMEOUT_MINUTES * 60 * 1000,
  );
  const logoutTimer = useRef<ReturnType<typeof setTimeout>>();
  const warningTimer = useRef<ReturnType<typeof setTimeout>>();
  const countdownInterval = useRef<ReturnType<typeof setInterval>>();

  // The database is the source of truth for enterprise session policy. If the
  // policy lookup itself fails, use the strictest supported timeout rather than
  // silently falling back to a longer session.
  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setInactivityLimitMs(DEFAULT_SESSION_TIMEOUT_MINUTES * 60 * 1000);
      return () => {
        cancelled = true;
      };
    }

    const loadSessionPolicy = async () => {
      try {
        const { data, error } = await supabase
          .rpc("get_my_org_security_settings")
          .maybeSingle();

        if (error) {
          console.error("[SessionTimeout] Security policy lookup failed:", error);
          if (!cancelled) {
            setInactivityLimitMs(SAFE_POLICY_ERROR_TIMEOUT_MINUTES * 60 * 1000);
          }
          return;
        }

        const configured = Number(data?.session_timeout_minutes);
        const minutes = Number.isFinite(configured)
          ? clampSessionTimeout(configured)
          : DEFAULT_SESSION_TIMEOUT_MINUTES;

        if (!cancelled) setInactivityLimitMs(minutes * 60 * 1000);
      } catch (error: unknown) {
        console.error("[SessionTimeout] Security policy check threw:", error instanceof Error ? error.message : error);
        if (!cancelled) {
          setInactivityLimitMs(SAFE_POLICY_ERROR_TIMEOUT_MINUTES * 60 * 1000);
        }
      }
    };

    void loadSessionPolicy();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const resetTimers = useCallback(() => {
    if (!user) return;
    setShowWarning(false);

    clearTimeout(logoutTimer.current);
    clearTimeout(warningTimer.current);
    clearInterval(countdownInterval.current);

    warningTimer.current = setTimeout(() => {
      setShowWarning(true);
      setCountdown(Math.floor(WARNING_BEFORE_MS / 1000));
      countdownInterval.current = setInterval(() => {
        setCountdown((current) => {
          if (current <= 1) {
            clearInterval(countdownInterval.current);
            return 0;
          }
          return current - 1;
        });
      }, 1000);
    }, inactivityLimitMs - WARNING_BEFORE_MS);

    logoutTimer.current = setTimeout(() => {
      void signOut().catch((error: unknown) => {
        // AuthContext still clears local credentials even when remote session
        // revocation fails. Log the remote failure for operations visibility.
        console.error("[SessionTimeout] Remote sign-out failed after idle timeout:", error instanceof Error ? error.message : error);
      });
    }, inactivityLimitMs);
  }, [user, signOut, inactivityLimitMs]);

  useEffect(() => {
    if (!user) return;

    resetTimers();

    const handler = () => {
      if (!showWarning) resetTimers();
    };

    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, handler, { passive: true }));

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, handler));
      clearTimeout(logoutTimer.current);
      clearTimeout(warningTimer.current);
      clearInterval(countdownInterval.current);
    };
  }, [user, resetTimers, showWarning]);

  const handleStayLoggedIn = () => {
    resetTimers();
  };

  if (!user) return null;

  return (
    <AlertDialog open={showWarning}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-destructive" />
            Session Expiring
          </AlertDialogTitle>
          <AlertDialogDescription>
            You've been inactive. Your session will end in{" "}
            <span className="font-bold text-foreground">{countdown}s</span> for security.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={handleStayLoggedIn}>Stay Logged In</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});

SessionTimeout.displayName = "SessionTimeout";

export default SessionTimeout;
