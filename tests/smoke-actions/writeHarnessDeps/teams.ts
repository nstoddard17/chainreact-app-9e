/**
 * Write smoke harness deps — Microsoft Teams smoke read-back seam + chat discovery.
 *
 * The registered `list_channel_messages` read deliberately projects header-level
 * metadata ONLY (no body content — PII stance), so it cannot prove a smoke marker
 * on a persisted message. The seam owns the bounded per-message reads the send
 * fixtures verify through:
 *   - `channel_message_state` — GET one channel message (or one REPLY via the
 *     parent's /replies/{id} subpath when `parentMessageId` is set — Graph does
 *     not serve replies at the top-level message URL). Returns ONLY
 *     { found, bodyContent, replyToId }. bodyContent is OUR smoke message's own
 *     marker text — never someone else's message (the id is ledger-captured from
 *     the send this run performed).
 *   - `chat_message_state` — GET one chat message; same sanitized shape.
 *   Typed NotFoundError / HTTP 404 maps to found:false; any other error rethrows
 *   (a permission failure can never read as "absent" — context.ts invariant).
 *
 * `discoverTeamsSmokeChat` lists the connected account's existing chats
 * (GET /me/chats, Chat.ReadWrite scope) and picks a smoke/test/chainreact-topic
 * chat when present, else the FIRST chat on the throwaway tenant — Batch 1 has no
 * Chat.Create scope, so an EXISTING chat is the only valid send_chat_message
 * target. A pinned SMOKE_TEAMS_CHAT_ID always wins. READ-ONLY.
 *
 * Every Graph call runs inside `refreshAndRetry` (seam-refresh-guard); the raw
 * GETs mirror the provider wrappers' 401/404 mapping.
 */
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry, Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { channelMessageGet } from "@/integrations/microsoft-teams/api/channelMessageGet";
import type { ChatMessageResource } from "@/integrations/microsoft-teams/api/types";
import type { StepRunOutcome } from "../writeHarness";
import type { SmokeReaderContext, SmokeReaderInput } from "./context";

/** Sanitized message-state projection shared by both seam reads. */
function projectMessageState(msg: ChatMessageResource): Record<string, unknown> {
  return {
    found: true,
    bodyContent: msg.body?.content ?? "",
    replyToId: msg.replyToId ?? null,
  };
}

const NOT_FOUND_STATE: Record<string, unknown> = {
  found: false,
  bodyContent: "",
  replyToId: null,
};

/** Bounded raw GET of one Graph chatMessage resource (reply subpath / chat scope). */
async function graphGetChatMessage(
  accessToken: string,
  path: string,
): Promise<ChatMessageResource> {
  const res = await fetch(`${graphApiBase()}/v1.0/${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    throw new Unauthorized401Error("Microsoft Graph chatMessage GET returned HTTP 401");
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError("chat message", surfaceGraphError(text, 404));
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph chatMessage GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }
  return (await res.json()) as ChatMessageResource;
}

/** channel_message_state — one channel message (or reply via the parent subpath). */
async function readChannelMessageState(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const teamId = typeof input.config.teamId === "string" ? input.config.teamId : "";
  const channelId = typeof input.config.channelId === "string" ? input.config.channelId : "";
  const messageId = typeof input.config.messageId === "string" ? input.config.messageId : "";
  const parentMessageId =
    typeof input.config.parentMessageId === "string" && input.config.parentMessageId.length > 0
      ? input.config.parentMessageId
      : null;
  if (!teamId || !channelId || !messageId) {
    return { ok: false, output: null, reason: "teams channel_message_state: missing teamId/channelId/messageId" };
  }
  const integration = await getActiveForExecution(ctx.accountId, "microsoft-teams", null);
  if (!integration) return { ok: false, output: null, reason: "microsoft-teams not connected" };
  try {
    const msg = await refreshAndRetry({
      accountId: ctx.accountId,
      provider: "microsoft-teams",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        parentMessageId
          ? graphGetChatMessage(
              accessToken,
              `teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}` +
                `/messages/${encodeURIComponent(parentMessageId)}/replies/${encodeURIComponent(messageId)}`,
            )
          : channelMessageGet({ accessToken, teamId, channelId, messageId }),
    });
    return { ok: true, output: projectMessageState(msg), reason: null };
  } catch (err) {
    if (err instanceof NotFoundError) return { ok: true, output: NOT_FOUND_STATE, reason: null };
    throw err;
  }
}

/** chat_message_state — one chat message's sanitized state. */
async function readChatMessageState(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const chatId = typeof input.config.chatId === "string" ? input.config.chatId : "";
  const messageId = typeof input.config.messageId === "string" ? input.config.messageId : "";
  if (!chatId || !messageId) {
    return { ok: false, output: null, reason: "teams chat_message_state: missing chatId/messageId" };
  }
  const integration = await getActiveForExecution(ctx.accountId, "microsoft-teams", null);
  if (!integration) return { ok: false, output: null, reason: "microsoft-teams not connected" };
  try {
    const msg = await refreshAndRetry({
      accountId: ctx.accountId,
      provider: "microsoft-teams",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        graphGetChatMessage(
          accessToken,
          `chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`,
        ),
    });
    return { ok: true, output: projectMessageState(msg), reason: null };
  } catch (err) {
    if (err instanceof NotFoundError) return { ok: true, output: NOT_FOUND_STATE, reason: null };
    throw err;
  }
}

export interface TeamsSmokeChat {
  readonly chatId: string;
  /** Safe label for the report — topic when set, else the chat type. */
  readonly label: string;
}

interface GraphChatLite {
  id?: string;
  topic?: string | null;
  chatType?: string | null;
}

const SMOKE_TOPIC_RE = /smoke|test|chainreact/i;

/**
 * Discover an EXISTING chat for send_chat_message (Batch 1 has no Chat.Create):
 * pinned SMOKE_TEAMS_CHAT_ID wins; else prefer a smoke/test/chainreact-topic chat;
 * else the first chat on the throwaway tenant. READ-ONLY (GET /me/chats). Returns
 * null when Teams is not connected or the account has NO chats -> BLOCKED_ENV.
 */
export async function discoverTeamsSmokeChat(
  accountId: string,
  _userId: string,
  pinnedChatId?: string | null,
): Promise<TeamsSmokeChat | null> {
  const integration = await getActiveForExecution(accountId, "microsoft-teams", null);
  if (!integration) return null;
  try {
    const chats = await refreshAndRetry({
      accountId,
      provider: "microsoft-teams",
      providerAccountId: integration.providerAccountId,
      apiCall: async (accessToken) => {
        const res = await fetch(
          `${graphApiBase()}/v1.0/me/chats?$top=20&$select=id,topic,chatType`,
          { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (res.status === 401) {
          throw new Unauthorized401Error("Microsoft Graph me/chats returned HTTP 401");
        }
        if (!res.ok) {
          const text = await res.text();
          throw new Error(
            `Microsoft Graph me/chats failed: ${surfaceGraphError(text, res.status)}`,
          );
        }
        return ((await res.json()) as { value?: GraphChatLite[] }).value ?? [];
      },
    });
    const usable = chats.filter((c) => typeof c.id === "string" && c.id.length > 0);
    if (usable.length === 0) return null;
    if (pinnedChatId) {
      const pinned = usable.find((c) => c.id === pinnedChatId);
      if (pinned) return { chatId: pinned.id!, label: pinned.topic ?? pinned.chatType ?? "chat" };
      // A pinned id that no longer resolves is a target problem — report none.
      return null;
    }
    const preferred = usable.find((c) => SMOKE_TOPIC_RE.test(c.topic ?? ""));
    const chosen = preferred ?? usable[0]!;
    return { chatId: chosen.id!, label: chosen.topic ?? chosen.chatType ?? "chat" };
  } catch {
    return null;
  }
}

/**
 * Microsoft Teams smoke read-back seam. Owns two smoke-only reads:
 *   - `channel_message_state` — one channel message / reply's { found, bodyContent,
 *     replyToId } (send_channel_message + reply_to_channel_message proofs).
 *   - `chat_message_state` — one chat message's same shape (send_chat_message proof).
 * Returns null for any other (provider, action). Bounded + sanitized.
 */
export async function teamsSmokeReadBack(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome | null> {
  if (input.provider !== "microsoft-teams") return null;
  if (input.action === "channel_message_state") return readChannelMessageState(ctx, input);
  if (input.action === "chat_message_state") return readChatMessageState(ctx, input);
  return null;
}
