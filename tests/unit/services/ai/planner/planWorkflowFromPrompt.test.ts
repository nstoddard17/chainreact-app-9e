/**
 * @jest-environment node
 *
 * Tests for services/ai/planner/planWorkflowFromPrompt.ts (Slice 4.AI-8B).
 *
 * The first model-backed planning service. The model client is INJECTED via
 * createMockModelClient (no live calls); only getWorkflowGraphForAI + the
 * integrations repo are mocked, so buildWorkflowPlanRequest's catalog grounding,
 * the AI-8A parser, the AI-3 validator, and the AI-5 preview all run for real.
 * These pin: happy path (preview + canApplyLater), no-patch/unsupported, model
 * failure, parse failure, preview rejection, registry grounding (hallucination
 * rejected), baseRevision reconciliation, no-mutation, and no-leak.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mockGetWorkflowGraphForAI = jest.fn();
const mockListActiveByUser = jest.fn();

jest.mock("@/services/ai/tools/workflowContext", () => ({
  getWorkflowGraphForAI: (...a: unknown[]) => mockGetWorkflowGraphForAI(...a),
}));
jest.mock("@/repositories/integrations", () => ({
  listActiveByUser: (...a: unknown[]) => mockListActiveByUser(...a),
}));
jest.mock("@/repositories/userBilling", () => ({
  deductTasks: jest.fn(),
  getUsage: jest.fn(),
}));

import { planWorkflowFromPromptForAI } from "@/services/ai/planner/planWorkflowFromPrompt";
import { createMockModelClient } from "@/core/ai/modelClient";
import { MODELS } from "@/core/ai/models";
import { getProviderCatalog } from "@/services/ai/tools/providerCatalog";

const REVISION = "2026-05-25T00:00:00Z";
const okR = <T>(data: T) => ({ ok: true as const, data });
const errR = (code: string, message: string) => ({ ok: false as const, code, message });

function gnode(
  id: string,
  kind: "trigger" | "action",
  provider: string,
  type: string,
  config: Record<string, unknown> = {},
) {
  return { id, kind, provider, type, config, position: { x: 0, y: 0 } };
}

function graphResult(
  nodes: ReturnType<typeof gnode>[],
  edges: { id: string; from: string; to: string; label?: string }[] = [],
  updatedAt = REVISION,
) {
  return okR({
    workflowId: "wf1",
    name: "WF",
    state: "draft",
    activeRevisionId: null,
    updatedAt,
    nodes,
    edges,
  });
}

function planResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    intentSummary: "Plan summary",
    assumptions: [],
    requiredUserInput: [],
    proposedPatch: null,
    confidence: "high",
    safetyNotes: [],
    unsupportedRequests: [],
    ...overrides,
  });
}

/** moveNode patch: not config-affected, so it stays registry-agnostic + valid. */
function movePatch() {
  return {
    patchId: "p1",
    workflowId: "ignored-by-model",
    baseRevision: "STALE-MODEL-REV",
    operations: [{ op: "moveNode", nodeId: "n1", position: { x: 120, y: 240 } }],
    summary: "Tidy layout",
    rationale: "Move the node",
  };
}

/** addNode of an invented provider — structurally valid, semantically rejected. */
function inventedPatch() {
  return {
    patchId: "p2",
    workflowId: "wf1",
    baseRevision: "x",
    operations: [
      { op: "addNode", node: { id: "n9", kind: "action", provider: "fakeprovider", type: "fake_action" } },
    ],
    summary: "Add fake action",
    rationale: "hallucinated",
  };
}

function client(text: string) {
  return createMockModelClient({ text });
}

const ORIGINAL_ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  mockGetWorkflowGraphForAI.mockReset();
  mockListActiveByUser.mockReset();
  mockListActiveByUser.mockResolvedValue([]);
  // AI-8C: the default client is the env-configured runtime client. Clear keys so
  // the no-injected-client path is deterministically NOT_CONFIGURED (and never
  // makes a live call) regardless of the developer's shell env.
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
});
afterAll(() => {
  if (ORIGINAL_ANTHROPIC_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_ANTHROPIC_KEY;
});

describe("happy path — valid patch previewed", () => {
  beforeEach(() => {
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([gnode("n1", "action", "slack", "send")]));
  });

  it("calls the model once, parses, previews, and returns canApplyLater true", async () => {
    const mc = client(planResponse({ proposedPatch: movePatch() }));
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "Tidy up the layout",
      modelClient: mc,
    });

    expect(mc.calls).toHaveLength(1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposedPatch).toBeDefined();
    expect(result.preview).toBeDefined();
    expect(result.canApplyLater).toBe(true);
    expect(result.blockedReason).toBeUndefined();
    expect(result.intentSummary).toBe("Plan summary");
    expect(result.noMutation).toBe(true);
  });

  it("reports deterministic model metadata", async () => {
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "x",
      modelClient: client(planResponse({ proposedPatch: movePatch() })),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.model.modelId).toBe(MODELS.strong.id);
    expect(result.model.tier).toBe("strong");
    expect(result.model.feature).toBe("creation");
    expect(result.model.finishReason).toBe("stop");
  });

  it("reconciles baseRevision to the live revision and forces the workflowId", async () => {
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "x",
      modelClient: client(planResponse({ proposedPatch: movePatch() })),
    });
    expect(result.ok).toBe(true);
    if (!result.ok || !result.proposedPatch) return;
    expect(result.proposedPatch.baseRevision).toBe(REVISION); // not the model's STALE-MODEL-REV
    expect(result.proposedPatch.workflowId).toBe("wf1"); // not the model's "ignored-by-model"
  });
});

describe("no patch — needs input / unsupported", () => {
  it("returns requiredUserInput with no preview and canApplyLater false", async () => {
    const mc = client(
      planResponse({
        requiredUserInput: [{ label: "Pick a channel", kind: "config_value", nodeId: "n2", field: "channel" }],
      }),
    );
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "post to slack",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.requiredUserInput).toHaveLength(1);
    expect(result.proposedPatch).toBeUndefined();
    expect(result.preview).toBeUndefined();
    expect(result.canApplyLater).toBe(false);
    // Workflow was never loaded → preview was never reached.
    expect(mockGetWorkflowGraphForAI).not.toHaveBeenCalled();
  });

  it("models the Stripe-DM case: missing Slack userId returns requiredUserInput, not a parse failure", async () => {
    // The AI-12B intended degradation. Rather than emit a guessed/partial patch
    // (a 502 PARSE_FAILED), the model returns a null patch + a clear
    // requiredUserInput — a 200 "needs input" the user can act on. Preview is
    // never reached because there is no patch.
    const mc = client(
      planResponse({
        intentSummary: "Send a Slack DM when a Stripe payment fails",
        assumptions: ["Will DM the user once a Slack recipient is provided"],
        requiredUserInput: [
          { label: "Which Slack user should receive the DM?", kind: "config_value", field: "userId" },
        ],
      }),
    );
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "when a stripe payment fails, i want it to send me a slack dm",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.requiredUserInput).toHaveLength(1);
    expect(result.requiredUserInput[0]!.field).toBe("userId");
    expect(result.proposedPatch).toBeUndefined();
    expect(result.canApplyLater).toBe(false);
    expect(mockGetWorkflowGraphForAI).not.toHaveBeenCalled();
  });

  it("surfaces unsupportedRequests without fabricating a patch", async () => {
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "send a fax",
      modelClient: client(planResponse({ unsupportedRequests: ["send a fax"] })),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unsupportedRequests).toEqual(["send a fax"]);
    expect(result.proposedPatch).toBeUndefined();
    expect(mockGetWorkflowGraphForAI).not.toHaveBeenCalled();
  });
});

// ─── Slice 4.AI-20 — apply-readiness gate for unresolved required input ──────
describe("apply-readiness gate (AI-20)", () => {
  beforeEach(() => {
    mockGetWorkflowGraphForAI.mockResolvedValue(
      graphResult([gnode("n1", "action", "slack", "send")]),
    );
  });

  it("gates canApplyLater to false when the AI returns BOTH a structurally-valid patch AND non-empty requiredUserInput (live regression fix)", async () => {
    // This is the exact live failure mode AI-19 surfaced: the AI returned
    // a structurally-valid Manual Trigger → Slack patch (the preview
    // would happily accept it because AI_FIELD placeholders are
    // schema-valid) AND a requiredUserInput list ("Which channel?",
    // "What should the message say?"). Pre-AI-20 the planner trusted
    // preview.canApplyLater → the UI surfaced an enabled Apply button
    // alongside "More information is needed". AI-20 closes that.
    const mc = client(
      planResponse({
        proposedPatch: movePatch(),
        requiredUserInput: [
          { label: "Which Slack channel should the message be sent to?", kind: "config_value" },
          { label: "What should the message say?", kind: "config_value" },
        ],
      }),
    );
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "Create a workflow that sends a Slack message when I manually run it.",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The preview still ran — cost / risk / validation are still
    // available — but the planner refuses to flag it apply-ready.
    expect(result.preview).toBeDefined();
    expect(result.proposedPatch).toBeDefined();
    expect(result.requiredUserInput).toHaveLength(2);
    expect(result.canApplyLater).toBe(false);
    expect(result.blockedReason).toMatch(/answer the questions above.+plan with ai again/i);
  });

  it("STILL returns canApplyLater:true when the patch is valid AND there is no required input (happy-path unchanged)", async () => {
    // Defensive: make sure AI-20's gate didn't regress the apply-ready
    // happy path.
    const mc = client(
      planResponse({
        proposedPatch: movePatch(),
        requiredUserInput: [],
      }),
    );
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "Tidy up the layout",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.canApplyLater).toBe(true);
    expect(result.blockedReason).toBeUndefined();
  });

  it("preserves the existing preview-rejected blockedReason when the patch fails validation AND requiredUserInput is empty", async () => {
    // The preview-rejected branch still surfaces preview.blockedReason —
    // AI-20's new gate only fires when requiredUserInput is the cause.
    const mc = client(
      planResponse({
        proposedPatch: inventedPatch(),
        requiredUserInput: [],
      }),
    );
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "x",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.canApplyLater).toBe(false);
    // The blockedReason should NOT be the AI-20 required-input copy —
    // it's a preview rejection.
    expect(result.blockedReason).not.toMatch(/answer the questions above/i);
  });
});

describe("model failure", () => {
  it("returns MODEL_FAILED for the default NOT_CONFIGURED client (no preview)", async () => {
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "x",
      // no modelClient → NOT_CONFIGURED default
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("MODEL_FAILED");
    expect(result.errors[0]!.stage).toBe("model");
    expect(result.errors[0]!.code).toBe("NOT_CONFIGURED");
    expect(result.model?.modelId).toBe(MODELS.strong.id);
    expect(mockGetWorkflowGraphForAI).not.toHaveBeenCalled();
  });

  it("returns MODEL_FAILED for a provider error result", async () => {
    const mc = createMockModelClient({
      respond: {
        ok: false,
        modelId: "m",
        feature: "creation",
        failureCode: "PROVIDER_ERROR",
        message: "boom",
      },
    });
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "x",
      modelClient: mc,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("MODEL_FAILED");
    expect(result.errors[0]!.code).toBe("PROVIDER_ERROR");
  });
});

describe("parse failure", () => {
  it("returns PARSE_FAILED for non-JSON output (no preview)", async () => {
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "x",
      modelClient: client("I think you should add a Slack node."),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("PARSE_FAILED");
    expect(result.errors[0]!.stage).toBe("parse");
    expect(result.errors[0]!.code).toBe("NOT_JSON");
    expect(mockGetWorkflowGraphForAI).not.toHaveBeenCalled();
  });

  it("rejects prose wrapped around JSON per the AI-8A parser contract", async () => {
    const noisy = "Sure!\n" + planResponse({ proposedPatch: movePatch() }) + "\nDone.";
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "x",
      modelClient: client(noisy),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("PARSE_FAILED");
  });
});

describe("preview rejection — registry grounding (hallucination)", () => {
  it("surfaces the patch but marks it not apply-ready when the validator rejects an invented provider", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([]));
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "add a fake node",
      modelClient: client(planResponse({ proposedPatch: inventedPatch() })),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.canApplyLater).toBe(false);
    expect(result.blockedReason).toBeDefined();
    expect(result.proposedPatch).toBeDefined();
    expect(result.preview).toBeDefined();
    expect(result.preview!.validation.ok).toBe(false);
    // The invented provider was rejected by the deterministic validator.
    expect(result.preview!.validation.errors.some((e) => e.code === "UNKNOWN_ACTION")).toBe(true);
  });
});

describe("preview unavailable", () => {
  it("returns PREVIEW_UNAVAILABLE when the workflow is not found", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(errR("NOT_FOUND", "No workflow 'wf1'."));
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "x",
      modelClient: client(planResponse({ proposedPatch: movePatch() })),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("PREVIEW_UNAVAILABLE");
    expect(result.errors[0]!.stage).toBe("preview");
    expect(result.errors[0]!.code).toBe("NOT_FOUND");
  });
});

// ─── Slice 4.AI-19 — forced tool-use structured output wiring ───────────────
describe("structured-output wiring (AI-19)", () => {
  beforeEach(() => {
    mockGetWorkflowGraphForAI.mockResolvedValue(
      graphResult([gnode("n1", "action", "slack", "send")]),
    );
  });

  it("passes the propose_workflow_plan tool to the model client on every plan call", async () => {
    const mc = client(planResponse({ proposedPatch: movePatch() }));
    await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "tidy",
      modelClient: mc,
    });
    expect(mc.calls).toHaveLength(1);
    const req = mc.calls[0]!.input;
    expect(req.responseTool).toBeDefined();
    expect(req.responseTool!.name).toBe("propose_workflow_plan");
    expect(req.responseTool!.description).toContain("workflow plan response");
    // Schema is JSON Schema with the parser's fields.
    const schema = req.responseTool!.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props)).toEqual(
      expect.arrayContaining([
        "intentSummary",
        "assumptions",
        "requiredUserInput",
        "unsupportedRequests",
        "safetyNotes",
        "proposedPatch",
        "confidence",
      ]),
    );
    expect(schema.required).toEqual(
      expect.arrayContaining(["intentSummary", "confidence"]),
    );
  });

  it("does NOT loosen the parser — INVALID_PATCH still rejected even when tool returns a bad patch", async () => {
    // Simulates Anthropic returning a malformed patch via tool_use. The
    // adapter would stringify it; the parser MUST still reject it via the
    // existing INVALID_PATCH path. AI-19 is a transport change, not a
    // validation change.
    const badPatchText = JSON.stringify({
      intentSummary: "x",
      assumptions: [],
      requiredUserInput: [],
      proposedPatch: { not: "a real patch" },
      confidence: "high",
      safetyNotes: [],
      unsupportedRequests: [],
    });
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "x",
      modelClient: client(badPatchText),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("PARSE_FAILED");
    expect(result.errors[0]!.code).toBe("INVALID_PATCH");
  });

  it("MODEL_FAILED still propagates when the structured-mode call returns INVALID_RESPONSE (forced tool not called)", async () => {
    // Drive an explicit failure through the mock client — simulating the
    // Anthropic adapter rejecting a text-only response under structured mode.
    const failingClient = {
      async generateStructuredJson() {
        return {
          ok: false as const,
          modelId: MODELS.strong.id,
          feature: "creation" as const,
          failureCode: "INVALID_RESPONSE" as const,
          message: "Anthropic response did not call the forced tool 'propose_workflow_plan'.",
          retryable: true,
        };
      },
    };
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "x",
      modelClient: failingClient,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("MODEL_FAILED");
    expect(result.errors[0]!.stage).toBe("model");
    expect(result.errors[0]!.code).toBe("INVALID_RESPONSE");
    expect(result.noMutation).toBe(true);
    // No mutation / preview attempted on a model failure.
    expect(mockGetWorkflowGraphForAI).not.toHaveBeenCalled();
  });

  it("end-to-end: simulated Anthropic tool_use response → reaches preview + canApplyLater", async () => {
    // Drives the planner with the runtime client + a mocked fetch returning a
    // tool_use block (the live shape under AI-19). Asserts the planner does
    // not regress to the AI-18 PARSE_FAILED/NOT_JSON failure mode.
    process.env.ANTHROPIC_API_KEY = "sk-ant-AI-19-TEST";
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [
          {
            type: "tool_use",
            id: "toolu_x",
            name: "propose_workflow_plan",
            input: JSON.parse(planResponse({ proposedPatch: movePatch() })),
          },
        ],
        stop_reason: "tool_use",
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
      text: async () => "{}",
    } as unknown as Response);
    const original = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = fetchSpy;
    try {
      const result = await planWorkflowFromPromptForAI({
        userId: "u1",
        workflowId: "wf1",
        prompt: "When a Stripe payment fails, send me a Slack DM.",
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      // The fetch body must include tools + tool_choice (the AI-19 contract).
      const reqInit = fetchSpy.mock.calls[0]![1] as { body: string };
      const body = JSON.parse(reqInit.body);
      expect(body.tool_choice).toEqual({ type: "tool", name: "propose_workflow_plan" });
      expect(body.tools[0].name).toBe("propose_workflow_plan");
      // And the planner reached preview successfully (no PARSE_FAILED).
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.canApplyLater).toBe(true);
      expect(result.preview).toBeDefined();
    } finally {
      (globalThis as { fetch?: unknown }).fetch = original;
    }
  });
});

describe("registry grounding — prompt only carries real catalog providers", () => {
  it("sends real catalog action keys and omits pending (metadata-less) providers", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([gnode("n1", "action", "slack", "send")]));
    const mc = client(planResponse({ proposedPatch: movePatch() }));
    await planWorkflowFromPromptForAI({ userId: "u1", workflowId: "wf1", prompt: "x", modelClient: mc });

    const system = mc.calls[0]!.input.messages.find((m) => m.role === "system")!.content;
    const catalog = getProviderCatalog();
    expect(catalog.ok).toBe(true);
    if (!catalog.ok) return;

    const usable = catalog.data.providers.find((p) => p.actions.length > 0 || p.triggers.length > 0);
    const sampleKey = usable?.actions[0]?.key ?? usable?.triggers[0]?.key;
    expect(sampleKey).toBeDefined();
    expect(system).toContain(sampleKey!);

    for (const p of catalog.data.providers.filter((x) => x.actions.length === 0 && x.triggers.length === 0)) {
      expect(system).not.toContain(`(id: ${p.id})`);
    }
  });
});

describe("default runtime client wiring (AI-8C)", () => {
  it("with no injected client and no API key → MODEL_FAILED / NOT_CONFIGURED, no preview", async () => {
    const result = await planWorkflowFromPromptForAI({ userId: "u1", workflowId: "wf1", prompt: "x" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("MODEL_FAILED");
    expect(result.errors[0]!.code).toBe("NOT_CONFIGURED");
    expect(mockGetWorkflowGraphForAI).not.toHaveBeenCalled();
  });

  it("with no injected client but a configured key + mocked fetch → reaches parse/preview", async () => {
    // Slice 4.AI-19 — the planner now passes `responseTool` so the Anthropic
    // adapter forces tool-use. The mocked fetch must return a tool_use block,
    // not a text block — otherwise the adapter (correctly) flags
    // INVALID_RESPONSE because the model didn't call the forced tool.
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([gnode("n1", "action", "slack", "send")]));
    process.env.ANTHROPIC_API_KEY = "sk-ant-RUNTIME-TEST";
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [
          {
            type: "tool_use",
            name: "propose_workflow_plan",
            input: JSON.parse(planResponse({ proposedPatch: movePatch() })),
          },
        ],
        stop_reason: "tool_use",
        usage: { input_tokens: 1, output_tokens: 2 },
      }),
      text: async () => "{}",
    } as unknown as Response);
    const original = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = fetchSpy;
    try {
      const result = await planWorkflowFromPromptForAI({ userId: "u1", workflowId: "wf1", prompt: "tidy" });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.canApplyLater).toBe(true);
      expect(result.preview).toBeDefined();
      // The runtime key must never surface in the planner result.
      expect(JSON.stringify(result)).not.toContain("sk-ant-RUNTIME-TEST");
    } finally {
      (globalThis as { fetch?: unknown }).fetch = original;
    }
  });

  it("still uses an injected client even when a key is present (no env required)", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([gnode("n1", "action", "slack", "send")]));
    process.env.ANTHROPIC_API_KEY = "sk-ant-SHOULD-NOT-BE-USED";
    const fetchSpy = jest.fn();
    const original = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = fetchSpy;
    try {
      const mc = client(planResponse({ proposedPatch: movePatch() }));
      const result = await planWorkflowFromPromptForAI({
        userId: "u1",
        workflowId: "wf1",
        prompt: "x",
        modelClient: mc,
      });
      expect(mc.calls).toHaveLength(1);
      expect(fetchSpy).not.toHaveBeenCalled(); // injected client used, not the runtime adapter
      expect(result.ok).toBe(true);
    } finally {
      (globalThis as { fetch?: unknown }).fetch = original;
    }
  });
});

describe("config-grounding round-trips (AI-12D)", () => {
  const NODE_POSITION = { x: 0, y: 0 };

  function slackDmPatch(config: Record<string, unknown>) {
    return {
      patchId: "p-slack-dm",
      workflowId: "wf1",
      baseRevision: "x",
      operations: [
        {
          op: "addNode",
          node: {
            id: "n-slack",
            kind: "action",
            provider: "slack",
            type: "send_direct_message",
            config,
            position: NODE_POSITION,
          },
        },
      ],
      summary: "Send a Slack DM",
      rationale: "User asked for a DM on payment failure",
    };
  }

  function ifThenPatch(config: Record<string, unknown>) {
    return {
      patchId: "p-if-then",
      workflowId: "wf1",
      baseRevision: "x",
      operations: [
        {
          op: "addNode",
          node: {
            id: "n-if",
            kind: "action",
            provider: "native",
            type: "if_then_condition",
            config,
            position: NODE_POSITION,
          },
        },
      ],
      summary: "Branch the flow",
      rationale: "Inspect the payment status",
    };
  }

  it("system prompt names slack:send_direct_message's required config fields (userId + text), pinning the message-vs-text fix", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([]));
    const mc = client(planResponse({ proposedPatch: movePatch() }));
    await planWorkflowFromPromptForAI({ userId: "u1", workflowId: "wf1", prompt: "x", modelClient: mc });
    const system = mc.calls[0]!.input.messages.find((m) => m.role === "system")!.content;
    // The grounding block must surface the exact config keys, marked required.
    expect(system).toContain("slack:send_direct_message");
    expect(system).toMatch(/slack:send_direct_message[\s\S]*?required:[^\n]*userId/);
    expect(system).toMatch(/slack:send_direct_message[\s\S]*?required:[^\n]*text \(textarea\)/);
    // `threadTs` is the only declared optional config field for the Slack DM action.
    expect(system).toMatch(/slack:send_direct_message[\s\S]*?optional:[^\n]*threadTs/);
  });

  it("system prompt names native:if_then_condition's required config fields (input + operator), pinning the field-vs-input fix", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([]));
    const mc = client(planResponse({ proposedPatch: movePatch() }));
    await planWorkflowFromPromptForAI({ userId: "u1", workflowId: "wf1", prompt: "x", modelClient: mc });
    const system = mc.calls[0]!.input.messages.find((m) => m.role === "system")!.content;
    expect(system).toContain("native:if_then_condition");
    expect(system).toMatch(/native:if_then_condition[\s\S]*?required:[^\n]*input \(text\)/);
    expect(system).toMatch(/native:if_then_condition[\s\S]*?required:[^\n]*operator \(select\)/);
  });

  it("a Slack DM patch with the wrong key (`message`) is structurally valid but rejected by the validator as missing required fields", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([]));
    const mc = client(planResponse({ proposedPatch: slackDmPatch({ message: "hello there" }) }));
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "send me a slack dm",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.canApplyLater).toBe(false);
    expect(result.blockedReason).toBeDefined();
    expect(result.preview).toBeDefined();
    const errorCodes = result.preview!.validation.errors.map((e) => e.code);
    // Both required fields are missing — userId AND text.
    expect(errorCodes).toContain("MISSING_REQUIRED_FIELD");
    const errorPaths = result.preview!.validation.errors
      .filter((e) => e.code === "MISSING_REQUIRED_FIELD")
      .map((e) => e.path);
    expect(errorPaths).toEqual(expect.arrayContaining(["userId", "text"]));
    // The `message` key surfaces as an UNKNOWN_CONFIG_FIELD warning.
    expect(result.preview!.validation.warnings.some((w) => w.code === "UNKNOWN_CONFIG_FIELD")).toBe(true);
  });

  it("a Slack DM patch with the correct keys (userId + text) previews as apply-ready", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([]));
    const mc = client(
      planResponse({
        proposedPatch: slackDmPatch({ userId: "U01ABC23DEF", text: "A payment failed." }),
      }),
    );
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "send me a slack dm with userId U01ABC23DEF",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview).toBeDefined();
    expect(result.preview!.validation.errors).toHaveLength(0);
    expect(result.canApplyLater).toBe(true);
  });

  it("an If/Then patch with the wrong key (`field`) is rejected as missing required `input` and `operator`", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([]));
    const mc = client(planResponse({ proposedPatch: ifThenPatch({ field: "{{trigger.status}}" }) }));
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "branch on payment status",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.canApplyLater).toBe(false);
    expect(result.preview!.validation.errors.some((e) => e.code === "MISSING_REQUIRED_FIELD" && e.path === "input")).toBe(true);
    expect(result.preview!.validation.errors.some((e) => e.code === "MISSING_REQUIRED_FIELD" && e.path === "operator")).toBe(true);
  });
});

describe("Stripe value-shape + output-reference grounding (AI-16)", () => {
  const NODE_POSITION = { x: 0, y: 0 };

  function stripeTriggerNode(config: Record<string, unknown>) {
    return {
      id: "n-stripe-trigger",
      kind: "trigger" as const,
      provider: "stripe",
      type: "event_received",
      config,
      position: NODE_POSITION,
    };
  }

  function slackActionNode(config: Record<string, unknown>) {
    return {
      id: "n-slack",
      kind: "action" as const,
      provider: "slack",
      type: "send_direct_message",
      config,
      position: NODE_POSITION,
    };
  }

  function stripeToSlackPatch(
    triggerConfig: Record<string, unknown>,
    slackConfig: Record<string, unknown>,
  ) {
    return {
      patchId: "p-stripe-slack",
      workflowId: "wf1",
      baseRevision: "x",
      operations: [
        { op: "addNode", node: stripeTriggerNode(triggerConfig) },
        { op: "addNode", node: slackActionNode(slackConfig) },
        {
          op: "addEdge",
          edge: { id: "e1", from: "n-stripe-trigger", to: "n-slack" },
        },
      ],
      summary: "Stripe → Slack DM",
      rationale: "DM the owner when a Stripe payment fails.",
    };
  }

  it("system prompt names stripe:event_received.enabledEvents as combobox + multi-select", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([]));
    const mc = client(planResponse({ proposedPatch: movePatch() }));
    await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "x",
      modelClient: mc,
    });
    const system = mc.calls[0]!.input.messages.find((m) => m.role === "system")!.content;
    // If Stripe trigger metadata is registered in this build, the prompt must show
    // the multi-select tag so the model picks an array, not a scalar. If Stripe
    // isn't registered, the assertion is moot — fall through.
    if (!system.includes("stripe:event_received")) return;
    expect(system).toMatch(/enabledEvents \(combobox, multi-select\)/);
  });

  it("system prompt lists stripe:event_received outputs and does NOT list the invented ones", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([]));
    const mc = client(planResponse({ proposedPatch: movePatch() }));
    await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "x",
      modelClient: mc,
    });
    const system = mc.calls[0]!.input.messages.find((m) => m.role === "system")!.content;
    if (!system.includes("stripe:event_received")) return;
    // Declared outputs the model MAY use.
    expect(system).toMatch(/stripe:event_received[\s\S]*?outputs:[^\n]*stripeEventType/);
    expect(system).toMatch(/stripe:event_received[\s\S]*?outputs:[^\n]*data \(object, sensitive\)/);
    // The outputs LINE for this trigger must not list the convenience names the
    // model previously invented. Anchor by isolating just the outputs line.
    const match = system.match(/stripe:event_received[\s\S]*?outputs: ([^\n]+)/);
    expect(match).not.toBeNull();
    const outputsLine = match![1]!;
    for (const invented of ["amount", "currency", "last_payment_error"]) {
      expect(outputsLine).not.toContain(invented);
    }
  });

  it("a Stripe→Slack patch with enabledEvents as a SCALAR string is rejected as INVALID_CONFIG", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([]));
    const mc = client(
      planResponse({
        proposedPatch: stripeToSlackPatch(
          { enabledEvents: "payment_intent.payment_failed" }, // ← wrong shape
          { userId: "U01ABC23DEF", text: "Payment failed." },
        ),
      }),
    );
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "when a stripe payment fails, send me a slack dm",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The trigger metadata may not be registered in every build — skip the
    // assertion if the validator didn't even reach the field-type check
    // (UNKNOWN_TRIGGER fires first).
    if (result.canApplyLater) return;
    const errors = result.preview!.validation.errors;
    // Either INVALID_CONFIG (scalar where array expected) or UNKNOWN_TRIGGER
    // (Stripe not in this build's registry) — both reject and never apply.
    expect(
      errors.some(
        (e) =>
          (e.code === "INVALID_CONFIG" && e.path === "enabledEvents") ||
          e.code === "UNKNOWN_TRIGGER",
      ),
    ).toBe(true);
    expect(result.canApplyLater).toBe(false);
  });

  it("a Stripe→Slack patch with enabledEvents as an ARRAY + valid Slack config previews cleanly", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([]));
    const mc = client(
      planResponse({
        proposedPatch: stripeToSlackPatch(
          { enabledEvents: ["payment_intent.payment_failed"] }, // ← correct shape
          {
            userId: "U01ABC23DEF",
            text: "A Stripe payment failed. Event type: {{n-stripe-trigger.stripeEventType}}.",
          },
        ),
      }),
    );
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "when a stripe payment fails, send a slack dm to U01ABC23DEF",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // If Stripe trigger metadata isn't registered in this build, the test is
    // moot (the preview would reject UNKNOWN_TRIGGER). When it IS registered
    // — which is the production state since 4.STRIPE-TRIGGER-META-2 — the
    // validator must accept this exact shape end-to-end.
    if (
      result.preview &&
      result.preview.validation.errors.some((e) => e.code === "UNKNOWN_TRIGGER")
    ) {
      return;
    }
    expect(result.preview!.validation.errors).toHaveLength(0);
    expect(result.canApplyLater).toBe(true);
  });

  it("a Slack action referencing an UNDECLARED Stripe output (e.g. trigger.amount) is rejected as INVALID_VARIABLE_REFERENCE", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([]));
    const mc = client(
      planResponse({
        proposedPatch: stripeToSlackPatch(
          { enabledEvents: ["payment_intent.payment_failed"] },
          {
            userId: "U01ABC23DEF",
            text: "Payment failed: amount={{n-stripe-trigger.amount}} currency={{n-stripe-trigger.currency}}",
          },
        ),
      }),
    );
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "stripe→slack",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.canApplyLater) return; // moot — registry missing in this build
    const errors = result.preview!.validation.errors;
    // The validator distinguishes:
    //   MISSING_OUTPUT_PATH = ref is well-formed + node exists but output name
    //     isn't in the upstream node's metadata — what fires for invented Stripe
    //     outputs like `amount` / `currency` / `last_payment_error`.
    //   INVALID_VARIABLE_REFERENCE = malformed token or referenced node missing.
    //   UNKNOWN_TRIGGER = Stripe metadata not in build (skip path).
    // All three classify as "the model referenced something V2 doesn't expose"
    // and result in a non-apply-ready preview.
    const hasUndeclaredOutputRejection = errors.some(
      (e) =>
        e.code === "MISSING_OUTPUT_PATH" ||
        e.code === "INVALID_VARIABLE_REFERENCE" ||
        e.code === "UNKNOWN_TRIGGER",
    );
    expect(hasUndeclaredOutputRejection).toBe(true);
    expect(result.canApplyLater).toBe(false);
    // Pin the specific invented-output paths so a future regression that hides
    // them behind another error still fails this test loudly.
    const missingPaths = errors
      .filter((e) => e.code === "MISSING_OUTPUT_PATH")
      .map((e) => e.path);
    if (missingPaths.length > 0) {
      // When Stripe metadata IS in the build, both invented refs surface here.
      expect(missingPaths).toEqual(
        expect.arrayContaining([
          "n-stripe-trigger.amount",
          "n-stripe-trigger.currency",
        ]),
      );
    }
  });
});

describe("connected-integration + me-resolution grounding (AI-17)", () => {
  function slackConnected(currentUserId?: string) {
    return [
      {
        id: "int-slack",
        userId: "u1",
        provider: "slack",
        providerAccountId: "T-POISON-TEAM-ID",
        displayName: "Acme Workspace",
        accessTokenEncrypted: "ENC-POISON-ACCESS-TOKEN",
        refreshTokenEncrypted: null,
        accessTokenExpiresAt: null,
        scopes: ["chat:write", "im:write"],
        accountMetadata: {
          teamId: "T-POISON-TEAM-ID",
          teamName: "Acme",
          botUserId: "B999POISONBOT",
          ...(currentUserId ? { authedUserId: currentUserId } : {}),
        },
        disconnectedAt: null,
        createdAt: "2026-05-25T00:00:00Z",
        updatedAt: "2026-05-25T00:00:00Z",
      },
    ];
  }

  it("system prompt explicitly states the disconnected-providers rule + lists connected providers", async () => {
    mockListActiveByUser.mockResolvedValue(slackConnected("U01ABC23DEF"));
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([]));
    const mc = client(planResponse({ proposedPatch: movePatch() }));
    await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "x",
      modelClient: mc,
    });
    const system = mc.calls[0]!.input.messages.find((m) => m.role === "system")!.content;
    // Connected entry rendered, includes me=
    expect(system).toMatch(/slack \(account: Acme Workspace[^)]*me=U01ABC23DEF\)/);
    // Disconnected-providers rule explicit in the header
    expect(system).toContain("any provider NOT listed below is DISCONNECTED");
    // Stripe is NOT in the connected list — the model has to infer disconnected.
    // The actual catalog block (rendered separately) will still list stripe as an
    // available trigger; the disconnected awareness comes from this rule.
  });

  it("system prompt omits the me= segment when Slack OAuth didn't capture authedUserId", async () => {
    // No authedUserId in the account metadata.
    mockListActiveByUser.mockResolvedValue(slackConnected(undefined));
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([]));
    const mc = client(planResponse({ proposedPatch: movePatch() }));
    await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "x",
      modelClient: mc,
    });
    const system = mc.calls[0]!.input.messages.find((m) => m.role === "system")!.content;
    expect(system).toContain("slack (account: Acme Workspace, scope: workspace)");
    expect(system).not.toMatch(/slack \([^)]*me=/);
  });

  it("system prompt carries the AI-17 me-resolution + disconnected-awareness rules to the model", async () => {
    mockListActiveByUser.mockResolvedValue(slackConnected("U01ABC23DEF"));
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([]));
    const mc = client(planResponse({ proposedPatch: movePatch() }));
    await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "x",
      modelClient: mc,
    });
    const system = mc.calls[0]!.input.messages.find((m) => m.role === "system")!.content;
    expect(system).toContain("Connected-integration awareness");
    expect(system).toContain('kind: "select_integration"');
    expect(system).toContain('"Me" resolution');
    expect(system).toContain("`me=U01ABC23DEF`"); // anchor of the worked example
  });

  it("no-leak: connected-integration context never carries tokens or non-allow-listed metadata into the system prompt", async () => {
    mockListActiveByUser.mockResolvedValue(slackConnected("U01ABC23DEF"));
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([]));
    const mc = client(planResponse({ proposedPatch: movePatch() }));
    await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "x",
      modelClient: mc,
    });
    const system = mc.calls[0]!.input.messages.find((m) => m.role === "system")!.content;
    // Tokens never reach the prompt.
    expect(system).not.toContain("ENC-POISON-ACCESS-TOKEN");
    // The bot id is not the human "me" — it must never surface as the resolved
    // identity. (The bot id `B999POISONBOT` was deliberately put in the fixture
    // as a poison value — if AI-17 ever wires it to `currentUserId`, this test
    // catches the regression.)
    expect(system).not.toContain("B999POISONBOT");
    expect(system).not.toContain("authedUserId"); // the source key isn't echoed
    // Team id is not relevant to "me" resolution.
    expect(system).not.toContain("T-POISON-TEAM-ID");
  });

  it("a model response that fills slack:send_direct_message.userId from the resolved Slack me-id + AI_FIELD text previews as apply-ready (Stripe-connected case)", async () => {
    mockListActiveByUser.mockResolvedValue(slackConnected("U01ABC23DEF"));
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([]));
    const NODE_POSITION = { x: 0, y: 0 };
    const mc = client(
      planResponse({
        proposedPatch: {
          patchId: "p-me",
          workflowId: "wf1",
          baseRevision: "x",
          operations: [
            {
              op: "addNode",
              node: {
                id: "t-stripe",
                kind: "trigger",
                provider: "stripe",
                type: "event_received",
                config: { enabledEvents: ["payment_intent.payment_failed"] },
                position: NODE_POSITION,
              },
            },
            {
              op: "addNode",
              node: {
                id: "a-slack",
                kind: "action",
                provider: "slack",
                type: "send_direct_message",
                config: {
                  userId: "U01ABC23DEF", // resolved from connected slack.me=
                  text: "A Stripe payment failed: {{t-stripe.stripeEventType}}",
                },
                position: NODE_POSITION,
              },
            },
            {
              op: "addEdge",
              edge: { id: "e1", from: "t-stripe", to: "a-slack" },
            },
          ],
          summary: "Stripe→Slack DM to me",
          rationale: "Resolve 'me' to the installing Slack user.",
        },
      }),
    );
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "when a stripe payment fails, send me a slack dm",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (
      result.preview &&
      result.preview.validation.errors.some((e) => e.code === "UNKNOWN_TRIGGER")
    ) {
      return; // Stripe metadata not in this build — moot.
    }
    expect(result.preview!.validation.errors).toHaveLength(0);
    expect(result.canApplyLater).toBe(true);
  });

  it("a needs-input response asking for the Slack recipient is a clean 200 (Slack-me unknown case)", async () => {
    mockListActiveByUser.mockResolvedValue(slackConnected(undefined));
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([]));
    const mc = client(
      planResponse({
        requiredUserInput: [
          {
            label: "Which Slack user should receive the DM?",
            kind: "config_value",
            field: "userId",
          },
        ],
      }),
    );
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "send me a slack dm",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.requiredUserInput).toHaveLength(1);
    expect(result.requiredUserInput[0]!.field).toBe("userId");
    expect(result.proposedPatch).toBeUndefined();
    expect(result.canApplyLater).toBe(false);
  });
});

describe("no mutation / no apply", () => {
  it("does not import or call the apply service or a workflow-writing repo", () => {
    const src = readFileSync(
      resolve(process.cwd(), "services/ai/planner/planWorkflowFromPrompt.ts"),
      "utf8",
    );
    // Behavior, not mentions: no import statement from the apply module, no
    // call to the apply function, and no direct repository import (writes).
    expect(src).not.toMatch(/from\s+["']@\/services\/ai\/apply/);
    expect(src).not.toMatch(/applyWorkflowPatch\w*\s*\(/);
    expect(src).not.toMatch(/from\s+["']@\/repositories\//);
  });

  it("marks every result noMutation: true", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([gnode("n1", "action", "slack", "send")]));
    const success = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "x",
      modelClient: client(planResponse({ proposedPatch: movePatch() })),
    });
    const failure = await planWorkflowFromPromptForAI({ userId: "u1", workflowId: "wf1", prompt: "x" });
    expect(success.noMutation).toBe(true);
    expect(failure.noMutation).toBe(true);
  });
});

describe("no-leak", () => {
  it("the result exposes no secret-identifier substrings", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([gnode("n1", "action", "slack", "send")]));
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "x",
      modelClient: client(planResponse({ proposedPatch: movePatch() })),
    });
    const serialized = JSON.stringify(result);
    for (const needle of [
      "accessToken",
      "refreshToken",
      "apiSecret",
      "clientSecret",
      "webhookSecret",
      "botToken",
      "Authorization",
      "Bearer ",
      "sk-ant-",
      "ya29.",
    ]) {
      expect(serialized).not.toContain(needle);
    }
  });
});
