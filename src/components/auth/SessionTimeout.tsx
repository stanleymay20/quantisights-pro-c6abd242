import { useEffect, useRef, useState, useCallback, forwardRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog, AlertDialogAction, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Clock } from "lucide-react";

const INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE_MS = 2 * 60 * 1000; // warn 2 min before

const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart"] as const;

const SessionTimeout = forwardRef<HTMLDivElement>((_, _ref) => {
  const { user, signOut } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(120);
  const logoutTimer = useRef<ReturnType<typeof setTimeout>>();
  const warningTimer = useRef<ReturnType<typeof setTimeout>>();
  const countdownInterval = useRef<ReturnType<typeof setInterval>>();

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
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(countdownInterval.current);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    }, INACTIVITY_LIMIT_MS - WARNING_BEFORE_MS);

    logoutTimer.current = setTimeout(() => {
      signOut();
    }, INACTIVITY_LIMIT_MS);
  }, [user, signOut]);

  useEffect(() => {
    if (!user) return;

    resetTimers();

    const handler = () => {
      if (!showWarning) resetTimers();
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, handler, { passive: true }));

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, handler));
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
