import { useState } from "react";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Code, Database, Webhook, Upload, RefreshCw, Shield, Copy, Check, Terminal, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

const APIDocs = () => {
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null);

  const copyCode = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedBlock(id);
    setTimeout(() => setCopiedBlock(null), 2000);
  };

  const CopyButton = ({ id, code }: { id: string; code: string }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => copyCode(id, code)}
      className="absolute top-2 right-2 h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
    >
      {copiedBlock === id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </Button>
  );

  const CodeBlock = ({ id, code, lang = "bash" }: { id: string; code: string; lang?: string }) => (
    <div className="relative rounded-lg bg-muted/50 border border-border overflow-x-auto">
      <CopyButton id={id} code={code} />
      <pre className="p-4 text-xs font-mono text-foreground/90 whitespace-pre overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );

  const ingestExample = `curl -X POST \\
  https://<project-id>.supabase.co/functions/v1/api-ingest \\
  -H "Authorization: Bearer <YOUR_JWT>" \\
  -H "Content-Type: application/json" \\
  -H "x-request-id: $(uuidgen)" \\
  -d '{
    "dataset_name": "quarterly_revenue",
    "metric_type": "revenue",
    "records": [
      { "date": "2025-01-01", "value": 4200000, "region": "NA", "segment": "Enterprise" },
      { "date": "2025-02-01", "value": 4350000, "region": "NA", "segment": "Enterprise" },
      { "date": "2025-03-01", "value": 4100000, "region": "EMEA", "segment": "SMB" }
    ]
  }'`;

  const pythonExample = `import requests
import uuid

API_URL = "https://<project-id>.supabase.co/functions/v1/api-ingest"
HEADERS = {
    "Authorization": "Bearer <YOUR_JWT>",
    "Content-Type": "application/json",
    "x-request-id": str(uuid.uuid4()),
}

# Transform your DataFrame to Quantivis format
records = df.apply(lambda row: {
    "date": row["date"].isoformat(),
    "value": float(row["amount"]),
    "metric_type": row["metric"],
    "region": row.get("region", ""),
    "segment": row.get("segment", ""),
}, axis=1).tolist()

response = requests.post(API_URL, json={
    "dataset_name": "pipeline_output",
    "records": records,
}, headers=HEADERS)

result = response.json()
print(f"Inserted: {result['records_inserted']}, Rejected: {result['records_rejected']}")`;

  const webhookExample = `curl -X POST \\
  https://<project-id>.supabase.co/functions/v1/webhook-ingest \\
  -H "x-api-key: <YOUR_WEBHOOK_KEY>" \\
  -H "x-request-id: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d '{
    "records": [
      { "date": "2025-03-01", "metric_type": "churn_rate", "value": 2.4 },
      { "date": "2025-03-01", "metric_type": "mrr", "value": 125000 }
    ]
  }'`;

  const dbtExample = `# Post-hook in dbt_project.yml:
# on-run-end:
#   - "{{ run_shell('python scripts/quantivis_sync.py') }}"

import requests, json

with open("target/run_results.json") as f:
    artifact = json.load(f)

requests.post(
    "https://<project-id>.supabase.co/functions/v1/dbt-sync",
    headers={
        "Authorization": "Bearer <YOUR_JWT>",
        "Content-Type": "application/json",
    },
    json={
        "artifact_type": "run_results",
        "artifact": artifact,
    },
)`;

  const connectorExample = `# Connect to Amazon Redshift
curl -X POST \\
  https://<project-id>.supabase.co/functions/v1/db-connector \\
  -H "Authorization: Bearer <YOUR_JWT>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "action": "test",
    "organization_id": "<ORG_ID>",
    "connector_type": "redshift",
    "redshift_host": "my-cluster.abc123.us-east-1.redshift.amazonaws.com",
    "redshift_port": 5439,
    "redshift_database": "analytics",
    "redshift_user": "quantivis_reader",
    "redshift_password": "<PASSWORD>",
    "redshift_schema": "public"
  }'`;

  const endpoints = [
    {
      method: "POST",
      path: "/api-ingest",
      description: "Batch data ingestion (up to 50K records/request)",
      auth: "JWT or x-api-key",
      headers: ["x-request-id (required)", "x-dataset-id (optional)"],
      badge: "Core",
    },
    {
      method: "POST",
      path: "/webhook-ingest",
      description: "Webhook ingestion with API key auth and schema validation",
      auth: "x-api-key",
      headers: ["x-request-id (required)"],
      badge: "Core",
    },
    {
      method: "POST",
      path: "/db-connector",
      description: "Direct warehouse sync (PostgreSQL, Snowflake, BigQuery, Redshift)",
      auth: "JWT",
      headers: [],
      badge: "Connectors",
    },
    {
      method: "POST",
      path: "/dbt-sync",
      description: "dbt artifact sync (manifest, run_results, source freshness)",
      auth: "JWT or x-api-key",
      headers: [],
      badge: "Integration",
    },
    {
      method: "POST",
      path: "/generate-insights",
      description: "AI-powered insight generation from ingested metrics",
      auth: "JWT",
      headers: [],
      badge: "Intelligence",
    },
    {
      method: "POST",
      path: "/diagnostic-engine",
      description: "Root cause analysis with statistical grounding",
      auth: "JWT",
      headers: [],
      badge: "Intelligence",
    },
    {
      method: "POST",
      path: "/executive-copilot",
      description: "Strategic AI copilot for C-suite queries",
      auth: "JWT",
      headers: [],
      badge: "Intelligence",
    },
    {
      method: "POST",
      path: "/strategic-simulation",
      description: "Monte Carlo and war-room scenario modeling",
      auth: "JWT",
      headers: [],
      badge: "Simulation",
    },
    {
      method: "POST",
      path: "/pipeline-orchestrator",
      description: "Scheduled sync orchestration with retry logic",
      auth: "Service Role",
      headers: [],
      badge: "Ops",
    },
  ];

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-2">
          <SidebarMobileToggle />
          <Terminal className="w-6 h-6 text-primary" />
          <h1 className="text-[18px] font-semibold tracking-tight tracking-tight text-foreground">API Reference</h1>
          <Badge variant="outline" className="text-xs">v1</Badge>
        </div>
        <p className="text-sm text-muted-foreground mb-8 max-w-2xl">
          Programmatic access for data engineering teams. Ingest data from pipelines, sync warehouse schemas, and trigger intelligence — all via REST.
        </p>

        <Tabs defaultValue="quickstart" className="space-y-6">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="quickstart">Quick Start</TabsTrigger>
            <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
            <TabsTrigger value="connectors">Warehouse Connectors</TabsTrigger>
            <TabsTrigger value="dbt">dbt Integration</TabsTrigger>
          </TabsList>

          <TabsContent value="quickstart" className="space-y-6">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Upload className="w-4 h-4 text-primary" />
                  Batch Ingestion (cURL)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Send up to 50,000 records per request. Each request requires an idempotency key (<code className="text-xs bg-muted px-1 py-0.5 rounded">x-request-id</code>).
                </p>
                <CodeBlock id="ingest-curl" code={ingestExample} />
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Code className="w-4 h-4 text-primary" />
                  Python SDK Example
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Transform a pandas DataFrame and push to Quantivis from your Airflow DAG, dbt post-hook, or Jupyter notebook.
                </p>
                <CodeBlock id="python-sdk" code={pythonExample} lang="python" />
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Webhook className="w-4 h-4 text-primary" />
                  Webhook Ingestion
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Use API key auth for automated pipelines. Keys are SHA-256 hashed and never stored in plaintext.
                </p>
                <CodeBlock id="webhook-curl" code={webhookExample} />
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-border bg-muted/20">
                <CardContent className="pt-6">
                  <Shield className="w-5 h-5 text-primary mb-2" />
                  <h4 className="font-semibold text-sm mb-1">Idempotent</h4>
                  <p className="text-xs text-muted-foreground">
                    Every request requires <code className="bg-muted px-1 rounded">x-request-id</code>. Replays return the original result without re-processing.
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border bg-muted/20">
                <CardContent className="pt-6">
                  <Zap className="w-5 h-5 text-primary mb-2" />
                  <h4 className="font-semibold text-sm mb-1">50K Records/Request</h4>
                  <p className="text-xs text-muted-foreground">
                    Streaming batch insert with 1,000-record micro-batches. Partial success tracking per batch.
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border bg-muted/20">
                <CardContent className="pt-6">
                  <RefreshCw className="w-5 h-5 text-primary mb-2" />
                  <h4 className="font-semibold text-sm mb-1">Auto-Deduplication</h4>
                  <p className="text-xs text-muted-foreground">
                    Upsert on <code className="bg-muted px-1 rounded">org+metric+date+region+segment</code>. Send data repeatedly without duplicates.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="endpoints" className="space-y-4">
            {endpoints.map((ep, i) => (
              <Card key={i} className="border-border">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <Badge className="bg-green-500/15 text-green-600 border-green-500/30 font-mono text-xs">{ep.method}</Badge>
                      <code className="text-sm font-mono text-foreground">{ep.path}</code>
                      <Badge variant="outline" className="text-[10px]">{ep.badge}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">Auth: {ep.auth}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{ep.description}</p>
                  {ep.headers.length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {ep.headers.map((h, j) => (
                        <Badge key={j} variant="secondary" className="text-[10px] font-mono">{h}</Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="connectors" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {[
                { name: "PostgreSQL", status: "Full Sync", icon: "🐘" },
                { name: "Snowflake", status: "Full Sync", icon: "❄️" },
                { name: "BigQuery", status: "Full Sync", icon: "📊" },
                { name: "Amazon Redshift", status: "Full Sync", icon: "🔴" },
                { name: "MySQL", status: "Test + Connect", icon: "🐬" },
                { name: "SQL Server", status: "Test + Connect", icon: "🔷" },
              ].map((c) => (
                <Card key={c.name} className="border-border">
                  <CardContent className="pt-4 flex items-center gap-3">
                    <span className="text-2xl">{c.icon}</span>
                    <div>
                      <h4 className="font-semibold text-sm">{c.name}</h4>
                      <Badge variant={c.status === "Full Sync" ? "default" : "secondary"} className="text-[10px] mt-1">{c.status}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Database className="w-4 h-4 text-primary" />
                  Redshift Connection Example
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CodeBlock id="redshift-example" code={connectorExample} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dbt" className="space-y-6">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-primary" />
                  dbt Artifact Sync
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Push dbt artifacts to Quantivis for automated data quality monitoring. Supports <code className="bg-muted px-1 py-0.5 rounded text-xs">manifest.json</code>, <code className="bg-muted px-1 py-0.5 rounded text-xs">run_results.json</code>, and source freshness results.
                </p>
                <CodeBlock id="dbt-example" code={dbtExample} lang="python" />

                <div className="mt-6 space-y-3">
                  <h4 className="font-semibold text-sm">Supported Artifact Types</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-3 border border-border rounded-lg">
                      <Badge variant="outline" className="text-[10px] mb-2">manifest</Badge>
                      <p className="text-xs text-muted-foreground">Syncs model metadata, column descriptions, and DAG dependencies for lineage tracking.</p>
                    </div>
                    <div className="p-3 border border-border rounded-lg">
                      <Badge variant="outline" className="text-[10px] mb-2">run_results</Badge>
                      <p className="text-xs text-muted-foreground">Captures test pass/fail rates, alerting on failures via audit log and quality checks.</p>
                    </div>
                    <div className="p-3 border border-border rounded-lg">
                      <Badge variant="outline" className="text-[10px] mb-2">sources</Badge>
                      <p className="text-xs text-muted-foreground">Monitors source freshness, flagging stale upstream data before it impacts decisions.</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
};

export default APIDocs;
