import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { setSentryUser, clearSentryUser } from "@/lib/sentry";

interface UserProfile {
  full_name: string | null;
  avatar_url: string | null;
  organization_id: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profileLoading: boolean;
  profile: UserProfile | null;
  refreshProfile: () => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

const clearTenantSession = () => {
  sessionStorage.removeItem("quantivis_org_id");
  sessionStorage.removeItem("quantivis_workspace_id");
  sessionStorage.removeItem("quantivis_project_id");
};

const clearSupabaseAuthStorage = () => {
  // Clear Supabase JWT tokens from localStorage
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && (key.startsWith("sb-") || key.includes("supabase.auth.token") || key.includes("supabase.auth"))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));

  // Clear any auth-related sessionStorage (rate limiter state, tenant session)
  clearTenantSession();
  sessionStorage.removeItem("quantivis_auth_throttle");

  // Clear PKCE code verifier if present (OAuth PKCE flow)
  sessionStorage.removeItem("supabase-oauth-code-verifier");
};

const isBadJwtError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("bad_jwt") ||
    message.includes("invalid claim") ||
    message.includes("missing sub claim") ||
    message.includes("JWT")
  );
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const deliberateSignOutRef = useRef(false);

  const fetchProfile = useCallback(async (userId: string) => {
    setProfileLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, organization_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("[AuthContext] Failed to fetch profile:", error.message);
        setProfile(null);
        return null;
      }

      const nextProfile = data as UserProfile | null;
      setProfile(nextProfile);
      return nextProfile;
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) await fetchProfile(user.id);
  }, [user?.id, fetchProfile]);

  useEffect(() => {
    // Flag to prevent duplicate profile fetches from race between getSession and onAuthStateChange
    let initialSessionResolved = false;
    let cancelled = false;

    const resetAuthState = () => {
      setSession(null);
      setUser(null);
      setProfile(null);
      clearSentryUser();
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Skip if this is the initial event that duplicates getSession
      if (!initialSessionResolved || cancelled) return;
      // A SIGNED_OUT event the user didn't trigger via the Sign Out button
      // (e.g. the refresh token expired without a successful renewal) was
      // previously silent — no banner, navigation state just vanished. Say
      // so, so the user knows to log back in rather than assuming the app
      // broke.
      if (_event === "SIGNED_OUT" && !deliberateSignOutRef.current) {
        toast.error("Your session ended", { description: "Please sign in again to continue." });
      }
      deliberateSignOutRef.current = false;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setSentryUser(session.user.id, session.user.email);
        setTimeout(() => {
          if (!cancelled) {
            fetchProfile(session.user.id).catch((error: unknown) => {
              console.error("[AuthContext] Failed to refresh profile after auth change:", error instanceof Error ? error.message : error);
            });
          }
        }, 0);
      } else {
        setProfile(null);
        clearSentryUser();
      }
      setLoading(false);
    });

    const hydrateSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        initialSessionResolved = true;

        if (error) throw error;

        // Some stale/corrupt local sessions pass getSession() but fail server validation.
        if (session) {
          const { data: userData, error: userError } = await supabase.auth.getUser();
          if (userError) throw userError;
          if (!userData.user?.id) throw new Error("bad_jwt: invalid claim: missing sub claim");
        }

        if (cancelled) return;
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id);
          setSentryUser(session.user.id, session.user.email);
        } else {
          clearSentryUser();
        }
      } catch (error) {
        if (isBadJwtError(error)) {
          console.warn("[AuthContext] Clearing stale Supabase auth token after bad JWT:", error instanceof Error ? error.message : error);
          clearSupabaseAuthStorage();
          await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        } else {
          console.error("[AuthContext] Failed to hydrate auth session:", error instanceof Error ? error.message : error);
        }
        if (!cancelled) resetAuthState();
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    hydrateSession();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
      },
    });
    if (error) throw error;
  };

  const signIn = async (email: string, password: string) => {
    clearTenantSession();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    deliberateSignOutRef.current = true;
    clearTenantSession();
    setProfile(null);
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, profileLoading, profile, refreshProfile, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};