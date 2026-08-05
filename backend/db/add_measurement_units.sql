-- PostgreSQL 17+ schema-only change.
-- This file intentionally performs no legacy unit backfill.
-- A human operator must review and execute it before deploying the unit UI.

BEGIN;

CREATE TABLE IF NOT EXISTS public.measurement_units (
    id SERIAL PRIMARY KEY,
    code VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL,
    symbol VARCHAR(32) NOT NULL,
    unit_type VARCHAR(40) NOT NULL DEFAULT 'general',
    description TEXT NOT NULL DEFAULT '',
    decimal_places INTEGER NOT NULL DEFAULT 0,
    enabled BOOLEAN NOT NULL DEFAULT true,
    is_system BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_measurement_units_decimal_places
        CHECK (decimal_places BETWEEN 0 AND 12)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_measurement_units_name_ci
    ON public.measurement_units (lower(name));
CREATE INDEX IF NOT EXISTS ix_measurement_units_enabled
    ON public.measurement_units (enabled);
CREATE INDEX IF NOT EXISTS ix_measurement_units_unit_type
    ON public.measurement_units (unit_type);

ALTER TABLE public.product_names
    ADD COLUMN IF NOT EXISTS unit_id INTEGER;
ALTER TABLE public.materials
    ADD COLUMN IF NOT EXISTS unit_id INTEGER;
ALTER TABLE public.attributes
    ADD COLUMN IF NOT EXISTS unit_id INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname IN (
            'fk_product_names_measurement_unit',
            'product_names_unit_id_fkey'
        )
    ) THEN
        ALTER TABLE public.product_names
            ADD CONSTRAINT fk_product_names_measurement_unit
            FOREIGN KEY (unit_id) REFERENCES public.measurement_units(id)
            ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname IN (
            'fk_materials_measurement_unit',
            'materials_unit_id_fkey'
        )
    ) THEN
        ALTER TABLE public.materials
            ADD CONSTRAINT fk_materials_measurement_unit
            FOREIGN KEY (unit_id) REFERENCES public.measurement_units(id)
            ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname IN (
            'fk_attributes_measurement_unit',
            'attributes_unit_id_fkey'
        )
    ) THEN
        ALTER TABLE public.attributes
            ADD CONSTRAINT fk_attributes_measurement_unit
            FOREIGN KEY (unit_id) REFERENCES public.measurement_units(id)
            ON DELETE RESTRICT;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS ix_product_names_unit_id
    ON public.product_names (unit_id);
CREATE INDEX IF NOT EXISTS ix_materials_unit_id
    ON public.materials (unit_id);
CREATE INDEX IF NOT EXISTS ix_attributes_unit_id
    ON public.attributes (unit_id);

COMMIT;
