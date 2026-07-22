import { useState, ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Shield } from "lucide-react";

export interface DecisionResponsibilityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionLabel: string;
  onConfirm: () => void;
  children?: ReactNode;
}

const DecisionResponsibilityDialog = ({
  open,
  onOpenChange,
  actionLabel,
  onConfirm,
  children,
}: DecisionResponsibilityDialogProps) => {
  const [ack1, setAck1] = useState(false);
  const [ack2, setAck2] = useState(false);

  const canProceed = ack1 && ack2;

  const handleConfirm = () => {
    onConfirm();
    setAck1(false);
    setAck2(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Decision Responsibility Acknowledgment
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed">
            Before proceeding with: <strong className="text-foreground">"{actionLabel}"</strong>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={ack1}
              onCheckedChange={(v) => setAck1(v === true)}
              className="mt-0.5"
            />
            <span className="text-sm text-muted-foreground leading-relaxed">
              I understand that Quantivis provides <strong className="text-foreground">probabilistic decision-support</strong>, not financial advice. All model outputs are subject to data quality limitations and assumption uncertainty.
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={ack2}
              onCheckedChange={(v) => setAck2(v === true)}
              className="mt-0.5"
            />
            <span className="text-sm text-muted-foreground leading-relaxed">
              I confirm that this decision has been reviewed by appropriate stakeholders and that <strong className="text-foreground">decision responsibility rests with my organization</strong>, not the platform.
            </span>
          </label>
        </div>

        {children}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { setAck1(false); setAck2(false); }}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={!canProceed}>
            Confirm & Proceed
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DecisionResponsibilityDialog;
