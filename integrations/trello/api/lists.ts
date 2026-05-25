import { trelloRequest } from "./_request";

/**
 * Trello Lists API wrappers — Slice 17 Commit 4.
 *
 * Endpoints:
 *   - `listsCreate` — POST /1/lists
 *
 * Trello lists belong to a board. Position is optional; defaults to
 * `"bottom"` (Trello's API default).
 */

export interface TrelloList {
  id: string;
  name: string;
  idBoard: string;
  pos?: number;
  closed?: boolean;
}

export interface ListsCreateInput {
  accessToken: string;
  /** Required — list must live in a board. */
  idBoard: string;
  /** List title. */
  name: string;
  /** Position: "top", "bottom", or a numeric pos. */
  pos?: "top" | "bottom" | number;
}

export async function listsCreate(
  input: ListsCreateInput,
): Promise<TrelloList> {
  const body: Record<string, unknown> = {
    idBoard: input.idBoard,
    name: input.name,
  };
  if (input.pos !== undefined) body.pos = input.pos;

  return trelloRequest<TrelloList>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/1/lists",
    body,
    resourceForNotFound: "lists",
  });
}
