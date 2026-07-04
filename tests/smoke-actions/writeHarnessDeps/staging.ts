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

/**
 * 5x5 red PNG. Monday's server-side image processor REJECTS the 1x1 PNG with
 * HTTP 422 "RecordInvalidException: ... Could not identify image size" (probed
 * live 2026-07-04: text/plain OK, 5x5 PNG OK, 1x1 PNG 422), so providers whose
 * upload path runs provider-side image processing stage this still-tiny 5x5
 * variant instead.
 */
const SMOKE_SMALL_PNG_5X5 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Minimal MP4 container (ISO base media `ftyp isom` + `free` + `mdat`) for a
 * BEST-EFFORT video upload attempt (facebook:upload_video). It is a structurally
 * valid container but NOT a real encoded H.264 stream, so a provider that decodes
 * the video server-side may reject it — that rejection is the documented blocker,
 * never faked as a pass. Kept tiny so it never trips a size guidance.
 */
const SMOKE_TINY_MP4 = Buffer.from(
  "AAAAHGZ0eXBpc29tAAACAGlzb21pc28yYXZjMQAAAAhmcmVlAAAC721kYXQAAAAyZ2xkbAA" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB",
  "base64",
);

export async function stageSmokeFile(
  supabase: SupabaseClient,
  storagePath: string,
  variant: "png1x1" | "png5x5" | "mp4" = "png1x1",
): Promise<{ storagePath: string; remove: () => Promise<void> } | null> {
  const bytes =
    variant === "mp4"
      ? SMOKE_TINY_MP4
      : variant === "png5x5"
        ? SMOKE_SMALL_PNG_5X5
        : SMOKE_TINY_PNG;
  const contentType = variant === "mp4" ? "video/mp4" : "image/png";
  const { error } = await supabase.storage
    .from(WORKFLOW_FILES_BUCKET)
    .upload(storagePath, bytes, { contentType, upsert: true });
  if (error) return null;
  return {
    storagePath,
    remove: async () => {
      await supabase.storage.from(WORKFLOW_FILES_BUCKET).remove([storagePath]).catch(() => {});
    },
  };
}
