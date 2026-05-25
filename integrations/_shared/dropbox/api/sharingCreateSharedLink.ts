import { dropboxRpc } from "./_request";
import type { DropboxSharedLink } from "./_types";

/**
 * Dropbox `/2/sharing/create_shared_link_with_settings` — Slice
 * 3.DROPBOX-2. Requires the `sharing.write` scope.
 *
 * When a shared link already exists for `path`, Dropbox returns HTTP 409
 * with `error_summary` starting `shared_link_already_exists` — the shared
 * request layer maps that to `DropboxConflictError`, which the handler
 * catches to fall back to `sharingListSharedLinks` (D-DB8: reuse, don't
 * fail).
 */
export async function sharingCreateSharedLink(input: {
  accessToken: string;
  path: string;
}): Promise<DropboxSharedLink> {
  return dropboxRpc<DropboxSharedLink>({
    accessToken: input.accessToken,
    endpoint: "/2/sharing/create_shared_link_with_settings",
    args: { path: input.path },
  });
}
