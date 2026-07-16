import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `GET /v1.0/myorg/groups/{groupId}/datasets/{datasetId}/refreshes/{refreshId}`
 * (Get Refresh Execution Details In Group).
 *
 * Works for ENHANCED (API-started) refreshes; standard portal/scheduled
 * refreshes don't support this operation. Returns HTTP 200 when the
 * refresh completed/failed and 202 while it is still in progress — both
 * are success here.
 *
 * NOTE: research.md verifies the 200 `DatasetRefreshDetail` body; whether
 * the 202 in-progress response always carries a JSON body is not
 * explicitly documented, so a body-less/non-JSON 202 degrades to
 * `status: "Unknown"` with null detail fields instead of throwing.
 */

export interface RefreshDetailsGetInput {
  accessToken: string;
  groupId: string;
  datasetId: string;
  refreshId: string;
}

export interface RefreshDetailsGetResult {
  /** Unknown (in progress) | Completed | Failed | Disabled. */
  status: string;
  /** NotStarted | InProgress | Completed | TimedOut | Failed | Disabled | Cancelled | Unknown. */
  extendedStatus: string | null;
  currentRefreshType: string | null;
  startTime: string | null;
  endTime: string | null;
  commitMode: string | null;
  numberOfAttempts: number | null;
}

interface RefreshDetailsBody {
  status?: string;
  extendedStatus?: string;
  currentRefreshType?: string;
  startTime?: string;
  endTime?: string;
  commitMode?: string;
  numberOfAttempts?: number;
}

export async function refreshDetailsGet(
  input: RefreshDetailsGetInput,
): Promise<RefreshDetailsGetResult> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/groups/${encodeURIComponent(input.groupId)}/datasets/${encodeURIComponent(
      input.datasetId,
    )}/refreshes/${encodeURIComponent(input.refreshId)}`,
    notFoundResource: `refresh request ${input.refreshId}`,
    operation: "dataset refresh details GET",
  });

  let body: RefreshDetailsBody = {};
  try {
    body = (await res.json()) as RefreshDetailsBody;
  } catch {
    // 202 in-progress may be body-less — see NOTE above.
  }

  return {
    status: typeof body.status === "string" ? body.status : "Unknown",
    extendedStatus:
      typeof body.extendedStatus === "string" ? body.extendedStatus : null,
    currentRefreshType:
      typeof body.currentRefreshType === "string"
        ? body.currentRefreshType
        : null,
    startTime:
      typeof body.startTime === "string" && body.startTime.length > 0
        ? body.startTime
        : null,
    endTime:
      typeof body.endTime === "string" && body.endTime.length > 0
        ? body.endTime
        : null,
    commitMode: typeof body.commitMode === "string" ? body.commitMode : null,
    numberOfAttempts:
      typeof body.numberOfAttempts === "number" ? body.numberOfAttempts : null,
  };
}
