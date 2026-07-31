/**
 * @jest-environment node
 *
 * WORKFLOW-LIVE-TEST-2 §4/§15 — the live-test session state machine.
 *
 * A session is an execution authorization: while alive it can, once, permit a real side-effecting
 * run of an inactive workflow. These tests pin the transitions that make that safe — especially
 * the ones that must be IMPOSSIBLE — and assert the TypeScript vocabulary matches the database
 * enum and the partial unique index it mirrors.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ACTIVE_LIVE_TEST_STATUSES,
  LIVE_TEST_SESSION_STATUSES,
  PRE_EXECUTION_LIVE_TEST_STATUSES,
  TERMINAL_LIVE_TEST_STATUSES,
  allowedTransitions,
  canTransition,
  isActiveLiveTestStatus,
  isPreExecutionLiveTestStatus,
  isTerminalLiveTestStatus,
  type LiveTestSessionStatus,
} from "@/core/workflows/liveTestSessionLifecycle";

const MIGRATION = readFileSync(
  join(resolve(process.cwd(), "supabase/migrations"), "20260811000000_workflow_live_test_sessions.sql"),
  "utf8",
);

describe("live-test lifecycle — legal transitions", () => {
  it.each([
    ["awaiting_consent", "waiting_for_trigger"],
    ["waiting_for_trigger", "trigger_received"],
    ["trigger_received", "authorizing_execution"],
    ["authorizing_execution", "running"],
    ["running", "succeeded"],
    ["running", "failed"],
  ] as ReadonlyArray<[LiveTestSessionStatus, LiveTestSessionStatus]>)(
    "%s → %s is allowed",
    (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    },
  );

  it("every pre-execution state may be cancelled or expired", () => {
    for (const status of PRE_EXECUTION_LIVE_TEST_STATUSES) {
      expect({ status, cancel: canTransition(status, "cancelled") }).toEqual({ status, cancel: true });
      expect({ status, expire: canTransition(status, "expired") }).toEqual({ status, expire: true });
    }
  });

  it("authorization may fail closed without ever producing a run", () => {
    expect(canTransition("authorizing_execution", "failed")).toBe(true);
  });
});

describe("live-test lifecycle — illegal transitions are impossible", () => {
  it.each([
    ["cancelled", "running"],
    ["expired", "trigger_received"],
    ["succeeded", "running"],
    ["failed", "running"],
    ["awaiting_consent", "running"],
    ["awaiting_consent", "succeeded"],
    ["waiting_for_trigger", "succeeded"],
    ["waiting_for_trigger", "running"],
    ["trigger_received", "running"],
    ["cancelled", "expired"],
    ["succeeded", "failed"],
  ] as ReadonlyArray<[LiveTestSessionStatus, LiveTestSessionStatus]>)(
    "%s → %s is rejected",
    (from, to) => {
      expect(canTransition(from, to)).toBe(false);
    },
  );

  it("a terminal state has NO outgoing transition at all", () => {
    for (const status of TERMINAL_LIVE_TEST_STATUSES) {
      expect({ status, next: allowedTransitions(status) }).toEqual({ status, next: [] });
      expect(isTerminalLiveTestStatus(status)).toBe(true);
    }
  });

  it("once running, a session can never be cancelled — side effects may already exist", () => {
    expect(canTransition("running", "cancelled")).toBe(false);
    expect(canTransition("running", "expired")).toBe(false);
    expect(isPreExecutionLiveTestStatus("running")).toBe(false);
  });

  it("fails closed for any pair not explicitly declared", () => {
    // Exhaustive sweep: every (from,to) either appears in the table or is rejected.
    for (const from of LIVE_TEST_SESSION_STATUSES) {
      for (const to of LIVE_TEST_SESSION_STATUSES) {
        const declared = allowedTransitions(from).includes(to);
        expect({ from, to, canTransition: canTransition(from, to) }).toEqual({
          from,
          to,
          canTransition: declared,
        });
      }
    }
  });

  it("no state can transition to itself (a second move out of one state is never a no-op)", () => {
    for (const status of LIVE_TEST_SESSION_STATUSES) {
      expect({ status, self: canTransition(status, status) }).toEqual({ status, self: false });
    }
  });
});

describe("live-test lifecycle — matches the database", () => {
  it("the TypeScript status list matches the Postgres enum exactly, in order", () => {
    const enumBody = MIGRATION.slice(
      MIGRATION.indexOf("CREATE TYPE public.workflow_live_test_status AS ENUM ("),
    );
    const values = [...enumBody.slice(0, enumBody.indexOf(");")).matchAll(/'([a-z_]+)'/g)].map(
      (m) => m[1],
    );
    expect(values).toEqual([...LIVE_TEST_SESSION_STATUSES]);
  });

  it("ACTIVE_LIVE_TEST_STATUSES matches the partial unique index predicate", () => {
    // If these drift, either two sessions could listen at once, or a workflow becomes permanently
    // un-testable because a terminal row keeps holding the slot.
    const idx = MIGRATION.slice(MIGRATION.indexOf("workflow_live_test_sessions_one_active_idx"));
    const predicate = idx.slice(idx.indexOf("WHERE status IN ("), idx.indexOf(");"));
    const values = [...predicate.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(values.sort()).toEqual([...ACTIVE_LIVE_TEST_STATUSES].sort());
  });

  it("active states are exactly the non-terminal ones", () => {
    const nonTerminal = LIVE_TEST_SESSION_STATUSES.filter((s) => !isTerminalLiveTestStatus(s));
    expect([...nonTerminal].sort()).toEqual([...ACTIVE_LIVE_TEST_STATUSES].sort());
    for (const status of ACTIVE_LIVE_TEST_STATUSES) {
      expect({ status, active: isActiveLiveTestStatus(status) }).toEqual({ status, active: true });
    }
  });

  it("pre-execution states are the active ones minus running", () => {
    expect([...PRE_EXECUTION_LIVE_TEST_STATUSES].sort()).toEqual(
      ACTIVE_LIVE_TEST_STATUSES.filter((s) => s !== "running").sort(),
    );
  });
});

describe("live-test session table — durable safety properties (static)", () => {
  it("is service-role only: RLS on, deny-all policy, no authenticated grant", () => {
    expect(MIGRATION).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(MIGRATION).toMatch(/FOR ALL USING \(false\) WITH CHECK \(false\)/);
    expect(MIGRATION).not.toMatch(/GRANT[^;]*TO authenticated/);
    expect(MIGRATION).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE\s+ON public\.workflow_live_test_sessions TO service_role/);
  });

  it("stores no credential material", () => {
    expect(MIGRATION).not.toMatch(/access_token|refresh_token|client_secret|encrypted_credential/i);
  });

  it("pairs consumption with the run it authorized (no run can escape the single-use gate)", () => {
    expect(MIGRATION).toMatch(/workflow_live_test_sessions_consumed_pairs_run/);
  });

  it("indexes the lookups the lifecycle needs", () => {
    for (const idx of ["_workflow_idx", "_account_idx", "_expiry_idx", "_run_idx", "_one_active_idx"]) {
      expect(MIGRATION).toContain(`workflow_live_test_sessions${idx}`);
    }
  });
});
