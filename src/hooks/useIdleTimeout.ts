/**
 * useIdleTimeout
 *
 * Enforces idle session logout based on the org's security policy.
 * Reads session_timeout_minutes from organizations table and signs
 * the user out after that period of inactivity.
 *
 * Events that reset the idle timer: mousemove, keydown, click, touchstart, scroll.
 * On timeout: supabase.auth.signOut() → AuthContext clears state → router redirects to /login.
 *
 * Usage: call once inside ProtectedShell or App — never inside a page component.
 */
import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

const DEFAULT_TIMEOUT_MINUTES = 60;
const WARNING_BEFORE_MS = 2 * 60 * 1000; // show warning 2 minutes before logout
const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "touchstart", "scroll"] as const;

export const useIdleTimeout = () => {
  const { currentOrgId } = useOrganization();
  const { user } = useAuth();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutMsRef = useRef(DEFAULT_TIMEOUT_MINUTES * 60 * 1000);

  // Load org session timeout setting
  useEffect(() => {
    if (!currentOrgId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("organizations")
      .select("session_timeout_minutes")
      .eq("id", currentOrgId)
      .single()
      .then(({ data }: { data: { session_timeout_minutes?: number } | null }) => {
        if (data?.session_timeout_minutes) {
          timeoutMsRef.current = data.session_timeout_minutes * 60 * 1000;
        }
      });
  }, [currentOrgId]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);

    const timeoutMs = timeoutMsRef.current;
    const warningDelay = Math.max(timeoutMs - WARNING_BEFORE_MS, 0);

    // Show a warning before logging out, unless the timeout window is too short for one
    if (warningDelay > 0) {
      warningTimerRef.current = setTimeout(() => {
        toast({
          title: "You'll be signed out soon",
          description: "Your session has been inactive. Move your mouse or click anywhere to stay signed in.",
        });
      }, warningDelay);
    }

    timerRef.current = setTimeout(async () => {
      await supabase.auth.signOut();
    }, timeoutMs);
  }, []);

  useEffect(() => {
    if (!user) return; // only enforce when authenticated

    // Start the timer and attach activity listeners
    resetTimer();
    ACTIVITY_EVENTS.forEach(event =>
      window.addEventListener(event, resetTimer, { passive: true })
    );

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      ACTIVITY_EVENTS.forEach(event =>
        window.removeEventListener(event, resetTimer)
      );
    };
  }, [user, resetTimer]);
};
