import { mondayRequest } from "./_request";

/**
 * Wrapper for Monday GraphQL `users(...)` — Slice 3.MONDAY-2.
 *
 * Lists workspace users. The `kind` filter (all / non_guests / guests /
 * non_pending) gates the result set; defaults to "all" via the variant
 * query with no kind arg.
 *
 * Note: Monday's `users` field does NOT support cursor pagination —
 * it's a simple `limit`-bounded list. Callers wanting more than the
 * default limit just bump `limit` up to the API cap (100).
 *
 * Returned shape: array of users with the V1-canonical field set.
 */

export type MondayUserKind =
  | "all"
  | "non_guests"
  | "guests"
  | "non_pending";

export interface UsersListInput {
  accessToken: string;
  /** 1..100. Default 25. */
  limit?: number;
  /** `"all"` (default) omits the `kind` arg so Monday returns all users. */
  kind?: MondayUserKind;
}

export interface MondayUserSummary {
  id: string;
  name: string | null;
  email: string | null;
  title: string | null;
  photo_original: string | null;
  enabled: boolean | null;
  created_at: string | null;
}

export interface UsersListOutput {
  users: MondayUserSummary[];
}

const QUERY_ALL = `
  query($limit: Int!) {
    users(limit: $limit) {
      id
      name
      email
      title
      photo_original
      enabled
      created_at
    }
  }
`;

const QUERY_WITH_KIND = `
  query($limit: Int!, $kind: UserKind!) {
    users(limit: $limit, kind: $kind) {
      id
      name
      email
      title
      photo_original
      enabled
      created_at
    }
  }
`;

export async function usersList(
  input: UsersListInput,
): Promise<UsersListOutput> {
  const limit = input.limit ?? 25;
  const kind = input.kind ?? "all";
  const useKind = kind !== "all";
  const data = await mondayRequest<{ users: MondayUserSummary[] | null }>({
    accessToken: input.accessToken,
    query: useKind ? QUERY_WITH_KIND : QUERY_ALL,
    variables: useKind ? { limit, kind } : { limit },
  });
  return { users: data.users ?? [] };
}
