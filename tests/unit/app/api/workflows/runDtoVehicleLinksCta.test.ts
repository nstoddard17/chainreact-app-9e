/**
 * @jest-environment node
 *
 * 5.TRUCK-BRIDGE-1 CS-6 — the `link_vehicles` CTA gate at the SERVING layer.
 *
 * The persisted classification is history and keeps its action forever; what
 * must never happen is a UI rendering that action as a button pointing at a 404
 * while the Vehicle Links surface is disabled. Both run-DTO mappers apply the
 * gate, which covers every failed-run surface (runs list, run detail, builder
 * run panel) without threading a server flag into three client components.
 *
 * REAL: both mappers, the real flag accessor, the real gate. Nothing mocked —
 * these are pure projections over a record.
 */
import { toWorkflowRunSummary, toWorkflowRunDetail } from "@/app/api/workflows/_runDtos";
import { toRunListItem } from "@/app/runs/_shared";
import { RESOURCE_LINKS_UI_FLAG } from "@/services/resourceLinks/flags";
import type { WorkflowRunRecord } from "@/repositories/workflowRuns";

const UNMAPPED_CLASSIFICATION = {
  title: "Vehicle isn't linked yet",
  description:
    "This Motive vehicle is not linked to Fleetio yet. Link it in Apps → Vehicle Links, then run the workflow again.",
  hint: "Vehicle links are set up once per truck and reused by every workflow.",
  action: "link_vehicles" as const,
  severity: "error" as const,
};

function runRecord(
  classification: WorkflowRunRecord["errorClassification"],
): WorkflowRunRecord {
  return {
    id: "run-1",
    workflowId: "wf-1",
    accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    status: "failed",
    triggerNodeId: "t1",
    startedAt: "2026-07-24T12:00:00Z",
    finishedAt: "2026-07-24T12:00:05Z",
    errorClassification: classification,
    steps: [],
    triggeredBy: "manual",
    isTest: false,
    triggeredByUserId: null,
  } as unknown as WorkflowRunRecord;
}

function displayRecord(classification: unknown) {
  return {
    id: "run-1",
    workflowId: "wf-1",
    status: "failed",
    startedAt: "2026-07-24T12:00:00Z",
    finishedAt: "2026-07-24T12:00:05Z",
    errorClassification: classification,
    triggeredBy: "manual",
    isTest: false,
  } as never;
}

afterEach(() => {
  delete process.env[RESOURCE_LINKS_UI_FLAG];
});

describe("surface ENABLED (the launch default) — the CTA is served", () => {
  it("run summary keeps link_vehicles", () => {
    const dto = toWorkflowRunSummary(runRecord(UNMAPPED_CLASSIFICATION));
    expect(dto.errorClassification?.action).toBe("link_vehicles");
  });

  it("run detail keeps link_vehicles (it reuses the summary)", () => {
    const dto = toWorkflowRunDetail(runRecord(UNMAPPED_CLASSIFICATION), "user-1");
    expect(dto.errorClassification?.action).toBe("link_vehicles");
  });

  it("runs-list item keeps link_vehicles", () => {
    const item = toRunListItem(displayRecord(UNMAPPED_CLASSIFICATION), new Map());
    expect(item.errorClassification?.action).toBe("link_vehicles");
  });
});

describe("surface DISABLED — the CTA is stripped, the message is not", () => {
  beforeEach(() => {
    process.env[RESOURCE_LINKS_UI_FLAG] = "false";
  });

  it("run summary drops the action but keeps the guidance", () => {
    const dto = toWorkflowRunSummary(runRecord(UNMAPPED_CLASSIFICATION));
    expect(dto.errorClassification?.action).toBeUndefined();
    // The user still learns what to do — only the dead link is removed.
    expect(dto.errorClassification?.title).toBe("Vehicle isn't linked yet");
    expect(dto.errorClassification?.description).toContain("Apps → Vehicle Links");
    expect(dto.errorClassification?.hint).toBeDefined();
    expect(dto.errorClassification?.severity).toBe("error");
  });

  it("run detail drops it too", () => {
    const dto = toWorkflowRunDetail(runRecord(UNMAPPED_CLASSIFICATION), "user-1");
    expect(dto.errorClassification?.action).toBeUndefined();
  });

  it("runs-list item drops it too", () => {
    const item = toRunListItem(displayRecord(UNMAPPED_CLASSIFICATION), new Map());
    expect(item.errorClassification?.action).toBeUndefined();
  });

  it("does NOT mutate the source record — the persisted row keeps its history", () => {
    const record = runRecord(UNMAPPED_CLASSIFICATION);
    toWorkflowRunSummary(record);
    expect(record.errorClassification?.action).toBe("link_vehicles");
  });
});

describe("every other classification is untouched in both flag states", () => {
  const reconnect = {
    title: "An app needs to be reconnected",
    description: "A connected app rejected the request.",
    action: "reconnect" as const,
    severity: "error" as const,
  };

  it.each(["true", "false"])("flag=%s leaves `reconnect` alone", (state) => {
    process.env[RESOURCE_LINKS_UI_FLAG] = state;
    expect(toWorkflowRunSummary(runRecord(reconnect)).errorClassification?.action).toBe(
      "reconnect",
    );
    expect(toRunListItem(displayRecord(reconnect), new Map()).errorClassification?.action).toBe(
      "reconnect",
    );
  });

  it("a classification with no action, and a null classification, both pass through", () => {
    process.env[RESOURCE_LINKS_UI_FLAG] = "false";
    const noAction = { title: "t", description: "d", severity: "error" as const };
    expect(toWorkflowRunSummary(runRecord(noAction)).errorClassification).toEqual(noAction);
    expect(toWorkflowRunSummary(runRecord(null)).errorClassification).toBeNull();
  });
});
