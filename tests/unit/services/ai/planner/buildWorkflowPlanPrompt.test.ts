/**
 * @jest-environment node
 *
 * Tests for services/ai/planner/buildWorkflowPlanPrompt.ts (Slice 4.AI-8A).
 *
 * The builder is PURE: given the AI-2 catalog + connected integrations, it
 * produces grounded system+user messages. These pin grounding (only catalog
 * providers/actions appear, pending providers absent, new providers appear
 * automatically), the safety constraints, the future-template language, the
 * connected-integration summary, and the no-leak guarantee.
 */
import {
  buildWorkflowPlanPrompt,
  JSON_OUTPUT_RULES,
  PATCH_SHAPE_GUIDE,
  PLANNER_CONSTRAINTS,
  TEMPLATE_FUTURE_NOTE,
} from "@/services/ai/planner/buildWorkflowPlanPrompt";
import { SUPPORTED_OPERATION_KINDS } from "@/services/workflows/patch";
import type { WorkflowPlanPromptInput } from "@/services/ai/planner/types";
import type {
  ProviderCatalogEntry,
  ProviderCatalogView,
} from "@/services/ai/tools/providerCatalog";
import type { ConnectedIntegrationView } from "@/services/ai/tools/integrations";

function usableProvider(): ProviderCatalogEntry {
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
      },
      {
        key: "slack:delete_message",
        displayName: "Delete message",
        category: "messaging",
        riskLevel: "high",
        isDestructive: true,
        requiresConfirmation: true,
        requiresIntegration: true,
        configFields: [
          { name: "channel", type: "combobox", required: true },
          { name: "ts", type: "text", required: true },
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
        configFields: [
          { name: "channel", type: "combobox", required: true },
        ],
      },
    ],
  };
}

/** A registered-but-pending provider: no metadata → no usable actions/triggers. */
function pendingProvider(): ProviderCatalogEntry {
  return {
    id: "pendingco",
    displayName: "PendingCo",
    capabilities: { oauth: true, webhookTrigger: false, pollingTrigger: false, actions: false },
    isEnabled: true,
    isExperimental: true,
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
    userRequest: "Post a Slack message when a new message arrives",
    catalog,
    connectedIntegrations: [],
    ...overrides,
  };
}

function joinPrompt(input: WorkflowPlanPromptInput): string {
  return buildWorkflowPlanPrompt(input)
    .map((m) => `${m.role}\n${m.content}`)
    .join("\n\n");
}

describe("buildWorkflowPlanPrompt — message shape", () => {
  it("returns a system message then the user request verbatim", () => {
    const input = makeInput();
    const messages = buildWorkflowPlanPrompt(input);
    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe("system");
    expect(messages[1]!.role).toBe("user");
    expect(messages[1]!.content).toBe(input.userRequest);
  });

  it("is deterministic — same input yields identical output", () => {
    expect(buildWorkflowPlanPrompt(makeInput())).toEqual(
      buildWorkflowPlanPrompt(makeInput()),
    );
  });
});

describe("registry grounding", () => {
  it("lists only catalog-provided action/trigger keys", () => {
    const text = joinPrompt(makeInput());
    expect(text).toContain("slack:send_channel_message");
    expect(text).toContain("slack:delete_message");
    expect(text).toContain("slack:new_message");
  });

  it("omits pending providers with no usable metadata", () => {
    const text = joinPrompt(makeInput());
    expect(text).not.toContain("PendingCo");
    expect(text).not.toContain("pendingco");
  });

  it("surfaces a newly-covered provider automatically through catalog input", () => {
    const newProvider: ProviderCatalogEntry = {
      ...usableProvider(),
      id: "newprovider",
      displayName: "NewProvider",
      actions: [
        {
          key: "newprovider:do_thing",
          displayName: "Do thing",
          category: "other",
          riskLevel: "low",
          isDestructive: false,
          requiresConfirmation: false,
          requiresIntegration: true,
          configFields: [],
        },
      ],
      triggers: [],
    };
    const text = joinPrompt(
      makeInput({ catalog: { providers: [newProvider] } }),
    );
    expect(text).toContain("NewProvider");
    expect(text).toContain("newprovider:do_thing");
  });

  it("flags destructive / high-risk actions so the model can avoid them", () => {
    const text = joinPrompt(makeInput());
    expect(text).toMatch(/slack:delete_message.*(destructive|requires-confirmation|risk:high)/);
  });
});

describe("safety constraints", () => {
  it("includes every planner constraint", () => {
    const text = joinPrompt(makeInput());
    for (const constraint of PLANNER_CONSTRAINTS) {
      expect(text).toContain(constraint);
    }
  });

  it("forbids inventing providers/actions/fields and credentials", () => {
    const text = joinPrompt(makeInput()).toLowerCase();
    expect(text).toContain("never invent a provider");
    expect(text).toContain("never invent credentials");
    expect(text).toMatch(/ai_field/i);
    expect(text).toContain("requireduserinput");
  });

  it("forbids using a key derived from displayName / UI label / output / description (AI-12D)", () => {
    const text = joinPrompt(makeInput()).toLowerCase();
    expect(text).toContain("config object keys must come from");
    expect(text).toContain("displayname");
    expect(text).toContain("label");
    expect(text).toContain("output name");
  });

  it("requires every required config field to appear on the node (AI-12D)", () => {
    const text = joinPrompt(makeInput()).toLowerCase();
    expect(text).toContain("every field listed under `required:`");
    expect(text).toContain("must appear in that node's config");
  });

  it("forbids substituting manual.run for an event-driven trigger the user asked for (AI-12D)", () => {
    const text = joinPrompt(makeInput()).toLowerCase();
    expect(text).toContain("do not substitute a different trigger");
    expect(text).toContain("native:manual.run");
    expect(text).toContain("stand-in");
  });
});

describe("patch-shape grounding (AI-12B)", () => {
  it("includes the patch-shape guide verbatim in the system prompt", () => {
    expect(joinPrompt(makeInput())).toContain(PATCH_SHAPE_GUIDE);
  });

  it("lists the exact supported operation vocabulary (sourced from the schema)", () => {
    const text = joinPrompt(makeInput());
    for (const op of SUPPORTED_OPERATION_KINDS) {
      expect(text).toContain(op);
    }
  });

  it("describes the required node fields and the provider:type split", () => {
    const text = joinPrompt(makeInput());
    for (const field of ["id", "kind", "provider", "type", "config", "position"]) {
      expect(text).toContain(`"${field}"`);
    }
    // The provider:type → (provider, type) split is the core AI-12B grounding fix.
    expect(text.toLowerCase()).toContain("split");
  });

  it("describes the edge shape with from/to (never source/target)", () => {
    const text = joinPrompt(makeInput());
    expect(text).toContain('"from"');
    expect(text).toContain('"to"');
  });

  it("instructs a null patch + requiredUserInput when a complete patch can't be built", () => {
    const text = joinPrompt(makeInput()).toLowerCase();
    expect(text).toContain("set proposedpatch to null");
    expect(text).toContain("requireduserinput");
    expect(text).toContain("never emit a partial");
  });
});

describe("JSON-only output rules (AI-12C)", () => {
  it("includes the JSON-only output rules verbatim", () => {
    expect(joinPrompt(makeInput())).toContain(JSON_OUTPUT_RULES);
  });

  it("instructs returning exactly one JSON object", () => {
    expect(joinPrompt(makeInput())).toContain("EXACTLY ONE JSON object");
  });

  it("forbids markdown / code fences", () => {
    const text = joinPrompt(makeInput());
    expect(text).toMatch(/do not use markdown/i);
    expect(text).toContain("```json");
    expect(text).toMatch(/do not wrap the json/i);
  });

  it("pins the first { and last } character requirement", () => {
    const text = joinPrompt(makeInput()).toLowerCase();
    expect(text).toContain("first character of your response must be {");
    expect(text).toContain("last character must be }");
  });

  it("forbids prose before/after the JSON and bans comments/trailing commas", () => {
    const text = joinPrompt(makeInput()).toLowerCase();
    expect(text).toContain("before or after the json");
    expect(text).toContain("comments or trailing commas");
  });
});

describe("declared config-field grounding (AI-12D)", () => {
  it("lists each action's declared config keys with type + required flag", () => {
    const text = joinPrompt(makeInput());
    // slack:send_channel_message has required `channel` (combobox) + required `text` (textarea).
    expect(text).toContain("slack:send_channel_message");
    expect(text).toContain("config fields:");
    expect(text).toMatch(/required:.*channel \(combobox\)/);
    expect(text).toMatch(/required:.*text \(textarea\)/);
  });

  it("renders required and optional sub-lines distinctly", () => {
    const provider: ProviderCatalogEntry = {
      ...usableProvider(),
      actions: [
        {
          key: "demo:thing_with_optionals",
          displayName: "Thing",
          category: "other",
          riskLevel: "low",
          isDestructive: false,
          requiresConfirmation: false,
          requiresIntegration: true,
          configFields: [
            { name: "primary", type: "text", required: true },
            { name: "extra", type: "text", required: false },
          ],
        },
      ],
      triggers: [],
    };
    const text = joinPrompt(makeInput({ catalog: { providers: [provider] } }));
    expect(text).toMatch(/required:\s*primary \(text\)/);
    expect(text).toMatch(/optional:\s*extra \(text\)/);
  });

  it("uses <none> when a node has no required fields and omits the optional line when there are no optional ones", () => {
    const provider: ProviderCatalogEntry = {
      ...usableProvider(),
      actions: [
        {
          key: "demo:no_fields",
          displayName: "No fields",
          category: "other",
          riskLevel: "low",
          isDestructive: false,
          requiresConfirmation: false,
          requiresIntegration: true,
          configFields: [],
        },
      ],
      triggers: [],
    };
    const text = joinPrompt(makeInput({ catalog: { providers: [provider] } }));
    expect(text).toContain("demo:no_fields");
    expect(text).toMatch(/required:\s*<none>/);
    expect(text).not.toMatch(/demo:no_fields[\s\S]*?optional:/);
  });

  it("renders config-field block for triggers as well as actions", () => {
    const text = joinPrompt(makeInput());
    // slack:new_message has required `channel` (combobox).
    expect(text).toContain("slack:new_message");
    expect(text).toMatch(/slack:new_message[\s\S]*?required:\s*channel \(combobox\)/);
  });
});

describe("static-enum config grounding (AI-12B)", () => {
  it("renders an action's static option values so the model picks a real enum", () => {
    const provider: ProviderCatalogEntry = {
      ...usableProvider(),
      actions: [
        {
          key: "demo:pick_event",
          displayName: "Pick event",
          category: "other",
          riskLevel: "low",
          isDestructive: false,
          requiresConfirmation: false,
          requiresIntegration: true,
          configFields: [{ name: "eventType", type: "select", required: true }],
          configOptions: [{ field: "eventType", values: ["created", "deleted"] }],
        },
      ],
      triggers: [],
    };
    const text = joinPrompt(makeInput({ catalog: { providers: [provider] } }));
    expect(text).toContain("config options");
    expect(text).toContain("eventType: [created, deleted]");
  });

  it("omits the config-options block for nodes without static options", () => {
    expect(joinPrompt(makeInput())).not.toContain("config options (use these exact values)");
  });
});

describe("template future-readiness", () => {
  it("includes template-future language but no template dependency", () => {
    const text = joinPrompt(makeInput());
    expect(text).toContain(TEMPLATE_FUTURE_NOTE);
    expect(text.toLowerCase()).toContain("template-based creation is not available yet");
  });
});

describe("connected integrations summary", () => {
  it("states none-connected guidance when the user has no integrations", () => {
    const text = joinPrompt(makeInput({ connectedIntegrations: [] }));
    expect(text.toLowerCase()).toContain("no connected integrations");
    expect(text).toContain("select_integration");
  });

  it("lists connected integrations by provider + account label, without tokens", () => {
    const connected: ConnectedIntegrationView[] = [
      {
        provider: "slack",
        connected: true,
        accountLabel: "Acme Workspace",
        accountScope: "workspace",
        scopeCount: 5,
      },
    ];
    const text = joinPrompt(makeInput({ connectedIntegrations: connected }));
    expect(text).toContain("slack");
    expect(text).toContain("Acme Workspace");
    expect(text).toContain("workspace");
  });
});

describe("cost awareness", () => {
  it("includes the cost section only when provided", () => {
    const withCost = joinPrompt(
      makeInput({
        costAwareness: {
          estimatedTasksPerRunHint: 3,
          notes: ["user is near their monthly task cap"],
        },
      }),
    );
    expect(withCost).toContain("~3 task(s) per run");
    expect(withCost).toContain("user is near their monthly task cap");

    const withoutCost = joinPrompt(makeInput());
    expect(withoutCost.toLowerCase()).not.toContain("task(s) per run");
  });
});

describe("no-leak", () => {
  it("contains no secret-identifier substrings", () => {
    const connected: ConnectedIntegrationView[] = [
      {
        provider: "gmail",
        connected: true,
        accountLabel: "me@example.com",
        accountScope: "user",
        scopeCount: 3,
      },
    ];
    const text = joinPrompt(makeInput({ connectedIntegrations: connected }));
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
      expect(text).not.toContain(needle);
    }
  });
});
