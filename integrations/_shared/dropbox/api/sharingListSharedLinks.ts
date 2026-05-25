import { dropboxRpc } from "./_request";
import type { DropboxSharedLink } from "./_types";

/**
 * Dropbox `/2/sharing/list_shared_links` — Slice 3.DROPBOX-2. Requires
 * the `sharing.read` scope. Used by `create_shared_link` to recover the
 * existing link on a `shared_link_already_exists` conflict (D-DB8).
 * `direct_only: true` restricts to links pointing at this exact path.
 */
export async function sharingListSharedLinks(input: {
  accessToken: string;
  path: string;
}): Promise<DropboxSharedLink[]> {
  const res = await dropboxRpc<{ links?: DropboxSharedLink[] }>({
    accessToken: input.accessToken,
    endpoint: "/2/sharing/list_shared_links",
    args: { path: input.path, direct_only: true },
  });
  return res.links ?? [];
}
