import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import {
  isNotFoundError,
  isRateLimitError,
  MondayApiError,
  NotFoundError,
  RateLimitError,
  surfaceMondayGraphqlErrors,
  type MondayGraphqlError,
} from "../errors";
import { mondayApiBase } from "./_request";

/**
 * Wrapper for Monday's file-upload endpoint `POST /v2/file` —
 * Slice 3.MONDAY-4 (FileRef consumer).
 *
 * Monday's `add_file_to_column` mutation requires the file BYTES via a
 * multipart/form-data request to the dedicated `/v2/file` endpoint —
 * it does NOT accept a URL. This is distinct from the JSON GraphQL
 * `mondayRequest` layer; we build the multipart body here with
 * `Buffer.concat` (binary-safe, no `form-data` npm dependency — mirrors
 * `google-drive/api/filesCreateMultipart.ts`).
 *
 * Monday's documented upload format uses a simplified multipart shape:
 *   - a `query` part carrying the mutation (with item_id + column_id
 *     INLINED, per Monday's docs — Monday's file endpoint does NOT
 *     follow the full GraphQL multipart spec with an `operations`/`map`
 *     envelope).
 *   - a `variables[file]` part carrying the binary.
 *
 * Because item_id / column_id are inlined into the query string, this
 * wrapper VALIDATES their format to prevent GraphQL injection:
 *   - `itemId` must be all digits (Monday item ids are numeric).
 *   - `columnId` must match `[A-Za-z0-9_]+` (Monday column id charset).
 * Anything else throws before any network call.
 *
 * Error model mirrors `mondayRequest`: 401 → Unauthorized401Error
 * (refreshAndRetry contract), 429 → RateLimitError, other non-2xx →
 * MondayApiError, 200-with-errors[] → mapped. Never leaks the token,
 * the raw response body, or the file bytes in error messages.
 *
 * Returned shape: `{ id, name, url }` (the created asset).
 */

const ITEM_ID_RE = /^\d+$/;
const COLUMN_ID_RE = /^[A-Za-z0-9_]+$/;

export interface AddFileToColumnInput {
  accessToken: string;
  itemId: string;
  columnId: string;
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  apiVersion?: string;
}

export interface AddFileToColumnOutput {
  id: string;
  name: string | null;
  url: string | null;
}

interface MondayFileEnvelope {
  data?: { add_file_to_column?: AddFileToColumnOutput | null };
  errors?: MondayGraphqlError[];
}

/** Strip characters that would break the Content-Disposition header. */
function sanitizeHeaderFilename(name: string): string {
  return name.replace(/["\r\n]/g, "_");
}

export async function addFileToColumn(
  input: AddFileToColumnInput,
): Promise<AddFileToColumnOutput> {
  if (!ITEM_ID_RE.test(input.itemId)) {
    throw new MondayApiError(
      "add_file_to_column: itemId must be a numeric Monday item id.",
    );
  }
  if (!COLUMN_ID_RE.test(input.columnId)) {
    throw new MondayApiError(
      "add_file_to_column: columnId must match Monday's column id charset.",
    );
  }

  const mutation =
    `mutation add_file($file: File!) { ` +
    `add_file_to_column(item_id: ${input.itemId}, column_id: "${input.columnId}", file: $file) ` +
    `{ id name url } }`;

  const boundary = `----chainreactMondayBoundary${Date.now().toString(16)}`;
  const safeName = sanitizeHeaderFilename(input.fileName);

  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="query"\r\n\r\n` +
      `${mutation}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="variables[file]"; filename="${safeName}"\r\n` +
      `Content-Type: ${input.mimeType}\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([head, Buffer.from(input.bytes), tail]);

  const res = await fetch(`${mondayApiBase()}/v2/file`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "API-Version": input.apiVersion ?? "2024-01",
    },
    body,
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Monday /v2/file upload returned HTTP 401",
    );
  }
  if (res.status === 429) {
    throw new RateLimitError("HTTP 429", null);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new MondayApiError(
      surfaceMondayGraphqlErrors(text, res.status),
      res.status,
    );
  }

  const envelope = (await res.json()) as MondayFileEnvelope;
  if (envelope.errors && envelope.errors.length > 0) {
    if (isRateLimitError(envelope.errors)) {
      throw new RateLimitError(
        envelope.errors.map((e) => e.message ?? "rate limited").join("; "),
        null,
      );
    }
    if (isNotFoundError(envelope.errors)) {
      throw new NotFoundError(
        "monday item/column",
        envelope.errors.map((e) => e.message ?? "not found").join("; "),
      );
    }
    throw new MondayApiError(
      envelope.errors
        .map((e) => {
          const code = e.extensions?.code;
          const message = e.message ?? "unknown";
          return code ? `${code}: ${message}` : message;
        })
        .join("; "),
      res.status,
    );
  }

  const asset = envelope.data?.add_file_to_column ?? null;
  if (!asset) {
    throw new MondayApiError(
      "Monday add_file_to_column returned no asset.",
      res.status,
    );
  }
  return asset;
}
