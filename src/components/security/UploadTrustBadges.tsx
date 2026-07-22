import { Shield, Lock, Eye, Server } from "lucide-react";

const badges = [
  {
    icon: Lock,
    label: "AES-256 Encrypted",
    detail: "Data encrypted at rest and in transit (TLS 1.3)",
  },
  {
    icon: Shield,
    label: "Org-Isolated",
    detail: "Row-level security ensures no cross-org access",
  },
  {
    icon: Eye,
    label: "AI Redacted by Default",
    detail: "PII stripped before AI processing unless you opt in",
  },
  {
    icon: Server,
    label: "Enterprise-Grade Hosting",
    detail: "AWS-backed infrastructure with enterprise-grade controls",
  },
];

const UploadTrustBadges = () => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
    {badges.map(({ icon: Icon, label, detail }) => (
      <div
        key={label}
        className="flex items-start gap-3 p-3.5 rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm"
      >
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground leading-tight">{label}</p>
          <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{detail}</p>
        </div>
      </div>
    ))}
  </div>
);

export default UploadTrustBadges;
