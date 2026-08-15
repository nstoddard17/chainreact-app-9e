# Google Limited Use privacy-policy closeout (GOOGLE-PRIVACY-LIMITED-USE-CLOSEOUT-1)

**Date:** 2026-08-15 · **Status:** implemented, verified, shipped via the certified release flow
**Scope:** `/privacy` + `/terms` public copy, focused tests, this evidence record. `/security` unchanged.

Google rejected the previous privacy policy for two reasons:

1. it "indicates that it uses Google user data for reasons other than providing or improving
   your app's functionality" — the broad "operate, secure, and improve ChainReact" /
   "improve reliability, security, and the product experience" language was readable as
   applying to Google Workspace API data;
2. it "does not specify any data protection mechanisms for sensitive data" — credentials were
   only described as "protected."

This batch adds a dedicated **Google API User Data** section (Limited Use adherence, prohibited
uses, no generalized-AI-training, human-access limits, no-sale), a **How we protect sensitive
and connected-app data** section (named mechanisms), a carve-out at the end of **How we use
information** that excludes Google Workspace API data from the general "improve ChainReact"
uses, a tightened **AI-assisted features and privacy** section, and a Terms carve-out after the
User Content license. Policy date advanced June 17 → **August 15, 2026**; Terms advanced to
**version 3.1, effective August 15, 2026** (the page's established convention is that
substantive edits move both constants — documented in `features/marketing/TermsPage.tsx`).

`/security` was left unchanged: every existing claim there re-verified as consistent with the
implementation, and the Privacy Policy is the Google-review document, so no duplicate
disclosure was added.

## Claim → evidence

Every materially new public claim, with the implementation evidence it was verified against
**before** publication. Verification was done on `origin/v2-main` (e63b06f1a) — the legal pages
and all cited seams were identical on the working branch.

| Public claim | Implementation evidence | Verdict |
|---|---|---|
| OAuth access + refresh tokens encrypted before storage with AES-256-GCM, unique random nonce per value | `core/encryption/tokens.ts:21` (`aes-256-gcm`), `:78` (`randomBytes(12)` per call), `:81-82` (auth tag packed), `:98-106` (tag verified, tamper → `DecryptionFailedError`); write paths `repositories/integrations.ts:190-191, 220-223, 473-475`; schema `supabase/migrations/20260505000002_integrations.sql:21-23`; tests `tests/unit/core/encryption/tokens.test.ts` (tamper `:67`), `tokenNoCleartext.test.ts` (9 provider token shapes incl. `ya29.`), `tests/unit/services/oauth/dispatcher-encryption-contract.test.ts`, `tests/integration/security/integrations-rls.test.ts:351-360` (no cleartext at rest) | VERIFIED |
| Encryption/decryption server-side only; credentials not displayed in the UI; narrow Google file-picker exception (short-lived access token to Google's own picker, never stored in the browser) | Zero `decryptToken` importers under `app/`, `features/`, `components/`, `lib/`; `authenticated` SELECT revoked on `integrations` (`supabase/migrations/20260628000000_revoke_authenticated_integration_select.sql`); the sole exception documented at `services/integrations/pickerSession.ts:11-52` (access token only, owner-only, POST + `no-store`, proactive refresh; client contract `lib/api/pickerSession.ts:13-16`); tests `tests/unit/services/integrations/pickerSession.test.ts:83,121,191` | VERIFIED |
| Data in transit over HTTPS (TLS); provider APIs over HTTPS | Live check 2026-08-15: `http://chainreact.app/privacy` → `308 Permanent Redirect` to `https://` (platform-enforced); every provider/AI base URL in code is `https://` (e.g. `services/ai/modelClients/*.ts`, `integrations/*/api`). No HSTS header is configured, so the copy claims transport encryption only — not HSTS, not "end-to-end" | VERIFIED (conservative wording) |
| Account/workspace ownership + membership/role checks server-side; workflow/integration/run data account-scoped | `services/accounts/activeAccount.ts:87-132` (membership re-verified each resolution), `services/accounts/accountAuthz.ts:22`, `app/api/workflows/_shared.ts:123, 223, 241` (404-no-leak `:151-156`); RLS `supabase/migrations/20260530000001_account_id_foundation.sql:205-310`; structural gate `tests/structure/api-route-authorization.test.ts`; suites under `tests/integration/security/` | VERIFIED |
| Database access controls + server-side authorization limit access to stored credentials; no direct client access to stored tokens | `REVOKE` migrations `20260627000000` / `20260628000000` (integrations writes + select), `20260701000000` (workflow_runs select), `20260629000000` / `20260630000000` (trigger_resources, workflow_files); `tests/integration/security/workflow-runs-account-rls.test.ts` asserts the 42501 denial | VERIFIED |
| Run/error views avoid raw credentials/tokens/provider payloads; safe summaries + classifications | `app/api/workflows/_runDtos.ts:74-99` (raw triggerEvent/fatalError dropped), `:146-179` (`toSafeStepError`), `core/security/redactOutput.ts`; closed classification set `services/execution/classifyHandlerError.ts`; OAuth error redaction `app/api/integrations/oauth/[provider]/_shared.ts:1-42` + `oauth-error-redaction.test.ts` | VERIFIED |
| Connecting a Google account does not automatically send Google Workspace data to an AI service | OAuth connect/callback/dispatcher have zero AI imports: `app/api/integrations/oauth/[provider]/callback/route.ts` (whole file), `connect/route.ts:1-13`, `services/oauth/dispatcher.ts:1-48`; keyword sweep clean | VERIFIED |
| AI features process content only when the user explicitly directs data to them; only data relevant to the requested task | Two Google-data→AI paths, both explicit: (1) user maps `{{node.field}}` into `ai:analyze_document` / `ai:transform_data` (`integrations/ai/actions/*.schema.ts`; engine substitutes only literal tokens in saved config, `workflow-engine/variables/resolveValue.ts:55-60`); (2) user-clicked "Suggest fields" sampling the caller's **own test run** only (`app/api/workflows/[id]/ai/suggest-schema/route.ts:55-59, 122-166`). React Agent guidance receives structure-only, config-value-free DTOs (`services/ai-guidance/sanitizeWorkflowForGuidance.ts:53-65`, `buildEditableWorkflowGraph.ts:56-121`); explain/repair/diagnostics are deterministic, no model call. All AI workflow actions additionally gated behind `AI_PROCESSOR_ENABLED` (OFF in production as of this writing — `docs/slices/phase-5/ai-provider/ai-provider-cs9-rollout-readiness-outcome.md`) | VERIFIED |
| OAuth tokens, credentials, raw secrets excluded from AI model inputs | Structural: handlers never receive credentials in `config` (`services/execution/handlers/types.ts:18-63`); guidance DTOs cannot carry them; `sensitivity: "secret"\|"connection"` fields dropped (`buildEditableWorkflowGraph.ts:108`). Defense-in-depth: `services/ai/tools/redact.ts`, `core/security/secretKeys.ts`, `buildGatewayGuidancePrompt.ts:99-108` (explicit `ya29.` / JWT / Bearer scrubbing), `core/security/sensitiveLiterals.ts` (credentials redacted, never round-tripped) | VERIFIED |
| Google Workspace API data not used to create/train/improve generalized or foundational AI/ML models; not sent to third-party AI services for such training | No training/fine-tuning/dataset/embedding pipeline anywhere in the repo (repo-wide sweep; the only hit is a negative assertion at `core/workflows/officialTemplateMatcher.ts:23`). No vendor SDKs installed; both adapters are one-shot inference `fetch` calls with no `store`/upload surface (`anthropicClient.ts:209-238`, `openaiClient.ts:218-250`). No prompt/completion persistence (`services/ai/events/recordAiRouteEvents.ts:15-18`). Downstream-vendor retention posture is contractual (see inventory below) — the public claim is scoped to ChainReact's conduct, which the code proves | VERIFIED |
| Human-access limits (consent / security / legal / aggregated-anonymized) | Policy commitment phrased to the Limited Use standard; consistent with the access-control model above (no support/admin tooling exposes Google content; DB access is service-role-gated). Operational conduct commitment, not a code-provable invariant | COMMITMENT (consistent with implementation) |
| "ChainReact does not sell Google user data" / no advertising / no creditworthiness use | No advertising, ad-profile, data-sale, or credit-decision code or integration exists; sweep clean | VERIFIED (absence) |

## Google reviewer AI provider inventory (for the owner's reply email — NOT public copy)

Verified from code + repo docs on 2026-08-15:

- **Architecture:** ChainReact app → **ChainReact-operated Hermes AI gateway** (Render web
  service `chainreact-ai-gateway-prod`) → private Hermes agent service → **OpenAI API**
  (custom OpenAI-compatible provider, base `https://api.openai.com/v1`). There is no direct
  app→vendor path in production config; `docs/slices/phase-5/hermes-agent-production-topology.md`
  and `docs/runbooks/hermes-agent-render-prod.md` are the records.
- **Third-party model providers that can receive production user content:** OpenAI (behind the
  gateway). Direct OpenAI (`gpt-4.1-mini` / `gpt-4.1`, Responses API) and Anthropic
  (`claude-haiku-4-5-20251001` / `claude-sonnet-4-6`, Messages API) adapters exist in code but
  are **flag-disabled** (`ENABLE_OPENAI_PROVIDER`, `ENABLE_OPENAI_PLANNER`,
  `ENABLE_ANTHROPIC_PLANNER_FALLBACK` all default OFF; `AI_PROCESSOR_PROVIDER` defaults to
  `gateway`).
- **Feature flags as of this batch:** `AI_PROCESSOR_ENABLED` OFF everywhere (AI workflow
  actions — the only run-time Google-content→AI path — are therefore not live);
  `HERMES_AGENT_ENABLED` gates builder guidance, which sends structure-only, config-free
  context (no Google content).
- **No vendor SDKs installed; no training/fine-tuning/batch/file-upload API is called.**
  Requests are one-shot inference (`{model, system, messages, tools}`).
- **Requires owner confirmation (out of repo):** the exact production model ID configured on
  the Render-side Hermes agent (`HERMES_AGENT_MODEL`); the OpenAI account plan/tier; and the
  contractual training/retention posture of that OpenAI API account (OpenAI's standard API
  terms default to no-training on API traffic, but that is a vendor-terms fact, not a code
  fact — confirm before quoting it to Google).

## Test + gate evidence

Recorded in the Owner Report for this batch: focused Jest suites for
`tests/unit/features/marketing/` (PrivacyPage / TermsPage / SecurityPage), `npx tsc --noEmit`,
`npm run lint` (touched files clean), `lint:structure`, `lint:migrations`, and a rendered-page
review at mobile/desktop widths.
