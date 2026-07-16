/**
 * @jest-environment node
 *
 * PRO-TEAM-TRIAL-ENFORCEMENT-1 — platform trial CONFIG + per-account OFFER resolution.
 *
 * Proves the dark-by-default config gate (`PLATFORM_TRIAL_PERIOD_DAYS`), the parse/clamp/
 * fail-closed behavior, the plan-config combination, and that the per-account offer is the AND of
 * (Pro/Team allowlist ∧ trials on ∧ trial not yet consumed) — reading the DB's authoritative
 * consumed marker (mocked here), never a client flag.
 */

const mockGetTrialState = jest.fn();
jest.mock("@/repositories/accountBilling", () => ({
  getTrialStateServiceRole: (...a: unknown[]) => mockGetTrialState(...a),
}));

import {
  PLATFORM_TRIAL_PERIOD_DAYS_ENV,
  resolveTrialPeriodDays,
  areTrialsEnabled,
  planTrialConfig,
  resolveTrialOffer,
} from "@/services/billing/platformTrialPolicy";

const origEnv = { ...process.env };
beforeEach(() => {
  mockGetTrialState.mockReset();
  process.env = { ...origEnv };
  delete process.env[PLATFORM_TRIAL_PERIOD_DAYS_ENV];
});
afterAll(() => {
  process.env = { ...origEnv };
});

describe("resolveTrialPeriodDays — dark by default + parse/clamp/fail-closed", () => {
  it("defaults to 0 (dark) when unset or blank", () => {
    expect(resolveTrialPeriodDays()).toBe(0);
    process.env[PLATFORM_TRIAL_PERIOD_DAYS_ENV] = "   ";
    expect(resolveTrialPeriodDays()).toBe(0);
  });

  it("reads a positive integer and trims whitespace", () => {
    process.env[PLATFORM_TRIAL_PERIOD_DAYS_ENV] = "14";
    expect(resolveTrialPeriodDays()).toBe(14);
    process.env[PLATFORM_TRIAL_PERIOD_DAYS_ENV] = "  7 ";
    expect(resolveTrialPeriodDays()).toBe(7);
  });

  it("fails closed to 0 on zero / negative / non-integer / garbage", () => {
    for (const v of ["0", "-5", "14.5", "abc", "NaN", "1e2", "Infinity"]) {
      process.env[PLATFORM_TRIAL_PERIOD_DAYS_ENV] = v;
      expect(resolveTrialPeriodDays()).toBe(0);
    }
  });

  it("clamps an over-large value to the 365 hard cap", () => {
    process.env[PLATFORM_TRIAL_PERIOD_DAYS_ENV] = "9999";
    expect(resolveTrialPeriodDays()).toBe(365);
  });

  it("areTrialsEnabled reflects the config gate", () => {
    expect(areTrialsEnabled()).toBe(false);
    process.env[PLATFORM_TRIAL_PERIOD_DAYS_ENV] = "14";
    expect(areTrialsEnabled()).toBe(true);
  });
});

describe("planTrialConfig — allowlist ∧ config (no account state)", () => {
  it("Pro/Team carry the configured days; Business/Enterprise/Free carry 0 even when on", () => {
    process.env[PLATFORM_TRIAL_PERIOD_DAYS_ENV] = "14";
    expect(planTrialConfig("pro")).toEqual({ eligiblePlan: true, trialPeriodDays: 14 });
    expect(planTrialConfig("team")).toEqual({ eligiblePlan: true, trialPeriodDays: 14 });
    expect(planTrialConfig("business")).toEqual({ eligiblePlan: false, trialPeriodDays: 0 });
    expect(planTrialConfig("enterprise")).toEqual({ eligiblePlan: false, trialPeriodDays: 0 });
    expect(planTrialConfig("free")).toEqual({ eligiblePlan: false, trialPeriodDays: 0 });
  });

  it("an eligible plan carries 0 days when trials are dark", () => {
    expect(planTrialConfig("pro")).toEqual({ eligiblePlan: true, trialPeriodDays: 0 });
  });
});

describe("resolveTrialOffer — allowlist ∧ config ∧ not-yet-consumed", () => {
  it("eligible: Pro, trials on, trial never consumed", async () => {
    process.env[PLATFORM_TRIAL_PERIOD_DAYS_ENV] = "14";
    mockGetTrialState.mockResolvedValueOnce({ consumedAt: null, startedAt: null, endsAt: null, originPlan: null });
    expect(await resolveTrialOffer("acct-1", "pro")).toEqual({ eligible: true, trialPeriodDays: 14 });
  });

  it("NOT eligible once the account has consumed its one trial (marker present)", async () => {
    process.env[PLATFORM_TRIAL_PERIOD_DAYS_ENV] = "14";
    mockGetTrialState.mockResolvedValueOnce({
      consumedAt: "2026-07-01T00:00:00.000Z",
      startedAt: "2026-07-01T00:00:00.000Z",
      endsAt: "2026-07-15T00:00:00.000Z",
      originPlan: "team",
    });
    // Even asking for Pro after a Team trial → no offer (one trial total across Pro+Team).
    expect(await resolveTrialOffer("acct-1", "pro")).toEqual({ eligible: false, trialPeriodDays: 0 });
  });

  it("NOT eligible for Business/Enterprise/Free — never reads the DB", async () => {
    process.env[PLATFORM_TRIAL_PERIOD_DAYS_ENV] = "14";
    expect(await resolveTrialOffer("acct-1", "business")).toEqual({ eligible: false, trialPeriodDays: 0 });
    expect(await resolveTrialOffer("acct-1", "enterprise")).toEqual({ eligible: false, trialPeriodDays: 0 });
    expect(await resolveTrialOffer("acct-1", "free")).toEqual({ eligible: false, trialPeriodDays: 0 });
    expect(mockGetTrialState).not.toHaveBeenCalled();
  });

  it("NOT eligible when trials are dark, even for Pro — never reads the DB", async () => {
    expect(await resolveTrialOffer("acct-1", "pro")).toEqual({ eligible: false, trialPeriodDays: 0 });
    expect(mockGetTrialState).not.toHaveBeenCalled();
  });
});
