import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * typeform:list_responses — TYPEFORM-2. Read-only one-page response list
 * for the smoke form (bounded per-response fields, response-token cursor,
 * completed responses only).
 *
 * Needs a connected Typeform account (with the responses:read scope
 * granted — reconnect after TYPEFORM-2 owner setup) and a form id with
 * at least one submitted response. The smoke report asserts only the
 * terminal run status — never respondent content.
 *
 * Until owner setup lands (dev-app scope update + smoke-account
 * reconnect) the live run fails with INTEGRATION_SCOPE_REQUIRED — the
 * smoke connection predates responses:read (verified live 2026-07-06).
 * That known-FAIL is recorded in the certification seed so the live
 * gate treats it as expected until the Phase 13 re-verify.
 */
export default defineActionSmokeFixture({
  provider: "typeform",
  action: "list_responses",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: {
    formId: "SMOKE_TYPEFORM_FORM_ID",
  },
  requiredEnv: ["SMOKE_TYPEFORM_CONNECTED", "SMOKE_TYPEFORM_FORM_ID"],
  expect: { outcome: "success" },
  notes:
    "Read-only one-page response list for the smoke form; needs a connected Typeform with responses:read granted (reconnect after TYPEFORM-2 owner setup) + a form id in SMOKE_TYPEFORM_FORM_ID.",
});
