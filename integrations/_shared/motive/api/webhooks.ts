import { motiveRequest } from "./_request";
import { NotFoundError } from "../errors";

/**
 * Typed Company Webhook API wrappers — MOTIVE-1.
 *
 * Motive webhooks are per-company subscriptions
 * (docs/providers/motive/research.md §6). Each V2 trigger node creates its OWN
 * webhook whose `url` carries `?workflowId=&nodeId=` (strict-direct routing) and
 * whose 20-char `secret` V2 generates and stores encrypted on the trigger row.
 *
 *   - Create: `POST /v1/company_webhooks` → 201 `{ company_webhook: { id } }`.
 *   - Delete: `DELETE /v1/company_webhooks/{id}` (best-effort at deactivation).
 */

interface CompanyWebhookEnvelope {
  company_webhook?: { id?: number | string };
}

export interface CreatedMotiveWebhook {
  webhookId: string;
}

export async function companyWebhookCreate(input: {
  accessToken: string;
  url: string;
  secret: string;
  /** Motive event-type strings this webhook subscribes to. */
  actions: readonly string[];
}): Promise<CreatedMotiveWebhook> {
  const res = await motiveRequest<CompanyWebhookEnvelope>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/v1/company_webhooks",
    data: {
      company_webhook: {
        url: input.url,
        secret: input.secret,
        format: "json",
        enabled: true,
        actions: [...input.actions],
      },
    },
    resourceForNotFound: "company webhook create endpoint",
  });
  const id = res.company_webhook?.id;
  if (id == null || String(id).length === 0) {
    throw new Error("Motive company webhook create returned no id.");
  }
  return { webhookId: String(id) };
}

/** Delete a company webhook. Swallows 404 (already gone). */
export async function companyWebhookDelete(input: {
  accessToken: string;
  webhookId: string;
}): Promise<void> {
  try {
    await motiveRequest<Record<string, never>>({
      accessToken: input.accessToken,
      method: "DELETE",
      path: `/v1/company_webhooks/${encodeURIComponent(input.webhookId)}`,
      resourceForNotFound: `company webhook ${input.webhookId}`,
    });
  } catch (err) {
    if (err instanceof NotFoundError) return;
    throw err;
  }
}
