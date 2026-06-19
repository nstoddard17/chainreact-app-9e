/**
 * @jest-environment node
 *
 * Action smoke harness — the real run-all smoke spec.
 *
 * This is the spec `npm run smoke:actions:run` exercises. It runs EVERY shipped
 * fixture through the REAL V2 internals (real strict resolver → real handler
 * registry → real handler call). No provider boundary is faked here — safety
 * comes from the fixtures themselves: provider-connected fixtures declare
 * requiredEnv and SKIP when it's unset (the default in CI / no-creds dev), while
 * the native pure-transform fixture genuinely executes and passes.
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
});
