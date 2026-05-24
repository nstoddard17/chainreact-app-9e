import { dropboxRpc } from "./_request";
import type { DropboxEntry } from "./_types";

/**
 * Dropbox `/2/files/create_folder_v2` — Slice 3.DROPBOX-2. Returns the
 * created folder's metadata under `metadata`.
 */
export async function filesCreateFolder(input: {
  accessToken: string;
  path: string;
  autorename?: boolean;
}): Promise<DropboxEntry> {
  const res = await dropboxRpc<{ metadata: DropboxEntry }>({
    accessToken: input.accessToken,
    endpoint: "/2/files/create_folder_v2",
    args: { path: input.path, autorename: input.autorename ?? false },
  });
  return res.metadata;
}
