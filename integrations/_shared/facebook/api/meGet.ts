import { graphRequest } from "./_request";

/**
 * Facebook `GET /me` — Slice 3.FACEBOOK-2. Resolves the connected user's
 * identity at OAuth callback time. `id` is the app-scoped user id used as
 * `providerAccountId`.
 */
export interface FacebookMe {
  id: string;
  name?: string;
  email?: string;
}

export async function meGet(input: {
  accessToken: string;
}): Promise<FacebookMe> {
  return graphRequest<FacebookMe>({
    accessToken: input.accessToken,
    path: "/me",
    query: { fields: "id,name,email" },
  });
}
