import { graphRequest } from "./_request";

/**
 * Facebook `GET /{pageId}/albums` — Slice 3.FACEBOOK-3. Lists the photo
 * albums on a Page. Backs the `facebook:albums` options resolver
 * (forward-looking — the `upload_photo` album-select field is a deferred
 * FACEBOOK-2 follow-up; the resolver ships now as part of the accepted
 * FACEBOOK-3 surface).
 *
 * Page-scoped — call with a Page access token (derive it at runtime via
 * `getPageAccessToken`). Requires `pages_read_engagement`.
 *
 * Fields: `id` (option value), `name` (label), `count` (photo count, a
 * non-sensitive picker description). `created_time` is fetched for parity
 * but not surfaced.
 */
export interface FacebookAlbum {
  id: string;
  name?: string;
  count?: number;
  created_time?: string;
}

export interface FacebookAlbumsList {
  data: FacebookAlbum[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string };
}

export async function albumsList(input: {
  pageAccessToken: string;
  pageId: string;
  limit?: number;
}): Promise<FacebookAlbumsList> {
  return graphRequest<FacebookAlbumsList>({
    accessToken: input.pageAccessToken,
    path: `/${input.pageId}/albums`,
    query: { fields: "id,name,count,created_time", limit: input.limit ?? 100 },
  });
}
