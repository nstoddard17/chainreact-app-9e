import { graphRequest } from "./_request";

/**
 * Facebook `POST /{postId}` — Slice 3.FACEBOOK-2. Edits a published Page
 * post's message and/or publish state. Uses a Page access token. Graph
 * returns `{ success: true }`.
 */
export interface FacebookSuccessResult {
  success?: boolean;
}

export async function postsUpdate(input: {
  pageAccessToken: string;
  postId: string;
  message?: string;
  isPublished?: boolean;
}): Promise<FacebookSuccessResult> {
  const body: Record<string, unknown> = {};
  if (input.message !== undefined) body.message = input.message;
  if (input.isPublished !== undefined) body.is_published = input.isPublished;
  return graphRequest<FacebookSuccessResult>({
    accessToken: input.pageAccessToken,
    method: "POST",
    path: `/${input.postId}`,
    body,
  });
}
