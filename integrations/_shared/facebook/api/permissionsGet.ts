import { graphRequest } from "./_request";

/**
 * Facebook `GET /me/permissions` — Slice 3.FACEBOOK-2. Used at OAuth
 * callback time to capture the GRANTED permissions (Facebook's token
 * exchange response does NOT include a `scope` field, so this is the only
 * way to record what the user actually granted vs declined).
 */
export interface FacebookPermission {
  permission: string;
  status: "granted" | "declined" | "expired";
}
export interface FacebookPermissionsResult {
  data: FacebookPermission[];
}

export async function permissionsGet(input: {
  accessToken: string;
}): Promise<FacebookPermissionsResult> {
  return graphRequest<FacebookPermissionsResult>({
    accessToken: input.accessToken,
    path: "/me/permissions",
  });
}
