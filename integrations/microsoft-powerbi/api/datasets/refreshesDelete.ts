import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `DELETE /v1.0/myorg/groups/{groupId}/datasets/{datasetId}/refreshes/{refreshId}`
 * (Cancel Refresh In Group).
 *
 * Cancels an in-flight ENHANCED refresh only — Power BI's asynchronous-
 * refresh doc states scheduled / standard on-demand refreshes cannot be
 * canceled via DELETE. The refresh id is the `x-ms-request-id` returned
 * by the refresh POST (see refreshesCreate).
 *
 * Success is HTTP 200 with no meaningful body. Throws
 * `Unauthorized401Error` on 401 (refreshAndRetry contract),
 * `NotFoundError` on 404, sanitized `Error` otherwise.
 */

export interface RefreshesDeleteInput {
  accessToken: string;
  groupId: string;
  datasetId: string;
  refreshId: string;
}

export async function refreshesDelete(
  input: RefreshesDeleteInput,
): Promise<void> {
  await powerbiFetch({
    accessToken: input.accessToken,
    method: "DELETE",
    path: `/groups/${encodeURIComponent(input.groupId)}/datasets/${encodeURIComponent(
      input.datasetId,
    )}/refreshes/${encodeURIComponent(input.refreshId)}`,
    notFoundResource: `refresh request ${input.refreshId}`,
    operation: "dataset refresh DELETE",
  });
}
