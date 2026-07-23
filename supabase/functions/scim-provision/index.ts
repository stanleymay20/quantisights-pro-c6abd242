import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

// deno-lint-ignore no-explicit-any
const corsHeaders: any = { "Access-Control-Allow-Origin": "*" };

/**
 * SCIM 2.0 Provisioning Endpoint
 * Handles user provisioning/deprovisioning from enterprise IdPs (Okta, Entra ID, etc.)
 * 
 * Endpoints:
 *   GET    /scim-provision/Users        - List users
 *   GET    /scim-provision/Users/:id    - Get user
 *   POST   /scim-provision/Users        - Create user
 *   PATCH  /scim-provision/Users/:id    - Update user
 *   DELETE /scim-provision/Users/:id    - Deactivate user
 */

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

async function authenticateSCIM(
  req: Request,
  serviceClient: any
): Promise<{ orgId: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "Unauthorized",
        status: "401",
      }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/scim+json" } }
    );
  }

  const token = authHeader.replace("Bearer ", "");
  const tokenHash = await hashToken(token);

  const { data: scimToken, error } = await serviceClient
    .from("scim_tokens")
    .select("organization_id")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .single();

  if (error || !scimToken) {
    return new Response(
      JSON.stringify({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "Invalid SCIM token",
        status: "401",
      }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/scim+json" } }
    );
  }

  // Update last_used_at
  await serviceClient
    .from("scim_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token_hash", tokenHash);

  return { orgId: scimToken.organization_id };
}

function userToSCIM(profile: any, baseUrl: string): any {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: profile.user_id,
    userName: profile.user_id,
    name: {
      formatted: profile.full_name || "",
    },
    displayName: profile.full_name || "",
    active: true,
    meta: {
      resourceType: "User",
      created: profile.created_at || new Date().toISOString(),
      location: `${baseUrl}/Users/${profile.user_id}`,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const serviceClient = createClient(supabaseUrl, serviceKey);

  const authResult = await authenticateSCIM(req, serviceClient);
  if (authResult instanceof Response) return authResult;

  const { orgId } = authResult;
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/scim-provision\/?/, "");
  const baseUrl = `${url.origin}/functions/v1/scim-provision`;

  try {
    // GET /Users - List users
    if (req.method === "GET" && (path === "Users" || path === "Users/")) {
      const startIndex = parseInt(url.searchParams.get("startIndex") || "1");
      const count = parseInt(url.searchParams.get("count") || "100");
      const filter = url.searchParams.get("filter");

      let query = serviceClient
        .from("profiles")
        .select("user_id, full_name, avatar_url, organization_id, created_at", { count: "exact" })
        .eq("organization_id", orgId);

      // Handle SCIM filter: userName eq "value"
      if (filter) {
        const match = filter.match(/userName\s+eq\s+"([^"]+)"/);
        if (match) {
          query = query.eq("user_id", match[1]);
        }
      }

      const { data: profiles, count: total } = await query
        .range(startIndex - 1, startIndex - 1 + count - 1);

      return new Response(
        JSON.stringify({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
          totalResults: total || 0,
          startIndex,
          itemsPerPage: count,
          Resources: (profiles || []).map((p: any) => userToSCIM(p, baseUrl)),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/scim+json" } }
      );
    }

    // GET /Users/:id - Get specific user
    if (req.method === "GET" && path.startsWith("Users/")) {
      const userId = path.replace("Users/", "");
      const { data: profile, error } = await serviceClient
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .eq("organization_id", orgId)
        .single();

      if (error || !profile) {
        return new Response(
          JSON.stringify({
            schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
            detail: "User not found",
            status: "404",
          }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/scim+json" } }
        );
      }

      return new Response(JSON.stringify(userToSCIM(profile, baseUrl)), {
        headers: { ...corsHeaders, "Content-Type": "application/scim+json" },
      });
    }

    // POST /Users - Create/provision user
    if (req.method === "POST" && (path === "Users" || path === "Users/")) {
      const body = await req.json();
      const email = body.userName || body.emails?.[0]?.value;
      const displayName = body.displayName || body.name?.formatted || email;

      if (!email) {
        return new Response(
          JSON.stringify({
            schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
            detail: "userName (email) is required",
            status: "400",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/scim+json" } }
        );
      }

      // Create user via Supabase Admin API
      const { data: newUser, error: createError } = await serviceClient.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: displayName, scim_provisioned: true },
      });

      if (createError) {
        // User might already exist - try to find and add to org
        const { data: existingUsers } = await serviceClient.auth.admin.listUsers();
        const existing = existingUsers?.users?.find((u: any) => u.email === email);
        if (existing) {
          // Add to organization
          await serviceClient.from("organization_members").upsert({
            organization_id: orgId,
            user_id: existing.id,
            role: "viewer",
          }, { onConflict: "organization_id,user_id" });

          // Log SCIM event
          await serviceClient.from("auth_events").insert({
            user_id: existing.id,
            organization_id: orgId,
            event_type: "scim_provision",
            metadata: { email, action: "existing_user_added" },
          });

          const { data: profile } = await serviceClient
            .from("profiles")
            .select("*")
            .eq("user_id", existing.id)
            .single();

          return new Response(JSON.stringify(userToSCIM(profile || { user_id: existing.id, full_name: displayName }, baseUrl)), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/scim+json" },
          });
        }

        return new Response(
          JSON.stringify({
            schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
            detail: createError.message,
            status: "400",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/scim+json" } }
        );
      }

      // The handle_new_user trigger creates profile + default org.
      // We need to add the user to the SCIM org if different.
      if (newUser?.user) {
        await serviceClient.from("organization_members").upsert({
          organization_id: orgId,
          user_id: newUser.user.id,
          role: "viewer",
        }, { onConflict: "organization_id,user_id" });

        await serviceClient.from("auth_events").insert({
          user_id: newUser.user.id,
          organization_id: orgId,
          event_type: "scim_provision",
          metadata: { email, action: "new_user_created" },
        });
      }

      return new Response(
        JSON.stringify(userToSCIM({ user_id: newUser?.user?.id, full_name: displayName }, baseUrl)),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/scim+json" } }
      );
    }

    // PATCH /Users/:id - Update user
    if (req.method === "PATCH" && path.startsWith("Users/")) {
      const userId = path.replace("Users/", "");
      const body = await req.json();

      // Handle SCIM PATCH operations
      const ops = body.Operations || [];
      for (const op of ops) {
        if (op.op === "replace" && op.path === "active" && op.value === false) {
          // Deactivate: remove from org
          await serviceClient
            .from("organization_members")
            .delete()
            .eq("user_id", userId)
            .eq("organization_id", orgId);

          await serviceClient.from("auth_events").insert({
            user_id: userId,
            organization_id: orgId,
            event_type: "scim_deprovision",
            metadata: { action: "deactivated_via_patch" },
          });
        }

        if (op.op === "replace" && op.path === "displayName") {
          await serviceClient
            .from("profiles")
            .update({ full_name: op.value })
            .eq("user_id", userId)
            .eq("organization_id", orgId);
        }
      }

      const { data: profile } = await serviceClient
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      return new Response(JSON.stringify(userToSCIM(profile || { user_id: userId }, baseUrl)), {
        headers: { ...corsHeaders, "Content-Type": "application/scim+json" },
      });
    }

    // DELETE /Users/:id - Deprovision user
    if (req.method === "DELETE" && path.startsWith("Users/")) {
      const userId = path.replace("Users/", "");

      // Remove from organization (don't delete the user entirely)
      await serviceClient
        .from("organization_members")
        .delete()
        .eq("user_id", userId)
        .eq("organization_id", orgId);

      await serviceClient.from("auth_events").insert({
        user_id: userId,
        organization_id: orgId,
        event_type: "scim_deprovision",
        metadata: { action: "deleted" },
      });

      return new Response(null, { status: 204, headers: corsHeaders });
    }

    return new Response(
      JSON.stringify({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "Not found",
        status: "404",
      }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/scim+json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "Internal server error",
        status: "500",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/scim+json" } }
    );
  }
});
