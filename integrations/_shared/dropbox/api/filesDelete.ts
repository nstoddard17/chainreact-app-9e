import { dropboxRpc } from "./_request";
import type { DropboxEntry } from "./_types";

/**
 * Dropbox `/2/files/delete_v2` — Slice 3.DROPBOX-2. Deletes a file or
 * folder at `path` (Dropbox moves it to trash; recoverable ~30 days).
 * Returns the deleted entry's metadata, but the handler emits a
 * structural-only output (no name / content echoed).
 */
export async function filesDelete(input: {
  accessToken: string;
  path: string;
}): Promise<DropboxEntry> {
  const res = await dropboxRpc<{ metadata: DropboxEntry }>({
    accessToken: input.accessToken,
    endpoint: "/2/files/delete_v2",
    args: { path: input.path },
  });
  return res.metadata;
}
