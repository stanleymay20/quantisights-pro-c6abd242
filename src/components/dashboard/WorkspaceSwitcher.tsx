import { useState } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useProject } from "@/contexts/ProjectContext";
import { Building2, Plus, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

const WorkspaceSwitcher = () => {
  const { workspaces, currentWorkspace, switchWorkspace, createWorkspace, refreshWorkspaces, loading } = useWorkspace();
  const { createProject, loading: projectLoading } = useProject();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const contextBusy = loading || projectLoading || creating;

  const handleCreate = async () => {
    const trimmed = newName.trim().slice(0, 100);
    if (!trimmed || loading) return;
    setCreating(true);
    try {
      const ws = await createWorkspace(trimmed);
      try {
        await createProject("Default Project", undefined, ws.id);
      } catch (error) {
        console.warn("Auto-project creation deferred — workspace remains valid", error);
      }
      await refreshWorkspaces();
      toast({ title: "Workspace created", description: `"${trimmed}" is now active.` });
      setShowCreate(false);
      setNewName("");
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={contextBusy}>
          <Button
            variant="ghost"
            size="sm"
            disabled={contextBusy}
            aria-busy={loading || projectLoading}
            className="gap-1.5 text-xs font-medium max-w-[180px] truncate"
          >
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{loading ? "Loading workspace…" : currentWorkspace?.name ?? "Workspace"}</span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {workspaces.map((ws) => (
            <DropdownMenuItem
              key={ws.id}
              disabled={contextBusy || ws.id === currentWorkspace?.id}
              onClick={() => {
                if (contextBusy || ws.id === currentWorkspace?.id) return;
                switchWorkspace(ws.id);
                toast({ title: `Switching to "${ws.name}"…` });
              }}
              className={ws.id === currentWorkspace?.id ? "bg-accent" : ""}
            >
              <Building2 className="h-3.5 w-3.5 mr-2 shrink-0" />
              <span className="truncate">{ws.name}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={contextBusy} onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5 mr-2" />
            New workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showCreate} onOpenChange={(open) => !creating && setShowCreate(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="ws-name">Name</Label>
              <Input
                id="ws-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Client ABC, Q2 Strategy"
                maxLength={100}
                disabled={creating}
                onKeyDown={(e) => e.key === "Enter" && !creating && void handleCreate()}
              />
              <p className="text-xs text-muted-foreground mt-1">{newName.trim().length}/100</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={creating} onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || loading || !newName.trim()}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default WorkspaceSwitcher;
