import { Link } from "react-router-dom";
import { Database, FileSpreadsheet, Plug, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSeoHead } from "@/lib/useSeoHead";

const categories = [
  { icon: Database, title: "Warehouses and databases", text: "Snowflake, BigQuery, PostgreSQL, SQL Server, SAP OData, and governed custom database connections." },
  { icon: Plug, title: "Business systems", text: "Salesforce, HubSpot, Microsoft Dynamics, NetSuite, Stripe, and approved API-based sources." },
  { icon: FileSpreadsheet, title: "Files and spreadsheets", text: "CSV, XLSX, Google Sheets, and controlled object-storage ingestion." },
  { icon: ShieldCheck, title: "Enterprise activation", text: "Credentials are tenant-scoped. Availability depends on customer configuration, provider access, and security review." },
];

export default function Integrations() {
  useSeoHead({
    title: "Enterprise Data Integrations | Quantivis",
    description: "Review supported Quantivis data-source categories, connector activation, security boundaries, and enterprise integration options.",
    canonicalPath: "/integrations",
  });

  return (
    <main className="max-w-5xl mx-auto px-6 py-16 space-y-10">
      <div className="max-w-3xl space-y-4">
        <p className="text-sm font-medium text-primary">Enterprise integrations</p>
        <h1 className="text-4xl font-semibold tracking-tight">Connect governed evidence, not an unchecked data exhaust.</h1>
        <p className="text-muted-foreground text-lg">
          Quantivis supports common warehouse, database, SaaS, file, and API integration patterns. Connector availability is verified per tenant before procurement commitments are made.
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {categories.map(({ icon: Icon, title, text }) => (
          <Card key={title}><CardContent className="pt-6 space-y-3">
            <Icon className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
          </CardContent></Card>
        ))}
      </div>
      <div className="flex gap-3">
        <Button asChild><Link to="/enterprise/contact">Verify your integration requirements</Link></Button>
        <Button variant="outline" asChild><Link to="/security">Review security controls</Link></Button>
      </div>
    </main>
  );
}
