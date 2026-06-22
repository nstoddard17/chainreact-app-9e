/**
 * @jest-environment node
 *
 * Provider Action CERTIFICATION matrix — pure data + matrix builder.
 *
 * Business rules protected:
 *   - the matrix enumerates EVERY registered action (coverage gaps stay visible
 *     as MISSING_FIXTURE),
 *   - explicit LIVE_PASS / BLOCKED_ENV win over the derived default,
 *   - a fixtured-but-uncertified action derives LIVE_NOT_RUN (runs by default),
 *   - only LIVE_PASS drives `shouldCertifiedSkip` (and never under rerun),
 *   - the durable certification state holds SAFE FACTS ONLY — no secrets /
 *     selector values / account / run / workflow ids / payloads.
 */
import type { FixtureDescriptor, RegisteredAction } from "@/scripts/chainreact/smoke/core";
import {
  CERTIFICATIONS,
  CERTIFICATION_STATUSES,
  buildCertificationMatrix,
  getCertification,
  isCertifiedFailing,
  isCertifiedLivePass,
  renderCertificationJson,
  shouldCertifiedSkip,
} from "@/scripts/chainreact/smoke/certification";
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

describe("certification matrix — derivation rules", () => {
  const registered: RegisteredAction[] = [
    { provider: "slack", action: "list_channels" }, // LIVE_PASS (explicit)
    { provider: "slack", action: "list_users" }, // fixtured, uncertified -> LIVE_NOT_RUN
    { provider: "acme", action: "blocked" }, // BLOCKED_ENV (explicit)
    { provider: "acme", action: "do_thing" }, // fixtured, uncertified -> LIVE_NOT_RUN
    { provider: "acme", action: "no_fixture" }, // no fixture -> MISSING_FIXTURE
  ];
  const fixtures: FixtureDescriptor[] = [
    { provider: "slack", action: "list_channels", risk: "read", requiredEnv: [], liveSafe: true },
    { provider: "slack", action: "list_users", risk: "read", requiredEnv: [], liveSafe: true },
    { provider: "acme", action: "blocked", risk: "read", requiredEnv: [], liveSafe: true },
    { provider: "acme", action: "do_thing", risk: "read", requiredEnv: [], liveSafe: true },
  ];
  // Explicit certs so the derivation rules are tested deterministically (not
  // coupled to the evolving real certification seed).
  const certs = [
    { provider: "slack", action: "list_channels", status: "LIVE_PASS" as const },
    { provider: "acme", action: "blocked", status: "BLOCKED_ENV" as const },
  ];

  it("enumerates every registered action and derives status correctly", () => {
    const m = buildCertificationMatrix(registered, fixtures, certs);
    const byKey = new Map(m.rows.map((r) => [`${r.provider}:${r.action}`, r]));
    expect(m.rows).toHaveLength(registered.length); // EVERY registered action present
    expect(byKey.get("slack:list_channels")?.status).toBe("LIVE_PASS");
    expect(byKey.get("acme:blocked")?.status).toBe("BLOCKED_ENV"); // explicit non-LIVE_PASS wins
    expect(byKey.get("acme:do_thing")?.status).toBe("LIVE_NOT_RUN"); // fixtured, uncertified
    expect(byKey.get("acme:do_thing")?.explicit).toBe(false);
    expect(byKey.get("acme:no_fixture")?.status).toBe("MISSING_FIXTURE"); // gap stays visible
    expect(byKey.get("acme:no_fixture")?.hasFixture).toBe(false);
  });

  it("flags a certification whose action is not registered as stale", () => {
    const m = buildCertificationMatrix(
      [{ provider: "acme", action: "do_thing" }],
      fixtures,
      [{ provider: "ghost", action: "gone", status: "LIVE_PASS" }],
    );
    expect(m.staleCerts).toContain("ghost:gone");
  });

  it("provider filter narrows rows to that provider", () => {
    const m = buildCertificationMatrix(registered, fixtures, undefined, { providerFilter: "slack" });
    expect(m.rows.every((r) => r.provider === "slack")).toBe(true);
    expect(m.rows).toHaveLength(2);
  });
});

describe("certification lookups + planner predicate", () => {
  it("isCertifiedLivePass is true for a seeded LIVE_PASS, false otherwise", () => {
    expect(isCertifiedLivePass("airtable", "get_record")).toBe(true);
    expect(isCertifiedLivePass("microsoft-excel", "get_workbooks")).toBe(true); // verified after the workbooksList fix
    expect(isCertifiedLivePass("native", "format_transformer")).toBe(false); // baseline, always runs
    expect(isCertifiedLivePass("acme", "unknown")).toBe(false);
  });

  it("shouldCertifiedSkip only skips LIVE_PASS and never under rerun", () => {
    expect(shouldCertifiedSkip("airtable", "get_record", false)).toBe(true);
    expect(shouldCertifiedSkip("airtable", "get_record", true)).toBe(false); // rerun sweep
    expect(shouldCertifiedSkip("microsoft-excel", "get_workbooks", false)).toBe(true); // now LIVE_PASS → skipped
    expect(shouldCertifiedSkip("native", "format_transformer", false)).toBe(false); // baseline runs
  });

  it("native baseline is intentionally NOT certified (always re-runs)", () => {
    expect(getCertification("native", "format_transformer")).toBeUndefined();
  });

  it("isCertifiedFailing is true for FAIL/BUG only (drives the live gate's known-vs-regression split)", () => {
    const certs = [
      { provider: "acme", action: "bug_one", status: "BUG" as const },
      { provider: "acme", action: "fail_one", status: "FAIL" as const },
      { provider: "acme", action: "good_one", status: "LIVE_PASS" as const },
    ];
    expect(isCertifiedFailing("acme", "bug_one", certs)).toBe(true);
    expect(isCertifiedFailing("acme", "fail_one", certs)).toBe(true);
    expect(isCertifiedFailing("acme", "good_one", certs)).toBe(false);
    expect(isCertifiedFailing("acme", "unknown", certs)).toBe(false);
    // facebook:get_page_insights was a BUG; after the metric fix it is LIVE_PASS
    // (no longer a known-failing action against the real seed).
    expect(isCertifiedFailing("facebook", "get_page_insights")).toBe(false);
    expect(isCertifiedLivePass("facebook", "get_page_insights")).toBe(true);
  });
});

describe("certification matrix over the REAL registry", () => {
  it("enumerates all registered actions and keeps missing-fixture gaps visible", () => {
    const registered = listRegisteredActions();
    const m = buildCertificationMatrix(registered, realDescriptors());
    expect(m.totals.registered).toBe(registered.length); // ALL registered actions
    expect(m.totals.livePass).toBeGreaterThan(0);
    expect(m.totals.missingFixture).toBeGreaterThan(0); // coverage gaps still surface
    expect(m.staleCerts).toEqual([]); // every seeded cert maps to a real action
    // Excel is LIVE_PASS after the get_workbooks OneDrive $filter fix.
    expect(m.rows.find((r) => r.provider === "microsoft-excel" && r.action === "get_workbooks")?.status).toBe(
      "LIVE_PASS",
    );
  });

  it("JSON output is parseable and additive (kind=certification + totals + rows)", () => {
    const m = buildCertificationMatrix(listRegisteredActions(), realDescriptors());
    const json = JSON.parse(renderCertificationJson(m));
    expect(json.kind).toBe("certification");
    expect(json.totals.registered).toBe(m.totals.registered);
    expect(Array.isArray(json.rows)).toBe(true);
  });
});

describe("certification state holds SAFE FACTS ONLY (no secrets / selectors / ids)", () => {
  // Shapes that would indicate a selector value, id, token, or payload leaked
  // into a committed certification note.
  const FORBIDDEN = [
    /app[A-Za-z0-9]{12,}/, // Airtable base id
    /tbl[A-Za-z0-9]{12,}/, // Airtable table id
    /rec[A-Za-z0-9]{12,}/, // Airtable record id
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, // uuid
    /xox[abprs]-/i, // slack token
    /\bBearer\s+\S+/i, // bearer token
    /eyJ[A-Za-z0-9_-]{10,}/, // jwt
    /sk-[A-Za-z0-9]{10,}/, // api key
    /[A-Za-z0-9_-]{40,}/, // any long opaque blob
  ];

  it("every record is a safe (provider, action, status[, date, commit, note]) tuple", () => {
    for (const c of CERTIFICATIONS) {
      expect(c.provider).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(c.action).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(CERTIFICATION_STATUSES).toContain(c.status);
      if (c.date !== undefined) expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (c.commit !== undefined) expect(c.commit).toMatch(/^[0-9a-f]{7,40}$/);
      const note = c.note ?? "";
      expect(note.length).toBeLessThan(160);
      for (const pat of FORBIDDEN) expect(note).not.toMatch(pat);
    }
  });
});
