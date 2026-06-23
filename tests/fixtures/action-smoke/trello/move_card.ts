import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — trello:move_card (destructiveSafe, archive -> left artifact).
 *
 *   setup    create_card  -> capture { cardId } (marker-seed card on the SOURCE
 *                            smoke list)
 *   execute  move_card    -> move the card to the TARGET smoke list (a distinct
 *                            list on the same smoke board)
 *   verify   card (SMOKE READ-BACK) -> GET the card and assert BOTH the marker on
 *            its `name` (this is OUR card) AND that `idList` now equals the TARGET
 *            list id. Reads the PERSISTED card via the smoke-only seam — it does
 *            NOT trust the move_card response, so input echo can never satisfy
 *            verification (the move is proven independently).
 *   cleanup  archive_card -> archive exactly the ledger-created card (reversible)
 *
 * Both list ids come from env: SMOKE_TRELLO_LIST_ID (source) is the discovered
 * smoke-named list; SMOKE_TRELLO_TARGET_LIST_ID (destination) is a second safe
 * list on the same smoke board (auto-discovered by the dev test, else pinned).
 * When no distinct safe destination exists the run is BLOCKED_ENV, never a move.
 */
export default defineWriteSmokeFixture({
  provider: "trello",
  action: "move_card",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    cardId: "{{ledger.card.id}}",
    idList: "{{env.SMOKE_TRELLO_TARGET_LIST_ID}}",
  },
  requiredEnv: [
    "SMOKE_TRELLO_CONNECTED",
    "SMOKE_TRELLO_LIST_ID",
    "SMOKE_TRELLO_TARGET_LIST_ID",
  ],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "trello",
        action: "create_card",
        config: { name: "{{smokeMarker}}seed", listId: "{{env.SMOKE_TRELLO_LIST_ID}}" },
        captureResource: { resourceKey: "card", idPath: "cardId", kind: "card" },
      },
    ],
    // Independent read-back via the smoke-only seam (Trello has no get-card action).
    verify: {
      provider: "trello",
      action: "card",
      config: { cardId: "{{ledger.card.id}}" },
      markerPath: "name",
      expectEquals: { path: "idList", value: "{{env.SMOKE_TRELLO_TARGET_LIST_ID}}" },
      smokeRead: true,
    },
    cleanupKind: "archive",
    cleanup: {
      provider: "trello",
      action: "archive_card",
      config: { cardId: "{{ledger.card.id}}", closed: true },
    },
  },
  notes:
    "PILOT — create card on source list -> move to target list -> READ-BACK card " +
    "(smoke-only seam) asserts marker on name + idList == target -> archive card. " +
    "Move verified independently, not via input echo. destructiveSafe.",
});
