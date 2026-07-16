import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `POST /v1.0/myorg/groups/{groupId}/dataflows/{dataflowId}/refreshes`
 * (Refresh Dataflow).
 *
 * Body is `{notifyOption}` only. `MailOnCompletion` is NOT supported for
 * dataflows (dataset refreshes accept it; dataflows do not) — the action
 * schema pins the two valid values.
 *
 * NOTE: the endpoint documents an optional `processType` query param
 * (example value `default`) whose enumeration is NOT documented
 * (research.md §2.4 "Could not verify"). We send no `processType` —
 * the documented-stable behavior — rather than invent values.
 *
 * Success is HTTP 200 with NO refresh id in the response — dataflow
 * refresh completion is observed via Get Dataflow Transactions, not a
 * returned handle.
 */

export interface DataflowRefreshCreateInput {
  accessToken: string;
  groupId: string;
  dataflowId: string;
  notifyOption: "MailOnFailure" | "NoNotification";
}

export async function dataflowRefreshCreate(
  input: DataflowRefreshCreateInput,
): Promise<void> {
  await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: `/groups/${encodeURIComponent(input.groupId)}/dataflows/${encodeURIComponent(
      input.dataflowId,
    )}/refreshes`,
    body: { notifyOption: input.notifyOption },
    notFoundResource: `dataflow ${input.dataflowId}`,
    operation: "dataflow refresh POST",
  });
}
