import { trelloRequest } from "./_request";

/**
 * Trello Boards API wrappers — Slice 17 Commit 4.
 *
 * Endpoints:
 *   - `boardsCreate` — POST /1/boards
 *
 * V1 had a heavy template-expansion branch (Kanban / Agile / Weekly
 * Planner with hardcoded lists + sample cards). V2 ships only the
 * primitive: create the board. Workflow authors can chain `create_list`
 * + `create_card` to seed content explicitly — keeps the action surface
 * small and avoids V1's hidden opinionated defaults.
 */

export interface TrelloBoard {
  id: string;
  name: string;
  desc?: string | null;
  url?: string;
  shortUrl?: string;
  closed?: boolean;
  idOrganization?: string | null;
  prefs?: Readonly<Record<string, unknown>>;
}

/**
 * Visibility model — Trello's `prefs_permissionLevel` wire value:
 *   - `private`    → visible only to board members.
 *   - `workspace`  → visible to anyone in the linked Trello workspace
 *                    (sent as `"org"` over the wire; V1 used `workspace`
 *                    as the user-facing label).
 *   - `public`     → visible to anyone with the URL.
 *
 * V1 silently defaulted to `"private"` when `visibility` was omitted.
 * V2 makes this an EXPLICIT required field — see
 * `createBoard.schema.ts`'s Q11 rationale. The schema accepts the three
 * user-facing values; the wrapper maps them to Trello's wire shape.
 */
export type TrelloBoardVisibility = "private" | "workspace" | "public";

export interface BoardsCreateInput {
  accessToken: string;
  /** Board title. */
  name: string;
  /** Optional Markdown description. */
  desc?: string;
  /**
   * Explicit visibility — REQUIRED at the handler layer. V1's hidden
   * `"private"` default is intentionally not replicated.
   */
  visibility: TrelloBoardVisibility;
  /**
   * When true, Trello creates the default "To Do / Doing / Done" lists.
   * V2 defaults to `false` so workflows compose explicit lists via
   * `create_list` — no hidden seed content.
   */
  defaultLists?: boolean;
}

/**
 * Maps V2's user-facing visibility enum to Trello's wire-format value.
 *   private    → "private"
 *   workspace  → "org"
 *   public     → "public"
 */
export function visibilityToTrelloPref(
  v: TrelloBoardVisibility,
): "private" | "org" | "public" {
  if (v === "workspace") return "org";
  return v;
}

export async function boardsCreate(
  input: BoardsCreateInput,
): Promise<TrelloBoard> {
  const body: Record<string, unknown> = {
    name: input.name,
    defaultLists: input.defaultLists ?? false,
    prefs_permissionLevel: visibilityToTrelloPref(input.visibility),
  };
  if (input.desc !== undefined) body.desc = input.desc;

  return trelloRequest<TrelloBoard>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/1/boards",
    body,
    resourceForNotFound: "boards",
  });
}
