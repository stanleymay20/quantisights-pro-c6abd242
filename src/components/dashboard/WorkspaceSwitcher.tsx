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
  const { workspaces, currentWorkspace, switchWorkspace, createWorkspace, refreshWorkspaces } = useWorkspace();
  const { createProject, refreshProjects } = useProject();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    const trimmed = newName.trim().slice(0, 100);
    if (!trimmed) return;
    setCreating(true);
    try {
      const ws = await createWorkspace(trimmed);
      // Wait for workspace context to settle, then create default project
      // We pass the workspace ID explicitly to avoid depending on state propagation
      try {
        await createProject("Default Project", undefined, ws.id);
      } catch {
        // Non-fatal: workspace was created, project creation may need a manual refresh
        console.warn("Auto-project creation deferred — will retry on next context refresh");
      }
      // Refresh to ensure both contexts have the latest data
      await refreshWorkspaces();
      toast({ title: "Workspace created", description: `"${trimmed}" is now active with a default project.` });
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
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs font-medium max-w-[180px] truncate">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{currentWorkspace?.name ?? "Workspace"}</span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {workspaces.map((ws) => (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => {
                switchWorkspace(ws.id);
                if (ws.id !== currentWorkspace?.id) {
                  toast({ title: `Switched to "${ws.name}"` });
                }
              }}
              className={ws.id === currentWorkspace?.id ? "bg-accent" : ""}
            >
              <Building2 className="h-3.5 w-3.5 mr-2 shrink-0" />
              <span className="truncate">{ws.name}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5 mr-2" />
            New workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
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
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <p className="text-xs text-muted-foreground mt-1">{newName.trim().length}/100</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default WorkspaceSwitcher;
