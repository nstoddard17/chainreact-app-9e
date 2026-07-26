/**
 * @jest-environment node
 *
 * Certification seed — provider-scoped SPLIT invariance.
 *
 * The monolithic certificationSeed.ts outgrew the max-lines cap and was split
 * into provider-scoped modules under certificationSeed/ (barrel index preserves
 * the import surface). This suite pins the DATA so the refactor (and any future
 * module reshuffling) can never silently change certification state:
 *   - exact record count at split time (updates only when a batch legitimately
 *     adds records),
 *   - no duplicate (provider, action) keys (the matrix Map is later-wins, so an
 *     accidental duplicate would silently shadow a record),
 *   - each provider module contains ONLY its own providers' records,
 *   - the REAL-registry matrix totals at split time (the exact matrix the
 *     refactor promised to preserve).
 */
import type { FixtureDescriptor } from "@/scripts/chainreact/smoke/core";
import {
  CERTIFICATIONS,
  buildCertificationMatrix,
} from "@/scripts/chainreact/smoke/certification";
import { SLACK_CERTIFICATIONS } from "@/scripts/chainreact/smoke/certificationSeed/slack";
import { GMAIL_CERTIFICATIONS } from "@/scripts/chainreact/smoke/certificationSeed/gmail";
import { HUBSPOT_CERTIFICATIONS } from "@/scripts/chainreact/smoke/certificationSeed/hubspot";
import { MONDAY_CERTIFICATIONS } from "@/scripts/chainreact/smoke/certificationSeed/monday";
import { NOTION_CERTIFICATIONS } from "@/scripts/chainreact/smoke/certificationSeed/notion";
import { MAILCHIMP_CERTIFICATIONS } from "@/scripts/chainreact/smoke/certificationSeed/mailchimp";
import { MICROSOFT_CERTIFICATIONS } from "@/scripts/chainreact/smoke/certificationSeed/microsoft";
import { GOOGLE_CERTIFICATIONS } from "@/scripts/chainreact/smoke/certificationSeed/google";
import { SHOPIFY_CERTIFICATIONS } from "@/scripts/chainreact/smoke/certificationSeed/shopify";
import { GITHUB_CERTIFICATIONS } from "@/scripts/chainreact/smoke/certificationSeed/github";
import { OTHER_CERTIFICATIONS } from "@/scripts/chainreact/smoke/certificationSeed/other";
import { listRegisteredActions } from "@/tests/smoke-actions/discovery";
import { ALL_FIXTURES_FOR_INVENTORY } from "@/tests/smoke-actions/fixtures";

const realDescriptors = (): FixtureDescriptor[] =>
  ALL_FIXTURES_FOR_INVENTORY.map((f) => ({
    provider: f.provider,
    action: f.action,
    risk: f.risk,
    requiredEnv: f.requiredEnv ?? [],
    liveSafe: f.liveSafe,
  }));

/** Provider ownership per module — a record in the wrong module is a merge hazard. */
const MODULE_PROVIDERS: ReadonlyArray<readonly [string, readonly { provider: string }[], readonly string[]]> = [
  ["slack", SLACK_CERTIFICATIONS, ["slack"]],
  ["gmail", GMAIL_CERTIFICATIONS, ["gmail"]],
  ["hubspot", HUBSPOT_CERTIFICATIONS, ["hubspot"]],
  ["monday", MONDAY_CERTIFICATIONS, ["monday"]],
  ["notion", NOTION_CERTIFICATIONS, ["notion"]],
  ["mailchimp", MAILCHIMP_CERTIFICATIONS, ["mailchimp"]],
  [
    "microsoft",
    MICROSOFT_CERTIFICATIONS,
    [
      "microsoft-outlook",
      "microsoft-outlook-calendar",
      "microsoft-teams",
      "microsoft-excel",
      "microsoft-onedrive",
      "microsoft-onenote",
    ],
  ],
  [
    "google",
    GOOGLE_CERTIFICATIONS,
    ["google-sheets", "google-drive", "google-calendar", "google-docs", "google-analytics"],
  ],
  ["shopify", SHOPIFY_CERTIFICATIONS, ["shopify"]],
  ["github", GITHUB_CERTIFICATIONS, ["github"]],
  [
    "other",
    OTHER_CERTIFICATIONS,
    ["airtable", "dropbox", "trello", "native", "asana", "typeform", "facebook", "stripe", "discord", "quickbooks"],
  ],
];

describe("certification seed split — data invariance", () => {
  it("the barrel concatenates every module with no records lost or invented", () => {
    const sum = MODULE_PROVIDERS.reduce((n, [, mod]) => n + mod.length, 0);
    expect(CERTIFICATIONS.length).toBe(sum);
    // Pinned at split time (2026-07-04). Bump ONLY when a batch adds records.
    // +1: facebook:send_message BLOCKED_ENV (readiness probe, same day).
    // +11: shopify write lifecycle batch (same day).
    // +6: github write batch — self-owned crsmoke resources (same day).
    // +6: facebook post/page batch — 5 LIVE_PASS_CLEANED + 1 BLOCKED_ENV video (same day).
    // +1: native:format_transformer certified (2026-07-06; was the always-run baseline).
    // +1: asana:list_tasks_in_project ASANA-2 live read (2026-07-06).
    // +1: asana:create_subtask ASANA-2 live write, post-owner-setup (2026-07-06).
    // +2: typeform TYPEFORM-2 records (seeded FAIL/BLOCKED_ENV pre-owner-setup
    //     2026-07-06; flipped to LIVE_PASS at Phase 13, 2026-07-07).
    // +7: QUICKBOOKS-1 records (seeded BLOCKED_ENV pre-owner-setup 2026-07-07;
    //     flip at Phase 13 live certification).
    expect(CERTIFICATIONS.length).toBe(293);
  });

  it("no duplicate (provider, action) keys — later-wins shadowing is impossible", () => {
    const keys = CERTIFICATIONS.map((c) => `${c.provider}:${c.action}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every module holds ONLY its own providers' records", () => {
    for (const [name, mod, providers] of MODULE_PROVIDERS) {
      const allowed = new Set(providers);
      const foreign = mod.filter((r) => !allowed.has(r.provider));
      expect({ module: name, foreign }).toEqual({ module: name, foreign: [] });
    }
  });

  it("the REAL-registry matrix totals match the pre-split matrix exactly", () => {
    const m = buildCertificationMatrix(listRegisteredActions(), realDescriptors());
    // Split-time snapshot (2026-07-04), same-day updated by: the readiness probe
    // (facebook:send_message MISSING -> BLOCKED_ENV), the shopify write batch
    // (11 MISSING -> LIVE_PASS), the github write batch (6 MISSING -> LIVE_PASS,
    // self-owned crsmoke resources), the facebook post/page batch (6 MISSING ->
    // 5 LIVE_PASS + 1 BLOCKED_ENV video), and native:format_transformer (the last
    // NOT_RUN baseline, now certified): 303 registered / 269 LIVE_PASS / 0 NOT_RUN /
    // 21 MISSING / 13 BLOCKED_ENV / 0 fail / 0 bug. Certification batches update
    // these pins deliberately.
    // ASANA-2 (2026-07-06): +2 registered (asana:create_subtask,
    // asana:list_tasks_in_project). Both live-certified same day:
    // list_tasks_in_project via the workflow-live sweep (held tasks:read),
    // create_subtask via the gated write batch post-owner-setup
    // (LIVE_PASS_LEFT_ARTIFACT — completed crsmoke parent+subtask stay).
    // 305 registered / 271 LIVE_PASS / 0 LIVE_NOT_RUN.
    // TYPEFORM-2 (2026-07-06): +2 registered (typeform:list_responses,
    // typeform:get_response) behind the NEW responses:read scope. Pre-owner-
    // setup they were FAIL (live 403, token predated the scope) + BLOCKED_ENV.
    // Phase 13 PASSED 2026-07-07 after deploy + smoke-account reconnect: both
    // live-certified through the workflow-live sweep (real token found:true +
    // fake token found:false), records flipped to LIVE_PASS.
    // 307 registered / 273 LIVE_PASS / 0 FAIL / 13 BLOCKED_ENV.
    // QUICKBOOKS-1 (2026-07-07): +7 registered (3 customer + 4 invoice
    // actions), all fixtures authored (4 read + 3 write), all seeded
    // BLOCKED_ENV pre-owner-setup (no Intuit app / sandbox company /
    // SMOKE_QUICKBOOKS_* env yet). Phase 13 flips them after owner setup.
    // 314 registered / 273 LIVE_PASS / 20 BLOCKED_ENV.
    // EDEN-4/5/6 (2026-07): +36 registered eden MCP actions (batches 1–3:
    // notes, boards, content/creator/prompt reads, scheduling writes). No
    // smoke fixtures authored yet, so all 36 land in missingFixture
    // (21 -> 57). Live certification for eden is tracked in the EDEN slice
    // docs, not this matrix, until fixtures exist.
    // 350 registered / 273 LIVE_PASS / 57 MISSING / 20 BLOCKED_ENV.
    // MICROSOFT-POWERBI (2026-07-16): +47 registered (12 semantic-model, 7
    // report/export, 2 import, 4 dataflow, 10 pipeline, 5 workspace, 5 gateway,
    // 2 capacity), all 47 fixtures authored (10 read + 37 write) and now
    // registered in fixtures.ts. Registering a fixture moves a row
    // MISSING_FIXTURE -> LIVE_NOT_RUN (the matrix derives status from
    // fixture-presence + explicit cert records ONLY — it never reads
    // `requiredEnv`), so the 47 land in liveNotRun, NOT blockedEnv: no
    // microsoft-powerbi certification records are seeded yet. The fixtures are
    // still env-gated at RUN time (SMOKE_MICROSOFT_POWERBI_CONNECTED +
    // SMOKE_POWERBI_*), so nothing executes live pre-owner-setup. Seeding the
    // 47 BLOCKED_ENV records (the QUICKBOOKS-1 precedent, which is why that
    // batch moved blockedEnv) is a separate deliberate step; Phase 13 live
    // certification flips them after owner setup.
    // missingFixture nets back to 57: 57 + 47 powerbi (registered, no fixtures)
    // = 104 before this batch, - 47 now that the fixtures are wired.
    // 397 registered / 273 LIVE_PASS / 47 LIVE_NOT_RUN / 57 MISSING / 20 BLOCKED_ENV.
    // TEST-SUITE-GREEN-1 (2026-07-26): re-pinned to the registry as it actually
    // stands. Net +17 registered since the Power BI pin, reconciled exactly
    // against `services/execution/handlers/_handlerInventory.ts` (the surface
    // `listRegisteredActions()` reads) — 20 handlers added, 3 removed:
    //   + ai 2 (analyze_document, transform_data)
    //   + fleetio 4 (get_vehicle, update_vehicle_status, create_meter_entry,
    //     find_linked_vehicle)
    //   + linear 4 (find_issues, create_issue, update_issue, add_comment)
    //   + motive 10 (vehicle/driver/fuel-purchase actions)
    //   − eden 3 (schedule_post, publish_post_now, update_scheduled_post)
    // Status split of those 20: 18 have no smoke fixture (MISSING_FIXTURE) and
    // 2 do (motive:get_fuel_purchase, motive:list_fuel_purchases → LIVE_NOT_RUN,
    // fixture present but no certification record seeded). The 3 removed eden
    // rows were MISSING_FIXTURE. So missingFixture 57 + 18 − 3 = 72 and
    // liveNotRun 47 + 2 = 49, while livePass and blockedEnv are UNCHANGED —
    // this batch certified nothing live and blocked nothing new; it only
    // records registry growth that already happened.
    // 414 registered / 273 LIVE_PASS / 49 LIVE_NOT_RUN / 72 MISSING / 20 BLOCKED_ENV.
    expect(m.totals.registered).toBe(414);
    expect(m.totals.livePass).toBe(273);
    expect(m.totals.liveNotRun).toBe(49);
    expect(m.totals.missingFixture).toBe(72);
    expect(m.totals.blockedEnv).toBe(20);
    expect(m.totals.fail).toBe(0);
    expect(m.totals.bug).toBe(0);
    expect(m.staleCerts).toEqual([]);
  });
});
