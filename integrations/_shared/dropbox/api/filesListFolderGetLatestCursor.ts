import { dropboxRpc } from "./_request";

/**
 * Dropbox `/2/files/list_folder/get_latest_cursor` — Slice 3.DROPBOX-5.
 *
 * Returns a cursor pointing at the CURRENT state of `path` WITHOUT
 * returning the existing entries. The `dropbox:new_file` trigger seeds
 * this at activation so the first webhook reconciliation only sees files
 * that arrive AFTER activation — the V2 "first poll miss" protection
 * applied to the cursor model (files present at activation are never
 * replayed).
 *
 * The cursor bakes in `path` + `recursive`; subsequent
 * `/2/files/list_folder/continue` calls (via `filesListFolder({ cursor })`)
 * just pass the cursor.
 */

export interface DropboxLatestCursorResult {
  cursor: string;
}

export async function filesListFolderGetLatestCursor(input: {
  accessToken: string;
  path?: string;
  recursive?: boolean;
}): Promise<DropboxLatestCursorResult> {
  return dropboxRpc<DropboxLatestCursorResult>({
    accessToken: input.accessToken,
    endpoint: "/2/files/list_folder/get_latest_cursor",
    args: {
      path: input.path ?? "",
      recursive: input.recursive ?? false,
    },
  });
}
