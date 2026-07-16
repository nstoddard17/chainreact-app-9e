import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI `POST /v1.0/myorg/groups/{groupId}/users`
 * (Add Group User). Scope: `Workspace.ReadWrite.All`.
 *
 * Documented body per principal kind (the action handler picks one):
 *   - User principals: `{emailAddress, groupUserAccessRight, principalType}`
 *     (the doc's own example addresses users by email).
 *   - Group / App principals: `{identifier, groupUserAccessRight,
 *     principalType}` (Entra object id).
 *
 * Provider-side limits: max 1,000 principals per workspace role list;
 * permission changes can take time to propagate.
 */

export type PowerBiGroupUserAccessRight =
  | "Admin"
  | "Member"
  | "Contributor"
  | "Viewer";

export type PowerBiPrincipalType = "User" | "Group" | "App";

export interface GroupUserAddInput {
  accessToken: string;
  groupId: string;
  accessRight: PowerBiGroupUserAccessRight;
  principalType: PowerBiPrincipalType;
  /** Email / UPN — User principals. */
  emailAddress?: string;
  /** Entra object id — Group / App principals. */
  identifier?: string;
}

export async function groupUserAdd(input: GroupUserAddInput): Promise<void> {
  const body: Record<string, string> = {
    groupUserAccessRight: input.accessRight,
    principalType: input.principalType,
  };
  if (input.emailAddress !== undefined) body.emailAddress = input.emailAddress;
  if (input.identifier !== undefined) body.identifier = input.identifier;

  await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: `/groups/${encodeURIComponent(input.groupId)}/users`,
    body,
    notFoundResource: `workspace ${input.groupId}`,
    operation: "group user add POST",
  });
}
