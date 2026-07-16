import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `DELETE /v1.0/myorg/pipelines/{pipelineId}/users/{identifier}`
 * (Delete Pipeline User).
 *
 * Removes the principal's pipeline access. `identifier` is the UPN for
 * users, object id for groups/apps — the same value Get Pipeline Users
 * returns. Removing access does not touch workspace roles.
 */

export interface PipelineUserDeleteInput {
  accessToken: string;
  pipelineId: string;
  identifier: string;
}

export async function pipelineUserDelete(
  input: PipelineUserDeleteInput,
): Promise<void> {
  await powerbiFetch({
    accessToken: input.accessToken,
    method: "DELETE",
    path: `/pipelines/${encodeURIComponent(input.pipelineId)}/users/${encodeURIComponent(
      input.identifier,
    )}`,
    notFoundResource: `pipeline ${input.pipelineId} user`,
    operation: "pipeline user DELETE",
  });
}
