import { createHash, randomBytes } from "node:crypto";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { encryptToken } from "@/core/encryption/tokens";
import { webhookPut } from "@/integrations/_shared/typeform/api/webhooks";
import { typeformNotificationUrl } from "./notificationUrl";

/**
 * Activation hook for `typeform:new_response_in_form` — Slice
 * 5.TYPEFORM-1.
 *
 * Per-(workflow, node) lifecycle: each trigger node creates its own
 * Typeform webhook on the configured form via
 * `PUT /forms/{formId}/webhooks/{tag}` with its own
 * `?workflowId=&nodeId=` URL (GitHub / Trello / Monday / Asana pattern).
 *
 * Structural simplification vs Asana: **no creation handshake**. V2
 * mints the HMAC secret itself (32 random bytes) and sends it in the PUT
 * body, so there is no pre-upsert of the trigger row and no mid-creation
 * round-trip — the returned config patch is the whole story. A PUT
 * failure aborts activation with nothing to clean up provider-side.
 *
 * The `tag` is DETERMINISTIC per (workflow, node): `chainreact-` + a
 * sha256 prefix of `workflowId:nodeId`. Typeform PUTs to the same tag
 * update in place, so re-activation never accumulates orphan webhooks,
 * and deactivation reconstructs nothing — the tag is persisted on the
 * row. (Tag charset/length limits are undocumented; a 24-hex-char hash
 * stays well inside any plausible bound and leaks nothing.)
 *
 * Provider calls go through `refreshAndRetry` — Typeform access tokens
 * expire weekly, so activation must tolerate a stale stored token.
 *
 * `trigger_resources.config` after activation:
 *   - `webhookEnabled: true`
 *   - `formId` — the watched Typeform form id.
 *   - `webhookTag` — the deterministic tag, for deactivation DELETE.
 *   - `webhookId` — Typeform's webhook id (informational).
 *   - `hookSecretEncrypted` — the V2-minted HMAC key (encrypted).
 *   - `notificationUrl` — the exact URL registered.
 *
 * **NO `type: "subscription-watch"` marker** — Typeform webhooks don't
 * expire on a schedule, so the renewal cron never touches these rows.
 * (Typeform disables webhooks itself after sustained delivery failure —
 * documented platform behavior; recovery is deactivate/reactivate.)
 */

/** Deterministic per-(workflow, node) webhook tag. Exported for tests + smoke. */
export function typeformWebhookTag(workflowId: string, nodeId: string): string {
  const digest = createHash("sha256")
    .update(`${workflowId}:${nodeId}`)
    .digest("hex")
    .slice(0, 24);
  return `chainreact-${digest}`;
}

export const typeformNewResponseInFormActivate: ActivationFn = async ({
  node,
  integration,
  workflowId,
}) => {
  const formId = node.config?.formId;
  if (typeof formId !== "string" || formId.length === 0) {
    throw new Error(
      "typeform new_response_in_form activate: node.config.formId is required.",
    );
  }

  const url = typeformNotificationUrl(workflowId, node.id);
  const tag = typeformWebhookTag(workflowId, node.id);
  // V2-minted per-webhook HMAC key. base64url keeps it header/body safe.
  const secret = randomBytes(32).toString("base64url");

  const created = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "typeform",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      webhookPut({
        accessToken,
        formId,
        tag,
        url,
        secret,
      }),
  });

  // Config patch — the lifecycle's final upsert persists this.
  return {
    webhookEnabled: true,
    formId,
    webhookTag: tag,
    webhookId: typeof created.id === "string" ? created.id : undefined,
    hookSecretEncrypted: encryptToken(secret),
    notificationUrl: url,
  };
};
