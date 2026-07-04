import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-onenote:create_section (writeSafe, artifact left) — add a section to
 * a smoke-owned notebook, then prove it persisted via the REGISTERED
 * list_sections read.
 *
 *   setup    create_notebook -> a marker notebook (capture ledger key
 *            "notebook") so the section never lands in a real notebook.
 *   execute  create_section -> marker-named section in it. Capture { id } into
 *            ledger key "section". markerEchoPath proves the stored name.
 *   verify   list_sections -> INDEPENDENT read of THAT notebook's sections;
 *            markerPath "sections" confirms the marker displayName on the
 *            PERSISTED list.
 *
 * DISPOSITION: none — Graph exposes NO delete endpoint for OneNote notebooks or
 * sections (API limitation), so the marked notebook (with its marked section)
 * stays on the throwaway account. Scope: Notes.Create / Notes.ReadWrite.
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-onenote",
  action: "create_section",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    notebookId: "{{ledger.notebook.id}}",
    displayName: "{{smokeMarker}}section",
  },
  requiredEnv: ["SMOKE_MICROSOFT_ONENOTE_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "microsoft-onenote",
        action: "create_notebook",
        config: { displayName: "{{smokeMarker}}sectionhost" },
        captureResource: { resourceKey: "notebook", idPath: "id", kind: "notebook" },
      },
    ],
    captureResource: { resourceKey: "section", idPath: "id", kind: "section" },
    markerEchoPath: "displayName",
    verify: {
      provider: "microsoft-onenote",
      action: "list_sections",
      config: { notebookId: "{{ledger.notebook.id}}" },
      markerPath: "sections",
    },
    // No cleanup: Graph has NO notebook/section delete endpoint -> artifacts left.
  },
  notes:
    "create_notebook (smoke host) -> create_section (marker name) -> list_sections " +
    "read-back proves the marker on the persisted section list. writeSafe; marked " +
    "notebook + section artifacts left (Graph exposes no notebook/section delete).",
});
