-- ChainReactV2 — Slice 4.V2-READY-28B: reconnect-needed notification type.
--
-- Extends the existing `notification_type` enum (20260507000004 +
-- 20260524000000 + 20260531000011 + 20260610000000) with ONE value so the
-- connector of an integration that just transitioned to "reconnect needed"
-- (needs_reconnect_at NULL → non-null, V2-READY-28) gets one in-app notification.
-- Reuses the existing `notifications` table + per-user RLS (auth.uid() = user_id)
-- — same precedent as the high-risk + API-key audit types. NOT a broad health /
-- notification system.
--
-- The notification carries only the provider DISPLAY name + a static action link
-- (/apps) — never the provider account id, Slack team id, account id, email,
-- token, scope, or any raw provider error body. See
-- services/integrations/reconnectNotification.ts.
--
-- Why ADD VALUE (not text + CHECK): the enum already exists and is referenced by
-- live notification rows; PostgreSQL 12+ allows ADD VALUE outside a transaction
-- when the value is new, and IF NOT EXISTS keeps the migration idempotent.
--
-- No new table / policy / grant — the existing RLS on `notifications` covers
-- owner-only read/update access.

ALTER TYPE public.notification_type
  ADD VALUE IF NOT EXISTS 'integration_reconnect_needed';
