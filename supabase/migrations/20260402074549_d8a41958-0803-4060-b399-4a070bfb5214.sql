-- Deduplicate decision_embeddings: keep only one row per content_text
DELETE FROM decision_embeddings
WHERE id NOT IN (
  SELECT DISTINCT ON (content_text) id
  FROM decision_embeddings
  ORDER BY content_text, created_at DESC
);