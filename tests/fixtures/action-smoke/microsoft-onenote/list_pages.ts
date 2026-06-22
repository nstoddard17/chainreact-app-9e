import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-onenote:list_pages — read-only page list under one section.
 *
 * Needs a section id (SMOKE_ONENOTE_SECTION_ID), so it SKIPs before workflow
 * creation until a real id is provided. Read-only — the report asserts only the
 * terminal run status, never page content.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-onenote",
  action: "list_pages",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: {
    sectionId: "SMOKE_ONENOTE_SECTION_ID",
  },
  requiredEnv: ["SMOKE_MICROSOFT_ONENOTE_CONNECTED", "SMOKE_ONENOTE_SECTION_ID"],
  expect: { outcome: "success" },
  notes: "Read-only page list for one section; needs a real section id in SMOKE_ONENOTE_SECTION_ID.",
});
