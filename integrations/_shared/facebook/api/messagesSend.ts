import { graphRequest } from "./_request";

/**
 * Facebook `POST /{pageId}/messages` — Slice 3.FACEBOOK-2. Sends a
 * Messenger message AS the Page to a recipient PSID. `messaging_type:
 * "RESPONSE"` (replying to a user-initiated conversation — the Dev-Mode-
 * testable case; broader messaging types need Messenger Platform review).
 * Uses a Page access token.
 */
export interface FacebookMessageResult {
  recipient_id?: string;
  message_id?: string;
}

export async function messagesSend(input: {
  pageAccessToken: string;
  pageId: string;
  recipientId: string;
  text: string;
}): Promise<FacebookMessageResult> {
  return graphRequest<FacebookMessageResult>({
    accessToken: input.pageAccessToken,
    method: "POST",
    path: `/${input.pageId}/messages`,
    body: {
      messaging_type: "RESPONSE",
      recipient: { id: input.recipientId },
      message: { text: input.text },
    },
  });
}
