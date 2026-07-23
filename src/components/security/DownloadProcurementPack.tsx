import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const DownloadProcurementPack = () => {
  const [busy, setBusy] = useState(false);
  const [lastBundle, setLastBundle] = useState<{ id: string; version: string } | null>(null);

  const handleDownload = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-procurement-pack`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const version = res.headers.get("X-Bundle-Version") ?? "latest";
      const integrityId = res.headers.get("X-Bundle-Integrity-Id") ?? "";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quantivis-procurement-pack-${version}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setLastBundle({ id: integrityId, version });
      toast({ title: "Pack downloaded", description: `Version ${version} · integrity ${integrityId.slice(0, 20)}…` });
    } catch (e: unknown) {
      toast({ title: "Download failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button size="sm" onClick={handleDownload} disabled={busy}>
        {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
        Download Procurement Pack (ZIP)
      </Button>
      {lastBundle && (
        <Badge variant="outline" className="text-[10px] font-mono">v{lastBundle.version}</Badge>
      )}
    </div>
  );
};

export default DownloadProcurementPack;
