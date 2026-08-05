BEGIN;

ALTER TABLE product_names
    ADD COLUMN IF NOT EXISTS category_id INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint AS constraint_record
        JOIN pg_attribute AS column_record
          ON column_record.attrelid = constraint_record.conrelid
         AND column_record.attnum = ANY (constraint_record.conkey)
        WHERE constraint_record.conrelid = 'product_names'::regclass
          AND constraint_record.contype = 'f'
          AND column_record.attname = 'category_id'
    ) THEN
        ALTER TABLE product_names
            ADD CONSTRAINT fk_product_names_category_id
            FOREIGN KEY (category_id)
            REFERENCES categories(id)
            ON DELETE RESTRICT;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS ix_product_names_category_id
    ON product_names (category_id);

COMMIT;
