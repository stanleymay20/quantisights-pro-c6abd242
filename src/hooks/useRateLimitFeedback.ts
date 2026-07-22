import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

interface RateLimitState {
  isThrottled: boolean;
  retryAfter: number | null;
  remainingCooldown: number;
}

/**
 * Wraps an async function with rate-limit detection and user feedback.
 * When a 429 or quota error is returned, shows a toast and tracks cooldown.
 */
export function useRateLimitFeedback() {
  const { toast } = useToast();
  const [state, setState] = useState<RateLimitState>({
    isThrottled: false,
    retryAfter: null,
    remainingCooldown: 0,
  });

  const handleError = useCallback(
    (error: unknown): boolean => {
      const message =
        error instanceof Error ? error.message : String(error ?? "");
      const isRateLimit =
        message.includes("429") ||
        message.toLowerCase().includes("rate limit") ||
        message.toLowerCase().includes("quota exceeded") ||
        message.toLowerCase().includes("too many requests");

      if (isRateLimit) {
        // Extract retry-after seconds from message if present
        const retryMatch = message.match(/(\d+)\s*second/i);
        const retryAfter = retryMatch ? parseInt(retryMatch[1], 10) : 60;

        setState({ isThrottled: true, retryAfter, remainingCooldown: retryAfter });

        toast({
          title: "Rate limit reached",
          description: `Too many requests. Please wait ${retryAfter}s before trying again.`,
          variant: "destructive",
        });

        // Countdown
        const interval = setInterval(() => {
          setState((s) => {
            const next = s.remainingCooldown - 1;
            if (next <= 0) {
              clearInterval(interval);
              return { isThrottled: false, retryAfter: null, remainingCooldown: 0 };
            }
            return { ...s, remainingCooldown: next };
          });
        }, 1000);

        return true; // was rate limited
      }

      return false; // not a rate limit error
    },
    [toast]
  );

  const guardedCall = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T | null> => {
      if (state.isThrottled) {
        toast({
          title: "Please wait",
          description: `Rate limit cooldown: ${state.remainingCooldown}s remaining.`,
        });
        return null;
      }

      try {
        return await fn();
      } catch (error) {
        if (!handleError(error)) throw error;
        return null;
      }
    },
    [state.isThrottled, state.remainingCooldown, handleError, toast]
  );

  return {
    ...state,
    guardedCall,
    handleError,
  };
}
