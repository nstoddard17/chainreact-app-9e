/**
 * @jest-environment node
 *
 * Native ACTION smoke coverage — launch-ready inventory pin.
 *
 * Native actions are pure, credential-free handlers (no OAuth, no integration
 * lookup, no external resource). This suite pins that native action smoke coverage
 * is COMPLETE and stays complete:
 *   - the registry (the engine's dispatch source of truth) holds exactly the known
 *     native actions;
 *   - every native action has a fixture (never a MISSING_FIXTURE gap);
 *   - EVERY native action is certified LIVE_PASS — zero NOT_RUN. format_transformer
 *     was the always-run baseline canary; it is now certified like the rest (Marcus,
 *     2026-07-06: no real registered action stays uncertified for baseline purposes).
 *     The canary role is preserved via SMOKE_RERUN_PASSED=1 (force-run any certified
 *     native fixture through the real engine), NOT by leaving a row NOT_RUN;
 *   - no native action is NOT_RUN / MISSING_FIXTURE / BLOCKED_ENV / FAIL / BUG.
 *
 * A new native action added to the registry without a fixture + LIVE_PASS
 * certification fails CI here.
 */
import { buildCertificationMatrix, type CertificationMatrixRow } from "@/scripts/chainreact/smoke/certification";
import { listRegisteredActions } from "@/tests/smoke-actions/discovery";
import { ALL_FIXTURES_FOR_INVENTORY } from "@/tests/smoke-actions/fixtures";

/** The registered native actions (pinned; the registry test below is the guard). */
const NATIVE_ACTIONS = [
  "delay",
  "format_transformer",
  "http_request",
  "if_then_condition",
  "router",
] as const;

const descriptors = () =>
  ALL_FIXTURES_FOR_INVENTORY.map((f) => ({
    provider: f.provider,
    action: f.action,
    risk: f.risk,
    requiredEnv: f.requiredEnv ?? [],
    liveSafe: f.liveSafe,
  }));

const nativeRows = (): CertificationMatrixRow[] =>
  buildCertificationMatrix(listRegisteredActions(), descriptors()).rows.filter(
    (r) => r.provider === "native",
  );

describe("native action smoke coverage — launch-ready pin", () => {
  it("the registry holds exactly the known native actions", () => {
    const keys = listRegisteredActions()
      .filter((a) => a.provider === "native")
      .map((a) => a.action)
      .sort();
    expect(keys).toEqual([...NATIVE_ACTIONS].sort());
  });

  it("every native action has a fixture (no MISSING_FIXTURE gap)", () => {
    for (const r of nativeRows()) {
      expect({ action: r.action, hasFixture: r.hasFixture }).toEqual({
        action: r.action,
        hasFixture: true,
      });
    }
    expect(nativeRows().some((r) => r.status === "MISSING_FIXTURE")).toBe(false);
  });

  it("every native action is certified LIVE_PASS (zero NOT_RUN)", () => {
    for (const r of nativeRows()) {
      expect({ action: r.action, status: r.status }).toEqual({
        action: r.action,
        status: "LIVE_PASS",
      });
    }
  });

  it("no native action is NOT_RUN / FAIL / BUG / BLOCKED_ENV", () => {
    for (const r of nativeRows()) {
      expect(["LIVE_NOT_RUN", "FAIL", "BUG", "BLOCKED_ENV"]).not.toContain(r.status);
    }
  });

  it("pins the native action count — all 5 LIVE_PASS", () => {
    const rows = nativeRows();
    expect(rows).toHaveLength(5);
    expect(rows.filter((r) => r.status === "LIVE_PASS")).toHaveLength(5);
    expect(rows.filter((r) => r.status === "LIVE_NOT_RUN")).toHaveLength(0);
  });
});
