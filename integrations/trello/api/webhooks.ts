import { trelloRequest } from "./_request";

/**
 * Trello Webhooks API wrappers — Slice 17 Commit 5.
 *
 * Endpoints:
 *   - `webhooksCreate` — POST   /1/webhooks    (subscribe to a model)
 *   - `webhooksDelete` — DELETE /1/webhooks/{id}
 *
 * Trello webhooks are bound to an `idModel` — typically a board id,
 * but Trello supports list / card / member ids as well. V2 Slice 17
 * Batch 1 ships board-scope only.
 *
 * **No expiration.** Trello webhooks don't expire. The
 * `runRenewals` cron filters on `config.type === "subscription-watch"`
 * — Trello's activate hook intentionally omits that marker so the
 * renewal cron never picks up Trello rows.
 */

export interface TrelloWebhook {
  id: string;
  idModel: string;
  callbackURL: string;
  description?: string;
  active?: boolean;
}

export interface WebhooksCreateInput {
  accessToken: string;
  /** Board id (or any Trello model id) to subscribe to. */
  idModel: string;
  /** Exact callback URL — must match what receive verifies against. */
  callbackURL: string;
  /** Optional human-readable label shown in the Trello dashboard. */
  description?: string;
}

export async function webhooksCreate(
  input: WebhooksCreateInput,
): Promise<TrelloWebhook> {
  const body: Record<string, unknown> = {
    idModel: input.idModel,
    callbackURL: input.callbackURL,
  };
  if (input.description !== undefined) body.description = input.description;

  return trelloRequest<TrelloWebhook>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/1/webhooks",
    body,
    resourceForNotFound: "webhooks",
  });
}

export interface WebhooksDeleteInput {
  accessToken: string;
  webhookId: string;
}

export async function webhooksDelete(
  input: WebhooksDeleteInput,
): Promise<void> {
  await trelloRequest<unknown>({
    accessToken: input.accessToken,
    method: "DELETE",
    path: `/1/webhooks/${encodeURIComponent(input.webhookId)}`,
    resourceForNotFound: `webhook ${input.webhookId}`,
  });
}
