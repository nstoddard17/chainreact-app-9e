import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — trello:update_card (destructiveSafe, archive cleanup -> left artifact).
 *
 *   setup    create_card  -> capture { cardId } into ledger key "card" (marker-seed)
 *   execute  update_card  -> rename the card to the marker-"updated" value
 *   verify   marker echo on the update output's name
 *   cleanup  archive_card -> archive exactly that card (reversible; card persists)
 *
 * Operates ONLY on a card THIS run created. The smoke list comes from
 * SMOKE_TRELLO_LIST_ID (auto-discovered to a smoke/test-named board+list by the
 * dev test). NOT registered in the read runner; runs via the write harness.
 */
export default defineWriteSmokeFixture({
  provider: "trello",
  action: "update_card",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    cardId: "{{ledger.card.id}}",
    name: "{{smokeMarker}}updated",
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
    markerEchoPath: "name",
    cleanupKind: "archive",
    cleanup: {
      provider: "trello",
      action: "archive_card",
      config: { cardId: "{{ledger.card.id}}", closed: true },
    },
  },
  notes:
    "PILOT — create -> update -> verify -> archive a throwaway card on a smoke list. " +
    "destructiveSafe; archive cleanup leaves a harmless archived card.",
});
