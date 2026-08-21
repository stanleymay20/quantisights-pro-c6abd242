import { useState } from "react";
import { useProject } from "@/contexts/ProjectContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useToast } from "@/hooks/use-toast";
import { FolderOpen, Plus, ChevronDown, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ProjectSwitcher = () => {
  const { projects, currentProject, switchProject, createProject, loading } = useProject();
  const { currentWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const contextBusy = workspaceLoading || loading || creating;

  const handleCreate = async () => {
    const trimmed = newName.trim().slice(0, 100);
    if (!trimmed || !currentWorkspaceId || contextBusy) return;
    setCreating(true);
    try {
      await createProject(trimmed);
      toast({ title: "Project created", description: `"${trimmed}" is now active.` });
      setShowCreate(false);
      setNewName("");
    } catch (e: unknown) {
      toast({ title: "Failed to create project", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={contextBusy || !currentWorkspaceId}>
          <button
            disabled={contextBusy || !currentWorkspaceId}
            aria-busy={workspaceLoading || loading}
            className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all border border-border/30 disabled:opacity-60 disabled:cursor-wait"
          >
            <FolderOpen className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span className="max-w-[80px] sm:max-w-[140px] truncate">
              {workspaceLoading || loading ? "Loading project…" : currentProject?.name || "No project"}
            </span>
            <ChevronDown className="w-2.5 h-2.5 sm:w-3 sm:h-3 opacity-50 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {projects.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              No projects in this workspace
            </div>
          ) : (
            projects.map((p) => (
              <DropdownMenuItem
                key={p.id}
                disabled={contextBusy || p.id === currentProject?.id}
                onClick={() => {
                  if (contextBusy || p.id === currentProject?.id) return;
                  switchProject(p.id);
                  toast({ title: `Switching to "${p.name}"…` });
                }}
                className="flex items-center justify-between"
              >
                <span className="truncate">{p.name}</span>
                {p.id === currentProject?.id && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={contextBusy || !currentWorkspaceId} onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="w-3.5 h-3.5" />
            New Project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showCreate} onOpenChange={(open) => !creating && setShowCreate(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
          </DialogHeader>
          <div>
            <Input
              placeholder="e.g. Middle East Macro 2024"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={100}
              disabled={creating}
              onKeyDown={(e) => e.key === "Enter" && !creating && void handleCreate()}
            />
            <p className="text-xs text-muted-foreground mt-1">{newName.trim().length}/100</p>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={creating} onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || loading || workspaceLoading || !currentWorkspaceId || !newName.trim()}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ProjectSwitcher;
