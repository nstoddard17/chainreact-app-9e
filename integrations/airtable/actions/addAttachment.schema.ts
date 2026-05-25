import { z } from "zod";
import { FileRefSchema } from "@/contracts/file";

/**
 * `add_attachment` action schema — Airtable 2.1 Commit 2.
 *
 * Writes a FileRef-described file into an Airtable attachment field.
 * Third V2 consumer of the P-S3 FileRef contract (after Slack 2.4
 * `upload_file` + Gmail 2.3 `get_attachment`).
 *
 * FileRef arms:
 *   - `v2_storage` — bytes live in our Supabase bucket. The handler
 *     creates a short-lived signed URL (~10 min) and hands the signed
 *     URL to Airtable for ingestion. Signed URL never appears in
 *     output.
 *   - `signed_url` — caller already has a fetchable URL. Handler
 *     forwards it directly to Airtable.
 *   - `provider_url` — REJECTED at handler runtime. Per P-S3 §7:
 *     generic `provider_url` fetching requires provider-safe auth
 *     handling that does not exist in V2 yet. Workflow authors must
 *     stage bytes through a download/staging action first
 *     (`slack:download_file`, `gmail:get_attachment`, etc.) which
 *     yields a `v2_storage` ref.
 *
 * Behavior:
 *   - Per NPD-A5 / NPD-A6 (Airtable 2.1): NO GET-then-merge.
 *     `add_attachment` REPLACES the attachment field's contents with a
 *     single-attachment array `[{url, filename}]`. preserveExisting
 *     and appendToExisting are deferred (no flag exposed at all).
 *
 * Wire shape sent to Airtable:
 *   PATCH `/v0/{baseId}/{tableIdOrName}/{recordId}` with body
 *   `{fields: {<fieldName>: [{url: signedOrSuppliedUrl, filename}]}}`.
 *
 * Output:
 *   `{baseId, tableIdOrName, recordId, fieldName, attachmentCount,
 *     attachments: ParsedAttachment[]}`
 *   - `attachments` is the bounded 6-key projection from
 *     `_shared/airtable/fields.ts` `parseFieldValue("attachment", …)`
 *     applied to the returned record's attachment field. The signed
 *     URL we sent is NOT in this output — Airtable's own URLs (which
 *     Airtable mints when it ingests the file) are.
 *   - NO raw Airtable response spread. NO bytes / base64 / content.
 */
export const AddAttachmentConfigSchema = z
  .object({
    baseId: z.string().min(1),
    tableIdOrName: z.string().min(1),
    recordId: z.string().min(1),
    /**
     * The attachment field's name (or id) on the target record. V2's
     * other Airtable actions accept either name or id; this action
     * follows the same precedent — the value is forwarded verbatim
     * inside the `fields` map.
     */
    fieldName: z.string().min(1),
    /**
     * FileRef describing the bytes to attach. Any of the three FileRef
     * arms (`v2_storage`, `signed_url`, `provider_url`) parse here;
     * `provider_url` is rejected at runtime by the handler with a
     * structured error (it cannot be rejected at schema layer because
     * the discriminator value is valid — the rejection is a handler
     * policy, not a shape mismatch).
     */
    file: FileRefSchema,
    /**
     * Optional override for the filename Airtable persists. When
     * omitted, the handler uses `file.name` (the FileRef's own name).
     * Useful when the upstream FileRef has a generic `attachment.bin`
     * but the workflow wants Airtable to store a friendlier name.
     */
    filename: z.string().min(1).optional(),
  })
  .strict();

export type AddAttachmentConfig = z.infer<typeof AddAttachmentConfigSchema>;
