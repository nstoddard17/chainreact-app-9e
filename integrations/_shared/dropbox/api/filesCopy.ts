import { dropboxRpc } from "./_request";
import type { DropboxEntry } from "./_types";

/**
 * Dropbox `/2/files/copy_v2` — Slice 3.DROPBOX-2. Copies a file or folder
 * from `fromPath` to `toPath`. Returns the new copy's metadata.
 */
export async function filesCopy(input: {
  accessToken: string;
  fromPath: string;
  toPath: string;
  autorename?: boolean;
}): Promise<DropboxEntry> {
  const res = await dropboxRpc<{ metadata: DropboxEntry }>({
    accessToken: input.accessToken,
    endpoint: "/2/files/copy_v2",
    args: {
      from_path: input.fromPath,
      to_path: input.toPath,
      autorename: input.autorename ?? false,
    },
  });
  return res.metadata;
}
