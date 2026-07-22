import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Upload, Sparkles, Loader2, FileText, Building2, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import Papa from "papaparse";

const DEMO_DATA = `Revenue Q1: €2.4M, Q2: €2.1M, Q3: €1.9M, Q4: €2.0M
Customer Churn: 8.2% (up from 5.1% last year)
CAC: €340 (industry avg: €220)
LTV: €1,800 (down 12% YoY)
Gross Margin: 62% (target: 70%)
Sales Pipeline: €4.2M (conversion rate: 18%)
Employee Turnover: 22%
NPS: 34 (was 48 last year)`;

const FreeAnalysis = () => {
  const { toast } = useToast();
  const [step, setStep] = useState<"input" | "analyzing" | "result">("input");
  const [metrics, setMetrics] = useState("");
  const [companyContext, setCompanyContext] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith(".csv")) {
      Papa.parse(file, {
        header: true,
        complete: (results) => {
          const summary = results.data.slice(0, 50);
          setMetrics(JSON.stringify(summary, null, 2));
          toast({ title: "CSV loaded", description: `${results.data.length} rows parsed.` });
        },
      });
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setMetrics(ev.target?.result as string || "");
        toast({ title: "File loaded" });
      };
      reader.readAsText(file);
    }
  };

  const runAnalysis = async () => {
    if (!metrics.trim()) {
      toast({ title: "Please provide business data", variant: "destructive" });
      return;
    }

    setStep("analyzing");
    setAnalysis("");
    setIsStreaming(true);

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/strategy-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ metrics, companyContext }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Analysis failed" }));
        throw new Error(err.error || "Analysis failed");
      }

      if (!resp.body) throw new Error("No response stream");

      setStep("result");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullText += content;
              setAnalysis(fullText);
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (err: unknown) {
      toast({ title: "Analysis failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
      setStep("input");
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background">
      <Navbar />
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-6 max-w-4xl">

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-primary/5 text-xs font-semibold text-primary mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              Free AI-Powered Business Diagnosis
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">
              Discover What Your Business Is{" "}
              <span className="gradient-text">Really Telling You</span>
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">
              Paste your key metrics or upload a CSV. Our AI will diagnose your business
              like a top-tier strategy consultant — identifying hidden losses, root causes,
              and high-impact actions.
            </p>
          </motion.div>

          <AnimatePresence mode="wait">
            {/* INPUT STEP */}
            {step === "input" && (
              <motion.div
                key="input"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Company context */}
                <div className="border border-border rounded-xl bg-card/80 p-6">
                  <label className="flex items-center gap-2 text-sm font-medium mb-2">
                    <Building2 className="w-4 h-4 text-primary" />
                    Company Context <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <Input
                    placeholder="e.g. B2B SaaS, 50 employees, Series A, targeting European market"
                    value={companyContext}
                    onChange={(e) => setCompanyContext(e.target.value)}
                  />
                </div>

                {/* Metrics input */}
                <div className="border border-border rounded-xl bg-card/80 p-6">
                  <label className="flex items-center gap-2 text-sm font-medium mb-2">
                    <FileText className="w-4 h-4 text-primary" />
                    Your Business Data
                  </label>
                  <Textarea
                    placeholder="Paste your key metrics here: revenue, costs, growth rates, churn, margins, team size, pipeline..."
                    value={metrics}
                    onChange={(e) => setMetrics(e.target.value)}
                    className="min-h-[200px] font-mono text-sm"
                  />
                  <div className="flex flex-wrap items-center gap-3 mt-4">
                    <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-border hover:border-primary/40 cursor-pointer transition-colors text-sm text-muted-foreground hover:text-foreground">
                      <Upload className="w-4 h-4" />
                      Upload CSV
                      <input type="file" accept=".csv,.txt,.json" className="hidden" onChange={handleFileUpload} />
                    </label>
                    <span className="text-xs text-muted-foreground">or</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMetrics(DEMO_DATA)}
                      className="text-primary"
                    >
                      Use Demo Data
                    </Button>
                  </div>
                </div>

                <div className="flex justify-center">
                  <Button
                    onClick={runAnalysis}
                    size="lg"
                    className="gap-2 px-10 py-4 text-base rounded-xl shadow-lg shadow-primary/25"
                    disabled={!metrics.trim()}
                  >
                    <Sparkles className="w-4 h-4" />
                    Run Free Business Analysis
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>

                <p className="text-center text-xs text-muted-foreground">
                  No account required · Your data is not stored · Results in ~15 seconds
                </p>
              </motion.div>
            )}

            {/* ANALYZING STEP */}
            {step === "analyzing" && (
              <motion.div
                key="analyzing"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-20"
              >
                <Loader2 className="w-12 h-12 text-primary animate-spin mb-6" />
                <h2 className="text-[16px] font-semibold mb-2">Analyzing your business...</h2>
                <p className="text-muted-foreground text-sm">
                  Running diagnostic models, detecting anomalies, estimating hidden losses
                </p>
              </motion.div>
            )}

            {/* RESULT STEP */}
            {step === "result" && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8"
              >
                <div
                  ref={resultRef}
                  className="border border-border rounded-xl bg-card/80 p-6 sm:p-10"
                >
                  <div className="flex items-center gap-2 mb-6">
                    <Sparkles className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold">Your Business Diagnosis</h2>
                    {isStreaming && <Loader2 className="w-4 h-4 animate-spin text-primary ml-2" />}
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{analysis}</ReactMarkdown>
                  </div>
                </div>

                {/* Conversion CTA */}
                {!isStreaming && analysis.length > 100 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="border border-primary/20 rounded-xl bg-primary/5 p-8 text-center"
                  >
                    <h3 className="text-[16px] font-semibold tracking-tight mb-2">
                      Want deeper insights? Continuous monitoring?
                    </h3>
                    <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                      Connect your full data to unlock automated decision intelligence,
                      calibrated forecasting, and board-ready reports — updated in real time.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <Link
                        to="/register"
                        className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:brightness-110 transition-all shadow-lg shadow-primary/25"
                      >
                        Activate Quantivis <ArrowRight className="w-4 h-4" />
                      </Link>
                      <Link
                        to="/demo"
                        className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-xl border border-border bg-card/50 text-foreground font-semibold hover:border-primary/30 transition-all"
                      >
                        Explore Full Demo
                      </Link>
                    </div>
                  </motion.div>
                )}

                <div className="flex justify-center">
                  <Button
                    variant="ghost"
                    onClick={() => { setStep("input"); setAnalysis(""); }}
                    className="gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" /> Run Another Analysis
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default FreeAnalysis;
