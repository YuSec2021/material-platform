BEGIN;

ALTER TABLE attributes
    ADD COLUMN IF NOT EXISTS brand_id INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint AS constraint_record
        JOIN pg_attribute AS column_record
          ON column_record.attrelid = constraint_record.conrelid
         AND column_record.attnum = ANY (constraint_record.conkey)
        WHERE constraint_record.conrelid = 'attributes'::regclass
          AND constraint_record.contype = 'f'
          AND column_record.attname = 'brand_id'
    ) THEN
        ALTER TABLE attributes
            ADD CONSTRAINT fk_attributes_brand_id
            FOREIGN KEY (brand_id)
            REFERENCES brands(id)
            ON DELETE RESTRICT;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS ix_attributes_brand_id
    ON attributes (brand_id);

COMMIT;
