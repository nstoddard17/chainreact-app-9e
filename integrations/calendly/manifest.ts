import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Calendly provider manifest — Slice 5.CALENDLY-1.
 *
 * Third net-new V2 provider (no V1 code existed; Asana, then Typeform).
 * Wire-format choices verified against the official docs
 * (docs/providers/calendly/research.md, 2026-07-04).
 *
 * Auth model — OAuth 2.0 authorization code, confidential client WITH
 * PKCE S256 (Calendly directs PKCE for ALL app types, web included),
 * Basic-auth token exchange, refreshable:
 *   - `authorize`: `https://auth.calendly.com/oauth/authorize`
 *   - `token`:     `https://auth.calendly.com/oauth/token`
 *     (`Authorization: Basic base64(client_id:client_secret)` — the
 *     documented web-client shape; contrast Typeform's body-auth).
 *   - Access tokens expire after 2 hours (`expires_in: 7200`); refresh
 *     tokens are SINGLE-USE and ROTATE on every refresh (enforced by
 *     Calendly for all integrations by 2026-08-31), so oauth.ts persists
 *     the rotated token each time (Typeform precedent).
 *
 * Scopes — Calendly's granular catalog (newly created apps get NO access
 * until scopes are requested). Minimum set for this slice (2 webhook
 * triggers + 1 option source; ZERO actions). Names verified against
 * https://developer.calendly.com/scopes:
 *   - `users:read`            — GET /users/me connect-time identity + the
 *                               user/org URIs webhook creation needs.
 *   - `event_types:read`      — `calendly:event_types` option source.
 *   - `scheduled_events:read` — receiving `invitee.*` webhook payloads
 *                               (the scopes page requires the event
 *                               family's read scope to receive payloads).
 *   - `webhooks:write`        — trigger activation
 *                               (POST /webhook_subscriptions) and
 *                               deactivation (DELETE …/{uuid}).
 *
 * Deliberately EXCLUDED (no-scope-bloat): `webhooks:read` (V2 never lists
 * webhooks back; deletes by the stored subscription URI),
 * `scheduled_events:write` / `event_types:write` / `availability:*` /
 * `organizations:*` / `routing_forms:read` / `contacts:*` (out of slice
 * scope by design).
 *
 * tokenScope: "user" — one Calendly integration per user; credential
 * class is PERSONAL (core/integrations/credentialSharing.ts): the token
 * acts as the connecting human over their own meetings, and webhook
 * subscriptions are created with `scope: "user"` (their own bookings
 * only — never org-wide fan-in).
 *
 * accountIdField: "email" — resolved via GET /users/me (users:read),
 * falling back to the user UUID when email is absent.
 *
 * apiVersion: "v2" — `https://api.calendly.com` (API v1 was discontinued
 * May 2025).
 *
 * Health-check interval: 12h — the "Others" bucket. Two-hour access
 * tokens between checks are handled reactively by `refreshAndRetry`.
 *
 * Capabilities (honest — nothing "coming soon"):
 *   - `oauth: true` — PKCE code flow + rotating refresh implemented.
 *   - `actions: false` — ZERO action handlers ship in this slice; the
 *     invitee webhook payload embeds the scheduled_event (start/end/
 *     event-type/location/hosts), so it is self-contained and no read
 *     action is invented (Typeform actions-less precedent). `calendly`
 *     joins COVERED_PROVIDERS only when the first action ships.
 *   - `webhookTrigger: true` — 2 user-scoped webhook-subscription
 *     triggers with a full activate (POST with caller-minted
 *     signing_key) / deactivate (DELETE) lifecycle.
 *   - `pollingTrigger: false` — webhook-only; Calendly webhooks are
 *     reliable (documented ≤24h exponential-backoff retry) and polling
 *     never ships here.
 */
export const calendlyManifest: ProviderManifest = ProviderManifestSchema.parse({
  id: "calendly",
  displayName: "Calendly",
  isEnabled: true,
  apiVersion: "v2",
  tokenScope: "user",
  oauthFlows: ["v2"],
  accountIdField: "email",
  scopes: {
    required: [
      "users:read",
      "event_types:read",
      "scheduled_events:read",
      "webhooks:write",
    ],
    optional: [],
    deprecated: [],
  },
  capabilities: {
    oauth: true,
    webhookTrigger: true,
    pollingTrigger: false,
    actions: false,
  },
  healthCheckIntervalMs: 12 * 60 * 60 * 1000,
  refreshable: true,
});
