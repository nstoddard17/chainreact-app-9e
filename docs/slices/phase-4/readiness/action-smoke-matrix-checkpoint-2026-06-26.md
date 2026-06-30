# Action smoke matrix checkpoint — 2026-06-26

**Lane:** provider action testing/greening only (no triggers, no Connected Apps /
Builder / React Agent / Hermes / templates / UI polish).
**Source of truth:** `npm run chainreact -- smoke actions --cert` (offline certification
inventory; no DB, no provider calls). Cert seed:
[scripts/chainreact/smoke/certificationSeed.ts](../../../../scripts/chainreact/smoke/certificationSeed.ts).
**Branch:** `v2-main`. **Nothing pushed.**

## 1. Current matrix (this checkpoint)

```
Totals: 298 registered, 119 LIVE_PASS, 26 not-run, 153 missing-fixture,
        0 blocked-env, 0 fail, 0 bug, 0 sandbox-required, 0 unsafe-no-harness.
```

No drift from the 2026-06-25 snapshot in `docs/PROJECT_MEMORY.md` (119 LIVE_PASS).

**Per-provider (registered / LIVE_PASS / NOT_RUN / MISSING / BLOCKED / FAIL / BUG):**

| Provider | reg | LIVE_PASS | not-run | missing |
|---|---|---|---|---|
| airtable | 11 | **11** | 0 | 0 |
| google-drive | 7 | **7** | 0 | 0 |
| google-sheets | 12 | **12** | 0 | 0 |
| microsoft-onedrive | 7 | **7** | 0 | 0 |
| notion | 16 | 13 | 0 | 3 |
| microsoft-onenote | 12 | 9 | 0 | 3 |
| slack | 31 | 9 | 1 | 21 |
| trello | 8 | 6 | 0 | 2 |
| hubspot | 26 | 7 | 0 | 19 |
| microsoft-teams | 8 | 5 | 0 | 3 |
| microsoft-excel | 13 | 5 | 0 | 8 |
| google-calendar | 5 | 4 | 0 | 1 |
| microsoft-outlook-calendar | 5 | 4 | 0 | 1 |
| gmail | 15 | 3 | 0 | 12 |
| microsoft-outlook | 11 | 3 | 0 | 8 |
| google-docs | 5 | 2 | 0 | 3 |
| facebook | 8 | 1 | 0 | 7 |
| mailchimp | 14 | 4 | 0 | 10 |
| dropbox | 11 | 7 | 1 | 3 |
| google-analytics | 6 | 0 | 4 | 2 |
| monday | 24 | 0 | 10 | 14 |
| stripe | 16 | 0 | 4 | 12 |
| discord | 5 | 0 | 1 | 4 |
| github | 6 | 0 | 0 | 6 |
| shopify | 11 | 0 | 0 | 11 |
| native | 5 | 0 | 5 | 0 |

**Write-COMPLETE providers (every registered action LIVE_PASS):** airtable, google-drive,
google-sheets, microsoft-onedrive.

## 2. Read-fixture frontier is exhausted

The only remaining read-style (`get_/list_/fetch_/search_/find_/read_`) MISSING actions
are all **policy-excluded** (raw bytes / signed URL / block content), consistent with the
prior batches' "no raw bytes / signed URLs" rule:

- `gmail:get_attachment`, `microsoft-outlook:get_attachment` — attachment bytes.
- `dropbox:get_temporary_link` — signed URL.
- `notion:get_block`, `notion:get_block_children` — block content.

So the next greenable batches are **write** batches (create → independent read-back →
cleanup), or remaining unconnected-provider reads (monday / stripe / discord / github /
shopify) that depend on a connected smoke account.

## 3. Next batch SELECTED — `google-docs:update_document` (smallest safe write)

**Why this is the smallest safe batch:**
- **1 action.** Brings google-docs 2/5 → 3/5; after it, the only google-docs MISSING are
  policy-excluded (see §4), so google-docs becomes "write-complete modulo policy."
- **Fully precedented, safe cleanup.** It reuses the exact certified pattern from
  SMOKE-WRITE-23 (`google-docs:create_document`, `LIVE_PASS_CLEANED`) + SMOKE-WRITE-27
  (Sheets create → mutate → **independent** read-back → cross-provider
  `google-drive:delete_file` permanent hard-delete): setup creates a marker-titled
  smoke-owned Doc → `update_document` edits it → **independent** `get_document`
  (already `LIVE_PASS`) read-back confirms the marker+suffix on the persisted content
  (handler echo never trusted) → whole Doc hard-deleted via cross-provider Drive delete
  (a documentId IS a Drive file id). Smoke-owned throughout; true erase.
- **No forbidden category:** not a send/broadcast, not billing, not a sharing link, not
  destructive-without-cleanup.

**LIVE cert is a gated operator run, not done in this checkpoint.** Greening to LIVE_PASS
requires `ALLOW_DB_INTEGRATION_TESTS=true` + `ALLOW_LIVE_PROVIDER_SMOKE=true` +
`ALLOW_LIVE_PROVIDER_WRITE_SMOKE=true` against a connected Google smoke account
(`SMOKE_ACCOUNT_ID` / `SMOKE_USER_ID`) via `npm run smoke:writes:live`. Per the
certification charter, **no `LIVE_PASS` cert row is added without a real live run** —
this checkpoint does not add one.

## 4. Classification of the remaining MISSING (so nothing is silently skipped)

**Forbidden by this lane (classify, never live-run):**
- `microsoft-teams:send_channel_message`, `:reply_to_channel_message`, `:send_chat_message`
  — send/broadcast.
- `google-docs:share_document` — sharing-permission/link mutation.
- All `stripe:*` create/update/cancel + `shopify:*` — billing/commerce mutations.
- `slack` sends/DMs (`send_direct_message`, `schedule_message`, …) — send/broadcast.

**Policy-excluded (raw bytes / signed URL / content):**
- `google-docs:export_document`, `gmail:get_attachment`, `microsoft-outlook:get_attachment`,
  `dropbox:get_temporary_link`, `notion:get_block(_children)`.

**Deferred — no safe cleanup / no independent verify (needs design before greening):**
- `microsoft-onenote:create_notebook`, `:create_section` — Graph exposes no API delete for
  notebooks/sections → would leave an un-cleanable artifact.
- `notion:create_database` — no archive-database action + no independent read-back
  (already documented deferred in the runbook).
- `trello:create_board`, `:create_list` — need a confirmed reversible cleanup
  (archive/delete) action before write-smoking.
- `microsoft-onenote:copy_page` — async (needs the `completeAsync` monitor-poll primitive,
  like `onedrive:copy_item`); medium effort, safe-but-not-smallest.

**Connected-account reads (greenable once the smoke account connects the provider):**
- `monday` (10 not-run), `stripe` reads (4 not-run, read-only finds — distinct from the
  forbidden billing mutations), `discord` (1 not-run), `google-analytics` (4 not-run —
  account exposes no GA property), plus `github` / `shopify` read surfaces.

## 5. Verification (this checkpoint, offline only)

- `npm run chainreact -- smoke actions --cert` → matrix above (offline inventory).
- `npx jest tests/unit/smoke-actions` → **33 suites / 381 tests pass** (incl.
  `fixtures-valid`, `certification`, registry-parity) — confirms the harness + matrix are
  internally consistent.
- No live provider calls, no DB writes, no cert rows added. **Nothing pushed.**

## 6. Next step (operator, gated)

Author the `google-docs:update_document` WRITE fixture (mirroring the Sheets
create→mutate→independent-read-back→Drive-delete fixtures) and live-cert it via
`npm run smoke:writes:live` with the three live gates + a connected Google smoke account.
On a green run (0 leaked), add its `LIVE_PASS_CLEANED` row to `certificationSeed.ts`.

## 7. Update — SMOKE-WRITE-34 fixture authored (2026-06-26, same day)

The `google-docs:update_document` WRITE fixture is now **authored + registered**
([tests/fixtures/action-smoke/google-docs/update_document.ts](../../../../tests/fixtures/action-smoke/google-docs/update_document.ts),
registered in [tests/smoke-actions/fixtures.ts](../../../../tests/smoke-actions/fixtures.ts)).
Phase plan: setup `create_document` (marker title+body, capture `documentId`) → execute
`update_document` append `<marker>updated` (`insertLocation:"end"`, never the body-wiping
`replace`) → verify independent `get_document` read-back (marker on flattened `content`,
`markerSuffix:"updated"`) → cleanup cross-provider `google-drive:delete_file`
(`permanent:true`, true erase). `destructiveSafe`, smoke-owned throughout.

**Matrix delta:** `google-docs:update_document` moved **MISSING_FIXTURE → NOT_RUN**.
Totals now **298 registered / 119 LIVE_PASS / 27 not-run / 152 missing / 0 fail / 0 bug**;
google-docs **5 / 2 / 1 / 2**.

**Live run status: LIVE_NOT_RUN_READY.** The three live gates
(`ALLOW_DB_INTEGRATION_TESTS`, `ALLOW_LIVE_PROVIDER_SMOKE`,
`ALLOW_LIVE_PROVIDER_WRITE_SMOKE`) are **unset** in this environment (they are explicit
per-run operator opt-ins, not in `.env.local`), so the gated live write run was **not**
performed and **no `LIVE_PASS` cert row was added** (charter: no cert without a real live
pass). `SMOKE_ACCOUNT_ID` / `SMOKE_USER_ID` are present; the remaining precondition is the
operator enabling the gates against a connected Google smoke account, then
`npm run smoke:writes:live`. On a green run (0 leaked) add the `LIVE_PASS_CLEANED` row to
`certificationSeed.ts`.

**Offline verification (this turn):** `npx jest tests/unit/smoke-actions` → 33 suites /
381 tests pass (incl. `fixtures-valid`, `certification`, registry-parity);
`npm run chainreact -- smoke actions --cert` → matrix delta above; `npx tsc --noEmit` →
exit 0; eslint on the 2 touched files → 0; `npm run lint:structure` → OK.

## 8. Update — SMOKE-WRITE-34 LIVE-CERTIFIED (2026-06-26, same day)

`google-docs:update_document` is now **`LIVE_PASS_CLEANED`**. Ran the targeted live write
smoke against the connected Google smoke account (gates set inline for the one command;
they are safety opt-ins, not secrets):

```
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
ALLOW_LIVE_PROVIDER_WRITE_SMOKE=true ALLOW_DESTRUCTIVE_PROVIDER_SMOKE=true \
SMOKE_PROVIDER=google-docs SMOKE_GOOGLE_DOCS_CONNECTED=1 npm run smoke:writes:live
```

(`ALLOW_DESTRUCTIVE_PROVIDER_SMOKE` is also required — the fixture is `destructiveSafe`:
its cleanup is a smoke-owned delete. `SMOKE_PROVIDER=google-docs` scopes the run to
google-docs only, so no other provider's writes execute.)

**Live result — PASS, 0 leaked:**
```
PASS  google-docs:update_document [destructiveSafe]
    setup ok · execute ok · verify ok · verify ok — marker confirmed on read-back · cleanup ok
    created 1 / cleaned 1 / remaining 0 (document) | artifact: cleaned
```
(`google-docs:create_document` re-ran in the same scoped sweep and also PASSED, created 1 /
cleaned 1 / 0 leaked.)

**Cert row added** to `certificationSeed.ts` (`SMOKE-WRITE-34`, `LIVE_PASS_CLEANED`,
2026-06-26). **Matrix:** `update_document` NOT_RUN → LIVE_PASS. Totals now **298 registered
/ 120 LIVE_PASS / 26 not-run / 152 missing / 0 fail / 0 bug**; google-docs **5 / 3 / 0 /
2** — only the policy-excluded `share_document` (sharing) + `export_document` (bytes)
remain. Re-verified: `--cert` shows `PASS_CLEAN google-docs:update_document (2026-06-26)`;
`tests/unit/smoke-actions` 381 pass; `tsc` exit 0; eslint 0; `lint:structure` OK.

## 9. Update — native logic actions LIVE-CERTIFIED (2026-06-26, same day)

Greened the safest NOT_RUN frontier: the **native** logic actions. They take NO provider
credentials, so they were the smallest safe batch. Ran the narrowest scoped live READ
sweep (no write/destructive gates needed — native is read-class):

```
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
SMOKE_PROVIDER=native SMOKE_NATIVE_HTTP_URL=https://example.com \
npm run smoke:actions:run:workflow:live
```

**Live result — 5 pass / 0 fail / 0 skip (Gate OK):** `native:delay`,
`native:format_transformer`, `native:http_request`, `native:if_then_condition`,
`native:router` each ran as a real TERMINAL workflow run in engine REAL mode. Read-class:
no external resource created, so created/cleaned/leaked is N/A.

**Cert rows added (4)** — `native:delay`, `native:if_then_condition`, `native:router`,
`native:http_request` → `LIVE_PASS` (2026-06-26). **`native:format_transformer` is
deliberately left NOT_RUN** — it is the always-run uncertified baseline that proves the
live harness path is real every sweep (certification.test guards this).

**Matrix:** Totals now **298 registered / 124 LIVE_PASS / 22 not-run / 152 missing / 0
fail / 0 bug**; native **5 / 4 / 1 / 0**. Re-verified: `--cert` shows the 4 native
`LIVE_PASS` rows + `format_transformer` NOT_RUN; `tests/unit/smoke-actions` 381 pass;
`tsc` exit 0; eslint 0; `lint:structure` OK.

**Remaining 22 NOT_RUN** are all connected-account reads that self-skip without the
provider connected on the smoke account: `monday` (10), `stripe` reads (4 — read-only
finds, not the forbidden billing mutations), `google-analytics` (4 — account exposes no
GA property), `dropbox:search_files` (needs a query), `discord:fetch_messages`, plus
`slack:delete_message` (destructive, non-liveSafe — inventory/handler-only). Next safe
batch depends on connecting one of those providers on the smoke account.

## 10. Update — dropbox:search_files LIVE-CERTIFIED + connection probe (2026-06-26, same day)

Probed the remaining NOT_RUN frontier with the live read sweep (CERT-SKIPs the 124 already
passed → no re-calls; self-skips unconnected providers). **Connection status on the smoke
account:**

| Provider | NOT_RUN reads | Status this run |
|---|---|---|
| **dropbox** | `search_files` | **CONNECTED → PASS** (ran with `SMOKE_DROPBOX_QUERY=test`) |
| discord | `fetch_messages` | not connected → SKIP |
| monday | 10 reads | not connected → SKIP |
| stripe | 4 reads | not connected → SKIP (scoped `SMOKE_PROVIDER=stripe`: 0/0/4) |
| google-analytics | 4 reads | connected, but **no usable GA account/property** (selector `accountId` auto-discovery finds nothing) → SKIP |

**Selected batch: `dropbox:search_files`** — the only connected, runnable read left.

```
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
SMOKE_DROPBOX_QUERY=test npm run smoke:actions:run:workflow:live
```

**Live result:** `dropbox:search_files` → **PASS** (read-only name-search, one bounded page
of file metadata — no bytes/signed-URLs/content; nothing created/cleaned/leaked). The
free-text query is Dropbox's one non-auto-discoverable selector, so it ran with a benign
`SMOKE_DROPBOX_QUERY`.

**Cert row added (1):** `dropbox:search_files` → `LIVE_PASS` (2026-06-26). Dropbox reads
now complete (`list_folder` + `get_file_metadata` + `search_files`).

**Matrix:** Totals now **298 registered / 125 LIVE_PASS / 21 not-run / 152 missing / 0
fail / 0 bug**; dropbox **11 / 8 / 0 / 3** (the 3 missing are `upload`/`download` + the
sharing-link write — write/policy-excluded). Re-verified: `--cert`, `tests/unit/smoke-actions`
381 pass, `tsc` 0, eslint 0, `lint:structure` OK.

**Remaining 21 NOT_RUN are all blocked on connection/data, not on this lane:** monday (10)
+ stripe (4) + discord (1) need the provider connected on the smoke account;
google-analytics (4) needs a GA account/property on the connected account;
`slack:delete_message` stays non-liveSafe (inventory-only); `native:format_transformer`
stays the uncertified baseline. No safe live cert is possible for them until a provider is
connected — the next lane move would be MISSING_FIXTURE fixture-building (e.g. a safe
write batch with cleanup) rather than the NOT_RUN frontier.

## 11. Runnable NOT_RUN frontier EXHAUSTED + MISSING_FIXTURE cleanup feasibility (2026-06-26)

Re-probed the live read sweep (fresh): **1 pass** (the `format_transformer` baseline),
**20 skip**, **73 cert-skip**, Gate OK — i.e. every remaining NOT_RUN read self-skips and
`dropbox:search_files` now CERT-SKIPs. **There is no connected, runnable read-only NOT_RUN
action left to certify.** The 21 NOT_RUN break down exactly as: monday 10 + stripe 4 +
discord 1 (not connected on the smoke account), google-analytics 4 (connected, no usable
GA account/property), `slack:delete_message` (non-liveSafe), `native:format_transformer`
(intentional baseline). Unlocking any requires CONNECTING that provider on the smoke
account (or adding a GA property) — outside what this lane can do alone.

**MISSING_FIXTURE next-batch feasibility (verified this turn, so it isn't re-investigated):**

| Candidate (connected provider) | Cleanup path | Verdict |
|---|---|---|
| `trello:create_list` | none — Trello's registered actions have **no list-archive/close action** (only `archive_card`) | **DEFER** — no safe teardown |
| `trello:create_board` | none — **no board-delete action** registered | **DEFER** — no safe teardown |
| `microsoft-onenote:create_notebook` | none — Graph has no notebook DELETE | **DEFER** — no teardown |
| `microsoft-onenote:create_section` | none — Graph has no section DELETE | **DEFER** — no teardown |
| `microsoft-onenote:copy_page` | `delete_page` (certified hard-delete) + `get_page_content` verify | **FEASIBLE but not small** — async via the **Graph operations** endpoint; the existing `completeAsync` primitive targets OneDrive's `*.svc.ms` copy monitor, so it needs harness plumbing for the OneNote operations poll (its own slice) |
| `notion:create_database` | none — no archive-database action + no independent read-back | **DEFER** |

Everything else MISSING is forbidden (sends/billing/sharing-link) or policy-excluded
(bytes/signed-URL/block-content).

**Conclusion / recommended next slices (in order):**
1. **Connect a NOT_RUN provider on the smoke account** (monday / a Stripe test account /
   discord, or add a GA property) → unlocks 1–10 read certs each with zero fixture work.
2. **`microsoft-onenote:copy_page`** as its own slice — extend the smoke `completeAsync`
   poller to the OneNote Graph-operations endpoint, then author + live-cert (OneNote is
   connected; cleanup via certified `delete_page`).

No cert row added this turn (nothing safely runnable); no fixture authored (no
small/safe MISSING candidate). Matrix unchanged at **125 LIVE_PASS / 21 not-run / 152
missing**.

## 12. SMOKE-WRITE-35 — `microsoft-onenote:copy_page` authored, LIVE CERT BLOCKED (2026-06-26)

Built the async OneNote copy infrastructure and attempted a live cert. **Authored +
offline-validated, but NOT certified** — the live attempt did not produce a clean pass.

**Async monitor support added (host allow-list UNCHANGED):**
- New smoke-only seam `microsoft-onenote:copy_monitor`
  ([tests/smoke-actions/writeHarnessDeps/onenoteCopyMonitor.ts](../../../../tests/smoke-actions/writeHarnessDeps/onenoteCopyMonitor.ts)),
  registered in the reader composer. It polls the OneNote Graph **operations** endpoint
  (`graph.microsoft.com/v1.0/me/onenote/operations/{id}`) to terminal completion and
  returns only the copied `{ pageId }`.
- **No host allow-list widening:** the OneNote operation URL is on the exact Graph base
  host, which `isTrustedGraphMonitorUrl` already trusts. The OneDrive `*.svc.ms` /
  `*.sharepoint.com` suffixes are untouched.
- **Key difference from the OneDrive monitor:** the OneNote operations endpoint is
  **authenticated**, so the poll sends a bearer token via `refreshAndRetry` (vs
  OneDrive's unauthenticated pre-signed monitor). Reuses the pure `pollAsyncCopyCompletion`
  loop + budget unchanged.
- Fixture [tests/fixtures/action-smoke/microsoft-onenote/copy_page.ts](../../../../tests/fixtures/action-smoke/microsoft-onenote/copy_page.ts):
  setup `create_page` → execute `copy_page` (into the same smoke section) →
  `completeAsync` poll → verify `get_page_content` → `cleanupEach delete_page` (source +
  copy, hard delete). Offline gates green (391 unit smoke tests incl. 10 new poller tests,
  fixtures-valid, parity; tsc clean on touched files; eslint 0).

**Live command:**
```
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
ALLOW_LIVE_PROVIDER_WRITE_SMOKE=true ALLOW_DESTRUCTIVE_PROVIDER_SMOKE=true \
SMOKE_PROVIDER=microsoft-onenote SMOKE_MICROSOFT_ONENOTE_CONNECTED=1 npm run smoke:writes:live
```

**Live result — BLOCKED, NOT certified:**
- `copy_page` → **VERIFY_FAILED**: execute SUCCEEDED but `completeAsync` reported *"async
  execute returned no monitor URL to complete"* — the handler's `operationLocation` came
  back **empty/null** for this run, so the operation poll had no URL. (The write harness
  reads the persisted `step.output`, which preserves handler fields — OneDrive's
  `monitorUrl` reads fine the same way — so this is a genuinely-null `operationLocation`,
  not a harness-stripping artifact.) **Root cause not yet pinned** (per "don't guess"):
  candidates are (a) Graph returned 202 without an `Operation-Location` header under the
  current account state, or (b) copying a page into the **same** section it already lives
  in behaves differently (the harness discovers only ONE smoke section, so same-section
  copy is currently the only option).
- **Concurrent env instability:** the pre-existing certified `microsoft-onenote:update_page`
  and `delete_page` fixtures ALSO **FAILED** this run with Graph *"onenote page … not
  found: The specified resource ID does not exist"* immediately after creating the page —
  classic OneNote **create→read propagation lag**. The OneNote smoke account is currently
  unreliable for create-then-act flows, which undermines any copy_page cert attempt right
  now. (`create_page` alone PASSED.)

**Leak disclosure:** `copy_page`'s execute (the Graph copy POST) succeeded, so a copied
page was likely created server-side, but its id was never captured (null
`operationLocation`) → it is **untracked** and may remain in the smoke/test section
(marker-titled `crsmoke-…page`). The source page WAS cleaned (created 1 / cleaned 1). The
untracked copy should be swept from the smoke section. **Do not re-run `copy_page` live
until the `operationLocation` behavior is understood** — each failed run can leave one
untracked copy.

**Classification:** **env/provider blocker** (null `operationLocation` + OneNote
create→read lag), NOT a harness or fixture-logic bug (offline-validated). **No cert row
added.** Fixture stays **NOT_RUN**. Matrix: **125 LIVE_PASS / 22 not-run / 151 missing**
(copy_page MISSING_FIXTURE → NOT_RUN; no LIVE_PASS change).

**Next steps to unblock:** (1) instrument `pagesCopyToSection` to confirm whether Graph
returns 202 + `Operation-Location` for the smoke copy (synchronous-vs-async + same-section
question); (2) teach the live dev test to discover/create a SECOND smoke section so the
copy targets a DIFFERENT section; (3) re-run when the OneNote smoke account is not lagging
(create_page/update_page/delete_page all green again); then add the
`LIVE_PASS_CLEANED` row.

## 13. SMOKE-WRITE-35 unblock — ROOT CAUSE FOUND + FIXED, cert still deferred (2026-06-26)

Live-instrumented the OneNote copy (one-off diagnostic
[scripts/trash/onenote-copy-diagnose-and-sweep.ts](../../../../scripts/trash/onenote-copy-diagnose-and-sweep.ts),
marker-scoped to the smoke `[TEST]` section). **Root cause of the null `operationLocation`
— confirmed with evidence:**

- OneNote `copyToSection` returns **202 with the operation URL in the `Location` header,
  NOT `Operation-Location`** (the spec/most-Graph-ops header — absent here). The 202 BODY
  is a separate async-operation resource (`{ id, status:"not started" }`). The production
  wrapper read only `Operation-Location` → always `null` → copy un-pollable. **This was a
  real production bug** (workflow authors got a null operation URL too).
- **Further evidence:** GET-ing that `Location` URL returns the **copied PAGE resource
  itself** (`id, title, contentUrl, parentSection…`, HTTP 200 at +2s) — there is **no
  status-bearing operation endpoint to poll**. So the copy is effectively done as soon as
  the `Location` resolves; its page id is right there.

**Fixes (both verified live):**
1. **Production wrapper** [pagesCopyToSection.ts](../../../../integrations/microsoft-onenote/api/pagesCopyToSection.ts):
   `operationLocation = Operation-Location ?? Location` (prefer spec header, fall back to
   the one OneNote actually uses). +3 wrapper unit tests.
2. **Smoke seam** [onenoteCopyMonitor.ts](../../../../tests/smoke-actions/writeHarnessDeps/onenoteCopyMonitor.ts):
   `normalizeOneNoteOperation` now treats a **page-resource** body (no `status`, has `id`)
   as `completed` with `resourceId = body.id` (status checked first, so an operation
   resource's own id is never mistaken for a page id). +2 unit tests.

**Live verification (scoped `SMOKE_PROVIDER=microsoft-onenote`):** `copy_page` now runs
`setup ok → execute ok → async operation completed; resource captured → verify ok →
marker confirmed on read-back`. **The core blocker is solved** — async capture +
independent verification work end-to-end.

**Remaining blocker (why still NOT certified): OneNote create→delete propagation lag.**
`copy_page`'s `cleanupEach` deletes source + copy; one delete failed (`CLEANUP_FAILED`,
1 left) because a just-created page wasn't yet deletable. The pre-existing **certified**
`delete_page` fixture FAILED the **same** run with the same lag — so this is an
**environmental OneNote eventual-consistency** issue, not specific to `copy_page` (an
earlier run had all three of create/update/delete_page green; it is intermittent).

**Sweep:** after each run, swept the smoke section for `crsmoke-` pages —
**found N / deleted N / remaining 0** (re-confirmed stable at 0; nothing leaked).

**Cert decision:** NOT certified (per "do not certify yet", and cleanup did not reach
`remaining 0` for `copy_page`). Fixture stays **NOT_RUN**. Matrix unchanged: **125
LIVE_PASS / 22 not-run / 151 missing**.

**Next slice to certify:** add a **bounded, smoke-only delete retry** (retry-with-backoff
+ treat a 404 as already-cleaned/idempotent) to the write-harness cleanup step — this
absorbs the OneNote create→delete lag for BOTH `copy_page` and the flaky `delete_page`
fixture. Then a clean `copy_page` run (all phases ok, remaining 0) earns the
`LIVE_PASS_CLEANED` row. (The dual-section-copy idea from §12 is NOT needed — same-section
copy works fine; the only real issues were the `Location` header + delete lag.)

## 14. SMOKE-WRITE-35 — bounded cleanup retry SHIPPED; copy_page still NOT certified, true root cause found (2026-06-26)

Built the bounded smoke-only cleanup retry from §13's recommendation AND ran it live.
**The retry is correct, bounded, and tested — but it does NOT certify `copy_page`, because
a live diagnostic proved the real blocker is NOT propagation lag.** `copy_page` stays
**NOT_RUN**; **no cert row added**.

**What shipped (harness-only, no production change):**
- New pure helper [tests/smoke-actions/cleanupRetry.ts](../../../../tests/smoke-actions/cleanupRetry.ts):
  `runCleanupStepWithRetry` + `cleanupRetryPolicyFor` (eligible for `microsoft-onenote:delete_page`
  ONLY — every other cleanup keeps exact single-attempt behavior) + `isNotFoundReason`.
  Budget `ONENOTE_PAGE_DELETE_RETRY` = **4 attempts / 750ms backoff / 3000ms total cap**
  (no infinite polling). A transient (non-404) failure retries within the cap; a `404 /
  not found` on a SMOKE-OWNED current-run ledger id short-circuits to `already_cleaned`;
  an exhausted non-404 returns `failed` (CLEANUP_FAILED — never masked).
- Wired into BOTH the `cleanupEach` and single-`cleanup` branches of
  [writeHarness.ts](../../../../tests/smoke-actions/writeHarness.ts) (cleanup phase only;
  the `executeIsCleanup` delete path — `delete_page` — is untouched). `sleep` is injected
  (default real `setTimeout`) so units run instantly + assert the wait budget.
- Tests: [tests/unit/smoke-actions/cleanup-retry.test.ts](../../../../tests/unit/smoke-actions/cleanup-retry.test.ts)
  — 23 tests: retry-then-succeed, 404-already-cleaned (smoke-owned only), non-404 fails
  after bounded retries, non-OneNote unchanged (policy null), bounds (attempts ≤ max,
  cumulative wait ≤ cap), + orchestrator wiring through `copy_page`'s `cleanupEach`.

**Live runs (scoped `SMOKE_PROVIDER=microsoft-onenote`, all 4 live gates):** two runs.
Run 1 hit a broad lag window (`create_page` VERIFY_FAILED on create→read lag, `delete_page`
FAIL at its **execute** delete — outside cleanup-retry scope). Run 2 was calm:
`create_page` / `update_page` / `delete_page` all **PASS**, but `copy_page` still
**CLEANUP_FAILED** (created 2 / cleaned 1 / remaining 1).

**Root cause — proven by a live diagnostic, not guessed**
([scripts/trash/onenote-copy-delete-lag-probe.ts](../../../../scripts/trash/onenote-copy-delete-lag-probe.ts)):
**Graph `copyToSection` into the SAME section a page already lives in does not yield a
distinct, capturable copy.** The 202 `Location` resource resolves to the **source page's
own id** (`copied id === source id`, confirmed across 3 probe runs). So the harness:
1. captures the source id a SECOND time under ledger key `copy` (duplicate entry, same
   external id);
2. `verify` "passes" by reading that id — but it is reading the **source**, never a real
   copy;
3. `cleanupEach` deletes the id once (ok), then the second delete of the **same id** 404s
   — which the engine humanizes to the generic *"Workflow step failed"* (the typed
   `NotFoundError` is masked before it reaches the harness), so the `already_cleaned`
   path can't fire → false **"leaked 1"** + CLEANUP_FAILED.
   (A section listing 2s post-copy showed only the **1** source page; a later sweep also
   surfaced same-title/different-id residue — i.e. when a distinct copy *is* created its
   id is the one the `Location` header never returns, so it is orphaned. Either way the
   captured id is wrong.)

This **corrects §13**, which wrongly dismissed the dual-section idea ("same-section copy
works fine"). It does not. **§12's dual-section requirement was right.**

**Why this is NOT certified (honest call):** making the duplicate-id second delete read as
`already_cleaned` would turn `copy_page` green, but it would be certifying a test that
never copies to a distinct location and never verifies a real copy — a green check on a
no-op. Per the charter (and rules: do not mask a cleanup failure; certify only at an honest
remaining 0) **no cert row was added.** The cleanup-retry primitive is still correct and
valuable — it absorbs genuine transient delete lag and is the right idempotency primitive —
it simply is not what `copy_page` needs.

**Exact remaining blocker to certify `copy_page`:** copy into a **DIFFERENT** smoke section
so the `Location`-resolved/captured id is genuinely the distinct copy. That needs a SECOND
pre-existing smoke/test-named section on the smoke account (the dev test would discover it,
like the first) — `create_section` has no Graph delete, so the harness can't self-provision
one without leaking. This is a separate slice (fixture targets a second `targetSectionId` +
dev-test discovers two sections); it depends on the operator adding a second `[TEST]`
section. A secondary hardening (independent, optional): surface the typed `NotFoundError`
through the harness `runActionStep` reason so the `already_cleaned` path can fire in the
live engine path for genuine idempotent re-deletes.

**Leak status:** swept the smoke section after every run/probe — **remaining 0** `crsmoke-`
pages (re-confirmed; the 5 pages left are pre-existing user content).

**Created / copied / cleaned / leaked (final state):** across the diagnostic the source was
created + deleted each time; no distinct copy was ever captured/verifiable; after sweep
**0 leaked**.

**Offline verification (this turn):** `tests/unit/smoke-actions` → **35 suites / 416 tests
pass** (incl. the 23 new cleanup-retry tests); `npx tsc --noEmit` → exit 0; eslint on the 3
touched files → 0; `npm run lint:structure` → OK; `npm run chainreact -- smoke actions
--cert` → matrix **unchanged** (`copy_page` NOT_RUN; **125 LIVE_PASS / 22 not-run / 151
missing / 0 fail / 0 bug**). **Nothing pushed.**

## 15. SMOKE-WRITE-36 — `microsoft-excel:create_worksheet` LIVE-CERTIFIED (2026-06-26)

Next safe MISSING_FIXTURE batch after parking `copy_page`. **`microsoft-excel:create_worksheet`
is now `LIVE_PASS_CLEANED`.** This is the first Excel WRITE cert and unlocks the Excel-write
bootstrap pattern (a hand-built minimal workbook) for the remaining Excel writes.

**Why this action (smallest safe Excel write):**
- Excel has **no `create_workbook` action**, so an Excel write must bring its own smoke-owned
  workbook. `create_worksheet` is the smallest action with a clean **independent** verify
  (`get_worksheets`, already `LIVE_PASS`) and a fully smoke-owned **whole-file** cleanup. It
  mutates only a throwaway workbook, never user/customer data; no send/broadcast/billing/sharing.

**Bootstrap pattern (new, reusable):**
- Setup uploads a **frozen minimal `.xlsx`** ([tests/smoke-actions/minimalXlsx.ts](../../../../tests/smoke-actions/minimalXlsx.ts)
  — 1898-byte hand-built OOXML, one `Sheet1`, no deps) via the certified
  `microsoft-onedrive:upload_file` (inline base64), capturing the drive-item id as the
  `workbookId`. A live probe confirmed Graph's workbook API **opens** it (`worksheets` →
  `["Sheet1"]`, `worksheets/add` succeeds).
- Execute `create_worksheet` adds `"{{marker}}ws"`; verify reads `get_worksheets` and confirms
  the marker(+suffix `ws`) on a persisted worksheet name; cleanup deletes the **whole workbook**
  via `microsoft-onedrive:delete_item` (SAME provider that created it — **not** cross-provider).
- Fixture: [tests/fixtures/action-smoke/microsoft-excel/create_worksheet.ts](../../../../tests/fixtures/action-smoke/microsoft-excel/create_worksheet.ts).

**Harness change (small, justified by the probe):** extended the bounded cleanup retry
([cleanupRetry.ts](../../../../tests/smoke-actions/cleanupRetry.ts)) to also cover
`microsoft-onedrive:delete_item` (`ONEDRIVE_ITEM_DELETE_RETRY` = 5 attempts / 1500ms / 6s cap).
The probe showed Graph briefly **locks** a file with a just-closed workbook session
(`DELETE … resource is locked`); the bounded retry absorbs it. A clean delete still succeeds on
attempt 1, so no existing OneDrive delete cert regresses. (404-on-smoke-owned → already_cleaned
applies to OneDrive too.)

**Live command:**
```
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
ALLOW_LIVE_PROVIDER_WRITE_SMOKE=true ALLOW_DESTRUCTIVE_PROVIDER_SMOKE=true \
SMOKE_PROVIDER=microsoft-excel SMOKE_MICROSOFT_EXCEL_CONNECTED=1 \
SMOKE_MICROSOFT_ONEDRIVE_CONNECTED=1 npm run smoke:writes:live
```

**Live result — PASS, 0 leaked:**
```
PASS  microsoft-excel:create_worksheet [destructiveSafe]
    setup ok · execute ok · verify ok · verify ok — marker confirmed on read-back · cleanup ok
    created 1 / cleaned 1 / remaining 0 (workbook) | artifact: cleaned
```
(The read-after-write lag the probe saw on an immediate re-list did not materialize through the
harness — each phase is its own workflow run, so the inter-step latency covers it. The delete
needed no retry this run.) **Created 1 / cleaned 1 / leaked 0.**

**Cert row added** (`SMOKE-WRITE-36`, `LIVE_PASS_CLEANED`, 2026-06-26; recycle-bin recoverable
semantics disclosed). **Matrix:** `create_worksheet` MISSING_FIXTURE → LIVE_PASS. Totals now
**298 registered / 126 LIVE_PASS / 22 not-run / 150 missing / 0 fail / 0 bug**; microsoft-excel
**13 / 6 / 0 / 7**.

**Offline verification (this turn):** `tests/unit/smoke-actions` → **36 suites / 425 tests pass**
(incl. the new `excel-create-worksheet` suite + extended cleanup-retry tests); `npx tsc --noEmit`
→ exit 0; eslint on touched files → 0; `npm run lint:structure` → OK; `--cert` →
`PASS_CLEAN microsoft-excel:create_worksheet`. **Nothing pushed.**

**Next Excel writes unblocked by this pattern** (each its own slice): `rename_worksheet`,
`delete_worksheet` (verify via `get_worksheets`), `add_row` / `update_row` / `delete_row` /
`add_table_row` (verify via `read_range` / `read_table_rows`). `export_sheet` stays
policy-excluded (raw bytes).

## 16. SMOKE-WRITE-37 — `microsoft-excel:rename_worksheet` LIVE-CERTIFIED (2026-06-26)

Second Excel write, reusing the SMOKE-WRITE-36 bootstrap unchanged. **`microsoft-excel:rename_worksheet`
is now `LIVE_PASS_CLEANED`.** No new harness code — the `minimalXlsx` upload + whole-file
OneDrive cleanup (with the bounded OneDrive delete retry) carried over directly.

**Action under test (smallest safe rename):** the frozen minimal `.xlsx` seeds exactly one
worksheet `Sheet1`, so the fixture renames `Sheet1` → `"{{marker}}renamed"` and proves the
rename by an INDEPENDENT `get_worksheets` read-back (marker + suffix `renamed`). Because
`Sheet1` carries no marker, only a real rename can produce a marker-named worksheet — a silent
no-op leaves `Sheet1` and fails. Smoke-owned throughout; no user/customer file, no sharing, no
send/billing.
- Fixture: [tests/fixtures/action-smoke/microsoft-excel/rename_worksheet.ts](../../../../tests/fixtures/action-smoke/microsoft-excel/rename_worksheet.ts).

**Live command:**
```
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
ALLOW_LIVE_PROVIDER_WRITE_SMOKE=true ALLOW_DESTRUCTIVE_PROVIDER_SMOKE=true \
SMOKE_PROVIDER=microsoft-excel SMOKE_MICROSOFT_EXCEL_CONNECTED=1 \
SMOKE_MICROSOFT_ONEDRIVE_CONNECTED=1 npm run smoke:writes:live
```

**Live result — PASS, 0 leaked:**
```
PASS  microsoft-excel:rename_worksheet [destructiveSafe]
    setup ok · execute ok · verify ok · verify ok — marker confirmed on read-back · cleanup ok
    created 1 / cleaned 1 / remaining 0 (workbook) | artifact: cleaned
```
(`create_worksheet` re-ran in the same scoped sweep and also PASSED, created 1 / cleaned 1 / 0
leaked.) **Created 1 / cleaned 1 / leaked 0.**

**Cert row added** (`SMOKE-WRITE-37`, `LIVE_PASS_CLEANED`, 2026-06-26; recycle-bin recoverable
semantics disclosed). **Matrix:** `rename_worksheet` MISSING_FIXTURE → LIVE_PASS. Totals now
**298 registered / 127 LIVE_PASS / 22 not-run / 149 missing / 0 fail / 0 bug**; microsoft-excel
**13 / 7 / 0 / 6**.

**Offline verification (this turn):** `tests/unit/smoke-actions` → **37 suites / 429 tests pass**
(incl. the new `excel-rename-worksheet` suite); `npx tsc --noEmit` → exit 0; eslint on touched
files → 0; `npm run lint:structure` → OK; `--cert` → `PASS_CLEAN microsoft-excel:rename_worksheet`.
**Nothing pushed.**

**Remaining Excel writes** (same bootstrap, each its own slice): `delete_worksheet` (verify via
`get_worksheets`), `add_row` / `update_row` / `delete_row` / `add_table_row` (verify via
`read_range` / `read_table_rows`). `export_sheet` stays policy-excluded (raw bytes).

## 17. SMOKE-WRITE-38 — `microsoft-excel:delete_worksheet` AUTHORED + offline-validated, LIVE CERT BLOCKED by an unrelated engine WIP (2026-06-26)

Authored the `delete_worksheet` fixture + a small reusable harness assertion, but the live
attempt **could not run** because of a parallel session's in-flight execution-engine refactor.
**No cert row added — `delete_worksheet` stays NOT_RUN.**

**What shipped (offline-validated, committed):**
- Fixture [tests/fixtures/action-smoke/microsoft-excel/delete_worksheet.ts](../../../../tests/fixtures/action-smoke/microsoft-excel/delete_worksheet.ts):
  same SMOKE-WRITE-36 bootstrap, with a 2nd setup step. setup#1 uploads the minimal workbook
  (seeded `Sheet1`); setup#2 `create_worksheet` adds a throwaway `"{{marker}}victim"` (so the
  delete is not the last-sheet HTTP 400); execute `delete_worksheet` removes the victim; verify
  independent `get_worksheets` proves the victim **ABSENT** + `count == 1` (the seeded `Sheet1`
  survived, workbook still valid); cleanup whole-file `microsoft-onedrive:delete_item`. `destructiveSafe`.
- New reusable verify assertion `expectAbsent: { path, value }`
  ([contract.ts](../../../../tests/smoke-actions/contract.ts) + [writeHarness.ts](../../../../tests/smoke-actions/writeHarness.ts)):
  the inverse of `markerPath`'s serialized-substring check — the (token-resolved) value must NOT
  appear in the read-back at `path`. Proves a REMOVAL; generally useful for any delete verify.
- Tests: new `excel-delete-worksheet` suite (shape + orchestration + both `expectAbsent`
  directions + the survivor/`count` check + lock-retry). `tests/unit/smoke-actions` → **38 suites
  / 434 tests pass**.

**Live command (attempted):**
```
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
ALLOW_LIVE_PROVIDER_WRITE_SMOKE=true ALLOW_DESTRUCTIVE_PROVIDER_SMOKE=true \
SMOKE_PROVIDER=microsoft-excel SMOKE_MICROSOFT_EXCEL_CONNECTED=1 \
SMOKE_MICROSOFT_ONEDRIVE_CONNECTED=1 npm run smoke:writes:live
```

**Live result — BLOCKED (engine, not the fixture):** all three Excel write fixtures FAILED at
**setup**, before any provider call:
```
workflow_runs.createQueuedWorkflowRun failed: invalid input value for enum
workflow_run_status: "queued"
created 0 / cleaned 0 / remaining 0  (for create_worksheet, rename_worksheet, delete_worksheet)
```
The shared worktree currently holds another session's **uncommitted** "durable run queue"
refactor (`services/execution/enqueue.ts`, `engine.ts`, `repositories/workflowRuns*`,
`services/triggers/dispatch.ts`, new `services/execution/runQueueProcessor.ts`, migration
`20260713000000_workflow_runs_durable_queue.sql`). The new `enqueue` inserts a `workflow_runs`
row with `status = "queued"`, but that enum value **does not exist in the DB** because the
migration is **unapplied** (and out of this lane — no `db:push`). So every run-row insert fails
→ the engine never executes → no Excel/OneDrive call happens. This hit the **already-certified**
`create_worksheet` + `rename_worksheet` identically, which proves it is a global engine blocker,
NOT a `delete_worksheet` fixture defect.

**Leak check:** the run-row insert fails *before* any handler runs, so nothing was uploaded
(`created 0` ×3). Swept the OneDrive root for `crsmoke-` items anyway — found only **2 stragglers
from last turn's bootstrap probe** (`crsmoke-probe-*.xlsx`, not this turn's `…workbook.xlsx`
pattern), deleted them; re-swept → **0 remaining**. No leak from this run.

**Created / cleaned / leaked:** 0 / 0 / 0 (no execution reached the provider).

**Cert decision:** **NOT certified** (charter: no `LIVE_PASS` without a real passing live run with
cleanup). **No cert row added.** Matrix: `delete_worksheet` MISSING_FIXTURE → **NOT_RUN** (fixture
authored + registered). Totals now **298 registered / 127 LIVE_PASS / 23 not-run / 148 missing /
0 fail / 0 bug**; microsoft-excel **13 / 7 / 1 / 5**.

**Offline verification (this turn):** `tests/unit/smoke-actions` → 38 suites / 434 pass;
`npx tsc --noEmit` → **my files clean** (the only tsc errors are in the parallel session's
`tests/unit/services/execution/enqueue.test.ts`, the same `keepAlive`/`queued` WIP — not mine);
eslint on touched files → 0; `npm run lint:structure` → OK; `--cert` → `delete_worksheet` NOT_RUN.
**Nothing pushed.**

**To certify (once the engine WIP lands):** when the durable-queue migration is applied and the
`"queued"` enum exists (the other session's work, or a clean tree), re-run the scoped command
above. The fixture + `expectAbsent` are ready; a green run (victim absent, count==1, 0 leaked)
earns the `LIVE_PASS_CLEANED` row.

## 18. SMOKE-WRITE-39 — `microsoft-excel:add_row` AUTHORED (NOT_RUN_READY), live cert intentionally deferred (2026-06-26)

Offline-only progress while the durable-queue enum blocker (§17) persists. Authored the
`add_row` fixture and moved it MISSING_FIXTURE → NOT_RUN. **No live run attempted; no cert row
added** (per the standing instruction: do not run live workflow smokes while the `"queued"`
enum blocker exists).

**Why `add_row` (the recommended next, and independently verifiable WITHOUT a table):** the
single-row positional mode (`values: [...]`) appends at A1 when the worksheet's used range is
empty — and the frozen minimal `.xlsx` seeds an empty `Sheet1`. So no table / header setup is
needed and the appended row lands deterministically at A1:B1, provable by the **certified**
`read_range` (A1) read-back. (The batch `rows:` mode needs headers; the single `values:` mode
does not — so `add_row` is the smallest safe row write, no `add_table_row` table scaffolding
required.)

**Fixture plan** ([tests/fixtures/action-smoke/microsoft-excel/add_row.ts](../../../../tests/fixtures/action-smoke/microsoft-excel/add_row.ts)):
- **setup** `onedrive:upload_file` — upload the minimal workbook (empty `Sheet1`), capture `itemId` → ledger `workbook`.
- **execute** `excel:add_row` — append `["{{marker}}row", "x"]` to `Sheet1` (empty used range → lands at A1:B1).
- **verify** `excel:read_range` (certified `LIVE_PASS`) — read `A1`, confirm the marker(+suffix `row`) on the persisted cell `values` (an un-appended sheet has no marker → a no-op fails).
- **cleanup** `onedrive:delete_item` — delete the WHOLE workbook file (same provider; recycle-bin recoverable; bounded delete retry absorbs a workbook-session lock).
- `destructiveSafe`, smoke-owned throughout, target zero leaked.

**Matrix:** `add_row` MISSING_FIXTURE → **NOT_RUN**. Totals now **298 registered / 127 LIVE_PASS
/ 24 not-run / 147 missing / 0 fail / 0 bug**; microsoft-excel **13 / 7 / 2 / 4** (the 2 NOT_RUN
= `delete_worksheet` + `add_row`, both authored, both awaiting the engine unblock).

**Offline verification (this turn):** `tests/unit/smoke-actions` → **38 suites / 438 tests pass**
(incl. the new `excel-add-row` suite); `npx tsc --noEmit` → **my files clean** (the only tsc
errors remain in the parallel session's `enqueue.test.ts` durable-queue WIP — not mine); eslint
on touched files → 0; `npm run lint:structure` → OK; `--cert` → `add_row` NOT_RUN. **No live
smoke run. Nothing pushed.**

**Queued NOT_RUN_READY Excel writes** (author offline now, cert as a batch once the engine WIP
lands): `delete_worksheet` (§17) + `add_row` (this section). Still MISSING and authorable
offline next: `update_row` / `delete_row` (verify via `read_range`), `add_table_row` (needs a
table — verify via `read_table_rows`). `export_sheet` stays policy-excluded (raw bytes).

## 19. SMOKE-WRITE-40 — `microsoft-excel:update_row` AUTHORED (NOT_RUN_READY), live cert deferred (2026-06-26)

Offline-only progress; the durable-queue work has since **committed** (`b01341a72`
DURABLE-QUEUE-1) but its migration `20260713000000_workflow_runs_durable_queue.sql` is **not
applied to the DB** (no `db:push` in this lane), so the runtime `"queued"` enum blocker
persists and live write smokes still fail before provider execution. **No live run attempted;
no cert row added.**

**`update_row` addressing semantics (inspected):** HEADER-based. Config is
`{ workbookId, worksheetName, rowNumber (1-based), values: Record<columnHeader, cellValue> }`.
The handler reads **row 1 as headers**, maps each `values` key (a column header NAME) to a
column letter, merges over the existing row, and PATCHes `rowNumber`. Unknown column keys throw
(no silent skip/create). It does **not** support V1's search-then-update (`matchColumn`/`matchValue`)
— explicit row number only. So a header row + a data row must exist before the update.

**Fixture plan** ([tests/fixtures/action-smoke/microsoft-excel/update_row.ts](../../../../tests/fixtures/action-smoke/microsoft-excel/update_row.ts)):
- **setup#1** `onedrive:upload_file` — upload the minimal workbook (empty `Sheet1`), capture `itemId` → ledger `workbook`.
- **setup#2** `excel:add_row` — write the header row `["Col"]` at A1 (empty sheet → A1).
- **setup#3** `excel:add_row` — append the SEED data row `["{{marker}}seed"]` at A2 (used range now has the header → row 2).
- **execute** `excel:update_row` — `rowNumber: 2`, `values: { Col: "{{marker}}updated" }`.
- **verify** `excel:read_range` (certified) — read `A2`, confirm marker(+suffix `updated`) on the cell `values`. The SEED (`{{marker}}seed`) carries the run marker but NOT `updated`, so a no-op update FAILS — the `markerSuffix` distinguishes the update from the seed.
- **cleanup** `onedrive:delete_item` — delete the WHOLE workbook (same provider; recycle-bin recoverable; bounded delete retry absorbs a workbook-session lock).
- `destructiveSafe`, smoke-owned throughout, target zero leaked. No harness change (reuses `markerPath`/`markerSuffix`).

**Matrix:** `update_row` MISSING_FIXTURE → **NOT_RUN**. Totals now **298 registered / 127
LIVE_PASS / 25 not-run / 146 missing / 0 fail / 0 bug**; microsoft-excel **13 / 7 / 3 / 3** (the
3 NOT_RUN = `delete_worksheet` + `add_row` + `update_row`, all authored, all awaiting the engine
unblock).

**Offline verification (this turn):** `tests/unit/smoke-actions` → **39 suites / 442 tests pass**
(incl. the new `excel-update-row` suite); `npx tsc --noEmit` → **exit 0** (the parallel
durable-queue WIP committed + its `enqueue.test.ts` type mismatch is resolved, so the tree
type-checks clean again — but the migration is still unapplied, so the runtime blocker remains);
eslint on touched files → 0; `npm run lint:structure` → OK; `--cert` → `update_row` NOT_RUN.
**No live smoke run. Nothing pushed.**

**Cert-batch readiness:** three NOT_RUN_READY Excel writes now queued (`delete_worksheet`,
`add_row`, `update_row`). Once the durable-queue migration is applied and the `"queued"` enum
exists, re-run the scoped Excel write smoke once to live-cert all three (plus re-confirm
`create_worksheet` + `rename_worksheet`) and add their `LIVE_PASS_CLEANED` rows. Still
authorable offline next: `delete_row` (verify via `read_range`), `add_table_row` (needs a table
— verify via `read_table_rows`).

## 20. SMOKE-WRITE-41 — `microsoft-excel:delete_row` AUTHORED (NOT_RUN_READY), live cert deferred (2026-06-26)

Offline-only progress; the `"queued"` enum blocker still holds (durable-queue migration
committed upstream but unapplied to the DB), so live write smokes still fail before provider
execution. **No live run attempted; no cert row added.**

**`delete_row` addressing semantics (inspected):** POSITION-based. Config is
`{ workbookId, worksheetName, rowNumber (1-based) }`. The handler issues a single Graph DELETE
against the full-row range `"{N}:{N}"` with `shift: "Up"` — it deletes the entire row at
`rowNumber` and shifts subsequent rows up. **No header / usedRange read, no range mode, no
search-then-delete** (V1's `deleteBy` / `startRow`-`endRow` / `matchColumn` are all dropped) —
explicit single row number only.

**Fixture plan** ([tests/fixtures/action-smoke/microsoft-excel/delete_row.ts](../../../../tests/fixtures/action-smoke/microsoft-excel/delete_row.ts)) —
mirrors the certified `google-sheets:delete_row` 3-read shift proof, adapted to `read_range`'s
matrix shape:
- **setup#1** `onedrive:upload_file` — upload the minimal workbook (empty `Sheet1`), capture `itemId` → ledger `workbook`.
- **setup#2-4** `excel:add_row` ×3 — seed A1 `"{{marker}}keep-before"`, A2 `"{{marker}}delete-me"`, A3 `"{{marker}}keep-after"`.
- **execute** `excel:delete_row` `rowNumber: 2` — deletes row 2, shifts A3 up into A2.
- **verify** `verifyAll` — three INDEPENDENT `read_range` reads that together pin exactly row 2: A1 marker(+suffix `keep-before`) (top unchanged); A2 marker(+suffix `keep-after`) (row 3 shifted up → row 2 removed); A1:A3 `expectAbsent "{{marker}}delete-me"` (the deleted value is gone from the whole column, not merely moved). A no-op leaves A2 == `delete-me` (fails the `keep-after` suffix + `expectAbsent`); deleting the wrong row fails A1 or A2.
- **cleanup** `onedrive:delete_item` — delete the WHOLE workbook (same provider; recycle-bin recoverable; bounded delete retry absorbs a workbook-session lock).
- `destructiveSafe`, smoke-owned throughout, target zero leaked. No harness change (reuses `verifyAll` + `markerSuffix` + the `expectAbsent` assertion added in §17).

**Matrix:** `delete_row` MISSING_FIXTURE → **NOT_RUN**. Totals now **298 registered / 127
LIVE_PASS / 26 not-run / 145 missing / 0 fail / 0 bug**; microsoft-excel **13 / 7 / 4 / 2** (the
4 NOT_RUN = `delete_worksheet` + `add_row` + `update_row` + `delete_row`, all authored, all
awaiting the engine unblock).

**Offline verification (this turn):** `tests/unit/smoke-actions` → **40 suites / 447 tests pass**
(incl. the new `excel-delete-row` suite); `npx tsc --noEmit` → **exit 0**; eslint on touched
files → 0; `npm run lint:structure` → OK; `--cert` → `delete_row` NOT_RUN. **No live smoke run.
Nothing pushed.**

**Cert-batch readiness:** FOUR NOT_RUN_READY Excel writes now queued (`delete_worksheet`,
`add_row`, `update_row`, `delete_row`). The only Excel write left to author offline is
`add_table_row` (needs a real Excel TABLE in the workbook — verify via `read_table_rows`);
`export_sheet` stays policy-excluded (raw bytes). Once the `"queued"` enum exists, one scoped
Excel write run live-certs the whole batch.

## 21. SMOKE-WRITE-42 — `microsoft-excel:add_table_row` AUTHORED (NOT_RUN_READY); completes the offline Excel-write batch (2026-06-26)

The LAST offline Excel write. `add_table_row` is now NOT_RUN_READY. **No live workflow smoke
run; no cert row added** (the `"queued"` enum blocker persists — durable-queue migration
committed upstream but unapplied to the DB).

**`add_table_row` schema/setup semantics (inspected):** config is
`{ workbookId, tableName, values (positional array | header-keyed record) }` — it appends one
row to a NAMED Excel table (`POST /tables/{name}/rows`). There is **no `create_table` action or
API wrapper**, so the table cannot be built by a harness setup step (and we don't add
production actions just for smoke). **Resolution:** ship a dedicated **table-bearing** bootstrap
workbook — a second frozen asset `MINIMAL_XLSX_WITH_TABLE_BASE64`
([tests/smoke-actions/minimalXlsx.ts](../../../../tests/smoke-actions/minimalXlsx.ts)) with a
`Sheet1` carrying a defined table `SmokeTable` (one column `Col`, header row + one benign
NON-marker `seed` data row).

**Table asset validated by a DIRECT-API probe** (not the blocked engine path):
`scripts/trash/excel-table-bootstrap-probe.ts` uploaded the asset and confirmed Graph
`tables` → `["SmokeTable"]`, `tables/SmokeTable/columns` → `["Col"]`, `tables/SmokeTable/rows`
append (`index=1`) + list (`[["seed"],["crsmoke-probe-trow"]]`), then cleaned up (0 leaked). A
first attempt with a header-ONLY table (`ref="A1:A1"`) was rejected by Graph ("something went
wrong with this file"); a header + one seed data row (`ref="A1:A2"`) opens cleanly — that's the
frozen asset. (Direct-API = the `refreshAndRetry` + API-wrapper path, NOT `enqueueRun`/the
engine, so the durable-queue `"queued"` blocker doesn't apply; this is not the live workflow
write smoke.)

**Fixture plan** ([tests/fixtures/action-smoke/microsoft-excel/add_table_row.ts](../../../../tests/fixtures/action-smoke/microsoft-excel/add_table_row.ts)):
- **setup** `onedrive:upload_file` — upload the table-bearing workbook, capture `itemId` → ledger `workbook`.
- **execute** `excel:add_table_row` — `tableName: "SmokeTable"`, `values: ["{{marker}}trow"]`.
- **verify** `excel:read_table_rows` (certified) — confirm the marker(+suffix `trow`) is present among the table rows; the seed row has no marker, so a no-op append fails.
- **cleanup** `onedrive:delete_item` — whole-workbook delete (same provider; recycle-bin recoverable; bounded delete retry). `destructiveSafe`, target zero leaked. No harness change (reuses `markerPath`/`markerSuffix`).

**Matrix:** `add_table_row` MISSING_FIXTURE → **NOT_RUN**. Totals now **298 registered / 127
LIVE_PASS / 27 not-run / 144 missing / 0 fail / 0 bug**; microsoft-excel **13 / 7 / 5 / 1** (the
5 NOT_RUN = `delete_worksheet` + `add_row` + `update_row` + `delete_row` + `add_table_row`; the
last MISSING is `export_sheet`, policy-excluded raw bytes).

**Offline verification (this turn):** `tests/unit/smoke-actions` → **41 suites / 452 tests pass**
(incl. the new `excel-add-table-row` suite + the table-asset validity check); `npx tsc --noEmit`
→ **exit 0**; eslint on touched files → 0; `npm run lint:structure` → OK (removed my own temp
probe byproducts to keep `scripts/trash` ≤ 50 — did not touch the historical arc trash);
`--cert` → `add_table_row` NOT_RUN. **No live smoke run. Nothing pushed.**

**Excel write surface — offline COMPLETE.** All 6 non-export Excel writes are authored:
2 LIVE_PASS_CLEANED (`create_worksheet`, `rename_worksheet`) + 5 NOT_RUN_READY
(`delete_worksheet`, `add_row`, `update_row`, `delete_row`, `add_table_row`). `export_sheet` is
the only remaining MISSING (policy-excluded: raw bytes). Once the durable-queue migration is
applied and the `"queued"` enum exists, ONE scoped Excel write run live-certs the five
NOT_RUN_READY fixtures (re-confirming the two already-certified) and adds their
`LIVE_PASS_CLEANED` rows — bringing microsoft-excel to 12/13 (export-excluded).

## 22. SMOKE-WRITE-43 — `microsoft-outlook:create_draft_email` AUTHORED (NOT_RUN_READY), first non-Excel offline write (2026-06-26)

Excel offline authoring is complete, so this moves to the next safe non-Excel MISSING_FIXTURE.
**`microsoft-outlook:create_draft_email` is now NOT_RUN_READY.** No live workflow smoke run; no
cert row added (the `"queued"` enum blocker persists).

**Why this action (safe, connected, proven, cleanable):** Outlook is connected + proven (3
certified reads: `list_folders`, `get_profile`, `fetch_emails`). A DRAFT is **not a send** —
`POST /me/messages` creates a draft in the Drafts folder (201, `isDraft`) and never delivers it,
so there's no broadcast/external side effect. It's a fully smoke-owned resource with an
independent certified-read verify (`fetch_emails`) and a same-provider delete cleanup
(`delete_email`). The `to` recipient is a reserved non-deliverable `.invalid` address as defense
in depth (the draft is never sent regardless).

**Fixture plan** ([tests/fixtures/action-smoke/microsoft-outlook/create_draft_email.ts](../../../../tests/fixtures/action-smoke/microsoft-outlook/create_draft_email.ts)) —
execute-creates-resource shape (no setup, like OneDrive `upload_file`):
- **execute** `create_draft_email` — marker-subjected draft (`subject: "{{marker}}draft"`), capture `draftId` → ledger `draft`.
- **verify** `fetch_emails` (certified) — list the Drafts folder (`folderId: "drafts"`, `maxResults: 50`) and confirm the marker(+suffix `draft`) subject among `messages`. The run token makes the subject unique, so only THIS draft matches; the handler echo is never trusted.
- **cleanup** `delete_email` — `deleteMode: "permanent"`, `emailId: "{{ledger.draft.id}}"` (same provider; the smoke-owned guard restricts the delete to the captured draft).
- `destructiveSafe`, smoke-owned throughout, target zero leaked. No harness change (reuses `markerPath`/`markerSuffix`).

**Rejected candidates (why):**
- `gmail:create_label` — no `delete_label` action (only `removeLabel` = remove-from-message) → no cleanup.
- `hubspot:create_contact` / `create_*` — no contact/CRM delete action registered → no cleanup (and CRM-record semantics).
- `notion:create_database` — no archive-database action + no independent read-back (deferred since §11).
- `trello:create_board` / `create_list` — no board-delete / list-archive action → no safe teardown (deferred since §11).
- `microsoft-onenote:create_notebook` / `create_section` — Graph has no notebook/section delete → no teardown (§11).
- `microsoft-teams:*`, `gmail:send_email` / `reply_*`, `outlook:send_email` / `forward_*` — send/broadcast (excluded).
- `google-docs:share_document` (sharing link), `gmail`/`outlook` `get_attachment`, `dropbox:create_shared_link` / `get_temporary_link` / `download_file`, `google-docs:export_document`, `notion:get_block(_children)` — sharing / raw bytes / signed URL / block content (policy-excluded).
- `gmail`/`outlook` `add_label` / `mark_as_read` / `add_categories` / `move_email` / `delete_email` — mutate or destroy an EXISTING user email (no smoke-owned email to act on without sending one).
- `github:*`, `monday:*`, `stripe:*`, `shopify:*`, `discord:*` — not connected on the smoke account (and stripe/shopify are billing/commerce); deferred until connected.

**Matrix:** `create_draft_email` MISSING_FIXTURE → **NOT_RUN**. Totals now **298 registered / 127
LIVE_PASS / 28 not-run / 143 missing / 0 fail / 0 bug**; microsoft-outlook **11 / 3 / 1 / 7**.

**Offline verification (this turn):** `tests/unit/smoke-actions` → **42 suites / 456 tests pass**
(incl. the new `outlook-create-draft-email` suite); `npx tsc --noEmit` → **exit 0**; eslint on
touched files → 0; `npm run lint:structure` → OK; `--cert` → `create_draft_email` NOT_RUN. **No
live smoke run. Nothing pushed.**

**Live cert note:** beyond the `"queued"` enum unblock, the live cert also needs the Outlook
smoke connection to carry `Mail.ReadWrite` (create/delete draft scope). Other safe non-Excel
offline candidates to consider next: `gmail:create_draft` (cleanup path needs confirming — Gmail
`drafts.delete` vs `deleteEmail`) and `microsoft-outlook:create_draft_email`'s Gmail analogue,
plus revisiting connected-provider creates only where a real delete action exists.

## 23. SMOKE-WRITE-44 — `gmail:create_draft` DEFERRED (no safe registered cleanup) (2026-06-29)

Inspected `gmail:create_draft` as the next non-Excel offline candidate and **deferred it** —
**no fixture authored** — because there is no safe, registered cleanup for a Gmail draft. Per the
selection rule "if no safe cleanup exists, stop and classify as deferred." Matrix unchanged
(`gmail:create_draft` stays MISSING_FIXTURE).

**Inspection:**
- `create_draft` exists; output is `{ draftId, messageId, threadId }` (the draft id + its
  underlying message id) — ids are available for cleanup/verify.
- **No drafts-delete action or API wrapper.** Gmail API wrappers present:
  `usersDraftsCreate`, `usersMessagesDelete`, `usersMessagesTrash` (no `usersDraftsDelete`,
  no `usersDraftsList`). The only registered cleanup action is `delete_email`
  (`{ messageId, deleteMode: "trash" | "permanent" }` → `messages.trash` / `messages.delete`).
- A Gmail draft is a SEPARATE resource (`drafts.*`) wrapping a message — unlike Outlook/Graph
  where a draft IS a message and `DELETE /messages/{id}` discards it (that's why SMOKE-WRITE-43
  Outlook was safe). So `messages.delete`/`messages.trash` on the draft's underlying message is
  not the documented draft-discard path.

**Direct-API probe** (`scripts/trash/gmail-draft-cleanup-probe.ts`; no engine, so independent
of the `"queued"` blocker — creates + cleans real smoke drafts, always raw-`drafts.delete`
fallback so it never leaks):
- **VERIFY works:** `users.messages.list q="subject:<marker>"` (the engine certified
  `search_emails` uses) found the freshly-created draft on attempt 1. ✓
- **`delete_email` "permanent" (`messages.delete`) FAILS:** `Request had insufficient
  authentication scopes` — the smoke Gmail connection lacks the `https://mail.google.com/`
  scope that permanent message delete requires. ✗
- **`delete_email` "trash" (`messages.trash`) LEAKS:** the call succeeds (HTTP OK) but the
  draft **is still present afterward** (`drafts.get` → HTTP 200). Trashing the underlying
  message does NOT remove the draft. ✗
- The correct discard (raw `drafts.delete`) returned HTTP 204 with the existing scopes — so the
  proper cleanup is technically available, but **has no registered action/wrapper to build a
  fixture's cleanup on**, and adding a production drafts-delete handler is outside the
  action-smoke lane.

**Verdict — DEFER.** Both `delete_email` modes are unsafe for a Gmail draft (permanent → scope
failure; trash → leaves the draft). Authoring a fixture whose cleanup either fails or leaks
would violate the zero-leak rule. This is a **durable** deferral (not just queue-blocked): it
clears only when a registered `gmail:discard_draft` / drafts-delete action exists (a production
addition, out of this lane), at which point `create_draft` becomes authorable (VERIFY via
`search_emails` already confirmed, cleanup via the new discard action).

**Matrix:** unchanged — **298 registered / 127 LIVE_PASS / 28 not-run / 143 missing / 0 fail /
0 bug**. `gmail:create_draft` stays MISSING_FIXTURE (deferred).

**Offline verification (this turn):** `tests/unit/smoke-actions` → 42 suites / 456 pass
(unchanged — no fixture added); `npx tsc --noEmit` → exit 0; `npm run lint:structure` → OK;
`--cert` → `gmail:create_draft` still MISSING. **No live workflow smoke. Nothing pushed.**

**Next safe non-Excel offline candidates:** revisit connected-provider creates ONLY where a real
registered delete/discard action exists. Gmail `create_label` is similarly blocked (no
`delete_label`). The Outlook/draft pattern worked because Graph drafts ARE messages; the
equivalent only generalizes to providers whose create has a matching registered delete.

## 24. SMOKE-WRITE-45 — `google-calendar:add_attendees` AUTHORED (NOT_RUN_READY) + non-Excel safe-candidate sweep (2026-06-29)

Swept the remaining MISSING_FIXTURE list for connected/proven providers and authored exactly
one safe fixture. **`google-calendar:add_attendees` is now NOT_RUN_READY.** No live workflow
smoke run; no cert row added (`"queued"` enum blocker persists).

**Selected — `google-calendar:add_attendees` (all four paths real, no broadcast):**
- **setup** `create_event` (certified `LIVE_PASS`) — marker-titled event on PRIMARY at a FIXED
  far-future time (2030-01-01), no attendees, `sendNotifications:"none"`. Capture `eventId`.
- **execute** `add_attendees` — add `"{{marker}}attendee@example.invalid"` (reserved
  non-deliverable TLD) with **`sendNotifications:"none"` → ZERO invitation emails**. Mutates only
  the smoke-owned event.
- **verify** `list_events` (certified `LIVE_PASS`) — read the FIXED 2030 window (immediate
  consistency, no search-index lag); `list_events.events` is the raw Google item array incl.
  `attendees`, so `markerPath:"events"` + `markerSuffix:"attendee@example.invalid"` confirms the
  unique attendee email. A no-op add leaves the event without it → VERIFY_FAILED.
- **cleanup** `delete_event` (certified `LIVE_PASS`, `sendNotifications:"none"`) — hard-erase the
  event (events.delete is a TRUE erase), removing the attendee with it. Same provider.
- Smoke-owned throughout, zero leaked, zero invites. No harness change. The bounded `events_get`
  smoke reader exposes only `exists`/`summary`/`status` (no attendees by design), so verify uses
  the certified `list_events` read instead — which exposes raw attendees.

**Candidates inspected + rejected this sweep:**
- `microsoft-outlook:add_categories` — could mutate a smoke-owned draft, BUT **no certified read
  exposes `categories`** (`fetch_emails` returns subject/from/to/importance/isRead, not
  categories) → no independent verify. DEFER.
- `dropbox:create_shared_link` / `download_file` / `get_temporary_link` — sharing / bytes /
  signed URL (excluded).
- `google-docs:export_document` (bytes) / `share_document` (sharing) — excluded.
- `microsoft-onenote:create_notebook` / `create_section` — no Graph delete → no teardown (§11).
- `notion:create_database` (no archive-database + no independent read-back), `get_block(_children)`
  (block content) — deferred / excluded.
- `trello:create_board` / `create_list` — no board-delete / list-archive action → no safe
  teardown (§11).
- `mailchimp:create_audience` / `create_segment` — no registered delete action → no cleanup;
  `add_subscriber` / `update_subscriber` / `add_tag` / `*_subscriber` / `create_custom_event` —
  mutate subscriber (contact PII) or have no delete; welcome-email risk. DEFER.
- `microsoft-outlook-calendar:add_attendees` — the Outlook-calendar analogue; SAME pattern is
  feasible (create_event/delete_event are certified there too), but its `events_get` reader is
  likewise bounded (subject only) — would need a certified Outlook-calendar list/read that
  exposes attendees. Left for a follow-up (one fixture per turn). Likely the next candidate.
- `microsoft-teams:*`, `gmail`/`outlook` `send_*`/`reply_*`/`forward_*` — send/broadcast (excluded).

**Matrix:** `add_attendees` MISSING_FIXTURE → **NOT_RUN**. Totals now **298 registered / 127
LIVE_PASS / 29 not-run / 142 missing / 0 fail / 0 bug**; google-calendar **5 / 4 / 1 / 0** (now
write-complete modulo the live cert).

**Offline verification (this turn):** `tests/unit/smoke-actions` → **43 suites / 460 tests pass**
(incl. the new `gcal-add-attendees` suite); `npx tsc --noEmit` → **exit 0** (my files clean; a
transient parallel-WIP ops test error cleared on re-run); eslint on touched files → 0;
`npm run lint:structure` → OK; `--cert` → `add_attendees` NOT_RUN. **No live smoke run. Nothing
pushed.**

**Next safe non-Excel offline candidate:** `microsoft-outlook-calendar:add_attendees` (same
chain off certified create/delete_event) — pending confirming a certified Outlook-calendar read
that exposes event attendees for the independent verify.

## 25. SMOKE-WRITE-46 — `microsoft-outlook-calendar:add_attendees` AUTHORED (NOT_RUN_READY) — verify confirmed available (2026-06-29)

The §24 follow-up. **Outlook Calendar attendee verification IS available**, so `add_attendees`
was authored (mirrors the gcal SMOKE-WRITE-45 pattern). **NOT_RUN_READY** — no live smoke, no
cert row.

**Verify availability (the unblocker question):** The certified `microsoft-outlook-calendar:list_events`
(LIVE_PASS) output PROJECTS per-event `attendees: [{ name, address, type, status }]` — so the
added attendee's email is independently readable at `events[].attendees[].address`. (The bounded
`events_get` smoke reader exposes only `exists`/`subject` — no attendees — so verify uses
`list_events`, exactly like gcal.) **Decision: SELECTED / authored.**

**No-notify caveat (documented):** Outlook's `add_attendees` config is `{ eventId, attendees,
attendeeType }` — there is **NO notification toggle** (it PATCHes `/me/events/{id}` with the
merged attendee list). So the sole safeguard against an invite is the attendee address: a
reserved, RFC-6761 non-deliverable `.invalid` address. Any invite Exchange might attempt cannot
resolve and bounces at the sending server — no real party is ever contacted. This is the
defense-in-depth the charter mandates when an action lacks a no-notify option, and matches the
task's explicit "no-notify if the action supports it; attendee must be a reserved `.invalid`
address." No production action behavior was changed.

**Fixture plan** ([tests/fixtures/action-smoke/microsoft-outlook-calendar/add_attendees.ts](../../../../tests/fixtures/action-smoke/microsoft-outlook-calendar/add_attendees.ts)):
- **setup** `create_event` (certified) — marker-subjected event on the default calendar at a
  FIXED 2030-01-01 time, NO attendees, `responseRequested:false`. Capture `id` → ledger `event`.
- **execute** `add_attendees` — `["{{marker}}attendee@example.invalid"]`, `attendeeType:"required"`.
- **verify** `list_events` (certified) — fixed 2030 window (`startDateTime`/`endDateTime`, `top:50`);
  `markerPath:"events"` + `markerSuffix:"attendee@example.invalid"` proves the unique attendee in
  `events[].attendees[].address`. A no-op leaves the event without it → VERIFY_FAILED (the subject
  marker is `<marker>event`, not the attendee suffix).
- **cleanup** `delete_event` (certified, hard erase) — removes the event + its attendee. Same
  provider, smoke-owned, zero leaked, no real invite. No harness change.

**Matrix:** `add_attendees` MISSING_FIXTURE → **NOT_RUN**. Totals now **298 registered / 127
LIVE_PASS / 30 not-run / 141 missing / 0 fail / 0 bug**; microsoft-outlook-calendar **5 / 4 / 1 / 0**
(now write-complete modulo live cert — both calendar providers' add_attendees are NOT_RUN_READY).

**Offline verification (this turn):** `tests/unit/smoke-actions` → **44 suites / 464 tests pass**
(incl. the new `outlook-cal-add-attendees` suite); `npx tsc --noEmit` → **exit 0** (fully clean);
eslint on touched files → 0; `npm run lint:structure` → OK; `--cert` → `add_attendees` NOT_RUN.
**No live smoke run. Nothing pushed.**

**Calendar attendee family complete.** Both `google-calendar:add_attendees` (§24) and
`microsoft-outlook-calendar:add_attendees` (this section) are authored NOT_RUN_READY. Next safe
non-Excel offline candidate would require a connected provider whose create has a registered
delete AND a certified read exposing the mutated property — the readily-available ones are now
exhausted (the remaining MISSING are sends / bytes / sharing / no-cleanup / no-verify, see §24).

## 26. NOT_RUN_READY batch LIVE-CERTIFIED (5 of 8) + `add_row` handler bug found (2026-06-29)

The durable-queue `"queued"` enum blocker (§17–§21) is **resolved** — migration
`20260713000000` is applied to the target project (`qcepijemjlkssfkvzlio`;
`workflow_run_status = {succeeded,failed,running,queued}`, confirmed by a read-only enum probe),
so the accumulated NOT_RUN_READY batch was re-attempted live. **5 of 8 actions CERTIFIED
(`LIVE_PASS_CLEANED`); 3 BLOCKED by a real production `add_row` handler bug — NOT certified.**

**Live commands run (each provider scoped + isolated; all four gates set inline for the one
command — safety opt-ins, not secrets):**
```
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
ALLOW_LIVE_PROVIDER_WRITE_SMOKE=true ALLOW_DESTRUCTIVE_PROVIDER_SMOKE=true \
SMOKE_PROVIDER=microsoft-excel SMOKE_MICROSOFT_EXCEL_CONNECTED=1 SMOKE_MICROSOFT_ONEDRIVE_CONNECTED=1 npm run smoke:writes:live
… SMOKE_PROVIDER=google-calendar SMOKE_GOOGLE_CALENDAR_CONNECTED=1 npm run smoke:writes:live
… SMOKE_PROVIDER=microsoft-outlook-calendar SMOKE_MICROSOFT_OUTLOOK_CALENDAR_CONNECTED=1 npm run smoke:writes:live
… SMOKE_PROVIDER=microsoft-outlook SMOKE_MICROSOFT_OUTLOOK_CONNECTED=1 npm run smoke:writes:live
```

**Per-action result (created / cleaned / leaked):**

| Action | Result | c/c/l | Cert |
|---|---|---|---|
| `microsoft-excel:delete_worksheet` | **PASS** | 1 / 1 / 0 | ✅ LIVE_PASS_CLEANED |
| `microsoft-excel:add_table_row` | **PASS** | 1 / 1 / 0 | ✅ LIVE_PASS_CLEANED |
| `microsoft-excel:add_row` | **VERIFY_FAILED** | 1 / 1 / 0 | ❌ (handler bug) |
| `microsoft-excel:update_row` | **FAIL (execute)** | 1 / 1 / 0 | ❌ (add_row cascade) |
| `microsoft-excel:delete_row` | **VERIFY_FAILED** | 1 / 1 / 0 | ❌ (add_row cascade) |
| `google-calendar:add_attendees` | **PASS** | 1 / 1 / 0, 0 invites | ✅ LIVE_PASS_CLEANED |
| `microsoft-outlook-calendar:add_attendees` | **PASS** | 1 / 1 / 0, 0 invites | ✅ LIVE_PASS_CLEANED |
| `microsoft-outlook:create_draft_email` | **PASS** | 1 / 1 / 0 | ✅ LIVE_PASS_CLEANED |

(The already-certified `create_worksheet` / `rename_worksheet`, and the calendar
`create_event` / `update_event` / `delete_event`, re-ran in the same scoped sweeps and PASSED.)

**ROOT CAUSE of the 3 Excel failures — a real `microsoft-excel:add_row` handler bug (evidence,
not a guess):** the frozen minimal `.xlsx` `Sheet1` is genuinely empty (`<sheetData/>`, decoded).
On an empty sheet, Graph's `usedRange(valuesOnly=true)` returns the lone cell as an empty
**STRING**, not `null`. `add_row`'s `isEmpty` guard
([integrations/microsoft-excel/actions/addRow.ts](../../../../integrations/microsoft-excel/actions/addRow.ts) lines 93–97)
only treats `null`/`undefined` as empty, so `isEmpty` is **false** → it appends at
`rowCount+1 = 2`. Confirmed via the persisted run step-output: `add_row` of `["crsmoke-…row"]`
wrote **`address: "A2:A2", rowIndex: 2`** (read-only DB probe of `workflow_runs.steps`). Worse, it
anchors on the usedRange row **COUNT** rather than the absolute last row, so repeated appends all
recompute `rowIndex: 2` and **overwrite each other** (`update_row` setup wrote `"Col"`→A2 then
`"seed"`→A2, clobbering the header; `delete_row` setup wrote all three markers→A2). Downstream:
- `add_row` verify reads A1 → empty → VERIFY_FAILED.
- `update_row` execute reads row 1 for headers → A1 empty → "column Col not found" → FAIL.
- `delete_row` verify finds A1/A2 markers absent → VERIFY_FAILED.

This is a **production bug** affecting real append-to-empty-sheet and repeated-append workflows —
**out of the action-smoke lane to fix** (a `microsoft-excel` integration handler change). It is
NOT the `"queued"` enum (that is resolved), NOT a fixture typo, and NOT present in `add_table_row`
/ `delete_worksheet` (which don't use `add_row` — the table append is index-based, so they passed).
**Recommended follow-up slice (separate, for Marcus):** fix `add_row`'s empty-sheet detection
(treat an empty-string lone cell as empty) and its append anchor (use the absolute last used row,
not the row count), then the 3 fixtures certify unchanged.

**Leak / sweep:** every run (including the 3 failures) reported `created 1 / cleaned 1 /
remaining 0` — the harness's cleanup independently re-reads, so each smoke-owned workbook / event
/ draft was removed (Excel workbooks → OneDrive recycle bin, recoverable; calendar events → true
erase; Outlook draft → permanent delete). No leak; no separate sweep needed.

**Cert rows added (5):** `microsoft-excel:delete_worksheet`, `microsoft-excel:add_table_row`,
`google-calendar:add_attendees`, `microsoft-outlook-calendar:add_attendees`,
`microsoft-outlook:create_draft_email` → `LIVE_PASS_CLEANED` (2026-06-29) in
[certificationSeed.ts](../../../../scripts/chainreact/smoke/certificationSeed.ts). The 3
`add_row`-family fixtures stay **NOT_RUN** (a documented NOT_RUN with the bug recorded, not a
silent skip).

**Matrix:** Totals now **298 registered / 132 LIVE_PASS / 25 not-run / 141 missing / 0 fail /
0 bug** (+5 LIVE_PASS, −5 not-run). Per-provider: microsoft-excel **13 / 9 / 3 / 1** (3 NOT_RUN =
add_row/update_row/delete_row pending the handler fix; 1 MISSING = `export_sheet`, policy-excluded
raw bytes); google-calendar **5 / 5 / 0 / 0** (write-complete); microsoft-outlook-calendar
**5 / 5 / 0 / 0** (write-complete); microsoft-outlook **11 / 4 / 0 / 7**.

**Offline verification (this turn):** `npm run chainreact -- smoke actions --cert` → totals above;
`npx jest tests/unit/smoke-actions` → **45 suites / 464 tests pass**; `npx tsc --noEmit` → exit 0;
eslint on the touched `certificationSeed.ts` → 0; `npm run lint:structure` → OK. **No db:push, no
deploy, nothing pushed.**

## 27. `microsoft-excel:add_row` empty-sheet bugfix + 3 parked fixtures LIVE-CERTIFIED (2026-06-29)

The §26 follow-up. Fixed the production `add_row` handler bug, then live-certified the three
parked fixtures. **Excel writes are now COMPLETE** (only the policy-excluded `export_sheet`
remains MISSING).

**Root cause (confirmed §26, evidence):** on a genuinely empty worksheet (`<sheetData/>`),
Graph's `usedRange(valuesOnly=true)` returns the lone cell as an empty **STRING** `""`, not
`null`. `add_row`'s `isEmpty` guard only treated `null`/`undefined` as empty → `false` → appended
at A2 (`rowIndex 2`), not A1. It also anchored on the usedRange row **COUNT** instead of the
absolute last row, so repeated appends recomputed the same target and overwrote row 2. Proven via
the persisted run step-output (`address: "A2:A2"`).

**Production fix** ([integrations/microsoft-excel/actions/addRow.ts](../../../../integrations/microsoft-excel/actions/addRow.ts)):
- `isBlankCell(v)` — treats `null` / `undefined` / `""` as blank, but deliberately NOT `0` /
  `false` (real values a workflow may write) nor non-empty strings. `isUsedRangeEmpty(used)` is
  true when every cell is blank (or there are none) → first append starts at A1.
- `lastUsedRow(used)` — parses the ABSOLUTE last row from the range address (`"Sheet1!A2:C5"` →
  5, `"Sheet1!A2"` → 2), not `rowCount`. Single-row append targets `lastUsedRow + 1`; batch mode
  uses the same anchor. Falls back to `rowCount` only if the address is unparseable.
- Doc fix in [api/types.ts](../../../../integrations/microsoft-excel/api/types.ts): the
  `ExcelRange.values` comment now records the verified empty-sheet `""` caveat.
- **Backward-compatible:** all pre-existing handler tests use ranges starting at A1, where
  `lastUsedRow == rowCount`, so behavior is unchanged for non-empty sheets.

**Tests added (5, in [addRow.test.ts](../../../../tests/unit/integrations/microsoft-excel/actions/addRow.test.ts)):**
empty-STRING lone cell → A1; blank-only multi-cell `[["",""]]` → A1; second append advances to
row 2 (no overwrite); content starting below row 1 (`"Sheet1!A3"`) anchors at the absolute row →
A4; `0`/`false` are NOT blank (sheet non-empty → append advances). The fixtures were NOT changed —
they already encoded the correct A1 expectation; the bug, not the fixtures, was wrong (task: do
not weaken verification).

**Live command:**
```
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
ALLOW_LIVE_PROVIDER_WRITE_SMOKE=true ALLOW_DESTRUCTIVE_PROVIDER_SMOKE=true \
SMOKE_PROVIDER=microsoft-excel SMOKE_MICROSOFT_EXCEL_CONNECTED=1 \
SMOKE_MICROSOFT_ONEDRIVE_CONNECTED=1 npm run smoke:writes:live
```

**Live result — all 7 Excel write fixtures PASS, 0 leaked:**

| Action | Result | created / cleaned / leaked |
|---|---|---|
| `microsoft-excel:add_row` | **PASS** | 1 / 1 / 0 |
| `microsoft-excel:update_row` | **PASS** | 1 / 1 / 0 |
| `microsoft-excel:delete_row` | **PASS** | 1 / 1 / 0 |

(`create_worksheet` / `rename_worksheet` / `delete_worksheet` / `add_table_row` re-ran in the
same scoped sweep and all PASSED, 0 leaked.) Excel workbooks deleted to the OneDrive recycle bin
(recoverable); no leak; the harness cleanup independently re-reads (remaining 0 each), so no
separate sweep was needed.

**Cert rows added (3):** `microsoft-excel:add_row`, `microsoft-excel:update_row`,
`microsoft-excel:delete_row` → `LIVE_PASS_CLEANED` (2026-06-29) in
[certificationSeed.ts](../../../../scripts/chainreact/smoke/certificationSeed.ts) (the §26
"NOT certified" note was replaced with the certified entry).

**Matrix:** Totals now **298 registered / 135 LIVE_PASS / 22 not-run / 141 missing / 0 fail /
0 bug** (+3 LIVE_PASS, −3 not-run). microsoft-excel **13 / 12 / 0 / 1** — all writes certified;
only `export_sheet` (policy-excluded raw bytes) remains MISSING.

**Offline verification (this turn):** focused
`tests/unit/integrations/microsoft-excel/actions/{addRow,updateRow,deleteRow}.test.ts` → 37 pass
(incl. 5 new); full `tests/unit/integrations/microsoft-excel` + `tests/unit/smoke-actions` → 83 +
45 suites / 775 + 464 tests pass; `npm run chainreact -- smoke actions --cert` → totals above;
`npx tsc --noEmit` → exit 0; eslint on the 4 touched files → 0; `npm run lint:structure` → OK.
**No db:push, no deploy, nothing pushed.**

## 28. FINAL action-smoke frontier classification + handoff to triggers (2026-06-29)

Closure pass for the action-smoke lane. Full matrix re-read; every remaining NOT_RUN and
MISSING action classified; the "possibly safe" group re-checked against the real registries.
**No safe candidate exists — no fixture authored.** Recommendation: **action-smoke is exhausted
on the currently-connected providers; move to triggers.** Matrix unchanged at **298 / 135
LIVE_PASS / 22 not-run / 141 missing / 0 fail / 0 bug**.

### 28.1 Remaining NOT_RUN (22) — classified

| Bucket | Actions | Count |
|---|---|---|
| Provider not connected | `monday:*` reads (get_board, get_item, get_user, list_boards, list_groups, list_items, list_subitems, list_updates, list_users, search_items), `stripe:*` reads (find_customer, find_payment_intent, find_subscription, get_payments), `discord:fetch_messages` | 15 |
| Connected, missing operator test resource | `google-analytics:*` (run_report, run_pivot_report, get_realtime_data, find_conversion) — connected, but the account exposes no usable GA4 property | 4 |
| Authored fixture, blocked | `microsoft-onenote:copy_page` — same-section copy resolves to the source page id; needs a SECOND operator-provisioned `[TEST]` section to capture a distinct copy (§14) | 1 |
| Authored, non-liveSafe (inventory only) | `slack:delete_message` — destructive with no smoke-owned target message + flagged non-liveSafe | 1 |
| Intentional uncertified baseline | `native:format_transformer` — the always-run baseline that proves the live harness path is real every sweep (certification.test guards this) | 1 |
| Genuine bug needing a production slice | none | 0 |

### 28.2 Remaining MISSING_FIXTURE (141) — grouped

**A. Provider not connected on the smoke account (47):** `monday` (14), `stripe` (12),
`shopify` (11), `github` (6), `discord` (4). Binding blocker is the connection; many are also
commerce/billing mutations. Connecting any unlocks its reads immediately + safe creates-with-delete
where they exist (e.g. `github:create_issue`).

**B. Send / broadcast / reply / forward / publish — excluded by lane (19, connected):**
`gmail` send_email/reply_to_email; `microsoft-outlook` send_email/reply_to_email/forward_email;
`microsoft-teams` send_channel_message/reply_to_channel_message/send_chat_message; `facebook`
comment_on_post/create_post/delete_post/send_message/update_post/upload_photo/upload_video (publish
to a real Page); `slack` send_direct_message/schedule_message/post_interactive_blocks;
`google-analytics:send_event`.

**C. Raw bytes / signed URL / export / download / block content — policy-excluded (9):**
`dropbox` download_file/get_temporary_link; `google-docs:export_document`;
`microsoft-excel:export_sheet`; `gmail:get_attachment`; `microsoft-outlook:get_attachment`;
`notion` get_block/get_block_children; `slack:download_file`.

**D. Sharing-link mutation — excluded (2):** `dropbox:create_shared_link`,
`google-docs:share_document`.

**E. No registered cleanup path (create-without-delete, or update with no smoke-owned teardown) (37):**
`hubspot` (19: all create_* / update_* / add_contact_to_list / remove_from_list / remove_line_item —
there is NO record-delete action of any kind registered; the only reverse action `removeFromList`
needs an operator contact+list AND no certified read exposes list membership for an independent
verify); `mailchimp` (10: create_audience/create_segment have no delete; subscriber/tag/note ops
mutate contact PII and risk welcome emails); `gmail` create_draft/create_draft_reply (no
drafts-delete action — proven §23) + create_label (no delete_label); `notion:create_database`
(no archive-database action + no independent read-back); `microsoft-onenote`
create_notebook/create_section (Graph exposes no notebook/section DELETE); `trello`
create_board/create_list (no board-delete / list-archive action).

**F. Mutate / destroy an EXISTING user resource — no smoke-owned target (9):** `gmail`
add_label/remove_label/mark_as_read/mark_as_unread/archive_email/delete_email; `microsoft-outlook`
add_categories/move_email/delete_email. (Acting requires a real inbound user email; creating one
means sending. `outlook:add_categories` additionally has no certified read exposing `categories`
for verify.)

**G. Reverse-cleanup exists but no clean cert path — re-checked, still deferred (18):** the
remaining `slack` channel/message surface (add_reaction/remove_reaction, pin_message/unpin_message,
create_channel/archive_channel/unarchive_channel/rename_channel/set_channel_purpose/set_channel_topic,
join_channel/leave_channel, invite_users_to_channel/remove_user_from_channel, update_message,
cancel_scheduled_message) plus `google-analytics:create_conversion_event`. See §28.3 for why none
is "clearly safe."

### 28.3 "Possibly safe" group re-checked (the only step-4 work) — verdict: NONE clearly safe

Two connected-provider candidate families looked plausible and were inspected against the real
registries this turn:

- **Slack reaction / pin pairs** (`add_reaction`→`remove_reaction`, `pin_message`→`unpin_message`):
  a registered reverse-cleanup DOES exist, and `get_messages` passes the raw Slack message objects
  through (so a `reactions` array IS present on read-back). **But it is not cleanly certifiable:**
  (1) a reaction emoji name / pin flag cannot carry the unique run-token marker, so confirming THIS
  run's side effect needs a compound "the marker-identified message has reaction/pin Y" assertion
  the harness's `markerPath`/`markerSuffix` cannot express — adding it is a harness verify-primitive
  slice, not a fixture, and authoring around it would weaken verification; and (2) the setup message
  has no liveSafe cleanup (`slack:delete_message` is non-liveSafe), so each run would leave a message.
  Slack `create_channel` is separately uncertifiable because Slack has no channel DELETE — `archive`
  is not a true erase (the channel persists in archived listings, so "remaining 0" cannot be claimed,
  unlike OneDrive's recycle-bin where get/list 404s).
- **HubSpot list / line-item pairs** (`add_contact_to_list`/`remove_from_list`,
  `create_line_item`/`remove_line_item`): the only registered "remove" is `removeFromList`; there is
  no record delete. Both pairs require operator-provisioned parent resources (a contact + a list; a
  deal) AND no certified HubSpot read exposes list membership for an independent verify. Deferred.

No other connected-provider MISSING action clears all four bars (smoke-owned setup · independent
verify · registered cleanup · no send/broadcast/billing/sharing/raw-bytes). **Therefore no fixture
was authored** (per the rule: author only a clearly-safe candidate; do not add production actions
just to enable cleanup; do not weaken verification).

### 28.4 Recommendation — move to triggers

**Action-smoke is exhausted on the currently-connected providers.** Every remaining action is
excluded by lane (send/billing/sharing/bytes), lacks a registered cleanup, lacks an independent
verify, or needs a provider connection / operator resource the smoke account doesn't have. The
live-certifiable action surface for the connected set is fully greened: **135 LIVE_PASS**, with
airtable / google-drive / google-sheets / google-docs / google-calendar / microsoft-excel /
microsoft-onedrive / microsoft-outlook-calendar all write-complete, plus the read + safe-write
frontier on gmail / outlook / notion / onenote / teams / dropbox / trello / mailchimp / facebook /
hubspot. **Recommended next lane: triggers.**

**If more ACTION certs are wanted instead (each is an operator/connection unlock, not a code task
in this lane):**
- Connect on the smoke account: **monday**, **discord**, a **Stripe TEST-mode** account,
  **shopify**, **github** → unlocks 15 NOT_RUN reads immediately + safe creates-with-delete where a
  real delete exists (e.g. `github:create_issue` → close/delete).
- Provision a **GA4 property** on the connected Google account → unlocks the 4 GA reads.
- Provision a **second OneNote `[TEST]` section** → unlocks `copy_page` (§14).
- (Optional, harness slice) add a compound Slack verify primitive (marker-identified message AND
  reactions[]/pin contains the value) + a liveSafe smoke-owned message cleanup → would unlock the
  Slack reaction/pin pairs.

**Offline verification (this turn):** `npm run chainreact -- smoke actions --cert` → **298 / 135
LIVE_PASS / 22 not-run / 141 missing / 0 fail / 0 bug** (unchanged); `npx jest tests/unit/smoke-actions`
→ 45 suites / 464 tests pass; `npx tsc --noEmit` → exit 0; `npm run lint:structure` → OK. No code
or fixture changed (docs-only), so no eslint targets. **No db:push, no deploy, nothing pushed.**
