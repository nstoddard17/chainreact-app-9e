import type { TriggerEvent } from "@/contracts/triggerEvent";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { getActiveForExecution } from "@/repositories/integrations";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { channelMessageGet } from "../../api/channelMessageGet";
import { normalize, type NormalizeContext } from "./normalize";

/**
 * Hydrate the message resource for a single inbound notification and
 * return a normalized TriggerEvent.
 *
 * Subscriptions on `/teams/{teamId}/channels/{channelId}/messages` are
 * created with `includeResourceData: false`, so the notification body
 * only carries the message id. We GET the full resource via
 * `channelMessageGet` wrapped in `refreshAndRetry`.
 *
 * 404 handling: a message can be deleted between the notification's
 * arrival and our fetch (rare for `changeType: created` but possible).
 * In that case we return zero events for this notification — the
 * deletion is observable via a future `deleted`-change-type trigger
 * (deferred to Batch 2), not via the create path.
 *
 * Missing integration row (user disconnected the provider between
 * activation and this notification): return zero events. Graph will
 * keep delivering until the subscription expires; the renewal path
 * will surface the disconnection via refreshAndRetry's
 * IntegrationActionRequiredError signal.
 */

export interface PullResult {
  events: TriggerEvent[];
}

export async function pull(
  trigger: TriggerResourceRecord,
  messageId: string,
  notificationOccurredAt: string,
): Promise<PullResult> {
  const integration = await getActiveForExecution(trigger.workflowAccountId!,
    trigger.provider,
    trigger.providerAccountId,
  );
  if (!integration) {
    return { events: [] };
  }

  const config = trigger.config as {
    subscriptionId?: string;
    teamId?: string;
    channelId?: string;
  };

  if (!config.subscriptionId || !config.teamId || !config.channelId) {
    return { events: [] };
  }

  const ctx: NormalizeContext = {
    subscriptionId: config.subscriptionId,
    teamId: config.teamId,
    channelId: config.channelId,
    notificationOccurredAt,
    providerAccountId: integration.accountId,
  };

  try {
    const message = await refreshAndRetry({
      accountId: integration.accountId,
      provider: "microsoft-teams",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        channelMessageGet({
          accessToken,
          teamId: config.teamId!,
          channelId: config.channelId!,
          messageId,
        }),
    });
    return { events: [normalize(message, ctx)] };
  } catch (err) {
    if (err instanceof NotFoundError) {
      // Message deleted between notification + fetch. Batch 1's
      // `created`-only subscription has no deleted-event surface;
      // swallow + log + return zero events.
      console.debug(
        JSON.stringify({
          event: "webhook.microsoft_teams.message_404_on_hydration",
          subscriptionId: config.subscriptionId,
          messageId,
        }),
      );
      return { events: [] };
    }
    throw err;
  }
}
