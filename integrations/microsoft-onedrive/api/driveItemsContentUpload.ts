import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { DriveItem } from "./types";

/**
 * Wrapper for Microsoft Graph simple upload:
 *   PUT /v1.0/me/drive/items/{parentId}:/{filename}:/content
 *   PUT /v1.0/me/drive/root:/{filename}:/content
 *
 * Used by:  `upload_file` action.
 *
 * Slice 8 ships simple upload only — files ≤ 4 MB. Larger files require
 * an upload session (`POST /me/drive/items/{parent}:/{filename}:/createUploadSession`
 * + chunked PUTs); deferred per scope.
 *
 * Body is the raw file bytes; Content-Type is the file's MIME type
 * (Graph reads the type from the header, not the metadata). Caller
 * decodes base64 / utf8 strings into a Buffer before this layer
 * (matches V2 Google Drive's `filesCreateMultipart` shape).
 *
 * The `:` segments in the URL are NOT URL-encoded — Graph's "path
 * addressing" syntax treats them as path delimiters. The filename
 * itself IS URL-encoded so spaces / unicode / special chars work.
 *
 * Throws:
 *   - generic `Error("exceeded 4 MB cap")` BEFORE making the network
 *     call when content > MAX_UPLOAD_BYTES. refreshAndRetry won't
 *     attempt a second call (the error isn't 401-shaped).
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (parent folder missing).
 *   - generic `Error` on other failures with Graph error message surfaced.
 */

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export interface DriveItemsContentUploadInput {
  accessToken: string;
  /** Omit / "root" → drive root. Otherwise parent folder DriveItem id. */
  parentItemId?: string;
  /** Filename Graph uses verbatim (after URL-encoding). */
  filename: string;
  /** MIME type sent as the request's Content-Type header. */
  mimeType: string;
  /** Raw file bytes. Caller decodes base64 / utf8 before this layer. */
  content: Buffer;
}

export async function driveItemsContentUpload(
  input: DriveItemsContentUploadInput,
): Promise<DriveItem> {
  if (input.content.length > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Microsoft Graph upload exceeded ${MAX_UPLOAD_BYTES} bytes (Slice 8 simple-upload cap; resumable upload deferred).`,
    );
  }

  const encodedName = encodeURIComponent(input.filename);
  const isRoot = !input.parentItemId || input.parentItemId === "root";
  const path = isRoot
    ? `/v1.0/me/drive/root:/${encodedName}:/content`
    : `/v1.0/me/drive/items/${encodeURIComponent(input.parentItemId!)}:/${encodedName}:/content`;
  const url = `${graphApiBase()}${path}`;

  // Buffer.concat returns Buffer<ArrayBuffer> (concrete) which fetch's
  // BodyInit overload accepts; passing input.content directly hits the
  // post-TS5.7 narrowing of BodyInit (rejects Buffer<ArrayBufferLike>).
  // Single-element concat is a near-zero-cost reallocation that fixes
  // the type without changing wire behavior. Same workaround V2's
  // Google Drive `filesCreateMultipart` uses (multi-element concat there).
  const body = Buffer.concat([input.content]);

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": input.mimeType,
      "Content-Length": String(body.length),
    },
    body,
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/drive/.../content PUT returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `driveItem parent ${input.parentItemId ?? "root"}`,
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/drive/.../content PUT failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as DriveItem;
}

export { MAX_UPLOAD_BYTES };
