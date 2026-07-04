import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import {
  webhooksCreate,
  webhooksDelete,
} from "@/integrations/_shared/asana/api/webhooks";
import { asanaNotificationUrl } from "./notificationUrl";
import { WEBHOOK_FILTERS, type AsanaTriggerType } from "./eventMap";

/**
 * Shared activation builder for the 2 Asana project-webhook triggers —
 * Slice 5.ASANA-1.
 *
 * Both V2 Asana triggers bind to a PROJECT via `POST /webhooks` with
 * server-side (resource_type, action) filters. Per-(workflow, node)
 * lifecycle: each trigger node creates its own webhook with its own
 * `?workflowId=&nodeId=` URL (GitHub / Trello / Monday pattern).
 *
 * **The Asana-specific twist — mid-creation X-Hook-Secret handshake.**
 * Asana delivers the webhook's HMAC key exactly once: a handshake POST to
 * the target URL that happens WHILE `POST /webhooks` is still pending,
 * and the 201 only returns after the target echoes the header. V2's
 * lifecycle normally upserts `trigger_resources` AFTER activate()
 * returns, which would leave the handshake with no row to store the
 * secret on. So:
 *
 *   1. activate() PRE-UPSERTS the trigger row itself (same
 *      (workflow_id, node_id) key the lifecycle's final upsert will hit)
 *      with `handshakePending: true` and no secret.
 *   2. `POST /webhooks` fires. Asana's handshake hits
 *      `/api/webhooks/asana?workflowId=&nodeId=`; the receive helper
 *      resolves the pending row, persists `hookSecretEncrypted`
 *      (encryptToken — encrypted at rest, deliberately stronger than
 *      Airtable's plaintext macSecretBase64 precedent), and echoes the
 *      header. Handshakes against non-pending rows are REJECTED without
 *      an echo, so an armed row's secret can never be rotated by an
 *      unauthenticated POST; the rejected echo makes Asana fail the
 *      creation (fail closed).
 *   3. After the 201, activate() re-reads the row. A missing secret
 *      means the handshake never landed on this deployment (split-brain
 *      target URL, mid-flight config error) — activate best-effort
 *      deletes the just-created webhook and throws, aborting the
 *      transition (TRIGGER_REGISTRATION_FAILED).
 *   4. The returned patch carries the secret + webhook gid forward so
 *      the lifecycle's final upsert (which REPLACES config) preserves it.
 *
 * Provider calls go through `refreshAndRetry` — Asana access tokens
 * expire hourly, so activation must tolerate a stale stored token.
 *
 * Pre-upsert provenance: `trigger_resources.user_id` is provenance-only;
 * the preliminary row uses `integration.connectedByUserId` (always set on
 * V2-written integration rows) and the lifecycle's final upsert
 * overwrites it with `workflow.createdByUserId`.
 *
 * `trigger_resources.config` after activation:
 *   - `webhookEnabled: true`
 *   - `projectId` — the watched Asana project gid.
 *   - `webhookId` — Asana's webhook gid, for deactivation cleanup.
 *   - `hookSecretEncrypted` — the per-webhook HMAC key (encrypted).
 *   - `notificationUrl` — the exact URL registered.
 *   - `handshakePending: false`
 *
 * **NO `type: "subscription-watch"` marker** — Asana webhooks don't
 * expire on a schedule, so the renewal cron never touches these rows.
 * (Asana deletes webhooks itself after 24h of failed deliveries — a
 * documented platform limitation; recovery is deactivate/reactivate.)
 */
export function buildAsanaActivate(triggerType: AsanaTriggerType): ActivationFn {
  return async ({ node, integration, workflowId }) => {
    const projectId = node.config?.projectId;
    if (typeof projectId !== "string" || projectId.length === 0) {
      throw new Error(
        `asana ${triggerType} activate: node.config.projectId is required.`,
      );
    }

    const connectedByUserId = integration.connectedByUserId;
    if (!connectedByUserId) {
      // V2-written integration rows always carry connectedByUserId; a null
      // here means a legacy/corrupt row we refuse to activate against.
      throw new Error(
        `asana ${triggerType} activate: integration row has no connectedByUserId; reconnect Asana and retry.`,
      );
    }

    // 1. Pre-upsert the row so the mid-creation handshake has somewhere to
    // store the per-webhook secret. The lifecycle's final upsert (same
    // (workflow_id, node_id) conflict key) overwrites config with our
    // returned patch below.
    await triggerResourcesRepo.upsert({
      workflowId,
      userId: connectedByUserId,
      provider: "asana",
      eventType: triggerType,
      nodeId: node.id,
      config: {
        ...node.config,
        projectId,
        webhookEnabled: false,
        handshakePending: true,
      },
    });

    const url = asanaNotificationUrl(workflowId, node.id);

    // 2. Create the webhook. Asana blocks on the handshake; when this
    // resolves 201, the receive route has already persisted the secret.
    const created = await refreshAndRetry({
      accountId: integration.accountId,
      provider: "asana",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        webhooksCreate({
          accessToken,
          resourceGid: projectId,
          target: url,
          filters: WEBHOOK_FILTERS[triggerType],
        }),
    });

    // 3. Read the handshake-persisted secret back.
    const row = await triggerResourcesRepo.findByWorkflowAndNode(
      workflowId,
      node.id,
    );
    const hookSecretEncrypted = row?.config?.hookSecretEncrypted;
    if (typeof hookSecretEncrypted !== "string" || hookSecretEncrypted.length === 0) {
      // 201 without a stored secret should be impossible (Asana completes
      // creation only after the echo) — fail closed and clean up the
      // orphan webhook best-effort.
      try {
        await refreshAndRetry({
          accountId: integration.accountId,
          provider: "asana",
          providerAccountId: integration.providerAccountId,
          apiCall: (accessToken) =>
            webhooksDelete({ accessToken, webhookGid: created.gid }),
        });
      } catch {
        // best-effort — the activation failure below is the load-bearing
        // signal; Asana also self-deletes webhooks whose target fails.
      }
      throw new Error(
        `asana ${triggerType} activate: webhook created but the X-Hook-Secret handshake did not persist a secret on this deployment; aborting activation.`,
      );
    }

    // 4. Full config patch — the lifecycle's final upsert persists this.
    return {
      webhookEnabled: true,
      projectId,
      webhookId: created.gid,
      hookSecretEncrypted,
      notificationUrl: url,
      handshakePending: false,
    };
  };
}
