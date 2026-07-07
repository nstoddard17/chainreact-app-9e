import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * typeform:get_response — TYPEFORM-2. Read-only single-response lookup by
 * token via `included_response_ids` (Typeform has no dedicated GET-one
 * endpoint). Success = the run succeeds; a stale token still succeeds
 * with `found: false` (friendly not-found — never a thrown error), so
 * live certification should pin SMOKE_TYPEFORM_RESPONSE_TOKEN to a real
 * completed response's token and check `found: true` in the run output.
 *
 * Needs a connected Typeform account (responses:read granted) and a
 * form id + response token. The smoke report asserts only the terminal
 * run status — never respondent content.
 */
export default defineActionSmokeFixture({
  provider: "typeform",
  action: "get_response",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: {
    formId: "SMOKE_TYPEFORM_FORM_ID",
    responseToken: "SMOKE_TYPEFORM_RESPONSE_TOKEN",
  },
  requiredEnv: [
    "SMOKE_TYPEFORM_CONNECTED",
    "SMOKE_TYPEFORM_FORM_ID",
    "SMOKE_TYPEFORM_RESPONSE_TOKEN",
  ],
  expect: { outcome: "success" },
  notes:
    "Read-only lookup of one response token on the smoke form; needs a connected Typeform with responses:read granted (reconnect after TYPEFORM-2 owner setup), SMOKE_TYPEFORM_FORM_ID, and a real completed-response token in SMOKE_TYPEFORM_RESPONSE_TOKEN.",
});
