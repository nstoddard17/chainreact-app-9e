import { mondayRequest } from "./_request";

/**
 * Wrapper for Monday GraphQL
 * `boards(ids: $boardId) { groups { id title color position archived } }` —
 * Slice 3.MONDAY-3 (options resolver layer) + Slice 3.MONDAY-4
 * (`list_groups` action).
 *
 * Reads the groups of a single board. Two consumers:
 *   - `monday:groups` options resolver (MONDAY-3) — maps only id/title.
 *   - `list_groups` action (MONDAY-4) — surfaces the full group shape.
 * MONDAY-4 extended the selection set with `color` / `position` /
 * `archived` (all optional on the return type so the MONDAY-3 resolver
 * + its tests, which only read id/title, are unaffected). This keeps a
 * single wrapper rather than a near-duplicate `boards(ids){groups}`
 * query.
 *
 * Returned shape: array of `{id, title, color?, position?, archived?}`.
 * Empty array when the board exists but has no groups, OR when the board
 * id is invalid / no access (Monday tends to return an empty `boards`
 * array rather than a hard error in that case — the resolver handles
 * the empty cascade).
 */

export interface GroupsListInput {
  accessToken: string;
  boardId: string;
}

export interface MondayGroupSummary {
  id: string;
  title: string | null;
  /** Group color hex/name — present in the MONDAY-4 selection set. */
  color?: string | null;
  /** Group ordering position string. */
  position?: string | null;
  /** Whether the group is archived. */
  archived?: boolean | null;
}

export interface GroupsListOutput {
  groups: MondayGroupSummary[];
  /** True when the board id resolved (helps callers distinguish
   * "board exists but empty" from "board missing"). */
  boardFound: boolean;
}

const QUERY = `
  query($boardId: ID!) {
    boards(ids: [$boardId]) {
      id
      groups {
        id
        title
        color
        position
        archived
      }
    }
  }
`;

interface QueryData {
  boards:
    | Array<{
        id: string;
        groups: MondayGroupSummary[] | null;
      }>
    | null;
}

export async function groupsList(
  input: GroupsListInput,
): Promise<GroupsListOutput> {
  const data = await mondayRequest<QueryData>({
    accessToken: input.accessToken,
    query: QUERY,
    variables: { boardId: input.boardId },
  });
  const board = data.boards && data.boards.length > 0 ? data.boards[0]! : null;
  return {
    groups: board?.groups ?? [],
    boardFound: board !== null,
  };
}
