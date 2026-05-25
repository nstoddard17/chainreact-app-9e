import { mondayRequest } from "./_request";

/**
 * Monday GraphQL `delete_webhook` wrapper — Slice 3.MONDAY-7.
 *
 * Backs the shared deactivation hook for the 5 Monday webhook triggers.
 * Reads the `webhookId` persisted at activation time and removes the
 * provider-side subscription so Monday stops POSTing events for a
 * disabled / deleted workflow.
 *
 * Mutation shape: `delete_webhook(id: ID!) { id }`.
 *
 * **API-Version pin: `2025-04`.** Matches `webhooksCreate` so the whole
 * webhook lifecycle stays on one Monday API version.
 *
 * Monday surfaces a missing webhook as a not-found-shaped GraphQL error;
 * the shared `_request` layer maps that to `NotFoundError`, which the
 * deactivation hook swallows (best-effort cleanup).
 */

export interface WebhooksDeleteInput {
  accessToken: string;
  /** Monday webhook id from a prior `create_webhook` response. */
  webhookId: string;
  /** API-Version override. Webhook lifecycle pins `"2025-04"`. */
  apiVersion?: string;
}

const MUTATION = `
  mutation($id: ID!) {
    delete_webhook(id: $id) {
      id
    }
  }
`;

export async function webhooksDelete(
  input: WebhooksDeleteInput,
): Promise<void> {
  await mondayRequest<{ delete_webhook: { id: string } | null }>({
    accessToken: input.accessToken,
    query: MUTATION,
    variables: { id: input.webhookId },
    apiVersion: input.apiVersion,
  });
}
