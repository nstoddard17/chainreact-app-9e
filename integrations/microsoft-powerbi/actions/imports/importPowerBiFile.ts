import {
  WORKFLOW_FILES_BUCKET,
  fetchFileBytes,
  type WorkflowFilesStorageAdapter,
} from "@/core/files/fetchFileBytes";
import { getServiceRoleClient } from "@/repositories/supabase/serviceRoleClient";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { importPost } from "../../api/imports/importPost";
import { ImportPowerBiFileConfigSchema } from "./importPowerBiFile.schema";

/**
 * Power BI `import_power_bi_file` action handler.
 *
 * Uploads a file (.pbix / .xlsx / .rdl / dataflow model.json) into a
 * workspace via the multipart Post Import In Group endpoint. FileRef
 * consumption mirrors Slack `upload_file`:
 *   1. Schema accepts every FileRef arm; `kind=provider_url` is
 *      rejected here with a structured error carrying the unblock hint
 *      (generic provider_url fetching needs provider-safe auth that
 *      does not exist yet).
 *   2. `v2_storage` resolves through a service-role storage adapter;
 *      `signed_url` through `fetchFileBytes`'s plain fetch path.
 *
 * Direct multipart upload supports files up to 1 GB. The 1–10 GB
 * temporary-upload-location path (Premium-only) is NOT supported.
 *
 * NOTE: no advisory size warn here — `core/files/limits.ts` has no
 * `microsoft-powerbi` entry and the 25 MB default would false-warn on
 * legitimate .pbix files (provider cap is 1 GB). Adding the limits
 * entry is a shared-file change outside this domain.
 *
 * The import is asynchronous provider-side: the response carries the
 * import id; completion is observed via `get_import_status`
 * (Publishing → Succeeded/Failed) — authors compose the poll loop.
 *
 * Output shape: { importId, importState }
 */

/**
 * Surfaced when the supplied `FileRef` cannot be processed by
 * `import_power_bi_file`. Config-shape failure, not a provider error.
 */
export class PowerBiImportConfigError extends Error {
  readonly code: string;
  readonly hint: string;
  constructor(code: string, message: string, hint: string) {
    super(message);
    this.name = "PowerBiImportConfigError";
    this.code = code;
    this.hint = hint;
  }
}

/**
 * Service-role storage adapter for `v2_storage` FileRefs — inline copy
 * of the Slack `upload_file` adapter (kept action-local per the same
 * rationale: lifts to `services/files/` when a third consumer appears).
 */
function buildWorkflowFilesStorageAdapter(
  reason: string,
): WorkflowFilesStorageAdapter {
  return {
    async download(storagePath: string): Promise<Uint8Array> {
      const supabase = getServiceRoleClient(reason);
      const { data, error } = await supabase.storage
        .from(WORKFLOW_FILES_BUCKET)
        .download(storagePath);
      if (error || !data) {
        // Adapter contract: never leak signed URLs / tokens in errors.
        throw new Error(
          `workflow-files download failed: ${error?.message ?? "no data"}`,
        );
      }
      const buf = await data.arrayBuffer();
      return new Uint8Array(buf);
    },
  };
}

export const importPowerBiFile: ActionHandler = async (input) => {
  const config = ImportPowerBiFileConfigSchema.parse(input.config);

  if (config.file.kind === "provider_url") {
    throw new PowerBiImportConfigError(
      "provider_url_unsupported",
      "Power BI import_power_bi_file does not support FileRef(kind=provider_url).",
      "Stage bytes first via a download/staging action, or supply a FileRef(kind=v2_storage | signed_url).",
    );
  }

  const storage =
    config.file.kind === "v2_storage"
      ? buildWorkflowFilesStorageAdapter(
          `microsoft-powerbi:import_power_bi_file run=${input.runId} node=${input.nodeId}`,
        )
      : undefined;

  const fetched = await fetchFileBytes(config.file, { storage });

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      importPost({
        accessToken,
        groupId: config.workspaceId,
        datasetDisplayName: config.datasetDisplayName,
        nameConflict: config.nameConflict,
        // Provider accepts only `true` — omit otherwise.
        ...(config.skipReport === true && { skipReport: true }),
        fileBytes: fetched.bytes,
      }),
  });

  return {
    output: {
      importId: result.importId,
      importState: result.importState,
    },
  };
};
