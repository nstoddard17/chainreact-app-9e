import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * monday:create_item (destructiveSafe) — first Monday item-tree write.
 *
 * The clean create -> verify -> delete pair on a throwaway Monday board/group:
 *
 *   execute  create_item -> capture { itemId } into ledger key "item"
 *                           (its name carries the unique smoke marker)
 *   verify   get_item    -> INDEPENDENT read-back keyed on {{ledger.item.id}};
 *                           markerPath confirms the marker on the persisted item
 *                           (never the create echo)
 *   cleanup  delete_item -> delete exactly the created item (registered destructive
 *                           action — never a bespoke transport)
 *
 * Connection + target are NOT pinned by the operator:
 *   - Connection is proven from the DB integration row by the dev test
 *     (`probeWriteConnection`) — there is NO SMOKE_MONDAY_CONNECTED requirement.
 *   - `SMOKE_MONDAY_BOARD_ID` / `SMOKE_MONDAY_GROUP_ID` are auto-discovered from the
 *     connected throwaway account by `discoverMondaySmokeBoardGroup` and overlaid at
 *     run time (a pinned SMOKE_MONDAY_BOARD_ID still wins). They appear in
 *     `requiredEnv` only so the orchestrator's target gate reports a clean
 *     BLOCKED_ENV when discovery finds no safe board / no usable group — never a
 *     fake. No `_CONNECTED` var is required (excluded from the target gate anyway).
 *
 * Gating (write harness): liveClass destructiveSafe needs
 * ALLOW_LIVE_PROVIDER_WRITE_SMOKE + ALLOW_DESTRUCTIVE_PROVIDER_SMOKE, plus a
 * connected, execution-usable Monday on the smoke account.
 *
 * Registered in WRITE_SMOKE_FIXTURES (the write runner), NOT the read runner's
 * ALL_SMOKE_FIXTURES.
 */
export default defineWriteSmokeFixture({
  provider: "monday",
  action: "create_item",
  risk: "write",
  // The action under test is a CREATE (write); the destructive delete_item cleanup
  // is gated by liveClass destructiveSafe + the dev test's ALLOW_DESTRUCTIVE gate.
  // Mirrors airtable:create_record / trello:create_card (liveRisk "write").
  liveRisk: "write",
  // The write harness owns its live gating; never liveSafe in the read sense.
  liveSafe: false,
  config: {
    itemName: "{{smokeMarker}}item",
    // boardId / groupId overlaid from discovery (or a pinned env) at run time.
  },
  configFromEnv: {
    boardId: "SMOKE_MONDAY_BOARD_ID",
    groupId: "SMOKE_MONDAY_GROUP_ID",
  },
  requiredEnv: ["SMOKE_MONDAY_BOARD_ID", "SMOKE_MONDAY_GROUP_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "item", idPath: "itemId", kind: "item" },
    // create_item echoes the stored item name; confirm the unique marker
    // round-tripped (a cheap ownership check before the read-back).
    markerEchoPath: "itemName",
    // delete_item removes the smoke item -> required cleanup; success ->
    // LIVE_PASS_CLEANED, failure -> CLEANUP_FAILED.
    cleanupKind: "delete",
    verify: {
      provider: "monday",
      action: "get_item",
      config: {
        boardId: "{{env.SMOKE_MONDAY_BOARD_ID}}",
        itemId: "{{ledger.item.id}}",
      },
      // Independent read-back confirms the marker on the persisted item NAME.
      markerPath: "itemName",
    },
    cleanup: {
      provider: "monday",
      action: "delete_item",
      config: {
        boardId: "{{env.SMOKE_MONDAY_BOARD_ID}}",
        itemId: "{{ledger.item.id}}",
      },
    },
  },
  notes:
    "First Monday item-tree write: create a smoke-marked item -> get_item read-back " +
    "(marker on item name) -> delete_item. Board/group auto-discovered on the " +
    "throwaway account (pinned SMOKE_MONDAY_BOARD_ID wins). destructiveSafe — needs " +
    "the write + destructive gates.",
});
