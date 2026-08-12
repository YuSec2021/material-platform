-- PostgreSQL 17+ schema change for the AI Material Management Platform users table.
-- Removes the legacy hcm_id field and adds authentication-related fields
-- (password_hash, last_login_at, failed_login_count) so the login flow can
-- verify a real password instead of trusting X-User-* headers.
--
-- Idempotent: every ALTER uses IF EXISTS / IF NOT EXISTS so re-running the
-- migration is safe.
--
-- Effect on existing rows:
--   * hcm_id values are dropped (no backup is created here; the field is
--     considered legacy after this migration).
--   * password_hash defaults to '' for all rows. Seed users with a default
--     password are written by the application's ensure_hcm_seed_users
--     bootstrap path on the next backend startup; the bootstrap uses
--     bcrypt-hashed values.
--   * last_login_at is NULL for all rows until each user logs in.
--   * failed_login_count is 0 for all rows.

BEGIN;

ALTER TABLE users DROP COLUMN IF EXISTS hcm_id;
DROP INDEX IF EXISTS ix_users_hcm_id;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_hash VARCHAR(256) NOT NULL DEFAULT '';

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0;

COMMIT;
