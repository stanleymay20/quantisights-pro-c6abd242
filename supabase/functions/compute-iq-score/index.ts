// Computes 7-dimension Information Quality scores per dataset.
// Reference: Data Engineering (Chan/Talburt/Talley, 2010), Ch. 14.
// Dimensions: accuracy, completeness, consistency, timeliness, relevance, accessibility, believability.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getCorsHeaders } from '../_shared/cors.ts';
import { requireCronOrOrgMember } from '../_shared/cron-or-user.ts';

interface Body { organization_id: string; dataset_id?: string }

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const correlationId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const body = (await req.json()) as Body;
    if (!body?.organization_id) {
      return new Response(JSON.stringify({ error: 'organization_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const guard = await requireCronOrOrgMember(req, body.organization_id);
    if (!guard.ok) return guard.response;
    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Pull metrics for the dataset (cap at 10k for runtime safety)
    const { data: metrics, error: mErr } = await supa
      .from('metrics')
      .select('id, value, date, metric_type, dataset_id, created_at')
      .eq('organization_id', body.organization_id)
      .eq('dataset_id', body.dataset_id ?? '')
      .limit(10000);
    if (mErr) throw mErr;
    const rows = metrics ?? [];
    const N = rows.length;

    if (N === 0) {
      return new Response(JSON.stringify({ status: 'no_data', message: 'No metrics found for dataset', correlationId }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- 1. Completeness: non-null values / total ---
    const nonNull = rows.filter(r => r.value !== null && r.value !== undefined).length;
    const completeness = Math.round((nonNull / N) * 100);

    // --- 2. Accuracy: % within 3σ of mean per metric_type (outlier-free) ---
    const byType = new Map<string, number[]>();
    for (const r of rows) {
      if (r.value == null) continue;
      const arr = byType.get(r.metric_type) ?? [];
      arr.push(Number(r.value));
      byType.set(r.metric_type, arr);
    }
    let inBounds = 0, total = 0;
    for (const arr of byType.values()) {
      if (arr.length < 8) { inBounds += arr.length; total += arr.length; continue; }
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      const sd = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
      const lo = mean - 3 * sd, hi = mean + 3 * sd;
      inBounds += arr.filter(v => v >= lo && v <= hi).length;
      total += arr.length;
    }
    const accuracy = total ? Math.round((inBounds / total) * 100) : 100;

    // --- 3. Consistency: dates non-duplicated per (metric_type, date) ---
    const seen = new Set<string>();
    let dups = 0;
    for (const r of rows) {
      const key = `${r.metric_type}|${r.date}`;
      if (seen.has(key)) dups++; else seen.add(key);
    }
    const consistency = Math.round(((N - dups) / N) * 100);

    // --- 4. Timeliness: latest record age vs 30d window ---
    const latestMs = Math.max(...rows.map(r => new Date(r.date).getTime()));
    const ageDays = (Date.now() - latestMs) / 86400000;
    const timeliness = ageDays <= 7 ? 100 : ageDays <= 30 ? 80 : ageDays <= 90 ? 60 : ageDays <= 180 ? 40 : 20;

    // --- 5. Relevance: % of metric_types that map to known KPI types ---
    const KNOWN_KPIS = new Set(['revenue','cost','churn','conversion','retention','ltv','cac','arpu','nps','margin','growth','users','sales','traffic','spend','profit','expenses']);
    const types = [...byType.keys()];
    const known = types.filter(t => [...KNOWN_KPIS].some(k => t.toLowerCase().includes(k))).length;
    const relevance = types.length ? Math.round((known / types.length) * 100) : 0;

    // --- 6. Accessibility: dataset is active + has recent reads (proxy via row count) ---
    const accessibility = N >= 100 ? 100 : N >= 30 ? 80 : N >= 8 ? 60 : 30;

    // --- 7. Believability: % of values with provenance (data_origin = 'client') ---
    const { count: clientCount } = await supa
      .from('metrics')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', body.organization_id)
      .eq('dataset_id', body.dataset_id ?? '')
      .eq('data_origin', 'client');
    const believability = N ? Math.round(((clientCount ?? 0) / N) * 100) : 0;

    const scores = [
      { dimension: 'completeness', score: completeness, sample_size: N, details: { non_null: nonNull } },
      { dimension: 'accuracy', score: accuracy, sample_size: total, details: { within_3sigma: inBounds } },
      { dimension: 'consistency', score: consistency, sample_size: N, details: { duplicates: dups } },
      { dimension: 'timeliness', score: timeliness, sample_size: N, details: { latest_age_days: Math.round(ageDays) } },
      { dimension: 'relevance', score: relevance, sample_size: types.length, details: { known_kpis: known, total_types: types.length } },
      { dimension: 'accessibility', score: accessibility, sample_size: N, details: { row_count: N } },
      { dimension: 'believability', score: believability, sample_size: N, details: { client_sourced: clientCount ?? 0 } },
    ];

    const inserts = scores.map(s => ({
      organization_id: body.organization_id,
      dataset_id: body.dataset_id ?? null,
      ...s,
    }));

    const { error: iErr } = await supa.from('iq_dimension_scores').insert(inserts);
    if (iErr) throw iErr;

    const composite = Math.round(scores.reduce((a, b) => a + b.score, 0) / scores.length);
    return new Response(JSON.stringify({ status: 'ok', composite, scores, correlationId }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('compute-iq-score error', e, correlationId);
    return new Response(JSON.stringify({ error: (e as Error).message, correlationId }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
