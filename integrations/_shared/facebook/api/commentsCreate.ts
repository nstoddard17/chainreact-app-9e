import { graphRequest } from "./_request";

/**
 * Facebook `POST /{postId}/comments` — Slice 3.FACEBOOK-2. Adds a comment
 * (as the Page) to a post, with an optional attachment URL. Uses a Page
 * access token.
 */
export interface FacebookCommentResult {
  id: string;
}

export async function commentsCreate(input: {
  pageAccessToken: string;
  postId: string;
  message: string;
  attachmentUrl?: string;
}): Promise<FacebookCommentResult> {
  const body: Record<string, unknown> = { message: input.message };
  if (input.attachmentUrl !== undefined) {
    body.attachment_url = input.attachmentUrl;
  }
  return graphRequest<FacebookCommentResult>({
    accessToken: input.pageAccessToken,
    method: "POST",
    path: `/${input.postId}/comments`,
    body,
  });
}
