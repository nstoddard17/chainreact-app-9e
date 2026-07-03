/**
 * Write smoke harness deps — staged v2_storage file read-back seam.
 *
 * A download/stage action (e.g. slack:download_file) writes bytes into OUR
 * `workflow-files` Supabase bucket and returns a `FileRef(kind=v2_storage)` pointing at
 * a `storagePath`. This seam is the INDEPENDENT proof that the staging side effect
 * actually landed: it reads the object back from the bucket and reports ONLY
 * `{ exists, sizeBytes }` — never the bytes / base64 / a signed URL. So a verify can
 * assert "the FileRef points at a real, non-empty staged object" while honoring the
 * file-output contract (no raw content ever surfaces).
 *
 * Provider-agnostic: matched purely on `action === "staged_file"`, so any file provider's
 * download fixture can reuse it. Read-only. A missing object -> `{ exists: false }`
 * (honest; a verify asserting exists==true then fails rather than false-passing).
 */
import { WORKFLOW_FILES_BUCKET } from "@/core/files/fetchFileBytes";
import { getServiceRoleClient } from "@/repositories/supabase/serviceRoleClient";
import type { StepRunOutcome } from "../writeHarness";
import type { SmokeReaderContext, SmokeReaderInput } from "./context";

export async function stagedFileSmokeReadBack(
  _ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome | null> {
  if (input.action !== "staged_file") return null;
  const storagePath = typeof input.config.storagePath === "string" ? input.config.storagePath : "";
  if (!storagePath) {
    return { ok: false, output: null, reason: "staged_file: missing storagePath" };
  }
  const supabase = getServiceRoleClient(`smoke staged_file read: ${WORKFLOW_FILES_BUCKET}`);
  const { data, error } = await supabase.storage.from(WORKFLOW_FILES_BUCKET).download(storagePath);
  if (error || !data) {
    // Not found / unreadable -> report a not-exists state (never the error detail).
    return { ok: true, output: { exists: false, sizeBytes: 0 }, reason: null };
  }
  const buf = await data.arrayBuffer();
  // Sanitized: only existence + size. The bytes are read to measure length and then
  // dropped — they NEVER enter the seam output.
  return { ok: true, output: { exists: true, sizeBytes: buf.byteLength }, reason: null };
}
