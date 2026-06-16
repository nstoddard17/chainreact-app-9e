/**
 * Tests for the AI-REPAIR-2b LLM validated-patch PREVIEW service
 * (`services/ai/repair/previewWorkflowRepair.ts`).
 *
 * The model client is INJECTED (no network); `getWorkflowGraphForAI` and
 * `previewWorkflowPatchForAI` are mocked so the service's orchestration contract
 * is isolated: prompt no-leak (config VALUES excluded; node ids allowed ONLY as
 * the opaque targeting inventory), the model output parsed → assembled patch →
 * handed to the EXISTING preview pipeline, advisory risk discarded (deterministic
 * risk wins), validation-blocked patches surfaced safely, and model/parse/throw
 * failures mapped without leaking internals. Preview-only — no apply import.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mockGetGraph = jest.fn();
jest.mock("@/services/ai/tools/workflowContext", () => ({
  getWorkflowGraphForAI: (...a: unknown[]) => mockGetGraph(...a),
}));

const mockPreview = jest.fn();
jest.mock("@/services/ai/preview", () => ({
  previewWorkflowPatchForAI: (...a: unknown[]) => mockPreview(...a),
}));

// AI-REPAIR-3G — the deterministic variable-repair fast-path calls
// `buildVariableRepairOutcome`, which reads upstream variables for the target node.
const mockGetVars = jest.fn();
jest.mock("@/services/ai/tools/variables", () => ({
  getAvailableVariablesForAI: (...a: unknown[]) => mockGetVars(...a),
}));

import {
  diagnosisHasRepairableIssue,
  previewWorkflowRepair,
  PROPOSE_WORKFLOW_REPAIR_PATCH_TOOL_NAME,
} from "@/services/ai/repair/previewWorkflowRepair";
import { runDeterministicRepairPreview } from "@/services/ai/repair/deterministicRepairPreview";
import type { ModelClient, ModelGenerateInput, ModelResult } from "@/core/ai/modelTypes";

function clientReturning(result: ModelResult): ModelClient {
  return { generateStructuredJson: async () => result };
}

function capturingClient(text: string): { client: ModelClient; lastInput: () => ModelGenerateInput } {
  let captured: ModelGenerateInput | undefined;
  const client: ModelClient = {
    generateStructuredJson: async (input) => {
      captured = input;
      return success(text);
    },
  };
  return {
    client,
    lastInput: () => {
      if (!captured) throw new Error("model client was not called");
      return captured;
    },
  };
}

const okText = (obj: unknown) => JSON.stringify(obj);
const success = (text: string): ModelResult => ({
  ok: true,
  modelId: "gpt-4.1-mini",
  feature: "repair",
  text,
  finishReason: "stop",
  usage: { inputTokens: 30, outputTokens: 80 },
  latencyMs: 12,
});

/** Safe diagnosis DTO (with planted secret-shaped fields the projector must drop). */
const dto = {
  workflowId: "wf-OPAQUE",
  access: "OK",
  overallReady: false,
  summaryText: "The Send Email step is missing its recipient.",
  nextSteps: ["Set the recipient on the Gmail step."],
  findings: [
    {
      source: "field",
      code: "MISSING_REQUIRED_FIELD",
      severity: "error",
      title: "A required field is empty.",
      provider: "gmail",
      providerName: "Gmail",
      missingFields: ["to"],
      nodeIds: ["node-B"],
      accessToken: "ya29.DTO-LEAK",
    },
  ],
  latestRun: { runId: "run-OPAQUE", status: "failed", visibility: "private", classificationAvailable: true },
} as never;

/** Saved graph the inventory + preview validate against. Config carries planted secrets. */
const graph = {
  workflowId: "wf-OPAQUE",
  name: "Secret Workflow Name",
  state: "active",
  activeRevisionId: null,
  updatedAt: "rev-token-1",
  nodes: [
    { id: "node-A", kind: "trigger", provider: "native", type: "manual_trigger", config: {}, position: { x: 0, y: 0 } },
    {
      id: "node-B",
      kind: "action",
      provider: "gmail",
      type: "send_email",
      config: { to: "victim@example.com", apiKey: "SECRET-CONFIG-VALUE" },
      position: { x: 0, y: 1 },
    },
  ],
  edges: [{ id: "edge-1", from: "node-A", to: "node-B" }],
};

const validPreviewData = {
  ok: true,
  workflowId: "wf-OPAQUE",
  currentRevision: "rev-token-1",
  patchId: "repair-preview:wf-OPAQUE",
  patchSummary: "AI-proposed repair",
  validation: { ok: true, errors: [], warnings: [] },
  changes: [{ op: "updateNodeConfig", description: 'Updates configuration for "Gmail — Send Email" (fields: to).', nodeId: "node-B", fields: ["to"] }],
  affectedNodeIds: ["node-B"],
  affectedEdgeIds: [],
  // The DETERMINISTIC, authoritative risk — DIFFERENT from the model's advisory "low".
  riskLevel: "high",
  requiresConfirmation: true,
  riskReasons: [{ code: "high_risk_action", message: "x" }],
  beforeSummary: { trigger: null, steps: [] },
  userFacingSummaryText: "AI-proposed repair — 1 change(s). Risk: high (confirmation required).",
  canApplyLater: true,
};

const modelPatchText = okText({
  summary: "Set the recipient on the Gmail step.",
  rationale: "The diagnosis says `to` is missing.",
  operations: [{ op: "updateNodeConfig", nodeId: "node-B", config: { to: "{{trigger.email}}" } }],
  // Advisory risk the service MUST ignore.
  riskLevel: "low",
});

beforeEach(() => {
  mockGetGraph.mockReset();
  mockGetGraph.mockResolvedValue({ ok: true, data: graph });
  mockPreview.mockReset();
  mockPreview.mockResolvedValue({ ok: true, data: validPreviewData });
  mockGetVars.mockReset();
  // Default: no upstream variables (deterministic fast-path finds no candidate and
  // falls through). Tests that exercise the fast-path override this.
  mockGetVars.mockResolvedValue({ ok: true, data: { variables: [] } });
});

const base = { userId: "user-1", workflowId: "wf-OPAQUE" } as const;

describe("previewWorkflowRepair (AI-REPAIR-2b)", () => {
  it("sends feature=repair, tier=fast, the repair-patch tool, and a system+user message", async () => {
    const cap = capturingClient(modelPatchText);
    await previewWorkflowRepair({ dto, ...base, modelClient: cap.client });
    const req = cap.lastInput();
    expect(req.feature).toBe("repair");
    expect(req.tier).toBe("fast");
    expect(req.responseTool?.name).toBe(PROPOSE_WORKFLOW_REPAIR_PATCH_TOOL_NAME);
    expect(req.messages).toHaveLength(2);
    expect(req.messages[0]!.role).toBe("system");
    expect(req.messages[1]!.role).toBe("user");
  });

  it("no-leak: prompt carries node ids in the opaque inventory but NO config values / tokens / workflow name", async () => {
    const cap = capturingClient(modelPatchText);
    await previewWorkflowRepair({ dto, ...base, modelClient: cap.client });
    const sent = JSON.stringify(cap.lastInput().messages);
    // Opaque targeting ids + safe provider/type ARE present (needed to build the patch).
    for (const ok of ["node-A", "node-B", "edge-1", "gmail", "send_email", "MISSING_REQUIRED_FIELD"]) {
      expect(sent).toContain(ok);
    }
    // Config VALUES, tokens, the workflow name, and the DTO's planted secret must NOT leak.
    for (const leak of ["SECRET-CONFIG-VALUE", "victim@example.com", "Secret Workflow Name", "ya29.DTO-LEAK", "run-OPAQUE"]) {
      expect(sent).not.toContain(leak);
    }
  });

  it("config values are excluded from the prompt (inventory projects id/kind/provider/type only)", async () => {
    const cap = capturingClient(modelPatchText);
    await previewWorkflowRepair({ dto, ...base, modelClient: cap.client });
    const sent = JSON.stringify(cap.lastInput().messages);
    expect(sent).not.toContain("apiKey");
    expect(sent).not.toContain("SECRET-CONFIG-VALUE");
  });

  it("parses the model output and hands an assembled patch to the EXISTING preview pipeline", async () => {
    await previewWorkflowRepair({ dto, ...base, modelClient: clientReturning(success(modelPatchText)) });
    expect(mockPreview).toHaveBeenCalledTimes(1);
    const arg = mockPreview.mock.calls[0]![0];
    expect(arg).toMatchObject({ userId: "user-1", workflowId: "wf-OPAQUE" });
    expect(arg.patch.operations).toEqual([{ op: "updateNodeConfig", nodeId: "node-B", config: { to: "{{trigger.email}}" } }]);
    expect(arg.patch.baseRevision).toBe("rev-token-1");
    expect(arg.patch.workflowId).toBe("wf-OPAQUE");
  });

  it("discards the model's advisory risk — the deterministic validator's risk wins", async () => {
    const res = await previewWorkflowRepair({ dto, ...base, modelClient: clientReturning(success(modelPatchText)) });
    expect(res.ok).toBe(true);
    if (res.ok) {
      // Validator said "high"; the model said "low". We surface the validator's.
      expect(res.preview.riskLevel).toBe("high");
    }
    // The assembled patch never carried the model's advisory risk.
    expect(mockPreview.mock.calls[0]![0].patch.riskLevel).toBeUndefined();
    expect(mockPreview.mock.calls[0]![0].patch.requiresConfirmation).toBeUndefined();
  });

  it("surfaces a validation-blocked patch as ok:true with preview.ok=false (no applyable artifact)", async () => {
    mockPreview.mockResolvedValueOnce({
      ok: true,
      data: {
        ...validPreviewData,
        ok: false,
        validation: { ok: false, errors: [{ code: "UNKNOWN_NODE", message: "references node 'bogus' which is not in the workflow." }], warnings: [] },
        canApplyLater: false,
        blockedReason: "references node 'bogus' which is not in the workflow.",
      },
    });
    const res = await previewWorkflowRepair({ dto, ...base, modelClient: clientReturning(success(modelPatchText)) });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.preview.ok).toBe(false);
      expect(res.preview.blockedReason).toContain("not in the workflow");
      expect(res.preview.canApplyLater).toBe(false);
    }
  });

  // AI-REPAIR-2G — a malformed model patch yields RAW structural errors
  // (INVALID_PATCH / UNSUPPORTED_OPERATION → `operations.0.nodeId: Required`,
  // `Unrecognized key(s) … 'id'`). With a missing-field diagnosis, the service
  // replaces it with a deterministic, diagnosis-derived TARGETED block (so the
  // builder shows "Open <field> field") — never the raw model errors.
  it("AI-REPAIR-2G — malformed model patch + missing-field diagnosis → deterministic targeted block, no raw operations.*", async () => {
    // #1 model preview: blocked with raw structural Zod errors.
    mockPreview.mockResolvedValueOnce({
      ok: true,
      data: {
        ...validPreviewData,
        ok: false,
        canApplyLater: false,
        validation: {
          ok: false,
          errors: [
            { code: "INVALID_PATCH", message: "operations.0.nodeId: Required" },
            { code: "UNSUPPORTED_OPERATION", message: "operations.0: Unrecognized key(s) in object: 'id'" },
          ],
          warnings: [],
        },
        blockedReason: "operations.0.nodeId: Required",
      },
    });
    // #2 fallback preview (empty-config updateNodeConfig): the real targeted block.
    mockPreview.mockResolvedValueOnce({
      ok: true,
      data: {
        ...validPreviewData,
        ok: false,
        canApplyLater: false,
        validation: {
          ok: false,
          errors: [
            {
              code: "MISSING_REQUIRED_FIELD",
              message: "Required field “Message” is missing on “Send Channel Message.”",
              nodeId: "node-B",
              path: "to",
              nodeLabel: "Send Channel Message",
              fieldLabel: "Message",
            },
          ],
          warnings: [],
        },
        blockedReason: "Required field “Message” is missing on “Send Channel Message.”",
      },
    });

    const res = await previewWorkflowRepair({ dto, ...base, modelClient: clientReturning(success(modelPatchText)) });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.preview.ok).toBe(false);
      const errs = res.preview.validation.errors;
      expect(errs.some((e) => e.code === "MISSING_REQUIRED_FIELD")).toBe(true);
      const missing = errs.find((e) => e.code === "MISSING_REQUIRED_FIELD")!;
      expect(missing.nodeLabel).toBe("Send Channel Message");
      expect(missing.fieldLabel).toBe("Message");
      // No raw model/Zod text anywhere in the surfaced preview.
      const serialized = JSON.stringify(res.preview);
      expect(serialized).not.toContain("operations.0");
      expect(serialized).not.toMatch(/Unrecognized key/);
    }
    // The fallback ran a deterministic empty-config updateNodeConfig on the node.
    expect(mockPreview.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(mockPreview.mock.calls[1]![0].patch.operations).toEqual([
      { op: "updateNodeConfig", nodeId: "node-B", config: {} },
    ]);
  });

  it("AI-REPAIR-2G — malformed model patch + NO missing-field target → handled NO_SAFE_PATCH, no raw leak", async () => {
    const dtoNoField = { ...(dto as Record<string, unknown>), findings: [] } as never;
    mockPreview.mockResolvedValueOnce({
      ok: true,
      data: {
        ...validPreviewData,
        ok: false,
        canApplyLater: false,
        validation: { ok: false, errors: [{ code: "INVALID_PATCH", message: "operations.0.nodeId: Required" }], warnings: [] },
        blockedReason: "operations.0.nodeId: Required",
      },
    });
    const res = await previewWorkflowRepair({ dto: dtoNoField, ...base, modelClient: clientReturning(success(modelPatchText)) });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("NO_SAFE_PATCH");
      expect(JSON.stringify(res)).not.toContain("operations.0");
    }
  });

  // AI-REPAIR-2E — the model RESPONDED but its patch is unusable (a malformed op
  // crashed the validate pipeline). That is "no safe automatic fix", a HANDLED
  // outcome the route returns as a friendly 200 — never a 503 (and never a 500).
  it("a throw from the preview pipeline (malformed ops) → handled NO_SAFE_PATCH, never 500/503", async () => {
    mockPreview.mockRejectedValueOnce(new Error("normalize blew up on a malformed op"));
    const res = await previewWorkflowRepair({ dto, ...base, modelClient: clientReturning(success(modelPatchText)) });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("NO_SAFE_PATCH");
      expect(res.detail).toBe("preview_pipeline_throw");
    }
  });

  it("maps a genuine provider failure (NOT_CONFIGURED) to MODEL_FAILED → route 503 (never trusts the model)", async () => {
    const res = await previewWorkflowRepair({
      dto,
      ...base,
      modelClient: clientReturning({ ok: false, modelId: "gpt-4.1-mini", feature: "repair", failureCode: "NOT_CONFIGURED", message: "no key" }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("MODEL_FAILED");
    expect(mockPreview).not.toHaveBeenCalled();
  });

  // AI-REPAIR-2D — the model DECLINING to emit a patch is an EXPECTED outcome
  // (the remaining issue needs a user-supplied value / reconnect), NOT a 503.
  // AI-REPAIR-2H — a decline now first attempts the deterministic targeted block;
  // with the default (VALID) preview mock there's no blocked target, so it still
  // resolves to the handled NO_SAFE_PATCH (never MODEL_FAILED/503).
  it.each(["INVALID_RESPONSE", "EMPTY_RESPONSE"] as const)(
    "maps a model that declined to patch (%s) to handled NO_SAFE_PATCH, not MODEL_FAILED",
    async (failureCode) => {
      const res = await previewWorkflowRepair({
        dto,
        ...base,
        modelClient: clientReturning({ ok: false, modelId: "gpt-4.1-mini", feature: "repair", failureCode, message: "declined" }),
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe("NO_SAFE_PATCH");
    },
  );

  // AI-REPAIR-2D + 2H — a decline with NO missing-field target short-circuits the
  // targeted block (no node to point at) and never touches the preview pipeline.
  it.each(["INVALID_RESPONSE", "EMPTY_RESPONSE"] as const)(
    "decline + NO target (%s) → generic NO_SAFE_PATCH, no preview call",
    async (failureCode) => {
      const dtoNoField = { ...(dto as Record<string, unknown>), findings: [] } as never;
      const res = await previewWorkflowRepair({
        dto: dtoNoField,
        ...base,
        modelClient: clientReturning({ ok: false, modelId: "gpt-4.1-mini", feature: "repair", failureCode, message: "declined" }),
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe("NO_SAFE_PATCH");
      expect(mockPreview).not.toHaveBeenCalled();
    },
  );

  // AI-REPAIR-2H — the CORE regression: the model declines (the expected path for a
  // user-input-required field), but the diagnosis already names the missing-field
  // node. The service must build the deterministic targeted block ("Open <field>
  // field") instead of the dead-end generic NO_SAFE_PATCH copy.
  it.each(["INVALID_RESPONSE", "EMPTY_RESPONSE"] as const)(
    "decline + missing-field diagnosis (%s) → deterministic targeted block, not generic NO_SAFE_PATCH",
    async (failureCode) => {
      // The ONLY preview call on the decline path is the empty-config targeted block.
      mockPreview.mockResolvedValueOnce({
        ok: true,
        data: {
          ...validPreviewData,
          ok: false,
          canApplyLater: false,
          validation: {
            ok: false,
            errors: [
              {
                code: "MISSING_REQUIRED_FIELD",
                message: "Required field “Message” is missing on “Send Channel Message.”",
                nodeId: "node-B",
                path: "text",
                nodeLabel: "Send Channel Message",
                fieldLabel: "Message",
              },
            ],
            warnings: [],
          },
          blockedReason: "Required field “Message” is missing on “Send Channel Message.”",
        },
      });
      const res = await previewWorkflowRepair({
        dto,
        ...base,
        modelClient: clientReturning({ ok: false, modelId: "gpt-4.1-mini", feature: "repair", failureCode, message: "declined" }),
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.preview.ok).toBe(false);
        const missing = res.preview.validation.errors.find((e) => e.code === "MISSING_REQUIRED_FIELD")!;
        expect(missing).toBeDefined();
        // Go-to-field metadata: internal nodeId/path target + display labels.
        expect(missing.nodeId).toBe("node-B");
        expect(missing.path).toBe("text");
        expect(missing.nodeLabel).toBe("Send Channel Message");
        expect(missing.fieldLabel).toBe("Message");
        // No raw structural model/Zod text leaks into the surfaced preview.
        const serialized = JSON.stringify(res.preview);
        expect(serialized).not.toContain("operations.0");
        expect(serialized).not.toMatch(/Unrecognized key/);
      }
      // The targeted block ran the deterministic empty-config no-op on the node.
      expect(mockPreview.mock.calls[0]![0].patch.operations).toEqual([
        { op: "updateNodeConfig", nodeId: "node-B", config: {} },
      ]);
    },
  );

  it.each(["RATE_LIMITED", "PROVIDER_ERROR", "TIMEOUT", "NETWORK_ERROR"] as const)(
    "keeps a genuine provider/transport failure (%s) as MODEL_FAILED",
    async (failureCode) => {
      const res = await previewWorkflowRepair({
        dto,
        ...base,
        modelClient: clientReturning({ ok: false, modelId: "gpt-4.1-mini", feature: "repair", failureCode, message: "x" }),
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe("MODEL_FAILED");
    },
  );

  it("diagnosisHasRepairableIssue: true for an issue diagnosis, false for clean/ready + access walls", () => {
    expect(diagnosisHasRepairableIssue(dto)).toBe(true); // findings present
    expect(diagnosisHasRepairableIssue({ workflowId: "w", access: "OK", overallReady: false } as never)).toBe(true);
    expect(diagnosisHasRepairableIssue({ workflowId: "w", access: "OK", overallReady: true, findings: [], nextSteps: [] } as never)).toBe(false);
    expect(diagnosisHasRepairableIssue({ workflowId: "w", access: "OK", overallReady: true, findings: [], nextSteps: ["do x"] } as never)).toBe(true);
    expect(diagnosisHasRepairableIssue({ workflowId: "w", access: "NO_ACCESS" } as never)).toBe(false);
    expect(diagnosisHasRepairableIssue({ workflowId: "w", access: "NOT_FOUND" } as never)).toBe(false);
  });

  // AI-REPAIR-2E — unreadable / wrong-shape model output is a HANDLED NO_SAFE_PATCH
  // (the model responded; its output just isn't a usable patch), never PARSE_FAILED → 503.
  // AI-REPAIR-2H — with NO missing-field target, the targeted block short-circuits
  // (no node to point at) and the preview pipeline is never touched.
  it("maps non-JSON model text + NO target to handled NO_SAFE_PATCH (no preview call)", async () => {
    const dtoNoField = { ...(dto as Record<string, unknown>), findings: [] } as never;
    const res = await previewWorkflowRepair({ dto: dtoNoField, ...base, modelClient: clientReturning(success("not json {")) });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("NO_SAFE_PATCH");
      expect(res.detail).toBe("unreadable_model_json");
    }
    expect(mockPreview).not.toHaveBeenCalled();
  });

  // AI-REPAIR-2H — unreadable model output but the diagnosis names a missing-field
  // target → deterministic targeted block, not the generic dead-end.
  it("unreadable model output + missing-field diagnosis → deterministic targeted block", async () => {
    mockPreview.mockResolvedValueOnce({
      ok: true,
      data: {
        ...validPreviewData,
        ok: false,
        canApplyLater: false,
        validation: {
          ok: false,
          errors: [
            {
              code: "MISSING_REQUIRED_FIELD",
              message: "Required field “Message” is missing on “Send Channel Message.”",
              nodeId: "node-B",
              path: "text",
              nodeLabel: "Send Channel Message",
              fieldLabel: "Message",
            },
          ],
          warnings: [],
        },
        blockedReason: "Required field “Message” is missing on “Send Channel Message.”",
      },
    });
    const res = await previewWorkflowRepair({ dto, ...base, modelClient: clientReturning(success("not json {")) });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.preview.ok).toBe(false);
      const missing = res.preview.validation.errors.find((e) => e.code === "MISSING_REQUIRED_FIELD")!;
      expect(missing.fieldLabel).toBe("Message");
      expect(missing.nodeId).toBe("node-B");
    }
    expect(mockPreview.mock.calls[0]![0].patch.operations).toEqual([
      { op: "updateNodeConfig", nodeId: "node-B", config: {} },
    ]);
  });

  it("maps a missing-operations envelope to handled NO_SAFE_PATCH", async () => {
    const res = await previewWorkflowRepair({ dto, ...base, modelClient: clientReturning(success(okText({ summary: "x" }))) });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("NO_SAFE_PATCH");
      expect(res.detail).toBe("envelope_mismatch");
    }
  });

  it("maps an oversized operations list to handled NO_SAFE_PATCH (bounded envelope)", async () => {
    const operations = Array.from({ length: 60 }, () => ({ op: "removeNode", nodeId: "node-B" }));
    const res = await previewWorkflowRepair({ dto, ...base, modelClient: clientReturning(success(okText({ operations }))) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NO_SAFE_PATCH");
  });

  it("AI-REPAIR-2E — NO_SAFE_PATCH (malformed output) never leaks raw model text to the user-facing message", async () => {
    const res = await previewWorkflowRepair({ dto, ...base, modelClient: clientReturning(success("not json { secretModelRamble")) });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.message).toBe("The AI couldn't build a safe automatic fix.");
      expect(res.message).not.toMatch(/secretModelRamble|not json/);
    }
  });

  it("graph load failure → GRAPH_UNAVAILABLE, no model call", async () => {
    mockGetGraph.mockResolvedValueOnce({ ok: false, code: "NOT_FOUND", message: "x" });
    const captured = jest.fn();
    const res = await previewWorkflowRepair({
      dto,
      ...base,
      modelClient: { generateStructuredJson: captured },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("GRAPH_UNAVAILABLE");
    expect(captured).not.toHaveBeenCalled();
  });

  it("includes sanitized non-authoritative proposal steering when provided", async () => {
    const cap = capturingClient(modelPatchText);
    await previewWorkflowRepair({
      dto,
      ...base,
      modelClient: cap.client,
      proposalContext: { summary: "Reconnect then set recipient", recommendedActions: ["Set the To field"], evilExtra: "DROP-ME" },
    });
    const sent = JSON.stringify(cap.lastInput().messages);
    expect(sent).toContain("Set the To field");
    // Unknown keys on the steering object are stripped by the sanitizer.
    expect(sent).not.toContain("DROP-ME");
  });

  it("validates against + builds the model inventory from the DRAFT when provided", async () => {
    const draft = {
      nodes: [{ id: "node-DRAFT", kind: "action", provider: "slack", type: "send_channel_message", config: { channel: "C", secretToken: "DRAFT-LEAK" }, position: { x: 0, y: 0 } }],
      edges: [],
    } as never;
    const cap = capturingClient(modelPatchText);
    await previewWorkflowRepair({ dto, ...base, modelClient: cap.client, draftDefinition: draft });
    const sent = JSON.stringify(cap.lastInput().messages);
    // Inventory came from the DRAFT, not the saved graph (node-A / node-B).
    expect(sent).toContain("node-DRAFT");
    expect(sent).not.toContain("node-A");
    expect(sent).not.toContain("node-B");
    // Still no config VALUES from the draft in the prompt.
    expect(sent).not.toContain("DRAFT-LEAK");
    // The draft is forwarded to the existing preview engine as the validation target.
    expect(mockPreview.mock.calls[0]![0].draftDefinition).toEqual(draft);
  });

  it("falls back to the saved inventory and forwards NO draftDefinition when none is supplied", async () => {
    const cap = capturingClient(modelPatchText);
    await previewWorkflowRepair({ dto, ...base, modelClient: cap.client });
    const sent = JSON.stringify(cap.lastInput().messages);
    expect(sent).toContain("node-A");
    expect(sent).toContain("node-B");
    expect(mockPreview.mock.calls[0]![0].draftDefinition).toBeUndefined();
  });

  it("boundary: the service imports no apply/save/run/MCP/Hermes path", () => {
    const src = readFileSync(resolve(process.cwd(), "services/ai/repair/previewWorkflowRepair.ts"), "utf8");
    expect(src).not.toMatch(/scripts\/mcp|@\/scripts\/mcp/);
    expect(src).not.toMatch(/from\s+["']@\/services\/ai\/apply/);
    expect(src).not.toMatch(/applyWorkflowPatchForAI|applyPatchToDefinition/);
    expect(src).not.toMatch(/saveWorkflow|executeWorkflow|runWorkflow|updateDraftDefinition/);
    expect(src).not.toMatch(/hermes/i);
  });
});

// ───────────── AI-REPAIR-3G/3H: deterministic variable-reference repair ─────────────
// The deterministic preview is now a SEPARATE, model-free entry point
// (`runDeterministicRepairPreview`) the ROUTE calls BEFORE the credit gate / model
// client (AI-REPAIR-3H). It takes NO model client and returns `{ ok, preview } | null`.
describe("runDeterministicRepairPreview — model-free fast-path (AI-REPAIR-3G/3H)", () => {
  const base = { userId: "user-1", workflowId: "wf-OPAQUE" } as const;

  /** Diagnosis whose only repairable issue is a broken ref on the Slack message field. */
  const brokenRefDto = {
    workflowId: "wf-OPAQUE",
    access: "OK",
    overallReady: false,
    summaryText: "A step references a deleted or missing step.",
    findings: [
      {
        source: "graph",
        code: "INVALID_VARIABLE_REFERENCE",
        severity: "error",
        title: "A step references a deleted or missing step.",
        nodeIds: ["slack-1"],
        invalidReferences: [{ fieldLabel: "Message", token: "{{ghost.text}}" }],
      },
    ],
  } as never;

  /** Diagnosis with NO invalid-variable-reference finding (e.g. a missing field). */
  const missingFieldDto = {
    workflowId: "wf-OPAQUE",
    access: "OK",
    overallReady: false,
    findings: [{ source: "field", code: "MISSING_REQUIRED_FIELD", severity: "error", title: "x", nodeIds: ["node-B"] }],
  } as never;

  /** Saved graph: the Slack Message field still holds a deleted-node reference. */
  const brokenGraph = {
    workflowId: "wf-OPAQUE",
    name: "n",
    state: "active",
    activeRevisionId: null,
    updatedAt: "rev-token-1",
    nodes: [
      { id: "trigger-1", kind: "trigger", provider: "native", type: "manual_trigger", config: {}, position: { x: 0, y: 0 } },
      { id: "slack-1", kind: "action", provider: "slack", type: "send_message", config: { message: "{{ghost.text}}" }, position: { x: 0, y: 1 } },
    ],
    edges: [{ id: "e1", from: "trigger-1", to: "slack-1" }],
  };

  const oneCandidate = {
    ok: true,
    data: { variables: [{ nodeId: "trigger-1", nodeType: "native:manual_trigger", nodeKind: "trigger", path: "text", reference: "{{trigger.text}}", type: "string", sensitive: false }] },
  };

  beforeEach(() => {
    mockGetGraph.mockResolvedValue({ ok: true, data: brokenGraph });
  });

  it("exactly one broken ref + one candidate → applyable preview + typed repairVariableReference op", async () => {
    mockGetVars.mockResolvedValue(oneCandidate);
    const res = await runDeterministicRepairPreview({ dto: brokenRefDto, ...base });
    expect(res).not.toBeNull();
    expect(res!.ok).toBe(true);
    expect(res!.preview.ok).toBe(true); // applyable

    // The patch handed to the existing preview engine is a typed repairVariableReference.
    expect(mockPreview).toHaveBeenCalledTimes(1);
    const patch = mockPreview.mock.calls[0]![0].patch;
    expect(patch.operations).toEqual([
      { op: "repairVariableReference", nodeId: "slack-1", fieldPath: "message", newReference: "{{trigger.text}}" },
    ]);
    expect(patch.baseRevision).toBe("rev-token-1");
  });

  it("uses the SAME validation/apply path (previewWorkflowPatchForAI) — no separate engine", async () => {
    mockGetVars.mockResolvedValue(oneCandidate);
    await runDeterministicRepairPreview({ dto: brokenRefDto, ...base });
    // Goes through the existing preview engine (which attaches apply-readiness metadata).
    expect(mockPreview).toHaveBeenCalledTimes(1);
  });

  it("returns null WITHOUT reading the graph when there is no invalid-reference finding", async () => {
    const res = await runDeterministicRepairPreview({ dto: missingFieldDto, ...base });
    expect(res).toBeNull();
    expect(mockGetGraph).not.toHaveBeenCalled(); // zero overhead before the gated model path
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it("ZERO matching candidates → null (caller runs the paid model path)", async () => {
    mockGetVars.mockResolvedValue({ ok: true, data: { variables: [] } });
    expect(await runDeterministicRepairPreview({ dto: brokenRefDto, ...base })).toBeNull();
  });

  it("MULTIPLE matching candidates → ambiguous → null", async () => {
    mockGetVars.mockResolvedValue({
      ok: true,
      data: {
        variables: [
          { nodeId: "trigger-1", nodeType: "native:manual_trigger", nodeKind: "trigger", path: "text", reference: "{{trigger.text}}", type: "string", sensitive: false },
          { nodeId: "n9", nodeType: "x:y", nodeKind: "action", path: "text", reference: "{{n9.text}}", type: "string", sensitive: false },
        ],
      },
    });
    expect(await runDeterministicRepairPreview({ dto: brokenRefDto, ...base })).toBeNull();
  });

  it("a safety-BLOCKED preview (e.g. recipient field) → null (caller runs the model path)", async () => {
    mockGetVars.mockResolvedValue(oneCandidate);
    mockPreview.mockResolvedValue({ ok: true, data: { ...validPreviewData, ok: false, blockedReason: "Recipient field change requires confirmation." } });
    expect(await runDeterministicRepairPreview({ dto: brokenRefDto, ...base })).toBeNull();
  });

  it("graph unavailable → null (caller's model path surfaces GRAPH_UNAVAILABLE safely)", async () => {
    mockGetVars.mockResolvedValue(oneCandidate);
    mockGetGraph.mockResolvedValue({ ok: false, code: "NOT_FOUND" });
    expect(await runDeterministicRepairPreview({ dto: brokenRefDto, ...base })).toBeNull();
  });
});

// AI-REPAIR-3H — `previewWorkflowRepair` is now EXCLUSIVELY the paid model path: it no
// longer short-circuits the deterministic case (the route handles that first).
describe("previewWorkflowRepair — is now exclusively the model path (AI-REPAIR-3H)", () => {
  const base = { userId: "user-1", workflowId: "wf-OPAQUE" } as const;
  const brokenRefDto = {
    workflowId: "wf-OPAQUE",
    access: "OK",
    overallReady: false,
    findings: [{ source: "graph", code: "INVALID_VARIABLE_REFERENCE", severity: "error", title: "x", nodeIds: ["node-B"] }],
  } as never;

  it("calls the model even for an invalid-variable-reference dto (no in-service fast-path)", async () => {
    const cap = capturingClient(modelPatchText);
    await previewWorkflowRepair({ dto: brokenRefDto, ...base, modelClient: cap.client });
    // The model WAS consulted — the deterministic short-circuit lives in the route now.
    expect(() => cap.lastInput()).not.toThrow();
  });

  it("the service no longer emits a sentinel deterministic model id", () => {
    const src = readFileSync(resolve(process.cwd(), "services/ai/repair/previewWorkflowRepair.ts"), "utf8");
    expect(src).not.toMatch(/deterministic:variable-reference/);
  });
});
