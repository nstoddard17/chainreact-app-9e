import { mondayRequest } from "./_request";

/**
 * Wrapper for Monday GraphQL `create_group` — Slice 3.MONDAY-4.
 *
 * Adds a group to a board. Monday's `create_group` arg is `group_name`
 * (maps to the group's title); `group_color` is optional.
 *
 * Mutation arguments:
 *   - `board_id: ID!` — required.
 *   - `group_name: String!` — required (becomes the group title).
 *   - `group_color: String` — optional.
 *
 * Returned shape: `{ id, title, color }`.
 */

export interface GroupsCreateInput {
  accessToken: string;
  boardId: string;
  groupTitle: string;
  color?: string;
}

export interface GroupsCreateOutput {
  id: string;
  title: string | null;
  color: string | null;
}

const MUTATION_WITH_COLOR = `
  mutation($boardId: ID!, $groupName: String!, $groupColor: String!) {
    create_group(board_id: $boardId, group_name: $groupName, group_color: $groupColor) {
      id
      title
      color
    }
  }
`;

const MUTATION_WITHOUT_COLOR = `
  mutation($boardId: ID!, $groupName: String!) {
    create_group(board_id: $boardId, group_name: $groupName) {
      id
      title
      color
    }
  }
`;

export async function groupsCreate(
  input: GroupsCreateInput,
): Promise<GroupsCreateOutput> {
  const hasColor = input.color !== undefined && input.color.length > 0;
  const variables: Record<string, unknown> = {
    boardId: input.boardId,
    groupName: input.groupTitle,
  };
  if (hasColor) variables.groupColor = input.color;
  const data = await mondayRequest<{ create_group: GroupsCreateOutput }>({
    accessToken: input.accessToken,
    query: hasColor ? MUTATION_WITH_COLOR : MUTATION_WITHOUT_COLOR,
    variables,
  });
  return data.create_group;
}
