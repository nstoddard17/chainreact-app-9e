import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { powerbiApiRoot } from "../_base";
import { NotFoundError, surfacePowerBiError } from "../errors";

/**
 * Wrapper for Power BI `POST /v1.0/myorg/groups/{groupId}/imports`
 * (Post Import In Group) — multipart/form-data upload.
 *
 * Hand-rolled `fetch` (NOT `powerbiFetch`) because the body is
 * multipart file bytes, not JSON. Status mapping is identical to
 * `powerbiFetch`: 401 → `Unauthorized401Error`, 404 → `NotFoundError`,
 * other non-2xx → sanitized `Error` via `surfacePowerBiError`. The
 * Content-Type header is set by FormData (boundary included) — never
 * hand-authored here.
 *
 * Direct multipart upload supports files up to 1 GB (.pbix / .xlsx /
 * .rdl / dataflow model.json). The 1–10 GB temporary-upload-location
 * path (`ImportInfo{fileUrl}`, Premium-only) is deliberately NOT
 * supported — separate endpoint, separate wrapper if ever needed.
 *
 * `datasetDisplayName` must include the file extension (e.g.
 * `Report.pbix`) per the provider docs; it doubles as the multipart
 * part filename. `skipReport` accepts only `true` provider-side, so
 * the query param is emitted only when set.
 *
 * Response is 200/202 with `{ id }` (the import id). `importState` is
 * surfaced when the provider includes it (it usually does not on the
 * POST response — poll Get Import for state).
 */

export type ImportNameConflict =
  | "Ignore"
  | "Abort"
  | "Overwrite"
  | "CreateOrOverwrite"
  | "GenerateUniqueName";

export interface ImportPostInput {
  accessToken: string;
  groupId: string;
  /** Target dataset name INCLUDING extension; also the part filename. */
  datasetDisplayName: string;
  nameConflict: ImportNameConflict;
  /** Provider accepts only `true`; omit the param otherwise. */
  skipReport?: boolean;
  /** Raw file bytes (resolved from a FileRef by the action handler). */
  fileBytes: Uint8Array;
}

export interface ImportPostResult {
  importId: string;
  importState: string | null;
}

interface ImportPostBody {
  id?: string;
  importState?: string;
}

export async function importPost(
  input: ImportPostInput,
): Promise<ImportPostResult> {
  const query = new URLSearchParams({
    datasetDisplayName: input.datasetDisplayName,
    nameConflict: input.nameConflict,
  });
  if (input.skipReport === true) query.set("skipReport", "true");

  const url = `${powerbiApiRoot()}/groups/${encodeURIComponent(
    input.groupId,
  )}/imports?${query.toString()}`;

  // `Uint8Array` is a valid `Blob` part at runtime, but the DOM `BlobPart`
  // union doesn't include it on every TypeScript lib version — and naming
  // the DOM global in type position trips eslint's `no-undef`. Derive the
  // type from `Blob` itself and cast at the boundary (same pattern as
  // `slack/api/_uploadBytesToSlack.ts`).
  type BlobPartLike = NonNullable<ConstructorParameters<typeof Blob>[0]>[number];

  const form = new FormData();
  // Part name "file", filename = datasetDisplayName (extension included).
  form.append(
    "file",
    new Blob([input.fileBytes as unknown as BlobPartLike]),
    input.datasetDisplayName,
  );

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.accessToken}` },
    body: form,
  });

  if (res.status === 401) {
    throw new Unauthorized401Error("Power BI import POST returned HTTP 401");
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `workspace ${input.groupId}`,
      surfacePowerBiError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Power BI import POST failed: ${surfacePowerBiError(text, res.status)}`,
    );
  }

  const body = (await res.json()) as ImportPostBody;
  if (typeof body.id !== "string" || body.id.length === 0) {
    throw new Error("Power BI import POST response is missing the import id.");
  }
  return {
    importId: body.id,
    importState:
      typeof body.importState === "string" ? body.importState : null,
  };
}
