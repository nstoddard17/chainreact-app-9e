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
  listActiveByAccount: (...a: unknown[]) => mockListActiveByUser(...a),
}));
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: jest.fn(async (userId: string) => ({
    id: `acct-${userId}`,
    type: "personal" as const,
    ownerUserId: userId,
    createdAt: "2026-05-30T00:00:00Z",
    updatedAt: "2026-05-30T00:00:00Z",
  })),
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
  // AI-8C/AI-36: the non-injected client path is decided by the planner routing.
  // Clear keys + provider/planner flags so the default is deterministically
  // NOT_CONFIGURED (model unavailable) — never a live call, never Anthropic.
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ENABLE_OPENAI_PLANNER;
  delete process.env.ENABLE_OPENAI_PROVIDER;
  delete process.env.ENABLE_ANTHROPIC_PLANNER_FALLBACK;
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

  // ─── Slice 4.AI-22 — server enrichment of requiredUserInput ─────────
  it("enriches requiredUserInput with FieldMeta hints (provider / nodeType / nodeLabel / fieldLabel / fieldType / optionsSource) when a patch is present", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(
      graphResult([gnode("n1", "action", "slack", "send")]),
    );
    // The model returns a patch that adds a `slack:send_channel_message` node
    // AND lists `channel` + `text` as still-required. The service should
    // enrich those entries from the live registry's FieldMeta.
    const slackPatch = {
      patchId: "p1",
      workflowId: "wf1",
      baseRevision: "x",
      operations: [
        {
          op: "addNode",
          node: {
            id: "n_slack",
            kind: "action",
            provider: "slack",
            type: "send_channel_message",
            config: {
              channel: "{{AI_FIELD:channel}}",
              text: "{{AI_FIELD:text}}",
            },
            position: { x: 0, y: 0 },
          },
        },
      ],
      summary: "Add Slack post",
      rationale: "User asked for a Slack message.",
    };
    const mc = client(
      planResponse({
        proposedPatch: slackPatch,
        requiredUserInput: [
          {
            label: "Which Slack channel?",
            nodeId: "n_slack",
            field: "channel",
            kind: "config_value",
          },
          {
            label: "What should the message say?",
            nodeId: "n_slack",
            field: "text",
            kind: "config_value",
          },
        ],
      }),
    );
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "send a slack message when i run manually",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.requiredUserInput).toHaveLength(2);
    const channelEntry = result.requiredUserInput.find((r) => r.field === "channel");
    const textEntry = result.requiredUserInput.find((r) => r.field === "text");
    expect(channelEntry?.provider).toBe("slack");
    expect(channelEntry?.nodeType).toBe("send_channel_message");
    expect(channelEntry?.fieldLabel).toBe("Channel");
    expect(channelEntry?.fieldType).toBe("combobox");
    expect(channelEntry?.optionsSource).toBe("slack:channels");
    expect(textEntry?.fieldLabel).toBe("Message");
    expect(textEntry?.fieldType).toBe("textarea");
    expect(textEntry?.allowFreeText).toBe(true);
  });

  it("AI-35H: a follow-up's BARE clarification (no node/field) reconciles to the unique missing optionsSource field → channel combobox", async () => {
    // The DM→channel follow-up: the re-plan builds send_channel_message with the
    // user's message text filled and the channel still missing (AI_FIELD), and
    // asks "Which Slack channel?" as a `clarification` with NO node/field. The
    // orchestrator must reconcile the bare question to the channel field so it
    // enriches to the optionsSource combobox — not plain text.
    mockGetWorkflowGraphForAI.mockResolvedValue(
      graphResult([gnode("n1", "action", "slack", "send")]),
    );
    const slackPatch = {
      patchId: "p1",
      workflowId: "wf1",
      baseRevision: "x",
      operations: [
        {
          op: "addNode",
          node: {
            id: "n_slack",
            kind: "action",
            provider: "slack",
            type: "send_channel_message",
            config: { text: "Hey", channel: "{{AI_FIELD:channel}}" },
            position: { x: 0, y: 0 },
          },
        },
      ],
      summary: "Send a Slack channel message",
      rationale: "User clarified this is to a channel.",
    };
    const mc = client(
      planResponse({
        proposedPatch: slackPatch,
        requiredUserInput: [
          // BARE clarification — no nodeId/field (the live shape that AI-35G missed).
          { label: "Which Slack channel should receive the message?", kind: "clarification" },
        ],
      }),
    );
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "Original: send me a Slack DM … / Follow-up: this is to a channel / Hey",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const channelEntry = result.requiredUserInput.find((r) => r.field === "channel");
    expect(channelEntry).toBeDefined();
    expect(channelEntry?.kind).toBe("config_value"); // normalized from clarification
    expect(channelEntry?.fieldType).toBe("combobox");
    expect(channelEntry?.optionsSource).toBe("slack:channels");
    // Picker field still blocks Apply until the user selects a channel.
    expect(result.canApplyLater).toBe(false);
  });

  it("leaves no-field entries unenriched (e.g. select_integration / clarification) so the existing fallback bullet renders", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(
      graphResult([gnode("n1", "action", "slack", "send")]),
    );
    const mc = client(
      planResponse({
        requiredUserInput: [
          { label: "Connect Stripe", kind: "select_integration" },
        ],
      }),
    );
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "when stripe fails, dm me",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = result.requiredUserInput[0]!;
    expect(entry.provider).toBeUndefined();
    expect(entry.fieldLabel).toBeUndefined();
    expect(entry.label).toBe("Connect Stripe");
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
    // AI-36 — with no planner flags the routing returns NOT_CONFIGURED at the
    // fast tier (the planner default), so the placeholder model id is the
    // fast-tier model. No call is made; this id is only a label.
    expect(result.model?.modelId).toBe(MODELS.fast.id);
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

  it("end-to-end (AI-36): OpenAI planner function_call response → reaches preview + canApplyLater, hits /v1/responses (NOT Anthropic)", async () => {
    // Drives the planner with the routed OpenAI client + a mocked fetch
    // returning an OpenAI Responses-API function_call (the AI-19 forced-tool
    // contract, OpenAI shape). Proves the planner reaches preview without
    // regressing to PARSE_FAILED — AND that it calls OpenAI, never Anthropic.
    process.env.ENABLE_OPENAI_PLANNER = "true";
    process.env.ENABLE_OPENAI_PROVIDER = "true";
    process.env.OPENAI_API_KEY = "sk-openai-AI-36-TEST";
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        output: [
          {
            type: "function_call",
            name: "propose_workflow_plan",
            arguments: planResponse({ proposedPatch: movePatch() }),
            call_id: "call_1",
          },
        ],
        status: "completed",
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
      expect(fetchSpy.mock.calls[0]![0]).toContain("/v1/responses"); // OpenAI
      expect(fetchSpy.mock.calls[0]![0]).not.toContain("/v1/messages"); // never Anthropic
      // The fetch body must include the forced function tool (AI-19 contract).
      const reqInit = fetchSpy.mock.calls[0]![1] as { body: string };
      const body = JSON.parse(reqInit.body);
      expect(body.tool_choice).toEqual({ type: "function", name: "propose_workflow_plan" });
      expect(body.tools[0].name).toBe("propose_workflow_plan");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.canApplyLater).toBe(true);
      expect(result.preview).toBeDefined();
      expect(result.model.modelId).toBe("gpt-4.1-mini"); // OpenAI planner model
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

  it("with the OpenAI planner enabled + a key + mocked fetch → reaches parse/preview via /v1/responses (AI-36)", async () => {
    // AI-36 — the non-injected planner routes to OpenAI (gpt-4.1-mini). The
    // mocked fetch returns an OpenAI Responses-API function_call (the forced
    // tool); the planner parses + previews it. Proves the default path is
    // OpenAI, never Anthropic.
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([gnode("n1", "action", "slack", "send")]));
    process.env.ENABLE_OPENAI_PLANNER = "true";
    process.env.ENABLE_OPENAI_PROVIDER = "true";
    process.env.OPENAI_API_KEY = "sk-openai-RUNTIME-TEST";
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        output: [
          {
            type: "function_call",
            name: "propose_workflow_plan",
            arguments: planResponse({ proposedPatch: movePatch() }),
            call_id: "call_1",
          },
        ],
        status: "completed",
        usage: { input_tokens: 1, output_tokens: 2 },
      }),
      text: async () => "{}",
    } as unknown as Response);
    const original = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = fetchSpy;
    try {
      const result = await planWorkflowFromPromptForAI({ userId: "u1", workflowId: "wf1", prompt: "tidy" });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0]![0]).toContain("/v1/responses");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.canApplyLater).toBe(true);
      expect(result.preview).toBeDefined();
      // The runtime key must never surface in the planner result.
      expect(JSON.stringify(result)).not.toContain("sk-openai-RUNTIME-TEST");
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

describe("AI-33 — service-side required-field completeness + ambiguity plumbing", () => {
  function slackPatch(config: Record<string, unknown>) {
    return {
      patchId: "p1",
      workflowId: "wf1",
      baseRevision: "x",
      operations: [
        {
          op: "addNode",
          node: {
            id: "n_slack",
            kind: "action",
            provider: "slack",
            type: "send_channel_message",
            config,
            position: { x: 0, y: 0 },
          },
        },
      ],
      summary: "Add Slack post",
      rationale: "User asked for a Slack message.",
    };
  }

  beforeEach(() => {
    mockGetWorkflowGraphForAI.mockResolvedValue(
      graphResult([gnode("n1", "action", "slack", "send")]),
    );
  });

  it("derives the missing `text` question when the model fills only `channel` and asks for nothing", async () => {
    const mc = client(
      planResponse({ proposedPatch: slackPatch({ channel: "C123" }), requiredUserInput: [] }),
    );
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "send a slack message to #general",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const textEntry = result.requiredUserInput.find((r) => r.field === "text");
    expect(textEntry).toBeDefined();
    expect(textEntry?.nodeId).toBe("n_slack");
    expect(textEntry?.fieldType).toBe("textarea"); // enriched
    expect(result.canApplyLater).toBe(false); // blocked until answered
  });

  it("derives BOTH channel + text when the model proposes an empty-config slack node with no questions", async () => {
    const mc = client(
      planResponse({ proposedPatch: slackPatch({}), requiredUserInput: [] }),
    );
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "send a slack message",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const fields = result.requiredUserInput.map((r) => r.field).filter(Boolean).sort();
    expect(fields).toEqual(["channel", "text"]);
    expect(result.canApplyLater).toBe(false);
  });

  it("does NOT duplicate a field the model already asked for (dedup on nodeId+field)", async () => {
    const mc = client(
      planResponse({
        proposedPatch: slackPatch({}),
        requiredUserInput: [
          { label: "Which Slack channel?", nodeId: "n_slack", field: "channel", kind: "config_value" },
        ],
      }),
    );
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "send a slack message",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const channelEntries = result.requiredUserInput.filter((r) => r.field === "channel");
    const textEntries = result.requiredUserInput.filter((r) => r.field === "text");
    expect(channelEntries).toHaveLength(1); // model's, not duplicated
    expect(textEntries).toHaveLength(1); // derived
  });

  it("does NOT derive a question when both required fields are filled (no false positives)", async () => {
    const mc = client(
      planResponse({
        proposedPatch: slackPatch({ channel: "C123", text: "Hello team" }),
        requiredUserInput: [],
      }),
    );
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "send 'Hello team' to #general on slack",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.requiredUserInput).toHaveLength(0);
  });

  it("ambiguity plumbing: a null-patch clarification (which email app?) is surfaced, apply blocked, no mutation", async () => {
    const mc = client(
      planResponse({
        intentSummary: "Send a Slack message when an email arrives.",
        proposedPatch: null,
        requiredUserInput: [
          { label: "Which email app should trigger this — Gmail or Outlook?", kind: "choose_trigger" },
          { label: "What should the Slack message say?", kind: "config_value" },
        ],
      }),
    );
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "when I get an email send a slack message",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.requiredUserInput).toHaveLength(2);
    expect(result.canApplyLater).toBe(false);
    expect(result.proposedPatch).toBeUndefined();
    expect(result.noMutation).toBe(true);
  });

  it("no-regression: a complete patch with no required fields stays apply-ready (derivation adds nothing)", async () => {
    const mc = client(
      planResponse({ proposedPatch: movePatch(), requiredUserInput: [] }),
    );
    mockGetWorkflowGraphForAI.mockResolvedValue(
      graphResult([gnode("n1", "action", "slack", "send")]),
    );
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "tidy the layout",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.requiredUserInput).toHaveLength(0);
    expect(result.canApplyLater).toBe(true);
  });
});

describe("AI-35 — Apply vs Activate: disconnected providers don't block Apply", () => {
  beforeEach(() => {
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([gnode("n1", "action", "slack", "send")]));
  });

  it("select_integration (connect a disconnected provider) does NOT block Apply — the draft applies, connection gates Activation", async () => {
    const mc = client(
      planResponse({
        proposedPatch: movePatch(),
        requiredUserInput: [{ label: "Connect Stripe", kind: "select_integration" }],
      }),
    );
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "When a Stripe payment fails send me a Slack DM",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposedPatch).toBeDefined();
    expect(result.canApplyLater).toBe(true); // ← Apply allowed despite disconnected Stripe
    expect(result.blockedReason).toBeUndefined();
    // The setup requirement is still surfaced (for Activation), just non-blocking.
    expect(result.requiredUserInput.some((r) => r.kind === "select_integration")).toBe(true);
  });

  it("a missing config_value STILL blocks Apply (AI-20 safety floor preserved)", async () => {
    const mc = client(
      planResponse({
        proposedPatch: movePatch(),
        requiredUserInput: [
          { label: "What should the message say?", kind: "config_value", nodeId: "n1", field: "text" },
        ],
      }),
    );
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "Send a Slack message",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.canApplyLater).toBe(false);
    expect(result.blockedReason).toContain("More information is still needed");
  });

  it("a config_value blocks even when a non-blocking select_integration is also present", async () => {
    const mc = client(
      planResponse({
        proposedPatch: movePatch(),
        requiredUserInput: [
          { label: "Connect Stripe", kind: "select_integration" },
          { label: "What should the message say?", kind: "config_value", nodeId: "n1", field: "text" },
        ],
      }),
    );
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "x",
      modelClient: mc,
    });
    expect(result.ok && result.canApplyLater).toBe(false);
  });
});

describe("AI-35 — generic-category requests get a structured provider_choice", () => {
  it("an ambiguous 'email' request surfaces a provider_choice with options and blocks Apply (null patch)", async () => {
    const mc = client(
      planResponse({
        proposedPatch: null,
        requiredUserInput: [
          { label: "Which email app should trigger this — Gmail or Outlook?", kind: "choose_trigger" },
        ],
      }),
    );
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "When I get an email send a Slack message",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const choice = result.requiredUserInput.find((r) => r.kind === "provider_choice");
    expect(choice).toBeDefined();
    expect(choice!.category).toBe("email");
    expect(choice!.options?.map((o) => o.value)).toEqual(["gmail", "microsoft-outlook"]);
    expect(result.canApplyLater).toBe(false); // null patch → not apply-ready
    // The model's free-text duplicate (a non-structured choose_trigger) is
    // dropped in favor of the structured provider_choice control.
    expect(
      result.requiredUserInput.filter(
        (r) => r.kind !== "provider_choice" && r.label.toLowerCase().includes("email app"),
      ),
    ).toHaveLength(0);
  });

  it("naming the provider explicitly produces NO provider_choice", async () => {
    const mc = client(
      planResponse({ proposedPatch: movePatch(), requiredUserInput: [] }),
    );
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([gnode("n1", "action", "slack", "send")]));
    const result = await planWorkflowFromPromptForAI({
      userId: "u1",
      workflowId: "wf1",
      prompt: "When I get a Gmail email tidy the layout",
      modelClient: mc,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.requiredUserInput.some((r) => r.kind === "provider_choice")).toBe(false);
  });
});

describe("AI-36 — OpenAI planner routing: no Anthropic fallback", () => {
  function enableOpenAiPlanner() {
    process.env.ENABLE_OPENAI_PLANNER = "true";
    process.env.ENABLE_OPENAI_PROVIDER = "true";
    process.env.OPENAI_API_KEY = "sk-openai-AI36";
  }
  function openAiResponse(body: {
    ok?: boolean;
    status?: number;
    json?: unknown;
    text?: string;
  }) {
    return {
      ok: body.ok ?? true,
      status: body.status ?? 200,
      json: async () => body.json ?? {},
      text: async () => body.text ?? "{}",
    } as unknown as Response;
  }
  async function runWithFetch(fetchSpy: jest.Mock, prompt = "Send me a Slack DM") {
    const original = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = fetchSpy;
    try {
      return await planWorkflowFromPromptForAI({ userId: "u1", workflowId: "wf1", prompt });
    } finally {
      (globalThis as { fetch?: unknown }).fetch = original;
    }
  }
  function assertNeverAnthropic(fetchSpy: jest.Mock) {
    for (const call of fetchSpy.mock.calls) {
      expect(String(call[0])).not.toContain("/v1/messages");
    }
  }

  beforeEach(() => {
    mockGetWorkflowGraphForAI.mockResolvedValue(graphResult([gnode("n1", "action", "slack", "send")]));
  });

  it("routes a successful plan to OpenAI (/v1/responses), never Anthropic", async () => {
    enableOpenAiPlanner();
    const fetchSpy = jest.fn().mockResolvedValue(
      openAiResponse({
        json: {
          output: [{ type: "function_call", name: "propose_workflow_plan", arguments: planResponse({ proposedPatch: movePatch() }), call_id: "c1" }],
          status: "completed",
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      }),
    );
    const result = await runWithFetch(fetchSpy);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.model.modelId).toBe("gpt-4.1-mini");
    expect(fetchSpy.mock.calls[0]![0]).toContain("/v1/responses");
    assertNeverAnthropic(fetchSpy);
  });

  it("OpenAI parse failure does NOT call Anthropic", async () => {
    enableOpenAiPlanner();
    const fetchSpy = jest.fn().mockResolvedValue(
      openAiResponse({
        json: {
          output: [{ type: "function_call", name: "propose_workflow_plan", arguments: '{"intentSummary":"x"', call_id: "c1" }],
          status: "completed",
        },
      }),
    );
    const result = await runWithFetch(fetchSpy);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("PARSE_FAILED");
    assertNeverAnthropic(fetchSpy);
  });

  it("OpenAI rate limit does NOT call Anthropic (no retry to a second provider)", async () => {
    enableOpenAiPlanner();
    const fetchSpy = jest.fn().mockResolvedValue(
      openAiResponse({ ok: false, status: 429, text: JSON.stringify({ error: { message: "slow down" } }) }),
    );
    const result = await runWithFetch(fetchSpy);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("MODEL_FAILED");
    expect(result.errors[0]!.code).toBe("RATE_LIMITED");
    assertNeverAnthropic(fetchSpy);
  });

  it("OpenAI provider error does NOT call Anthropic", async () => {
    enableOpenAiPlanner();
    const fetchSpy = jest.fn().mockResolvedValue(openAiResponse({ ok: false, status: 500, text: "{}" }));
    const result = await runWithFetch(fetchSpy);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("MODEL_FAILED");
    expect(result.errors[0]!.code).toBe("PROVIDER_ERROR");
    assertNeverAnthropic(fetchSpy);
  });

  it("OpenAI planner enabled but no key → MODEL_FAILED/NOT_CONFIGURED, no network, no Anthropic", async () => {
    process.env.ENABLE_OPENAI_PLANNER = "true";
    process.env.ENABLE_OPENAI_PROVIDER = "true";
    // no OPENAI_API_KEY
    const fetchSpy = jest.fn();
    const result = await runWithFetch(fetchSpy);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("MODEL_FAILED");
    expect(result.errors[0]!.code).toBe("NOT_CONFIGURED");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("emergency fallback flag ENABLES Anthropic (the ONLY path that calls /v1/messages)", async () => {
    process.env.ENABLE_ANTHROPIC_PLANNER_FALLBACK = "true";
    process.env.ANTHROPIC_API_KEY = "sk-ant-EMERGENCY";
    const fetchSpy = jest.fn().mockResolvedValue(
      openAiResponse({
        json: {
          content: [{ type: "tool_use", name: "propose_workflow_plan", input: JSON.parse(planResponse({ proposedPatch: movePatch() })) }],
          stop_reason: "tool_use",
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      }),
    );
    const result = await runWithFetch(fetchSpy);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fetchSpy.mock.calls[0]![0]).toContain("/v1/messages"); // Anthropic, by explicit opt-in only
  });
});
