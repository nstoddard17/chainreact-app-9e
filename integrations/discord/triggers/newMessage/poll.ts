import { enqueueRun } from "@/services/execution/enqueue";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import type { PollingHandler } from "@/services/triggers/pollingRegistry";
import { DEFAULT_INTERVAL_MS } from "@/services/cron/pollingIntervals";
import { messagesList } from "@/integrations/_shared/discord/api/messages";
import {
  DiscordApiError,
  NotFoundError,
} from "@/integrations/_shared/discord/errors";
import { isUserVisibleMessage } from "@/integrations/_shared/discord/messageFilters";
import { checkAndMarkSeen } from "./dedup";
import { matchesNewMessageFilters } from "./filters";
import { normalizeNewMessage } from "./normalize";
import { DiscordNewMessageConfigSchema } from "./schema";
import { maxSnowflake } from "./snowflake";

/**
 * Discord `new_message` polling handler — Slice 3.DISCORD-7.
 *
 * V2-native polling implementation per the DISCORD-5 architecture
 * decision: NOT a gateway-websocket port. Loses V1's sub-second
 * latency in exchange for fitting into V2's existing polling-trigger
 * contract (no gateway worker, no separate deploy topology).
 *
 * Per-tick flow:
 *   1. Parse the row's config through `DiscordNewMessageConfigSchema`.
 *      Missing snapshot → defensive warn + skip (activate should have
 *      populated it; this guards against partial-activation rows).
 *   2. Verify the user has a connected Discord integration. Missing
 *      integration → warn + skip (same as Gmail's pattern). The bot
 *      token used for the actual API call is global env; the
 *      integration row is the authorization gate.
 *   3. GET `/channels/{channelId}/messages?after={lastSeenMessageId}&limit=100`.
 *      Discord returns newest-first; the result is bounded at 100
 *      messages per tick (which at the 5-min default cadence means
 *      we'd lose messages only at >20 user-visible messages/minute
 *      sustained — extreme high-traffic channels would benefit from
 *      a different trigger architecture).
 *   4. **Snapshot advances FIRST, FILTERS RUN ON RESULT.** Even if
 *      every fetched message is filtered out (system messages,
 *      content/author filter mismatch), the snapshot must advance to
 *      the newest fetched id — otherwise the poll re-fetches the same
 *      batch every tick forever. This matches V1's discord-processor
 *      behavior. The snapshot advancement is computed BEFORE
 *      filter/dispatch so a mid-loop throw can't leave a regressed
 *      cursor.
 *   5. For each fetched message: strip system messages
 *      (`isUserVisibleMessage`), apply per-trigger filters, dedup-check
 *      via `webhook_event_dedup` (cross-tick safe — Discord message
 *      ids are globally-unique snowflakes), normalize → enqueueRun.
 *      One bad message does not abort the tick.
 *   6. Persist updated config — snapshot advanced + `polling.lastPolledAt`
 *      set to `now`.
 *
 * Provider error handling (mirrors Gmail's stale-cursor → re-snapshot
 * pattern but for the Discord error taxonomy):
 *   - **404 NotFoundError (channel deleted / bot kicked from
 *     channel)** — log structured warn + return. Do NOT advance the
 *     snapshot. The workflow is effectively broken until the user
 *     reconfigures; spamming the channel-not-found warning every
 *     5 minutes is preferable to silently advancing a cursor that
 *     might come back if the user re-adds the bot.
 *   - **403 DiscordApiError (bot missing permission / not in guild)** —
 *     same as 404: log + return without advancing. Recoverable when
 *     the operator re-grants permission.
 *   - **401 DiscordApiError (bot token revoked)** — propagate. The
 *     deployment is broken; the cron should surface this loud.
 *   - **Other errors** — propagate per Gmail's pattern; cron logs +
 *     moves to the next trigger.
 */

const HANDLER_ID = "discord/new_message";

async function poll(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  userRole: string;
  now: number;
}): Promise<void> {
  const { trigger } = input;
  const config = DiscordNewMessageConfigSchema.parse(trigger.config);

  if (!config.snapshot) {
    console.warn(
      JSON.stringify({
        event: "discord.poll.no_snapshot",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
      }),
    );
    return;
  }

  // Access-gate check: confirm the user has a connected Discord
  // integration. The bot token used for the actual API call is
  // global env (see _shared/discord/api/_base.ts), so this is purely
  // authorization. Matches the action-handler pattern.
  const integration = await getActiveForExecution(trigger.workflowAccountId!,
    "discord",
    null,
  );
  if (!integration) {
    console.warn(
      JSON.stringify({
        event: "discord.poll.no_integration",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
        userId: trigger.userId,
      }),
    );
    return;
  }

  const previousSnapshot = config.snapshot.lastSeenMessageId;

  let messages;
  try {
    messages = await messagesList({
      channelId: config.channelId,
      after: previousSnapshot,
      limit: 100,
    });
  } catch (err) {
    if (
      err instanceof NotFoundError ||
      (err instanceof DiscordApiError && err.status === 403)
    ) {
      // Channel deleted, bot kicked, or missing permission — do NOT
      // advance the snapshot. Workflow re-config will recover.
      console.warn(
        JSON.stringify({
          event: "discord.poll.channel_unavailable",
          triggerId: trigger.id,
          workflowId: trigger.workflowId,
          channelId: config.channelId,
          status:
            err instanceof DiscordApiError ? err.status : 404,
          error: err.message,
        }),
      );
      return;
    }
    // Other errors propagate — cron's outer catch logs them.
    throw err;
  }

  // Advance snapshot to max(previous, any fetched id) — even when
  // every fetched message is filtered out, we never re-poll the same
  // batch. Discord returns newest-first; `maxSnowflake` is BigInt-max
  // so order-of-arguments doesn't matter.
  let newSnapshot = previousSnapshot;
  for (const m of messages) {
    newSnapshot = maxSnowflake(newSnapshot, m.id);
  }

  // Discord returns newest-first; reverse to dispatch in chronological
  // (oldest → newest) order so downstream workflows see events in the
  // order they were created.
  const chronological = [...messages].reverse();

  for (const message of chronological) {
    try {
      await processOneMessage({
        trigger,
        message,
        guildId: config.guildId,
        config,
      });
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "discord.poll.message_failed",
          triggerId: trigger.id,
          messageId: message.id,
          error: (err as Error).message,
        }),
      );
    }
  }

  await triggerResourcesRepo.updateConfig(trigger.id, {
    ...config,
    snapshot: {
      lastSeenMessageId: newSnapshot,
      capturedAt: config.snapshot.capturedAt,
    },
    polling: {
      lastPolledAt: new Date(input.now).toISOString(),
    },
  });
}

async function processOneMessage(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  message: import("@/integrations/_shared/discord/api/messages").DiscordMessage;
  guildId: string;
  config: import("./schema").DiscordNewMessageConfig;
}): Promise<void> {
  const { trigger, message, guildId, config } = input;

  // System-message strip (joins, pins, boost notifications). Mirrors
  // the fetch_messages action's behavior for surface parity.
  if (!isUserVisibleMessage(message)) return;

  // Per-trigger filter (contentFilter, authorFilter).
  if (!matchesNewMessageFilters(message, config)) return;

  // Dedup — Discord message ids are globally-unique snowflakes.
  const dedupOutcome = await checkAndMarkSeen(message.id);
  if (dedupOutcome.outage) return; // fail-closed
  if (!dedupOutcome.fresh) return; // already processed in a prior tick

  const event = normalizeNewMessage({ message, guildId });

  await enqueueRun({
    workflowId: trigger.workflowId,
    triggerNodeId: trigger.nodeId,
    event,
  });
}

export const discordNewMessagePollingHandler: PollingHandler = {
  id: HANDLER_ID,
  canHandle: (trigger) =>
    trigger.provider === "discord" && trigger.eventType === "new_message",
  getIntervalMs: () => DEFAULT_INTERVAL_MS,
  poll,
};
