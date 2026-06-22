import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-onenote:list_sections — read-only section list under one notebook.
 *
 * Needs a notebook id (SMOKE_ONENOTE_NOTEBOOK_ID), so it SKIPs before workflow
 * creation until a real id is provided. Read-only — the report asserts only the
 * terminal run status, never section content.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-onenote",
  action: "list_sections",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: {
    notebookId: "SMOKE_ONENOTE_NOTEBOOK_ID",
  },
  requiredEnv: ["SMOKE_MICROSOFT_ONENOTE_CONNECTED", "SMOKE_ONENOTE_NOTEBOOK_ID"],
  expect: { outcome: "success" },
  notes: "Read-only section list for one notebook; needs a real notebook id in SMOKE_ONENOTE_NOTEBOOK_ID.",
});
