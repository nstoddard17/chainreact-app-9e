import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  type OptionItem,
  type OptionsResolver,
} from "@/services/options/types";
import { chatsList } from "@/integrations/microsoft-teams/api/chatsList";
import {
  filterByLabelOrDescription,
  mapTeamsOptionsError,
  requireTeamsIntegration,
} from "./_shared";

/**
 * `microsoft-teams:chats` options resolver — RESOLVERS-1.
 *
 * Backs the chat picker on `send_chat_message.chatId`. Previously
 * DEFERRED (1:1 chats are unnamed, so labeling needs participant
 * expansion) — Marcus approved un-deferring with exactly that labeling
 * strategy: expand members and label unnamed chats by participant
 * display names.
 *
 * Endpoint: `GET /v1.0/me/chats?$expand=members&$top=50` via the new
 * `api/chatsList.ts` wrapper.
 * Docs: https://learn.microsoft.com/en-us/graph/api/chat-list
 * Scope: covered by the manifest's existing `Chat.ReadWrite` (the read
 * variants Chat.ReadBasic/Chat.Read are subsumed) — no scope change.
 *
 * Mapping (chat → OptionItem):
 *   - `value`: chat `id` (the opaque `19:...@thread.v2` id the
 *     send_chat_message schema stores).
 *   - `label`: the chat `topic` when set; otherwise up to 3 member
 *     displayNames joined with ", " (+ "…" when more); otherwise the id.
 *     Display names only — member emails are NEVER surfaced.
 *   - `description`: friendly chat-type tag ("1:1 chat" / "Group chat" /
 *     "Meeting chat") for disambiguation — no message content, no
 *     participant metadata beyond names.
 *
 * Ordering: Graph's default (most-recent-message first) is preserved —
 * recency is the natural ranking for a chat picker (mirrors the OneNote
 * pages resolver's recency posture); no alpha sort.
 *
 * `hasMore`: `result.nextLink !== null` (Graph paging signal).
 *
 * Error sanitization via `mapTeamsOptionsError`: auth →
 * `INTEGRATION_DISCONNECTED`; anything else → `PROVIDER_ERROR`. Token /
 * raw Graph body / message content never reach the browser.
 *
 * Needs live smoke — coded against the official Graph docs; no live
 * verification was possible in this slice.
 */

const MAX_LABEL_MEMBERS = 3;

const CHAT_TYPE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  oneOnOne: "1:1 chat",
  group: "Group chat",
  meeting: "Meeting chat",
};

function memberNamesLabel(
  members: ReadonlyArray<{ displayName?: string | null }> | undefined,
): string | undefined {
  if (!Array.isArray(members)) return undefined;
  const names: string[] = [];
  for (const member of members) {
    if (typeof member?.displayName !== "string") continue;
    const name = member.displayName.trim();
    if (name.length === 0) continue;
    names.push(name);
  }
  if (names.length === 0) return undefined;
  const shown = names.slice(0, MAX_LABEL_MEMBERS).join(", ");
  return names.length > MAX_LABEL_MEMBERS ? `${shown}…` : shown;
}

export const microsoftTeamsChatsResolver: OptionsResolver = {
  source: "microsoft-teams:chats",
  provider: "microsoft-teams",
  requiresIntegration: true,
  async resolve(ctx) {
    const integration = requireTeamsIntegration(ctx);

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-teams",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) => chatsList({ accessToken }),
      });
    } catch (err) {
      mapTeamsOptionsError(err);
    }

    const items: OptionItem[] = [];
    for (const chat of result.chats) {
      if (typeof chat.id !== "string" || chat.id.length === 0) continue;
      const topic =
        typeof chat.topic === "string" && chat.topic.trim().length > 0
          ? chat.topic.trim()
          : undefined;
      const label = topic ?? memberNamesLabel(chat.members) ?? chat.id;
      const description =
        typeof chat.chatType === "string"
          ? CHAT_TYPE_DESCRIPTIONS[chat.chatType]
          : undefined;
      items.push(
        description !== undefined
          ? { value: chat.id, label, description }
          : { value: chat.id, label },
      );
    }

    // Graph default order = most recent message first — preserved (no
    // alpha sort; recency is the useful ranking for chats).
    const filtered = filterByLabelOrDescription(items, ctx.q);

    return { items: filtered, hasMore: result.nextLink !== null };
  },
};
