import { mondayRequest } from "./_request";

/**
 * Wrapper for Monday GraphQL `boards(ids: $boardId) { groups { id title } }` —
 * Slice 3.MONDAY-3 (options resolver layer).
 *
 * Reads the groups of a single board. Used by the `monday:groups`
 * options resolver to back the `groupId` cascade picker on `create_item`
 * / `move_item` action metas (MONDAY-4).
 *
 * Returned shape: array of `{id, title}`. Empty array when the board
 * exists but has no groups, OR when the board id is invalid / no
 * access (Monday tends to return an empty `boards` array rather than
 * a hard error in that case — the resolver handles the empty cascade).
 */

export interface GroupsListInput {
  accessToken: string;
  boardId: string;
}

export interface MondayGroupSummary {
  id: string;
  title: string | null;
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
