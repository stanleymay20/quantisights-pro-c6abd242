import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Users, UserPlus, Mail, Shield, Crown, BarChart3, Eye,
  Trash2, Clock, CheckCircle2, XCircle, Loader2, Settings2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

interface Member {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profile?: { full_name: string | null; avatar_url: string | null; user_id: string };
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
}

const ROLE_CONFIG: Record<string, { icon: typeof Crown; label: string; color: string }> = {
  owner: { icon: Crown, label: "Owner", color: "text-amber-400" },
  admin: { icon: Shield, label: "Admin", color: "text-primary" },
  analyst: { icon: BarChart3, label: "Analyst", color: "text-emerald-400" },
  executive: { icon: Settings2, label: "Executive", color: "text-violet-400" },
  viewer: { icon: Eye, label: "Viewer", color: "text-muted-foreground" },
};

const Team = () => {
  const { user } = useAuth();
  const { currentOrgId, currentOrg } = useOrganization();
  const { toast } = useToast();

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviting, setInviting] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  const canManage = userRole === "owner" || userRole === "admin";

  const fetchData = useCallback(async () => {
    if (!currentOrgId) return;
    setLoading(true);

    const [membersRes, invitesRes, roleRes] = await Promise.all([
      supabase
        .from("organization_members")
        .select("id, user_id, role, created_at")
        .eq("organization_id", currentOrgId),
      supabase
        .from("team_invitations")
        .select("id, email, role, status, created_at, expires_at")
        .eq("organization_id", currentOrgId)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase.rpc("get_user_org_role", { _user_id: user!.id, _org_id: currentOrgId }),
    ]);

    if (membersRes.data) {
      const userIds = membersRes.data.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds);

      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
      setMembers(
        membersRes.data.map((m) => ({
          ...m,
          profile: profileMap.get(m.user_id) || undefined,
        }))
      );
    }

    setInvitations((invitesRes.data as unknown as typeof invitations) || []);
    setUserRole(roleRes.data as string | null);
    setLoading(false);
  }, [currentOrgId, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sendInvite = async () => {
    if (!inviteEmail || !currentOrgId) return;
    setInviting(true);
    try {
      const { data, error } = await invokeWithRetry<any>("invite-team-member", {
        body: { email: inviteEmail, role: inviteRole, organization_id: currentOrgId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));

      toast({ title: "Invitation sent", description: `Invited ${inviteEmail} as ${inviteRole}` });
      setInviteEmail("");
      setInviteOpen(false);
      fetchData();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const updateMemberRole = async (memberId: string, newRole: "admin" | "analyst" | "executive" | "viewer") => {
    try {
      const { error } = await supabase
        .from("organization_members")
        .update({ role: newRole })
        .eq("id", memberId);
      if (error) throw error;
      toast({ title: "Role updated" });
      fetchData();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  const removeMember = async (memberId: string, memberUserId: string) => {
    if (memberUserId === user?.id) {
      toast({ title: "Error", description: "Cannot remove yourself", variant: "destructive" });
      return;
    }
    try {
      const { error } = await supabase
        .from("organization_members")
        .delete()
        .eq("id", memberId);
      if (error) throw error;
      toast({ title: "Member removed" });
      fetchData();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  const cancelInvitation = async (inviteId: string) => {
    try {
      const { error } = await supabase
        .from("team_invitations")
        .delete()
        .eq("id", inviteId);
      if (error) throw error;
      toast({ title: "Invitation cancelled" });
      fetchData();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  return (
    <>
        <header className="h-14 border-b border-border/30 flex items-center justify-between px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <SidebarMobileToggle />
            <h1 className="text-[18px] font-semibold tracking-tight">Team Management</h1>
          </div>
          {canManage && (
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <UserPlus className="w-4 h-4" />
                  Invite Member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite Team Member</DialogTitle>
                  <DialogDescription>
                    Send an invitation to join {currentOrg?.name}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="colleague@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin — Full access</SelectItem>
                        <SelectItem value="analyst">Analyst — Data & KPIs</SelectItem>
                        <SelectItem value="executive">Executive — C-suite view</SelectItem>
                        <SelectItem value="viewer">Viewer — Read only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={sendInvite} disabled={inviting || !inviteEmail} className="w-full">
                    {inviting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                    Send Invitation
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </header>

        <SectionErrorBoundary sectionName="Team Management">
        <main className="flex-1 p-8 overflow-auto">
          <div className="max-w-4xl mx-auto space-y-8">
            <p className="text-sm text-muted-foreground">
              {currentOrg?.name} · {members.length} member{members.length !== 1 ? "s" : ""}
            </p>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {/* Members */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-primary" />
                      Active Members
                    </CardTitle>
                    <CardDescription>People with access to this organization</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {members.map((member) => {
                      const rc = ROLE_CONFIG[member.role] || ROLE_CONFIG.viewer;
                      const RoleIcon = rc.icon;
                      const isCurrentUser = member.user_id === user?.id;
                      const isOwner = member.role === "owner";

                      return (
                        <div
                          key={member.id}
                          className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-card/40 hover:border-primary/20 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                              <span className="text-sm font-semibold text-foreground">
                                {(member.profile?.full_name || "U")[0].toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-foreground">
                                {member.profile?.full_name || "Unknown User"}
                                {isCurrentUser && (
                                  <span className="text-xs text-muted-foreground ml-2">(you)</span>
                                )}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <RoleIcon className={`w-3.5 h-3.5 ${rc.color}`} />
                                <span className={`text-xs font-medium ${rc.color}`}>{rc.label}</span>
                              </div>
                            </div>
                          </div>

                          {canManage && !isOwner && !isCurrentUser && (
                            <div className="flex items-center gap-2">
                              <Select
                                value={member.role}
                                onValueChange={(val) => updateMemberRole(member.id, val as "admin" | "analyst" | "executive" | "viewer")}
                              >
                                <SelectTrigger className="w-32 h-8 text-xs" aria-label={`Change role for ${member.profile?.full_name ?? "member"}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin">Admin</SelectItem>
                                  <SelectItem value="analyst">Analyst</SelectItem>
                                  <SelectItem value="executive">Executive</SelectItem>
                                  <SelectItem value="viewer">Viewer</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Remove member"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => removeMember(member.id, member.user_id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          )}

                          {isOwner && (
                            <Badge variant="outline" className="text-amber-400 border-amber-400/30">
                              Owner
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                {/* Pending Invitations */}
                {invitations.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-muted-foreground" />
                        Pending Invitations
                      </CardTitle>
                      <CardDescription>Invitations awaiting acceptance</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {invitations.map((inv) => {
                        const expired = new Date(inv.expires_at) < new Date();
                        return (
                          <div
                            key={inv.id}
                            className={`flex items-center justify-between p-4 rounded-lg border ${
                              expired ? "border-destructive/20 bg-destructive/5" : "border-border/50 bg-card/40"
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-secondary/50 flex items-center justify-center">
                                <Mail className="w-4 h-4 text-muted-foreground" />
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{inv.email}</p>
                                <div className="flex items-center gap-3 mt-0.5">
                                  <span className="text-xs text-muted-foreground capitalize">{inv.role}</span>
                                  {expired ? (
                                    <Badge variant="outline" className="text-destructive border-destructive/30 text-xs">
                                      Expired
                                    </Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      Expires {new Date(inv.expires_at).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {canManage && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => cancelInvitation(inv.id)}
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                Cancel
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}

                {/* Role Legend */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Role Permissions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(ROLE_CONFIG).map(([key, config]) => {
                        const Icon = config.icon;
                        const descriptions: Record<string, string> = {
                          owner: "Full control, billing, team management, and all features",
                          admin: "Team management, data sources, KPI configuration, reports",
                          analyst: "Data upload, KPI building, scenario modeling, reports",
                          executive: "Executive Command, board reports, strategic intelligence",
                          viewer: "Read-only access to dashboards and reports",
                        };
                        return (
                          <div key={key} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30">
                            <Icon className={`w-5 h-5 mt-0.5 ${config.color}`} />
                            <div>
                              <p className={`font-medium text-sm ${config.color}`}>{config.label}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{descriptions[key]}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </main>
        </SectionErrorBoundary>
    </>
  );
};

export default Team;
