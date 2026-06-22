import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — trello:create_card (destructiveSafe).
 *
 * Card create + archive is a clean reversible pair on a throwaway board/list.
 * Trello has no `delete_card`; `archive_card` (closed:true) is the reversible
 * cleanup (unarchive with closed:false).
 *
 *   execute  create_card  -> capture { cardId } into ledger key "card"
 *   cleanup  archive_card -> archive exactly the created card (reversible)
 *
 * verify is omitted (a get_card read action would be the natural verify once it
 * exists). Card name carries the run marker. Targets a DEDICATED smoke list
 * (SMOKE_TRELLO_LIST_ID). NOT registered in ALL_SMOKE_FIXTURES and NOT run live
 * this slice.
 */
export default defineWriteSmokeFixture({
  provider: "trello",
  action: "create_card",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    name: "{{smokeMarker}}pilot",
    // listId overlaid from env at run time.
  },
  configFromEnv: { listId: "SMOKE_TRELLO_LIST_ID" },
  requiredEnv: ["SMOKE_TRELLO_CONNECTED", "SMOKE_TRELLO_LIST_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "card", idPath: "cardId", kind: "card" },
    // create_card echoes the card name; confirm the unique marker round-tripped
    // (Trello has no get_card read action to verify against).
    markerEchoPath: "name",
    cleanup: {
      provider: "trello",
      action: "archive_card",
      config: { cardId: "{{ledger.card.id}}", closed: true },
    },
  },
  notes:
    "PILOT (not registered, not run live): create -> archive a throwaway card on " +
    "a DEDICATED smoke list. archive_card is reversible. destructiveSafe — needs " +
    "the write + destructive gates.",
});
