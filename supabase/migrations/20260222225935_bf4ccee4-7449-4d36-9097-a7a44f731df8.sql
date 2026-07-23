
-- 1. Add credentials_key_hash column to data_sources
ALTER TABLE public.data_sources ADD COLUMN credentials_key_hash text;

-- Create index on hash for fast lookup
CREATE INDEX idx_data_sources_credentials_key_hash ON public.data_sources (credentials_key_hash);

-- 2. Add request_id column to data_sync_jobs for idempotency
ALTER TABLE public.data_sync_jobs ADD COLUMN request_id text;

-- Unique index for idempotency enforcement
CREATE UNIQUE INDEX idx_data_sync_jobs_request_id ON public.data_sync_jobs (request_id) WHERE request_id IS NOT NULL;

-- 3. Migrate existing plaintext keys to hashed (using pgcrypto)
-- Enable pgcrypto if not already
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Hash existing plaintext keys
UPDATE public.data_sources 
SET credentials_key_hash = encode(digest(credentials_key, 'sha256'), 'hex')
WHERE credentials_key IS NOT NULL AND credentials_key_hash IS NULL;

-- 4. Drop the plaintext credentials_key column
ALTER TABLE public.data_sources DROP COLUMN credentials_key;
