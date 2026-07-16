import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `GET /v1.0/myorg/groups/{groupId}/datasets/{datasetId}/refreshes?$top={n}`
 * (Get Refresh History In Group).
 *
 * Single page: requests `top + 1` entries so callers get an honest
 * `hasMore` without a second call (Power BI retains ≤60 entries / 7 days;
 * the endpoint has no cursor). Default page size 20.
 *
 * Failure details: Power BI packs the failure reason into
 * `serviceExceptionJson` (a JSON STRING). Only its `errorCode` is parsed
 * out and surfaced — the raw serviceExceptionJson never leaves this
 * wrapper (it can carry provider internals; bounded-output rule).
 */

export interface RefreshesListInput {
  accessToken: string;
  groupId: string;
  datasetId: string;
  /** Max entries to return (1–100). Default 20. */
  top?: number;
}

export interface PowerBiRefreshHistoryEntry {
  /** `requestId` — the stable refresh identifier, or null if absent. */
  refreshRequestId: string | null;
  /** Scheduled | OnDemand | ViaApi | ViaEnhancedApi | ViaXmlaEndpoint | OnDemandTraining. */
  refreshType: string;
  /** Unknown (in progress) | Completed | Failed | Disabled | Cancelled. */
  status: string;
  startTime: string | null;
  /** Empty/absent while the refresh is still in progress. */
  endTime: string | null;
  /** Parsed from serviceExceptionJson's `errorCode` — never the raw JSON. */
  errorCode: string | null;
}

export interface RefreshesListResult {
  refreshes: PowerBiRefreshHistoryEntry[];
  hasMore: boolean;
}

interface RefreshesListBody {
  value?: Array<{
    requestId?: string;
    refreshType?: string;
    status?: string;
    startTime?: string;
    endTime?: string;
    serviceExceptionJson?: string;
  }>;
}

function parseErrorCode(serviceExceptionJson: unknown): string | null {
  if (
    typeof serviceExceptionJson !== "string" ||
    serviceExceptionJson.length === 0
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(serviceExceptionJson) as { errorCode?: unknown };
    return typeof parsed.errorCode === "string" ? parsed.errorCode : null;
  } catch {
    return null;
  }
}

export async function refreshesList(
  input: RefreshesListInput,
): Promise<RefreshesListResult> {
  const top = input.top ?? 20;
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/groups/${encodeURIComponent(input.groupId)}/datasets/${encodeURIComponent(
      input.datasetId,
    )}/refreshes`,
    query: { $top: String(top + 1) },
    notFoundResource: `semantic model ${input.datasetId}`,
    operation: "dataset refreshes GET",
  });

  const body = (await res.json()) as RefreshesListBody;
  const rows = body.value ?? [];
  const refreshes: PowerBiRefreshHistoryEntry[] = rows
    .slice(0, top)
    .map((row) => ({
      refreshRequestId:
        typeof row.requestId === "string" ? row.requestId : null,
      refreshType:
        typeof row.refreshType === "string" ? row.refreshType : "Unknown",
      status: typeof row.status === "string" ? row.status : "Unknown",
      startTime:
        typeof row.startTime === "string" && row.startTime.length > 0
          ? row.startTime
          : null,
      endTime:
        typeof row.endTime === "string" && row.endTime.length > 0
          ? row.endTime
          : null,
      errorCode: parseErrorCode(row.serviceExceptionJson),
    }));
  return { refreshes, hasMore: rows.length > top };
}
