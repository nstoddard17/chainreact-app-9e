import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — trello:add_label_to_card (destructiveSafe, archive -> left artifact).
 *
 *   setup    create_card        -> capture { cardId } (marker-seed card on a smoke list)
 *   execute  add_label_to_card  -> apply a board label to the card
 *   verify   card (SMOKE READ-BACK) -> GET the card and assert BOTH the marker on
 *            its `name` (this is OUR card) AND that `idLabels` CONTAINS the applied
 *            label id. This reads the PERSISTED card via the smoke-only seam — it
 *            does NOT trust the add-label POST echo, so input echo can never
 *            satisfy verification (membership proven independently).
 *   cleanup  archive_card -> archive exactly the ledger-created card (reversible)
 *
 * Trello has no user-facing get-card action, so verification uses the smoke-only
 * read-back seam (cardsGet). The label id comes from env (a default board label,
 * auto-discovered by the dev test); the seed list from env too.
 */
export default defineWriteSmokeFixture({
  provider: "trello",
  action: "add_label_to_card",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    cardId: "{{ledger.card.id}}",
    labelId: "{{env.SMOKE_TRELLO_LABEL_ID}}",
  },
  requiredEnv: ["SMOKE_TRELLO_CONNECTED", "SMOKE_TRELLO_LIST_ID", "SMOKE_TRELLO_LABEL_ID"],
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
      expectContains: { path: "idLabels", value: "{{env.SMOKE_TRELLO_LABEL_ID}}" },
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
    "PILOT — create card -> add label -> READ-BACK card (smoke-only seam) asserts " +
    "marker on name + label id in idLabels -> archive card. Membership verified " +
    "independently, not via input echo. destructiveSafe — write + destructive gates.",
});
