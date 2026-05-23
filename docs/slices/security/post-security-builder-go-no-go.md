# Slice 3.POSTSEC-7 — Final Security / Builder Go-No-Go Checkpoint

**Status:** Checkpoint / documentation. No runtime changes in this slice.
**Branch:** `v2-provider-port-local` (local-only; do not push).
**Date:** 2026-05-23.
**Pairs with:**
- [`workflow-builder-data-security-audit.md`](./workflow-builder-data-security-audit.md) — original SEC-1 audit.
- [`workflow-builder-security-closeout.md`](./workflow-builder-security-closeout.md) — SEC-CLOSEOUT checkpoint after the seven security slices.
- [`completed-metadata-security-compliance-audit.md`](./completed-metadata-security-compliance-audit.md) — POSTSEC-1 compliance audit.

This document is the **final go/no-go checkpoint** after the security foundation (SEC-2A → SEC-4B) and the post-security builder corrections (POSTSEC-1 → POSTSEC-6B). It answers — for Marcus, the next Claude session, or a future reviewer — exactly what is safe to do locally, what is safe to push, what is still production-blocking, and what must be explicitly accepted by the product owner.

This is **not** a re-audit. It is a synthesis of where the work landed and what the remaining decisions are.

---

## 1. Completed Safety / Build-Correction Slices

Fourteen slices landed across two arcs. All commits are local to `v2-provider-port-local`; nothing is pushed.

### 1.1 Security foundation arc (7 slices)

| Slice | Commit | Title | What it adds |
| --- | --- | --- | --- |
| **SEC-2A** | (pre-arc) | Action risk metadata | `isDestructive`, `requiresConfirmation`, `riskLevel`, `riskDescription` on `ActionMeta`. Schema guard: `isDestructive: true` ⇒ `riskLevel: "high"`. |
| **SEC-2**  | `a141d8440` | Engine test-mode safety gate | `services/execution/testModeGate.ts`. Pre-call refuses to invoke handlers in `testMode` when meta says `requiresIntegration` / `isDestructive` / `requiresConfirmation` / `riskLevel: "high"` / meta-missing. Fail-closed. |
| **SEC-3**  | `9048f8aed` | `http_request` egress denylist | First-tier SSRF guard. Private IPv4 + IPv6 ULA / link-local / loopback + AWS / GCP / Azure metadata endpoints denied by hostname + post-resolution IP. |
| **SEC-7**  | `e80025e16` | `OutputMeta.sensitive` + redaction | Run-detail serializer + variable picker preview mask outputs whose meta flags them sensitive. Read-side only. |
| **SEC-8**  | `68a3d5b85` | Stripe `clientSecret` removal | `client_secret` removed from `stripe:create_payment_intent` + `stripe:confirm_payment_intent` outputs. Tests forbid the key in either case form. |
| **SEC-14** | `ebc1fe2bc` | Stripe livemode enforcement | `integrations/stripe/security/livemodePolicy.ts` + `stripeLivemodePreflight`. All 16 Stripe handlers thread the preflight. Real-mode + unknown livemode + high-risk → `STRIPE_LIVEMODE_UNKNOWN`. |
| **SEC-4B** | `163cb91f9` | Destructive-action confirmation (API) | `services/workflows/riskConfirmation.ts`. Activate + run-now routes return structured `409 CONFIRMATION_REQUIRED` when a node has `isDestructive: true` OR `requiresConfirmation: true`. `testMode: true` bypasses. Route-safe response (no config / IDs / values). |

### 1.2 Post-security builder-correction arc (7 slices)

| Slice | Commit | Title | What it adds |
| --- | --- | --- | --- |
| **POSTSEC-1**  | `fe5bd502e` | Completed metadata compliance audit | Audit-only. Per-provider risk-flag / sensitive-flag / confirmation-coverage review across COVERED_PROVIDERS. |
| **POSTSEC-2**  | `c27508dc3` | Sensitive output drift cleanup | Tightened sensitive flags on outputs flagged by POSTSEC-1. |
| **POSTSEC-3**  | `00d71f38a` | Stripe high-risk confirmation reclassification | Money-moving Stripe actions reclassified per POSTSEC-1 findings. |
| **POSTSEC-4**  | `04a7845b7` | Stripe accidental-action runbook | `docs/runbooks/stripe-accidental-action.md` — operator/admin runbook for misfired Stripe writes. |
| **POSTSEC-5**  | `ea8c9e666` | Builder destructive-action confirmation modal | `DestructiveActionConfirmationModal.tsx`. Closes the SEC-CLOSEOUT "UI for typed-confirmation" gap. Activation + run-now both wired. |
| **POSTSEC-6**  | `083399a55` | Test Run vs Live Run UX | Two-button surface (Test Run / Run Live) with testMode flag. No silent promotion/demotion. |
| **POSTSEC-6B** | `b94ab686e` | Workflow action model correction | Trigger-kind classifier (`features/workflow-builder/state/triggerKind.ts`). Manual workflows → Test Workflow + Run Manually. Automated workflows → disabled Test Workflow stub; Run Manually NEVER exposed. |

Full-suite numbers at POSTSEC-6B accept: **9317 / 9317 tests passing, 813 suites**. tsc clean. lint 0 errors, 2 pre-existing max-lines warnings (engine.ts, handlers/_registry.ts).

---

## 2. Current Covered-Provider Status

### 2.1 `COVERED_PROVIDERS` set (verified against `tests/structure/discovery-meta-coverage.test.ts:27-48`)

```
{ "native", "github", "gmail", "microsoft-outlook", "slack", "notion", "stripe" }
```

All seven providers carry full 1:1 handler↔meta coverage and pass the structural test. Stripe was added in Slice 3.46; trigger meta (`stripe:event_received`) deferred and not enforced by the structural test.

### 2.2 Per-provider action / trigger meta counts

| Provider | Action metas | Trigger metas | Notes |
| --- | ---: | ---: | --- |
| `native` | 5 | 2 | `http_request` carries `riskLevel: "high"`. |
| `github` | 6 | 1 | All read/create; no destructive. |
| `gmail` | 13 | 3 | `delete_email` is destructive. |
| `microsoft-outlook` | 9 | 3 | `delete_email` is destructive. |
| `slack` | 31 | 10 | `delete_message` + `archive_channel` destructive. |
| `notion` | 16 | 0 | Notion has no triggers; `archive_page` destructive. |
| `stripe` | 16 | 0 | Trigger meta deferred. 7 high-risk actions; 3 destructive + requiresConfirmation. |
| **Total** | **96** | **19** | — |

### 2.3 Stripe status

- **Active locally:** Yes. All 16 Stripe action handlers are registered, all 16 have a meta, all 16 thread `stripeLivemodePreflight` (verified by grep). Confirmation gate covers the three destructive Stripe actions.
- **In `COVERED_PROVIDERS`:** Yes (added Slice 3.46).
- **Trigger meta:** Deferred. Not enforced by the structural test today.

### 2.4 Risk distribution snapshot (from POSTSEC-1)

- 52 actions `riskLevel: "low"`.
- 31 actions `riskLevel: "medium"`.
- 13 actions `riskLevel: "high"`.
- 8 actions `isDestructive: true`.
- 3 actions `requiresConfirmation: true` (all Stripe money-moving: `capture_payment_intent`, `create_refund`, `cancel_subscription`).

---

## 3. Safety Controls Now In Place

A flat list of the user-facing and engine-facing guards that ship today. Each is implemented + tested.

| Control | Surface | Where |
| --- | --- | --- |
| **Action risk metadata** | Builder / engine / picker | `contracts/actionMeta.ts` + every covered-provider `*.meta.ts` |
| **Typed-confirmation API guard** | Server (activate + run-now) | `services/workflows/riskConfirmation.ts` + `app/api/workflows/[id]/{activate,run-now}/route.ts` |
| **Builder destructive-action confirmation modal** | Builder UI | `features/workflow-builder/panels/DestructiveActionConfirmationModal.tsx` |
| **Engine `testMode` gate** | Engine | `services/execution/testModeGate.ts` + integrated in `services/execution/engine.ts` |
| **Test Workflow vs Run Manually** | Builder UI | `features/workflow-builder/panels/RunNowPanel.tsx` + `state/triggerKind.ts` |
| **`http_request` egress denylist** | Engine (HTTP action) | `core/security/egressDenylist.ts` (first-tier) |
| **Sensitive output redaction (read-side)** | Run-detail API | `core/security/redactOutput.ts` + `OutputMeta.sensitive` flag |
| **Variable-picker sensitive masking** | Builder UI | Variable-picker preview path consumes the redactor |
| **Stripe `clientSecret` removal from outputs** | Engine (Stripe handlers) | `stripe:create_payment_intent.ts` + `stripe:confirm_payment_intent.ts` |
| **Stripe livemode policy** | Engine (Stripe handlers) | `integrations/stripe/security/livemodePolicy.ts` — all 16 handlers |
| **Stripe accidental-action runbook** | Documentation | `docs/runbooks/stripe-accidental-action.md` |

All eight original SEC-1 no-go criteria are now satisfied. The two that were partial / unmet at SEC-CLOSEOUT are now closed:
- **Runbook (originally not satisfied)** — shipped in POSTSEC-4 (`04a7845b7`).
- **Typed-confirmation UX (originally partial)** — shipped in POSTSEC-5 (`ea8c9e666`).

---

## 4. Remaining Deferred Risks

These are **known gaps**. Each requires a product-owner decision: accept for V1 or block until shipped. None are runtime-broken; all are documented trade-offs.

### 4.1 Automated Test Workflow is currently a stub

- POSTSEC-6B exposes a disabled "Test Workflow" button on automated workflows (scheduled, webhook, provider event). The backend run-now route still requires a `native:manual.run` trigger node server-side; a non-manual test path would need either mock/sample/latest event data or a separate test route.
- **Effect:** Users with automated workflows cannot exercise SEC-2 test-mode end-to-end from the builder. They must activate and trigger the real event. Existing SEC-2 enforcement still applies during real execution.
- **Mitigation:** POSTSEC-6B documents the stub. Activate is the validated path today.
- **Closure work:** new server route or run-now extension that constructs a synthetic `TriggerEvent` for automated triggers; client wiring to use it.

### 4.2 Run output retention policy

- No retention cron exists. `workflow_runs` rows persist indefinitely.
- **Effect:** PII surface grows over time. The redactor masks reads, but the underlying jsonb still holds the raw values.
- **Mitigation:** RLS gates reads. SEC-7 redaction prevents API leakage. Manual purge possible via direct DB.
- **Closure work:** a small cron + product-side retention decision (e.g. 30 days for non-test runs, 7 days for test runs). Decision is the slow part; the cron is small.

### 4.3 Config secret vault / reference design

- SEC-5 was deferred. `workflows.draft_definition` still accepts plaintext jsonb config. A user who pastes a token into a description field leaks it into the draft definition.
- **Effect:** Workflows that need secrets must today rely on OAuth-backed integrations. Stripe / Slack / Gmail / Outlook / Notion / GitHub all use OAuth and are unaffected. The risk window is custom `http_request` Authorization headers configured by hand.
- **Mitigation:** OAuth providers cover the documented integration set. Custom HTTP request usage is the only known leak path today.
- **Closure work:** SEC-5 design slice (vault references + config schema annotations) → SEC-5 implementation slice.

### 4.4 Fail-open redaction hardening

- `core/security/redactOutput.ts` returns the output unchanged when meta lookup fails (e.g. workflow edited since the run, action removed from registry).
- **Effect:** A redacted-on-read invariant becomes "redacted-on-read when meta is reachable." Exploit requires a separate auth bug to access the row.
- **Mitigation:** RLS gates row access. Documented behavior in SEC-7. No known live exploit path.
- **Closure work:** fail-closed default + allow-list of paths where fail-open is acceptable (e.g. variable-picker preview for ergonomics).

### 4.5 SEC-3.x socket-level DNS pinning

- First-tier denylist guards hostname + post-resolution IP. Socket-level DNS rebinding (resolve once, connect with the resolved IP) is the next pass.
- **Effect:** A clever attacker who controls a DNS resolver could in principle bypass first-tier checks via rebinding between the URL check and the socket connect.
- **Mitigation:** First-tier guards block the audited attack surface (private ranges + metadata endpoints). The known exploit requires control of an authoritative DNS server.
- **Closure work:** SEC-3.x — pin the resolved IP at the socket layer, refuse if the resolved IP changes mid-request.

### 4.6 Richer risk UI / notification integration

- Confirmation modal exists. Risk chips on the action picker, post-execution "this run fired N destructive actions" indicators, and notification/audit event integration for high-risk lifecycle events (activation, real run, blocked livemode) are not built.
- **Effect:** No telemetry for "how often is the confirmation modal triggered?" or "how often does livemode-unknown block activation?" Operator response to a misfire is procedural-only (per the runbook).
- **Closure work:** notification event publisher + a small surface in the existing notification system. Risk chips on the picker.

### 4.7 `engine.ts` and `_registry.ts` max-lines cleanup

- Pre-existing lint warnings. 444 / 473 lines respectively (limit 400).
- **Effect:** None for safety. Quality-of-code only.
- **Closure work:** routine refactor alongside the next engine evolution.

---

## 5. Go / No-Go Categories

### A. Can local build work resume?

**Yes.**

The substrate is in place across the seven security slices + seven builder-correction slices. Local provider metadata expansion, trigger meta polish, and discovery-coverage extension can resume without further security blockers. POSTSEC-1 audit serves as the recurring template for any new provider added to `COVERED_PROVIDERS`.

### B. Can Stripe metadata stay active locally?

**Yes.**

All 16 Stripe action handlers ship with full meta, livemode preflight, sensitive flags, and confirmation coverage. POSTSEC-1 audit verified Stripe metadata is compliant. Stripe trigger meta (`stripe:event_received`) remains deferred but does not block local Stripe action work.

### C. Can we continue provider metadata expansion locally?

**Yes, after this checkpoint.**

Recommended template for any new provider added to `COVERED_PROVIDERS`:
1. Land action handlers + 1:1 metas in the same commit.
2. Risk-flag every action per the POSTSEC-1 rubric.
3. `OutputMeta.sensitive` for PII / free-text / signed URLs / raw bodies.
4. Add the provider to `COVERED_PROVIDERS` only when the structural test passes.
5. Re-walk POSTSEC-1 checks for the new provider in the same arc.

Likely next provider: HubSpot or Google Sheets (per the last checkpoint's open work).

### D. Can we push this branch as-is?

**No — conditional.**

Three reasons not to push today:

1. **Dirty parallel-work files exist** — `docs/rules/database-security.md` (M) and `PACKAGES.md` (??) are unrelated to this arc and have been preserved untouched across every slice. Either they need to be cleanly landed in their own commits, reverted, or explicitly carried into the push plan.
2. **No PR / push review yet** — the local branch has ~25+ commits across multiple security-sensitive concerns. A push should be preceded by a careful PR body that covers the security summary, migration summary, deferred risks, test results, and rollback notes (see §8).
3. **Branch strategy unconfirmed** — no decision on push to `v2-provider-port-local` directly vs squash-merge into `main` vs review-on-fork. Defer push until Marcus confirms the path.

**What is safe to push** (if the above is resolved): the security + builder-correction commits themselves are coherent, tested, and locally green. The work is push-ready in code; only the procedural / branch-strategy items gate the push.

### E. Can production Stripe high-risk writes be exposed?

**Conditional. Technically much safer; still requires product-owner acceptance + careful rollout.**

What is technically safer than before:
- Builder users typing a destructive action cannot accidentally fire it (typed-confirmation modal).
- Test mode short-circuits external calls (engine gate).
- Livemode mismatches block high-risk writes (`STRIPE_LIVEMODE_UNKNOWN`).
- Output secrets (`client_secret`) never reach variables / run history.
- Misfire response procedure documented (runbook).
- Workflow run UX no longer exposes "Run Live" as a universal action — automated workflows can't be accidentally hand-fired.

What still requires explicit product-owner acceptance:
- Automated Test Workflow stub is acceptable for V1 (or it gets wired up first).
- Read-side-only redaction is acceptable for V1 (no deletion / retention).
- Fail-open redaction on meta-lookup miss is acceptable for V1 (or it gets hardened first).
- No run retention cron for V1 (or one is shipped first).
- No config secret vault for V1 (or SEC-5 ships first).
- First-tier HTTP egress denylist without socket-level pinning is acceptable for V1 (or SEC-3.x ships first).
- No high-risk notification/audit integration for V1 (or one ships first).

**Recommended rollout posture for V1 production Stripe high-risk writes:**
- Behind a feature flag / opt-in beta / admin-controlled rollout.
- Customer set explicitly scoped (no broadcast enablement).
- Operator on-call has the runbook bookmarked.
- "Do not represent as fully enterprise-grade yet" — the deferred-risk list above is real and should be communicated to the first cohort.

---

## 6. Product-Owner Acceptance Section

The decisions below must be made by Marcus (product owner). Each defaults to "block V1" if not explicitly accepted. **No default to accept.**

| # | Decision | Accept for V1 | Block until shipped |
| --- | --- | :---: | :---: |
| 1 | **API + modal confirmation is sufficient for V1** (no risk chips, no post-run banner, no audit notification) | ☐ | ☐ |
| 2 | **Automated workflow testing stub is acceptable for V1** (Test Workflow disabled for automated triggers; validation via Activate + real event) | ☐ | ☐ |
| 3 | **Read-side-only redaction is acceptable for V1** (no deletion, no retention) | ☐ | ☐ |
| 4 | **Fail-open redaction on meta-lookup miss is acceptable for V1** (RLS mitigates; documented) | ☐ | ☐ |
| 5 | **No run retention cron for V1** (PII persists until manually purged) | ☐ | ☐ |
| 6 | **No config secret vault for V1** (OAuth providers safe; user-pasted secrets in `http_request` Authorization headers are a known gap) | ☐ | ☐ |
| 7 | **First-tier HTTP egress denylist is acceptable for V1** (no socket-level DNS pinning) | ☐ | ☐ |
| 8 | **No high-risk notification/audit integration for V1** (operator response is runbook-only; no telemetry on confirmation usage) | ☐ | ☐ |

Each "block" decision pushes one slice ahead of any production exposure. Each "accept" decision should be paired with a written line in the V1 release notes documenting the trade-off.

---

## 7. Recommended Next Build Direction

**Two paths, depending on the answers in §6.**

### Path A — Marcus accepts the deferred risks for V1

Resume provider metadata expansion with the POSTSEC-1 audit as the recurring template.

Recommended next provider work, in priority order:
1. **HubSpot or Google Sheets** (whichever is the latest checkpoint's open work — both are well-suited to the current substrate).
2. **`notion:databases` resolver polish** — useful UX follow-up that does not block production.
3. **Stripe trigger meta** (`stripe:event_received`) — closes the only deferred meta coverage gap in the covered set.

Each new provider follows the §5.C template.

### Path B — Marcus wants stronger production hardening first

Recommended order:
1. **Run output retention cron + policy decision** — closes the biggest PII surface gap (Decision 5).
2. **Fail-open redaction hardening** — small slice, large defense-in-depth payoff (Decision 4).
3. **Notification/audit integration for high-risk lifecycle events** — closes telemetry blindness on confirmation + livemode block events (Decision 8 and useful for Decision 1).
4. **SEC-5 config secret vault design + implementation** — larger surface; design first (Decision 6).
5. **SEC-3.x socket-level DNS pinning** — defense-in-depth (Decision 7).

### Path C — Best balance (recommended)

1. Land the **notification/audit integration** (one slice) — gives observability for any V1 high-risk action lifecycle without blocking.
2. Decide **run retention policy** as a doc + simple cron (one slice).
3. Then **resume provider metadata expansion** under Path A.

This sequence closes the two most expensive deferred risks before broader production exposure without stalling provider-track velocity.

---

## 8. Push / PR Recommendation

**Do not push this branch yet.** Reasons:

1. The branch carries ~25+ security-sensitive commits across two arcs. A push needs a PR body that maps every commit to the security model.
2. Dirty parallel-work files (`docs/rules/database-security.md`, `PACKAGES.md`) need to be triaged before they ride along on a push.
3. Branch strategy is unconfirmed (direct push to `v2-provider-port-local`, squash to `main`, or review-on-fork).
4. Full gate run is currently green locally; this state must be repeated immediately before any push so reviewers see authoritative results.

**When the push happens, the PR body should include:**

- **Security summary** — the table from §1 of this doc + cross-reference to `workflow-builder-data-security-audit.md`.
- **Migration summary** — no DB migrations in this arc; the only schema-adjacent change is the `workflow_runs.steps[].output` redactor (read-side, no migration).
- **Production blockers / deferred risks** — §4 + the V1 decisions from §6 with each decision's accept/block outcome noted.
- **Explicit test results** — `9317 / 9317 tests passing, 813 suites`; `tsc clean`; `lint clean except 2 pre-existing max-lines warnings`; `lint:structure OK`; `lint:migrations OK`.
- **Rollback notes** — every commit is independently revertable. The two-arc structure means SEC reverts cleanly first; POSTSEC reverts on top. The trigger-kind classifier (POSTSEC-6B) is the only piece adding a new file outside `/docs` — revertable in isolation.
- **Stripe safety controls** — the rollout posture from §5.E (feature flag / opt-in beta / scoped cohort / runbook bookmarked).

**Do not skip hooks or bypass signing on the push.** Standard CI gate path.

---

## 9. CEO Summary

**Plain English.**

### What is safe now

- Builder users typing a destructive action (Stripe refund / capture / cancel; Gmail / Outlook delete; Slack delete / archive; Notion archive) must type `CONFIRM` in a modal before it fires. The modal cannot be bypassed by clicking through — the typed phrase is server-validated.
- "Test Workflow" runs short-circuit external calls. A user clicking Test cannot accidentally fire a real Stripe charge / send a real email / delete a real message.
- "Run Live" is renamed to "Run Manually" and only shows on manual-trigger workflows. An automated workflow (scheduled / webhook / provider event) cannot be hand-fired from the builder anymore — the only path is Activate + real event.
- `http_request` cannot reach the AWS / GCP / Azure metadata endpoints or private network ranges.
- Stripe `client_secret` doesn't leave the handler. Workflows needing a customer-facing payment surface use `create_checkout_session.url` / `create_payment_link.url`.
- Stripe live-mode vs test-mode is enforced per integration. A high-risk Stripe action against an integration with unknown live-mode is blocked until the user reconnects.
- The variable picker no longer previews PII / message-body / secret outputs verbatim.
- There is now a written operator runbook for "a customer reports a misfired Stripe action."

### What is still not perfect

- Automated workflows (anything not `native:manual.run`) cannot be test-run from the builder. The button is shown but disabled with copy directing the user to Activate.
- Workflow run outputs persist indefinitely. No retention policy yet.
- The redactor fails open when it can't look up an output's meta (e.g. workflow edited since the run).
- Workflows still accept user-pasted secrets in plaintext config fields. OAuth integrations are unaffected; the gap is in custom `http_request` Authorization headers.
- `http_request` does not yet have socket-level DNS rebinding protection. First-tier hostname + IP guards handle the audited attack surface.
- No telemetry / audit event integration for high-risk action lifecycle events.

### What can development do next

- Resume provider metadata expansion (likely HubSpot or Google Sheets) using POSTSEC-1 as the recurring audit template.
- Optionally land notification/audit integration + run retention policy first (Path C in §7).
- Polish work: `notion:databases` resolver, Stripe trigger meta, engine / `_registry.ts` max-lines refactor.

### What must Marcus decide before production

The eight decisions in §6. Each defaults to "block V1" unless accepted. The most consequential ones:

1. Is API + modal confirmation enough, or do we need risk chips and post-run banners first?
2. Is the automated Test Workflow stub acceptable, or wire it up first?
3. Is read-side-only redaction enough, or ship deletion / retention first?
4. Is fail-open redaction on meta-lookup miss acceptable, or harden first?
5. Is "no run retention cron" acceptable, or ship one first?
6. Is "no config secret vault" acceptable, or design / ship SEC-5 first?
7. Is "first-tier HTTP egress denylist" enough, or ship socket-level pinning first?
8. Is "no high-risk notification integration" acceptable, or ship one first?

Each "accept" should be documented in V1 release notes. Each "block" pushes one slice ahead of production exposure.

### Push posture

The local branch is `v2-provider-port-local`. Do not push until the PR body in §8 is prepared, the dirty parallel-work files are triaged, branch strategy is confirmed, and the gate run is repeated immediately pre-push. The work is push-ready in code; only the procedural / branch-strategy items gate the push.

---

**End of POSTSEC-7 checkpoint.**
