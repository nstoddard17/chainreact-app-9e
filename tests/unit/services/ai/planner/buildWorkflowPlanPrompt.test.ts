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
  VALUE_SHAPE_RULES,
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
        outputs: [
          { name: "channel", type: "string" },
          { name: "ts", type: "string" },
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
        outputs: [],
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
        outputs: [
          { name: "channel", type: "string" },
          { name: "text", type: "string" },
          { name: "user", type: "string" },
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
          outputs: [],
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

  it("forbids substituting manual.run for an event-driven trigger the user asked for (AI-12D, AI-24 hardened)", () => {
    // AI-24 promotes the AI-12D rule into a comprehensive HARD RULE near the
    // top of the constraint list, covering trigger / action / provider
    // substitution. The original AI-12D intents are still pinned here.
    const text = joinPrompt(makeInput()).toLowerCase();
    expect(text).toContain("never substitute a different provider, action, or trigger");
    expect(text).toContain("native:manual.run");
    expect(text).toContain("only when the user explicitly asked for manual");
  });

  // ─── Slice 4.AI-22 — required-field discipline ────────────────────────
  it("forbids silently defaulting / guessing required fields to make a patch apply-ready (AI-22)", () => {
    const text = joinPrompt(makeInput());
    expect(text).toContain("Required-field discipline");
    expect(text.toLowerCase()).toContain("never silently default");
    expect(text.toLowerCase()).toContain("guess");
    expect(text.toLowerCase()).toContain("invent a required field's value");
    expect(text).toContain("(a)"); // the bulleted allowlist of safe fill sources
    expect(text).toContain("(b)");
    expect(text).toContain("(c)");
    expect(text).toContain("(d)");
    expect(text).toContain("(e)");
  });

  it("forbids treating a display label as an opaque id (AI-22)", () => {
    const text = joinPrompt(makeInput());
    expect(text.toLowerCase()).toContain("never treat a display label as an opaque id");
    expect(text.toLowerCase()).toContain("renderer type `text`/`textarea`");
    expect(text.toLowerCase()).toContain("connected resolver result");
    expect(text.toLowerCase()).toContain("c123456"); // example fake id called out
    expect(text.toLowerCase()).toContain("u01abc23def");
    expect(text.toLowerCase()).toContain("react agent's required-input control");
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

describe("value-shape rules (AI-16)", () => {
  it("includes the VALUE_SHAPE_RULES block verbatim in the system prompt", () => {
    expect(joinPrompt(makeInput())).toContain(VALUE_SHAPE_RULES);
  });

  it("documents the per-type value shapes the runtime expects", () => {
    const text = joinPrompt(makeInput());
    expect(text).toContain("text` / `textarea` — string");
    expect(text).toContain("number` — number");
    expect(text).toContain("boolean` — true or false");
    expect(text).toContain("`select` (without `multi-select`)");
    expect(text).toContain("`select` with `multi-select` — array");
    expect(text).toContain("`combobox` (without `multi-select`)");
    expect(text).toContain("`combobox` with `multi-select` — array");
    expect(text).toContain("`keyvalue` — object");
    expect(text).toContain("`string-array` — array of strings");
  });

  it("pins the Stripe enabledEvents-as-array example so the model has a concrete reference", () => {
    const text = joinPrompt(makeInput());
    expect(text).toContain("enabledEvents: [\"payment_intent.payment_failed\"]");
  });

  it("instructs proposedPatch:null when a required field cannot be filled with the correct shape (no scalar↔array coercion)", () => {
    const text = joinPrompt(makeInput()).toLowerCase();
    expect(text).toContain("never coerce a scalar into an array or vice-versa");
  });
});

describe("multi-select indicator (AI-16)", () => {
  it("tags a `multiple: true` field with the `multi-select` indicator inline with the type", () => {
    const provider: ProviderCatalogEntry = {
      ...usableProvider(),
      triggers: [
        {
          key: "demo:multi",
          displayName: "Multi event",
          category: "other",
          activation: "webhook",
          requiresIntegration: true,
          configFields: [
            { name: "events", type: "combobox", required: true, multiple: true },
            { name: "label", type: "text", required: false },
          ],
          configOptions: [{ field: "events", values: ["a", "b"] }],
          outputs: [],
        },
      ],
      actions: [],
    };
    const text = joinPrompt(makeInput({ catalog: { providers: [provider] } }));
    // Multi-select field rendered with the tag.
    expect(text).toMatch(/events \(combobox, multi-select\)/);
    // Single-select field NOT tagged.
    expect(text).toMatch(/label \(text\)/);
    expect(text).not.toMatch(/label \(text, multi-select\)/);
  });
});

describe("outputs grounding (AI-16)", () => {
  it("renders a per-node outputs block listing declared top-level output names + types", () => {
    const text = joinPrompt(makeInput());
    // Slack new-message trigger declares channel / text / user outputs.
    expect(text).toMatch(/slack:new_message[\s\S]*?outputs: channel \(string\), text \(string\), user \(string\)/);
  });

  it("tags sensitive outputs so the model can see the container is opaque", () => {
    const provider: ProviderCatalogEntry = {
      ...usableProvider(),
      triggers: [
        {
          key: "demo:event",
          displayName: "Event",
          category: "other",
          activation: "webhook",
          requiresIntegration: true,
          configFields: [],
          outputs: [
            { name: "eventType", type: "string" },
            { name: "data", type: "object", sensitive: true },
          ],
        },
      ],
      actions: [],
    };
    const text = joinPrompt(makeInput({ catalog: { providers: [provider] } }));
    expect(text).toMatch(/eventType \(string\)/);
    expect(text).toMatch(/data \(object, sensitive\)/);
  });

  it("omits the outputs block entirely when a node declares no outputs (keeps the prompt lean)", () => {
    const provider: ProviderCatalogEntry = {
      ...usableProvider(),
      actions: [
        {
          key: "demo:silent",
          displayName: "Silent",
          category: "other",
          riskLevel: "low",
          isDestructive: false,
          requiresConfirmation: false,
          requiresIntegration: true,
          configFields: [],
          outputs: [],
        },
      ],
      triggers: [],
    };
    const text = joinPrompt(makeInput({ catalog: { providers: [provider] } }));
    expect(text).toContain("demo:silent");
    expect(text).not.toMatch(/demo:silent[\s\S]*?outputs:/);
  });

  it("forbids inventing output keys not in the declared outputs block (AI-16 constraint)", () => {
    const text = joinPrompt(makeInput());
    expect(text).toContain("Variable references `{{nodeId.field}}`");
    expect(text).toContain("MUST use ONLY the output names declared");
    expect(text).toContain("Do NOT invent output keys");
    // Concrete worked example in the constraint.
    expect(text).toMatch(/`id`, `amount`, `currency`, `last_payment_error`/);
  });
});

describe("config-value-shape constraint (AI-16)", () => {
  it("includes the array-vs-scalar shape-matching constraint in PLANNER_CONSTRAINTS", () => {
    const text = joinPrompt(makeInput());
    expect(text).toContain("Match each config value's SHAPE");
    expect(text).toContain("multi-select` field requires an ARRAY");
    // The Stripe-shaped example anchors the rule.
    expect(text).toContain("enabledEvents: [\"payment_intent.payment_failed\"]");
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
          outputs: [],
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
          outputs: [],
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
          outputs: [],
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

  it("makes the disconnected-providers rule explicit in the header (AI-17)", () => {
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
    expect(text).toContain("any provider NOT listed below is DISCONNECTED");
    expect(text).toContain("requires connecting it first");
  });

  it("renders `me=<id>` inline when the provider's installing-user identity is captured (AI-17)", () => {
    const connected: ConnectedIntegrationView[] = [
      {
        provider: "slack",
        connected: true,
        accountLabel: "Acme Workspace",
        accountScope: "workspace",
        scopeCount: 5,
        currentUserId: "U01ABC23DEF",
      },
    ];
    const text = joinPrompt(makeInput({ connectedIntegrations: connected }));
    expect(text).toMatch(/slack \(account: Acme Workspace, scope: workspace, me=U01ABC23DEF\)/);
  });

  it("omits the `me=` segment from the integration line when the provider has no captured installing-user identity (AI-17)", () => {
    const connected: ConnectedIntegrationView[] = [
      {
        provider: "gmail",
        connected: true,
        accountLabel: "user@example.com",
        accountScope: "user",
        scopeCount: 3,
      },
    ];
    const text = joinPrompt(makeInput({ connectedIntegrations: connected }));
    expect(text).toContain("gmail");
    // The integration LINE itself must not contain `me=`. The me-resolution
    // CONSTRAINT block elsewhere in the prompt contains `me=U01ABC23DEF` as a
    // worked example — that's intentional, so we scope the negation to the
    // gmail line.
    expect(text).toMatch(/- gmail \(account: user@example\.com, scope: user\)\n/);
    const gmailLineMatch = text.match(/- gmail \([^)]*\)/);
    expect(gmailLineMatch).not.toBeNull();
    expect(gmailLineMatch![0]).not.toContain("me=");
  });
});

describe("connected-integration awareness + me-resolution constraints (AI-17)", () => {
  it("includes the disconnected-provider awareness constraint with select_integration kind + concrete example", () => {
    // AI-24 — the "do not silently substitute a different connected provider"
    // language moved up into the top-of-list HARD substitution rule (covers
    // trigger + action + provider). The connected-integration rule keeps the
    // select_integration + "Connect Stripe" + "do not say a provider is
    // connected when it isn't" intents; substitution prohibition is asserted
    // separately in the AI-24 test below.
    const text = joinPrompt(makeInput()).toLowerCase();
    expect(text).toContain("connected-integration awareness");
    expect(text).toContain("`kind: \"select_integration\"`");
    expect(text).toContain("\"connect stripe\"");
    expect(text).toContain("do not say a provider is connected when it isn't");
    // AI-24 — substitution prohibition lives in the top-of-list HARD rule:
    expect(text).toContain("never substitute a different provider, action, or trigger");
  });

  it("instructs NOT to add select_integration for providers that ARE in the connected list", () => {
    const text = joinPrompt(makeInput()).toLowerCase();
    expect(text).toContain("when a provider is in the connected list, do not add a `select_integration` entry for it");
  });

  it("includes the me-resolution constraint with the Slack worked example", () => {
    const text = joinPrompt(makeInput()).toLowerCase();
    expect(text).toContain('"me" resolution');
    expect(text).toContain("slack:send_direct_message.userid");
    expect(text).toContain("me=u01abc23def");
  });

  it("instructs to ask for the recipient via requiredUserInput when no me= is present", () => {
    const text = joinPrompt(makeInput()).toLowerCase();
    expect(text).toContain("which slack user should receive the dm?");
    expect(text).toContain('kind: "config_value"');
  });

  it("forbids guessing user ids, using bot ids as recipients, or substituting channel ids", () => {
    const text = joinPrompt(makeInput()).toLowerCase();
    expect(text).toContain("never guess a user id");
    expect(text).toContain("never use a bot user id as the human recipient");
    expect(text).toContain("never use a channel id where a user id is required");
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

// ─── Slice 4.AI-24 — no-substitution + current-canvas grounding ──────────────

describe("no-substitution HARD RULE (AI-24)", () => {
  it("appears near the top of PLANNER_CONSTRAINTS so the model sees it before the long-tail rules", () => {
    // The rule MUST live in the first 4 entries so it has prominence over
    // the secondary fill-discipline / id-handling / variable rules.
    const indexes = PLANNER_CONSTRAINTS.map((c, i) =>
      c.toLowerCase().includes("never substitute a different provider")
        ? i
        : -1,
    ).filter((i) => i >= 0);
    expect(indexes).toHaveLength(1);
    expect(indexes[0]).toBeLessThanOrEqual(3);
  });

  it("forbids trigger substitution: Manual Trigger is not a stand-in for an event trigger", () => {
    const text = joinPrompt(makeInput()).toLowerCase();
    expect(text).toContain("native:manual.run");
    expect(text).toContain("only when the user explicitly asked for manual");
  });

  it("calls out HTTP / webhook trigger as off-limits unless explicitly requested", () => {
    const text = joinPrompt(makeInput()).toLowerCase();
    expect(text).toContain("http / webhook triggers are allowed only when");
  });

  it("calls out Schedule trigger as off-limits unless explicitly requested", () => {
    const text = joinPrompt(makeInput()).toLowerCase();
    expect(text).toContain("schedule / cron triggers are allowed only when");
  });

  it("forbids ACTION substitution within a provider (Slack DM != Slack channel message)", () => {
    const text = joinPrompt(makeInput()).toLowerCase();
    // The rule names the Slack DM vs channel-message example verbatim so
    // the model can't claim ignorance of the distinction.
    expect(text).toContain("slack:send_direct_message");
    expect(text).toContain("not `slack:send_channel_message`");
  });

  it("forbids PROVIDER substitution across providers (Gmail != Outlook)", () => {
    const text = joinPrompt(makeInput()).toLowerCase();
    expect(text).toContain("gmail → outlook");
    expect(text).toContain("slack → discord");
    expect(text).toContain("stripe → square");
    expect(text).toContain("google drive → onedrive");
  });

  it("requires null patch + unsupportedRequests + select_integration when the requested capability is missing/disconnected", () => {
    const text = joinPrompt(makeInput()).toLowerCase();
    expect(text).toContain("set proposedpatch to null");
    expect(text).toContain("unsupportedrequests");
    expect(text).toContain("\"connect gmail\"");
  });

  it("declares the rule non-negotiable (overrides preference for non-null patches)", () => {
    const text = joinPrompt(makeInput()).toLowerCase();
    expect(text).toContain("non-negotiable");
    expect(text).toContain("a null patch with a clear unsupported / required-setup explanation is always the right answer");
  });
});

describe("current-workflow-on-canvas section (AI-24)", () => {
  it("emits the explicit empty-canvas line when no currentGraph is supplied", () => {
    const text = joinPrompt(makeInput());
    expect(text).toContain(
      "Current workflow on the canvas: (empty — no nodes on the canvas right now)",
    );
  });

  it("emits the explicit empty-canvas line when currentGraph has zero nodes", () => {
    const text = joinPrompt(makeInput({ currentGraph: { nodes: [], edges: [] } }));
    expect(text).toContain(
      "Current workflow on the canvas: (empty — no nodes on the canvas right now)",
    );
  });

  it("renders provider:type pairs for canvas nodes WITHOUT config / position / secrets", () => {
    const text = joinPrompt(
      makeInput({
        currentGraph: {
          nodes: [
            { id: "trig-1", kind: "trigger", provider: "native", type: "manual.run" },
            { id: "act-1", kind: "action", provider: "slack", type: "send_channel_message" },
          ],
          edges: [{ id: "edge-1", from: "trig-1", to: "act-1" }],
        },
      }),
    );
    expect(text).toContain("Current workflow on the canvas");
    // Slice 4.BUILDER-NODE-IDENTITY-1 — each node now renders as
    // `<id> ("<friendly label>"): <kind> <provider>:<type>`. The opaque id +
    // provider:type are preserved; a quoted human label is added as context.
    expect(text).toMatch(/- trig-1 \("[^"]+"\): trigger native:manual\.run/);
    expect(text).toMatch(/- act-1 \("[^"]+"\): action slack:send_channel_message/);
    expect(text).toContain("- edge-1: trig-1 → act-1");
  });

  it("labels the section authoritative AND explicitly defers to the no-substitution rule", () => {
    const text = joinPrompt(
      makeInput({
        currentGraph: {
          nodes: [
            { id: "trig-1", kind: "trigger", provider: "native", type: "manual.run" },
          ],
          edges: [],
        },
      }),
    );
    expect(text.toLowerCase()).toContain("authoritative");
    expect(text.toLowerCase()).toContain(
      "use these as context not as license to substitute",
    );
  });

  it("never leaks config values from canvas nodes (no-leak — the snapshot is value-free by design)", () => {
    // The CurrentGraphSnapshot type is provider:type pairs + edges only;
    // there is no `config` field. The renderer therefore can't accidentally
    // surface a poisoned config. Assert the canvas-rendered slice doesn't
    // contain secret-shaped substrings (the rest of the prompt may legitimately
    // mention provider names like "slack" or rule examples).
    const text = joinPrompt(
      makeInput({
        currentGraph: {
          nodes: [
            { id: "a", kind: "action", provider: "slack", type: "send_channel_message" },
          ],
          edges: [],
        },
      }),
    );
    // Slice ONLY the canvas-rendered section for assertion. The substring
    // surrounding the Current-workflow header must not contain any secret-
    // shaped token (the renderer doesn't emit them; this guards regression).
    const start = text.indexOf("Current workflow on the canvas");
    const end = text.indexOf("\n\n", start);
    const section = text.slice(start, end === -1 ? text.length : end);
    expect(section).not.toMatch(/xox[bpsr]-|Bearer\s|ya29\.|sk-ant-|accessToken|refreshToken/);
  });
});

describe("AI-33 — ambiguous-category + content-field + null-patch completeness rules", () => {
  it("R1 ambiguity rule: generic categories are not a specific provider", () => {
    const text = joinPrompt(makeInput()).toLowerCase();
    expect(text).toContain("generic provider categories are not a specific provider");
    expect(text).toContain("which email app should trigger this");
    expect(text).toContain('never default "email" to gmail');
  });

  it("R1 ambiguity rule: naming the provider resolves the ambiguity", () => {
    const text = joinPrompt(makeInput()).toLowerCase();
    expect(text).toContain("naming it resolves the ambiguity");
  });

  it("R3 content-field rule: unspecified message content must be asked, not invented", () => {
    const text = joinPrompt(makeInput()).toLowerCase();
    expect(text).toContain("free-text content fields");
    expect(text).toContain("what should the slack message say?");
    expect(text).toContain("do not use ai_field to skip asking for content");
  });

  it("R3 content-field rule: AI_FIELD is valid for summary/derivable content", () => {
    const text = joinPrompt(makeInput());
    expect(text).toContain("send a summary");
    expect(text).toContain("draft a reply");
  });

  it("R7 null-patch completeness: list EVERY missing required field even with a null patch", () => {
    const text = joinPrompt(makeInput());
    expect(text).toContain("you MUST still list EVERY missing required field");
    expect(text.toLowerCase()).toContain("a null patch is not an excuse to ask only one question");
  });
});

describe("Slice 4.BUILDER-NODE-IDENTITY-1 — node-id grounding + edit scope", () => {
  it("tells the model node ids are opaque and to copy exact ids for existing-node ops", () => {
    const text = joinPrompt(makeInput());
    expect(text).toContain("Node ids are OPAQUE system identifiers");
    expect(text.toLowerCase()).toContain("you must copy the exact");
  });

  it("forbids invented ids (action1 / trigger1 / node1) for existing-node operations", () => {
    const text = joinPrompt(makeInput());
    expect(text).toContain("NEVER invent an id like `action1`, `trigger1`, `node1`");
    expect(text).toContain("rejected (UNKNOWN_NODE)");
  });

  it("states displayName is human context only and the planner never sets it", () => {
    const text = joinPrompt(makeInput());
    expect(text).toContain("NEVER set a `displayName` on a node");
    expect(text.toLowerCase()).toContain("node names belong to the user");
  });

  it("documents trigger-only vs action-only edit scope", () => {
    const text = joinPrompt(makeInput());
    expect(text).toContain("Scope every edit to exactly what the user asked for");
    expect(text.toLowerCase()).toContain("do not touch existing action nodes");
    expect(text.toLowerCase()).toContain("do not replace or re-add the trigger");
  });

  it("renders a node's user displayName as the quoted label in the current canvas", () => {
    const text = joinPrompt(
      makeInput({
        currentGraph: {
          nodes: [
            {
              id: "n1",
              kind: "action",
              provider: "slack",
              type: "send_channel_message",
              displayName: "Notify Support Team",
            },
          ],
          edges: [],
        },
      }),
    );
    expect(text).toContain('- n1 ("Notify Support Team"): action slack:send_channel_message');
  });
});
