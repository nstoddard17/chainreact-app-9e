import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-onenote:get_notebook_details — read-only single-notebook fetch by id.
 *
 * Needs a notebook id (SMOKE_ONENOTE_NOTEBOOK_ID), so it SKIPs before workflow
 * creation until a real id is provided. Read-only — the report asserts only the
 * terminal run status, never notebook content.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-onenote",
  action: "get_notebook_details",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: {
    notebookId: "SMOKE_ONENOTE_NOTEBOOK_ID",
  },
  requiredEnv: ["SMOKE_MICROSOFT_ONENOTE_CONNECTED", "SMOKE_ONENOTE_NOTEBOOK_ID"],
  expect: { outcome: "success" },
  notes: "Read-only notebook details by id; needs a real notebook id in SMOKE_ONENOTE_NOTEBOOK_ID.",
});
