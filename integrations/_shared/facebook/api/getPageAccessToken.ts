import { NotFoundError } from "../errors";
import { pagesList } from "./pagesList";

/**
 * Derive a Page access token from the connected USER token — Slice
 * 3.FACEBOOK-2 (D-FB5).
 *
 * Facebook actions act AS a Page, which needs a Page access token. Per the
 * accepted decision the user long-lived token is the ONLY token stored on
 * the integration row; Page tokens are derived at runtime here (never
 * persisted) so they're always fresh and the one-token-per-row contract
 * holds. Mirrors V1's `getPageAccessToken(pageId, userToken)`.
 *
 * Lists `/me/accounts` and returns the matching Page's `access_token`. A
 * missing page (not managed by the user, or `pages_show_list` not granted)
 * → `NotFoundError` (sanitized — no token leaked). A 401 on the underlying
 * `/me/accounts` call propagates as `Unauthorized401Error` from the
 * request layer so `refreshAndRetry` handles it.
 */
export async function getPageAccessToken(input: {
  accessToken: string;
  pageId: string;
}): Promise<string> {
  const list = await pagesList({ accessToken: input.accessToken });
  const page = list.data.find((p) => p.id === input.pageId);
  if (!page || !page.access_token) {
    throw new NotFoundError(`page/${input.pageId}/no_access_token`);
  }
  return page.access_token;
}
