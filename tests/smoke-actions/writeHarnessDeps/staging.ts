/**
 * Write smoke harness deps — shared file staging helper.
 *
 * Extracted from writeHarnessDeps.ts (structure-only split; behavior unchanged).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { WORKFLOW_FILES_BUCKET } from "@/core/files/fetchFileBytes";

/**
 * Stage a tiny throwaway file in OUR `workflow-files` Supabase bucket so a
 * FileRef-consuming action (`airtable:add_attachment`, `dropbox:upload_file`, …)
 * can reference it via a `v2_storage` FileRef. This is the SELF-CONTAINED
 * alternative to a public/external URL — the bytes are our own controlled 1x1 PNG,
 * never an invented third-party URL. Returns the storagePath (for the FileRef) + a
 * `remove` cleanup. Uses the caller's service-role client (same one the dev test
 * builds). Provider-agnostic: the consumer decides the destination + filename.
 */
const SMOKE_TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);

export async function stageSmokeFile(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<{ storagePath: string; remove: () => Promise<void> } | null> {
  const { error } = await supabase.storage
    .from(WORKFLOW_FILES_BUCKET)
    .upload(storagePath, SMOKE_TINY_PNG, { contentType: "image/png", upsert: true });
  if (error) return null;
  return {
    storagePath,
    remove: async () => {
      await supabase.storage.from(WORKFLOW_FILES_BUCKET).remove([storagePath]).catch(() => {});
    },
  };
}
