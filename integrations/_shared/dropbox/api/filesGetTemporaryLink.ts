import { dropboxRpc } from "./_request";
import type { DropboxEntry } from "./_types";

/**
 * Dropbox `/2/files/get_temporary_link` — Slice 3.DROPBOX-2. Returns a
 * direct, auth-free download URL that Dropbox documents as valid for ~4
 * hours, plus the file's metadata. The handler wraps the link in a
 * `FileRef(kind=signed_url)`. The link is sensitive — never logged.
 */
export async function filesGetTemporaryLink(input: {
  accessToken: string;
  path: string;
}): Promise<{ link: string; metadata: DropboxEntry }> {
  const res = await dropboxRpc<{ link?: string; metadata?: DropboxEntry }>({
    accessToken: input.accessToken,
    endpoint: "/2/files/get_temporary_link",
    args: { path: input.path },
  });
  if (typeof res.link !== "string" || res.link.length === 0) {
    throw new Error("Dropbox get_temporary_link returned no link.");
  }
  return { link: res.link, metadata: res.metadata ?? {} };
}
