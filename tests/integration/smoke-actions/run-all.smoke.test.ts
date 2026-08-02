/**
 * @jest-environment node
 *
 * Action smoke harness — the real run-all smoke spec.
 *
 * This is the spec `npm run smoke:actions:run` exercises. It runs EVERY shipped
 * fixture through the REAL V2 internals (real strict resolver → real handler
 * registry → real handler call). No provider boundary is faked here, so safety
 * is enforced on TWO independent levels:
 *   1. provider-connected fixtures declare requiredEnv and SKIP when it's unset
 *      (the default in CI / no-creds dev);
 *   2. even WITH those credentials present, real provider dispatch additionally
 *      requires the explicit `ALLOW_LIVE_PROVIDER_SMOKE=true` opt-in
 *      (CI-GATE-COLLECTION-FIX-1) — so a plain `npm test` on an operator machine
 *      that happens to export SMOKE_* vars can never place live provider calls.
 * The native pure-transform fixture needs no credentials, so it genuinely
 * executes and passes — this path is real, not all-skips.
 *
 * The gate: zero FAIL results. PASS or SKIP are both acceptable — a SKIP means
 * "couldn't safely run here", not "broken".
 */
import { ALL_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { runActionSmoke } from "@/tests/smoke-actions/harness";
import { renderExecutionHuman } from "@/scripts/chainreact/smoke/core";

describe("action smoke: run all fixtures through real V2 internals", () => {
  it("produces no FAIL results (the smoke gate)", async () => {
    const report = await runActionSmoke(ALL_SMOKE_FIXTURES, { includeDestructive: false });
    // Surface the human report on failure for fast triage.
    if (!report.ok) {
      console.error(renderExecutionHuman(report));
    }
    expect(report.totals.fail).toBe(0);
  });

  it("actually executes the native pure-transform action (proves the path is real, not all skips)", async () => {
    const report = await runActionSmoke(ALL_SMOKE_FIXTURES, { includeDestructive: false });
    const native = report.results.find((r) => r.provider === "native" && r.action === "format_transformer");
    expect(native?.outcome).toBe("pass");
    expect(native?.runId).not.toBeNull();
  });

  it("skips connected-provider fixtures when their env is unset (safe default)", async () => {
    const prev = {
      conn: process.env.SMOKE_SLACK_CONNECTED,
      chan: process.env.SMOKE_SLACK_CHANNEL,
    };
    delete process.env.SMOKE_SLACK_CONNECTED;
    delete process.env.SMOKE_SLACK_CHANNEL;
    try {
      const report = await runActionSmoke(ALL_SMOKE_FIXTURES, { includeDestructive: false });
      const slack = report.results.filter((r) => r.provider === "slack");
      expect(slack.length).toBeGreaterThan(0);
      expect(slack.every((r) => r.outcome === "skip")).toBe(true);
    } finally {
      if (prev.conn !== undefined) process.env.SMOKE_SLACK_CONNECTED = prev.conn;
      if (prev.chan !== undefined) process.env.SMOKE_SLACK_CHANNEL = prev.chan;
    }
  });

  it("never dispatches a provider fixture without ALLOW_LIVE_PROVIDER_SMOKE, even when its env IS satisfied", async () => {
    // The safety property a plain `npm test` depends on: ambient provider
    // credentials alone must never be enough to place a real provider call.
    //
    // NON-VACUITY: these are the REAL required env names for the Slack fixtures,
    // so the requiredEnv SKIP is genuinely satisfied here and cannot be what
    // stops the run. Anything still skipped is stopped by the live-dispatch gate
    // alone — asserted below by its exact reason, and by a null runId (a runId is
    // only minted at the dispatch step, so null proves the handler never ran).
    const KEYS = ["SMOKE_SLACK_CONNECTED", "SMOKE_SLACK_CHANNEL_ID", "ALLOW_LIVE_PROVIDER_SMOKE"] as const;
    const prev = Object.fromEntries(KEYS.map((k) => [k, process.env[k]])) as Record<string, string | undefined>;
    process.env.SMOKE_SLACK_CONNECTED = "1";
    process.env.SMOKE_SLACK_CHANNEL_ID = "C0SMOKESYNTHETIC";
    delete process.env.ALLOW_LIVE_PROVIDER_SMOKE;
    try {
      const report = await runActionSmoke(ALL_SMOKE_FIXTURES, { includeDestructive: false });
      const blocked = report.results.filter(
        (r) => r.reason === "live provider dispatch requires ALLOW_LIVE_PROVIDER_SMOKE=true",
      );
      expect(blocked.length).toBeGreaterThan(0);
      expect(blocked.every((r) => r.outcome === "skip")).toBe(true);
      expect(blocked.every((r) => r.runId === null)).toBe(true);
      expect(report.totals.fail).toBe(0);
    } finally {
      for (const k of KEYS) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
    }
  });
});
