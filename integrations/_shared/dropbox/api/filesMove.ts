import { dropboxRpc } from "./_request";
import type { DropboxEntry } from "./_types";

/**
 * Dropbox `/2/files/move_v2` — Slice 3.DROPBOX-2. Moves/renames a file or
 * folder from `fromPath` to `toPath`. Returns the moved entry's metadata.
 */
export async function filesMove(input: {
  accessToken: string;
  fromPath: string;
  toPath: string;
  autorename?: boolean;
}): Promise<DropboxEntry> {
  const res = await dropboxRpc<{ metadata: DropboxEntry }>({
    accessToken: input.accessToken,
    endpoint: "/2/files/move_v2",
    args: {
      from_path: input.fromPath,
      to_path: input.toPath,
      autorename: input.autorename ?? false,
    },
  });
  return res.metadata;
}
