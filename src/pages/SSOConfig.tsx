import { useState, useEffect } from "react";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useOrganization } from "@/hooks/useOrganization";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Shield, Key, FileText, Lock, Info, Copy, CheckCircle2, AlertTriangle,
} from "lucide-react";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

// Schema-gap: sso_configs table exists in DB but is not in the auto-generated types.
// Define a local interface until schema generation catches up.
interface SSOConfigRow {
  id: string;
  organization_id: string;
  provider_type: string;
  idp_entity_id: string | null;
  idp_sso_url: string | null;
  idp_certificate: string | null;
  idp_metadata_url: string | null;
  attribute_mapping: Record<string, string> | null;
  enforce_sso: boolean;
  allowed_domains: string[] | null;
  auto_provision: boolean;
  deactivate_on_removal: boolean;
  is_active: boolean;
}

const SSOConfig = () => {
  const { currentOrgId } = useOrganization();
  const { toast } = useToast();
  
  const [samlEnabled, setSamlEnabled] = useState(false);
  const [idpEntityId, setIdpEntityId] = useState("");
  const [idpSsoUrl, setIdpSsoUrl] = useState("");
  const [idpCertificate, setIdpCertificate] = useState("");
  const [idpMetadataUrl, setIdpMetadataUrl] = useState("");
  const [attributeMapping, setAttributeMapping] = useState({
    email: "email",
    firstName: "first_name",
    lastName: "last_name",
    role: "role",
  });
  const [enforceSSO, setEnforceSSO] = useState(false);
  const [allowedDomains, setAllowedDomains] = useState("");
  const [autoProvision, setAutoProvision] = useState(true);
  const [deactivateOnRemoval, setDeactivateOnRemoval] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [existingConfig, setExistingConfig] = useState<SSOConfigRow | null>(null);

  const spEntityId = `${window.location.origin}/auth/saml/${currentOrgId}`;
  const spAcsUrl = `${window.location.origin}/auth/saml/callback`;
  const spMetadataUrl = `${window.location.origin}/auth/saml/metadata/${currentOrgId}`;

  // Load existing SSO config
  useEffect(() => {
    if (!currentOrgId) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("sso_configs")
        .select("*")
        .eq("organization_id", currentOrgId)
        .eq("provider_type", "saml")
        .maybeSingle();
      
      if (data) {
        const d = data as unknown as SSOConfigRow;
        setExistingConfig(d);
        setSamlEnabled(d.is_active);
        setIdpEntityId(d.idp_entity_id || "");
        setIdpSsoUrl(d.idp_sso_url || "");
        setIdpCertificate(d.idp_certificate || "");
        setIdpMetadataUrl(d.idp_metadata_url || "");
        setEnforceSSO(d.enforce_sso);
        setAutoProvision(d.auto_provision);
        setDeactivateOnRemoval(d.deactivate_on_removal);
        setAllowedDomains((d.allowed_domains || []).join(", "));
        if (d.attribute_mapping) setAttributeMapping(d.attribute_mapping as typeof attributeMapping);
      }
      setLoading(false);
    };
    load();
  }, [currentOrgId]);

  const handleSave = async () => {
    if (!currentOrgId) return;
    setSaving(true);
    try {
      const payload = {
        organization_id: currentOrgId,
        provider_type: "saml",
        idp_entity_id: idpEntityId || null,
        idp_sso_url: idpSsoUrl || null,
        idp_certificate: idpCertificate || null,
        idp_metadata_url: idpMetadataUrl || null,
        attribute_mapping: attributeMapping,
        enforce_sso: enforceSSO,
        allowed_domains: allowedDomains.split(",").map(d => d.trim()).filter(Boolean),
        auto_provision: autoProvision,
        deactivate_on_removal: deactivateOnRemoval,
        is_active: samlEnabled,
      };

      if (existingConfig) {
        const { error } = await supabase
          .from("sso_configs")
          .update(payload)
          .eq("id", existingConfig.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("sso_configs")
          .insert(payload);
        if (error) throw error;
      }

      // Audit trail
      await supabase.from("audit_log").insert({
        organization_id: currentOrgId,
        actor_type: "user",
        action_type: "sso_config_updated",
        resource_type: "sso_config",
        resource_id: currentOrgId,
        payload: { saml_enabled: samlEnabled, enforce_sso: enforceSSO },
      });

      toast({ title: "SSO Configuration Saved", description: samlEnabled ? "SAML SSO is now active." : "Configuration saved (SSO inactive)." });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied to clipboard` });
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse text-muted-foreground">Loading SSO configuration...</div>
      </div>
    );
  }

  return (
    <SectionErrorBoundary sectionName="SSO Config">
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <SidebarMobileToggle />
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            SSO / SAML Configuration
          </h1>
          <p className="text-sm text-muted-foreground">
            Enterprise Single Sign-On for your organization
          </p>
        </div>
        <Badge variant="outline" className="ml-auto bg-accent/10 text-accent-foreground border-accent/20">
          Enterprise Feature
        </Badge>
      </div>

      {/* Status Banner */}
      <Card className={samlEnabled ? "border-accent/30 bg-accent/5" : "border-primary/20 bg-primary/5"}>
        <CardContent className="p-4 flex items-start gap-3">
          {samlEnabled ? (
            <CheckCircle2 className="w-5 h-5 text-accent mt-0.5 shrink-0" />
          ) : (
            <Info className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          )}
          <div>
            <p className="text-sm font-medium">
              {samlEnabled ? "SSO Active" : "SSO Not Configured"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {samlEnabled 
                ? `SAML SSO is active for domains: ${allowedDomains || "none configured"}. ${enforceSSO ? "Password login is disabled." : "Password login remains available as fallback."}`
                : "Configure your SAML 2.0 identity provider below. Supported: Okta, Azure AD, OneLogin, Google Workspace, PingIdentity."
              }
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="configure">
        <TabsList>
          <TabsTrigger value="configure" className="gap-1.5"><Key className="w-3.5 h-3.5" /> Configure IdP</TabsTrigger>
          <TabsTrigger value="sp-metadata" className="gap-1.5"><FileText className="w-3.5 h-3.5" /> SP Metadata</TabsTrigger>
          <TabsTrigger value="policies" className="gap-1.5"><Lock className="w-3.5 h-3.5" /> Policies</TabsTrigger>
        </TabsList>

        <TabsContent value="configure" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Identity Provider Configuration</CardTitle>
              <CardDescription>Enter your SAML 2.0 identity provider details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch checked={samlEnabled} onCheckedChange={setSamlEnabled} />
                <Label>Enable SAML SSO</Label>
              </div>

              <div>
                <Label>IdP Metadata URL (recommended)</Label>
                <Input 
                  value={idpMetadataUrl} 
                  onChange={e => setIdpMetadataUrl(e.target.value)}
                  placeholder="https://your-idp.com/app/metadata"
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  If provided, other fields will be auto-populated from metadata.
                </p>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3 text-muted-foreground">Or configure manually:</p>
                <div className="space-y-4">
                  <div>
                    <Label>IdP Entity ID (Issuer)</Label>
                    <Input 
                      value={idpEntityId}
                      onChange={e => setIdpEntityId(e.target.value)}
                      placeholder="https://your-idp.com/entity-id"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label>IdP SSO URL</Label>
                    <Input 
                      value={idpSsoUrl}
                      onChange={e => setIdpSsoUrl(e.target.value)}
                      placeholder="https://your-idp.com/sso/saml"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label>IdP X.509 Certificate</Label>
                    <Textarea 
                      value={idpCertificate}
                      onChange={e => setIdpCertificate(e.target.value)}
                      placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                      className="mt-1.5 font-mono text-xs"
                      rows={6}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3">Attribute Mapping</p>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(attributeMapping).map(([key, value]) => (
                    <div key={key}>
                      <Label className="text-xs capitalize">{key.replace(/([A-Z])/g, " $1")}</Label>
                      <Input 
                        value={value}
                        onChange={e => setAttributeMapping(prev => ({ ...prev, [key]: e.target.value }))}
                        className="mt-1"
                        placeholder={`SAML attribute for ${key}`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <Button onClick={handleSave} disabled={saving} className="w-full mt-4">
                {saving ? "Saving..." : "Save SSO Configuration"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sp-metadata" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Service Provider Metadata</CardTitle>
              <CardDescription>
                Provide these values to your identity provider administrator
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "SP Entity ID (Audience URI)", value: spEntityId },
                { label: "Assertion Consumer Service (ACS) URL", value: spAcsUrl },
                { label: "SP Metadata URL", value: spMetadataUrl },
              ].map(({ label, value }) => (
                <div key={label} className="p-3 rounded-lg border bg-muted/30">
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-xs bg-background px-2 py-1 rounded border flex-1 overflow-auto">
                      {value}
                    </code>
                    <Button size="sm" variant="ghost" onClick={() => copyToClipboard(value, label)}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}

              <div className="p-3 rounded-lg border bg-muted/30">
                <Label className="text-xs text-muted-foreground">Name ID Format</Label>
                <code className="block text-xs mt-1">urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</code>
              </div>

              <div className="p-3 rounded-lg border bg-muted/30">
                <Label className="text-xs text-muted-foreground">Required SAML Attributes</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {["email (required)", "first_name", "last_name", "role"].map(attr => (
                    <code key={attr} className="text-xs bg-background px-2 py-1 rounded border">{attr}</code>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policies" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">SSO Policies</CardTitle>
              <CardDescription>Configure enforcement and domain restrictions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="text-sm font-medium">Enforce SSO</p>
                  <p className="text-xs text-muted-foreground">
                    When enabled, email/password login is disabled. All users must authenticate via SSO.
                  </p>
                </div>
                <Switch checked={enforceSSO} onCheckedChange={setEnforceSSO} />
              </div>

              <div>
                <Label>Allowed Email Domains</Label>
                <Input 
                  value={allowedDomains}
                  onChange={e => setAllowedDomains(e.target.value)}
                  placeholder="company.com, subsidiary.com"
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Comma-separated. Only users with these email domains can authenticate via SSO.
                </p>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="text-sm font-medium">Auto-Provision Users</p>
                  <p className="text-xs text-muted-foreground">
                    Automatically create accounts for new SSO users from allowed domains.
                  </p>
                </div>
                <Switch checked={autoProvision} onCheckedChange={setAutoProvision} />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="text-sm font-medium">Deactivate on IdP Removal</p>
                  <p className="text-xs text-muted-foreground">
                    Automatically deactivate user accounts when removed from the identity provider.
                  </p>
                </div>
                <Switch checked={deactivateOnRemoval} onCheckedChange={setDeactivateOnRemoval} />
              </div>

              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? "Saving..." : "Save Policies"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
    </SectionErrorBoundary>
  );
};

export default SSOConfig;
