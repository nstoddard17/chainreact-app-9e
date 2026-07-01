/**
 * Write smoke harness deps — Monday discovery seam.
 *
 * Monday verifies via registered read actions (`get_item`) and cleans up via the
 * registered destructive action (`delete_item`), so there is no Monday smoke
 * read-back here — only target discovery (a safe smoke board + a usable group for
 * `create_item`). Board/group reads run through the SAME `monday:boards` /
 * `monday:groups` option resolvers the builder's dropdowns use (which already wrap
 * the underlying GraphQL in `refreshAndRetry`), so this discovery can never drift
 * onto a raw, refresh-unguarded transport.
 *
 * Connection is NOT derived from a SMOKE_MONDAY_CONNECTED env: the dev test proves
 * connection from the DB integration row via `probeWriteConnection`. Marcus
 * confirmed the connected Monday account is a dedicated throwaway, so the board may
 * be auto-discovered; the created item is smoke-marked and removed via the
 * registered `delete_item` (never a bespoke transport, never a pre-existing item).
 */
import { getActiveForExecution } from "@/repositories/integrations";
import { getOptionsResolver } from "@/services/options/_registry";
import {
  pickMondaySecondGroup,
  pickMondaySmokeBoard,
  pickMondaySmokeGroup,
  type ChosenMondayTarget,
  type MondayBoardLite,
  type MondayGroupLite,
} from "../writeTargets";

/**
 * Discover a safe smoke Monday BOARD + a usable GROUP for `create_item`, via the
 * read-only `monday:boards` and `monday:groups` resolvers. When `pinnedBoardId`
 * (SMOKE_MONDAY_BOARD_ID) is set, that exact board is used; else a
 * smoke/test/chainreact-named board is preferred, falling back to the first board
 * on the throwaway account. The first usable group on the chosen board is taken.
 * Returns the board id + group id (env-overlay only) + their labels for the
 * report, or null -> caller reports BLOCKED_ENV (no board, or board lacks a group).
 * READ-ONLY (only the board/group list resolvers run — never a mutation).
 */
export async function discoverMondaySmokeBoardGroup(
  accountId: string,
  userId: string,
  pinnedBoardId?: string | null,
): Promise<ChosenMondayTarget | null> {
  const integration = await getActiveForExecution(accountId, "monday", null);
  if (!integration) return null;

  const boardsR = getOptionsResolver("monday:boards");
  if (!boardsR) return null;
  const boards = await boardsR.resolve({ userId, integration, q: "", deps: {} });
  const boardCandidates: MondayBoardLite[] = boards.items.map((b) => ({
    id: b.value,
    label: b.label ?? b.value,
  }));
  const board = pickMondaySmokeBoard(boardCandidates, pinnedBoardId);
  if (!board) return null;

  const groupsR = getOptionsResolver("monday:groups");
  if (!groupsR) return null;
  const groups = await groupsR.resolve({
    userId,
    integration,
    q: "",
    deps: { boardId: board.id },
  });
  const groupCandidates: MondayGroupLite[] = groups.items.map((g) => ({
    id: g.value,
    label: g.label ?? g.value,
  }));
  const group = pickMondaySmokeGroup(groupCandidates);
  if (!group) return null;

  // A second distinct group (the move_item destination) when the board has one.
  const secondGroup = pickMondaySecondGroup(groupCandidates, group.id);

  return {
    boardId: board.id,
    boardLabel: board.label,
    groupId: group.id,
    groupLabel: group.label,
    ...(secondGroup
      ? { targetGroupId: secondGroup.id, targetGroupLabel: secondGroup.label }
      : {}),
  };
}
