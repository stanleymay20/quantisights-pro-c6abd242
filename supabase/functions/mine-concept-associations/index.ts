// Concept-Association Mining from decision/advisory corpus.
// Reference: Data Engineering (Chan/Talburt/Talley, 2010), Ch. 11.
// Computes support / confidence / lift on noun-phrase pairs in the last N days.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getCorsHeaders } from '../_shared/cors.ts';
import { requireCronOrOrgMember } from '../_shared/cron-or-user.ts';

// Stop-word list (English, business-focused)
const STOP = new Set([
  'the','a','an','and','or','but','of','to','in','for','on','at','by','with','from','as','is','are','was','were','be','been','being',
  'this','that','these','those','it','its','we','you','our','their','they','i','he','she','will','can','may','should','could','would',
  'has','have','had','do','does','did','if','then','than','so','not','no','yes','about','into','over','under','out','up','down',
  'data','value','values','metric','metrics','number','total','one','two','three','more','less','very','also','any','all','some','each','every',
]);

function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 4 && t.length <= 24 && !STOP.has(t) && !/^\d+$/.test(t));
}

function extractConcepts(text: string): Set<string> {
  // unigrams + bigrams (multi-word concepts per Ch 11.3.1)
  const tokens = tokenize(text);
  const set = new Set<string>();
  for (const t of tokens) set.add(t);
  for (let i = 0; i + 1 < tokens.length; i++) {
    const bg = `${tokens[i]} ${tokens[i + 1]}`;
    if (bg.length <= 32) set.add(bg);
  }
  return set;
}

interface Body { organization_id: string; window_days?: number; min_support?: number; max_pairs?: number }

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
    const windowDays = body.window_days ?? 30;
    const minSupport = body.min_support ?? 0.02; // 2% of corpus
    const maxPairs = body.max_pairs ?? 200;

    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const since = new Date(Date.now() - windowDays * 86400000).toISOString();

    // Pull text corpus from decisions + advisories + insights
    const [{ data: dec }, { data: adv }, { data: ins }] = await Promise.all([
      supa.from('decision_ledger').select('id, notes, recommended_action, chosen_action, source_insight_summary').eq('organization_id', body.organization_id).gte('created_at', since).limit(2000),
      supa.from('advisory_instances').select('id, title, action, rationale, expected_impact').eq('organization_id', body.organization_id).gte('created_at', since).limit(2000),
      supa.from('insights').select('id, message').eq('organization_id', body.organization_id).gte('created_at', since).limit(2000),
    ]);

    const docs: Set<string>[] = [];
    for (const d of dec ?? []) {
      const t = [d.notes, d.recommended_action, d.chosen_action, d.source_insight_summary].filter(Boolean).join(' ');
      if (t) docs.push(extractConcepts(t));
    }
    for (const a of adv ?? []) {
      const t = [a.title, a.action, a.rationale, a.expected_impact].filter(Boolean).join(' ');
      if (t) docs.push(extractConcepts(t));
    }
    for (const i of ins ?? []) {
      if (i.message) docs.push(extractConcepts(i.message));
    }

    const corpusSize = docs.length;
    if (corpusSize < 5) {
      return new Response(JSON.stringify({ status: 'insufficient_corpus', corpus_size: corpusSize, correlationId }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Count concept occurrences + pair co-occurrences
    const conceptCount = new Map<string, number>();
    const pairCount = new Map<string, number>();
    for (const doc of docs) {
      const arr = [...doc];
      for (const c of arr) conceptCount.set(c, (conceptCount.get(c) ?? 0) + 1);
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const [a, b] = arr[i] < arr[j] ? [arr[i], arr[j]] : [arr[j], arr[i]];
          const k = `${a}\u0001${b}`;
          pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
        }
      }
    }

    const minCoCount = Math.max(2, Math.ceil(minSupport * corpusSize));
    const rows: Array<{ a: string; b: string; co: number; sup: number; conf: number; lift: number }> = [];
    for (const [k, co] of pairCount) {
      if (co < minCoCount) continue;
      const [a, b] = k.split('\u0001');
      const ca = conceptCount.get(a) ?? 0;
      const cb = conceptCount.get(b) ?? 0;
      if (ca < minCoCount || cb < minCoCount) continue;
      const support = co / corpusSize;
      const confidence = co / ca;
      const expected = (ca * cb) / (corpusSize * corpusSize);
      const lift = expected ? (co / corpusSize) / expected : 0;
      if (lift <= 1.0) continue; // only meaningful associations
      rows.push({ a, b, co, sup: support, conf: confidence, lift });
    }

    rows.sort((x, y) => y.lift - x.lift);
    const top = rows.slice(0, maxPairs);

    // Upsert
    let inserted = 0;
    for (const r of top) {
      const { error } = await supa.from('concept_associations').upsert({
        organization_id: body.organization_id,
        concept_a: r.a,
        concept_b: r.b,
        co_occurrences: r.co,
        support: r.sup,
        confidence: r.conf,
        lift: r.lift,
        corpus_size: corpusSize,
        source_window_days: windowDays,
        last_seen_at: new Date().toISOString(),
        computed_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,concept_a,concept_b' });
      if (!error) inserted++;
    }

    return new Response(JSON.stringify({
      status: 'ok', corpus_size: corpusSize, candidates: rows.length, inserted, correlationId,
      sample: top.slice(0, 10),
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('mine-concept-associations error', e, correlationId);
    return new Response(JSON.stringify({ error: (e as Error).message, correlationId }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
