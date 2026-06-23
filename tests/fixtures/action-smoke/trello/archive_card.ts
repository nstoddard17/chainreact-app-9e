import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — trello:archive_card (destructiveSafe, archive -> left artifact).
 *
 * archive_card is exercised today only as the CLEANUP step of the other Trello
 * pilots — nothing verifies it actually flips `closed`. This certifies the action
 * itself and proves the state change INDEPENDENTLY.
 *
 *   setup    create_card  -> capture { cardId } (marker-seed card on a smoke list)
 *   execute  archive_card -> archive exactly the ledger-created card (closed:true)
 *   verify   card (SMOKE READ-BACK) -> GET the card and assert BOTH the marker on
 *            its `name` (this is OUR card) AND `closed == true`. The action's own
 *            output coerces `closed ?? null`, so the flag is only trustworthy via
 *            an INDEPENDENT cardsGet read-back.
 *   (no cleanup)            the EXECUTE step IS the disposition — the card is
 *            archived (reversible: unarchive with closed:false). The run leaves a
 *            harmless archived smoke card (artifact "left"), NOT a harmful leak.
 *
 * Source list auto-discovered by the dev test (smoke/test-named board+list).
 */
export default defineWriteSmokeFixture({
  provider: "trello",
  action: "archive_card",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    cardId: "{{ledger.card.id}}",
    closed: true,
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
    // Independent read-back via the smoke-only seam (Trello has no get-card action).
    verify: {
      provider: "trello",
      action: "card",
      config: { cardId: "{{ledger.card.id}}" },
      markerPath: "name",
      expectEquals: { path: "closed", value: true },
      smokeRead: true,
    },
    // No cleanup: the card is archived by the execute step (reversible). Leaves a
    // harmless archived smoke card; verifies the archive STATE independently.
  },
  notes:
    "PILOT — create card -> archive -> READ-BACK card (smoke-only seam) asserts " +
    "marker on name + closed==true. No cleanup (archived by execute, reversible). " +
    "Leaves a harmless archived card. destructiveSafe.",
});
