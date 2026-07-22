import { ChevronDown, Building2, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface OrgSwitcherProps {
  organizations: { id: string; name: string; role: string }[];
  currentOrg: { id: string; name: string; role: string } | null;
  onSwitch: (orgId: string) => void;
}

const OrgSwitcher = ({ organizations, currentOrg, onSwitch }: OrgSwitcherProps) => {
  if (organizations.length <= 1) {
    return (
      <div className="flex items-center gap-1.5 text-sm min-w-0">
        <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground shrink-0" />
        <span className="font-medium truncate max-w-[120px] sm:max-w-[160px] text-xs sm:text-sm">{currentOrg?.name ?? "No Organization"}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs sm:text-sm font-medium max-w-[120px] sm:max-w-[200px] h-8 px-2">
          <Building2 className="w-4 h-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{currentOrg?.name?.trim()}</span>
          <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => onSwitch(org.id)}
            className="flex items-center justify-between"
          >
            <div className="min-w-0">
              <div className="font-medium truncate">{org.name?.trim()}</div>
              <div className="text-xs text-muted-foreground capitalize">{org.role}</div>
            </div>
            {org.id === currentOrg?.id && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default OrgSwitcher;
