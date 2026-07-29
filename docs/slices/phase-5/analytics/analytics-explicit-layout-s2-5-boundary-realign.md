# Explicit layout S2.5 — module-boundary realignment (ANALYTICS-EXPLICIT-LAYOUT-S2.5-BOUNDARY-REALIGN-1)

**Status:** accepted and implemented (local only).
**Date:** 2026-07-28
**Preceded by:** [audit](./analytics-edit-mode-layout-audit.md) · S1 engine `0343e7065` ·
[S2 contract](./analytics-explicit-layout-s2-contract.md) `97c72907a`
**Kind:** mechanical ownership/import correction. **Zero product-behaviour change.**

---

## 1. Why

S1 landed the pure layout engine under `features/analytics/layout/` — the location
the plan specified at the time. S2 then had to consume it from the server, which
made `services/analytics/dashboards.ts` and `app/api/analytics/_shared.ts` the
**first server → `features/` imports in the repository**. Safe (the modules are
pure) but backwards, and about to get worse: S3 and S4 add several more call
sites. S2.5 fixes the direction once, before that happens.

---

## 2. Canonical ownership after S2.5

```
contracts/analytics.ts        persisted shape + canonical constants
  ↑
core/analytics/layout/        pure placement arithmetic  ── the engine
  ↑                    ↑
services/analytics/    features/analytics/
  ↑                          (UI: preview + rendering)
app/api/analytics/
```

| Layer | Owns | May import |
| --- | --- | --- |
| `contracts/analytics.ts` | `AnalyticsWidgetSchema`, `AnalyticsWidgetLayoutSchema`, `ANALYTICS_CANONICAL_COLUMNS`, `ANALYTICS_SIZE_FOOTPRINT` | zod |
| `core/analytics/layout/` | geometry, validation, first-fit, push-down placement, resize, legacy migration, read normalization, write serialization, typed results | `contracts/` + siblings **only** |
| `services/analytics/` | orchestration, board-level write validation, the read chokepoint | `core/`, `contracts/`, `repositories/` |
| `app/api/analytics/` | auth, parse, call a service, format the response | `services/`, `contracts/`, framework |
| `features/analytics/` | UI and edit-session code | `core/analytics/layout`, `contracts/`, `lib/api/` |

**One public import path: `@/core/analytics/layout`.** Nothing remains under
`features/analytics/layout/` — deliberately not even a compatibility barrel,
which would have left two apparent import paths and ambiguous ownership.

Persisted Zod schemas stayed in `contracts/`. There is still exactly one size
map, declared in `contracts/analytics.ts` and re-exported by
`core/analytics/layout/widgetSizeMap.ts`.

---

## 3. The route-boundary repair

Before, the route helper imported `validateLayout` and applied the board rule
itself. Now the decision belongs to the service and the route only shapes the
response:

```ts
// services/analytics/dashboards.ts — owns the rule, on top of the core engine
export function checkDashboardLayout(
  widgets: readonly AnalyticsWidget[] | undefined,
): DashboardLayoutRejection | null
```

```ts
// app/api/analytics/_shared.ts — HTTP shell only
export function rejectInvalidWidgetLayout(widgets) {
  const rejection = checkDashboardLayout(widgets);
  if (!rejection) return null;
  return NextResponse.json({ error: rejection.message, ...(rejection.issues && { issues: rejection.issues }) }, { status: 400 });
}
```

Both write routes call it exactly where they did before. **Response codes and
payloads are byte-identical** — the same 400, the same `error` string, the same
`issues` array of problem codes and widget ids, and still no `issues` key on the
partly-placed refusal. There is no second validation pass and no new semantics.

---

## 4. What did NOT change

Every S1 behaviour: `ANALYTICS_CANONICAL_COLUMNS = 4`, edge-touching semantics,
first-fit search order, push-down policy, no automatic compaction, the stable
simultaneous-collision ordering, resize refusal at the right boundary, legacy
migration output, typed result codes, input immutability, deterministic output,
and reference preservation for unrelated widgets. The 106 engine tests assert the
same rectangles; only their import path and directory changed.

Every S2 behaviour: optional persisted `layout`, strict schemas, size/layout
footprint agreement, the persisted-vs-effective separation, `legacy-derived` /
`persisted` / `repaired-fallback`, typed partial and invalid problems, no eager
write-on-read, no silent widget loss, explicit persistence intent, title- and
config-only legacy preservation, board-level overlap validation, safe diagnostic
payloads, and the expand-then-write rollout guard.

No renderer, drag, resize, add-widget or responsive change. No schema semantics
changed. No database migration, no `db:push`, no row touched. **Nothing in this
batch produces explicit layouts.**

---

## 5. Boundary guards

`tests/structure/analytics-layout-boundaries.test.ts` (21 tests) proves, and keeps
proving as S3/S4 land:

- **No obsolete path** — no source file resolves an import specifier containing
  `features/analytics/layout` (aliased or relative). Prose may still name it as
  history; the check reads import specifiers, not raw text.
- **No leftovers** — `features/analytics/layout/` contains no files at all.
- **Single implementation** — `placeWidget`, `resizeWidget`, `validateLayout`,
  `findFirstAvailableRect`, `migrateLegacyOrderedLayout`,
  `normalizeDashboardWidgets` and `serializeDashboardWidgets` each have exactly
  one declaration site, inside `core/analytics/layout/`; `ANALYTICS_SIZE_FOOTPRINT`
  and `ANALYTICS_CANONICAL_COLUMNS` each have exactly one, inside `contracts/`.
  Re-exports are allowed; second declarations are not.
- **Core purity** — engine files import only `contracts/` and siblings, and
  mention no React, Next, DOM or CSS. (The repo-wide `core-purity` structure test
  and the `core/` eslint boundary now cover the engine automatically too.)
- **Route direction** — no file under `app/api/analytics/` imports `features/`,
  `@/core/analytics/layout` or a repository, and none calls layout arithmetic.
- **Consumer direction** — no `services/analytics/` file imports `features/`, and
  no `features/analytics/` file re-declares placement arithmetic.

---

## 6. Test tree

| Tests | Location |
| --- | --- |
| Pure engine (geometry, validation, first-fit, placement, resize, migration) — 106 | `tests/unit/core/analytics/layout/` |
| Contract, normalization, serialization, rollout guard | `tests/unit/features/analytics/` |
| Service round trip | `tests/unit/services/analytics/` |
| Route write guard | `tests/unit/app/api/analytics/` |
| Boundary structure guards | `tests/structure/` |

No test is duplicated across locations.
