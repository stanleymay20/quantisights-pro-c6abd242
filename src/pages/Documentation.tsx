import { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { BookOpen, Download, ChevronRight } from "lucide-react";
import { DOC_SECTIONS, type DocSection } from "@/data/documentation-sections";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

/* ─── Downloadable section component ─── */
const DocSectionCard = ({
  section,
  sectionRef,
}: {
  section: DocSection;
  sectionRef: (el: HTMLDivElement | null) => void;
}) => {
  const handleDownload = () => {
    const blob = new Blob(
      [`# ${section.title}\n\n${section.content.trim()}`],
      { type: "text/markdown" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quantivis-${section.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div ref={sectionRef} id={section.id} className="glass-card rounded-xl p-8 scroll-mt-20">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <section.icon className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold tracking-tight">{section.title}</h2>
        </div>
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Download .md
        </button>
      </div>
      <div className="prose prose-sm prose-invert max-w-none
        prose-headings:tracking-tight prose-headings:text-foreground
        prose-h2:text-base prose-h2:mt-0 prose-h2:mb-3
        prose-h3:text-sm prose-h3:mt-6 prose-h3:mb-2
        prose-p:text-muted-foreground prose-p:text-[13px] prose-p:leading-relaxed
        prose-li:text-muted-foreground prose-li:text-[13px]
        prose-strong:text-foreground
        prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
        prose-pre:bg-muted/30 prose-pre:border prose-pre:border-border/30
        prose-table:text-[12px]
        prose-th:text-foreground prose-th:font-semibold prose-th:border-border/50 prose-th:px-3 prose-th:py-2
        prose-td:text-muted-foreground prose-td:border-border/30 prose-td:px-3 prose-td:py-1.5
      ">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.content.trim()}</ReactMarkdown>
      </div>
    </div>
  );
};

/* ─── Main Page ─── */
const Documentation = () => {
  const [activeSection, setActiveSection] = useState(DOC_SECTIONS[0].id);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const handleDownloadAll = () => {
    const fullDoc = DOC_SECTIONS.map(
      (s) => `# ${s.title}\n\n${s.content.trim()}`
    ).join("\n\n---\n\n");
    const blob = new Blob([fullDoc], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quantivis-full-documentation.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const scrollTo = (id: string) => {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <SectionErrorBoundary sectionName="Documentation">
    <>
      <header className="h-14 border-b border-border/30 flex items-center justify-between px-8 shrink-0 bg-background/60 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <SidebarMobileToggle />
          <BookOpen className="w-5 h-5 text-primary" />
          <h1 className="text-[18px] font-semibold tracking-tight">Documentation</h1>
        </div>
        <button
          onClick={handleDownloadAll}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Download className="w-4 h-4" />
          Download All (.md)
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* TOC Sidebar */}
        <nav className="w-56 shrink-0 border-r border-border/30 overflow-y-auto py-4 px-3 hidden lg:block">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-3 mb-3">
            Contents ({DOC_SECTIONS.length} sections)
          </p>
          {DOC_SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[12px] font-medium transition-colors ${
                activeSection === s.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              }`}
            >
              <s.icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{s.title}</span>
              {activeSection === s.id && (
                <ChevronRight className="w-3 h-3 ml-auto shrink-0" />
              )}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-[900px] mx-auto space-y-6">
            {DOC_SECTIONS.map((s) => (
              <DocSectionCard
                key={s.id}
                section={s}
                sectionRef={(el) => {
                  sectionRefs.current[s.id] = el;
                }}
              />
            ))}
          </div>
        </main>
      </div>
    </>
    </SectionErrorBoundary>
  );
};

export default Documentation;
