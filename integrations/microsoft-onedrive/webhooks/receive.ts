import type { TriggerEvent } from "@/contracts/triggerEvent";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { checkValidationHandshake } from "@/integrations/_shared/microsoft/webhooks/validation";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { pull, type PullMode } from "../triggers/fileChanged/pull";

/**
 * Verify and parse an inbound Microsoft Graph notification for the
 * OneDrive `file_changed` trigger.
 *
 * Mirrors Slice 6 mail + Slice 7 calendar shape. OneDrive-specific
 * differences:
 *   1. **Two receive branches.** Notifications on `/me/drive/root`
 *      sometimes carry a usable `resourceData.id` (the changed item's
 *      DriveItem id) and sometimes don't (`id === "root"` or empty).
 *      The id-fetch branch GETs the item directly; the delta-fallback
 *      branch walks `/me/drive/root/delta` against the persisted
 *      cursor and emits one event per returned item. Slice 8 plan
 *      §"file_changed trigger algorithm" — Webhook receive.
 *   2. **Drive-item filter.** Subscriptions on `/me/drive/root`
 *      occasionally fire for non-DriveItem-shaped resources (rare in
 *      practice). Defensive filter on `resourceData["@odata.type"] ===
 *      "#Microsoft.Graph.DriveItem"`. Same pattern as Slice 7's
 *      event-resource filter.
 *
 * Slice 8 plan §"Webhook receive" — Validation handshake (no DB I/O,
 * shared helper) + per-notification trigger lookup + clientState
 * verify + branch dispatch.
 *
 * Outcomes:
 *   - `validation`: validation-handshake request — the route echoes
 *     the token. Returned shape carries the token so the route can
 *     respond text/plain 200 verbatim.
 *   - `events`: zero or more TriggerEvents to dispatch.
 *
 * Throws:
 *   - `InvalidSignatureError` when the body is malformed (NOT a
 *     validation request and NOT a parseable notification envelope).
 *     The route maps to 401.
 */

export type ReceiveResult =
  | { kind: "validation"; token: string }
  | { kind: "events"; events: TriggerEvent[] };

interface NotificationItem {
  subscriptionId?: string;
  clientState?: string;
  changeType?: string;
  resource?: string;
  resourceData?: { id?: string; "@odata.type"?: string };
  tenantId?: string;
  subscriptionExpirationDateTime?: string;
}

interface NotificationEnvelope {
  value?: NotificationItem[];
}

const DRIVE_ITEM_ODATA_TYPE = "#microsoft.graph.driveitem";

function isDriveItemResource(item: NotificationItem): boolean {
  const odataType = item.resourceData?.["@odata.type"];
  if (!odataType) return true;
  return odataType.toLowerCase() === DRIVE_ITEM_ODATA_TYPE;
}

/**
 * Drive notifications sometimes carry `resourceData.id === "root"`
 * (the literal sentinel for the drive root) — that's the trigger to
 * use the delta-fallback branch instead of trying to GET an item
 * literally named "root". Also fall back when the id is absent or
 * empty.
 */
function selectPullMode(item: NotificationItem): PullMode {
  const rawId = item.resourceData?.id?.trim();
  if (!rawId || rawId.toLowerCase() === "root") {
    return { kind: "delta-fallback" };
  }
  return { kind: "id-fetch", itemId: rawId };
}

export async function receiveOneDriveWebhook(
  request: Request,
): Promise<ReceiveResult> {
  // Validation handshake — query token OR text/plain body. Shared
  // helper consumes the body once; we use the returned bodyText for
  // downstream JSON parsing.
  const { validationToken, bodyText } = await checkValidationHandshake(
    request,
  );
  if (validationToken !== null) {
    return { kind: "validation", token: validationToken };
  }

  // Notification path. Parse body as JSON; malformed → spoof signal.
  let envelope: NotificationEnvelope;
  try {
    envelope = JSON.parse(bodyText) as NotificationEnvelope;
  } catch {
    throw new InvalidSignatureError(
      "Microsoft OneDrive webhook: body is not valid JSON",
    );
  }

  const notifications = Array.isArray(envelope.value) ? envelope.value : [];
  if (notifications.length === 0) {
    return { kind: "events", events: [] };
  }

  const events: TriggerEvent[] = [];
  const occurredAt = new Date().toISOString();

  for (const notification of notifications) {
    const subscriptionId = notification.subscriptionId;
    const incomingClientState = notification.clientState;

    if (!subscriptionId) {
      console.warn(
        JSON.stringify({
          event: "webhook.onedrive.malformed_notification",
          subscriptionId: null,
        }),
      );
      continue;
    }

    if (!isDriveItemResource(notification)) {
      console.debug(
        JSON.stringify({
          event: "webhook.onedrive.non_driveitem_resource",
          subscriptionId,
          odataType: notification.resourceData?.["@odata.type"] ?? null,
        }),
      );
      continue;
    }

    // 1. Look up the trigger row by subscription id.
    const matches = await triggerResourcesRepo.listByConfigContains({
      subscriptionId,
    });
    if (matches.length === 0) {
      console.debug(
        JSON.stringify({
          event: "webhook.onedrive.unknown_subscription",
          subscriptionId,
        }),
      );
      continue;
    }
    const trigger = matches[0]!;

    // 2. clientState verification. Mismatch logged but never thrown —
    //    same Slice 6 + 7 reasoning: avoid probing exposure.
    const storedClientState = (
      trigger.config as { clientState?: string }
    ).clientState;
    if (
      !storedClientState ||
      !incomingClientState ||
      storedClientState !== incomingClientState
    ) {
      console.warn(
        JSON.stringify({
          event: "webhook.onedrive.client_state_mismatch",
          subscriptionId,
        }),
      );
      continue;
    }

    // 3. Decide branch + delegate to pull.
    const mode = selectPullMode(notification);
    const result = await pull(trigger, mode, occurredAt);
    for (const e of result.events) events.push(e);
  }

  return { kind: "events", events };
}
