import { powerbiFetch } from "../_base";
import type {
  PowerBiGroupUserAccessRight,
  PowerBiPrincipalType,
} from "./groupUserAdd";

/**
 * Wrapper for Power BI `PUT /v1.0/myorg/groups/{groupId}/users`
 * (Update Group User). Scope: `Workspace.ReadWrite.All`.
 *
 * Same body semantics as Add Group User (verified in the groups
 * operation index as "same body"): the principal is addressed by
 * `emailAddress` (User) or `identifier` (Group / App), and
 * `groupUserAccessRight` carries the NEW role.
 */

export interface GroupUserUpdateInput {
  accessToken: string;
  groupId: string;
  accessRight: PowerBiGroupUserAccessRight;
  principalType: PowerBiPrincipalType;
  /** Email / UPN — User principals. */
  emailAddress?: string;
  /** Entra object id — Group / App principals. */
  identifier?: string;
}

export async function groupUserUpdate(
  input: GroupUserUpdateInput,
): Promise<void> {
  const body: Record<string, string> = {
    groupUserAccessRight: input.accessRight,
    principalType: input.principalType,
  };
  if (input.emailAddress !== undefined) body.emailAddress = input.emailAddress;
  if (input.identifier !== undefined) body.identifier = input.identifier;

  await powerbiFetch({
    accessToken: input.accessToken,
    method: "PUT",
    path: `/groups/${encodeURIComponent(input.groupId)}/users`,
    body,
    notFoundResource: `workspace ${input.groupId}`,
    operation: "group user update PUT",
  });
}
