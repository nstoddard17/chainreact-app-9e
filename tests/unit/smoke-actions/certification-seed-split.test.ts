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
    ["airtable", "dropbox", "trello", "native", "asana", "typeform", "facebook", "stripe", "discord"],
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
    // +2: typeform TYPEFORM-2 pre-owner-setup records (list_responses FAIL —
    //     live 403, token predates responses:read; get_response BLOCKED_ENV).
    expect(CERTIFICATIONS.length).toBe(286);
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
    // typeform:get_response) behind the NEW responses:read scope — owner
    // setup (Typeform dev-app scope + smoke-account reconnect) is pending,
    // so list_responses is a certified known-FAIL (live 403, token predates
    // the scope) and get_response is BLOCKED_ENV (also needs a response
    // token env). Both flip to LIVE_PASS at Phase 13.
    // 307 registered / +1 FAIL / +1 BLOCKED_ENV.
    expect(m.totals.registered).toBe(307);
    expect(m.totals.livePass).toBe(271);
    expect(m.totals.liveNotRun).toBe(0);
    expect(m.totals.missingFixture).toBe(21);
    expect(m.totals.blockedEnv).toBe(14);
    expect(m.totals.fail).toBe(1);
    expect(m.totals.bug).toBe(0);
    expect(m.staleCerts).toEqual([]);
  });
});
