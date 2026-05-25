import { graphRequest } from "./_request";

/**
 * Facebook `GET /me/accounts` — Slice 3.FACEBOOK-2. The Pages the
 * connected user manages, each with its own Page access token. Backs both
 * the runtime page-token derivation (`getPageAccessToken`) and the future
 * `facebook:pages` resolver (FACEBOOK-3).
 *
 * Requires the `pages_show_list` scope.
 */
export interface FacebookPage {
  id: string;
  name?: string;
  access_token?: string;
}

export interface FacebookPagesList {
  data: FacebookPage[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string };
}

export async function pagesList(input: {
  accessToken: string;
}): Promise<FacebookPagesList> {
  return graphRequest<FacebookPagesList>({
    accessToken: input.accessToken,
    path: "/me/accounts",
    query: { fields: "id,name,access_token", limit: 200 },
  });
}
