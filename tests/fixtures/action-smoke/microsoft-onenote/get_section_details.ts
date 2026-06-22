import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-onenote:get_section_details — read-only single-section fetch by id.
 *
 * Needs a section id (SMOKE_ONENOTE_SECTION_ID), so it SKIPs before workflow
 * creation until a real id is provided. Read-only — the report asserts only the
 * terminal run status, never section content.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-onenote",
  action: "get_section_details",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: {
    sectionId: "SMOKE_ONENOTE_SECTION_ID",
  },
  requiredEnv: ["SMOKE_MICROSOFT_ONENOTE_CONNECTED", "SMOKE_ONENOTE_SECTION_ID"],
  expect: { outcome: "success" },
  notes: "Read-only section details by id; needs a real section id in SMOKE_ONENOTE_SECTION_ID.",
});
