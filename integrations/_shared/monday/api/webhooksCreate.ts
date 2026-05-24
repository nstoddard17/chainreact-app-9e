import { mondayRequest } from "./_request";

/**
 * Monday GraphQL `create_webhook` wrapper — Slice 3.MONDAY-7.
 *
 * Backs the 5 Monday webhook triggers' activation hook. One
 * `create_webhook` call subscribes ONE board to ONE event type and
 * returns the provider-issued webhook id (persisted to
 * `trigger_resources.config.webhookId` for deactivation cleanup).
 *
 * Mutation shape (Monday API):
 *   `create_webhook(board_id: ID!, url: String!, event: WebhookEventType!,
 *                   config: JSON) { id board_id }`
 *
 *   - `event` is a GraphQL **enum** (`WebhookEventType`) — enum literals
 *     are unquoted identifiers, so the value is INLINED into the document
 *     rather than passed as a variable (Monday's GraphQL rejects a string
 *     variable bound to an enum arg). The value always comes from the
 *     fixed allowlist in `triggers/_shared/eventMap.ts` — never user
 *     input — and is re-validated against `/^[a-z_]+$/` here as
 *     defense-in-depth so a malformed value can never reach the inlined
 *     document.
 *   - `config` is Monday's `JSON` scalar — a STRINGIFIED object (same
 *     convention as `create_item`'s `column_values`). Only the
 *     `change_specific_column_value` event uses it (`{"columnId":"..."}`).
 *     When `configJson` is omitted the `config` arg is dropped entirely
 *     (cleaner GraphQL — no `null` arg).
 *
 * **API-Version pin: `2025-04`.** The `config` param for column-specific
 * filtering only landed in that version (V1 used the same override). The
 * caller passes it explicitly; reads/writes elsewhere stay on the
 * manifest's `2024-01` default.
 *
 * Security: the shared `_request` layer never leaks the access token, the
 * GraphQL document, or the raw response body in thrown errors. The
 * webhook signing secret never transits this layer (it lives only in the
 * receive route's env read).
 */

export interface WebhooksCreateInput {
  accessToken: string;
  boardId: string;
  /** Notification URL Monday POSTs events to. Carries `?workflowId=&nodeId=`. */
  url: string;
  /**
   * Monday webhook event enum value (e.g. `create_item`). Inlined into
   * the GraphQL document — MUST be a fixed allowlist value.
   */
  event: string;
  /** Optional JSON-encoded config string, e.g. `'{"columnId":"status"}'`. */
  configJson?: string;
  /** API-Version override. Webhook lifecycle pins `"2025-04"`. */
  apiVersion?: string;
}

export interface MondayWebhook {
  id: string;
  board_id: string | null;
}

function buildMutation(event: string, withConfig: boolean): string {
  // Enum literals are unquoted in GraphQL. `event` is validated by the
  // caller against the fixed allowlist; the regex guard below is a
  // second gate so a malformed value can never reach the document.
  if (withConfig) {
    return `
      mutation($boardId: ID!, $url: String!, $config: JSON) {
        create_webhook(board_id: $boardId, url: $url, event: ${event}, config: $config) {
          id
          board_id
        }
      }
    `;
  }
  return `
    mutation($boardId: ID!, $url: String!) {
      create_webhook(board_id: $boardId, url: $url, event: ${event}) {
        id
        board_id
      }
    }
  `;
}

export async function webhooksCreate(
  input: WebhooksCreateInput,
): Promise<MondayWebhook> {
  if (!/^[a-z_]+$/.test(input.event)) {
    throw new Error(
      `monday webhooksCreate: refusing to inline unexpected event enum '${input.event}'.`,
    );
  }
  const withConfig = input.configJson !== undefined;
  const variables: Record<string, unknown> = {
    boardId: input.boardId,
    url: input.url,
  };
  if (withConfig) {
    variables.config = input.configJson;
  }
  const data = await mondayRequest<{ create_webhook: MondayWebhook }>({
    accessToken: input.accessToken,
    query: buildMutation(input.event, withConfig),
    variables,
    apiVersion: input.apiVersion,
  });
  return data.create_webhook;
}
