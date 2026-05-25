import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { createWorkflowFileSignedUrl } from "@/services/files/createWorkflowFileSignedUrl";
import { parseFieldValue } from "@/integrations/_shared/airtable/fields";
import type { ParsedAttachment } from "@/integrations/_shared/airtable/fields";
import { recordsUpdate } from "../api/records";
import { AddAttachmentConfigSchema } from "./addAttachment.schema";

/**
 * Airtable `add_attachment` action handler — Airtable 2.1 Commit 2.
 *
 * Third V2 consumer of the P-S3 FileRef contract (after Slack 2.4 +
 * Gmail 2.3). Writes a FileRef-described file into an Airtable
 * attachment field via `PATCH /v0/{baseId}/{tableIdOrName}/{recordId}`.
 *
 * FileRef → URL resolution:
 *   - `v2_storage` — `services/files/createWorkflowFileSignedUrl` mints
 *     a short-lived (~10 min) Supabase signed URL from the storage
 *     path. Airtable fetches the file from this URL during ingestion;
 *     once ingested, Airtable mints its own attachment URL and the
 *     signed URL becomes irrelevant.
 *   - `signed_url` — used directly.
 *   - `provider_url` — REJECTED with a structured
 *     `AirtableAddAttachmentConfigError` (mirrors Slack 2.4's
 *     `SlackUploadConfigError` pattern). Per P-S3 §7: generic
 *     `provider_url` fetching requires provider-safe auth handling
 *     that does not exist in V2 yet. Workflow authors must stage
 *     bytes via a download/staging action first.
 *
 * Replace semantic (NPD-A5 / NPD-A6 Airtable 2.1):
 *   The PATCH body sets the attachment field to a SINGLE-element
 *   array `[{url, filename}]`. Existing attachments on the field are
 *   REPLACED. There is no GET-then-merge — preserveExisting +
 *   appendToExisting are intentionally deferred (no flag exposed).
 *
 * Output:
 *   `{baseId, tableIdOrName, recordId, fieldName, attachmentCount,
 *     attachments: ParsedAttachment[]}`
 *   - `attachments` is the bounded 6-key projection of the
 *     attachment field on the PATCH response record (Airtable's own
 *     URLs, NOT our signed URL).
 *   - No bytes / base64 / content in output. No raw Airtable response
 *     spread.
 */

/**
 * Surfaced when the user-supplied FileRef cannot be processed by
 * `add_attachment` — mirrors Slack 2.4's `SlackUploadConfigError`.
 * Carries a code + unblock hint so workflow authors know how to fix.
 */
export class AirtableAddAttachmentConfigError extends Error {
  readonly code: string;
  readonly hint: string;
  constructor(code: string, message: string, hint: string) {
    super(message);
    this.name = "AirtableAddAttachmentConfigError";
    this.code = code;
    this.hint = hint;
  }
}

export const addAttachment: ActionHandler = async (input) => {
  const config = AddAttachmentConfigSchema.parse(input.config);

  // Provider-url rejection — same shape as Slack 2.4 upload_file.
  if (config.file.kind === "provider_url") {
    throw new AirtableAddAttachmentConfigError(
      "provider_url_unsupported",
      "Airtable add_attachment does not support FileRef(kind=provider_url) yet.",
      "Stage bytes first via a download/staging action (e.g. slack:download_file, gmail:get_attachment) which yields a FileRef(kind=v2_storage), then pass that ref to add_attachment.",
    );
  }

  // Resolve FileRef to a URL Airtable can fetch.
  let fetchableUrl: string;
  if (config.file.kind === "v2_storage") {
    // Mint a short-lived signed URL from the v2 storage path.
    // Signed URL is bearer-equivalent — never logged, never in output.
    const { signedUrl } = await createWorkflowFileSignedUrl({
      storagePath: config.file.storagePath,
      reason: `airtable:add_attachment run=${input.runId} node=${input.nodeId}`,
    });
    fetchableUrl = signedUrl;
  } else {
    // signed_url arm — already a fetchable URL.
    fetchableUrl = config.file.url;
  }

  // Filename Airtable persists. Caller override > FileRef's own name.
  const filename = config.filename ?? config.file.name;

  // accountId routing — Airtable trigger event accountId is the
  // user's Airtable userId. Cross-provider triggers / manual runs
  // pass null and refreshAndRetry picks the user's single Airtable
  // integration row.
  const accountId =
    input.triggerEvent.provider === "airtable"
      ? input.triggerEvent.accountId
      : null;

  // PATCH the record. The attachment field receives a single-element
  // array — Airtable's REPLACE semantic per NPD-A5 / NPD-A6.
  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "airtable",
    accountId,
    apiCall: (accessToken) =>
      recordsUpdate({
        accessToken,
        baseId: config.baseId,
        tableIdOrName: config.tableIdOrName,
        recordId: config.recordId,
        fields: {
          [config.fieldName]: [
            { url: fetchableUrl, filename },
          ],
        },
        // typecast=false — Airtable's attachment ingestion is a
        // dedicated path, NOT a type-coercion concern.
        typecast: false,
      }),
  });

  // Parse the response attachment field through the shared bounded
  // projection. Airtable returns its own URL + an `id` once the file
  // is ingested (sometimes synchronously, sometimes asynchronously —
  // the field will be present in either case).
  const rawAttachments = result.fields[config.fieldName];
  const parsed = parseFieldValue("attachment", rawAttachments);
  const attachments: ParsedAttachment[] =
    parsed.type === "attachment" ? parsed.value : [];

  return {
    output: {
      baseId: config.baseId,
      tableIdOrName: config.tableIdOrName,
      recordId: result.id,
      fieldName: config.fieldName,
      attachmentCount: attachments.length,
      attachments,
    },
  };
};
