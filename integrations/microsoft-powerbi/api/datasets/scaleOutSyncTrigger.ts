import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `POST /v1.0/myorg/groups/{groupId}/datasets/{datasetId}/queryScaleOut/sync`
 * (Trigger Query Scale Out Sync In Group).
 *
 * Premium-family feature: syncs the model's read-only query scale-out
 * replicas to the latest write version. No request body. HTTP 200 with a
 * `DatasetQueryScaleOutSyncStatus` body — mapped onto a fixed key subset
 * (versions are int64 → JSON numbers; anything non-numeric maps to null).
 */

export interface ScaleOutSyncTriggerInput {
  accessToken: string;
  groupId: string;
  datasetId: string;
}

export interface ScaleOutSyncTriggerResult {
  commitVersion: number | null;
  targetSyncVersion: number | null;
  /** explicit | automatic | system. */
  triggerReason: string | null;
  syncStartTime: string | null;
}

interface ScaleOutSyncBody {
  commitVersion?: number;
  targetSyncVersion?: number;
  triggerReason?: string;
  syncStartTime?: string;
}

export async function scaleOutSyncTrigger(
  input: ScaleOutSyncTriggerInput,
): Promise<ScaleOutSyncTriggerResult> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: `/groups/${encodeURIComponent(input.groupId)}/datasets/${encodeURIComponent(
      input.datasetId,
    )}/queryScaleOut/sync`,
    notFoundResource: `semantic model ${input.datasetId}`,
    operation: "dataset queryScaleOut sync POST",
  });

  const body = (await res.json()) as ScaleOutSyncBody;
  return {
    commitVersion:
      typeof body.commitVersion === "number" ? body.commitVersion : null,
    targetSyncVersion:
      typeof body.targetSyncVersion === "number"
        ? body.targetSyncVersion
        : null,
    triggerReason:
      typeof body.triggerReason === "string" ? body.triggerReason : null,
    syncStartTime:
      typeof body.syncStartTime === "string" ? body.syncStartTime : null,
  };
}
