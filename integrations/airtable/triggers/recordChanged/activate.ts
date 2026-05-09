import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { webhooksCreate } from "@/integrations/_shared/airtable/api/webhooks";

/**
 * Airtable `record_changed` activation hook.
 *
 * Reads `node.config.baseId` (REQUIRED) and `node.config.tableIdOrName`
 * (optional — when omitted, the webhook watches all tables in the
 * base). Calls `POST /v0/bases/{baseId}/webhooks` with `notificationUrl`
 * pointing at V2's receive route, and `dataTypes: ["tableData"]`.
 *
 * Persists the response in `trigger_resources.config`:
 *   - `type: "subscription-watch"` so `runRenewals` finds the row.
 *   - `webhookEnabled: true` (parity with other V2 webhook triggers).
 *   - `baseId, tableIdOrName, webhookId, macSecretBase64, expiresAt`.
 *   - `lastCursor: undefined` — first payload fetch will omit cursor
 *     and use Airtable's default (start of payload feed). The cursor
 *     advances per payload-fetch response.
 *
 * Throwing aborts the activate transition (TRIGGER_REGISTRATION_FAILED).
 *
 * Activation flow vs Microsoft / Google:
 *   - NO validation handshake. Airtable webhooks become active
 *     immediately at create-time; first inbound notification can
 *     arrive within seconds.
 *   - NO baseline cursor walk. Airtable's payload feed starts empty
 *     when the webhook is created — the first inbound notification
 *     will fetch from cursor=0 and naturally see only post-creation
 *     events.
 *
 * Slice 10 plan §"Webhook trigger model" + §"Open question 3" cursor
 * reset behavior.
 */

const SUBSCRIPTION_TYPE = "subscription-watch";

function webhookBaseUrl(): string {
  const explicit = process.env.AIRTABLE_WEBHOOK_URL?.trim();
  if (explicit) return stripWebhookPath(explicit);
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function stripWebhookPath(url: string): string {
  const trimmed = url.replace(/\/$/, "");
  const idx = trimmed.toLowerCase().indexOf("/api/webhooks/airtable");
  if (idx !== -1) return trimmed.slice(0, idx);
  return trimmed;
}

function notificationUrl(workflowId: string, nodeId: string): string {
  // workflowId + nodeId carried for diagnostic logs; runtime lookup
  // goes through `webhookId` (returned by webhooksCreate) so the URL
  // changing later doesn't break the receive path.
  const params = new URLSearchParams({ workflowId, nodeId });
  return `${webhookBaseUrl()}/api/webhooks/airtable?${params.toString()}`;
}

export const activate: ActivationFn = async ({ node, integration }) => {
  const baseId = (node.config?.baseId as string | undefined)?.trim();
  if (!baseId) {
    throw new Error(
      "airtable record_changed activate: node.config.baseId is required.",
    );
  }
  const tableIdOrName =
    (node.config?.tableIdOrName as string | undefined)?.trim() || undefined;

  // Slice 10 Commit 4: workflowId is read off the node-shape carried
  // by ActivationContext via lifecycle. The orchestrator threads
  // workflow.id when invoking activations; the URL just needs to be
  // stable per (workflow, node) so logs are diagnosable.
  const url = notificationUrl(
    (node as { workflowId?: string }).workflowId ?? "unknown",
    node.id,
  );

  const webhook = await refreshAndRetry({
    userId: integration.userId,
    provider: "airtable",
    accountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      webhooksCreate({
        accessToken,
        baseId,
        notificationUrl: url,
        specification: tableIdOrName
          ? { dataTypes: ["tableData"], recordChangeScope: tableIdOrName }
          : { dataTypes: ["tableData"] },
      }),
  });

  return {
    type: SUBSCRIPTION_TYPE,
    webhookEnabled: true,
    baseId,
    ...(tableIdOrName ? { tableIdOrName } : {}),
    webhookId: webhook.id,
    macSecretBase64: webhook.macSecretBase64,
    notificationUrl: url,
    expiresAt: webhook.expirationTime,
    // First payload fetch will omit cursor and use Airtable's
    // default (start of feed). lastCursor advances per-fetch.
    lastCursor: null,
  };
};
