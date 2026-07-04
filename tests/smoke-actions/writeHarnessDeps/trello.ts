/**
 * Write smoke harness deps — Trello discovery + read-back seams.
 *
 * Extracted from writeHarnessDeps.ts (structure-only split; behavior unchanged).
 * Discovery delegates to the read-only option resolvers (already refresh-wrapped);
 * the card read-backs run through `refreshAndRetry` (seam-refresh-guard.test.ts).
 */
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { getOptionsResolver } from "@/services/options/_registry";
import { cardsGet, cardsListComments } from "@/integrations/trello/api/cards";
import { boardsList } from "@/integrations/trello/api/boardsList";
import { listsList } from "@/integrations/trello/api/listsList";
import {
  pickSecondSmokeList,
  pickSmokeSafeTarget,
  type ChosenTrelloSecondList,
  type ChosenTrelloTarget,
  type TrelloListCandidate,
  type TrelloMoveListCandidate,
} from "../writeTargets";
import type { StepRunOutcome } from "../writeHarness";
import type { SmokeReaderContext, SmokeReaderInput } from "./context";

/**
 * Discover an EXPLICITLY smoke-safe Trello list (a board AND list both named for
 * smoke/test use) via the read-only board/list option resolvers, then the pure
 * `pickSmokeSafeTarget`. READ-ONLY (only list resolvers run — never a mutation).
 * Returns the chosen target (id + safe LABELS) or null. The list id is for the
 * env overlay only; only labels are safe to log.
 */
export async function discoverTrelloSmokeTarget(
  accountId: string,
  userId: string,
): Promise<ChosenTrelloTarget | null> {
  const integration = await getActiveForExecution(accountId, "trello", null, {
    connectedByUserId: userId,
  });
  if (!integration) return null;
  const boardsR = getOptionsResolver("trello:boards");
  const listsR = getOptionsResolver("trello:lists");
  if (!boardsR || !listsR) return null;

  const boards = await boardsR.resolve({ userId, integration, q: "", deps: {} });
  const candidates: TrelloListCandidate[] = [];
  for (const b of boards.items) {
    const boardLabel = b.label ?? "";
    // Only descend into boards that already look smoke-safe (read-only, bounded).
    if (!/smoke|test|chainreact/i.test(boardLabel)) continue;
    const lists = await listsR.resolve({ userId, integration, q: "", deps: { boardId: b.value } });
    for (const l of lists.items) {
      candidates.push({ boardId: b.value, boardLabel, listId: l.value, listLabel: l.label ?? "" });
    }
  }
  return pickSmokeSafeTarget(candidates);
}

/**
 * Discover a safe SECOND Trello list (a MOVE destination for `move_card`) on the
 * SAME smoke board as the source list, via the read-only `trello:lists` resolver +
 * the pure `pickSecondSmokeList`. Lists ONLY on the explicitly smoke/test-named
 * source board are considered (the caller already proved the board is smoke-safe),
 * the source list is excluded, and the destination name must match the move-target
 * allow-list. Returns the chosen list (id + safe label) or null -> the caller
 * reports BLOCKED_ENV and asks for SMOKE_TRELLO_TARGET_LIST_ID. READ-ONLY.
 */
export async function discoverTrelloSecondSmokeList(
  accountId: string,
  userId: string,
  sourceBoardId: string,
  sourceListId: string,
): Promise<ChosenTrelloSecondList | null> {
  const integration = await getActiveForExecution(accountId, "trello", null, {
    connectedByUserId: userId,
  });
  if (!integration) return null;
  const listsR = getOptionsResolver("trello:lists");
  if (!listsR) return null;
  const lists = await listsR.resolve({ userId, integration, q: "", deps: { boardId: sourceBoardId } });
  const candidates: TrelloMoveListCandidate[] = lists.items.map((l) => ({
    listId: l.value,
    listLabel: l.label ?? "",
  }));
  return pickSecondSmokeList(candidates, sourceListId);
}

/**
 * Discover a Trello label id on a smoke board for `add_label_to_card` via the
 * read-only `trello:labels` resolver. Trello boards ship 6 default color labels,
 * so this resolves on any board. Returns the first label's id (env-overlay only)
 * + a safe label for the report, or null when the board has no labels. READ-ONLY.
 */
export async function discoverTrelloSmokeLabel(
  accountId: string,
  userId: string,
  boardId: string,
): Promise<{ labelId: string; label: string } | null> {
  const integration = await getActiveForExecution(accountId, "trello", null, {
    connectedByUserId: userId,
  });
  if (!integration) return null;
  const labelsR = getOptionsResolver("trello:labels");
  if (!labelsR) return null;
  const labels = await labelsR.resolve({ userId, integration, q: "", deps: { boardId } });
  const chosen = labels.items[0];
  if (!chosen) return null;
  return { labelId: chosen.value, label: chosen.label ?? chosen.value };
}

/**
 * Smoke read-back: `trello:card_comments` (comment text/ids) + `trello:card`
 * (membership/state fields). Returns null for any other (provider, action).
 */
export async function trelloSmokeReadBack(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome | null> {
  if (input.provider !== "trello") return null;

  if (input.action === "card_comments") {
    const integration = await getActiveForExecution(ctx.accountId, "trello", null, {
      connectedByUserId: ctx.userId,
    });
    if (!integration) return { ok: false, output: null, reason: "trello not connected" };
    const cardId = input.config.cardId;
    if (typeof cardId !== "string" || cardId.length === 0) {
      return { ok: false, output: null, reason: "card_comments read-back: missing cardId" };
    }
    // refreshAndRetry mirrors the Trello handlers + resolvers. Trello is
    // non-refreshable (long-lived tokens) so this is a no-op on success today,
    // but keeps every smoke read on the SAME refresh path as the handlers.
    const actions = await refreshAndRetry({
      accountId: ctx.accountId,
      provider: "trello",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) => cardsListComments({ accessToken, cardId, limit: 20 }),
    });
    // Bounded mapping — provider-confirmed comment text + ids only.
    const comments = actions.map((a) => ({
      commentId: a.id,
      text: a.data?.text ?? null,
      date: a.date ?? null,
    }));
    return { ok: true, output: { comments }, reason: null };
  }

  if (input.action === "card") {
    const integration = await getActiveForExecution(ctx.accountId, "trello", null, {
      connectedByUserId: ctx.userId,
    });
    if (!integration) return { ok: false, output: null, reason: "trello not connected" };
    const cardId = input.config.cardId;
    if (typeof cardId !== "string" || cardId.length === 0) {
      return { ok: false, output: null, reason: "card read-back: missing cardId" };
    }
    const card = await refreshAndRetry({
      accountId: ctx.accountId,
      provider: "trello",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) => cardsGet({ accessToken, cardId }),
    });
    // Bounded mapping — only the membership/state fields verification reads.
    return {
      ok: true,
      output: {
        cardId: card.id,
        name: card.name,
        idList: card.idList ?? null,
        idLabels: card.idLabels ?? [],
        idMembers: card.idMembers ?? [],
        closed: card.closed ?? false,
      },
      reason: null,
    };
  }

  if (input.action === "member_boards") {
    // create_board's independent read-back: the member's board list (id/name/closed
    // only — the same fields the boardsList wrapper masks to). markerPath "boards"
    // proves the marker-named smoke board is PERSISTED, never the create echo.
    const integration = await getActiveForExecution(ctx.accountId, "trello", null, {
      connectedByUserId: ctx.userId,
    });
    if (!integration) return { ok: false, output: null, reason: "trello not connected" };
    const boards = await refreshAndRetry({
      accountId: ctx.accountId,
      provider: "trello",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) => boardsList({ accessToken }),
    });
    return {
      ok: true,
      output: {
        boards: boards.map((b) => ({ name: b.name, closed: b.closed ?? false })),
        count: boards.length,
      },
      reason: null,
    };
  }

  if (input.action === "board_lists") {
    // create_list's independent read-back: one board's lists (name/closed only).
    const integration = await getActiveForExecution(ctx.accountId, "trello", null, {
      connectedByUserId: ctx.userId,
    });
    if (!integration) return { ok: false, output: null, reason: "trello not connected" };
    const boardId = input.config.boardId;
    if (typeof boardId !== "string" || boardId.length === 0) {
      return { ok: false, output: null, reason: "board_lists read-back: missing boardId" };
    }
    const lists = await refreshAndRetry({
      accountId: ctx.accountId,
      provider: "trello",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) => listsList({ accessToken, boardId }),
    });
    return {
      ok: true,
      output: {
        lists: lists.map((l) => ({ name: l.name, closed: l.closed ?? false })),
        count: lists.length,
      },
      reason: null,
    };
  }

  return null;
}
