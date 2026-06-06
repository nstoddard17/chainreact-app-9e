/**
 * @jest-environment node
 *
 * Tests for app/runs/_shared.ts:toRunListItem (Slice 4.RUNS-PAGE-1).
 *
 * Pins the wire-shape contract that backs the /runs page + /api/runs
 * route. Bypassing this mapper (or letting it leak the source
 * `WorkflowRunDisplayRecord`'s fields verbatim) would let downstream
 * shapes drift.
 */
import type { WorkflowRunDisplayRecord } from "@/repositories/workflowRuns";
import { toRunListItem, RUN_LIST_DEFAULT_LIMIT } from "@/app/runs/_shared";
import { RunListItemSchema } from "@/contracts/workflow";

const baseRecord: WorkflowRunDisplayRecord = {
  id: "11111111-1111-1111-1111-111111111111",
  workflowId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  status: "succeeded",
  isTest: false,
  triggeredBy: "manual",
  triggeredByApiKeyPrefix: null,
  startedAt: "2026-05-30T12:00:00Z",
  finishedAt: "2026-05-30T12:00:01.500Z",
  errorClassification: null,
};

describe("RUN_LIST_DEFAULT_LIMIT", () => {
  it("is a small, bounded default page size", () => {
    expect(RUN_LIST_DEFAULT_LIMIT).toBe(50);
  });
});

describe("toRunListItem", () => {
  it("looks up the workflow name from the supplied map", () => {
    const result = toRunListItem(
      baseRecord,
      new Map([[baseRecord.workflowId, "Workflow A"]]),
    );
    expect(result.workflowName).toBe("Workflow A");
  });

  it("falls back to 'Untitled workflow' when the id is missing from the map", () => {
    const result = toRunListItem(baseRecord, new Map());
    expect(result.workflowName).toBe("Untitled workflow");
  });

  it("maps the non-secret API-key prefix through to the DTO (RH-3)", () => {
    const apiKeyRun = {
      ...baseRecord,
      triggeredBy: "api_key" as const,
      triggeredByApiKeyPrefix: "crk_live_ab12…wxyz",
    };
    const result = toRunListItem(apiKeyRun, new Map());
    expect(result.triggeredBy).toBe("api_key");
    expect(result.triggeredByApiKeyPrefix).toBe("crk_live_ab12…wxyz");
    // Schema-valid + no hash leaked.
    expect(RunListItemSchema.parse(result).triggeredByApiKeyPrefix).toBe("crk_live_ab12…wxyz");
    expect(JSON.stringify(result)).not.toMatch(/key_?hash/i);
  });

  it("leaves triggeredByApiKeyPrefix null for non-api_key runs", () => {
    expect(toRunListItem(baseRecord, new Map()).triggeredByApiKeyPrefix).toBeNull();
  });

  it("computes durationMs = finishedAt − startedAt", () => {
    const result = toRunListItem(baseRecord, new Map());
    expect(result.durationMs).toBe(1500);
  });

  it("returns durationMs = null when finishedAt is missing", () => {
    const result = toRunListItem(
      { ...baseRecord, finishedAt: null },
      new Map(),
    );
    expect(result.durationMs).toBeNull();
  });

  it("returns durationMs = 0 when finishedAt < startedAt (clock skew guard)", () => {
    const result = toRunListItem(
      {
        ...baseRecord,
        startedAt: "2026-05-30T12:00:01Z",
        finishedAt: "2026-05-30T12:00:00Z",
      },
      new Map(),
    );
    expect(result.durationMs).toBe(0);
  });

  it("returns durationMs = null when timestamps are unparseable", () => {
    const result = toRunListItem(
      { ...baseRecord, startedAt: "not-a-date", finishedAt: "also-broken" },
      new Map(),
    );
    expect(result.durationMs).toBeNull();
  });

  it("passes errorClassification through (title/description/severity required; hint+action optional)", () => {
    const result = toRunListItem(
      {
        ...baseRecord,
        status: "failed",
        errorClassification: {
          title: "Gmail token expired",
          description: "Reconnect Gmail.",
          hint: "Apps → Gmail",
          action: "reconnect",
          severity: "error",
        },
      },
      new Map([[baseRecord.workflowId, "W"]]),
    );
    expect(result.errorClassification).toEqual({
      title: "Gmail token expired",
      description: "Reconnect Gmail.",
      hint: "Apps → Gmail",
      action: "reconnect",
      severity: "error",
    });
  });

  it("preserves null errorClassification (no fabrication)", () => {
    const result = toRunListItem(baseRecord, new Map());
    expect(result.errorClassification).toBeNull();
  });

  it("omits hint/action when undefined (matches the Zod schema's optional shape)", () => {
    const result = toRunListItem(
      {
        ...baseRecord,
        status: "failed",
        errorClassification: {
          title: "Generic",
          description: "Something failed.",
          severity: "warning",
        },
      },
      new Map([[baseRecord.workflowId, "W"]]),
    );
    expect(result.errorClassification).toEqual({
      title: "Generic",
      description: "Something failed.",
      severity: "warning",
    });
    expect(result.errorClassification && "hint" in result.errorClassification).toBe(
      false,
    );
    expect(
      result.errorClassification && "action" in result.errorClassification,
    ).toBe(false);
  });

  it("output validates against RunListItemSchema (no extra fields, no missing ones)", () => {
    const result = toRunListItem(
      baseRecord,
      new Map([[baseRecord.workflowId, "W"]]),
    );
    const parsed = RunListItemSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("does NOT leak repository-only fields onto the DTO", () => {
    const result = toRunListItem(
      baseRecord,
      new Map([[baseRecord.workflowId, "W"]]),
    );
    for (const banned of [
      "userId",
      "user_id",
      "triggerEvent",
      "trigger_event",
      "steps",
      "fatalError",
      "fatal_error",
      "reservedTaskCost",
      "actualTaskCost",
      "billingStatus",
    ]) {
      expect(banned in (result as Record<string, unknown>)).toBe(false);
    }
  });
});
