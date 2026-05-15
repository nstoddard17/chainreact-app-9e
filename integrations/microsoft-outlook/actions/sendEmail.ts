import type { ActionHandler } from "@/services/execution/handlers/types";
import type { FileRef } from "@/contracts/file";
import {
  fetchFileBytes,
  UnsupportedProviderFetchError,
  type FetchFileBytesResult,
} from "@/core/files/fetchFileBytes";
import { parseRecipients } from "@/core/integrations/parseRecipients";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { createWorkflowFilesStorageAdapter } from "@/services/files/createWorkflowFilesStorageAdapter";
import {
  sendMail,
  type GraphFileAttachment,
  type GraphRecipient,
} from "../api/sendMail";
import { SendEmailConfigSchema } from "./sendEmail.schema";

/**
 * Microsoft Graph fileAttachment-payload caps (Outlook Mail 2.1 Commit 4,
 * accepted P-O2). These are hard caps in the handler — over them, we
 * fail the action BEFORE calling Graph. Graph itself rejects ~35 MB
 * synchronous me/sendMail payloads with HTTP 413; below that it may
 * accept and silently truncate, so we enforce upstream.
 *
 * Microsoft documents 3 MB per attachment + ~25 MB total for synchronous
 * sendMail. The larger-attachment upload-session flow (POST
 * /me/messages/{id}/attachments/createUploadSession) is intentionally
 * deferred — see plan §3.
 */
const MAX_ATTACHMENT_SIZE_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;

/**
 * Microsoft Outlook `me/sendMail` action handler.
 *
 * Mirrors Gmail's send_email shape:
 *   - Schema parse first (Zod strict; Q11 enforces explicit isHtml +
 *     importance).
 *   - parseRecipients on to/cc/bcc (Q7) — CSV strings split, arrays
 *     flatten, empties drop.
 *   - At-least-one-recipient invariant enforced AFTER parsing — the
 *     schema guarantees `to` has at least one non-empty entry, but
 *     post-trim it could still be empty whitespace ("   "); we re-check
 *     here so a "   ,  ," CSV produces a clean error rather than a
 *     Graph 400.
 *   - Resolve optional `attachments` (FileRef[]) to Graph
 *     `fileAttachment[]` (Outlook Mail 2.1 Commit 4, accepted P-O2):
 *       • `v2_storage` kind → fetched through the workflow-files
 *         storage adapter.
 *       • `signed_url` kind → fetched directly (no auth header).
 *       • `provider_url` kind → rejected with a clean error before any
 *         Graph call (P-S3 plan §10 #1 — V2 has no generic cross-
 *         provider bearer-fetch helper yet; if Outlook needs to attach
 *         a provider-issued URL, stage it through `stageFileToStorage`
 *         first).
 *     Size caps (3 MB per, 25 MB total) are enforced after byte fetch
 *     but BEFORE base64 encoding + the wrapper call.
 *   - Wrap principal call in `refreshAndRetry` (Q3): a 401 from Graph
 *     triggers exactly one refresh + retry; persistent 401 surfaces as
 *     IntegrationActionRequiredError.
 *
 * Output shape (UNCHANGED in 2.1 — attachments are sent but NEVER appear
 * in the action output. Workflow authors who want to surface attachment
 * names downstream should compose their own output by referencing the
 * upstream FileRef-producing node's fields):
 *   - `sent: true` on success (Graph returns 202 with no body, so there's
 *     no provider id to surface).
 *   - `to`, `cc`, `bcc`: flat parsed lists of addresses actually sent
 *     (downstream nodes can iterate, e.g. for a confirmation summary).
 *   - `subject`, `importance`, `isHtml` echoed for downstream variable refs.
 *
 * Account resolution mirrors Gmail / Sheets — when the trigger event came
 * from this provider, use its accountId; otherwise null and the
 * dispatcher picks the user's single active integration row.
 */
export const sendEmail: ActionHandler = async (input) => {
  const config = SendEmailConfigSchema.parse(input.config);

  // Q7 — split CSVs / flatten arrays / drop empties. Schema guaranteed
  // `to` is non-empty as a string-or-array, but a value like "  ,  " or
  // [""] still parses to []; recheck after parsing.
  const toAddresses = parseRecipients(config.to);
  const ccAddresses = parseRecipients(config.cc);
  const bccAddresses = parseRecipients(config.bcc);

  if (toAddresses.length === 0) {
    throw new Error(
      "send_email: at least one address in `to` is required (after parsing CSV / array).",
    );
  }

  const accountId =
    input.triggerEvent.provider === "microsoft-outlook"
      ? input.triggerEvent.accountId
      : null;

  const toGraph = (addresses: string[]): GraphRecipient[] =>
    addresses.map((address) => ({ emailAddress: { address } }));

  // Resolve optional attachments to Graph fileAttachment envelopes
  // BEFORE the refreshAndRetry call. If any step throws (provider_url
  // rejection, per-attachment cap, total cap, fetch error), we fail
  // without burning a Graph 401-retry cycle.
  const graphAttachments = await resolveAttachments(
    config.attachments,
    { runId: input.runId, nodeId: input.nodeId },
  );

  await refreshAndRetry({
    userId: input.userId,
    provider: "microsoft-outlook",
    accountId,
    apiCall: (accessToken) =>
      sendMail({
        accessToken,
        message: {
          subject: config.subject,
          body: {
            contentType: config.isHtml ? "HTML" : "Text",
            content: config.body,
          },
          toRecipients: toGraph(toAddresses),
          ccRecipients: ccAddresses.length > 0 ? toGraph(ccAddresses) : undefined,
          bccRecipients:
            bccAddresses.length > 0 ? toGraph(bccAddresses) : undefined,
          importance: config.importance,
          // Only include attachments[] in the body when we actually have
          // any. An empty array would be valid per Graph but creates
          // observable shape drift in tests; absence is the cleaner
          // pre-2.1-preserving signal.
          ...(graphAttachments.length > 0 && {
            attachments: graphAttachments,
          }),
        },
        // Match V1 default — saved copy in Sent Items. Workflow authors
        // who want fire-and-forget can override via a future schema field.
        saveToSentItems: true,
      }),
  });

  return {
    output: {
      sent: true,
      to: toAddresses,
      cc: ccAddresses,
      bcc: bccAddresses,
      subject: config.subject,
      isHtml: config.isHtml,
      importance: config.importance,
    },
  };
};

/**
 * Resolve a list of FileRefs into Graph `fileAttachment` envelopes,
 * enforcing the 3 MB per / 25 MB total caps. Constructs the storage
 * adapter lazily — only when at least one FileRef needs it — so
 * unrelated test paths (no attachments) don't touch the service-role
 * client at all.
 *
 * Rejection paths:
 *   - `provider_url` kind → throws via `UnsupportedProviderFetchError`
 *     from `fetchFileBytes`. Caller surfaces it verbatim.
 *   - Per-attachment payload > 3 MB → throws a clean per-name error.
 *   - Total payload > 25 MB → throws a clean total-only error.
 *
 * Returns `[]` when input is `undefined` / empty — caller treats `[]`
 * as "no attachments" and omits the field from the Graph body.
 */
async function resolveAttachments(
  refs: readonly FileRef[] | undefined,
  audit: { runId: string; nodeId: string },
): Promise<GraphFileAttachment[]> {
  if (!refs || refs.length === 0) return [];

  // Decide once whether any v2_storage refs need the adapter — avoids
  // burning a service-role-client construction in the all-signed_url
  // case (relevant for unit tests + cheap workflows).
  const needsStorageAdapter = refs.some((r) => r.kind === "v2_storage");
  const storage = needsStorageAdapter
    ? createWorkflowFilesStorageAdapter({
        reason: `microsoft-outlook:send_email run=${audit.runId} node=${audit.nodeId}`,
      })
    : undefined;

  const out: GraphFileAttachment[] = [];
  let totalBytes = 0;
  for (const ref of refs) {
    if (ref.kind === "provider_url") {
      // P-S3 plan §10 #1: V2 has no generic cross-provider bearer-fetch
      // helper. Throw a clean error before any Graph call.
      throw new UnsupportedProviderFetchError(ref.provider);
    }

    // fetchFileBytes throws FileFetchError with a sanitized message
    // (never includes the URL / storage path) — propagate verbatim.
    const result: FetchFileBytesResult = await fetchFileBytes(ref, { storage });

    if (result.bytes.byteLength > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new Error(
        `send_email: attachment "${result.name}" is ${result.bytes.byteLength} bytes; exceeds the ${MAX_ATTACHMENT_SIZE_BYTES}-byte per-attachment cap for Microsoft Graph sendMail.`,
      );
    }
    totalBytes += result.bytes.byteLength;
    if (totalBytes > MAX_TOTAL_ATTACHMENT_SIZE_BYTES) {
      throw new Error(
        `send_email: total attachment payload is ${totalBytes} bytes; exceeds the ${MAX_TOTAL_ATTACHMENT_SIZE_BYTES}-byte total cap for Microsoft Graph sendMail.`,
      );
    }

    out.push({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: result.name,
      contentType: result.mimeType,
      contentBytes: Buffer.from(result.bytes).toString("base64"),
    });
  }
  return out;
}
