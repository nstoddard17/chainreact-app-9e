import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `GET /v1.0/myorg/groups/{groupId}/dataflows/{dataflowId}/transactions`
 * (Get Dataflow Transactions) — the dataflow analogue of refresh history.
 *
 * NOTE: the endpoint documents NO `$top` / paging params (research.md
 * §2.4), so bounding is a client-side slice of the returned set (the
 * provider returns newest-first). `status` values are not enumerated in
 * the docs (observed: InProgress / Success / Failed) — surfaced as an
 * opaque nullable string, never re-mapped.
 */

export interface DataflowTransactionsListInput {
  accessToken: string;
  groupId: string;
  dataflowId: string;
  /** Max transactions returned (client-side slice). Default 20. */
  top?: number;
}

export interface PowerBiDataflowTransaction {
  id: string;
  refreshType: string | null;
  startTime: string | null;
  endTime: string | null;
  status: string | null;
}

export interface DataflowTransactionsListResult {
  transactions: PowerBiDataflowTransaction[];
  /** True when the client-side slice truncated the provider's set. */
  hasMore: boolean;
}

interface DataflowTransactionsListBody {
  value?: Array<{
    id?: string;
    refreshType?: string;
    startTime?: string;
    endTime?: string;
    status?: string;
  }>;
}

export async function dataflowTransactionsList(
  input: DataflowTransactionsListInput,
): Promise<DataflowTransactionsListResult> {
  const top = input.top ?? 20;
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/groups/${encodeURIComponent(input.groupId)}/dataflows/${encodeURIComponent(
      input.dataflowId,
    )}/transactions`,
    notFoundResource: `dataflow ${input.dataflowId}`,
    operation: "dataflow transactions GET",
  });

  const body = (await res.json()) as DataflowTransactionsListBody;
  const rows = body.value ?? [];
  const transactions: PowerBiDataflowTransaction[] = [];
  for (const row of rows.slice(0, top)) {
    if (typeof row.id !== "string" || row.id.length === 0) continue;
    transactions.push({
      id: row.id,
      refreshType:
        typeof row.refreshType === "string" ? row.refreshType : null,
      startTime: typeof row.startTime === "string" ? row.startTime : null,
      endTime: typeof row.endTime === "string" ? row.endTime : null,
      status: typeof row.status === "string" ? row.status : null,
    });
  }
  return { transactions, hasMore: rows.length > top };
}
