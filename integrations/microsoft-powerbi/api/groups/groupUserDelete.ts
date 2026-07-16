import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `DELETE /v1.0/myorg/groups/{groupId}/users/{user}`
 * (Delete User In Group). Scope: `Workspace.ReadWrite.All`.
 *
 * `{user}` is the principal's email/UPN or Entra object id — exactly the
 * string Get Group Users returns for the row (URL-encoded here).
 *
 * `notFoundResource` stays generic ("workspace user") — the identifier
 * can be an email address and must not leak into error surfaces.
 */

export interface GroupUserDeleteInput {
  accessToken: string;
  groupId: string;
  /** Email/UPN or Entra object id, verbatim from Get Group Users. */
  userIdentifier: string;
}

export async function groupUserDelete(
  input: GroupUserDeleteInput,
): Promise<void> {
  await powerbiFetch({
    accessToken: input.accessToken,
    method: "DELETE",
    path: `/groups/${encodeURIComponent(input.groupId)}/users/${encodeURIComponent(
      input.userIdentifier,
    )}`,
    notFoundResource: "workspace user",
    operation: "group user delete DELETE",
  });
}
