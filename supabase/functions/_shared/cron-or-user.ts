/**
 * Dual auth guard: allows either an x-cron-secret (for scheduled jobs) or
 * a verified user JWT whose caller is a member of the requested organization.
 *
 * Returns either { ok: true } to proceed, or { response } to short-circuit
 * the handler with a 401/403 response carrying the right CORS headers.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "./cors.ts";
import { verifyCronSecret } from "./cron-secret.ts";

export async function requireCronOrOrgMember(
  req: Request,
  organizationId: string | undefined,
): Promise<{ ok: true; via: "cron" | "user"; userId?: string } | { ok?: never; response: Response }> {
  const corsHeaders = getCorsHeaders(req);

  // 1) Cron path
  if (req.headers.get("x-cron-secret")) {
    if (verifyCronSecret(req)) return { ok: true, via: "cron" };
    return {
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  // 2) User path — must have org_id and a valid JWT belonging to a member
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ") || !organizationId) {
    return {
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user?.id) {
    return {
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: isMember } = await svc.rpc("is_org_member", {
    _user_id: user.id,
    _org_id: organizationId,
  });
  if (isMember !== true) {
    return {
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  return { ok: true, via: "user", userId: user.id };
}
