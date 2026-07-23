import { useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import logo from "@/assets/quantivis-logo.png";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Scale, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const rights = [
  { label: "Access (Art. 15)", desc: "Receive a copy of personal data we hold about you." },
  { label: "Rectification (Art. 16)", desc: "Correct inaccurate or incomplete data." },
  { label: "Erasure (Art. 17)", desc: "Request deletion of your data — the 'right to be forgotten'." },
  { label: "Restriction (Art. 18)", desc: "Limit how we process your data." },
  { label: "Portability (Art. 20)", desc: "Receive your data in a machine-readable format." },
  { label: "Objection (Art. 21)", desc: "Object to certain processing, including profiling." },
  { label: "Automated-decision opt-out (Art. 22)", desc: "Not be subject to solely automated decisions with legal effect." },
  { label: "Complaint (Art. 77)", desc: "Lodge a complaint with a supervisory authority." },
];

const workflow = [
  { stage: "1. Request", desc: "You submit the form below; we acknowledge within 72 h." },
  { stage: "2. Verification", desc: "We verify your identity to prevent unauthorised disclosure." },
  { stage: "3. Execution", desc: "We carry out the request across all systems (app DB, backups, sub-processors)." },
  { stage: "4. Certification", desc: "We confirm completion in writing within 30 days." },
];

const requestSchema = z.object({
  requester_email: z.string().trim().email("Invalid email").max(254),
  request_type: z.enum([
    "access", "rectification", "erasure", "restriction",
    "portability", "objection", "automated_decision_opt_out", "complaint",
  ]),
  organization_context: z.string().trim().max(200).optional(),
  message: z.string().trim().max(2000).optional(),
  // Honeypot — bots will fill this; humans won't see it.
  website: z.string().max(0, "Bot detected").optional(),
});

const GDPRRights = () => {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const raw = {
      requester_email: String(form.get("requester_email") ?? ""),
      request_type: String(form.get("request_type") ?? "") as any,
      organization_context: String(form.get("organization_context") ?? "") || undefined,
      message: String(form.get("message") ?? "") || undefined,
      website: String(form.get("website") ?? ""),
    };

    const parsed = requestSchema.safeParse(raw);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("gdpr_requests").insert({
      requester_email: parsed.data.requester_email.toLowerCase(),
      request_type: parsed.data.request_type,
      organization_context: parsed.data.organization_context ?? null,
      message: parsed.data.message ?? null,
      honeypot_triggered: false,
      user_agent: navigator.userAgent.slice(0, 500),
    });
    setSubmitting(false);

    if (error) {
      if (error.code === "23505") {
        toast.error("You already submitted this request type in the last hour. Please wait.");
      } else {
        toast.error("Could not submit. Please email privacy@quantivis.io directly.");
      }
      return;
    }
    setSubmitted(true);
    toast.success("Request received. We will acknowledge within 72 hours.");
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="container mx-auto px-6 h-14 flex items-center">
          <Link to="/"><img src={logo} alt="Quantivis Global" className="h-8" /></Link>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-6 py-12 max-w-3xl">
        <div className="flex items-center gap-3 mb-2">
          <Scale className="w-7 h-7 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Your GDPR Rights</h1>
        </div>
        <p className="text-muted-foreground text-sm mb-8 max-w-2xl">
          Exercise any of the eight rights below at any time. Quantivis responds within 30 days as
          required by Art. 12 (3) GDPR — usually much sooner.
        </p>

        {/* SLA card */}
        <Card className="border-primary/30 bg-primary/[0.02] mb-6">
          <CardContent className="pt-5 flex items-center gap-3">
            <Clock className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">30-day deletion / response SLA</p>
              <p className="text-xs text-muted-foreground">
                Acknowledgement within 72 hours · Full execution within 30 days · Certification of completion in writing.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Rights list */}
        <Card className="border-border/50 mb-6">
          <CardContent className="pt-5">
            <h2 className="text-base font-semibold mb-3">The Eight Rights</h2>
            <ul className="space-y-2">
              {rights.map((r) => (
                <li key={r.label} className="grid grid-cols-[200px,1fr] gap-3 text-sm py-1.5 border-b border-border/20 last:border-0">
                  <div className="font-medium">{r.label}</div>
                  <div className="text-muted-foreground">{r.desc}</div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Workflow */}
        <Card className="border-border/50 mb-6">
          <CardContent className="pt-5">
            <h2 className="text-base font-semibold mb-3">Deletion Workflow</h2>
            <div className="grid sm:grid-cols-4 gap-3">
              {workflow.map((w) => (
                <div key={w.stage} className="border border-border/40 rounded-md p-3">
                  <p className="text-xs font-semibold mb-1">{w.stage}</p>
                  <p className="text-[11px] text-muted-foreground">{w.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Form */}
        <Card className="border-border/50">
          <CardContent className="pt-5">
            <h2 className="text-base font-semibold mb-3">Submit a Request</h2>
            {submitted ? (
              <div className="flex items-start gap-3 p-4 rounded-md border border-green-500/30 bg-green-500/5">
                <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Request received</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    A confirmation will be sent to your email within 72 hours.
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Honeypot — visually hidden from humans */}
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  className="absolute -left-[9999px] w-px h-px opacity-0"
                  aria-hidden="true"
                />

                <div>
                  <Label htmlFor="requester_email">Email *</Label>
                  <Input id="requester_email" name="requester_email" type="email" required maxLength={254} placeholder="you@example.com" />
                </div>

                <div>
                  <Label htmlFor="request_type">Request type *</Label>
                  <Select name="request_type" required>
                    <SelectTrigger id="request_type"><SelectValue placeholder="Choose…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="access">Access (Art. 15)</SelectItem>
                      <SelectItem value="rectification">Rectification (Art. 16)</SelectItem>
                      <SelectItem value="erasure">Erasure (Art. 17)</SelectItem>
                      <SelectItem value="restriction">Restriction (Art. 18)</SelectItem>
                      <SelectItem value="portability">Portability (Art. 20)</SelectItem>
                      <SelectItem value="objection">Objection (Art. 21)</SelectItem>
                      <SelectItem value="automated_decision_opt_out">Automated-decision opt-out (Art. 22)</SelectItem>
                      <SelectItem value="complaint">Complaint (Art. 77)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="organization_context">Organization (optional)</Label>
                  <Input id="organization_context" name="organization_context" maxLength={200} placeholder="If you know which customer organization handles your data" />
                </div>

                <div>
                  <Label htmlFor="message">Message (optional)</Label>
                  <Textarea id="message" name="message" maxLength={2000} rows={4} placeholder="Details of your request…" />
                </div>

                <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>Identity will be verified before any data is disclosed or deleted. Limit: one request of the same type per hour.</span>
                </div>

                <Button type="submit" disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit request"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default GDPRRights;
