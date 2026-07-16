import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `POST /v1.0/myorg/groups/{groupId}/dataflows/transactions/{transactionId}/cancel`
 * (Cancel Dataflow Transaction).
 *
 * NOTE the documented path shape: `transactions` sits directly under
 * `/dataflows/` — there is NO dataflowId segment in the cancel URL
 * (research.md §2.4).
 *
 * 200 returns `DataflowTransactionStatus {transactionId, status}` where
 * documented status values are `alreadyConcluded` | `invalid` |
 * `notFound` | `successfullyMarked` (sample shows `SuccessfullyMarked`) —
 * surfaced as an opaque nullable string.
 */

export interface DataflowTransactionCancelInput {
  accessToken: string;
  groupId: string;
  transactionId: string;
}

export interface DataflowTransactionCancelResult {
  transactionId: string | null;
  status: string | null;
}

interface DataflowTransactionCancelBody {
  transactionId?: string;
  status?: string;
}

export async function dataflowTransactionCancel(
  input: DataflowTransactionCancelInput,
): Promise<DataflowTransactionCancelResult> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: `/groups/${encodeURIComponent(input.groupId)}/dataflows/transactions/${encodeURIComponent(
      input.transactionId,
    )}/cancel`,
    notFoundResource: `dataflow transaction ${input.transactionId}`,
    operation: "dataflow transaction cancel POST",
  });

  const text = await res.text();
  let body: DataflowTransactionCancelBody = {};
  try {
    body = JSON.parse(text) as DataflowTransactionCancelBody;
  } catch {
    // Empty / non-JSON 200 body — fall through to nulls.
  }
  return {
    transactionId:
      typeof body.transactionId === "string" ? body.transactionId : null,
    status: typeof body.status === "string" ? body.status : null,
  };
}
