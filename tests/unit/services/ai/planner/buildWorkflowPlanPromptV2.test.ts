/**
 * @jest-environment node
 *
 * Slice 4.AI-29 — tests for the structured v2 planner packet.
 *
 * Separated from `buildWorkflowPlanPrompt.test.ts` (already > 800 lines)
 * to keep both files under the project's soft line ceiling. The existing
 * v1 test suite continues to apply to v2 output via the dispatcher's
 * "v2 by default" behavior — those tests cover the substring + position
 * invariants that v2 preserves. This file pins v2-SPECIFIC structure:
 *
 *  - CONTEXT PACKET JSON block at top with promptVersion = workflow-planner-v2.
 *  - Named CRITICAL RULES groups (R1..R8) with no-substitution in R1.
 *  - Full-catalog inclusion (no narrowing) — providersIncluded == providersTotal.
 *  - Attribution: packetVersion = "workflow-planner-v2".
 *  - Env dispatch — `ENABLE_STRUCTURED_PROMPT_PACKET=false` falls back to v1
 *    and yields `packetVersion = "workflow-planner-v1"`.
 *  - No-leak: CONTEXT PACKET JSON never contains raw user request /
 *    catalog payload / connected-integration secrets.
 */
import {
  buildWorkflowPlanPromptV2WithAttribution,
  buildWorkflowPlanPromptWithAttribution,
  buildWorkflowPlanPromptV1WithAttribution,
} from "@/services/ai/planner";
import {
  PLANNER_PACKET_VERSION,
  PLANNER_PACKET_VERSION_V1,
  type WorkflowPlanPromptInput,
} from "@/services/ai/planner/types";
import type {
  ProviderCatalogEntry,
  ProviderCatalogView,
} from "@/services/ai/tools/providerCatalog";

function usableProvider(
  overrides: Partial<ProviderCatalogEntry> = {},
): ProviderCatalogEntry {
  return {
    id: "slack",
    displayName: "Slack",
    capabilities: { oauth: true, webhookTrigger: true, pollingTrigger: false, actions: true },
    isEnabled: true,
    isExperimental: false,
    hasMetadata: true,
    actions: [
      {
        key: "slack:send_channel_message",
        displayName: "Send channel message",
        category: "messaging",
        riskLevel: "low",
        isDestructive: false,
        requiresConfirmation: false,
        requiresIntegration: true,
        configFields: [
          { name: "channel", type: "combobox", required: true },
          { name: "text", type: "textarea", required: true },
        ],
        outputs: [
          { name: "channel", type: "string" },
          { name: "ts", type: "string" },
        ],
      },
    ],
    triggers: [
      {
        key: "slack:new_message",
        displayName: "New message",
        category: "messaging",
        activation: "webhook",
        requiresIntegration: true,
        configFields: [{ name: "channel", type: "combobox", required: true }],
        outputs: [{ name: "text", type: "string" }],
      },
    ],
    ...overrides,
  };
}

function pendingProvider(): ProviderCatalogEntry {
  return {
    id: "pendingco",
    displayName: "PendingCo",
    capabilities: { oauth: false, webhookTrigger: false, pollingTrigger: false, actions: false },
    isEnabled: true,
    isExperimental: false,
    hasMetadata: false,
    actions: [],
    triggers: [],
  };
}

function makeInput(
  overrides: Partial<WorkflowPlanPromptInput> = {},
): WorkflowPlanPromptInput {
  const catalog: ProviderCatalogView = {
    providers: [usableProvider(), pendingProvider()],
  };
  return {
    userRequest: "Send a Slack DM when a new Slack message arrives",
    catalog,
    connectedIntegrations: [],
    ...overrides,
  };
}

describe("AI-29 — packet version constants", () => {
  it("PLANNER_PACKET_VERSION is workflow-planner-v2 (the current default)", () => {
    expect(PLANNER_PACKET_VERSION).toBe("workflow-planner-v2");
  });

  it("PLANNER_PACKET_VERSION_V1 is workflow-planner-v1 (preserved for rollback)", () => {
    expect(PLANNER_PACKET_VERSION_V1).toBe("workflow-planner-v1");
  });
});

describe("AI-29 — v2 builds the CONTEXT PACKET JSON envelope", () => {
  it("renders a fenced JSON block with task / promptVersion / mode / counts / constraint flags", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(makeInput());
    const system = messages[0]!.content;

    expect(system).toContain("Context packet (machine-readable summary");
    expect(system).toMatch(/```json\n[\s\S]*?\n```/);
    expect(system).toContain('"task": "workflow_plan"');
    expect(system).toContain('"promptVersion": "workflow-planner-v2"');
    expect(system).toContain('"mode": "create"');
    expect(system).toMatch(/"nodeCount":\s*0/);
    expect(system).toMatch(/"edgeCount":\s*0/);
    expect(system).toContain('"noSubstitution": true');
    expect(system).toContain('"noRequiredFieldGuessing": true');
    expect(system).toContain('"noMutationDuringPlan": true');
    expect(system).toContain('"nullPatchWhenBlocked": true');
    expect(system).toContain('"outputNamesMustBeDeclared": true');
    expect(system).toContain('"neverInventCredentials": true');
  });

  it("sets mode=edit when currentGraph has nodes", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({
        currentGraph: {
          nodes: [{ id: "n1", kind: "trigger", provider: "native", type: "manual.run" }],
          edges: [],
        },
      }),
    );
    expect(messages[0]!.content).toContain('"mode": "edit"');
  });

  it("includes ALL usable providers in providersIncluded (no narrowing in AI-29)", () => {
    // 1 usable provider + 1 pending — only the usable one is rendered or counted.
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(makeInput());
    const system = messages[0]!.content;
    expect(system).toMatch(/"providersIncluded":\s*1/);
    expect(system).toMatch(/"providersTotal":\s*1/);
  });

  it("reflects connectedIntegrationCount from the input list", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({
        connectedIntegrations: [
          { provider: "slack", connected: true, accountLabel: "Acme", accountScope: null, scopeCount: 0 },
          { provider: "gmail", connected: true, accountLabel: "me@acme.com", accountScope: null, scopeCount: 0 },
        ],
      }),
    );
    expect(messages[0]!.content).toMatch(/"connectedIntegrationCount":\s*2/);
  });

  it("points the model at the user message that follows", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(makeInput());
    expect(messages[0]!.content).toContain(
      "The user's request is in the user message that follows this system message.",
    );
  });
});

describe("AI-29 — v2 organizes rules into R1..R8 named groups", () => {
  it("renders the CRITICAL RULES header and all 8 group titles", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(makeInput());
    const system = messages[0]!.content;
    expect(system).toContain(
      "CRITICAL RULES (non-negotiable; violations are rejected downstream):",
    );
    expect(system).toContain("R1 — SAFETY-CRITICAL (catalog-only use + no substitution)");
    expect(system).toContain("R2 — CURRENT CANVAS GROUNDING");
    expect(system).toContain("R3 — CONFIG GROUNDING (keys, shapes, required-fill, label vs id)");
    expect(system).toContain("R4 — VARIABLE REFERENCES MUST USE DECLARED OUTPUTS");
    expect(system).toContain("R5 — CONNECTED INTEGRATIONS (awareness + me-resolution)");
    expect(system).toContain("R6 — OUTPUT FORMAT (strict JSON via tool-use)");
    expect(system).toContain("R7 — UNKNOWN VALUES (AI_FIELD / requiredUserInput / null-over-partial)");
    expect(system).toContain("R8 — SAFETY HYGIENE (no secrets, low-risk bias, unsupported surfaced)");
  });

  it("places the no-substitution rule in R1 — the FIRST rule group (prominence)", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(makeInput());
    const system = messages[0]!.content;
    const r1Index = system.indexOf("R1 — SAFETY-CRITICAL");
    const r2Index = system.indexOf("R2 — CURRENT CANVAS GROUNDING");
    const noSubIndex = system.indexOf("NEVER substitute a different provider");
    expect(r1Index).toBeGreaterThan(0);
    expect(r2Index).toBeGreaterThan(r1Index);
    expect(noSubIndex).toBeGreaterThan(r1Index);
    expect(noSubIndex).toBeLessThan(r2Index);
  });

  it("preserves the required-field discipline text inside R3 (AI-22 wording intact)", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(makeInput());
    const system = messages[0]!.content;
    const r3Index = system.indexOf("R3 — CONFIG GROUNDING");
    const reqDisciplineIndex = system.indexOf("Required-field discipline (Slice 4.AI-22)");
    expect(r3Index).toBeGreaterThan(0);
    expect(reqDisciplineIndex).toBeGreaterThan(r3Index);
    expect(system).toContain("NEVER silently default");
    expect(system).toContain("(a)"); // the allowlist of safe-fill sources
    expect(system).toContain("(e)");
  });

  it("preserves the display-label-is-not-id rule inside R3", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(makeInput());
    expect(messages[0]!.content).toContain(
      "NEVER treat a display label as an opaque id",
    );
  });

  it("preserves the variable-references constraint inside R4", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(makeInput());
    expect(messages[0]!.content).toContain(
      "Variable references `{{nodeId.field}}`",
    );
  });

  it("preserves the me-resolution rule inside R5", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(makeInput());
    const system = messages[0]!.content;
    expect(system).toContain('"Me" resolution');
    expect(system).toContain("me=U01ABC23DEF");
  });
});

describe("AI-29 — v2 attribution", () => {
  it("packetVersion is workflow-planner-v2", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(makeInput());
    expect(attribution.packetVersion).toBe("workflow-planner-v2");
  });

  it("character counts sum bounded by system message length", () => {
    const { messages, attribution } = buildWorkflowPlanPromptV2WithAttribution(makeInput());
    const systemLen = messages[0]!.content.length;
    const dynamicChars =
      attribution.catalogChars +
      attribution.rulesChars +
      attribution.connectedIntegrationsChars +
      attribution.currentCanvasChars;
    expect(dynamicChars).toBeGreaterThan(0);
    expect(dynamicChars).toBeLessThanOrEqual(systemLen);
  });

  it("catalog action/trigger/field/output counts match v1 (catalog unchanged in AI-29)", () => {
    const input = makeInput();
    const v1 = buildWorkflowPlanPromptV1WithAttribution(input);
    const v2 = buildWorkflowPlanPromptV2WithAttribution(input);
    expect(v2.attribution.catalogProviderCount).toBe(v1.attribution.catalogProviderCount);
    expect(v2.attribution.catalogActionCount).toBe(v1.attribution.catalogActionCount);
    expect(v2.attribution.catalogTriggerCount).toBe(v1.attribution.catalogTriggerCount);
    expect(v2.attribution.catalogFieldCount).toBe(v1.attribution.catalogFieldCount);
    expect(v2.attribution.catalogOutputFieldCount).toBe(v1.attribution.catalogOutputFieldCount);
  });

  it("canvas + connected counts match v1 (same renderers)", () => {
    const input = makeInput({
      connectedIntegrations: [
        { provider: "slack", connected: true, accountLabel: "Acme", accountScope: null, scopeCount: 0 },
      ],
      currentGraph: {
        nodes: [{ id: "n1", kind: "trigger", provider: "native", type: "manual.run" }],
        edges: [],
      },
    });
    const v1 = buildWorkflowPlanPromptV1WithAttribution(input);
    const v2 = buildWorkflowPlanPromptV2WithAttribution(input);
    expect(v2.attribution.connectedIntegrationCount).toBe(v1.attribution.connectedIntegrationCount);
    expect(v2.attribution.currentCanvasNodeCount).toBe(v1.attribution.currentCanvasNodeCount);
    expect(v2.attribution.currentCanvasEdgeCount).toBe(v1.attribution.currentCanvasEdgeCount);
  });

  it("is deterministic", () => {
    const a = buildWorkflowPlanPromptV2WithAttribution(makeInput());
    const b = buildWorkflowPlanPromptV2WithAttribution(makeInput());
    expect(a.messages).toEqual(b.messages);
    expect(a.attribution).toEqual(b.attribution);
  });
});

describe("AI-29 — env-flag dispatch", () => {
  const ENV_KEY = "ENABLE_STRUCTURED_PROMPT_PACKET";
  let originalEnv: string | undefined;
  beforeEach(() => {
    originalEnv = process.env[ENV_KEY];
  });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  it("default (env unset) → v2", () => {
    delete process.env[ENV_KEY];
    const { attribution } = buildWorkflowPlanPromptWithAttribution(makeInput());
    expect(attribution.packetVersion).toBe("workflow-planner-v2");
  });

  it("env=true → v2", () => {
    process.env[ENV_KEY] = "true";
    const { attribution } = buildWorkflowPlanPromptWithAttribution(makeInput());
    expect(attribution.packetVersion).toBe("workflow-planner-v2");
  });

  it("env=false → v1 (rollback)", () => {
    process.env[ENV_KEY] = "false";
    const { attribution } = buildWorkflowPlanPromptWithAttribution(makeInput());
    expect(attribution.packetVersion).toBe("workflow-planner-v1");
  });

  it("env=false renders prose v1 prompt (no CONTEXT PACKET JSON block)", () => {
    process.env[ENV_KEY] = "false";
    const { messages } = buildWorkflowPlanPromptWithAttribution(makeInput());
    expect(messages[0]!.content).not.toContain(
      "Context packet (machine-readable summary",
    );
    expect(messages[0]!.content).not.toContain('"promptVersion": "workflow-planner-v2"');
  });

  it("env=invalid value (any non-'false') → v2", () => {
    process.env[ENV_KEY] = "0"; // not the literal string "false"
    const { attribution } = buildWorkflowPlanPromptWithAttribution(makeInput());
    expect(attribution.packetVersion).toBe("workflow-planner-v2");
  });
});

describe("AI-29 — v2 no-leak", () => {
  it("CONTEXT PACKET JSON never embeds raw user request", () => {
    const userRequest =
      "send a Slack DM with my access_token=ya29.LEAKED-IN-PROMPT and Bearer SHOULD_NOT_LEAK";
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest }),
    );
    const system = messages[0]!.content;
    // The user request is in the SECOND message (user role). It must not
    // appear inside the SYSTEM message's JSON packet.
    expect(system).not.toContain("access_token=ya29.LEAKED-IN-PROMPT");
    expect(system).not.toContain("ya29.");
    expect(system).not.toContain("SHOULD_NOT_LEAK");
    // But the user message DOES carry it verbatim — that's the contract.
    expect(messages[1]!.content).toContain("ya29.LEAKED-IN-PROMPT");
  });

  it("CONTEXT PACKET JSON never embeds integration account labels or me values", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({
        connectedIntegrations: [
          {
            provider: "slack",
            connected: true,
            accountLabel: "Acme Workspace SECRET-COMPANY-NAME",
            accountScope: null,
            scopeCount: 0,
            currentUserId: "U01-SECRET-USER",
          },
        ],
      }),
    );
    const system = messages[0]!.content;
    // The JSON packet has just the COUNT (1), not the account label.
    const jsonBlockMatch = system.match(/```json\n([\s\S]*?)\n```/);
    expect(jsonBlockMatch).not.toBeNull();
    const jsonBlock = jsonBlockMatch![1]!;
    expect(jsonBlock).not.toContain("SECRET-COMPANY-NAME");
    expect(jsonBlock).not.toContain("U01-SECRET-USER");
    expect(jsonBlock).toMatch(/"connectedIntegrationCount":\s*1/);
    // The detailed connected-integrations SECTION (further down) renders
    // the account label + me-id — that's the v1-shipped UX, unchanged.
    expect(system).toContain("Acme Workspace SECRET-COMPANY-NAME");
    expect(system).toContain("me=U01-SECRET-USER");
  });

  it("CONTEXT PACKET JSON never embeds canvas node ids or provider:type pairs", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({
        currentGraph: {
          nodes: [
            { id: "SECRET-NODE-ID", kind: "trigger", provider: "stripe", type: "event_received" },
          ],
          edges: [],
        },
      }),
    );
    const jsonBlockMatch = messages[0]!.content.match(/```json\n([\s\S]*?)\n```/);
    expect(jsonBlockMatch).not.toBeNull();
    const jsonBlock = jsonBlockMatch![1]!;
    expect(jsonBlock).not.toContain("SECRET-NODE-ID");
    expect(jsonBlock).not.toContain("event_received");
    expect(jsonBlock).toMatch(/"nodeCount":\s*1/);
  });

  it("no secret-shaped substrings anywhere in v2 output", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({
        connectedIntegrations: [
          { provider: "gmail", connected: true, accountLabel: "me@example.com", accountScope: null, scopeCount: 0 },
        ],
      }),
    );
    const joined = messages.map((m) => m.content).join("\n");
    const forbidden = [
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
    ];
    for (const needle of forbidden) {
      expect(joined).not.toContain(needle);
    }
  });
});

describe("AI-29 — v2 preserves v1 grounding sections", () => {
  it("includes the v1 catalog renderer output verbatim (same per-line shape)", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(makeInput());
    const system = messages[0]!.content;
    // The renderCatalog primitive is shared with v1.
    expect(system).toContain("Slack (id: slack)");
    expect(system).toContain("slack:send_channel_message");
    expect(system).toContain("config fields:");
    expect(system).toContain("outputs: channel (string), ts (string)");
  });

  it("includes the v1 current-canvas renderer output verbatim", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({
        currentGraph: {
          nodes: [{ id: "trig-1", kind: "trigger", provider: "native", type: "manual.run" }],
          edges: [],
        },
      }),
    );
    const system = messages[0]!.content;
    expect(system).toContain("Current workflow on the canvas (authoritative");
    expect(system).toContain("- trig-1: trigger native:manual.run");
  });

  it("includes the v1 PATCH_SHAPE_GUIDE + VALUE_SHAPE_RULES + JSON_OUTPUT_RULES", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(makeInput());
    const system = messages[0]!.content;
    expect(system).toContain("WorkflowPatch shape (the value of proposedPatch)");
    expect(system).toContain("Config value shape per renderer type");
    expect(system).toContain("OUTPUT FORMAT — follow exactly:");
  });
});
