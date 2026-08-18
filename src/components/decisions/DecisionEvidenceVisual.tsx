import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, FileQuestion, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DecisionVisualizationSelection } from "@/lib/decision-visualization";

interface DecisionEvidenceVisualProps {
  decisionId: string;
  selection: DecisionVisualizationSelection;
}

const DataTable = ({ selection }: { selection: DecisionVisualizationSelection }) => (
  <table className="w-full text-sm" aria-label="Decision visual data table">
    <thead>
      <tr className="border-b text-left text-xs text-muted-foreground">
        <th className="py-2 pr-3 font-medium">Measure</th>
        <th className="py-2 font-medium">Recorded value</th>
      </tr>
    </thead>
    <tbody>
      {selection.data.map((item) => (
        <tr key={item.source} className="border-b border-border/40 last:border-0">
          <td className="py-2 pr-3">{item.label}</td>
          <td className="py-2 font-medium">{item.displayValue}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const DecisionEvidenceVisual = ({ decisionId, selection }: DecisionEvidenceVisualProps) => {
  const chartDescription = `${selection.title}. ${selection.data
    .map((item) => `${item.label}: ${item.displayValue}`)
    .join(". ")}`;

  return (
    <section
      className="rounded-xl border border-border/50 bg-card p-5 shadow-sm"
      aria-labelledby="decision-visual-title"
      data-testid="decision-visual"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 id="decision-visual-title" className="font-semibold">Decision Visual</h2>
            <Badge variant="outline">Auto-selected</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{selection.title}</p>
        </div>
        <Badge variant="secondary" className="capitalize">
          {selection.kind.replaceAll("_", " ")}
        </Badge>
      </div>

      <p className="mt-4 text-base font-medium" data-testid="decision-visual-takeaway">
        {selection.takeaway}
      </p>

      <div className="mt-4">
        {selection.kind === "simple_text" && (
          <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Decision-critical recorded values">
            {selection.data.map((item) => (
              <div key={item.source} className="rounded-lg border border-border/40 bg-muted/30 p-4">
                <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{item.displayValue}</p>
              </div>
            ))}
          </div>
        )}

        {selection.kind === "actual_vs_expected" && (
          <div className="space-y-3">
            <div className="h-64 w-full" role="img" aria-label={chartDescription}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={selection.data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={56} />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <DataTable selection={selection} />
          </div>
        )}

        {selection.kind === "horizontal_bar" && (
          <div className="space-y-3">
            <div className="h-72 w-full" role="img" aria-label={chartDescription}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={selection.data}
                  layout="vertical"
                  margin={{ top: 8, right: 16, left: 16, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={140} />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <DataTable selection={selection} />
          </div>
        )}

        {selection.kind === "comparison_table" && <DataTable selection={selection} />}

        {selection.kind === "none" && (
          <div className="flex items-start gap-3 rounded-lg border border-dashed border-border/60 bg-muted/20 p-4">
            <FileQuestion className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="font-medium">{selection.unavailableReason}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Quantivis will wait for structured evidence rather than manufacture a persuasive-looking chart.
              </p>
            </div>
          </div>
        )}
      </div>

      <details className="mt-5 rounded-lg border border-border/40 p-4">
        <summary className="cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Why this visualization?
        </summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected because</p>
            <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
              {selection.reasons.map((reason) => (
                <li key={reason} className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Alternatives rejected</p>
            <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
              {selection.rejected.slice(0, 5).map((item) => (
                <li key={item.kind}>
                  <span className="font-medium text-foreground capitalize">{item.kind.replaceAll("_", " ")}:</span>{" "}
                  {item.reason}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-4">
        <div className="text-xs text-muted-foreground">
          <p>This visualization is a representation of recorded evidence, not source evidence itself.</p>
          <p className="mt-1 break-words font-mono text-[10px]">
            {selection.provenance.length > 0 ? selection.provenance.join(" · ") : "No renderable numeric provenance fields"}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/evidence-pack/${decisionId}`}>Inspect source evidence</Link>
        </Button>
      </div>
    </section>
  );
};

export default DecisionEvidenceVisual;
