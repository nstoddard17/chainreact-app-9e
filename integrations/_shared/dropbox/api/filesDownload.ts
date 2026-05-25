import { dropboxContentDownload } from "./_request";
import type { DropboxEntry } from "./_types";

/**
 * Dropbox `/2/files/download` (content host) — Slice 3.DROPBOX-2.
 *
 * Returns the file bytes plus the metadata Dropbox echoes in the
 * `Dropbox-API-Result` response header. The handler stages the bytes via
 * `stageFileToStorage` — bytes never enter the action output.
 */
export async function filesDownload(input: {
  accessToken: string;
  path: string;
}): Promise<{ bytes: Uint8Array; metadata: DropboxEntry }> {
  const { bytes, result } = await dropboxContentDownload<DropboxEntry>({
    accessToken: input.accessToken,
    endpoint: "/2/files/download",
    args: { path: input.path },
  });
  return { bytes, metadata: result };
}
