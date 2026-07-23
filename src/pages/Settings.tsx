import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  User, Building2, Bell, Save, Loader2, Mail, X, ScrollText, Clock, Shield, Trash2, AlertTriangle, ShieldCheck, Sun, Moon, Monitor, Activity, Lock, Compass,
} from "lucide-react";
import OrganizationalIdentitySettings from "@/components/settings/OrganizationalIdentitySettings";
import RetentionPolicySettings from "@/components/settings/RetentionPolicySettings";
import GovernanceKPIs from "@/components/dashboard/GovernanceKPIs";
import MFAEnroll from "@/components/auth/MFAEnroll";
import SecurityPosture from "@/components/security/SecurityPosture";
import { OrgSecuritySettings } from "@/components/security/OrgSecuritySettings";
import SessionManagement from "@/components/auth/SessionManagement";
import AuthEventLog from "@/components/auth/AuthEventLog";
import PasskeyManagement from "@/components/auth/PasskeyManagement";
import SCIMTokenManager from "@/components/auth/SCIMTokenManager";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface AuditEntry {
  id: string;
  action_type: string;
  actor_type: string;
  resource_type: string;
  resource_id: string | null;
  created_at: string;
}

const Settings = () => {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const { currentOrgId, currentOrg } = useOrganization();
  const { hasPermission, orgRole } = usePermissions();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [seedingDemo, setSeedingDemo] = useState(false);

  // Profile
  const [fullName, setFullName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);

  // Organization
  const [orgName, setOrgName] = useState("");
  const [industry, setIndustry] = useState("");
  const [savingOrg, setSavingOrg] = useState(false);
  const [orgDirty, setOrgDirty] = useState(false);

  // Notifications
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [weeklyBrief, setWeeklyBrief] = useState(false);
  const [alertThreshold, setAlertThreshold] = useState(50);
  const [escalationThreshold, setEscalationThreshold] = useState(85);
  const [emailRecipients, setEmailRecipients] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [savingNotif, setSavingNotif] = useState(false);
  const [notifDirty, setNotifDirty] = useState(false);

  // Audit log
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Saved snapshots for dirty tracking
  const savedProfile = useRef("");
  const savedOrg = useRef({ name: "", industry: "" });
  const savedNotif = useRef({ emailEnabled: true, weeklyBrief: false, alertThreshold: 50, escalationThreshold: 85, emailRecipients: [] as string[] });

  // Unsaved changes warning
  useEffect(() => {
    const hasDirty = profileDirty || orgDirty || notifDirty;
    const handler = (e: BeforeUnloadEvent) => {
      if (hasDirty) { e.preventDefault(); }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [profileDirty, orgDirty, notifDirty]);

  const canManageOrg = orgRole === "owner" || orgRole === "admin";

  // Initialize profile name from cached AuthContext profile
  useEffect(() => {
    if (profile) {
      const name = profile.full_name || "";
      setFullName(name);
      savedProfile.current = name;
    }
  }, [profile]);

  useEffect(() => {
    if (!currentOrgId) return;
    const load = async () => {
      const { data: org } = await supabase.from("organizations").select("name, industry").eq("id", currentOrgId).maybeSingle();
      if (org) {
        setOrgName(org.name || "");
        setIndustry(org.industry || "");
        savedOrg.current = { name: org.name || "", industry: org.industry || "" };
      }

      const { data: prefs } = await supabase.from("notification_preferences").select("*").eq("organization_id", currentOrgId).eq("role_type", "ceo").maybeSingle();
      if (prefs) {
        setEmailEnabled(prefs.email_enabled);
        setWeeklyBrief(prefs.weekly_brief_enabled);
        setAlertThreshold(prefs.alert_threshold);
        setEscalationThreshold(prefs.escalation_threshold);
        const recipients = ((prefs as Record<string, unknown>).email_recipients as string[]) || [];
        setEmailRecipients(recipients);
        savedNotif.current = {
          emailEnabled: prefs.email_enabled,
          weeklyBrief: prefs.weekly_brief_enabled,
          alertThreshold: prefs.alert_threshold,
          escalationThreshold: prefs.escalation_threshold,
          emailRecipients: recipients,
        };
      }
    };
    load();
  }, [currentOrgId]);

  // Dirty tracking
  useEffect(() => { setProfileDirty(fullName !== savedProfile.current); }, [fullName]);
  useEffect(() => { setOrgDirty(orgName !== savedOrg.current.name || industry !== savedOrg.current.industry); }, [orgName, industry]);
  useEffect(() => {
    setNotifDirty(
      emailEnabled !== savedNotif.current.emailEnabled ||
      weeklyBrief !== savedNotif.current.weeklyBrief ||
      alertThreshold !== savedNotif.current.alertThreshold ||
      escalationThreshold !== savedNotif.current.escalationThreshold ||
      JSON.stringify(emailRecipients) !== JSON.stringify(savedNotif.current.emailRecipients)
    );
  }, [emailEnabled, weeklyBrief, alertThreshold, escalationThreshold, emailRecipients]);

  const fetchAuditLog = async () => {
    if (!currentOrgId) return;
    setLoadingAudit(true);
    const { data } = await supabase
      .from("audit_log")
      .select("id, action_type, actor_type, resource_type, resource_id, created_at")
      .eq("organization_id", currentOrgId)
      .order("created_at", { ascending: false })
      .limit(100);
    setAuditLog((data || []) as AuditEntry[]);
    setLoadingAudit(false);
  };

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      const trimmed = fullName.trim().slice(0, 200);
      const { error } = await supabase.from("profiles").update({ full_name: trimmed }).eq("user_id", user.id);
      if (error) throw error;
      savedProfile.current = trimmed;
      setFullName(trimmed);
      await refreshProfile();
      toast({ title: "Profile updated" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setSavingProfile(false); }
  };

  const saveOrg = async () => {
    if (!currentOrgId) return;
    if (!canManageOrg) {
      toast({ title: "Permission denied", description: "Only owners and admins can update organization settings.", variant: "destructive" });
      return;
    }
    setSavingOrg(true);
    try {
      const trimmedName = orgName.trim().slice(0, 200);
      if (!trimmedName) throw new Error("Organization name is required");
      const trimmedIndustry = industry.trim().slice(0, 100) || null;
      const { error } = await supabase.from("organizations").update({ name: trimmedName, industry: trimmedIndustry }).eq("id", currentOrgId);
      if (error) throw error;
      savedOrg.current = { name: trimmedName, industry: trimmedIndustry || "" };
      toast({ title: "Organization updated" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setSavingOrg(false); }
  };

  const saveNotifications = async () => {
    if (!currentOrgId) return;
    setSavingNotif(true);
    try {
      const safeAlert = Math.max(0, Math.min(100, alertThreshold));
      const safeEsc = Math.max(0, Math.min(100, escalationThreshold));
      const { error } = await supabase.from("notification_preferences").upsert({
        organization_id: currentOrgId, role_type: "ceo",
        email_enabled: emailEnabled, weekly_brief_enabled: weeklyBrief,
        alert_threshold: safeAlert,
        escalation_threshold: safeEsc,
        email_recipients: emailRecipients,
      }, { onConflict: "organization_id,role_type" });
      if (error) throw error;
      savedNotif.current = { emailEnabled, weeklyBrief, alertThreshold: safeAlert, escalationThreshold: safeEsc, emailRecipients: [...emailRecipients] };
      toast({ title: "Notification preferences saved" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setSavingNotif(false); }
  };

  const addRecipient = () => {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!EMAIL_REGEX.test(trimmed)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    if (emailRecipients.includes(trimmed)) {
      toast({ title: "Duplicate", description: "This email is already added.", variant: "destructive" });
      return;
    }
    if (emailRecipients.length >= 20) {
      toast({ title: "Limit reached", description: "Maximum 20 recipients.", variant: "destructive" });
      return;
    }
    setEmailRecipients(prev => [...prev, trimmed]);
    setEmailInput("");
  };

  const ACTION_LABELS: Record<string, string> = {
    orchestration_run: "Orchestration Run",
    advisory_generated: "Advisory Generated",
    risk_recalculated: "Risk Recalculated",
    board_report_exported: "Board Report Exported",
    threshold_changed: "Threshold Changed",
    settings_updated: "Settings Updated",
    data_uploaded: "Data Uploaded",
    data_upload: "Data Uploaded",
    connector_pull: "Connector Sync",
    decision_approved: "Decision Approved",
    decision_dismissed: "Decision Dismissed",
    execution_status_changed: "Execution Updated",
    onboarding_completed: "Onboarding Completed",
  };

  return (
    <>
        <header className="h-14 border-b border-border/30 flex items-center px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <SidebarMobileToggle />
            <h1 className="text-[18px] font-semibold tracking-tight">Settings</h1>
          </div>
        </header>

        <main className="flex-1 p-8 overflow-auto">
          <div className="max-w-3xl mx-auto">
            <Tabs defaultValue="profile" className="space-y-6">
              <TabsList className="border-0 bg-transparent p-0 gap-0 border-b border-border/30 rounded-none justify-start h-auto w-full flex-wrap">
                <TabsTrigger value="profile" className="rounded-none border-0 border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[13px] pb-2 pt-1 px-3 h-auto font-medium gap-1.5"><User className="w-4 h-4 hidden sm:block" /> Profile</TabsTrigger>
                <TabsTrigger value="appearance" className="rounded-none border-0 border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[13px] pb-2 pt-1 px-3 h-auto font-medium gap-1.5"><Sun className="w-4 h-4 hidden sm:block" /> Appearance</TabsTrigger>
                <TabsTrigger value="security" className="rounded-none border-0 border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[13px] pb-2 pt-1 px-3 h-auto font-medium gap-1.5"><ShieldCheck className="w-4 h-4 hidden sm:block" /> Security</TabsTrigger>
                <TabsTrigger value="organization" className="rounded-none border-0 border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[13px] pb-2 pt-1 px-3 h-auto font-medium gap-1.5"><Building2 className="w-4 h-4 hidden sm:block" /> Organization</TabsTrigger>
                <TabsTrigger value="identity" className="rounded-none border-0 border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[13px] pb-2 pt-1 px-3 h-auto font-medium gap-1.5"><Compass className="w-4 h-4 hidden sm:block" /> Identity</TabsTrigger>
                <TabsTrigger value="notifications" className="rounded-none border-0 border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[13px] pb-2 pt-1 px-3 h-auto font-medium gap-1.5"><Bell className="w-4 h-4 hidden sm:block" /> Notifications</TabsTrigger>
                <TabsTrigger value="audit" className="rounded-none border-0 border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[13px] pb-2 pt-1 px-3 h-auto font-medium gap-1.5" onClick={() => fetchAuditLog()}><ScrollText className="w-4 h-4 hidden sm:block" /> Audit Log</TabsTrigger>
              </TabsList>

              {/* Profile */}
              <TabsContent value="profile">
                <SectionErrorBoundary sectionName="Profile settings">
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                  <Card>
                    <CardHeader><CardTitle className="text-[14px] font-semibold text-foreground">Profile</CardTitle></CardHeader>
                    <CardContent className="space-y-6">
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input value={user?.email || ""} disabled className="bg-muted/50" />
                        <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Full Name</Label>
                        <Input value={fullName} onChange={e => setFullName(e.target.value)} maxLength={200} placeholder="Your full name" />
                      </div>
                      <Button onClick={saveProfile} disabled={savingProfile || !profileDirty} className="gap-2">
                        {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Current Role — read-only display */}
                  <Card className="mt-6">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        Role
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium capitalize bg-primary/10 text-primary px-3 py-1 rounded-full">
                          {orgRole ?? "member"}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          Your role controls which sections appear in your sidebar.
                        </p>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1 bg-muted/30 rounded-lg p-3">
                        {orgRole === "owner" || orgRole === "admin" ? (
                          <p>Full access — all 9 sidebar sections visible.</p>
                        ) : orgRole === "executive" ? (
                          <p>Executive access — Home, Copilot, Decisions, Monitor, Reports, Governance, Team, Settings.</p>
                        ) : orgRole === "analyst" ? (
                          <p>Analyst access — Home, Copilot, Decisions, Reports, Data, Monitor, Settings.</p>
                        ) : orgRole === "steward" ? (
                          <p>Steward access — Home, Copilot, Decisions, Data, Governance, Settings.</p>
                        ) : (
                          <p>Viewer access — Home, Copilot, Decisions, Reports, Settings.</p>
                        )}
                        <p className="text-[10px] mt-1 opacity-70">To change your role, contact your organization owner.</p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Account Deletion — scroll-mt pushes this below the fold on page load */}
                  <Card className="border-destructive/30 mt-6 scroll-mt-8" id="danger-zone">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="w-5 h-5" /> Danger Zone</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-2">
                        Permanently delete your account and all associated data. This action cannot be undone. Your data will be purged per our <a href="/data-retention" className="text-primary hover:underline">Data Retention Policy</a>.
                      </p>
                      <p className="text-xs text-muted-foreground mb-4">Type <strong>delete</strong> below to enable the button.</p>
                      <Input
                        value={deleteConfirm}
                        onChange={(e) => setDeleteConfirm(e.target.value)}
                        placeholder="Type delete to confirm"
                        className="mb-3 max-w-xs"
                      />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" className="gap-2" disabled={deleteConfirm !== "delete"}><Trash2 className="w-4 h-4" /> Delete Account</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete your profile, uploaded datasets (within 7 days), and all associated data. Audit logs are retained for 24 months per regulatory requirements. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              disabled={deletingAccount}
                              onClick={async () => {
                                setDeletingAccount(true);
                                try {
                                  const { error } = await supabase.functions.invoke("delete-account");
                                  if (error) throw error;
                                  await signOut();
                                  toast({ title: "Account deleted", description: "Your data has been permanently removed." });
                                } catch (err: unknown) {
                                  toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
                                } finally {
                                  setDeletingAccount(false);
                                }
                              }}
                            >
                              {deletingAccount ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                              Yes, delete my account
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </CardContent>
                  </Card>
                </motion.div>
                </SectionErrorBoundary>
              </TabsContent>

              {/* Appearance */}
              <TabsContent value="appearance">
                <SectionErrorBoundary sectionName="Appearance settings">
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                  <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Sun className="w-5 h-5 text-primary" /> Appearance</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">Choose your preferred theme for the interface.</p>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { value: "light" as const, label: "Day", icon: Sun },
                          { value: "dark" as const, label: "Night", icon: Moon },
                          { value: "system" as const, label: "System", icon: Monitor },
                        ].map(({ value, label, icon: Icon }) => (
                          <button
                            key={value}
                            onClick={() => setTheme(value)}
                            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                              theme === value
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-primary/30"
                            }`}
                          >
                            <Icon className={`w-6 h-6 ${theme === value ? "text-primary" : "text-muted-foreground"}`} />
                            <span className={`text-sm font-medium ${theme === value ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
                </SectionErrorBoundary>
              </TabsContent>

              {/* Security */}
              <TabsContent value="security">
                <SectionErrorBoundary sectionName="Security settings">
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  <OrgSecuritySettings />
                  <SecurityPosture />
                  <MFAEnroll />
                  <PasskeyManagement />
                  <SessionManagement />
                  {(orgRole === "owner" || orgRole === "admin") && (
                    <>
                      <SCIMTokenManager />
                      <AuthEventLog />
                    </>
                  )}
                  <RetentionPolicySettings />
                  <GovernanceKPIs />
                </motion.div>
                </SectionErrorBoundary>
              </TabsContent>

              {/* Organization */}
              <TabsContent value="organization">
                <SectionErrorBoundary sectionName="Organization settings">
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                  <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5 text-primary" /> Organization Settings</CardTitle></CardHeader>
                    <CardContent className="space-y-6">
                      {!canManageOrg && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/50 text-sm text-muted-foreground">
                          <Lock className="w-4 h-4 shrink-0" />
                          Only owners and admins can modify organization settings.
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label>Organization Name</Label>
                        <Input value={orgName} onChange={e => setOrgName(e.target.value)} maxLength={200} placeholder="Organization name" disabled={!canManageOrg} />
                      </div>
                      <div className="space-y-2">
                        <Label>Industry</Label>
                        <Input value={industry} onChange={e => setIndustry(e.target.value)} maxLength={100} placeholder="e.g. SaaS, Manufacturing, Retail" disabled={!canManageOrg} />
                      </div>
                      <Button onClick={saveOrg} disabled={savingOrg || !canManageOrg || !orgDirty} className="gap-2">
                        {savingOrg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Organization
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Demo Data */}
                  {canManageOrg && (
                    <Card className="mt-6 border-primary/30">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5 text-primary" /> Demo Environment</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-4">
                          Populate your organization with a realistic enterprise scenario — 15 months of metrics, risk indices, simulations, decisions, and advisories. This will overwrite existing demo data.
                        </p>
                        <Button
                          variant="outline"
                          disabled={seedingDemo}
                          className="gap-2"
                          onClick={async () => {
                            setSeedingDemo(true);
                            toast({ title: "Seeding demo data…", description: "Loading 15 months of Acme Corp sample data." });
                            try {
                              const { data, error } = await supabase.functions.invoke("seed-demo-data");
                              if (error) throw error;
                              if (data?.error) throw new Error(String(data.error));
                              const summary = data?.summary;
                              toast({
                                title: "Demo data loaded",
                                description: summary
                                  ? `${summary.metrics ?? 0} metrics, ${summary.decisions ?? 0} decisions, ${summary.advisories ?? 0} advisories seeded.`
                                  : "Sample data loaded. Refresh the dashboard to see it.",
                              });
                              // Soft reload to reflect new data
                              setTimeout(() => window.location.reload(), 1500);
                            } catch (err: unknown) {
                              const msg = err instanceof Error ? err.message : "The demo seed function could not be reached. Please try again.";
                              toast({ title: "Demo seed failed", description: msg, variant: "destructive" });
                            } finally {
                              setSeedingDemo(false);
                            }
                          }}
                        >
                          {seedingDemo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                          {seedingDemo ? "Seeding data…" : "Load Demo Scenario"}
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </motion.div>
                </SectionErrorBoundary>
              </TabsContent>

              {/* Notifications */}
              <TabsContent value="notifications">
                <SectionErrorBoundary sectionName="Notification settings">
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                  <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="w-5 h-5 text-primary" /> Notification Preferences</CardTitle></CardHeader>
                    <CardContent className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div><Label>Email Alerts</Label><p className="text-xs text-muted-foreground">Receive critical alerts via email</p></div>
                        <Switch checked={emailEnabled} onCheckedChange={setEmailEnabled} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div><Label>Weekly Executive Brief</Label><p className="text-xs text-muted-foreground">Automated weekly intelligence summary</p></div>
                        <Switch checked={weeklyBrief} onCheckedChange={setWeeklyBrief} />
                      </div>
                      <div className="space-y-2">
                        <Label>Alert Threshold (Risk Score)</Label>
                        {/* HTML min/max on type="number" only affects the spinner
                            buttons and :invalid styling, not typed/pasted values --
                            saveNotifications() already clamps before persisting, but
                            leaving the field itself unclamped let a user type e.g.
                            99999999, see it sit there, and get a bare "saved"
                            toast with no indication it was silently capped to 100. */}
                        <Input type="number" min={0} max={100} value={alertThreshold} onChange={e => setAlertThreshold(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
                        <p className="text-xs text-muted-foreground">Trigger alerts when risk score exceeds this value</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Escalation Threshold</Label>
                        <Input type="number" min={0} max={100} value={escalationThreshold} onChange={e => setEscalationThreshold(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
                        <p className="text-xs text-muted-foreground">Auto-escalate to board when score exceeds this value</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Email Recipients</Label>
                        <div className="flex gap-2">
                          <Input
                            value={emailInput}
                            onChange={e => setEmailInput(e.target.value)}
                            placeholder="Add email recipient"
                            maxLength={255}
                            onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addRecipient())}
                          />
                          <Button variant="outline" size="sm" aria-label="Add email recipient" onClick={addRecipient}><Mail className="w-4 h-4" /></Button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {emailRecipients.map(email => (
                            <Badge key={email} variant="secondary" className="gap-1">
                              {email}
                              <button onClick={() => setEmailRecipients(prev => prev.filter(e => e !== email))}><X className="w-3 h-3" /></button>
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Button onClick={saveNotifications} disabled={savingNotif || !notifDirty} className="gap-2">
                        {savingNotif ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Notifications
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
                </SectionErrorBoundary>
              </TabsContent>

              {/* Audit Log */}
              <TabsContent value="audit">
                <SectionErrorBoundary sectionName="Audit log">
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><ScrollText className="w-5 h-5 text-primary" /> Enterprise Audit Log</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {loadingAudit ? (
                        <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
                      ) : auditLog.length === 0 ? (
                        <div className="py-12 text-center">
                          <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                          <h3 className="font-semibold mb-1">No Audit Events Yet</h3>
                          <p className="text-sm text-muted-foreground">System actions and changes will be logged here for compliance.</p>
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-[600px] overflow-auto">
                          {auditLog.map(entry => (
                            <div key={entry.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-muted/20">
                              <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium">
                                    {ACTION_LABELS[entry.action_type] || entry.action_type}
                                  </span>
                                  <Badge variant="outline" className="text-xs">{entry.actor_type}</Badge>
                                  <Badge variant="secondary" className="text-xs">{entry.resource_type}</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {new Date(entry.created_at).toLocaleString()}
                                  {entry.resource_id && <span className="ml-2 font-mono">ID: {entry.resource_id.slice(0, 8)}…</span>}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
                </SectionErrorBoundary>
              </TabsContent>

              {/* Organizational Identity */}
              <TabsContent value="identity">
                <SectionErrorBoundary sectionName="Organizational identity settings">
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                  <OrganizationalIdentitySettings organizationId={currentOrgId} />
                </motion.div>
                </SectionErrorBoundary>
              </TabsContent>



            </Tabs>
          </div>
        </main>
    </>
  );
};

export default Settings;
