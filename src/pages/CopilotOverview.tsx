import { Link } from "react-router-dom";
import { Bot, FileSearch, History, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSeoHead } from "@/lib/useSeoHead";

const capabilities = [
  { icon: FileSearch, title: "Evidence-grounded answers", text: "Queries are resolved against permitted organizational evidence and decision context." },
  { icon: History, title: "Decision history", text: "Answers can reference prior decisions, outcomes, and recorded rationale when the tenant has that evidence." },
  { icon: ShieldCheck, title: "Governed access", text: "The operational Copilot requires authentication and respects configured tenant roles and data boundaries." },
];

export default function CopilotOverview() {
  useSeoHead({
    title: "Governed Executive Copilot | Quantivis",
    description: "Use the Quantivis executive copilot to query governed evidence, decision history, and operational intelligence.",
    canonicalPath: "/copilot",
  });

  return (
    <main className="max-w-5xl mx-auto px-6 py-16 space-y-10">
      <div className="max-w-3xl space-y-4">
        <p className="text-sm font-medium text-primary">Governed Executive Copilot</p>
        <h1 className="text-4xl font-semibold tracking-tight">Ask operational questions without separating the answer from its evidence.</h1>
        <p className="text-muted-foreground text-lg">
          The Quantivis Copilot is an authenticated application capability. This public overview explains its scope without presenting a login screen as a buyer experience.
        </p>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {capabilities.map(({ icon: Icon, title, text }) => (
          <Card key={title}><CardContent className="pt-6 space-y-3">
            <Icon className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{text}</p>
          </CardContent></Card>
        ))}
      </div>
      <div className="flex gap-3">
        <Button asChild><Link to="/demo"><Bot className="w-4 h-4 mr-2" />Request a governed demo</Link></Button>
        <Button variant="outline" asChild><Link to="/login">Customer sign in</Link></Button>
      </div>
    </main>
  );
}
