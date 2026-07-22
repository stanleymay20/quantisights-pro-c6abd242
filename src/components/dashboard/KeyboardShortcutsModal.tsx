import { useState, useEffect } from "react";
import { Keyboard, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const SHORTCUTS = [
  { keys: ["J"], action: "Next item in queue" },
  { keys: ["K"], action: "Previous item in queue" },
  { keys: ["A"], action: "Approve current decision" },
  { keys: ["D"], action: "Dismiss current decision" },
  { keys: ["M"], action: "Modify current decision" },
  { keys: ["?"], action: "Toggle this shortcuts panel" },
];

const KeyboardShortcutsModal = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen((p) => !p);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      {/* Trigger button in sidebar footer / header */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors w-full"
        title="Keyboard shortcuts (?)"
      >
        <Keyboard className="w-[15px] h-[15px] text-muted-foreground" />
        Shortcuts
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="shortcuts-dialog-title"
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.2 }}
              className="bg-card border border-border/50 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 pb-3 border-b border-border/30">
                <div className="flex items-center gap-2.5">
                  <Keyboard className="w-5 h-5 text-primary" />
                  <h2 id="shortcuts-dialog-title" className="text-base font-bold tracking-tight">Keyboard Shortcuts</h2>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close keyboard shortcuts"
                  className="p-1.5 rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-2">
                {SHORTCUTS.map((s) => (
                  <div key={s.action} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-muted-foreground">{s.action}</span>
                    <div className="flex gap-1">
                      {s.keys.map((k) => (
                        <kbd
                          key={k}
                          className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-md bg-muted border border-border text-xs font-mono font-semibold text-foreground"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-5 pb-4">
                <p className="text-[11px] text-muted-foreground/70 text-center">
                  Press <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-mono">?</kbd> anywhere to toggle
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default KeyboardShortcutsModal;
