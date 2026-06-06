# Phase 4 slice docs — index

Phase 4 produced a large set of slice plans, audits, and closeouts. To keep each
directory under the repo's leaf-folder file limit (`npm run lint:structure`, ≤ 50
files per directory), the docs are grouped into topical subfolders.

## Subfolders

- [`account-model/`](./account-model/) — account ownership model + lifecycle
  closeouts: account-model/deletion-flow/switcher closeouts and switcher audits.
- [`account-settings/`](./account-settings/) — account settings, security/access,
  plan & billing settings, task-cost foundation closeout, reserve-reconcile rollout
  readiness.
- [`team/`](./team/) — Team/Org accounts: invitations & roles, member limits, org
  creation, the Team-page switcher, and Team-workflow collaboration + credential
  sharing/access closeouts.
- [`workflows/`](./workflows/) — workflow builder, runs/workflows/apps/home pages,
  the app shell, the page-implementation guide, and workflow folders (tree / bulk
  actions).
- [`ai/`](./ai/) — AI/React-Agent audits and the OpenAI adapter + e2e smoke test.
- [`providers/`](./providers/) — per-provider metadata-coverage plans (Airtable,
  Excel, Google Drive, OneDrive, Outlook Calendar, Teams, Trello), the Stripe
  trigger-meta plan, and the runtime-metadata completeness audit.

## Root (kept at `docs/slices/phase-4/`)

Docs referenced **by code** (source/test/migration comments cite their path) are
kept at the stable phase-4 root so those references stay valid — e.g. the account
foundation/cutover/transfer plans, the AI architecture + planner audits, the
billing foundation/reserve-reconcile design, `provider-metadata-launch-gap-tracker.md`
(cited by `CLAUDE.md` + the roadmap), and several active plans. The phase-level
[`phase-4-readiness-closeout.md`](./phase-4-readiness-closeout.md) also lives here.

> This README and the subfolders are a **docs-only** reorganization
> (4.DOCS-STRUCTURE-1). No source, migration, test, or product behavior changed;
> in-doc relative links were updated to the new paths.
