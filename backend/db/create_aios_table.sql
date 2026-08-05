-- This registry must be created before any business schema or data migration.
-- PostgreSQL 17+ only.

CREATE TABLE IF NOT EXISTS public.aios (
    id BIGSERIAL PRIMARY KEY,
    migration_key VARCHAR(160) NOT NULL UNIQUE,
    migration_type VARCHAR(80) NOT NULL,
    source_system VARCHAR(80) NOT NULL,
    source_fingerprint CHAR(64) NOT NULL,
    library_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    orphan_parent_policy VARCHAR(24) NOT NULL,
    status VARCHAR(32) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    milvus_collection VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_aios_status ON public.aios (status);
CREATE INDEX IF NOT EXISTS ix_aios_created_at ON public.aios (created_at);
