import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI `GET /v1.0/myorg/pipelines/{pipelineId}/users`
 * (Get Pipeline Users).
 *
 * Lists the pipeline's user access entries. Rows carry `identifier`
 * (UPN for users, object id for groups/apps), `principalType`, and
 * `accessRight` — pipeline principals may lack display names, so the
 * identifier is the stable handle.
 */

export interface PipelineUsersListInput {
  accessToken: string;
  pipelineId: string;
}

export interface PowerBiPipelineUser {
  identifier: string;
  principalType: string | null;
  accessRight: string | null;
}

interface PipelineUsersListBody {
  value?: Array<{
    identifier?: string;
    principalType?: string;
    accessRight?: string;
  }>;
}

export async function pipelineUsersList(
  input: PipelineUsersListInput,
): Promise<PowerBiPipelineUser[]> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/pipelines/${encodeURIComponent(input.pipelineId)}/users`,
    notFoundResource: `pipeline ${input.pipelineId}`,
    operation: "pipeline users GET",
  });

  const body = (await res.json()) as PipelineUsersListBody;
  const rows = body.value ?? [];
  const users: PowerBiPipelineUser[] = [];
  for (const row of rows) {
    if (typeof row.identifier !== "string" || row.identifier.length === 0)
      continue;
    users.push({
      identifier: row.identifier,
      principalType:
        typeof row.principalType === "string" ? row.principalType : null,
      accessRight:
        typeof row.accessRight === "string" ? row.accessRight : null,
    });
  }
  return users;
}
