import { dropboxContentUpload } from "./_request";
import type { DropboxEntry } from "./_types";

/**
 * Dropbox `/2/files/upload` (content host) — Slice 3.DROPBOX-2.
 *
 * Single-shot upload (≤150 MB; resumable `upload_session/*` is deferred
 * to DROPBOX-N). `mode` is Dropbox's `WriteMode` shorthand — `"add"`
 * (never overwrite; autorename suffixes on conflict) or `"overwrite"`.
 * Args ride in the `Dropbox-API-Arg` header; bytes are the octet-stream
 * body. Returns the uploaded file's metadata.
 */
export async function filesUpload(input: {
  accessToken: string;
  path: string;
  bytes: Uint8Array;
  mode?: "add" | "overwrite";
  autorename?: boolean;
}): Promise<DropboxEntry> {
  return dropboxContentUpload<DropboxEntry>({
    accessToken: input.accessToken,
    endpoint: "/2/files/upload",
    args: {
      path: input.path,
      mode: input.mode ?? "add",
      autorename: input.autorename ?? false,
      mute: false,
    },
    bytes: input.bytes,
  });
}
