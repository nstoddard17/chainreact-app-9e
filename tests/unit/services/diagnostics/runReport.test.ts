/**
 * @jest-environment node
 *
 * Tests for the `diagnoseRunReport` capability service
 * (Slice 4.MCP-STAGE-2B-3 extraction).
 *
 * Called DIRECTLY (no HTTP, no gate) — the gate is the route's job. These prove
 * the capability owns membership authz + the visibility/failure mode branch +
 * sanitized DTO assembly, runs the REAL classify/summarize pure functions, and
 * never leaks raw run internals.
 */

const mockGetRun = jest.fn();
jest.mock("@/repositories/workflowRunsDiagnostics", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetRun(...a),
}));

const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMemberServiceRole: (...a: unknown[]) => mockIsMember(...a),
}));

import { diagnoseRunReport, type RunReportMode } from "@/services/diagnostics/runReport";

const ACCT = "acct-1";

// A full, secret-bearing DiagnosticsRunRecord-shaped object.
function fullRun(over: Record<string, unknown> = {}) {
  return {
    id: "run-1",
    workflowId: "wf-SECRET",
    accountId: ACCT,
    triggeredByUserId: "user-SECRET-42",
    status: "failed",
    triggerNodeId: "trigger-1",
    triggerEvent: { rawPayload: "SECRET_TRIGGER_BODY", email: "victim@example.com" },
    steps: [
      { nodeId: "trigger-1", status: "succeeded", output: { tok: "xoxb-LEAK" } },
      {
        nodeId: "action-1",
        status: "failed",
        output: { secret: "STEP_OUTPUT_SECRET" },
        error: { code: "PROVIDER_REAUTH_REQUIRED", message: "RAW_PROVIDER_MSG", details: { body: "RAW_BODY" } },
      },
    ],
    fatalError: { code: "X", message: "FATAL_SECRET_MESSAGE" },
    errorClassification: {
      title: "Reconnect Slack",
      description: "Your Slack connection expired.",
      hint: "Reconnect from Apps.",
      action: "reconnect",
      severity: "error",
    },
    startedAt: "2026-06-01T00:00:00Z",
    finishedAt: "2026-06-01T00:00:01Z",
    createdAt: "2026-06-01T00:00:00Z",
    isTest: false,
    triggeredBy: "manual",
    triggeredByApiKeyId: null,
    triggeredByApiKeyPrefix: "ak_live_SECRETPREFIX",
    ...over,
  };
}

const call = (over: Partial<{ runId: string; subjectUserId: string; mode: RunReportMode; includeTestRuns: boolean }> = {}) =>
  diagnoseRunReport({
    subjectUserId: "u1",
    runId: "run-1",
    mode: "failure",
    includeTestRuns: false,
    ...over,
  });

beforeEach(() => {
  mockGetRun.mockReset();
  mockIsMember.mockReset();
  mockIsMember.mockResolvedValue(true);
});

describe("diagnoseRunReport — NOT_FOUND", () => {
  it("returns NOT_FOUND and does NOT call membership", async () => {
    mockGetRun.mockResolvedValue(null);
    expect(await call({ runId: "missing" })).toEqual({ runId: "missing", visibility: "NOT_FOUND" });
    expect(mockIsMember).not.toHaveBeenCalled();
  });
});

describe("diagnoseRunReport — WRONG_ACCOUNT reveals nothing", () => {
  it("a non-member calls membership after the raw read but returns ONLY {runId, visibility}", async () => {
    mockGetRun.mockResolvedValue(fullRun());
    mockIsMember.mockResolvedValue(false);
    const result = await call({ subjectUserId: "intruder" });
    expect(result).toEqual({ runId: "run-1", visibility: "WRONG_ACCOUNT" });
    expect(mockGetRun).toHaveBeenCalledWith("run-1");
    expect(mockIsMember).toHaveBeenCalledWith(ACCT, "intruder");
    const json = JSON.stringify(result);
    for (const forbidden of [
      "failed",
      "wf-SECRET",
      "action-1",
      "PROVIDER_REAUTH_REQUIRED",
      "Reconnect Slack",
      "STEP_OUTPUT_SECRET",
      "RAW_PROVIDER_MSG",
      "FATAL_SECRET_MESSAGE",
      "SECRET_TRIGGER_BODY",
      "user-SECRET-42",
      "ak_live_SECRETPREFIX",
      ACCT,
    ]) {
      expect(json).not.toContain(forbidden);
    }
    expect(result).not.toHaveProperty("status");
    expect(result).not.toHaveProperty("steps");
  });
});

describe("diagnoseRunReport — visibility mode", () => {
  it("an AUTHORIZED member in visibility mode gets ONLY {runId, visibility} (summary never computed)", async () => {
    mockGetRun.mockResolvedValue(fullRun());
    const result = await call({ mode: "visibility" });
    expect(result).toEqual({ runId: "run-1", visibility: "FAILED_VISIBLE" });
    for (const k of ["status", "isTest", "triggeredBy", "firstFailedNodeId", "steps", "errorClassification"]) {
      expect(result).not.toHaveProperty(k);
    }
  });
});

describe("diagnoseRunReport — failure mode visibility precedence", () => {
  it("RUNNING after authz", async () => {
    mockGetRun.mockResolvedValue(fullRun({ status: "running" }));
    expect((await call()).visibility).toBe("RUNNING");
  });
  it("TEST_RUN before outcome when toggle off; flips with includeTestRuns", async () => {
    mockGetRun.mockResolvedValue(fullRun({ isTest: true, status: "failed" }));
    expect((await call()).visibility).toBe("TEST_RUN");
    mockGetRun.mockResolvedValue(fullRun({ isTest: true, status: "failed" }));
    expect((await call({ includeTestRuns: true })).visibility).toBe("FAILED_VISIBLE");
  });
  it("COMPLETED_VISIBLE for a succeeded run", async () => {
    mockGetRun.mockResolvedValue(
      fullRun({ status: "succeeded", errorClassification: null, steps: [{ nodeId: "a", status: "succeeded" }] }),
    );
    const r = await call();
    expect(r.visibility).toBe("COMPLETED_VISIBLE");
    expect(r.classificationAvailable).toBe(false);
    expect(r.errorClassification).toBeNull();
  });
});

describe("diagnoseRunReport — failure mode summary (authorized)", () => {
  it("FAILED_VISIBLE exposes only the safe summary fields", async () => {
    mockGetRun.mockResolvedValue(fullRun());
    const r = await call();
    expect(r).toMatchObject({
      runId: "run-1",
      visibility: "FAILED_VISIBLE",
      status: "failed",
      isTest: false,
      triggeredBy: "manual",
      firstFailedNodeId: "action-1",
      failedStepCount: 1,
      classificationAvailable: true,
    });
    expect(r.steps).toEqual([
      { nodeId: "trigger-1", status: "succeeded", errorCode: null },
      { nodeId: "action-1", status: "failed", errorCode: "PROVIDER_REAUTH_REQUIRED" },
    ]);
    for (const s of r.steps!) {
      expect(Object.keys(s).sort()).toEqual(["errorCode", "nodeId", "status"]);
    }
  });

  it("no-leak: raw internals never appear; safe code + humanized classification survive", async () => {
    mockGetRun.mockResolvedValue(fullRun());
    const json = JSON.stringify(await call());
    for (const forbidden of [
      "STEP_OUTPUT_SECRET",
      "xoxb-LEAK",
      "RAW_PROVIDER_MSG",
      "RAW_BODY",
      "FATAL_SECRET_MESSAGE",
      "SECRET_TRIGGER_BODY",
      "victim@example.com",
      "user-SECRET-42",
      "wf-SECRET",
      "ak_live_SECRETPREFIX",
    ]) {
      expect(json).not.toContain(forbidden);
    }
    expect(json).toContain("Reconnect Slack");
    expect(json).toContain("PROVIDER_REAUTH_REQUIRED");
  });
});
