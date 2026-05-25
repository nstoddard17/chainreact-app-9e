import { graphRequest } from "./_request";

/**
 * Facebook `POST /{pageId}/feed` — Slice 3.FACEBOOK-2. Creates a Page
 * post (text + optional link, optional scheduled publish). Media posts go
 * through `photosUpload` / `videosUpload`. Uses a Page access token.
 */
export interface FacebookFeedPostResult {
  id: string;
}

export async function postsCreate(input: {
  pageAccessToken: string;
  pageId: string;
  message: string;
  link?: string;
  /** Unix seconds. When set, the post is scheduled (published=false). */
  scheduledPublishTime?: number;
}): Promise<FacebookFeedPostResult> {
  const body: Record<string, unknown> = { message: input.message };
  if (input.link !== undefined) body.link = input.link;
  if (input.scheduledPublishTime !== undefined) {
    body.scheduled_publish_time = input.scheduledPublishTime;
    body.published = false;
  }
  return graphRequest<FacebookFeedPostResult>({
    accessToken: input.pageAccessToken,
    method: "POST",
    path: `/${input.pageId}/feed`,
    body,
  });
}
