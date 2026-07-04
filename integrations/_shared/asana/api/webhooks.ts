import { asanaRequest } from "./_request";

/**
 * Typed Asana webhook lifecycle wrappers — Slice 5.ASANA-1.
 *
 * `POST /webhooks` (scope `webhooks:write`) and `DELETE /webhooks/{gid}`
 * (scope `webhooks:delete` — NOT covered by webhooks:write).
 *
 * Creation semantics (research.md "Webhooks"): the 201 response arrives
 * ONLY AFTER Asana's X-Hook-Secret handshake against `target` succeeds, so
 * by the time `webhooksCreate` resolves, the receive route has already
 * persisted the per-webhook secret onto the trigger row (see
 * `integrations/asana/triggers/_shared/activate.ts`).
 *
 * `filters` narrow deliveries server-side (e.g. `{resource_type: "task",
 * action: "added"}`) so the receive path sees less noise.
 */

export interface AsanaWebhookFilter {
  resource_type: string;
  action: string;
}

export interface AsanaWebhook {
  gid: string;
  active: boolean | null;
}

export interface WebhooksCreateInput {
  accessToken: string;
  /** The watched resource — a project gid for this slice's triggers. */
  resourceGid: string;
  /** The notification URL (carries ?workflowId=&nodeId= for strict lookup). */
  target: string;
  filters: readonly AsanaWebhookFilter[];
}

export async function webhooksCreate(
  input: WebhooksCreateInput,
): Promise<AsanaWebhook> {
  return asanaRequest<AsanaWebhook>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/webhooks",
    data: {
      resource: input.resourceGid,
      target: input.target,
      filters: input.filters as AsanaWebhookFilter[],
    },
    resourceForNotFound: `resource ${input.resourceGid} (create webhook)`,
  });
}

export interface WebhooksDeleteInput {
  accessToken: string;
  webhookGid: string;
}

export async function webhooksDelete(input: WebhooksDeleteInput): Promise<void> {
  await asanaRequest<Record<string, never>>({
    accessToken: input.accessToken,
    method: "DELETE",
    path: `/webhooks/${encodeURIComponent(input.webhookGid)}`,
    resourceForNotFound: `webhook ${input.webhookGid}`,
  });
}
