import { dropboxRpc } from "./_request";
import type { DropboxEntry } from "./_types";

/**
 * Dropbox `/2/files/list_folder` (+ `/continue`) — Slice 3.DROPBOX-2.
 *
 * When `cursor` is supplied, paginates via `/2/files/list_folder/continue`
 * (the `path`/`recursive`/`limit` args are ignored by Dropbox in that
 * mode). Otherwise lists `path` (root is the empty string `""`).
 */

export interface DropboxListFolderResult {
  entries: DropboxEntry[];
  cursor: string;
  has_more: boolean;
}

export async function filesListFolder(input: {
  accessToken: string;
  path?: string;
  recursive?: boolean;
  limit?: number;
  cursor?: string;
}): Promise<DropboxListFolderResult> {
  if (input.cursor !== undefined && input.cursor.length > 0) {
    return dropboxRpc<DropboxListFolderResult>({
      accessToken: input.accessToken,
      endpoint: "/2/files/list_folder/continue",
      args: { cursor: input.cursor },
    });
  }
  const args: Record<string, unknown> = {
    path: input.path ?? "",
    recursive: input.recursive ?? false,
  };
  if (typeof input.limit === "number") args.limit = input.limit;
  return dropboxRpc<DropboxListFolderResult>({
    accessToken: input.accessToken,
    endpoint: "/2/files/list_folder",
    args,
  });
}
