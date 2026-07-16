import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI `GET /v1.0/myorg/groups/{groupId}/users`
 * (Get Group Users).
 *
 * Lists the principals (users / security groups / service principals)
 * with a role on the workspace. No server-side paging is documented —
 * workspace roles are capped provider-side at 1,000 principals. Fixed-key
 * mapping only; the raw rows carry more principal metadata (graphId,
 * userType, profile) that is deliberately NOT surfaced.
 */

export interface GroupUsersListInput {
  accessToken: string;
  groupId: string;
}

export interface PowerBiGroupUser {
  /** Entra object id when present (groups/apps; sometimes users). */
  identifier: string | null;
  /** Email / UPN when the principal is a user. */
  emailAddress: string | null;
  displayName: string | null;
  /** Admin | Member | Contributor | Viewer | None. */
  groupUserAccessRight: string | null;
  /** User | Group | App | None. */
  principalType: string | null;
}

interface GroupUsersListBody {
  value?: Array<{
    identifier?: string;
    emailAddress?: string;
    displayName?: string;
    groupUserAccessRight?: string;
    principalType?: string;
  }>;
}

export async function groupUsersList(
  input: GroupUsersListInput,
): Promise<PowerBiGroupUser[]> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/groups/${encodeURIComponent(input.groupId)}/users`,
    notFoundResource: `workspace ${input.groupId}`,
    operation: "group users GET",
  });

  const body = (await res.json()) as GroupUsersListBody;
  const rows = body.value ?? [];
  const users: PowerBiGroupUser[] = [];
  for (const row of rows) {
    users.push({
      identifier: typeof row.identifier === "string" ? row.identifier : null,
      emailAddress:
        typeof row.emailAddress === "string" ? row.emailAddress : null,
      displayName:
        typeof row.displayName === "string" ? row.displayName : null,
      groupUserAccessRight:
        typeof row.groupUserAccessRight === "string"
          ? row.groupUserAccessRight
          : null,
      principalType:
        typeof row.principalType === "string" ? row.principalType : null,
    });
  }
  return users;
}
