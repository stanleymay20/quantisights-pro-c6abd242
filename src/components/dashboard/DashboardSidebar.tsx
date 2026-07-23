import { createContext, useContext, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  MessageSquareText,
  ClipboardList,
  Target,
  Briefcase,
  LogOut,
  Menu,
  X,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Sparkles,
  // sub-page icons
  Brain,
  PlayCircle,
  Scale,
  Clock,
  ShieldAlert,
  Inbox,
  TrendingUp,
  BarChart3,
  BarChart2,
  Upload,
  Database,
  BookOpen as CatalogIcon,
  Activity,
  CheckSquare,
  CreditCard,
  Users,
  Settings as SettingsIcon,
  Shield,
  FileText,
  Plug,
  Network,
  GitBranch,
  Layers,
  Wrench,
  Lock,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { usePermissions } from "@/hooks/usePermissions";
import { useRoleNav } from "@/hooks/useRoleNav";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTranslation } from "react-i18next";
import logo from "@/assets/quantivis-logo.png";
import WorkspaceSwitcher from "@/components/dashboard/WorkspaceSwitcher";
import { cn } from "@/lib/utils";

// Map English sidebar labels → i18n keys under `sidebar.*`.
// Keeps the existing nav arrays untouched while enabling translations.
const SIDEBAR_LABEL_KEYS: Record<string, string> = {
  "Dashboard": "sidebar.dashboard",
  "Decisions": "sidebar.decisions",
  "Operations": "sidebar.operations",
  "Reports": "sidebar.reports",
  "Governance": "sidebar.governance",
  "Settings": "sidebar.settings",
  "Advanced": "sidebar.advanced",
  "Executive Brief": "sidebar.executive_brief",
  "Decision History": "sidebar.decision_history",
  "Ask Quantivis": "sidebar.ask_quantivis",
  "Deliberation": "sidebar.deliberation",
  "Execution": "sidebar.execution",
  "Decision Rules": "sidebar.decision_rules",
  "Outcome Tracking": "sidebar.outcome_tracking",
  "Decision Accuracy": "sidebar.decision_accuracy",
  "History": "sidebar.history",
  "Executive Intel": "sidebar.executive_intel",
  "Interventions": "sidebar.interventions",
  "Intel Inbox": "sidebar.intel_inbox",
  "Board Report": "sidebar.board_report",
  "Forecasting": "sidebar.forecasting",
  "Simulations": "sidebar.simulations",
  "Command View": "sidebar.command_view",
  "Compliance": "sidebar.compliance",
  "Trust Center": "sidebar.trust_center",
  "System Health": "sidebar.system_health",
  "Team": "sidebar.team",
  "Billing": "sidebar.billing",
  "Data": "sidebar.data",
  "Reports & Forecasting": "sidebar.reports_forecasting",
  "Data & Pipeline": "sidebar.data_pipeline",
  "Governance & Compliance": "sidebar.governance_compliance",
  "Labs": "sidebar.labs",
  "Admin": "sidebar.admin",
  "Advisory": "sidebar.advisory",
  "Benchmarking": "sidebar.benchmarking",
  "OKRs": "sidebar.okrs",
  "Portfolio": "sidebar.portfolio",
  "Strategy Pack": "sidebar.strategy_pack",
  "Upload": "sidebar.upload",
  "Connectors": "sidebar.connectors",
  "Dataset Explorer": "sidebar.dataset_explorer",
  "Data Catalog": "sidebar.data_catalog",
  "Lineage": "sidebar.lineage",
  "Pipeline": "sidebar.pipeline",
  "Maturity": "sidebar.maturity",
  "Fairness Observ.": "sidebar.fairness",
  "Security Overview": "sidebar.security_overview",
  "Procurement Pack": "sidebar.procurement_pack",
  "Causal Inference": "sidebar.causal_inference",
  "Counterfactual": "sidebar.counterfactual",
  "Bias Detection": "sidebar.bias_detection",
  "Operational Graph": "sidebar.operational_graph",
  "Diagnostics": "sidebar.diagnostics",
  "AICIS Sync": "sidebar.aicis_sync",
  "Bridge Health": "sidebar.bridge_health",
  "SAP Connector": "sidebar.sap_connector",
  "Internal Data": "sidebar.internal_data",
  "Data Vendors": "sidebar.data_vendors",
  "Context Packs": "sidebar.context_packs",
  "Governance Audit": "sidebar.governance_audit",
  "Governance Simulation": "sidebar.governance_simulation",
  "Localization Audit": "sidebar.localization_audit",
  "SSO Config": "sidebar.sso_config",
  "Help & Docs": "sidebar.help_docs",
  "Sign Out": "auth.logout",
};

const useSidebarLabel = () => {
  const { t } = useTranslation();
  return (label: string) => {
    const key = SIDEBAR_LABEL_KEYS[label];
    return key ? (t(key, { defaultValue: label }) as string) : label;
  };
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
}

interface NavSection {
  icon: React.ElementType;
  label: string;
  path: string;
  subItems?: NavItem[];
  defaultOpen?: boolean;
}

interface AdvancedGroup {
  icon: React.ElementType;
  label: string;
  items: NavItem[];
}

// ─── PRIMARY NAV — executive outcome-oriented items ──────────────────────────
// UX-1 IA collapse:
//   Dashboard · Decisions · Operations · Reports · Governance · Settings
// Power-user pages live under "Advanced" at the bottom of the sidebar.
const navSections: NavSection[] = [
  {
    icon: LayoutDashboard,
    label: "Dashboard",
    path: "/dashboard",
  },
  {
    icon: ClipboardList,
    label: "Decisions",
    path: "/decisions",
    subItems: [
      { icon: FileText,       label: "Executive Brief",  path: "/executive-brief" },
      { icon: ClipboardList,  label: "Decision History", path: "/history" },
      { icon: MessageSquareText, label: "Ask Quantivis", path: "/app/copilot" },
      { icon: Scale,          label: "Deliberation",     path: "/deliberation" },
      { icon: PlayCircle,     label: "Execution",        path: "/execution" },
      { icon: Wrench,         label: "Decision Rules",   path: "/decision-rules" },
    ],
  },
  {
    icon: Target,
    label: "Operations",
    path: "/outcomes",
    subItems: [
      { icon: Target,         label: "Outcome Tracking",  path: "/outcomes" },
      { icon: BarChart3,      label: "Decision Accuracy", path: "/decision-accuracy" },
      { icon: ShieldAlert,    label: "Executive Intel",   path: "/executive-intelligence" },
      { icon: ShieldAlert,    label: "Interventions",     path: "/interventions" },
      { icon: Inbox,          label: "Intel Inbox",       path: "/intelligence-inbox" },
    ],
  },
  {
    icon: FileText,
    label: "Reports",
    path: "/reports",
    subItems: [
      { icon: FileText,    label: "Reports",       path: "/reports" },
      { icon: FileText,    label: "Board Report",  path: "/board-report" },
      { icon: TrendingUp,  label: "Forecasting",   path: "/forecasting" },
      { icon: Brain,       label: "Simulations",   path: "/simulations" },
    ],
  },
  {
    icon: Shield,
    label: "Governance",
    path: "/governance",
    subItems: [
      { icon: Shield,       label: "Command View",       path: "/governance" },
      { icon: CheckSquare,  label: "Compliance",         path: "/compliance" },
      { icon: Shield,       label: "Trust Center",       path: "/trust" },
      { icon: Activity,     label: "System Health",      path: "/system-health" },
    ],
  },
  {
    icon: SettingsIcon,
    label: "Settings",
    path: "/settings",
    subItems: [
      { icon: SettingsIcon,   label: "Settings",       path: "/settings" },
      { icon: Users,          label: "Team",           path: "/team" },
      { icon: CreditCard,     label: "Billing",        path: "/billing" },
      { icon: Lock,           label: "Privacy",        path: "/privacy-dashboard" },
    ],
  },
];

// ─── ADVANCED — power-user routes ────────────────────────────────────────────
// Collapsed by default. Contains routes that overwhelmed first-time users.
const advancedGroups: AdvancedGroup[] = [
  {
    icon: FileText,
    label: "Reports & Forecasting",
    items: [
      { icon: BarChart3,   label: "Advisory",      path: "/advisory" },
      { icon: BarChart2,   label: "Benchmarking",  path: "/benchmarking" },
      { icon: Target,      label: "OKRs",          path: "/okrs" },
      { icon: Briefcase,   label: "Portfolio",     path: "/portfolio" },
      { icon: FileText,    label: "Strategy Pack", path: "/strategy-pack" },
    ],
  },
  {
    icon: Database,
    label: "Data & Pipeline",
    items: [
      { icon: Upload,      label: "Upload",           path: "/data-upload" },
      { icon: Plug,        label: "Connectors",       path: "/data-connectors" },
      { icon: Database,    label: "Dataset Explorer", path: "/dataset-explorer" },
      { icon: CatalogIcon, label: "Data Catalog",     path: "/data-catalog" },
      { icon: GitBranch,   label: "Lineage",          path: "/lineage" },
      { icon: Activity,    label: "Pipeline",         path: "/pipeline" },
    ],
  },
  {
    icon: Shield,
    label: "Governance & Compliance",
    items: [
      { icon: Scale,        label: "Maturity",           path: "/governance-maturity" },
      { icon: Scale,        label: "Fairness Observ.",   path: "/fairness" },
      { icon: Shield,       label: "Security Overview",  path: "/security-overview" },
      { icon: FileText,     label: "Procurement Pack",   path: "/procurement-pack" },
    ],
  },
  {
    icon: Brain,
    label: "Labs",
    items: [
      { icon: GitBranch, label: "Causal Inference",    path: "/causal-inference" },
      { icon: Brain,     label: "Counterfactual",      path: "/counterfactual" },
      { icon: ShieldAlert,label:"Bias Detection",      path: "/cognitive-bias" },
      { icon: Network,   label: "Operational Graph",   path: "/operational-graph" },
      { icon: BarChart3, label: "Diagnostics",         path: "/diagnostics" },
    ],
  },
  {
    icon: Wrench,
    label: "Admin",
    items: [
      { icon: Activity,  label: "AICIS Sync",            path: "/aicis-sync" },
      { icon: Activity,  label: "Bridge Health",         path: "/admin/bridge-health" },
      { icon: Plug,      label: "SAP Connector",         path: "/admin/connectors/sap" },
      { icon: Database,  label: "Internal Data",         path: "/admin/internal-data" },
      { icon: Database,  label: "Data Vendors",          path: "/admin/data-vendors" },
      { icon: Layers,    label: "Context Packs",         path: "/admin/context-packs" },
      { icon: Scale,     label: "Governance Audit",      path: "/admin/governance-audit" },
      { icon: Scale,     label: "Governance Simulation", path: "/admin/governance-simulation" },
      { icon: BookOpen,  label: "Localization Audit",    path: "/admin/localization-audit" },
      { icon: Shield,    label: "SSO Config",            path: "/sso" },
    ],
  },
];

// ─── Context ──────────────────────────────────────────────────────────────────
const SidebarContext = createContext<{ open: boolean; toggle: () => void; collapsed: boolean; toggleCollapsed: () => void }>({
  open: false,
  toggle: () => {},
  collapsed: false,
  toggleCollapsed: () => {},
});
export const useSidebarToggle = () => useContext(SidebarContext);
export const useSidebarCollapsed = () => useContext(SidebarContext).collapsed;

export const SidebarProvider = ({ children }: { children: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar_collapsed") === "true"; } catch { return false; }
  });
  const toggleCollapsed = () => setCollapsed(p => {
    const next = !p;
    try { localStorage.setItem("sidebar_collapsed", String(next)); } catch {}
    return next;
  });
  return (
    <SidebarContext.Provider value={{ open, toggle: () => setOpen(p => !p), collapsed, toggleCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
};

/** Mobile hamburger */
export const SidebarMobileToggle = () => {
  const isMobile = useIsMobile();
  const { toggle } = useSidebarToggle();
  if (!isMobile) return null;
  return (
    <button
      onClick={toggle}
      className="p-2 -ml-2 rounded-lg hover:bg-secondary/60 transition-colors lg:hidden"
      aria-label="Open navigation menu"
    >
      <Menu className="w-5 h-5 text-muted-foreground" />
    </button>
  );
};

// ─── Section block ─────────────────────────────────────────────────────────────
const SectionBlock = ({
  section,
  location,
  onNavClick,
  labelOverride,
}: {
  section: NavSection;
  location: ReturnType<typeof useLocation>;
  onNavClick: () => void;
  labelOverride?: string;
}) => {
  const tr = useSidebarLabel();
  const displayLabel = labelOverride ?? tr(section.label);
  const hasActiveChild =
    location.pathname === section.path ||
    (section.subItems?.some(item => location.pathname === item.path) ?? false);

  const [open, setOpen] = useState(section.defaultOpen || hasActiveChild);

  const isTopActive = location.pathname === section.path && !section.subItems;

  return (
    <div>
      {section.subItems ? (
        <button
          onClick={() => { setOpen(p => !p); }}
          aria-expanded={open}
          className={cn(
            "flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150",
            hasActiveChild
              ? "bg-foreground/[0.06] text-foreground font-semibold"
              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
        >
          <section.icon className={cn("w-4 h-4 shrink-0", hasActiveChild ? "text-primary" : "text-muted-foreground")} />
          <span className="flex-1 text-left">{displayLabel}</span>
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200 text-muted-foreground", open && "rotate-180")} />
        </button>
      ) : (
        <Link
          to={section.path}
          onClick={onNavClick}
          className={cn(
            "flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150",
            isTopActive
              ? "bg-foreground/[0.06] text-foreground font-semibold"
              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
        >
          <section.icon className={cn("w-4 h-4 shrink-0", isTopActive ? "text-primary" : "text-muted-foreground")} />
          <span className="flex-1">{displayLabel}</span>
          {isTopActive && <span className="w-1.5 h-1.5 rounded-full bg-foreground/60" />}
        </Link>
      )}

      {section.subItems && open && (
        <div className="ml-4 pl-3 border-l border-border/40 mt-0.5 space-y-0.5">
          {section.subItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path + item.label}
                to={item.path}
                onClick={onNavClick}
                className={cn(
                  "group flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] font-medium transition-all duration-150",
                  isActive
                    ? "bg-foreground/[0.06] text-foreground font-semibold"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className={cn("w-3.5 h-3.5 shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-sidebar-accent-foreground")} />
                {tr(item.label)}
                {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-foreground/60" />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Advanced drawer ──────────────────────────────────────────────────────────
const AdvancedDrawer = ({
  location,
  onNavClick,
}: {
  location: ReturnType<typeof useLocation>;
  onNavClick: () => void;
}) => {
  // Auto-open if user is on any advanced route
  const hasActiveAdvanced = advancedGroups.some(g =>
    g.items.some(i => location.pathname === i.path)
  );
  const [drawerOpen, setDrawerOpen] = useState(() => {
    try {
      const stored = localStorage.getItem("sidebar_advanced_open");
      if (stored !== null) return stored === "true";
    } catch {}
    return hasActiveAdvanced;
  });

  const toggle = () => {
    setDrawerOpen(p => {
      const next = !p;
      try { localStorage.setItem("sidebar_advanced_open", String(next)); } catch {}
      return next;
    });
  };

  return (
    <div className="mt-3 pt-3 border-t border-sidebar-border/60">
      <button
        onClick={toggle}
        aria-expanded={drawerOpen}
        className={cn(
          "flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-[10px] font-medium tracking-[0.08em] uppercase transition-colors",
          hasActiveAdvanced
            ? "text-primary"
            : "text-muted-foreground/70 hover:text-foreground"
        )}
      >
        <Sparkles className="w-3 h-3" />
        <span className="flex-1 text-left">{useSidebarLabel()("Advanced")}</span>
        <ChevronRight className={cn("w-3 h-3 transition-transform duration-200", drawerOpen && "rotate-90")} />
      </button>

      {drawerOpen && (
        <div className="mt-1 space-y-2">
          {advancedGroups.map((group) => (
            <AdvancedGroupBlock
              key={group.label}
              group={group}
              location={location}
              onNavClick={onNavClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const AdvancedGroupBlock = ({
  group,
  location,
  onNavClick,
}: {
  group: AdvancedGroup;
  location: ReturnType<typeof useLocation>;
  onNavClick: () => void;
}) => {
  const tr = useSidebarLabel();
  const hasActive = group.items.some(i => location.pathname === i.path);
  const [open, setOpen] = useState(hasActive);

  return (
    <div>
      <button
        onClick={() => setOpen(p => !p)}
        aria-expanded={open}
        className={cn(
          "flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors",
          hasActive
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"
        )}
      >
        <group.icon className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1 text-left">{tr(group.label)}</span>
        <ChevronDown className={cn("w-3 h-3 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <div className="ml-4 pl-3 border-l border-border/30 mt-0.5 space-y-0.5">
          {group.items.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path + item.label}
                to={item.path}
                onClick={onNavClick}
                className={cn(
                  "flex items-center gap-2 px-2 py-1 rounded-md text-[11.5px] font-medium transition-colors",
                  isActive
                    ? "bg-foreground/[0.06] text-foreground font-semibold"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className="w-3 h-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{tr(item.label)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Main sidebar ─────────────────────────────────────────────────────────────
const DashboardSidebar = () => {
  const { signOut, user } = useAuth();
  const { currentOrg } = useOrganization();
  const { orgRole } = usePermissions();
  const allowedPaths = useRoleNav(orgRole as any);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { open, toggle, collapsed, toggleCollapsed } = useSidebarToggle();
  const { t } = useTranslation();
  const tr = useSidebarLabel();

  // Power-user roles see the Advanced drawer; viewer/analyst keep a clean shell
  const showAdvanced =
    !orgRole || orgRole === "owner" || orgRole === "admin" || orgRole === "executive" || orgRole === "steward";

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const handleNavClick = () => {
    if (isMobile) toggle();
  };

  const sidebarContent = (
    <aside
      aria-label="Main navigation"
      className={`${collapsed ? "w-16" : "w-56"} h-dvh bg-sidebar border-r border-border/25 flex flex-col shrink-0 safe-area-left safe-area-top safe-area-bottom transition-all duration-200`}
    >
      {/* Logo */}
      <div className="p-4 pb-3 flex items-center justify-between">
        {!collapsed && (
          <Link to="/" onClick={handleNavClick}>
            <img src={logo} alt="Quantivis" className="h-7 w-auto" />
          </Link>
        )}
        {collapsed && (
          <Link to="/" onClick={handleNavClick} className="mx-auto">
            <img src={logo} alt="Quantivis" className="h-6 w-6 object-contain" />
          </Link>
        )}
        {isMobile ? (
          <button
            onClick={toggle}
            className="p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors"
            aria-label={t("sidebar.close_nav", { defaultValue: "Close navigation" })}
          >
            <X className="w-5 h-5 text-sidebar-foreground" />
          </button>
        ) : (
          <button
            onClick={toggleCollapsed}
            className="p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors ml-auto"
            aria-label={collapsed ? t("sidebar.expand", { defaultValue: "Expand sidebar" }) : t("sidebar.collapse", { defaultValue: "Collapse sidebar" })}
            title={collapsed ? t("sidebar.expand", { defaultValue: "Expand sidebar" }) : t("sidebar.collapse", { defaultValue: "Collapse sidebar" })}
          >
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : "rotate-90"}`} />
          </button>
        )}
      </div>

      {/* Org switcher */}
      {!collapsed && (
        <div className="px-3 pb-3">
          <WorkspaceSwitcher />
        </div>
      )}

      {/* Nav */}
      <nav aria-label="Dashboard navigation" className={`sidebar-nav flex-1 ${collapsed ? "px-1" : "px-2"} overflow-y-auto space-y-0.5`}>
        {collapsed ? (
          navSections.filter(s => allowedPaths.has(s.path)).map((section) => {
            const isActive = location.pathname === section.path ||
              (section.subItems?.some(i => location.pathname === i.path) ?? false);
            return (
              <Link
                key={section.path}
                to={section.path}
                onClick={handleNavClick}
                title={tr(section.label)}
                className={`flex items-center justify-center w-10 h-10 mx-auto rounded-lg transition-colors ${
                  isActive
                    ? "bg-foreground/[0.06] text-foreground font-semibold"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <section.icon className="w-5 h-5" />
              </Link>
            );
          })
        ) : (
          <>
            {navSections.filter(s => allowedPaths.has(s.path)).map((section) => (
              <SectionBlock
                key={section.label}
                section={section}
                location={location}
                onNavClick={handleNavClick}
              />
            ))}

            {showAdvanced && (
              <AdvancedDrawer location={location} onNavClick={handleNavClick} />
            )}
          </>
        )}
      </nav>

      {/* Footer — user identity */}
      <div className="p-2 border-t border-sidebar-border space-y-0.5">
        {user && (
          <div className={cn(
            "flex items-center gap-2.5 px-2.5 py-2 mb-1",
            collapsed && "justify-center px-0"
          )}>
            <div className="w-7 h-7 rounded-full bg-foreground/10 flex items-center justify-center shrink-0 text-[11px] font-semibold text-foreground">
              {(user.user_metadata?.full_name || user.email || "?").charAt(0).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-foreground truncate">
                  {user.user_metadata?.full_name || user.email?.split("@")[0] || "Account"}
                </p>
                <p className="text-[10px] text-muted-foreground/60 truncate">
                  {currentOrg?.name || "Workspace"}
                </p>
              </div>
            )}
          </div>
        )}
        {orgRole && orgRole !== "owner" && orgRole !== "admin" && (
          <div className="px-2.5 py-1 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 bg-muted/40 px-2 py-0.5 rounded-full capitalize">
              {orgRole}
            </span>
          </div>
        )}
        <Link
          to="/docs"
          onClick={handleNavClick}
          title={tr("Help & Docs")}
          className={cn(
            "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors w-full",
            collapsed && "justify-center px-0",
            location.pathname === "/docs"
              ? "bg-foreground/[0.06] text-foreground font-semibold"
              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
        >
          <BookOpen className="w-[15px] h-[15px] text-muted-foreground" />
          {!collapsed && tr("Help & Docs")}
        </Link>
        <button
          onClick={handleSignOut}
          title={tr("Sign Out")}
          data-testid="sign-out"
          className={cn(
            "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors w-full",
            collapsed && "justify-center px-0"
          )}
        >
          <LogOut className="w-[15px] h-[15px] text-muted-foreground" />
          {!collapsed && tr("Sign Out")}
        </button>
      </div>
    </aside>
  );

  if (!isMobile) return sidebarContent;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={toggle}
        />
      )}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </div>
    </>
  );
};

export default DashboardSidebar;
