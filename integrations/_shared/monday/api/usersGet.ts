import { mondayRequest } from "./_request";

/**
 * Wrapper for Monday GraphQL `users(ids: $userId)` — Slice 3.MONDAY-4.
 *
 * Pure read backing `get_user`: fetch a single Monday user by id,
 * including the account they belong to.
 *
 * Returned shape: single user or null.
 */

export interface UsersGetInput {
  accessToken: string;
  userId: string;
}

export interface MondayUserFull {
  id: string;
  name: string | null;
  email: string | null;
  title: string | null;
  photo_original: string | null;
  enabled: boolean | null;
  created_at: string | null;
  account: { id: string; name: string | null } | null;
}

const QUERY = `
  query($userId: [ID!]) {
    users(ids: $userId) {
      id
      name
      email
      title
      photo_original
      enabled
      created_at
      account { id name }
    }
  }
`;

export async function usersGet(
  input: UsersGetInput,
): Promise<MondayUserFull | null> {
  const data = await mondayRequest<{ users: MondayUserFull[] | null }>({
    accessToken: input.accessToken,
    query: QUERY,
    variables: { userId: [input.userId] },
  });
  return data.users && data.users.length > 0 ? data.users[0]! : null;
}
