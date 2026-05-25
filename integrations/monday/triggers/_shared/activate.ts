import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { decryptToken } from "@/core/encryption/tokens";
import { webhooksCreate } from "@/integrations/_shared/monday/api/webhooksCreate";
import { mondayNotificationUrl } from "./notificationUrl";
import {
  CHANGE_SPECIFIC_COLUMN_EVENT,
  CREATE_WEBHOOK_EVENT,
  type MondayTriggerType,
} from "./eventMap";

/**
 * Shared activation builder for the 5 Monday webhook triggers —
 * Slice 3.MONDAY-7.
 *
 * All 5 V2 Monday triggers (`new_item`, `column_changed`, `item_moved`,
 * `new_subitem`, `new_update`) bind to a board via Monday's
 * `create_webhook` GraphQL mutation. The only per-trigger difference is
 * the Monday event enum (`eventMap.CREATE_WEBHOOK_EVENT`) and — for
 * `column_changed` — an optional `columnId` filter.
 *
 * **Per-(workflow, node) lifecycle.** Each trigger node creates its own
 * webhook with its own `?workflowId=&nodeId=` URL. Two trigger nodes on
 * the same board create two Monday webhooks — each strictly resolves to
 * its row on receive.
 *
 * **`column_changed` columnId filter (MONDAY-7 plan §2.2 + §3.2).** When
 * `node.config.columnId` is set, activation subscribes to
 * `change_specific_column_value` with `config: {"columnId": "<id>"}`
 * instead of the board-wide `change_column_value`. The `config` param
 * requires Monday API-Version `2025-04`, which is why the whole webhook
 * lifecycle pins that version (see `webhooksCreate`).
 *
 * `trigger_resources.config` after activation:
 *   - `webhookEnabled: true`
 *   - `boardId` — the Monday board id from `node.config.boardId`.
 *   - `columnId` — the optional column filter (column_changed only; null
 *     otherwise) — persisted so deactivation diagnostics + re-activation
 *     stay in sync.
 *   - `event` — the Monday event enum actually subscribed.
 *   - `webhookId` — Monday's webhook resource id (string), for
 *     deactivation cleanup.
 *   - `notificationUrl` — the exact URL registered (diagnostic parity
 *     with GitHub / Trello config shape).
 *
 * **NO `type: "subscription-watch"` field** — Monday webhooks don't
 * expire. The `runRenewals` cron filters on
 * `config.type === "subscription-watch"`; omitting it keeps the renewal
 * cron from ever touching Monday rows. Same "permanent endpoint" pattern
 * as GitHub / Shopify / Trello.
 *
 * A throw aborts the activate transition (the orchestrator wraps it as
 * TRIGGER_REGISTRATION_FAILED).
 */

/** Webhook lifecycle API version — the `config` param landed in 2025-04. */
const WEBHOOK_API_VERSION = "2025-04";

export function buildMondayActivate(triggerType: MondayTriggerType): ActivationFn {
  return async ({ node, integration, workflowId }) => {
    const boardId = node.config?.boardId;
    if (typeof boardId !== "string" || boardId.length === 0) {
      throw new Error(
        `monday ${triggerType} activate: node.config.boardId is required.`,
      );
    }

    // Optional columnId filter — column_changed only. Validate shape but
    // never fail when absent.
    let columnId: string | null = null;
    if (triggerType === "column_changed") {
      const raw = node.config?.columnId;
      if (raw !== undefined && raw !== null && raw !== "") {
        if (typeof raw !== "string") {
          throw new Error(
            "monday column_changed activate: node.config.columnId must be a string when supplied.",
          );
        }
        columnId = raw;
      }
    }

    const event =
      triggerType === "column_changed" && columnId !== null
        ? CHANGE_SPECIFIC_COLUMN_EVENT
        : CREATE_WEBHOOK_EVENT[triggerType];

    const accessToken = decryptToken(integration.accessTokenEncrypted);
    const url = mondayNotificationUrl(workflowId, node.id);
    const configJson =
      columnId !== null ? JSON.stringify({ columnId }) : undefined;

    const created = await webhooksCreate({
      accessToken,
      boardId,
      url,
      event,
      configJson,
      apiVersion: WEBHOOK_API_VERSION,
    });

    return {
      webhookEnabled: true,
      boardId,
      columnId,
      event,
      webhookId: created.id,
      notificationUrl: url,
    };
  };
}
