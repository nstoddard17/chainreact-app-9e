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
import { conversationsHistory } from "@/integrations/slack/api/conversationsHistory";
import { conversationsMembers } from "@/integrations/slack/api/conversationsMembers";
import { usersList } from "@/integrations/slack/api/usersList";
import type { StepRunOutcome } from "../writeHarness";
import type { SmokeReaderContext, SmokeReaderInput } from "./context";

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
      c.is_archived !== true && // never a smoke-created archived channel (can't post there)
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

export interface ChosenSlackUser {
  readonly userId: string;
  readonly userName: string;
}

/**
 * Discover a SAFE second user for invite_users_to_channel / remove_user_from_channel
 * smoke. Reads a bounded window of `users.list` and picks a REAL human member of the
 * throwaway workspace (never a bot, never Slackbot, never deleted). When `pinnedId`
 * (SMOKE_SLACK_INVITE_USER_ID) is set, that exact user is used if it is eligible.
 * READ-ONLY (`users.list`). Returns the user id + display name (id -> env-overlay only)
 * or null -> caller reports BLOCKED_ENV (Marcus must add a real second user to the
 * throwaway Slack workspace). NEVER invents a user id.
 */
export async function discoverSlackSmokeUser(
  accountId: string,
  _userId: string,
  pinnedId?: string | null,
): Promise<ChosenSlackUser | null> {
  const integration = await getActiveForExecution(accountId, "slack", null);
  if (!integration) return null;
  let members: readonly Readonly<Record<string, unknown>>[];
  try {
    const res = await refreshAndRetry({
      accountId,
      provider: "slack",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) => usersList({ botToken: accessToken, limit: 200 }),
    });
    members = res.users;
  } catch {
    return null;
  }
  const eligible = pickSlackSmokeUserIds(members);
  const chosenId = pinnedId && eligible.includes(pinnedId) ? pinnedId : eligible[0];
  if (!chosenId) return null;
  const chosen = members.find((m) => m.id === chosenId);
  const profile = chosen?.profile as Record<string, unknown> | undefined;
  const name = String(chosen?.name ?? profile?.display_name ?? profile?.real_name ?? chosenId);
  return { userId: chosenId, userName: name };
}

/**
 * Extract the sanitized state of ONE message from a `conversations.history` window.
 * Finds the message by its `ts` and returns only what a smoke verify reads: whether it
 * was found, its current text (proves an update), its reaction names (proves an
 * add/remove reaction), and whether it is pinned (proves a pin/unpin). NEVER the raw
 * provider payload. Pure over the messages array.
 *
 * `pinned` is derived from Slack's `pinned_to` array (the channel ids a message is pinned
 * to), which conversations.history returns under the granted `channels:history` scope --
 * so pin/unpin verify needs NO `pins:read` (pins.list is unavailable without it).
 */
export function extractSlackMessageState(
  messages: readonly Readonly<Record<string, unknown>>[],
  ts: string,
): { found: boolean; text: string; reactions: string[]; pinned: boolean } {
  const msg = messages.find((m) => m.ts === ts);
  if (!msg) return { found: false, text: "", reactions: [], pinned: false };
  const reactions = Array.isArray(msg.reactions)
    ? (msg.reactions as Readonly<Record<string, unknown>>[]).map((r) => String(r.name ?? ""))
    : [];
  const pinned = Array.isArray(msg.pinned_to) && (msg.pinned_to as unknown[]).length > 0;
  return { found: true, text: String(msg.text ?? ""), reactions, pinned };
}

/**
 * Extract the sanitized state of ONE channel from `conversations.list` hits. Finds the
 * channel by id and returns only what a channel-lifecycle verify reads: found, name,
 * topic, purpose, is_archived. `conversations.info` is NOT usable here (Slack rejects its
 * JSON-body transport with `invalid_arguments`), so lifecycle read-back goes through
 * `conversations.list`, which DOES return name/topic/purpose/is_archived per channel. Pure.
 */
export function extractSlackChannelState(
  channels: readonly Readonly<Record<string, unknown>>[],
  channelId: string,
): {
  found: boolean;
  name: string;
  topic: string;
  purpose: string;
  is_archived: boolean;
  is_member: boolean;
} {
  const ch = channels.find((c) => c.id === channelId);
  if (!ch) return { found: false, name: "", topic: "", purpose: "", is_archived: false, is_member: false };
  const nested = (v: unknown): string =>
    v && typeof v === "object" && "value" in v ? String((v as { value?: unknown }).value ?? "") : "";
  return {
    found: true,
    name: String(ch.name ?? ""),
    topic: nested(ch.topic),
    purpose: nested(ch.purpose),
    is_archived: ch.is_archived === true,
    // Bot's own membership — conversations.list reports `is_member` per channel for
    // every public channel visible with channels:read, regardless of membership. This
    // is what join_channel (true) / leave_channel (false) verify against.
    is_member: ch.is_member === true,
  };
}

/**
 * Pick the eligible member ids from a `users.list` window for smoke invite/remove.
 * A candidate must be a REAL human of the throwaway workspace: not a bot (`is_bot`),
 * not the special Slackbot (`USLACKBOT`), not deleted. Returns ids in Slack's list
 * order (deterministic). Pure over the members array.
 */
export function pickSlackSmokeUserIds(
  members: readonly Readonly<Record<string, unknown>>[],
): string[] {
  return members
    .filter(
      (m) =>
        typeof m.id === "string" &&
        (m.id as string).length > 0 &&
        m.id !== "USLACKBOT" &&
        m.is_bot !== true &&
        m.deleted !== true,
    )
    .map((m) => m.id as string);
}

/** Read a smoke-owned message's precise text + reactions via `conversations.history`. */
async function readSlackMessageState(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const channel = typeof input.config.channel === "string" ? input.config.channel : "";
  const ts = typeof input.config.ts === "string" ? input.config.ts : "";
  if (!channel || !ts) {
    return { ok: false, output: null, reason: "slack message_state: missing channel/ts" };
  }
  const integration = await getActiveForExecution(ctx.accountId, "slack", null);
  if (!integration) return { ok: false, output: null, reason: "slack not connected" };
  const res = await refreshAndRetry({
    accountId: ctx.accountId,
    provider: "slack",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) => conversationsHistory({ botToken: accessToken, channel, limit: 30 }),
  });
  return { ok: true, output: extractSlackMessageState(res.messages, ts), reason: null };
}

/**
 * Read a smoke-owned channel's precise state via `conversations.list` (bounded cursor
 * paging), locating it by id (archived channels included). Sanitized: found / name /
 * topic / purpose / is_archived.
 */
async function readSlackChannelState(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const channelId = typeof input.config.channel === "string" ? input.config.channel : "";
  if (!channelId) return { ok: false, output: null, reason: "slack channel_state: missing channel" };
  const integration = await getActiveForExecution(ctx.accountId, "slack", null);
  if (!integration) return { ok: false, output: null, reason: "slack not connected" };
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const res = await refreshAndRetry({
      accountId: ctx.accountId,
      provider: "slack",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        conversationsList({
          botToken: accessToken,
          types: "public_channel,private_channel",
          excludeArchived: false,
          limit: 200,
          cursor,
        }),
    });
    const state = extractSlackChannelState(res.channels, channelId);
    if (state.found) return { ok: true, output: state, reason: null };
    if (!res.nextCursor) break;
    cursor = res.nextCursor;
  }
  // Not found in the bounded page budget -> report a found:false state (honest; a verify
  // asserting on name/is_archived/is_member then fails rather than falsely passing).
  return {
    ok: true,
    output: { found: false, name: "", topic: "", purpose: "", is_archived: false, is_member: false },
    reason: null,
  };
}

/**
 * Read a channel's member user-id list via `conversations.members` (bounded cursor
 * paging). Sanitized: `{ members: string[] }` — only the user ids a membership verify
 * reads (never the raw user objects / profiles / PII). Proves a SPECIFIC user's
 * membership for invite_users_to_channel (expectContains) and its removal for
 * remove_user_from_channel (expectAbsent).
 */
async function readSlackChannelMembers(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const channel = typeof input.config.channel === "string" ? input.config.channel : "";
  if (!channel) return { ok: false, output: null, reason: "slack channel_members: missing channel" };
  const integration = await getActiveForExecution(ctx.accountId, "slack", null);
  if (!integration) return { ok: false, output: null, reason: "slack not connected" };
  const members: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const res = await refreshAndRetry({
      accountId: ctx.accountId,
      provider: "slack",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) => conversationsMembers({ botToken: accessToken, channel, limit: 200, cursor }),
    });
    members.push(...res.members);
    if (!res.nextCursor) break;
    cursor = res.nextCursor;
  }
  return { ok: true, output: { members }, reason: null };
}

/**
 * Slack smoke read-back seam. Owns three smoke-only read actions:
 *   - `message_state`   — ONE message's text + reactions (`conversations.history`).
 *   - `channel_state`   — ONE channel's name/topic/purpose/is_archived/is_member
 *     (`conversations.list`; `conversations.info` is unusable — its JSON transport
 *     returns `invalid_arguments`).
 *   - `channel_members` — a channel's member user-id list (`conversations.members`,
 *     form transport) for invite/remove membership verifies.
 * Returns null for any other (provider, action). Bounded + sanitized.
 */
export async function slackSmokeReadBack(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome | null> {
  if (input.provider !== "slack") return null;
  if (input.action === "message_state") return readSlackMessageState(ctx, input);
  if (input.action === "channel_state") return readSlackChannelState(ctx, input);
  if (input.action === "channel_members") return readSlackChannelMembers(ctx, input);
  return null;
}
