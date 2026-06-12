/**
 * @jest-environment node
 *
 * Tests for `app/api/internal/diagnostics/run-failure/route.ts`
 * (Slice 4.MCP-STAGE-2B-3, CS-2).
 *
 * The route runs the REAL `summarizeRunFailure` + `classifyRunVisibility`; only
 * the leaf boundaries are mocked: the service-role run reader and the membership
 * check. The route is the authorization chokepoint — these tests prove a
 * non-member learns NOTHING but `WRONG_ACCOUNT`, and that the raw record never
 * leaks.
 */

const mockGetRun = jest.fn();
jest.mock("@/repositories/workflowRunsDiagnostics", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetRun(...a),
}));

const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMemberServiceRole: (...a: unknown[]) => mockIsMember(...a),
}));

import { POST } from "@/app/api/internal/diagnostics/run-failure/route";

const GOOD_TOKEN = "diag-run-token-0123456789abcdef";
const ACCT = "acct-1";

function req(body: unknown, token: string | null = GOOD_TOKEN): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return new Request("http://x/api/internal/diagnostics/run-failure", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

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

beforeEach(() => {
  mockGetRun.mockReset();
  mockIsMember.mockReset();
  mockIsMember.mockResolvedValue(true);
  process.env.DIAGNOSTICS_API_ENABLED = "1";
  process.env.DIAGNOSTICS_API_TOKEN = GOOD_TOKEN;
  delete process.env.DIAGNOSTICS_API_ALLOW_PROD;
});

// ───────────────────────────── Gate ─────────────────────────────
describe("run-failure — gate", () => {
  it("404 when disabled", async () => {
    delete process.env.DIAGNOSTICS_API_ENABLED;
    expect((await POST(req({ runId: "run-1", userId: "u1" }))).status).toBe(404);
    expect(mockGetRun).not.toHaveBeenCalled();
  });
  it("404 in production without allow flag", async () => {
    const prev = process.env.NODE_ENV;
    // @ts-expect-error test override
    process.env.NODE_ENV = "production";
    const res = await POST(req({ runId: "run-1", userId: "u1" }));
    // @ts-expect-error restore
    process.env.NODE_ENV = prev;
    expect(res.status).toBe(404);
  });
  it("401 on missing/wrong bearer", async () => {
    expect((await POST(req({ runId: "run-1", userId: "u1" }, null))).status).toBe(401);
    expect((await POST(req({ runId: "run-1", userId: "u1" }, "wrong"))).status).toBe(401);
  });
  it("never echoes the token in a gate body", async () => {
    const res = await POST(req({ runId: "run-1", userId: "u1" }, "wrong"));
    expect(await res.text()).not.toContain(GOOD_TOKEN);
  });
});

// ───────────────────── Input validation ─────────────────────
describe("run-failure — input validation", () => {
  it("400 when runId missing", async () => {
    expect((await POST(req({ userId: "u1" }))).status).toBe(400);
  });
  it("400 when userId missing", async () => {
    expect((await POST(req({ runId: "run-1" }))).status).toBe(400);
  });
});

// ───────────────────── NOT_FOUND ─────────────────────
describe("run-failure — NOT_FOUND", () => {
  it("returns visibility NOT_FOUND and nothing else; no membership check", async () => {
    mockGetRun.mockResolvedValue(null);
    const dto = await (await POST(req({ runId: "missing", userId: "u1" }))).json();
    expect(dto).toEqual({ runId: "missing", visibility: "NOT_FOUND" });
    expect(mockIsMember).not.toHaveBeenCalled();
  });
});

// ───────────────────── WRONG_ACCOUNT (non-member) ─────────────────────
describe("run-failure — WRONG_ACCOUNT reveals nothing", () => {
  it("a non-member gets ONLY visibility=WRONG_ACCOUNT — no status/workflow/steps/errors", async () => {
    mockGetRun.mockResolvedValue(fullRun());
    mockIsMember.mockResolvedValue(false);
    const res = await POST(req({ runId: "run-1", userId: "intruder" }));
    const dto = await res.json();
    expect(dto).toEqual({ runId: "run-1", visibility: "WRONG_ACCOUNT" });
    // The reader WAS consulted (we need accountId to membership-check)…
    expect(mockGetRun).toHaveBeenCalledWith("run-1");
    // …and membership WAS the gate.
    expect(mockIsMember).toHaveBeenCalledWith(ACCT, "intruder");
    // No leak of any kind.
    const json = JSON.stringify(dto);
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
    expect(dto).not.toHaveProperty("status");
    expect(dto).not.toHaveProperty("steps");
  });
});

// ───────────────────── Authorized visibility + summary ─────────────────────
describe("run-failure — authorized member sees the safe summary", () => {
  it("RUNNING is visible only after authorization", async () => {
    mockGetRun.mockResolvedValue(fullRun({ status: "running" }));
    const dto = await (await POST(req({ runId: "run-1", userId: "u1" }))).json();
    expect(dto.visibility).toBe("RUNNING");
    expect(dto.status).toBe("running");
    expect(mockIsMember).toHaveBeenCalledWith(ACCT, "u1");
  });

  it("TEST_RUN is classified before FAILED when the toggle is off", async () => {
    mockGetRun.mockResolvedValue(fullRun({ isTest: true, status: "failed" }));
    const dto = await (await POST(req({ runId: "run-1", userId: "u1" }))).json();
    expect(dto.visibility).toBe("TEST_RUN");
  });

  it("includeTestRuns flips a terminal test run to its outcome", async () => {
    mockGetRun.mockResolvedValue(fullRun({ isTest: true, status: "failed" }));
    const dto = await (
      await POST(req({ runId: "run-1", userId: "u1", includeTestRuns: true }))
    ).json();
    expect(dto.visibility).toBe("FAILED_VISIBLE");
  });

  it("FAILED_VISIBLE exposes ONLY the safe fields", async () => {
    mockGetRun.mockResolvedValue(fullRun());
    const dto = await (await POST(req({ runId: "run-1", userId: "u1" }))).json();
    expect(dto).toMatchObject({
      runId: "run-1",
      visibility: "FAILED_VISIBLE",
      status: "failed",
      isTest: false,
      triggeredBy: "manual",
      firstFailedNodeId: "action-1",
      failedStepCount: 1,
      classificationAvailable: true,
    });
    expect(dto.steps).toEqual([
      { nodeId: "trigger-1", status: "succeeded", errorCode: null },
      { nodeId: "action-1", status: "failed", errorCode: "PROVIDER_REAUTH_REQUIRED" },
    ]);
    // Allow-list of keys only.
    expect(Object.keys(dto).sort()).toEqual(
      [
        "classificationAvailable",
        "errorClassification",
        "failedStepCount",
        "firstFailedNodeId",
        "isTest",
        "runId",
        "status",
        "steps",
        "triggeredBy",
        "visibility",
      ].sort(),
    );
  });

  it("COMPLETED_VISIBLE for a succeeded run", async () => {
    mockGetRun.mockResolvedValue(
      fullRun({ status: "succeeded", errorClassification: null, steps: [{ nodeId: "a", status: "succeeded" }] }),
    );
    const dto = await (await POST(req({ runId: "run-1", userId: "u1" }))).json();
    expect(dto.visibility).toBe("COMPLETED_VISIBLE");
    expect(dto.classificationAvailable).toBe(false);
    expect(dto.errorClassification).toBeNull();
  });
});

// ───────────────────── No-leak (authorized path) ─────────────────────
describe("run-failure — no-leak on the authorized path", () => {
  it("the raw record never reaches the response", async () => {
    mockGetRun.mockResolvedValue(fullRun());
    const dto = await (await POST(req({ runId: "run-1", userId: "u1" }))).json();
    const json = JSON.stringify(dto);
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
    // The safe humanized classification + error CODE ARE present.
    expect(json).toContain("Reconnect Slack");
    expect(json).toContain("PROVIDER_REAUTH_REQUIRED");
    // Steps carry only the safe triple.
    for (const s of dto.steps) {
      expect(Object.keys(s).sort()).toEqual(["errorCode", "nodeId", "status"]);
    }
  });
});

// ───────────────────── mode: "visibility" (explain_run_visibility) ─────────────────────
describe("run-failure — mode:visibility returns ONLY {runId, visibility}", () => {
  it("an AUTHORIZED member gets visibility only — NO summary fields", async () => {
    mockGetRun.mockResolvedValue(fullRun()); // failed run, member authorized
    const dto = await (
      await POST(req({ runId: "run-1", userId: "u1", mode: "visibility" }))
    ).json();
    expect(dto).toEqual({ runId: "run-1", visibility: "FAILED_VISIBLE" });
    // None of the summary fields are present even though the member is authorized.
    for (const k of [
      "status",
      "isTest",
      "triggeredBy",
      "firstFailedNodeId",
      "failedStepCount",
      "classificationAvailable",
      "errorClassification",
      "steps",
    ]) {
      expect(dto).not.toHaveProperty(k);
    }
  });

  it("NOT_FOUND in visibility mode does not call membership", async () => {
    mockGetRun.mockResolvedValue(null);
    const dto = await (
      await POST(req({ runId: "missing", userId: "u1", mode: "visibility" }))
    ).json();
    expect(dto).toEqual({ runId: "missing", visibility: "NOT_FOUND" });
    expect(mockIsMember).not.toHaveBeenCalled();
  });

  it("WRONG_ACCOUNT in visibility mode reveals only visibility", async () => {
    mockGetRun.mockResolvedValue(fullRun());
    mockIsMember.mockResolvedValue(false);
    const dto = await (
      await POST(req({ runId: "run-1", userId: "intruder", mode: "visibility" }))
    ).json();
    expect(dto).toEqual({ runId: "run-1", visibility: "WRONG_ACCOUNT" });
    const json = JSON.stringify(dto);
    for (const forbidden of [
      "failed",
      "wf-SECRET",
      "action-1",
      "PROVIDER_REAUTH_REQUIRED",
      "STEP_OUTPUT_SECRET",
      "user-SECRET-42",
      ACCT,
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it("RUNNING is classified after authorization", async () => {
    mockGetRun.mockResolvedValue(fullRun({ status: "running" }));
    const dto = await (
      await POST(req({ runId: "run-1", userId: "u1", mode: "visibility" }))
    ).json();
    expect(dto).toEqual({ runId: "run-1", visibility: "RUNNING" });
    expect(mockIsMember).toHaveBeenCalledWith(ACCT, "u1");
  });

  it("TEST_RUN classifies before outcome; includeTestRuns flips it", async () => {
    mockGetRun.mockResolvedValue(fullRun({ isTest: true, status: "failed" }));
    const off = await (
      await POST(req({ runId: "run-1", userId: "u1", mode: "visibility" }))
    ).json();
    expect(off.visibility).toBe("TEST_RUN");

    mockGetRun.mockResolvedValue(fullRun({ isTest: true, status: "failed" }));
    const on = await (
      await POST(req({ runId: "run-1", userId: "u1", mode: "visibility", includeTestRuns: true }))
    ).json();
    expect(on.visibility).toBe("FAILED_VISIBLE");
  });

  it("COMPLETED_VISIBLE for a succeeded run", async () => {
    mockGetRun.mockResolvedValue(fullRun({ status: "succeeded" }));
    const dto = await (
      await POST(req({ runId: "run-1", userId: "u1", mode: "visibility" }))
    ).json();
    expect(dto).toEqual({ runId: "run-1", visibility: "COMPLETED_VISIBLE" });
  });

  it("default mode (no mode field) STILL returns the full failure summary (unchanged)", async () => {
    mockGetRun.mockResolvedValue(fullRun());
    const dto = await (await POST(req({ runId: "run-1", userId: "u1" }))).json();
    expect(dto.visibility).toBe("FAILED_VISIBLE");
    expect(dto).toHaveProperty("steps"); // summary still present in default mode
  });
});
