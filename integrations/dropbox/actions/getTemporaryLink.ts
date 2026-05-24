import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { fileRefFromSignedUrl } from "@/core/files/createFileRef";
import { filesGetTemporaryLink } from "@/integrations/_shared/dropbox/api/filesGetTemporaryLink";
import { normalizeDropboxEntry } from "@/integrations/_shared/dropbox/api/_types";
import { GetTemporaryLinkConfigSchema } from "./getTemporaryLink.schema";

/**
 * Dropbox `get_temporary_link` — Slice 3.DROPBOX-2 (FileRef producer,
 * signed_url arm). Dropbox's temporary link is an auth-free direct
 * download URL valid for ~4 hours; this wraps it in a
 * `FileRef(kind=signed_url)` so any FileRef consumer can fetch it without
 * a stage round-trip (P-S3 §4 signed_url arm).
 *
 * The link is sensitive — it lives inside `file.url` (part of the FileRef
 * contract, persisted to the run output) but is NEVER logged or echoed in
 * errors.
 *
 * Output: `{ file: FileRef(signed_url), name, path, sizeBytes }`.
 */

/** Dropbox documents the temporary link as valid ~4 hours. */
const TEMP_LINK_TTL_MS = 4 * 60 * 60 * 1000;

export const getTemporaryLink: ActionHandler = async (input) => {
  const config = GetTemporaryLinkConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "dropbox"
      ? input.triggerEvent.accountId
      : null;

  const { link, metadata } = await refreshAndRetry({
    userId: input.userId,
    provider: "dropbox",
    accountId,
    apiCall: (accessToken) =>
      filesGetTemporaryLink({ accessToken, path: config.path }),
  });

  const n = normalizeDropboxEntry(metadata);
  const fileName =
    n.name ?? config.path.split("/").filter(Boolean).pop() ?? "dropbox-file";

  const ref = fileRefFromSignedUrl({
    name: fileName,
    mimeType: "application/octet-stream",
    ...(n.sizeBytes !== null && { sizeBytes: n.sizeBytes }),
    url: link,
    expiresAt: new Date(Date.now() + TEMP_LINK_TTL_MS).toISOString(),
    provider: "dropbox",
  });

  return {
    output: {
      file: ref,
      name: fileName,
      path: n.path,
      sizeBytes: n.sizeBytes,
    },
  };
};
