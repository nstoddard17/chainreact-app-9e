# Slice 3.SEC-CLOSEOUT — Workflow Builder Security Gate Closeout

**Status:** Checkpoint / documentation. No runtime changes in this slice.
**Branch:** `v2-provider-port-local` (local-only; do not push).
**Date:** 2026-05-23.
**Pairs with:** [`workflow-builder-data-security-audit.md`](./workflow-builder-data-security-audit.md) (the SEC-1 audit that opened the track).

This document is the explicit close-of-track checkpoint for the Workflow Builder security audit. It tells the next reader — Marcus, the build chat, a future Claude session, or a third-party reviewer — exactly what has landed, what is satisfied, what is deferred, and what must happen before any production Stripe high-risk write exposure.

---

## 1. Completed Security Slices

Seven slices shipped along this arc, in dependency order. All commits are local to `v2-provider-port-local`; nothing is pushed.

| Slice | Commit (short) | Title | What it adds |
| --- | --- | --- | --- |
| **SEC-2A** | (earlier) | Action risk metadata | `isDestructive` / `requiresConfirmation` / `riskLevel` / `riskDescription` fields on `ActionMeta`. Consistency guard: `isDestructive: true` ⇒ `riskLevel: "high"`. All covered-provider metas declare values; defaults applied where unset. |
| **SEC-2** | `a141d8440` | Engine test-mode safety gate | `services/execution/testModeGate.ts`. Engine pre-call gate refuses to invoke handlers when `testMode === true` AND meta says `requiresIntegration` / `isDestructive` / `requiresConfirmation` / `riskLevel: "high"` / meta-missing. Fail-closed for unknown actions. Persists a deterministic mock output shape into `workflow_runs.steps[].output`. |
| **SEC-3** | `9048f8aed` | `http_request` egress denylist | First-tier SSRF guard. Denies private IPv4 ranges + IPv6 ULA / link-local / loopback + the AWS / GCP / Azure metadata service endpoints by hostname + post-resolution IP. DNS rebinding closure at the socket layer is explicitly deferred to SEC-3.x. |
| **SEC-7** | `e80025e16` | OutputMeta.sensitive + first-tier redaction | `OutputMeta.sensitive: boolean` field. Run-detail serializer redacts step outputs whose meta declares the field sensitive. Variable picker preview path masks sensitive values. Read-side only; deletion / retention not addressed. Failure mode: meta-lookup miss is fail-open at the redactor layer (documented). |
| **SEC-8** | `68a3d5b85` | Stripe `clientSecret` removal | `client_secret` removed from `stripe:create_payment_intent` + `stripe:confirm_payment_intent` workflow outputs and matching OutputMeta. Stripe API wire-format type still carries the field but it never reaches a workflow variable / run history / variable picker / downstream sink. Tests forbid both `clientSecret` and `client_secret` keys in the projected output. |
| **SEC-14** | `ebc1fe2bc` | Stripe livemode enforcement | `integrations/stripe/security/livemodePolicy.ts` + `stripeLivemodePreflight` factory. `refreshAndRetry` gained an optional `preflight: (integration) => void` hook (backward-compatible, generic). All 16 Stripe handlers thread the preflight. Test-mode → defense-in-depth deny (SEC-2 already blocks externally). Real-mode + unknown livemode + high-risk → `STRIPE_LIVEMODE_UNKNOWN` (reconnect required). Real-mode + test Stripe key allowed for now (no environment concept yet). |
| **SEC-4B** | `163cb91f9` | Destructive-action confirmation | `services/workflows/riskConfirmation.ts` + `REQUIRED_CONFIRMATION_TEXT = "CONFIRM"`. Activate route + run-now route gated when a workflow node has `isDestructive: true` OR `requiresConfirmation: true`. `testMode === true` bypasses the gate (SEC-2 already blocks externally). Response shape is route-safe (no config / IDs / resolved values). |

Full-suite numbers at SEC-4B accept: **9152 / 9152 tests passing, 809 suites**. tsc clean. lint 0 errors, 2 pre-existing max-lines warnings (engine.ts, handlers/_registry.ts).

---

## 2. Original SEC-1 No-Go Criteria — Status

The SEC-1 audit ([§10](./workflow-builder-data-security-audit.md)) listed eight gates that must be cleared before any Stripe high-risk write exposure. This is the honest scoring.

| # | Gate | Status | Notes |
| --- | --- | --- | --- |
| 1 | **SEC-2 shipped — test-mode engine gate** | ✅ **Satisfied** | `services/execution/testModeGate.ts` ships. Tests cover all blocked categories + fail-closed for missing meta. The audit asked for `testMode && action.isDestructive`; the implementation is broader (blocks all `requiresIntegration` + high-risk + missing meta). |
| 2 | **SEC-4 / SEC-2A shipped — action risk flags** | ✅ **Satisfied** | All Stripe writes carry `riskLevel: "high"`. `create_refund` / `capture_payment_intent` / `cancel_subscription` carry `isDestructive: true` + `requiresConfirmation: true`. Schema guard enforces consistency at module load. |
| 3 | **SEC-7 shipped — OutputMeta.sensitive + redaction** | 🟡 **Partially satisfied** | Flag exists; first-tier redaction at run-detail + variable-picker preview ships. Per-provider coverage of sensitive outputs is the metadata audit (§4 of this doc) — not yet asserted as complete across covered providers. Read-side redaction is fail-open on meta-lookup miss (documented trade-off; RLS mitigates). Stripe-side sensitive flags need a pass once Stripe is in COVERED_PROVIDERS scope. |
| 4 | **SEC-8 resolved — `clientSecret` decision** | ✅ **Satisfied** | Dropped from output entirely per Marcus decision. Stripe API client untouched. Customer-facing payment surfaces remain available via `create_checkout_session.url` / `create_payment_link.url`. Regression tests forbid both case forms. |
| 5 | **SEC-3 shipped — http_request egress denylist** | 🟡 **Partially satisfied** | First-tier denylist ships. Hostname + post-DNS-resolution IP guards cover the audited SSRF + metadata-endpoint attack surface. **Socket-level DNS rebinding closure is explicitly deferred to SEC-3.x.** Production-grade allowlist also deferred. |
| 6 | **SEC-14 shipped — Stripe livemode enforcement** | ✅ **Satisfied** | Storage substrate already existed (Stripe OAuth callback persists `livemode` in `account_metadata`). Policy + preflight + 16-handler wiring shipped. testMode + livemode-unknown-high-risk fail closed. Real-mode test-Stripe-key allowed for now; product-side environment concept is a future slice. |
| 7 | **Stripe accidental-action runbook** | ❌ **Not satisfied** | `docs/runbooks/stripe-accidental-action.md` does not exist. `docs/runbooks/` is empty (`.gitkeep` only). The technical signals to author the runbook are in place (`workflow_runs.is_test`, `triggered_by`, Q4 idempotency keys, `error_classification`), but the runbook itself is unwritten. **Must ship before production Stripe write exposure.** |
| 8 | **Typed-confirmation UX shipped** | 🟡 **Partially satisfied** | API-level gate is complete and tested (activation route + run-now route, helper at `services/workflows/riskConfirmation.ts`). Response shape is structured `CONFIRMATION_REQUIRED` with route-safe action descriptors. **Builder UI work — modal rendering, typed-input affordance, post-confirmation success toast — is NOT shipped.** Per slice scope: "API enforcement is the priority. If UI work is too large, add the API guard now and leave richer UI for follow-up." A scripted / API client can satisfy the gate; a human in the builder cannot yet, because the modal doesn't exist. |

**Summary:** 4 of 8 fully satisfied, 3 of 8 partially satisfied, 1 of 8 not satisfied. The unmet criterion (runbook) and the partial criteria (UI confirmation modal, redaction coverage, SSRF socket-level closure) are the gating items between local-only progress and production Stripe write exposure.

---

## 3. Stripe Exposure Recommendation

### Can build-track Stripe metadata reconciliation resume locally?
**Yes.** The substrate is in place. Local audit of Stripe metadata (risk flags, sensitive flags, output projections), trigger meta polish, and discovery-coverage extension can resume. The engine, the redactor, the SSRF guard, the livemode policy, and the confirmation gate all enforce safety against runtime exposure.

### Can Stripe high-risk writes ship to production?
**No.** Three blockers remain:

1. **Stripe accidental-action runbook MUST exist** — `docs/runbooks/stripe-accidental-action.md` is currently empty. Without it, on-call has no documented procedure when a customer reports a misfired refund / capture / cancel. The technical signals are in place; the procedural document is not.
2. **Confirmation UI MUST exist OR be product-accepted as API-only** — today a human using the builder cannot satisfy the `CONFIRMATION_REQUIRED` gate because no modal renders the structured response. Either:
   - Ship the modal that consumes the `CONFIRMATION_REQUIRED` shape (typed input → re-POSTs with `confirmationText: "CONFIRM"`), OR
   - Product owner explicitly accepts "API-only confirmation" as the V1 contract and documents that the builder UI integration is a follow-up.
3. **Post-security metadata compliance audit MUST pass** — see §4. The seven security slices ship the substrate, but every covered provider's metadata must be re-walked to confirm risk flags + sensitive flags are correct. A wrong flag bypasses the substrate.

### Other items NOT blocking production but recommended
- **SEC-3.x socket-level DNS rebinding closure** — the first-tier denylist is good enough to block the audited attack surface; the socket-level pinning is the next defense-in-depth pass. Not strictly blocking, but should ship before any production handler that proxies user-supplied URLs (which `http_request` is, by design).
- **Run output retention policy + cron** — no PII retention policy ships today. Workflow run outputs persist indefinitely. Not strictly blocking but exposes a growing PII surface over time.
- **Config secret handling / vault references** — SEC-5 was deferred. Plaintext jsonb in `workflows.draft_definition` continues to accept arbitrary keys. Workflows that paste a token into a description field still leak. Not strictly blocking for Stripe (which uses OAuth, not user-pasted tokens), but a known gap.

### Decision posture
- **Local-track work resumes.**
- **Production Stripe write exposure waits for** runbook + UI confirmation decision + metadata compliance audit + product-owner sign-off on remaining deferred risks.

---

## 4. Post-Security Metadata Compliance Audit Plan

The seven security slices ship enforcement substrate; metadata is the rule-set the substrate enforces. A wrong flag silently bypasses every gate above. **This audit MUST run before the build chat resumes new provider work.**

### Scope: all currently-covered providers
The `tests/structure/discovery-meta-coverage.test.ts` `COVERED_PROVIDERS` set as of this checkpoint:
- `native`
- `github`
- `gmail`
- `microsoft-outlook`
- `slack`
- `notion`
- `stripe` (added in Slice 3.46; trigger meta deferred)

Stripe local metadata is in the registry. The audit covers it.

### Per-provider checks

For each provider, for each `ActionMeta` declared in `integrations/<provider>/actions/*.meta.ts`:

**A. Risk flag correctness:**
- `isDestructive`: TRUE iff the action causes irreversible or hard-to-reverse provider-side side effects (refund, delete, archive, cancel, capture, send). Re-walk every action.
- `requiresConfirmation`: TRUE for the subset of destructive actions where the user-facing cost is high (Stripe refunds, capture, cancel; mailbox / message deletes; channel archives). Pair with `isDestructive: true`.
- `riskLevel`: `"high"` for any destructive OR money-impacting action, `"medium"` for sends / publishes / mutations without easy rollback, `"low"` for reads / lookups. Cross-check against existing metadata.
- `riskDescription`: present for every `riskLevel: "high"` action. Human-safe. No tokens / IDs.

**B. OutputMeta.sensitive flag coverage:**
- PII fields: emails, phone numbers, full names → `sensitive: true`.
- Free-text bodies / messages / snippets: any user-typed content with potential PII → `sensitive: true`.
- Signed URLs (OneDrive download URLs, S3 presigned URLs, Stripe hosted invoice URLs) → `sensitive: true`.
- HTTP response bodies (`native:http_request.body`) → `sensitive: true`.
- Payment-related URLs (`create_checkout_session.url`, `create_payment_link.url`) → debatable; current decision: NOT sensitive (intended for sharing with end customers). Confirm explicitly during audit.
- Raw event bodies from webhook triggers → `sensitive: true`.

**C. Provider route exposes risk fields:**
- `GET /api/providers/[id]/actions` must continue to return `isDestructive`, `requiresConfirmation`, `riskLevel`, `riskDescription` on every action entry. Existing tests (`tests/unit/app/api/providers/providers-route.test.ts:574-681`) assert this for `native:*` and `stripe:*`; extend assertions to cover one destructive action from each provider.

**D. Run-detail redaction covers sensitive outputs:**
- For one sensitive output per provider, write a `tests/unit/app/api/workflows/run-detail-route.test.ts` regression that asserts the redactor masks it. Existing tests cover Stripe `create_customer.email`; extend.

**E. Variable picker masks latest-run previews:**
- Sensitive outputs MUST NOT render their raw value in the latest-run preview. Already covered for SEC-7; re-walk to confirm new providers added since then.

**F. testMode blocks all external provider actions:**
- The SEC-2 gate already blocks based on meta. Run `tests/unit/services/execution/testModeGate.test.ts` style assertion: every covered-provider action with `requiresIntegration: true` is blocked in test mode. The existing test covers a sample; broaden to enumerate every covered-provider action.

**G. Destructive activation / run-now confirmation catches all required actions:**
- For each provider's destructive actions (Stripe refund / capture / cancel; Gmail / Outlook deletes; Slack delete_message; Notion archives; etc.) write a parameterized test asserting `findConfirmationRequiredActions` returns the action descriptor. Existing tests cover one per provider; widen to every destructive action in scope.

**H. No `clientSecret` outputs remain:**
- Sweep covered metas for any output named `clientSecret` / `client_secret`. SEC-8 removed the two Stripe sites; this is a regression guard.

**I. `http_request` remains high-risk and egress-hardened:**
- Re-assert `native:http_request.meta.ts` has `riskLevel: "high"` and a riskDescription.
- Re-run SEC-3 denylist tests.

**J. Stripe livemode policy is wired into all Stripe handlers:**
- Sweep `integrations/stripe/actions/*.ts` for `stripeLivemodePreflight` import; assert presence in all 16 handlers. (Today we have the structure-check pattern; consider a `tests/structure/stripe-livemode-coverage.test.ts` to lock this.)

**K. 1:1 handler ↔ meta coverage:**
- `tests/structure/discovery-meta-coverage.test.ts` already asserts this. Run it; if it passes, this check is satisfied for free.

### Output
A pass / fail report per provider. For any failure, file a tracking issue per finding. Do not start new provider metadata work until the audit's pass set is green.

### Tests added per audit (suggested)
1. `tests/structure/risk-metadata-sanity.test.ts` — for each covered provider's destructive action, assert `isDestructive: true && riskLevel: "high"`. Cross-references with `requiresConfirmation` consistency guard.
2. `tests/structure/sensitive-output-coverage.test.ts` — for each covered provider, assert at least one expected sensitive output is flagged (e.g. `gmail:get_message.body` flagged sensitive; `stripe:create_customer.email` flagged sensitive). Provider-by-provider allow-list with rationale.
3. `tests/structure/stripe-livemode-handler-coverage.test.ts` — sweep `integrations/stripe/actions/*.ts` source for `stripeLivemodePreflight`. Fails when a new Stripe handler ships without it.
4. Widened `tests/unit/services/execution/testModeGate.test.ts` parameterized over all covered-provider externals.

---

## 5. Build-Track Handoff Prompt Outline

A ready-to-paste outline for the build chat. Goal: stop the build chat from blindly resuming provider metadata work before the compliance audit runs.

```
Track resume — Post-security metadata compliance audit FIRST.

Do NOT continue net-new provider metadata or trigger work until the
post-security metadata compliance audit is green.

Step 1 — Run the audit plan in
docs/slices/security/workflow-builder-security-closeout.md §4 across
COVERED_PROVIDERS (native, github, gmail, microsoft-outlook, slack,
notion, stripe). Produce a pass/fail report per provider.

Step 2 — For any failing provider, fix risk-flag / sensitive-flag /
preflight gaps in batches. One commit per provider per concern; tests
land in the same commit. No new provider scope in fix commits.

Step 3 — When all covered providers pass the audit, decide whether to
re-accept / squash / rework the local Stripe metadata work that landed
during the security arc (Slice 3.46 Stripe action metas + SEC-8 +
SEC-14 + SEC-4B integration points). Recommended: keep the existing
SEC commits as-is and add a Stripe metadata polish commit on top if
the audit surfaces gaps.

Step 4 — Only after Step 3 lands, resume net-new provider metadata
(e.g. trigger meta coverage, additional providers).

Production / push gates beyond this checkpoint:
- Stripe accidental-action runbook MUST exist.
- Confirmation modal UI MUST exist OR product owner accepts API-only.
- Run output retention policy MUST be decided (cron or accepted gap).
- Product owner sign-off on remaining deferred risks.

Branch is local-only (v2-provider-port-local). Do not push until the
gate items above are met.
```

---

## 6. Remaining Security Backlog (Ranked)

Ranked by combined severity × blast-radius × time-to-fix. Top items block production exposure; lower items are quality-of-implementation.

| Rank | Item | Severity | Why this rank |
| --- | --- | --- | --- |
| 1 | **Stripe accidental-action runbook** (`docs/runbooks/stripe-accidental-action.md`) | High | The only original SEC-1 gate that is **not satisfied**. Blocks production Stripe write exposure. Documentation only; ~2 hours. |
| 2 | **Run output retention policy + cron** | High | PII accumulates indefinitely. Once the retention policy is product-decided, the cron is a small implementation. Decision is harder than the code. |
| 3 | **Config secret vault / reference design** | High | SEC-5 was deferred. Workflows still accept user-pasted secrets in `jsonb` config. Large design surface; ship a SEC-5 design slice first, then implementation. |
| 4 | **Fail-open redaction hardening** | Medium-High | Meta-lookup miss in `core/security/redactOutput.ts` returns output unchanged. Documented; RLS mitigates; not exploitable without separate auth bug. Closure: fail closed by default + explicit allow-list for legacy paths. |
| 5 | **SEC-3.x socket-level pinning** | Medium | First-tier denylist handles the audited attack surface. Socket-level pinning closes DNS-rebind. Defense-in-depth; not strictly blocking. |
| 6 | **Richer builder risk UI** | Medium | Risk chips on action picker, confirmation modal, post-execution "this run was destructive" indicator. Each is a small UI slice. Required for human-driven Stripe activation (gate #8 above). |
| 7 | **Engine / `_registry.ts` max-lines refactor** | Low | Pre-existing lint warnings predating this arc. Quality-of-code; no security impact. Schedule alongside the next engine evolution. |

---

## 7. CEO Summary

**Plain English.**

### What is now safer
- A user clicking "Run now" on a workflow that contains a Stripe refund / capture / cancel can no longer accidentally fire one — the API forces them to type `CONFIRM` first.
- A user clicking "Test" on the same workflow does not hit any Stripe / Gmail / Outlook / Slack API at all. The engine substitutes a deterministic mock output.
- The `http_request` action used to be able to call `http://169.254.169.254/...` (AWS metadata endpoint) or `http://10.0.0.5/...` (private network). It now refuses both at the URL level and post-DNS-resolution.
- Stripe `client_secret` no longer leaves the handler. Workflows that need a customer-facing payment surface use `create_checkout_session.url` or `create_payment_link.url`. (Those return only the URL, which is intended for sharing.)
- Stripe live-mode vs test-mode is now persisted per integration and enforced — a high-risk Stripe action cannot execute against an integration whose live-mode status is unknown until the user reconnects.
- The variable picker no longer previews PII / message-body / secret outputs from past runs verbatim. The substrate to expand this coverage is in place.

### What is still not perfect
- The confirmation modal in the builder is not yet built — the API enforces the gate, but a human in the builder UI can't currently satisfy it. Either ship the modal or product accepts "API-only confirmation" as V1.
- There is no runbook yet for "a user reports a misfired Stripe action." The technical signals exist (test/manual flag, idempotency keys, error classification); the procedural document is unwritten.
- Workflow run outputs persist forever. No retention policy. PII grows indefinitely until manually purged.
- Workflows can still receive a user-pasted secret in a plaintext config field; we'd want a vault-reference model before treating that as solved.
- The redactor fails open when it can't look up an output's meta (e.g. workflow edited since the run). RLS mitigates this; closure is a known follow-up.
- Socket-level DNS rebinding protection is the next pass on `http_request`; first-tier guards handle the audited attack surface.

### What can resume locally
- Build-track work, after running the post-security metadata compliance audit (§4). Every covered provider's risk flags + sensitive flags + livemode wiring must be re-walked; the substrate is in place but the rule-set has to be verified.

### What should not be pushed yet
- Anything that exposes Stripe high-risk writes in production, until:
  1. The Stripe accidental-action runbook exists.
  2. The confirmation UI is decided (build the modal, or accept API-only and document).
  3. The metadata compliance audit is green for every covered provider.
  4. The product owner signs off on the remaining deferred risks (retention, config secrets, SEC-3.x).

The local branch remains `v2-provider-port-local`, local-only, never pushed.
