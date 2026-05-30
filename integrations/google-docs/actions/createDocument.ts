import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { documentsCreate } from "@/integrations/_shared/google/api/docs/documentsCreate";
import { documentsBatchUpdate } from "@/integrations/_shared/google/api/docs/documentsBatchUpdate";
import { filesUpdate } from "@/integrations/google-drive/api/filesUpdate";
import { CreateDocumentConfigSchema } from "./createDocument.schema";

/**
 * Google Docs `create_document` action handler — Slice 3.GDOCS-2.
 *
 * V2-native two-step (three with folder placement):
 *   1. `documents.create` — creates an empty doc with the configured
 *      `title`. Docs returns a `Document` resource with an empty
 *      body; content insertion is a SEPARATE call.
 *   2. `documents.batchUpdate` with one `insertText` request at
 *      `index: 1` (Docs index 0 is reserved for the BODY_START
 *      sentinel; the first writable position is 1). Skipped when
 *      `content` is empty — V2 won't burn a Docs API call to insert
 *      zero text.
 *   3. (Optional) `files.update` to move the document into the
 *      requested folder. Drive's `files.create` ↔ `documents.create`
 *      distinction: Drive places newly-created Google Docs in My
 *      Drive root by default; moving to a non-root folder requires a
 *      separate `files.update?addParents=` patch. V1 does the same
 *      thing under the hood via the `googleapis` SDK.
 *
 * Each principal call wraps in `refreshAndRetry` (Q3) so a 401 from
 * a stale Google access token triggers exactly one refresh + retry.
 *
 * Output:
 *   - `documentId`, `documentUrl`, `title`, `createdAt`, `folderId?`.
 *   - `documentUrl` is the canonical `docs.google.com/document/d/<id>/edit`
 *     pattern (Docs API doesn't return a URL field directly; we
 *     construct it from the documentId — same as V1 does).
 *
 * V1 reference: `lib/workflows/actions/googleDocs/createDocument.ts` +
 * `lib/workflows/actions/googleDocs.ts:createGoogleDocument`. V2 ports
 * the two-step pattern verbatim; the file-upload branch (V1's
 * `contentSource: "file_upload"`) is intentionally absent (D-GD1).
 *
 * `accountId` resolution mirrors every other Google Docs handler:
 * read from the trigger event when the run was kicked off by a
 * Google Docs trigger, fall through to `null` otherwise (the
 * `getActiveForExecution` call resolves the single connected
 * integration; multi-account flows aren't supported for this slice
 * — same as Drive / Sheets / Calendar).
 */
export const createDocument: ActionHandler = async (input) => {
  const config = CreateDocumentConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "google-docs"
      ? input.triggerEvent.providerAccountId
      : null;

  // 1) Create the empty document.
  const created = await refreshAndRetry({
    accountId: input.accountId,
    provider: "google-docs",
    providerAccountId,
    apiCall: (accessToken) =>
      documentsCreate({ accessToken, title: config.title }),
  });
  const documentId = created.documentId;

  // 2) Insert content if supplied.
  if (config.content.length > 0) {
    await refreshAndRetry({
      accountId: input.accountId,
      provider: "google-docs",
      providerAccountId,
      apiCall: (accessToken) =>
        documentsBatchUpdate({
          accessToken,
          documentId,
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: config.content,
              },
            },
          ],
        }),
    });
  }

  // 3) Move to folder if requested.
  if (config.folderId !== undefined && config.folderId.length > 0) {
    await refreshAndRetry({
      accountId: input.accountId,
      provider: "google-docs",
      providerAccountId,
      apiCall: (accessToken) =>
        filesUpdate({
          accessToken,
          fileId: documentId,
          body: {},
          addParents: config.folderId,
          // Drive returns the new parents in `parents` — we don't
          // consume it here, but the field mask stays explicit.
          fields: "id,name,parents",
        }),
    });
  }

  return {
    output: {
      documentId,
      documentUrl: `https://docs.google.com/document/d/${documentId}/edit`,
      title: created.title ?? config.title,
      createdAt: new Date().toISOString(),
      folderId: config.folderId ?? null,
    },
  };
};
