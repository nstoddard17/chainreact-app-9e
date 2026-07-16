import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI `PATCH /v1.0/myorg/groups/{groupId}`
 * (Update Group).
 *
 * Sends ONLY the fields the caller provided — an absent field is never
 * serialized, so Power BI leaves it untouched. The action schema
 * guarantees at least one field is present.
 *
 * // NOTE: Update Group is verified in research.md only via the groups
 * // operation-index ("Updates a specified workspace"; body
 * // name/description/defaultDatasetStorageFormat — detail page not
 * // fetched). We deliberately expose only `name` + `description`;
 * // defaultDatasetStorageFormat is capacity-coupled and stays out until
 * // the body contract is verified against the detail doc / live behavior.
 */

export interface GroupUpdateInput {
  accessToken: string;
  groupId: string;
  name?: string;
  description?: string;
}

export async function groupUpdate(input: GroupUpdateInput): Promise<void> {
  const body: Record<string, string> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.description !== undefined) body.description = input.description;

  await powerbiFetch({
    accessToken: input.accessToken,
    method: "PATCH",
    path: `/groups/${encodeURIComponent(input.groupId)}`,
    body,
    notFoundResource: `workspace ${input.groupId}`,
    operation: "group update PATCH",
  });
}
