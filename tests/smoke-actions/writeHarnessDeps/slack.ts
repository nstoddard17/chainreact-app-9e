/**
 * Write smoke harness deps — Slack smoke-channel discovery.
 *
 * Slack write fixtures (send_channel_message, delete_message) need a channel the bot
 * can post to AND read history from. Rather than require a hardcoded
 * SMOKE_SLACK_CHANNEL_ID, the live dev test discovers a SAFE one: a
 * smoke/test/chainreact-named channel that is either one the bot is already a MEMBER of,
 * or a PUBLIC channel the bot can self-join (`channels:join`) in the fixture's
 * join_channel setup step (conversations.history needs membership even though
 * chat:write.public allows posting without it). It NEVER falls back to an arbitrary
 * channel — posting to a real channel is not smoke-safe — so absent a safe match the
 * caller reports BLOCKED_ENV (set SMOKE_SLACK_CHANNEL_ID at a dedicated smoke channel).
 *
 * Slack is ACCOUNT-class (bot-token, non-refreshable), but the read still routes through
 * `refreshAndRetry` (like the Notion discovery seam) so every smoke seam stays on the
 * SAME path — non-refreshable means it is a no-op on success and surfaces a 401 on
 * failure, and the seam-refresh-guard stays satisfied (no raw decryptToken). Output is
 * the channel id (env-overlay only) + its name (for the report).
 */
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { conversationsList } from "@/integrations/slack/api/conversationsList";

/** A channel is smoke-safe when its name is explicitly smoke/test/chainreact-named. */
const SMOKE_NAME = /smoke|test|chainreact/i;

export interface ChosenSlackChannel {
  readonly channelId: string;
  readonly channelName: string;
}

/**
 * Pick a SAFE smoke channel from `conversations.list` hits. Rules:
 *   - USABLE = the bot is already a MEMBER (`is_member === true`, post + history work),
 *     OR the channel is PUBLIC (`is_private === false`) so the bot can self-join it in
 *     the fixture's join_channel setup step (conversations.history needs membership even
 *     though chat:write.public allows posting without it). A PRIVATE channel the bot is
 *     not in is unusable (cannot self-join) and is excluded;
 *   - when `pinnedId` is set (SMOKE_SLACK_CHANNEL_ID), that exact channel is used if usable;
 *   - otherwise prefer a smoke-named channel the bot is ALREADY in (no join needed), else
 *     the first smoke-named public channel — deterministic by Slack's list order;
 *   - NEVER an arbitrary channel -> null when no safe match (caller: BLOCKED_ENV). Pure.
 */
export function pickSlackSmokeChannel(
  channels: readonly Readonly<Record<string, unknown>>[],
  pinnedId?: string | null,
): ChosenSlackChannel | null {
  const usable = channels.filter(
    (c) =>
      typeof c.id === "string" &&
      (c.id as string).length > 0 &&
      (c.is_member === true || c.is_private === false),
  );
  let chosen: Readonly<Record<string, unknown>> | undefined;
  if (pinnedId) {
    chosen = usable.find((c) => c.id === pinnedId);
  } else {
    chosen =
      usable.find((c) => c.is_member === true && SMOKE_NAME.test(String(c.name ?? ""))) ??
      usable.find((c) => SMOKE_NAME.test(String(c.name ?? "")));
  }
  if (!chosen) return null;
  return { channelId: chosen.id as string, channelName: String(chosen.name ?? chosen.id) };
}

/**
 * Discover a safe smoke Slack CHANNEL for write fixtures. When `pinnedId`
 * (SMOKE_SLACK_CHANNEL_ID) is set, that exact channel is used if usable; else a
 * smoke/test-named member-or-public channel is chosen (the fixture join_channel step
 * makes the bot a member of a public pick). READ-ONLY (conversations.list). Returns the
 * channel id + name (env-overlay only) or null -> caller reports BLOCKED_ENV.
 */
export async function discoverSlackSmokeChannel(
  accountId: string,
  _userId: string,
  pinnedId?: string | null,
): Promise<ChosenSlackChannel | null> {
  const integration = await getActiveForExecution(accountId, "slack", null);
  if (!integration) return null;
  let channels: readonly Readonly<Record<string, unknown>>[];
  try {
    const res = await refreshAndRetry({
      accountId,
      provider: "slack",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        conversationsList({
          botToken: accessToken,
          types: "public_channel,private_channel",
          excludeArchived: true,
          limit: 200,
        }),
    });
    channels = res.channels;
  } catch {
    return null;
  }
  return pickSlackSmokeChannel(channels, pinnedId);
}
