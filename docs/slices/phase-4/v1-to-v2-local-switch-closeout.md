# V1 → V2 Local Switch — Closeout

**Type:** Decision record / closeout. **Docs-only. Nothing pushed.**
**Date:** 2026-06-09
**Branch:** `builder-ui-v1-audit-1`
**Scope:** Make the "V2 is the active app" decision durable inside the V2 repo so
future chats/tools start from the right place.

---

## 1. Decision

- **ChainReactV2 is the active app/codebase for all ongoing work.**
- **`chainreact-app-9e` (V1) is archived / reference only.**

| Role | Location |
|---|---|
| Active app (build here) | `c:\Users\marcu\source\repos\ChainReactV2` |
| Archived V1 (reference) | `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e` |

This was a **local-only, in-place archive** switch — declarative, not a file move.

## 2. What changed

Marker files / banners only (additive, reversible):

- **V2** (this repo, `builder-ui-v1-audit-1`, commit `6d0aed8f4`): PRIMARY/ACTIVE
  banner added to [`CLAUDE.md`](../../../CLAUDE.md) + [`README.md`](../../../README.md).
- **V1** (`chainreact-app-9e`, `marcus_dev`, commit `9b964dd05`): new `LEGACY.md`
  archive notice + an ARCHIVED banner atop its `CLAUDE.md`.

**No source, config, path, or structural changes:** no `package.json`,
`next.config`, `tsconfig`, env, `supabase/migrations`, CI, or import-alias edits.
**No directories moved. No files deleted.**

## 3. What did NOT change

- **GitHub `main` still points to V1.** The remote's canonical/deploy branch is
  unchanged.
- **The V2 branch is still local / unpushed** — every V2 commit lives only on
  this machine.
- **No live-provider validation** (OAuth / webhook / Stripe / per-provider) was
  started — that remains the post-switch live-validation phase.
- **No public launch.** No push, no PR.

## 4. Why "in-place archive" was chosen

V1 and V2 are **two separate local clones of the same GitHub remote**
(`Chain-React-Org/chainreact-app`) on different branches — **not** one repo with
`v1/` and `v2/` subfolders. Given that, and with push still disallowed:

- **Avoids git-history collapse** — physically merging the two clones would
  flatten one side's history into a single copy-commit.
- **Avoids path/config/migration conflicts** — both apps have their own
  `package.json`, scripts, docs, and `supabase/migrations`; they only stay clean
  because they live in separate directories.
- **Reversible** — the switch is just the banners + `LEGACY.md`; deleting them
  reverts the designation. Nothing is destroyed.

The alternative menu option "move V1 to `archive/v1`, V2 to root within the repo"
was **infeasible** here (no single containing repo) and was not done.

## 5. Future promotion plan (PLACEHOLDER — do not decide now)

Making V2 the canonical app that actually deploys is a **separate, later,
push-gated** step. Open decisions to resolve **only when push is allowed** and we
are ready for the live-testing/replacement phase:

- **How to promote V2 to remote `main`:** force-push V2 as the new `main`, vs
  open a PR / merge into `main`. V2's history vs the current remote `main` (=V1)
  needs reconciling (the two clones don't share local refs; relationship is
  unverified locally).
- **What to do with the V1 branch on the remote** (tag/branch as `v1-archive`,
  etc.).
- **Sequencing of live-provider validation** after the remote switch.

**Do not work on remote/main promotion now.** It is explicitly deferred.

## 6. Working rule going forward

- **All net-new work happens in ChainReactV2.**
- **V1 may be referenced for parity only** (V2's `CLAUDE.md` already points back
  to `chainreact-app-9e` as the V1 source/reference when porting provider
  behavior).
- **Do not add new responsibilities to V1.** It is read-only reference; no new
  features land there.

---

## Verification / honesty notes

- **Docs-only this session.** This closeout adds one file; no code/tests run for
  it (no repo docs-lint exists — only `lint:structure` / `lint:migrations`,
  neither of which applies to a markdown doc).
- The two marker commits (`6d0aed8f4` V2, `9b964dd05` V1) are **real and local**;
  neither repo has been pushed.
- Commit hashes are accurate as of writing; this doc's own commit will follow.
