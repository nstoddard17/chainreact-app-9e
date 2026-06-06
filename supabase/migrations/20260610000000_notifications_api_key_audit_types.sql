-- ChainReactV2 — Slice 4.API-KEYS-AUDIT-1: API-key audit notification types.
--
-- Extends the existing `notification_type` enum (20260507000004 +
-- 20260524000000) with two audit events so the owner/admin who creates or
-- revokes an API key gets an in-app record. This reuses the existing
-- `notifications` table + RLS (per-user, auth.uid() = user_id) rather than a
-- parallel audit table — same precedent as the high-risk audit types.
--
-- The notification carries only NON-SECRET fields (key name + display prefix +
-- ids + actor) — never the raw key, key_hash, OAuth/integration tokens, or any
-- provider credential. See services/apiKeys/auditNotifications.ts.
--
-- Why ADD VALUE (not text + CHECK): the enum already exists and is referenced by
-- live notification rows; PostgreSQL 12+ allows ADD VALUE outside a transaction
-- when the value is new, and IF NOT EXISTS keeps the migration idempotent.
--
-- No new table / policy / grant — the existing RLS on `notifications` covers
-- owner-only read/update access.

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'api_key_created';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'api_key_revoked';
