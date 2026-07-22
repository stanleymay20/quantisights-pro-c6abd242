import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock } from "lucide-react";

interface Props {
  verifiedAt?: string | null;
  evidenceVersion?: string | null;
  evidenceHash?: string | null;
  compact?: boolean;
}

const LastVerifiedBadge = ({ verifiedAt, evidenceVersion, evidenceHash, compact }: Props) => {
  if (!verifiedAt) {
    return (
      <Badge variant="outline" className="text-[10px] text-muted-foreground">
        <Clock className="w-3 h-3 mr-1" /> Not yet verified
      </Badge>
    );
  }
  const d = new Date(verifiedAt);
  const label = d.toLocaleDateString("en-CA"); // ISO-like
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-500">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        Last verified {label}
      </Badge>
      {!compact && evidenceVersion && (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          Evidence v{evidenceVersion}
        </Badge>
      )}
      {!compact && evidenceHash && (
        <Badge variant="outline" className="text-[10px] text-muted-foreground font-mono">
          {evidenceHash.slice(0, 10)}…
        </Badge>
      )}
    </div>
  );
};

export default LastVerifiedBadge;
