# Homepage → Anonymous Builder → Live Skeleton — Closeout

**Type:** Closeout / handoff (docs only — no source, test, migration, or UI change in this
closeout). **Nothing pushed by this closeout.**
**Date:** 2026-06-23
**Branch:** `v2-main`
**Status:** Arc complete and **local-only** (7 commits, all unpushed). Launch-acceptable pending a
final smoke + Marcus's push/deploy decision (see §8). Related go-live record:
[v2-go-live-status.md](../v2-go-live-status.md) (the signing-key note there points here).

---

## 1. Executive summary

A logged-out visitor can now go from "I have an idea" to "there's a workflow skeleton on my canvas"
without an account:

- They type an automation idea into the **homepage** prompt.
- They land on the public **`/start`** route, which renders the real builder in a local-only mode.
- They get a small, capped amount of **anonymous AI planning** (model-backed) plus a deterministic
  catalog backup.
- A validated plan **auto-shows as a preview skeleton on the canvas**.
- They can **Apply** the preview into a local draft and **edit** it — all in the browser, nothing
  saved.
- They only have to **sign up** when they hit a real boundary: Save, Connect apps, Run/Test,
  Activate — or once they exhaust the anonymous AI planning cap.
- After signing up (or in), their **draft and prompt restore** into a real (draft) workflow via
  `/start/continue`, and a one-time banner nudges the next action.

The hard security boundary is unchanged: every server route still enforces auth. The worst case for
any anonymous click is a `401`, never an anonymous write, provider call, or data leak.

## 2. Product behavior

**Homepage prompt handoff (ANON-BUILDER-1).** The marketing hero parks the typed prompt in
`sessionStorage` and routes to `/start` (the prompt is never placed in the URL). `/start` is a new
public route that mounts the real builder in additive `localOnly` mode.

**Anonymous local builder (ANON-BUILDER-1/2).** The graph slice is fully in-memory: manual node
building works, with no autosave and no run polling. The carried-over prompt seeds the React Agent
rail (additive — it never overwrites typed input and never auto-sends). On every edit the sanitized
skeleton is re-persisted to a versioned localStorage draft so it survives the auth round trip.

**Anonymous AI planning cap (REACT-LIVE-SKELETON-3 + hardening).** `/start` calls the public
`POST /api/ai/anonymous-workflow-guidance` route, which runs the same model-backed gateway + plan
validation + `planToDraftPreview` as the authenticated rail, but with **no account scope, no
governance/audit, no credit gate, and no account/workflow/credential context**. A signed,
day-bucketed cookie caps attempts per browser (`ANON_AI_LIMIT = 3`); a per-instance IP/day soft cap
backstops cookie-clear loops. When the cap is hit the route returns a typed `limitReached` response
**with no model call**. The deterministic catalog inferer remains as a **backup** when the model
returns no plan; `detectCatalogGap` still reports the exact missing-capability gap.

**Canvas preview auto-show (REACT-LIVE-SKELETON-1 → 3).** When a turn carries a valid, meaningful
plan + preview, the builder shows it on the canvas automatically (once per turn). A newer plan
supersedes the prior one (builder owns the overlay → latest wins); a same-shape restatement is
skipped; a clarifying / no-plan turn never clears the standing preview.

**Apply vs Save.** **Apply** is an explicit click in the canvas overlay that writes the preview into
the **local** draft only — display/edit, never a server write. **Save** (and Connect / Run /
Activate) is a server operation and is gated to sign-up. Auto-show and Apply never
save/activate/run/connect anything.

**Signup gates (ANON-BUILDER-1/2).** The header save/run/activate cluster is replaced by a single
CTA in local-only mode (the server-calling controls never mount); selecting a node shows a sign-up
note instead of the credential-fetching config form. Save / Activate / Run / Connect / AI-cap each
link to `/auth/sign-up?returnTo=/start/continue&reason=<...>` with same-origin-sanitized `returnTo`
and an enum-only `reason`.

**Post-auth restore (ANON-BUILDER-2/3).** `/start/continue` (`AnonymousDraftRestorer`) is an
auth-gated route that restores the local draft into a real workflow using the **existing typed
client** (`createWorkflow` + `updateWorkflow`) — no new API, no service-role, no RLS/auth bypass.
It saves as **draft only** (never auto-activates/runs). Restore is **idempotent** (ANON-BUILDER-3):
the created workflow id is persisted before the skeleton PATCH, a retry verifies + reuses the target
(so `createWorkflow` runs at most once), and a transient verify error never spawns a duplicate empty
workflow. On success the anon draft is cleared and the prompt is parked for the real builder, which
consumes it once to seed the composer.

**Post-restore banner (ANON-BUILDER-3).** The gate `reason` rides through restore inside a safe
enum-only restored-context (`{ prompt, reason }`), consumed once by the builder. `RestoredDraftBanner`
shows the matching next-action copy and is dismissible — it has no action controls and never
auto-saves/activates/runs/connects.

## 3. Security / cost boundaries

- **No anonymous DB workflow writes.** Anonymous work lives in memory + localStorage only; the first
  DB write is the authenticated `/start/continue` restore.
- **No provider / OAuth calls before auth.** Local-only mode does not mount the credential-fetching
  config form; no `/api/options` / OAuth requests fire for an anonymous visitor.
- **No provider options before auth.** Per-field option loaders are gated behind sign-up.
- **No run / test / activate before auth.** Those controls don't mount in local-only mode; the
  anonymous AI route is planning-only and cannot execute a workflow.
- **No browser AI/provider secrets.** No OpenAI / Hermes / gateway / provider token is ever sent to
  the browser. Signing of the limit cookie uses `node:crypto` server-side only.
- **Anonymous AI route is server-side only.** `/api/ai/anonymous-workflow-guidance` calls the
  gateway from the server; the client only ever sends a bounded goal + recent turns and receives
  advisory text + a validated plan + a non-applied preview.
- **Bounded input.** Goal text ≤ 2000 chars (`.strict` schema); recent conversation turns are
  bounded + sanitized client-side and re-bounded server-side.
- **Signed anonymous limit cookie.** HttpOnly, day-bucketed, HMAC-signed; a tampered/invalid/stale
  cookie reads as `0` (a fresh allowance, never an inflated one), so the count cannot be forged
  upward.
- **IP/day soft cap.** A per-instance in-memory backstop catches naive cookie-clear loops from one
  IP.
- **Production signing-key requirement (hardening `a7a9797eb`).** In production the route refuses to
  emit an unsigned (forgeable) cap cookie: with no signing key it fails closed with a typed
  `unavailable` response (sign-up CTA, no model call, no cookie, no attempt consumed).
- **Planning-only route cannot execute workflows.** No save/connect/run/activate path exists on the
  anonymous route — it returns guidance + a preview and nothing else.

## 4. Current caveats / accepted launch constraints

Stated honestly so the next reader does not over-trust the limit:

- **Anonymous AI limiting is best-effort without KV/Redis.** The signed cookie + per-instance IP cap
  are stateless / per-instance, not a durable cross-instance guarantee.
- **Cookie clearing grants a fresh browser window.** Clearing cookies resets the per-browser count;
  the IP backstop is per-instance (resets on deploy, diluted across multiple instances), so it
  bounds but does not eliminate determined cookie-clear loops.
- **Durable KV/Redis cap is a deliberate follow-up.** No shared store was introduced this arc; a
  KV-backed cap is the recommended abuse-hardening step before large public-launch scale.
- **Cross-browser / cross-device email-confirm cannot auto-restore localStorage.** A draft saved in
  one browser is not visible to an email-confirm link opened in a different browser/device. Mitigated
  (ANON-BUILDER-3) with a "finish in this same browser" note on the restore-flow auth pages and a
  "Copy prompt" backup that copies **only** the safe prompt string (no skeleton JSON, no secrets). A
  server-backed handoff token was intentionally not built (deferred pending a real
  expiry/size/abuse/ownership/cleanup design).
- **Model plan quality is probabilistic.** Guardrails: every plan is schema-validated, the preview is
  derived only from a validated plan and otherwise fails closed (null), and a deterministic
  catalog-backed inferer + explicit catalog-gap warnings cover the supported shapes when the model is
  silent.
- **No live production smoke was performed for this arc in this session.** Do not read this closeout
  as a production-verified sign-off; see §6 and §8.

## 5. Env / deploy notes

- **`ANON_AI_LIMIT_SIGNING_KEY`** — preferred signing key for the anonymous limit cookie; lets the
  anon cap key rotate independently of OAuth state signing.
- **`OAUTH_STATE_SIGNING_KEY`** — accepted fallback (same HMAC key class; the cookie carries no
  secret, only `count.day.signature`). The current production env already sets this, so anonymous AI
  planning is signed and live via the fallback today.
- **Production must have one of those keys.** With neither set, the anonymous AI route returns the
  typed `unavailable` response and **does not call the model** (fail closed) — it never runs uncapped
  or with an unsigned cookie.
- **No new DB migration, KV, or Redis** was introduced anywhere in this arc.
- **No new provider scopes** are required by this arc.
- Documentation: `.env.example` documents `ANON_AI_LIMIT_SIGNING_KEY` + the prod requirement + the
  fallback; [v2-go-live-status.md](../v2-go-live-status.md) carries the prod signing-key note.

## 6. Test / verification summary

Per the per-slice commit reports (the numbers below are **inherited from those commits**, not
re-measured by this docs-only closeout):

- **typecheck** — green (`tsc --noEmit`) at each slice.
- **lint:structure** — green (leaf-folder counts within limit) at each slice.
- **eslint (touched files)** — green, 0 warnings, at each slice.
- **Anonymous builder / restorer tests** — `lib/anonymousBuilder` (storage/sanitizer/idempotent
  restore-target), `AnonymousBuilder` (local-only gating + seeding + persistence),
  `AnonymousDraftRestorer`, `RestoredDraftBanner`, `useRestoredDraftHandoff`, `anonHandoffPages`,
  `WorkflowBuilder`.
- **Anonymous AI route / limit / client tests** — `anonAiLimit` (signed round-trip, tamper→0,
  stale-day, IP cap, prod signing requirement), `anonymous-workflow-guidance-route` (no-auth
  plan+preview+remaining, server-side cap → no model call, deterministic backup, fail-closed, 503
  no-consume, bounds, prod-no-key unavailable, prod-with-key signs), `AnonymousAgentRail` (auto-plan
  → auto-show, recent turns, limit + unavailable CTAs).
- **Authenticated live-skeleton regression tests** — `WorkflowGuidancePanel` (auto-show / supersede /
  eligibility guard), `builder-apply-preview`, `inferDeterministicPreview`,
  `buildGatewayGuidancePrompt`, `ai-workflow-guidance-route`.
- **Structure allow-list tests** — `api-route-authorization` updated to list the public anonymous
  route(s) with justification.

**Verification actually run in this closeout session:** only `npm run lint:structure` (docs-only
change; see §8). The full suites above were **not** re-run this session — they are inherited from the
arc commits. No known unrelated pre-existing failures are attributed to this arc.

**Note on the superseded SKELETON-2 route:** `327759dea` (SKELETON-2) added a deterministic-only
`POST /api/ai/anon-skeleton` route + `lib/api/ai/anonSkeleton.ts`. `812b48293` (SKELETON-3)
**removed both** and replaced them with the AI-planning route; the deterministic inferer +
`detectCatalogGap` live on, reused server-side as the backup. So SKELETON-2's user-facing surface is
not part of the shipped end state — it was an intermediate step.

## 7. Commit chain

Chronological (oldest → newest), all real commits on `v2-main`, all **local-only / unpushed**:

- `2e2dd8b70` — anonymous homepage prompt → local builder handoff (ANON-BUILDER-1) _(2026-06-23)_
- `668766cd4` — restore anonymous draft + prompt into a real workflow after sign-up (ANON-BUILDER-2)
  _(2026-06-23)_
- `e72827d1e` — harden anonymous draft restoration (ANON-BUILDER-3) _(2026-06-23)_
- `663ae0178` — React Agent live skeleton preview while chatting (REACT-LIVE-SKELETON-1)
  _(2026-06-23)_
- `327759dea` — free deterministic anonymous skeleton on `/start` (REACT-LIVE-SKELETON-2) — later
  **superseded** by SKELETON-3 _(2026-06-23)_
- `812b48293` — limited anonymous AI planning on `/start` (REACT-LIVE-SKELETON-3) _(2026-06-23)_
- `a7a9797eb` — fail closed when the anonymous AI limit cookie can't be signed in prod (anon-AI
  signing hardening) _(2026-06-23)_

## 8. Launch readiness conclusion

**Launch-acceptable.** The arc is feature-complete, the security boundary is intact (no anonymous
writes / provider calls / secrets; server auth unchanged), and production fails closed when it can't
sign the anonymous cap. The accepted constraints in §4 are abuse-hardening and cross-device-UX
limitations, not correctness or security holes.

Before deployment:
- Run a final **local smoke** (homepage → `/start` → plan → auto-show → Apply → gate → sign-up →
  `/start/continue` restore → banner), and ideally a **production smoke** of the public anonymous
  route once deployed. None was performed in this session — do not treat this doc as a
  production-verified sign-off.
- Confirm production has `ANON_AI_LIMIT_SIGNING_KEY` or `OAUTH_STATE_SIGNING_KEY` set (the latter is
  already set, so anonymous AI is signed today).

After deployment:
- **Durable KV/Redis rate limiting** can wait until real abuse/traffic appears or until a major
  public-launch scale event — it is the strongest next abuse-hardening track but is not a launch
  blocker.

The **push / deploy decision remains with Marcus** — this arc and this closeout are local-only.

## 9. Recommended next tracks

- **Durable anonymous cap (KV/Redis).** Replace the best-effort cookie + per-instance IP backstop
  with a shared-store cap when abuse/scale warrants it.
- **Server-backed anonymous handoff token.** Optional cross-browser/device restore (with a real
  expiry/size/abuse/ownership/cleanup design) to remove the same-browser constraint.
- **Production smoke of the public anonymous route** post-deploy, folded into the go-live status
  record.

## 10. Closeout confirmation

Docs-only. Nothing pushed. Doc path:
`docs/slices/phase-4/workflows/homepage-anonymous-builder-live-skeleton-closeout.md`.
