import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `POST /v1.0/myorg/groups/{groupId}/datasets/{datasetId}/refreshes`
 * (Refresh Dataset In Group).
 *
 * Standard refresh sends `{notifyOption}` only. Any additional body field
 * (type / commitMode / maxParallelism / retryCount / applyRefreshPolicy /
 * objects) makes Power BI treat the request as an ENHANCED refresh —
 * rejected on shared capacity ("only notifyOption can be specified"),
 * supported on Premium / PPU / Embedded. The action schema gates which
 * fields reach this wrapper; the wrapper sends exactly what it's given.
 *
 * Success is HTTP 202 with the refresh request id in the
 * `x-ms-request-id` header (also the trailing segment of `Location` for
 * enhanced refreshes). That id is the stable handle for
 * cancel / get-details / history matching.
 *
 * Throws `Unauthorized401Error` on 401 (refreshAndRetry contract),
 * `NotFoundError` on 404, sanitized `Error` otherwise (e.g. shared-
 * capacity rejections of enhanced options, refresh-limit 429s).
 */

export interface RefreshesCreateInput {
  accessToken: string;
  groupId: string;
  datasetId: string;
  notifyOption: "MailOnFailure" | "MailOnCompletion" | "NoNotification";
  /** Enhanced-refresh options — presence of ANY triggers enhanced mode. */
  enhanced?: {
    type?: string;
    commitMode?: string;
    maxParallelism?: number;
    retryCount?: number;
    applyRefreshPolicy?: boolean;
  };
}

export interface RefreshesCreateResult {
  /** `x-ms-request-id` — stable refresh identifier, or null if absent. */
  refreshRequestId: string | null;
}

export async function refreshesCreate(
  input: RefreshesCreateInput,
): Promise<RefreshesCreateResult> {
  const body: Record<string, unknown> = { notifyOption: input.notifyOption };
  if (input.enhanced) {
    const e = input.enhanced;
    if (e.type !== undefined) body.type = e.type;
    if (e.commitMode !== undefined) body.commitMode = e.commitMode;
    if (e.maxParallelism !== undefined) body.maxParallelism = e.maxParallelism;
    if (e.retryCount !== undefined) body.retryCount = e.retryCount;
    if (e.applyRefreshPolicy !== undefined)
      body.applyRefreshPolicy = e.applyRefreshPolicy;
  }

  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: `/groups/${encodeURIComponent(input.groupId)}/datasets/${encodeURIComponent(
      input.datasetId,
    )}/refreshes`,
    body,
    notFoundResource: `semantic model ${input.datasetId}`,
    operation: "dataset refresh POST",
  });

  return { refreshRequestId: res.headers.get("x-ms-request-id") };
}
