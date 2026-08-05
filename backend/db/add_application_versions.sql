-- PostgreSQL 17+ schema-only change for application version management.
-- This file intentionally creates no version records.

BEGIN;

CREATE TABLE IF NOT EXISTS public.application_versions (
    id SERIAL PRIMARY KEY,
    version VARCHAR(40) NOT NULL,
    title VARCHAR(160) NOT NULL DEFAULT '',
    release_notes TEXT NOT NULL DEFAULT '',
    status VARCHAR(24) NOT NULL DEFAULT 'draft',
    released_at TIMESTAMPTZ,
    created_by VARCHAR(120) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_application_versions_version
    ON public.application_versions (version);
CREATE INDEX IF NOT EXISTS ix_application_versions_status
    ON public.application_versions (status);

COMMIT;
