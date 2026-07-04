import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * github:create_gist (writeSafe, artifact left) — create a deterministic SECRET
 * crsmoke- gist, then prove it via an INDEPENDENT gist GET.
 *
 *   execute  create_gist -> marker filename + description, isPublic:false (SECRET —
 *            safest visibility; a public gist is world-readable + search-indexed).
 *            Capture { gistId } into ledger key "gist". markerEchoPath proves the
 *            stored description.
 *   verify   gist_state (SMOKE READ-BACK) -> GET gists/{id}; markerPath proves the
 *            marker on the PERSISTED gist description.
 *
 * CONTAINMENT: create_gist targets no repo; the gist is owned by the connected
 * account. DISPOSITION: none. GitHub registers no delete-gist action, so the marked
 * SECRET gist is an honest left artifact.
 */
export default defineWriteSmokeFixture({
  provider: "github",
  action: "create_gist",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    filename: "{{smokeMarker}}gist.txt",
    content: "{{smokeMarker}}gist content - safe to ignore",
    description: "{{smokeMarker}}gist - safe to delete",
    isPublic: false,
  },
  requiredEnv: ["SMOKE_GITHUB_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "gist", idPath: "gistId", kind: "gist" },
    markerEchoPath: "description",
    verify: {
      provider: "github",
      action: "gist_state",
      config: { gistId: "{{ledger.gist.id}}" },
      smokeRead: true,
      markerPath: "description",
    },
    // No cleanup: no registered delete-gist action -> marked SECRET gist left.
  },
  notes:
    "create_gist (marker filename/description, SECRET) -> gist_state read-back " +
    "proves the persisted description marker. writeSafe; marked secret gist left " +
    "(no registered delete-gist action).",
});
