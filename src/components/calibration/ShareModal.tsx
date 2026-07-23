import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Share2, Link2, Check, Download } from "lucide-react";
import { toast } from "sonner";
import ShareableScorecard from "./ShareableScorecard";

interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  results: {
    tierLabel: string;
    tierColor: string;
    calibrationScore: number;
    brierScore: number;
    overconfidenceScore: number;
    underconfidenceScore: number;
    rangeCompression: number;
    tailNeglect: number;
    biasMarkers: string[];
    downsideReduction: number;
  };
}

// Encode results into a compact URL-safe string
function encodeResults(r: ShareModalProps["results"]): string {
  const compact = {
    t: r.tierLabel,
    c: r.calibrationScore,
    b: r.brierScore,
    o: r.overconfidenceScore,
    u: r.underconfidenceScore,
    r: r.rangeCompression,
    n: r.tailNeglect,
    m: r.biasMarkers,
    d: r.downsideReduction,
  };
  return btoa(JSON.stringify(compact));
}

const ShareModal = ({ open, onOpenChange, results }: ShareModalProps) => {
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}/calibration?r=${encodeResults(results)}`;

  const shareText = `My Quantivis Calibration: ${results.tierLabel} (${results.calibrationScore}% calibrated). ${results.biasMarkers.length > 0 ? `Bias patterns: ${results.biasMarkers.join(", ")}. ` : ""}How accurate is YOUR judgment?`;

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareLinkedIn = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer,width=600,height=600");
  };

  const handleShareX = () => {
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer,width=600,height=600");
  };

  const handleDownloadImage = async () => {
    const el = document.getElementById("calibration-scorecard");
    if (!el) return;
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(el, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement("a");
      link.download = `quantivis-calibration-${results.tierLabel.toLowerCase().replace(/\s/g, "-")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("Scorecard downloaded");
    } catch (e: unknown) {
      console.error("[ShareModal] Scorecard download failed:", e instanceof Error ? e.message : e);
      toast.error("Download failed — try a screenshot instead");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary" />
            Share Your Calibration Profile
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Scorecard preview */}
          <ShareableScorecard {...results} />

          {/* Share buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Button variant="outline" className="gap-2 h-11" onClick={handleCopyLink}>
              {copied ? <Check className="w-4 h-4 text-success" /> : <Link2 className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy Link"}
            </Button>
            <Button variant="outline" className="gap-2 h-11" onClick={handleShareLinkedIn}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
              LinkedIn
            </Button>
            <Button variant="outline" className="gap-2 h-11" onClick={handleShareX}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              Post on X
            </Button>
          </div>

          {/* Download */}
          <Button variant="secondary" className="w-full gap-2" onClick={handleDownloadImage}>
            <Download className="w-4 h-4" />
            Download Scorecard as Image
          </Button>

          {/* Challenge CTA */}
          <div className="text-center pt-2 border-t border-border/40">
            <p className="text-xs text-muted-foreground">
              Challenge your team — share and compare calibration scores
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareModal;
