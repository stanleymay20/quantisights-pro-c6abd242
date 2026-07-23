import { useTranslation } from "react-i18next";
import { Globe, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const LANGUAGES = [
  { code: "en", label: "English", short: "EN", flag: "🇬🇧" },
  { code: "de", label: "Deutsch", short: "DE", flag: "🇩🇪" },
  { code: "fr", label: "Français", short: "FR", flag: "🇫🇷" },
  { code: "es", label: "Español", short: "ES", flag: "🇪🇸" },
  { code: "ar", label: "العربية", short: "AR", flag: "🇸🇦" },
];

interface Props {
  variant?: "header" | "public";
}

/**
 * Compact language switcher for use in the top navigation.
 * Exposes EN/DE (and other locales) globally so German users can
 * toggle the UI from any page — not just Settings.
 */
export const HeaderLanguageSwitcher = ({ variant = "header" }: Props) => {
  const { i18n } = useTranslation();
  const current = (i18n.language || "en").split("-")[0];
  const active = LANGUAGES.find((l) => l.code === current) ?? LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Change language (current: ${active.label})`}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors",
            variant === "header"
              ? "text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60"
              : "text-[13px] text-muted-foreground hover:text-foreground"
          )}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>{active.short}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {LANGUAGES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => i18n.changeLanguage(l.code)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <span aria-hidden>{l.flag}</span>
            <span className="flex-1">{l.label}</span>
            {l.code === current && <Check className="w-3.5 h-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default HeaderLanguageSwitcher;
