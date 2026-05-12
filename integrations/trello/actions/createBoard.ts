import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { boardsCreate } from "../api/boards";
import { CreateBoardConfigSchema } from "./createBoard.schema";

/**
 * Trello `create_board` action handler — Slice 17 Commit 4.
 *
 * POST /1/boards. Visibility is EXPLICIT (required) at the schema
 * layer — V1's silent `"private"` default is intentionally NOT
 * replicated (Q11).
 *
 * Output: identifying fields + the chosen visibility echoed back from
 * Trello's response. Useful for chained `create_list` / `create_card`
 * calls — `{{nodeId.boardId}}` is the typical reference.
 */
export const createBoard: ActionHandler = async (input) => {
  const config = CreateBoardConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "trello"
      ? input.triggerEvent.accountId
      : null;

  const board = await refreshAndRetry({
    userId: input.userId,
    provider: "trello",
    accountId,
    apiCall: (accessToken) =>
      boardsCreate({
        accessToken,
        name: config.name,
        desc: config.desc,
        visibility: config.visibility,
        defaultLists: config.defaultLists,
      }),
  });

  // Trello echoes the chosen visibility under prefs.permissionLevel —
  // surface it as the V2 user-facing label (`workspace` instead of
  // Trello's wire value `org`) for symmetry with the input.
  const echoedWirePref = (
    board.prefs as { permissionLevel?: string } | undefined
  )?.permissionLevel;
  const echoedVisibility =
    echoedWirePref === "org"
      ? "workspace"
      : echoedWirePref === "private" || echoedWirePref === "public"
        ? echoedWirePref
        : config.visibility;

  return {
    output: {
      boardId: board.id,
      name: board.name,
      desc: board.desc ?? null,
      url: board.url ?? null,
      shortUrl: board.shortUrl ?? null,
      closed: board.closed ?? null,
      idOrganization: board.idOrganization ?? null,
      visibility: echoedVisibility,
    },
  };
};
