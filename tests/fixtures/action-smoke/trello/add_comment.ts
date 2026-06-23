import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — trello:add_comment (destructiveSafe, archive -> left artifact).
 *
 *   setup    create_card  -> capture { cardId } (marker-seed card on a smoke list)
 *   execute  add_comment  -> comment on the card; text is the unique marker
 *   verify   card_comments (SMOKE READ-BACK) -> GET the card's comment actions and
 *            confirm the marker in the PROVIDER-returned comment text. This does
 *            NOT use the add_comment response (whose text is provider-confirmed but
 *            an echo of the same call) — it independently reads the persisted
 *            comments, so input echo can never satisfy verification.
 *   cleanup  archive_card -> archive exactly the ledger-created card (reversible)
 *
 * Trello has no user-facing "read card comments" action, so verification uses the
 * smoke-only read-back seam (cardsListComments) rather than a registered action.
 */
export default defineWriteSmokeFixture({
  provider: "trello",
  action: "add_comment",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    cardId: "{{ledger.card.id}}",
    text: "{{smokeMarker}}comment",
  },
  requiredEnv: ["SMOKE_TRELLO_CONNECTED", "SMOKE_TRELLO_LIST_ID"],
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
    // Independent read-back via the smoke-only seam (no Trello comment read action).
    verify: {
      provider: "trello",
      action: "card_comments",
      config: { cardId: "{{ledger.card.id}}" },
      markerPath: "comments",
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
    "PILOT — create card -> comment (marker) -> READ-BACK comments (smoke-only seam) " +
    "-> archive card. Verifies provider-persisted comment text, not the input.",
});
