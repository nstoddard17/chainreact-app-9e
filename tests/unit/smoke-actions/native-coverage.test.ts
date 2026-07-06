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
 *   - every native action is certified LIVE_PASS EXCEPT the single documented
 *     always-run baseline (native:format_transformer, LIVE_NOT_RUN by design — the
 *     one action left uncertified so a default sweep still executes a real
 *     end-to-end run with zero credentials; see the fixture's note);
 *   - no native action is FAIL / BUG / BLOCKED_ENV.
 *
 * A new native action added to the registry without a fixture (or without either
 * LIVE_PASS certification or an added-to-this-pin baseline entry) fails CI here.
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

/**
 * The single intentional always-run baseline — LIVE_NOT_RUN by design (see
 * tests/fixtures/action-smoke/native/format_transformer.ts). Every OTHER native
 * action must be certified LIVE_PASS.
 */
const BASELINE_ACTION = "format_transformer";

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

  it("every native action is LIVE_PASS except the single documented baseline", () => {
    for (const r of nativeRows()) {
      if (r.action === BASELINE_ACTION) {
        // Intentional always-run canary — uncertified on purpose.
        expect({ action: r.action, status: r.status }).toEqual({
          action: r.action,
          status: "LIVE_NOT_RUN",
        });
      } else {
        expect({ action: r.action, status: r.status }).toEqual({
          action: r.action,
          status: "LIVE_PASS",
        });
      }
    }
  });

  it("no native action is FAIL / BUG / BLOCKED_ENV", () => {
    for (const r of nativeRows()) {
      expect(["FAIL", "BUG", "BLOCKED_ENV"]).not.toContain(r.status);
    }
  });

  it("pins the native action count + certified/baseline split", () => {
    const rows = nativeRows();
    expect(rows).toHaveLength(5);
    expect(rows.filter((r) => r.status === "LIVE_PASS")).toHaveLength(4);
    expect(rows.filter((r) => r.status === "LIVE_NOT_RUN")).toHaveLength(1);
  });
});
