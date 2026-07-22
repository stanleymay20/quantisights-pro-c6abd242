import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("Not authenticated");

    const body = await req.json();
    const { email, role, organization_id } = body;
    if (!email || !organization_id) throw new Error("email and organization_id required");

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (typeof email !== "string" || !emailRegex.test(email) || email.length > 255) {
      throw new Error("Invalid email format");
    }

    // Validate role is an allowed value
    const allowedRoles = ["owner", "admin", "analyst", "executive", "viewer"];
    const sanitizedRole = role && allowedRoles.includes(role) ? role : "viewer";

    // Validate organization_id is UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof organization_id !== "string" || !uuidRegex.test(organization_id)) {
      throw new Error("Invalid organization_id format");
    }

    // Verify caller is admin/owner
    const { data: callerRole } = await supabase.rpc("get_user_org_role", {
      _user_id: user.id,
      _org_id: organization_id,
    });

    if (!callerRole || !["owner", "admin"].includes(callerRole)) {
      throw new Error("Insufficient permissions");
    }

    // Check if already a member
    const { data: existingMember } = await supabase
      .from("organization_members")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("user_id", (await supabase.from("profiles").select("user_id").eq("full_name", email).maybeSingle()).data?.user_id ?? "00000000-0000-0000-0000-000000000000")
      .maybeSingle();

    // Check existing pending invitation
    const { data: existingInvite } = await supabase
      .from("team_invitations")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle();

    if (existingInvite) {
      throw new Error("Invitation already pending for this email");
    }

    // Get org name
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", organization_id)
      .single();

    // Create invitation
    const { data: invitation, error: invError } = await supabase
      .from("team_invitations")
      .insert({
        organization_id,
        email: email.toLowerCase().trim(),
        role: sanitizedRole,
        invited_by: user.id,
      })
      .select("id, token")
      .single();

    if (invError) throw new Error(`Failed to create invitation: ${invError.message}`);

    // Send email via Resend
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@quantivis.com";

    if (resendKey) {
      const rawOrigin = req.headers.get("origin") || "https://quantisights-pro.lovable.app";
      // Validate origin against allowlist to prevent open redirect
      const allowedOrigins = [
        "https://quantisights-pro.lovable.app",
        "https://quantivis.com",
        "http://localhost:5173",
        "http://localhost:8080",
      ];
      const origin = allowedOrigins.find(o => rawOrigin.startsWith(o)) || "https://quantisights-pro.lovable.app";
      const inviteUrl = `${origin}/accept-invite?token=${invitation.token}`;

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject: `You've been invited to ${org?.name || "Quantivis"}`,
          html: `
            <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <h1 style="color: #0ea5e9; font-size: 24px;">You're Invited</h1>
              <p style="color: #94a3b8; font-size: 16px;">
                ${user.email} has invited you to join <strong>${org?.name || "their organization"}</strong> on Quantivis as a <strong>${sanitizedRole}</strong>.
              </p>
              <a href="${inviteUrl}" style="display: inline-block; background: #0ea5e9; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px;">
                Accept Invitation
              </a>
              <p style="color: #64748b; font-size: 13px; margin-top: 30px;">
                This invitation expires in 7 days.
              </p>
            </div>
          `,
        }),
      });
    }

    return new Response(
      JSON.stringify({ success: true, invitation_id: invitation.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error instanceof Error ? error.message : String(error)) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
