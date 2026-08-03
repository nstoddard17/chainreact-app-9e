/** @jest-environment node */
/**
 * CR-FAILREASON-1 — persistence safety for the humanized error_classification.
 *
 * `classifyForPersistence` is the SOLE producer of the `error_classification`
 * persisted on `workflow_runs` (and handed verbatim to the failure-notification
 * fan-out). It must never persist raw provider text. The guarantee comes from the
 * shared `humanizeActionError` (whose generic branch no longer echoes the raw
 * thrown message), so persistence and the run-detail step sanitizer — which both
 * route through that same humanizer — agree on the safe generic shape.
 */
import { classifyForPersistence } from "@/services/execution/runPersistence";
import {
  humanizeActionError,
  GENERIC_ACTION_ERROR_TITLE,
} from "@/core/errors/humanizeActionError";
import type { RunResult } from "@/services/execution/engineTypes";

function failedRunWithStepError(code: string, message: string): RunResult {
  return {
    runId: "run_1",
    workflowId: "wf_1",
    status: "failed",
    steps: [
      { nodeId: "n1", status: "succeeded", output: {} },
      { nodeId: "n2", status: "failed", error: { code: code as never, message } },
    ],
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:01.000Z",
    isTest: false,
    triggeredBy: "manual",
  };
}

describe("classifyForPersistence — CR-FAILREASON-1", () => {
  it("returns null for a succeeded run", () => {
    const result: RunResult = {
      runId: "run_ok",
      workflowId: "wf_1",
      status: "succeeded",
      steps: [{ nodeId: "n1", status: "succeeded", output: {} }],
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:00:01.000Z",
      isTest: false,
      triggeredBy: "manual",
    };
    expect(classifyForPersistence(result)).toBeNull();
  });

  it("classifies the FIRST failed step", () => {
    const result = failedRunWithStepError(
      "MISSING_VARIABLE",
      "Missing variable: trigger.x",
    );
    // MISSING_VARIABLE details are absent here, but the code still classifies.
    const cls = classifyForPersistence(result);
    expect(cls?.action).toBe("open_node");
  });

  it.each([
    ["fake token", "Bearer sk-live-AbCd1234SECRETtoken"],
    ["fake email", "delivery failed for jane.doe@example.com"],
    ["fake provider account id", "team_T0ABCDEF99 rejected the request"],
    [
      "raw provider JSON body",
      '{"ok":false,"error":"x","access_token":"xoxb-99-SECRET"}',
    ],
  ])(
    "does NOT persist raw provider text in the generic branch — %s",
    (_label, raw) => {
      const cls = classifyForPersistence(
        failedRunWithStepError("HANDLER_FAILED", raw),
      );
      expect(cls).not.toBeNull();
      expect(cls?.title).toBe(GENERIC_ACTION_ERROR_TITLE);
      expect(cls?.action).toBe("contact_support");
      expect(cls?.description).not.toContain(raw);
      expect(cls?.description).not.toMatch(
        /sk-live|xoxb|jane\.doe@example\.com|T0ABCDEF99/,
      );
    },
  );

  it("agrees with the shared humanizer (single source the step sanitizer also uses)", () => {
    const raw = "opaque provider failure with secret tok_123";
    const cls = classifyForPersistence(
      failedRunWithStepError("HANDLER_FAILED", raw),
    );
    const direct = humanizeActionError({ code: "HANDLER_FAILED", message: raw });
    expect(cls).toEqual(direct);
    expect(direct.description).not.toContain("tok_123");
  });

  it("normalized auth code (engine boundary) → reconnect, no id leak", () => {
    const cls = classifyForPersistence(
      failedRunWithStepError(
        "INTEGRATION_REAUTH_REQUIRED",
        "Integration action required: refresh_failed (account=acc_123).",
      ),
    );
    expect(cls?.action).toBe("reconnect");
    expect(cls?.description).not.toContain("acc_123");
  });

  it("falls back to the fatalError when no step failed", () => {
    const result: RunResult = {
      runId: "run_fatal",
      workflowId: "wf_1",
      status: "failed",
      steps: [],
      fatalError: { code: "BILLING_EXHAUSTED", message: "100/100 tasks used." },
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:00:01.000Z",
      isTest: false,
      triggeredBy: "manual",
    };
    expect(classifyForPersistence(result)?.action).toBe("upgrade_plan");
  });
});
