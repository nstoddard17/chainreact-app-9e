import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI `POST /v1.0/myorg/pipelines/{pipelineId}/users`
 * (Update Pipeline User — the documented add-or-update grant call).
 *
 * Body: `identifier` (UPN for `User`, object id for `Group` / `App`),
 * `principalType`, `accessRight`. `PipelineUserAccessRight` documents a
 * single value — `Admin` — which the action schema pins exactly.
 * Scope: `Pipeline.ReadWrite.All`.
 */

export interface PipelineUserUpsertInput {
  accessToken: string;
  pipelineId: string;
  identifier: string;
  principalType: "User" | "Group" | "App";
  accessRight: "Admin";
}

export async function pipelineUserUpsert(
  input: PipelineUserUpsertInput,
): Promise<void> {
  await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: `/pipelines/${encodeURIComponent(input.pipelineId)}/users`,
    body: {
      identifier: input.identifier,
      principalType: input.principalType,
      accessRight: input.accessRight,
    },
    notFoundResource: `pipeline ${input.pipelineId}`,
    operation: "pipeline user upsert POST",
  });
}
