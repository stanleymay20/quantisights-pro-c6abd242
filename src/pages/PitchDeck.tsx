import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/quantivis-logo.png";
import { generatePitchDeckPDF } from "@/lib/pitch-deck-pdf";
import { SLIDES } from "@/components/pitch-deck/SlideData";

const PitchDeck = () => {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await generatePitchDeckPDF();
    } catch (e) {
      console.error("PDF generation failed", e);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-2xl">
        <div className="container mx-auto flex items-center justify-between py-4 px-6">
          <Link to="/" className="flex items-center gap-3">
            <img src={logo} alt="Quantivis" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={downloading}
              className="hidden sm:inline-flex"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {downloading ? "Generating…" : "Download PDF"}
            </Button>
            <Link to="/pitch" className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:border-primary/30 transition-all hidden sm:inline-flex">
              One-Pager
            </Link>
            <Link to="/demo" className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all">
              Live Demo
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-6 text-center mb-12">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">Berkeley 2-Minute Pitch</h1>
            <p className="text-muted-foreground mb-1">Quantivis · Governed Operational Reasoning Infrastructure</p>
            <p className="text-xs text-muted-foreground mb-6">Stanley Osei-Wusu (Founder) · Souley Kassoum (Co-Founder)</p>
            <Button onClick={handleDownload} disabled={downloading} size="lg" className="gap-2">
              {downloading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
              {downloading ? "Generating PDF…" : "Download Pitch Deck"}
            </Button>
          </motion.div>
        </div>

        <div className="max-w-2xl mx-auto px-6 space-y-6">
          {SLIDES.map((slide) => (
            <motion.div
              key={slide.number}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              className="rounded-2xl border border-border bg-card p-6 sm:p-8"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <slide.icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Slide {slide.number} / {SLIDES.length}</p>
                  <p className="font-bold text-sm">{slide.title}</p>
                </div>
              </div>
              {slide.content}
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default PitchDeck;
