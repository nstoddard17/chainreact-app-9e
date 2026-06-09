# ⚠️ ARCHIVED — ChainReact V1 (reference only)

**This directory is the V1 legacy app, retained as archived/reference code.**
Active development has moved to **ChainReactV2**, which is now the primary
ChainReact app/codebase.

| | Location |
|---|---|
| **Active app (build here)** | `c:\Users\marcu\source\repos\ChainReactV2` |
| **This repo (archived V1)** | `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e` |

## Status (2026-06-09)

- ChainReactV2 was designated the **primary app** via a **local-only, in-place
  archive** switch. **No files were moved**: V1 and V2 are two separate local
  clones of the same GitHub remote (`Chain-React-Org/chainreact-app`), and V2's
  branch is **unpushed** (local-only).
- This repo is **not destroyed** — it remains a complete, recoverable reference.
- The switch is **fully reversible**: it is just this notice + the banner in
  [CLAUDE.md](./CLAUDE.md). Removing them reverts the designation.

## Rules while archived

- **Do not build new features here.** New work goes in ChainReactV2.
- This repo stays valuable as the **V1 source/reference** when porting provider
  behavior into V2 (V2's `CLAUDE.md` points back here for exactly that).
- Nothing here has been deleted; useful reference docs/code are preserved.

## Still pending (separate, later steps — NOT done by this local switch)

- **GitHub `main` promotion:** making V2 the canonical branch that deploys
  requires a **push** (deferred — no push yet) and a history strategy
  (V2's unpushed branch vs the remote `main`, which is still V1).
- **Live-validation phase** (after the switch path is ready): live OAuth /
  webhook / Stripe / per-provider validation. These were always sequenced
  **after** making V2 the active app and do not block it.
