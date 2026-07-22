/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Shield, Clock, Lock, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";

interface OrgSecSettings {
  require_mfa: boolean;
  session_timeout_minutes: number;
  min_password_length: number;
  sso_enforced: boolean;
}

const TIMEOUT_OPTIONS = [
  { label: "15 minutes (high security)", value: 15 },
  { label: "30 minutes", value: 30 },
  { label: "1 hour (recommended)", value: 60 },
  { label: "2 hours", value: 120 },
  { label: "4 hours", value: 240 },
  { label: "8 hours (low security)", value: 480 },
];

const PW_LENGTH_OPTIONS = [
  { label: "8 characters (minimum)", value: 8 },
  { label: "10 characters", value: 10 },
  { label: "12 characters (recommended)", value: 12 },
  { label: "16 characters (enterprise)", value: 16 },
];

export const OrgSecuritySettings = () => {
  const { currentOrgId } = useOrganization();
  const perms = usePermissions();
  const orgRole = perms.orgRole;           // ← explicit property access avoids destructure mismatch
  const { toast } = useToast();
  const [settings, setSettings] = useState<OrgSecSettings>({
    require_mfa: false,
    session_timeout_minutes: 60,
    min_password_length: 8,
    sso_enforced: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isAdmin = orgRole === "owner" || orgRole === "admin";

  useEffect(() => {
    if (!currentOrgId) return;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("organizations")
          .select("require_mfa, session_timeout_minutes, min_password_length, sso_enforced")
          .eq("id", currentOrgId)
          .single();
        if (data) setSettings(data as OrgSecSettings);
      } finally {
        setLoading(false);
      }
    })();
  }, [currentOrgId]);

  const handleSave = async () => {
    if (!currentOrgId || !isAdmin) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("organizations")
        .update({
          require_mfa: settings.require_mfa,
          session_timeout_minutes: settings.session_timeout_minutes,
          min_password_length: settings.min_password_length,
          sso_enforced: settings.sso_enforced,
        })
        .eq("id", currentOrgId);

      if (error) throw error;

      // Audit log — cast avoids generated-type overload mismatch
      await (supabase as any).from("audit_log").insert([{
        organization_id: currentOrgId,
        actor_type: "user",
        action_type: "org_security_settings_updated",
        resource_type: "organization",
        resource_id: currentOrgId,
        payload: JSON.parse(JSON.stringify(settings)),
      }]);

      toast({
        title: "Security settings saved",
        description: "Changes take effect on next login for all members.",
      });
    } catch (err: unknown) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-32 animate-pulse bg-muted rounded-lg" />;

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Organisation Security Policy
          </CardTitle>
          {!isAdmin && (
            <Badge variant="outline" className="text-xs">
              View only — owners and admins can edit
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Require MFA */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-border/30">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-muted-foreground" />
              <Label className="font-medium">Require MFA for all members</Label>
              {settings.require_mfa && (
                <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">Enforced</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Members without an authenticator app are blocked until they enrol.
              {settings.require_mfa && (
                <span className="block mt-0.5 text-warning">
                  ⚠ Active — unenrolled members cannot log in.
                </span>
              )}
            </p>
          </div>
          <Switch
            checked={settings.require_mfa}
            onCheckedChange={v => setSettings(s => ({ ...s, require_mfa: v }))}
            disabled={!isAdmin}
          />
        </div>

        {/* Session timeout */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-border/30">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <Label className="font-medium">Session idle timeout</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Members are signed out after this period of inactivity.
            </p>
          </div>
          <Select
            value={String(settings.session_timeout_minutes)}
            onValueChange={v => setSettings(s => ({ ...s, session_timeout_minutes: Number(v) }))}
            disabled={!isAdmin}
          >
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEOUT_OPTIONS.map(o => (
                <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Minimum password length */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-border/30">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-muted-foreground" />
              <Label className="font-medium">Minimum password length</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Enterprise security questionnaires typically require ≥12 characters.
            </p>
          </div>
          <Select
            value={String(settings.min_password_length)}
            onValueChange={v => setSettings(s => ({ ...s, min_password_length: Number(v) }))}
            disabled={!isAdmin}
          >
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PW_LENGTH_OPTIONS.map(o => (
                <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* SSO enforcement */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
              <Label className="font-medium">Enforce SSO-only login</Label>
              <Badge variant="outline" className="text-[10px]">Requires SAML configured</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              When enabled, members must sign in via your identity provider.
            </p>
          </div>
          <Switch
            checked={settings.sso_enforced}
            onCheckedChange={v => setSettings(s => ({ ...s, sso_enforced: v }))}
            disabled={!isAdmin}
          />
        </div>

        {isAdmin && (
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Saving…" : "Save security policy"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
