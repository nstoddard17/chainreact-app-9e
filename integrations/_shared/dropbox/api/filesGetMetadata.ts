import { dropboxRpc } from "./_request";
import type { DropboxEntry } from "./_types";

/**
 * Dropbox `/2/files/get_metadata` — Slice 3.DROPBOX-2. Read-only metadata
 * for a file or folder at `path`. A missing path surfaces as
 * `NotFoundError` from the shared request layer (HTTP 409 not-found).
 */
export async function filesGetMetadata(input: {
  accessToken: string;
  path: string;
}): Promise<DropboxEntry> {
  return dropboxRpc<DropboxEntry>({
    accessToken: input.accessToken,
    endpoint: "/2/files/get_metadata",
    args: { path: input.path },
  });
}
