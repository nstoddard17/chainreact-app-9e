import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `GET /v1.0/myorg/groups/{groupId}/datasets/{datasetId}/queryScaleOut/syncStatus`
 * (Get Query Scale Out Sync Status In Group).
 *
 * Premium-family feature. Returns the model's replica sync state mapped
 * onto a fixed key subset of `DatasetQueryScaleOutSyncStatus` (versions
 * are int64 → JSON numbers; anything non-numeric maps to null).
 */

export interface ScaleOutSyncStatusGetInput {
  accessToken: string;
  groupId: string;
  datasetId: string;
}

export interface ScaleOutSyncStatusGetResult {
  commitVersion: number | null;
  targetSyncVersion: number | null;
  minActiveReadVersion: number | null;
  /** explicit | automatic | system. */
  triggerReason: string | null;
  syncStartTime: string | null;
  syncEndTime: string | null;
}

interface ScaleOutSyncStatusBody {
  commitVersion?: number;
  targetSyncVersion?: number;
  minActiveReadVersion?: number;
  triggerReason?: string;
  syncStartTime?: string;
  syncEndTime?: string;
}

export async function scaleOutSyncStatusGet(
  input: ScaleOutSyncStatusGetInput,
): Promise<ScaleOutSyncStatusGetResult> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/groups/${encodeURIComponent(input.groupId)}/datasets/${encodeURIComponent(
      input.datasetId,
    )}/queryScaleOut/syncStatus`,
    notFoundResource: `semantic model ${input.datasetId}`,
    operation: "dataset queryScaleOut syncStatus GET",
  });

  const body = (await res.json()) as ScaleOutSyncStatusBody;
  return {
    commitVersion:
      typeof body.commitVersion === "number" ? body.commitVersion : null,
    targetSyncVersion:
      typeof body.targetSyncVersion === "number"
        ? body.targetSyncVersion
        : null,
    minActiveReadVersion:
      typeof body.minActiveReadVersion === "number"
        ? body.minActiveReadVersion
        : null,
    triggerReason:
      typeof body.triggerReason === "string" ? body.triggerReason : null,
    syncStartTime:
      typeof body.syncStartTime === "string" ? body.syncStartTime : null,
    syncEndTime:
      typeof body.syncEndTime === "string" ? body.syncEndTime : null,
  };
}
