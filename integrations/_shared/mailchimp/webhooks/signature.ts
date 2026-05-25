/**
 * Mailchimp webhook "signature" placeholder — Slice 14 Commit 4.
 *
 * **Mailchimp does NOT sign webhook deliveries.** Per current
 * Mailchimp Marketing API docs and V1's
 * [`app/api/webhooks/mailchimp/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/mailchimp/route.ts)
 * receive route (which performs zero signature checks),
 * authenticity for list webhooks relies entirely on:
 *
 *   1. **URL secrecy.** The callback URL includes `?workflowId=X&nodeId=Y`
 *      query params set at activation time. An attacker without
 *      knowledge of the exact (workflowId, nodeId) pair cannot
 *      construct a callback URL that resolves to a real
 *      `trigger_resources` row.
 *
 *   2. **Audience id match.** The receive route reads the
 *      `data[list_id]` field from the form body and compares it to
 *      the `audienceId` stored in the matching `trigger_resources`
 *      row. Even an attacker who guesses the URL can't deliver an
 *      event for a list the workflow didn't subscribe to.
 *
 *   3. **Event-type allowlist.** The receive route reads the top-level
 *      `type` field and confirms it's in the trigger's stored
 *      `eventTypes: string[]` selection. Drops events outside the
 *      workflow author's chosen set.
 *
 *   4. **DB-backed dedup via `sha256(rawBody)`.** Mailchimp re-sends
 *      identical bodies on retry (no provider-issued dedup id), so
 *      hashing the raw body gives a stable cross-retry idempotency
 *      key. Replays of an already-seen body are blocked by
 *      `webhook_event_dedup`.
 *
 * The handshake on webhook create is a GET request — Mailchimp issues
 * `GET /api/webhooks/mailchimp?...` immediately after creation; the
 * route returns 200 OK with no body. No signed token / challenge
 * exchange exists in the protocol.
 *
 * This file intentionally has NO `verifyMailchimpSignature` export so
 * the receive helper can't accidentally call into a phantom
 * verification function. If a future Mailchimp API revision adds
 * signature support, this file is the extension point.
 *
 * Compare and contrast with the providers that DO sign:
 *   - Shopify: `X-Shopify-Hmac-SHA256` (base64 of HMAC-SHA256 over raw body, keyed with client secret).
 *   - HubSpot: `X-HubSpot-Signature-V3` (base64 of HMAC-SHA256 over method+uri+body+ts, keyed with client secret).
 *   - GitHub: `X-Hub-Signature-256` (hex of HMAC-SHA256 over raw body, keyed with per-webhook secret).
 *   - Stripe: `Stripe-Signature` (hex of HMAC-SHA256 over `${ts}.${body}`, keyed with per-endpoint secret).
 */

/**
 * Exported sentinel value so tests can assert that Slice 14 deliberately
 * declines to ship signature verification (matches V1's behavior and
 * the current Mailchimp protocol). Importing this is a no-op at runtime
 * but documents intent at call sites.
 */
export const MAILCHIMP_WEBHOOK_SIGNATURE_SCHEME = "none" as const;
