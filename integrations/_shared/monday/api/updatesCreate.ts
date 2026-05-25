import { mondayRequest } from "./_request";

/**
 * Wrapper for Monday GraphQL `create_update` — Slice 3.MONDAY-2.
 *
 * Posts a comment / update to an existing item. Monday calls these
 * "updates" — they're the equivalent of comments on the item's
 * activity feed.
 *
 * Mutation arguments:
 *   - `item_id: ID!` — required.
 *   - `body: String!` — required. Plain text or limited HTML
 *     (Monday accepts `<a>`, `<b>`, `<i>`, etc; full HTML behavior is
 *     out of scope for V2 v1).
 *
 * Returned shape: `{ id }`. V1 deliberately requests only `id` to
 * avoid the elevated `updates:read` permission requirement for
 * `created_at` / `body` echo fields under some account configurations.
 * The handler synthesizes `createdAt = new Date().toISOString()` and
 * echoes `itemId` + `body` from the input.
 */

export interface UpdatesCreateInput {
  accessToken: string;
  itemId: string;
  body: string;
}

export interface UpdatesCreateOutput {
  id: string;
}

const MUTATION = `
  mutation($itemId: ID!, $body: String!) {
    create_update(item_id: $itemId, body: $body) {
      id
    }
  }
`;

export async function updatesCreate(
  input: UpdatesCreateInput,
): Promise<UpdatesCreateOutput> {
  const data = await mondayRequest<{ create_update: UpdatesCreateOutput }>({
    accessToken: input.accessToken,
    query: MUTATION,
    variables: { itemId: input.itemId, body: input.body },
  });
  return data.create_update;
}
