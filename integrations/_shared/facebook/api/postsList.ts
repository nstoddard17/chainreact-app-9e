import { graphRequest } from "./_request";

/**
 * Facebook `GET /{pageId}/posts` — Slice 3.FACEBOOK-3. Lists the recent
 * posts published on a Page, newest-first (Graph's default order). Backs
 * the `facebook:posts` options resolver (the `postId` picker on
 * `comment_on_post` / `update_post` / `delete_post`).
 *
 * Page-scoped — call with a Page access token (derive it at runtime via
 * `getPageAccessToken`; never the bare user token). Requires
 * `pages_read_engagement`.
 *
 * Fields are deliberately minimal: `id`, `message` (the picker label
 * snippet), `created_time` (the picker description). The deprecated `type`
 * field and `permalink_url` are intentionally NOT requested — the picker
 * needs neither, and permalinks are sensitive (§6 of the FACEBOOK-1 plan).
 */
export interface FacebookPostSummary {
  id: string;
  message?: string;
  created_time?: string;
}

export interface FacebookPostsList {
  data: FacebookPostSummary[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string };
}

export async function postsList(input: {
  pageAccessToken: string;
  pageId: string;
  limit?: number;
}): Promise<FacebookPostsList> {
  return graphRequest<FacebookPostsList>({
    accessToken: input.pageAccessToken,
    path: `/${input.pageId}/posts`,
    query: { fields: "id,message,created_time", limit: input.limit ?? 50 },
  });
}
