import { Link } from "react-router-dom";
import logo from "@/assets/quantivis-logo.png";
import { Badge } from "@/components/ui/badge";
import { Globe } from "lucide-react";

interface LegalDocHeaderProps {
  title: string;
  subtitle?: string;
  version: string;
  effectiveDate: string;
  language: "de" | "en";
  counterpartHref?: string;
}

/**
 * Procurement-grade legal document header.
 * Renders title, version chip, effective date, and language switcher.
 */
const LegalDocHeader = ({
  title,
  subtitle,
  version,
  effectiveDate,
  language,
  counterpartHref,
}: LegalDocHeaderProps) => (
  <div className="mb-10 border-b border-border/40 pb-6">
    <Link to="/" className="inline-block mb-6">
      <img src={logo} alt="Quantivis Global" className="h-8" />
    </Link>
    <div className="flex items-start justify-between flex-wrap gap-3">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-1.5">{title}</h1>
        {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
      </div>
      {counterpartHref && (
        <Link
          to={counterpartHref}
          hrefLang={language === "de" ? "en" : "de"}
          className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
        >
          <Globe className="w-3 h-3" />
          {language === "de" ? "English version" : "Deutsche Version"}
        </Link>
      )}
    </div>
    <div className="flex items-center gap-2 mt-4 flex-wrap">
      <Badge variant="outline" className="text-[10px]">Version {version}</Badge>
      <Badge variant="outline" className="text-[10px]">
        {language === "de" ? "Stand" : "Effective"}: {effectiveDate}
      </Badge>
      <Badge variant="outline" className="text-[10px]">
        {language === "de" ? "Sprache: Deutsch" : "Language: English"}
      </Badge>
    </div>
  </div>
);

export default LegalDocHeader;
