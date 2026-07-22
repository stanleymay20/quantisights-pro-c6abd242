
-- Fix match_decision_embeddings: add 'extensions' to search_path so <=> operator resolves
CREATE OR REPLACE FUNCTION public.match_decision_embeddings(
  query_embedding text,
  match_threshold double precision,
  match_count integer,
  filter_org_id uuid,
  filter_entity_types text[]
)
RETURNS TABLE(
  entity_type text,
  entity_id uuid,
  content_text text,
  metadata jsonb,
  distance double precision
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY EXECUTE format(
    'SELECT
      de.entity_type,
      de.entity_id,
      de.content_text,
      de.metadata,
      (1 - (de.embedding <=> $1::vector(768)))::float AS distance
    FROM public.decision_embeddings de
    WHERE de.organization_id = $2
      AND de.entity_type = ANY($3)
      AND (1 - (de.embedding <=> $1::vector(768))) > $4
    ORDER BY de.embedding <=> $1::vector(768)
    LIMIT $5'
  )
  USING query_embedding, filter_org_id, filter_entity_types, match_threshold, match_count;
END;
$function$;
