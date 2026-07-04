import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * monday:create_board (writeSafe) — first Monday BOARD-level write.
 *
 *   execute  create_board -> create a deterministic crsmoke- board; capture
 *            { boardId } into ledger key "board". markerEchoPath proves the
 *            marker round-tripped on the stored board name.
 *   verify   get_board    -> INDEPENDENT read-back keyed on {{ledger.board.id}};
 *            markerPath confirms the marker on the PERSISTED boardName (never
 *            the create echo).
 *
 * boardKind is REQUIRED by the schema (no silent visibility default). The
 * fixture chooses "public": the connected Monday account is a dedicated
 * throwaway workspace, and private/shareable boards are plan-gated on Monday
 * (paid tiers), so public is the plan-safe explicit choice.
 *
 * DISPOSITION: none. Monday exposes NO registered board delete/archive action
 * in V2 (delete_board is not wired), so the crsmoke- board cannot be cleaned
 * via the harness. It is a clearly-marked, ignorable artifact on the throwaway
 * workspace (mailchimp:create_segment / slack:upload_file precedent). Each run
 * leaves one marked board.
 *
 * No target env needed — the board is created at workspace root, so there is
 * no BLOCKED_ENV path; connection is proven by the dev test's
 * probeWriteConnection.
 */
export default defineWriteSmokeFixture({
  provider: "monday",
  action: "create_board",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    boardName: "{{smokeMarker}}board",
    boardKind: "public",
    description: "{{smokeMarker}}smoke board (safe to delete)",
  },
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "board", idPath: "boardId", kind: "board" },
    markerEchoPath: "boardName",
    verify: {
      provider: "monday",
      action: "get_board",
      config: { boardId: "{{ledger.board.id}}" },
      markerPath: "boardName",
    },
    // No cleanup: no registered Monday board delete action -> marked artifact.
  },
  notes:
    "create_board (explicit boardKind public — throwaway workspace, plan-safe) -> " +
    "get_board read-back proves the marker on the persisted boardName. writeSafe; " +
    "board artifact left (no registered board delete).",
});
