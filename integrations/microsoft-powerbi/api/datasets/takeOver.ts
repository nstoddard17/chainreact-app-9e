import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `POST /v1.0/myorg/groups/{groupId}/datasets/{datasetId}/Default.TakeOver`
 * (Take Over In Group).
 *
 * No request body. Transfers dataset ownership to the connected user —
 * scheduled refresh then runs under THAT user's credentials, so this is
 * the required precursor to Update Parameters / Update Datasources /
 * Update Refresh Schedule when the caller isn't already the owner.
 * Success is HTTP 200 with no meaningful body.
 */

export interface TakeOverInput {
  accessToken: string;
  groupId: string;
  datasetId: string;
}

export async function takeOver(input: TakeOverInput): Promise<void> {
  await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: `/groups/${encodeURIComponent(input.groupId)}/datasets/${encodeURIComponent(
      input.datasetId,
    )}/Default.TakeOver`,
    notFoundResource: `semantic model ${input.datasetId}`,
    operation: "dataset TakeOver POST",
  });
}
