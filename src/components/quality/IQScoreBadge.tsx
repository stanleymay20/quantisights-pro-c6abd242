import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldCheck } from 'lucide-react';

interface Props {
  organizationId: string;
  datasetId?: string | null;
  className?: string;
}

interface DimensionEntry { score: number; sample_size: number; details: Record<string, unknown>; computed_at: string }
interface Composite {
  composite: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | 'NOT_RATED';
  dimensions_measured: number;
  min_sample_size: number;
  last_computed_at: string | null;
  dimensions: Record<string, DimensionEntry>;
}

const GRADE_STYLES: Record<Composite['grade'], string> = {
  A: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  B: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  C: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  D: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  F: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  NOT_RATED: 'bg-muted text-muted-foreground border-border',
};

const DIMENSION_LABELS: Record<string, string> = {
  accuracy: 'Accuracy',
  completeness: 'Completeness',
  consistency: 'Consistency',
  timeliness: 'Timeliness',
  relevance: 'Relevance',
  accessibility: 'Accessibility',
  believability: 'Believability',
};

export function IQScoreBadge({ organizationId, datasetId, className = '' }: Props) {
  const [data, setData] = useState<Composite | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const { data: result, error } = await supabase
          .rpc('get_iq_composite_score', {
            _org_id: organizationId,
            _dataset_id: datasetId ?? null,
          })
          .abortSignal(controller.signal);
        if (cancelled) return;
        if (error) {
          // Swallow expected aborts during navigation; log other failures quietly.
          const msg = (error.message || '').toLowerCase();
          if (!msg.includes('abort') && error.code !== '20') {
            console.warn('[IQScoreBadge] composite score fetch failed:', error.message);
          }
          setData(null);
        } else {
          setData((result as unknown as Composite) ?? null);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const name = (err as { name?: string })?.name;
        if (name !== 'AbortError') {
          console.warn('[IQScoreBadge] unexpected fetch error:', err);
        }
        setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [organizationId, datasetId]);

  if (loading) return <Skeleton className={`h-6 w-24 ${className}`} />;
  if (!data || data.dimensions_measured === 0) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground ${className}`}>
        <ShieldCheck className="h-3 w-3" /> IQ: Not rated
      </span>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${GRADE_STYLES[data.grade]} ${className}`}
          >
            <ShieldCheck className="h-3 w-3" />
            IQ: {data.composite}/100 ({data.grade})
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1.5">
            <p className="font-semibold text-xs">Information Quality — 7 dimensions</p>
            <p className="text-xs text-muted-foreground">
              Ref: Ch 14, Data Engineering (Chan/Talburt/Talley, 2010)
            </p>
            <div className="space-y-0.5 pt-1">
              {Object.entries(data.dimensions).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 text-xs">
                  <span>{DIMENSION_LABELS[k] ?? k}:</span>
                  <span className="font-mono">{v.score}/100 <span className="text-muted-foreground">(n={v.sample_size})</span></span>
                </div>
              ))}
            </div>
            {data.last_computed_at && (
              <p className="text-[10px] text-muted-foreground pt-1">
                Last computed: {new Date(data.last_computed_at).toLocaleString()}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
