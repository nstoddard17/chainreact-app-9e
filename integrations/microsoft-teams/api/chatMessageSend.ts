import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { ChatMessageResource } from "./types";

/**
 * Wrapper for Microsoft Graph `POST /v1.0/chats/{chatId}/messages`.
 *
 * Used by:  `microsoft_teams_action_send_chat_message` action.
 *
 * Sends a message to an existing chat. The caller supplies the chatId
 * resolved out-of-band (Batch 1 takes it as a string input; future
 * Batch 2 may add a `find_chat_by_participants` action that resolves
 * a chat by participant emails). Chat creation (`POST /chats`) is
 * **deferred** — requires `Chat.Create` which Batch 1 doesn't request.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (chat missing or user not a
 *     participant).
 *   - generic `Error` on other failures.
 */

export interface ChatMessageSendInput {
  accessToken: string;
  chatId: string;
  contentType: "text" | "html";
  content: string;
}

export async function chatMessageSend(
  input: ChatMessageSendInput,
): Promise<ChatMessageResource> {
  const url = `${graphApiBase()}/v1.0/chats/${encodeURIComponent(
    input.chatId,
  )}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      body: { contentType: input.contentType, content: input.content },
    }),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph chats/messages POST returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `chat ${input.chatId}`,
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph chats/messages POST failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as ChatMessageResource;
}
