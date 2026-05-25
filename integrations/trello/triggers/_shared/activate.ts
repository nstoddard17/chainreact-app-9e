import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { decryptToken } from "@/core/encryption/tokens";
import { webhooksCreate } from "@/integrations/trello/api/webhooks";
import { trelloNotificationUrl } from "./notificationUrl";

/**
 * Shared activation builder for the 6 Trello webhook triggers —
 * Slice 17 Commit 5.
 *
 * All 6 V2 Trello triggers (`new_card`, `card_updated`, `card_moved`,
 * `comment_added`, `member_changed`, `card_archived`) bind to a board
 * via Trello's `POST /1/webhooks` with `idModel = boardId`. The only
 * per-trigger difference is the V2 event type stored in
 * `trigger_resources.config.eventType`, which the receive helper uses
 * to filter inbound Trello action types down to "events this trigger
 * cares about."
 *
 * V2's per-(workflow, node) lifecycle pattern means: if a workflow has
 * 2 trigger nodes both bound to the same board (e.g. one `new_card`
 * and one `card_updated`), activation creates TWO Trello webhooks on
 * that board — one per node, each with its own `?workflowId=&nodeId=`
 * URL. Closes V1's bulk-board registration gap (V1 registered ALL the
 * user's boards eagerly on connect, regardless of what workflows
 * actually needed).
 *
 * `trigger_resources.config` after activation:
 *   - `webhookEnabled: true`
 *   - `boardId` — the Trello board id from `node.config.boardId`.
 *   - `eventType` — the V2 trigger event name (e.g., `"new_card"`).
 *     Receive uses this to filter inbound action types.
 *   - `webhookId` — Trello's webhook resource id, for deactivation.
 *   - `callbackURL` — the EXACT URL Trello has registered.
 *     Signature verification on receive uses this same string
 *     (Trello's HMAC includes the callback URL).
 *   - `notificationUrl` — alias kept for diagnostic parity with the
 *     GitHub trigger config shape.
 *
 * **NO `type: "subscription-watch"` field** — Trello webhooks don't
 * expire. Same "permanent endpoint" pattern as GitHub / Shopify /
 * Mailchimp.
 */
export function buildTrelloActivate(eventType: string): ActivationFn {
  return async ({ node, integration, workflowId }) => {
    const boardId = node.config?.boardId;
    if (typeof boardId !== "string" || boardId.length === 0) {
      throw new Error(
        `trello ${eventType} activate: node.config.boardId is required.`,
      );
    }

    const accessToken = decryptToken(integration.accessTokenEncrypted);
    const callbackURL = trelloNotificationUrl(workflowId, node.id);

    const created = await webhooksCreate({
      accessToken,
      idModel: boardId,
      callbackURL,
      description: `ChainReact ${eventType} (workflow ${workflowId} node ${node.id})`,
    });

    return {
      webhookEnabled: true,
      boardId,
      eventType,
      webhookId: created.id,
      callbackURL,
      notificationUrl: callbackURL,
    };
  };
}
