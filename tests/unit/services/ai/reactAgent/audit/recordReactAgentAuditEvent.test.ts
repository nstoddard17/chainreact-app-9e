/**
 * @jest-environment node
 *
 * React Agent audit recorder (REACT-AGENT-CS-5C-AUDIT-RECORDER).
 *
 * Proves the recorder maps SAFE input onto the repository insert shape, sanitizes
 * metadata (reusing the shared `ai_cost_events` denylist), caps reason/opaque-refs,
 * fails open on a repository throw, and that the no-op recorder does nothing. The
 * recorder is injected with a mock `insert` so no live DB/service-role is touched;
 * the REAL `sanitizeAiEventMetadata` runs (default), so the no-leak assertions
 * exercise the actual denylist.
 */

import {
  createReactAgentAuditRecorder,
  reactAgentAuditRecorder,
} from "@/services/ai/reactAgent/audit/recordReactAgentAuditEvent";
import { noopReactAgentAuditRecorder } from "@/services/ai/reactAgent/audit/noopReactAgentAuditRecorder";
import type { ReactAgentAuditRecorderInput } from "@/services/ai/reactAgent/audit/types";
import type { ReactAgentAuditEventInsert } from "@/repositories/reactAgentAuditEvents";

function baseInput(
  over: Partial<ReactAgentAuditRecorderInput> = {},
): ReactAgentAuditRecorderInput {
  return {
    accountId: "acc-1",
    actorUserId: "user-1",
    capabilityId: "diagnosis_qa",
    intent: "answer_diagnosis_question",
    mode: "read_only",
    auditKind: "react_agent.diagnosis_qa",
    outcome: "success",
    ...over,
  };
}

function recorderWithCapture() {
  const calls: ReactAgentAuditEventInsert[] = [];
  const insert = jest.fn(async (row: ReactAgentAuditEventInsert) => {
    calls.push(row);
  });
  return { recorder: createReactAgentAuditRecorder({ insert }), insert, calls };
}

describe("react agent audit recorder — mapping", () => {
  it("maps safe input onto the repository insert shape with null defaults", async () => {
    const { recorder, insert, calls } = recorderWithCapture();
    await recorder.record(baseInput());

    expect(insert).toHaveBeenCalledTimes(1);
    expect(calls[0]).toEqual({
      accountId: "acc-1",
      actorUserId: "user-1",
      workflowId: null,
      conversationId: null,
      capabilityId: "diagnosis_qa",
      intent: "answer_diagnosis_question",
      mode: "read_only",
      creditFeature: null,
      auditKind: "react_agent.diagnosis_qa",
      outcome: "success",
      reason: null,
      proposedPatchRef: null,
      approvalId: null,
      aiCostEventId: null,
      metadata: {},
    });
  });

  it("threads optional ids/refs through unchanged when present", async () => {
    const { recorder, calls } = recorderWithCapture();
    await recorder.record(
      baseInput({
        workflowId: "wf-9",
        conversationId: "conv-3",
        creditFeature: "workflow_qa",
        outcome: "denied",
        reason: "invalid_scope",
        proposedPatchRef: "patch-ref-1",
        approvalId: "approval-1",
        aiCostEventId: "cost-evt-1",
      }),
    );
    expect(calls[0]).toMatchObject({
      workflowId: "wf-9",
      conversationId: "conv-3",
      creditFeature: "workflow_qa",
      outcome: "denied",
      reason: "invalid_scope",
      proposedPatchRef: "patch-ref-1",
      approvalId: "approval-1",
      aiCostEventId: "cost-evt-1",
    });
  });
});

describe("react agent audit recorder — metadata sanitization (no-leak)", () => {
  it("defaults metadata to {} when omitted", async () => {
    const { recorder, calls } = recorderWithCapture();
    await recorder.record(baseInput({ metadata: undefined }));
    expect(calls[0]!.metadata).toEqual({});
  });

  it.each([
    ["null", null],
    ["array", [1, 2, 3] as unknown as Record<string, unknown>],
    ["scalar string", "raw" as unknown as Record<string, unknown>],
    ["scalar number", 42 as unknown as Record<string, unknown>],
  ])("coerces non-object metadata (%s) to {}", async (_label, value) => {
    const { recorder, calls } = recorderWithCapture();
    await recorder.record(baseInput({ metadata: value }));
    expect(calls[0]!.metadata).toEqual({});
  });

  it("drops unsafe keys (token/secret/prompt/config/body) and keeps safe keys", async () => {
    const { recorder, calls } = recorderWithCapture();
    await recorder.record(
      baseInput({
        metadata: {
          nodeCount: 4,
          durationMs: 120,
          accessToken: "sk-leak",
          apiSecret: "shh",
          rawPrompt: "the user's private question",
          messageBody: "raw provider payload",
          nodeConfig: { url: "https://x" },
          ok: true,
        },
      }),
    );
    const meta = calls[0]!.metadata as Record<string, unknown>;
    // Safe aggregate keys survive.
    expect(meta).toEqual({ nodeCount: 4, durationMs: 120, ok: true });
    // No raw/secret/prompt/config/body key leaks through.
    for (const k of ["accessToken", "apiSecret", "rawPrompt", "messageBody", "nodeConfig"]) {
      expect(meta).not.toHaveProperty(k);
    }
    // And no leaked VALUE string survives anywhere in the serialized metadata.
    const serialized = JSON.stringify(meta);
    for (const v of ["sk-leak", "shh", "private question", "raw provider payload", "https://x"]) {
      expect(serialized).not.toContain(v);
    }
  });

  it("caps an oversized metadata string to the sanitizer's 512-char limit", async () => {
    const { recorder, calls } = recorderWithCapture();
    const big = "a".repeat(2000);
    await recorder.record(baseInput({ metadata: { note: big } }));
    expect((calls[0]!.metadata as Record<string, unknown>).note).toHaveLength(512);
  });
});

describe("react agent audit recorder — reason / opaque-ref caps", () => {
  it("truncates reason to 128 chars and refs to 256 chars (fit the ledger CHECKs)", async () => {
    const { recorder, calls } = recorderWithCapture();
    await recorder.record(
      baseInput({
        reason: "x".repeat(500),
        proposedPatchRef: "p".repeat(500),
        approvalId: "a".repeat(500),
        conversationId: "c".repeat(500),
      }),
    );
    const row = calls[0]!;
    expect(row.reason).toHaveLength(128);
    expect(row.proposedPatchRef).toHaveLength(256);
    expect(row.approvalId).toHaveLength(256);
    expect(row.conversationId).toHaveLength(256);
  });

  it("leaves a short safe reason verbatim", async () => {
    const { recorder, calls } = recorderWithCapture();
    await recorder.record(baseInput({ reason: "credits_exhausted" }));
    expect(calls[0]!.reason).toBe("credits_exhausted");
  });
});

describe("react agent audit recorder — fail-open", () => {
  it("does NOT throw when the repository insert throws (audit must not break the agent path)", async () => {
    const insert = jest.fn(async () => {
      throw new Error("DB exploded: connection refused at 1.2.3.4");
    });
    const recorder = createReactAgentAuditRecorder({ insert });
    await expect(recorder.record(baseInput())).resolves.toBeUndefined();
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("does NOT throw when the repository insert rejects", async () => {
    const insert = jest.fn(() => Promise.reject(new Error("rls denied")));
    const recorder = createReactAgentAuditRecorder({ insert });
    await expect(recorder.record(baseInput())).resolves.toBeUndefined();
  });
});

describe("noop react agent audit recorder", () => {
  it("resolves and does nothing", async () => {
    await expect(noopReactAgentAuditRecorder.record(baseInput())).resolves.toBeUndefined();
  });
});

describe("default live recorder", () => {
  it("is a valid recorder object (not invoked here — would hit the real service-role repo)", () => {
    expect(typeof reactAgentAuditRecorder.record).toBe("function");
  });
});
