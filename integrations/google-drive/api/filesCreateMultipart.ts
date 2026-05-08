import { randomUUID } from "node:crypto";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { driveUploadBase } from "./_base";
import type { DriveFileResource } from "./filesCreate";

/**
 * Wrapper for Google Drive `files.create` with multipart media upload.
 *
 * Endpoint: POST {uploadBase}/upload/drive/v3/files?uploadType=multipart
 * Body:     multipart/related — Part 1 = JSON metadata, Part 2 = file content
 * Used by:  uploadFile action handler.
 *
 * V2 simplification (vs. V1): direct content/body upload only. No URL fetch
 * source mode, no piped buffer source mode, no resumable upload. The
 * action's schema accepts `content` (string) + `contentEncoding`
 * ("utf8" | "base64") — base64 is decoded to bytes here so binary uploads
 * (PNG / PDF / etc.) work without exposing Buffer in the schema layer.
 *
 * 25 MB cap: Drive accepts up to 5 TB but V2 buffers in memory; capping at
 * 25 MB matches V1 and keeps us well under serverless memory budgets.
 * Streaming / resumable uploads are a deliberate Batch 1.5+ follow-up.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401 (refreshAndRetry contract).
 *   - generic `Error` on other failures with surfaced Google error message.
 */

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export interface FilesCreateMultipartInput {
  accessToken: string;
  metadata: {
    name: string;
    mimeType: string;
    parents?: ReadonlyArray<string>;
    [k: string]: unknown;
  };
  /** Raw file bytes. Caller decodes base64 / utf8 before this layer. */
  content: Buffer;
  /** Comma-separated `fields` mask; defaults to id,name,mimeType,parents. */
  fields?: string;
  supportsAllDrives?: boolean;
}

interface DriveErrorPayload {
  error?: { code?: number; message?: string; status?: string };
}

function surfaceErrorDetail(text: string, status: number): string {
  let detail = `HTTP ${status}`;
  try {
    const parsed = JSON.parse(text) as DriveErrorPayload;
    if (parsed?.error?.message) detail = parsed.error.message;
    else if (parsed?.error?.status) detail = parsed.error.status;
  } catch {
    // not JSON
  }
  return detail;
}

export async function filesCreateMultipart(
  input: FilesCreateMultipartInput,
): Promise<DriveFileResource> {
  if (input.content.length > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Google Drive upload exceeded ${MAX_UPLOAD_BYTES} bytes (Slice 4 cap; resumable upload deferred).`,
    );
  }

  const boundary = `chainreact-${randomUUID()}`;
  const metadataJson = JSON.stringify(input.metadata);
  // Drive multipart/related body shape:
  //   --boundary
  //   Content-Type: application/json; charset=UTF-8
  //   <blank>
  //   {metadata json}
  //   --boundary
  //   Content-Type: <file mime type>
  //
  //   <file bytes>
  //   --boundary--
  //
  // Body is binary — we build a Buffer from the parts so utf8 metadata
  // and arbitrary file bytes coexist correctly.
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${metadataJson}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${input.metadata.mimeType}\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--`, "utf8");
  const body = Buffer.concat([head, input.content, tail]);

  const url = new URL(`${driveUploadBase()}/upload/drive/v3/files`);
  url.searchParams.set("uploadType", "multipart");
  url.searchParams.set(
    "fields",
    input.fields ?? "id,name,mimeType,parents,webViewLink,size,createdTime",
  );
  url.searchParams.set(
    "supportsAllDrives",
    String(input.supportsAllDrives ?? true),
  );

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      // Explicit content length helps proxies forward without rewriting.
      "Content-Length": String(body.length),
    },
    body,
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Drive files.create (multipart) returned HTTP 401",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Drive files.create (multipart) failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as DriveFileResource;
}

export { MAX_UPLOAD_BYTES };
