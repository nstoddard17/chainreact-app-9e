import { graphRequest } from "./_request";
import type { FacebookSuccessResult } from "./postsUpdate";

/**
 * Facebook `DELETE /{postId}` — Slice 3.FACEBOOK-2. Permanently deletes a
 * Page post (Graph has no restore). Uses a Page access token. Graph
 * returns `{ success: true }`.
 */
export async function postsDelete(input: {
  pageAccessToken: string;
  postId: string;
}): Promise<FacebookSuccessResult> {
  return graphRequest<FacebookSuccessResult>({
    accessToken: input.pageAccessToken,
    method: "DELETE",
    path: `/${input.postId}`,
  });
}
