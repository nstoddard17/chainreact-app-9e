import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { recordsDelete } from "../api/records";
import { DeleteRecordConfigSchema } from "./deleteRecord.schema";

/**
 * Airtable `delete_record` action handler.
 *
 * NOT idempotent — 404 on a missing record surfaces as
 * `NotFoundError` from the API wrapper. See `deleteRecord.schema.ts`
 * for rationale (matches Notion / Microsoft pattern; workflow
 * authors who want idempotent delete can pre-check via find_record).
 *
 * Output shape:
 *   { id, deleted: true }
 *   - Airtable returns this exact shape on success; V2 forwards it
 *     for downstream branching (`{{nodeId.deleted}}`).
 */
export const deleteRecord: ActionHandler = async (input) => {
  const config = DeleteRecordConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "airtable"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "airtable",
    accountId,
    apiCall: (accessToken) =>
      recordsDelete({
        accessToken,
        baseId: config.baseId,
        tableIdOrName: config.tableIdOrName,
        recordId: config.recordId,
      }),
  });

  return {
    output: {
      id: result.id,
      deleted: result.deleted,
    },
  };
};
