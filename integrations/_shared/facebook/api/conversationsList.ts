import { graphRequest } from "./_request";

/**
 * Facebook `GET /{pageId}/conversations` — Slice 3.FACEBOOK-3. Lists the
 * Page's Messenger conversations, newest-first (Graph's default order).
 * Backs the `facebook:conversations` options resolver (the `recipientId`
 * picker on `send_message`).
 *
 * Page-scoped — call with a Page access token (derive it at runtime via
 * `getPageAccessToken`). Requires `pages_messaging` + a Page role; this is
 * the stricter Messenger Platform surface (an internal launch-readiness
 * concern, not surfaced to end users).
 *
 * `participants.data[]` carries the page itself plus the user the page is
 * talking to. The resolver derives the user's PSID by excluding the page
 * participant, then emits `conversationId:psid` (the value shape the
 * FACEBOOK-2 `send_message` handler splits to extract the PSID).
 * `message_count` / `updated_time` are fetched for ordering / future use;
 * neither the conversation snippet nor any message text is requested
 * (message text is sanitization-sensitive).
 */
export interface FacebookConversationParticipant {
  id: string;
  name?: string;
  email?: string;
}

export interface FacebookConversation {
  id: string;
  participants?: { data: FacebookConversationParticipant[] };
  updated_time?: string;
  message_count?: number;
}

export interface FacebookConversationsList {
  data: FacebookConversation[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string };
}

export async function conversationsList(input: {
  pageAccessToken: string;
  pageId: string;
  limit?: number;
}): Promise<FacebookConversationsList> {
  return graphRequest<FacebookConversationsList>({
    accessToken: input.pageAccessToken,
    path: `/${input.pageId}/conversations`,
    query: {
      fields: "id,participants,updated_time,message_count",
      limit: input.limit ?? 50,
    },
  });
}
