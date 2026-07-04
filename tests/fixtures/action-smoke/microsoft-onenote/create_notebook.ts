import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-onenote:create_notebook (writeSafe, artifact left) — create a
 * deterministic crsmoke- notebook, then prove it persisted via the REGISTERED
 * list_notebooks read.
 *
 *   execute  create_notebook -> Graph POST /me/onenote/notebooks with a marker
 *            displayName. Capture { id } into ledger key "notebook".
 *            markerEchoPath proves the marker round-tripped on the stored name.
 *   verify   list_notebooks -> INDEPENDENT read of the account's notebooks;
 *            markerPath "notebooks" confirms the marker displayName on the
 *            PERSISTED list (never the create echo).
 *
 * DISPOSITION: none — and none is POSSIBLE: Microsoft Graph exposes NO delete
 * endpoint for OneNote notebooks (a real API limitation, not a V2 gap), so the
 * marked notebook stays on the throwaway account. Each run leaves one marked
 * notebook. Scope: Notes.Create / Notes.ReadWrite.
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-onenote",
  action: "create_notebook",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    displayName: "{{smokeMarker}}notebook",
  },
  requiredEnv: ["SMOKE_MICROSOFT_ONENOTE_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "notebook", idPath: "id", kind: "notebook" },
    markerEchoPath: "displayName",
    verify: {
      provider: "microsoft-onenote",
      action: "list_notebooks",
      config: {},
      markerPath: "notebooks",
    },
    // No cleanup: Graph has NO notebook delete endpoint -> marked artifact.
  },
  notes:
    "create_notebook (marker displayName) -> list_notebooks read-back proves the " +
    "marker on the persisted notebook list. writeSafe; marked notebook artifact " +
    "left (Graph exposes no notebook delete).",
});
