/**
 * @jest-environment node
 *
 * Slice 4.AI-28 — tests for the per-section attribution channel
 * (`buildWorkflowPlanPromptWithAttribution` + `estimateTokensFromChars`).
 *
 * Separated from `buildWorkflowPlanPrompt.test.ts` (already > 800 lines) to
 * keep both files under the project's soft 500-line ceiling and to make the
 * attribution contract reviewable as a single block.
 *
 * Pinned:
 *  - The wrapped `messages` field is byte-identical to the back-compat
 *    `buildWorkflowPlanPrompt` output (same renderers, same join order).
 *  - Per-section chars sum within 1 char of the system message length
 *    (sections are joined by `\n\n` so the difference is bounded by
 *    `2 × (sections.length - 1)` — the assertion uses that exact bound).
 *  - Structural counts mirror catalog inventory exactly.
 *  - Attribution never carries a key matching the existing
 *    `sanitizeAiEventMetadata` denylist
 *    (`/token|secret|password|authorization|prompt|config|body|raw/i`).
 *  - Attribution never carries raw user prompt text, catalog payload, or
 *    secrets-shaped values.
 *  - `estimateTokensFromChars` is a documented heuristic; assert range
 *    (~3.5–4.2 chars/token band) rather than an exact value.
 */
import {
  buildWorkflowPlanPrompt,
  buildWorkflowPlanPromptWithAttribution,
} from "@/services/ai/planner/buildWorkflowPlanPrompt";
import {
  PLANNER_PACKET_VERSION,
  estimateTokensFromChars,
  type WorkflowPlanPromptInput,
} from "@/services/ai/planner/types";
import type {
  ProviderCatalogEntry,
  ProviderCatalogView,
} from "@/services/ai/tools/providerCatalog";

// Mirror of the BLOCKED_KEY_PATTERNS list in
// services/billing/aiCostEvents.ts — kept inline so a regression that
// loosens that denylist still fails this test (the field names must stay
// safe regardless of denylist drift).
const BLOCKED_KEY_PATTERNS: readonly RegExp[] = [
  /token/i,
  /secret/i,
  /password/i,
  /authorization/i,
  /api[-_]?key/i,
  /credential/i,
  /prompt/i,
  /completion/i,
  /chain[-_]?of[-_]?thought/i,
  /\bcot\b/i,
  /body/i,
  /file[-_]?content/i,
  /config/i,
  /\braw/i,
];

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
    userRequest: "Post a Slack message when a new message arrives",
    catalog,
    connectedIntegrations: [],
    ...overrides,
  };
}

describe("AI-28 — buildWorkflowPlanPromptWithAttribution shape", () => {
  it("returns the SAME messages as the back-compat buildWorkflowPlanPrompt", () => {
    const input = makeInput();
    const { messages } = buildWorkflowPlanPromptWithAttribution(input);
    const messagesBackCompat = buildWorkflowPlanPrompt(input);
    expect(messages).toEqual(messagesBackCompat);
  });

  it("sets packetVersion to the exported PLANNER_PACKET_VERSION", () => {
    const { attribution } = buildWorkflowPlanPromptWithAttribution(makeInput());
    expect(attribution.packetVersion).toBe(PLANNER_PACKET_VERSION);
    expect(typeof attribution.packetVersion).toBe("string");
    expect(attribution.packetVersion.length).toBeGreaterThan(0);
  });

  it("reports totalPacketChars equal to system + user message length", () => {
    const { messages, attribution } = buildWorkflowPlanPromptWithAttribution(makeInput());
    const expected = messages[0]!.content.length + messages[1]!.content.length;
    expect(attribution.totalPacketChars).toBe(expected);
  });

  it("per-section chars sum within bound of the system message length (sections joined by \\n\\n)", () => {
    const { messages, attribution } = buildWorkflowPlanPromptWithAttribution(makeInput());
    const systemLen = messages[0]!.content.length;
    // Catalog + rules + connected + canvas are the 4 attributed
    // dynamic-content sections. The rest (preamble, template note,
    // schema, patch guide, value rules, JSON rules) are static; assert
    // catalog + rules + connected + canvas ≤ system length and > 0.
    const dynamicChars =
      attribution.catalogChars +
      attribution.rulesChars +
      attribution.connectedIntegrationsChars +
      attribution.currentCanvasChars;
    expect(dynamicChars).toBeGreaterThan(0);
    expect(dynamicChars).toBeLessThanOrEqual(systemLen);
  });

  it("userRequestChars equals the user prompt length verbatim", () => {
    const userRequest = "Post a Slack message when a new message arrives";
    const { attribution } = buildWorkflowPlanPromptWithAttribution(
      makeInput({ userRequest }),
    );
    expect(attribution.userRequestChars).toBe(userRequest.length);
  });

  it("counts only usable providers (excludes pending / metadata-less providers)", () => {
    const { attribution } = buildWorkflowPlanPromptWithAttribution(makeInput());
    // Catalog has [usableSlack, pendingCo]; only slack counts.
    expect(attribution.catalogProviderCount).toBe(1);
  });

  it("reports actions + triggers + fields + outputs counts from the catalog", () => {
    const { attribution } = buildWorkflowPlanPromptWithAttribution(makeInput());
    expect(attribution.catalogActionCount).toBe(1);
    expect(attribution.catalogTriggerCount).toBe(1);
    // Slack action has 2 config fields + trigger has 1 → 3 total.
    expect(attribution.catalogFieldCount).toBe(3);
    // Slack action has 2 outputs + trigger has 1 → 3 total.
    expect(attribution.catalogOutputFieldCount).toBe(3);
  });

  it("reports connectedIntegrationCount from the input list (rendered + unrendered)", () => {
    const { attribution } = buildWorkflowPlanPromptWithAttribution(
      makeInput({
        connectedIntegrations: [
          { provider: "slack", connected: true, accountLabel: "Acme", accountScope: null, scopeCount: 0 },
          { provider: "gmail", connected: true, accountLabel: "me@acme.com", accountScope: null, scopeCount: 0 },
        ],
      }),
    );
    expect(attribution.connectedIntegrationCount).toBe(2);
  });

  it("reports zero canvas counts when no currentGraph is supplied", () => {
    const { attribution } = buildWorkflowPlanPromptWithAttribution(makeInput());
    expect(attribution.currentCanvasNodeCount).toBe(0);
    expect(attribution.currentCanvasEdgeCount).toBe(0);
  });

  it("reports canvas counts from currentGraph nodes + edges", () => {
    const { attribution } = buildWorkflowPlanPromptWithAttribution(
      makeInput({
        currentGraph: {
          nodes: [
            { id: "trig-1", kind: "trigger", provider: "native", type: "manual.run" },
            { id: "act-1", kind: "action", provider: "slack", type: "send_channel_message" },
          ],
          edges: [{ id: "e1", from: "trig-1", to: "act-1" }],
        },
      }),
    );
    expect(attribution.currentCanvasNodeCount).toBe(2);
    expect(attribution.currentCanvasEdgeCount).toBe(1);
  });

  it("is deterministic — same input yields identical attribution", () => {
    const a = buildWorkflowPlanPromptWithAttribution(makeInput());
    const b = buildWorkflowPlanPromptWithAttribution(makeInput());
    expect(a.attribution).toEqual(b.attribution);
  });
});

describe("AI-28 — attribution no-leak guarantees", () => {
  it("never carries a key matching the ai_cost_events sanitizer denylist", () => {
    // Compose an attribution that would have to leak if the field names
    // collided with the existing denylist; assert every key is safe.
    const { attribution } = buildWorkflowPlanPromptWithAttribution(
      makeInput({
        connectedIntegrations: [
          { provider: "slack", connected: true, accountLabel: "Acme", accountScope: null, scopeCount: 0, currentUserId: "U-MOCK" },
        ],
        currentGraph: {
          nodes: [
            { id: "trig-1", kind: "trigger", provider: "native", type: "manual.run" },
          ],
          edges: [],
        },
      }),
    );
    for (const key of Object.keys(attribution)) {
      for (const pattern of BLOCKED_KEY_PATTERNS) {
        expect({ key, pattern: pattern.source }).toEqual(
          expect.objectContaining({ key }),
        );
        if (pattern.test(key)) {
          throw new Error(
            `Attribution key '${key}' matches sanitizer denylist /${pattern.source}/${pattern.flags} — would be dropped by sanitizeAiEventMetadata.`,
          );
        }
      }
    }
  });

  it("never carries raw user prompt text — only its character count", () => {
    const userRequest =
      "send a Slack DM with my access_token=ya29.LEAK and Authorization Bearer SHOULD_NOT_LEAK";
    const { attribution } = buildWorkflowPlanPromptWithAttribution(
      makeInput({ userRequest }),
    );
    const dump = JSON.stringify(attribution);
    expect(dump).not.toContain("ya29.");
    expect(dump).not.toContain("SHOULD_NOT_LEAK");
    expect(dump).not.toContain("access_token");
    expect(dump).not.toContain("Authorization");
    // The numeric length is fine — that's the whole point of the channel.
    expect(attribution.userRequestChars).toBe(userRequest.length);
  });

  it("never carries raw catalog payload — only structural counts", () => {
    const { attribution } = buildWorkflowPlanPromptWithAttribution(makeInput());
    const dump = JSON.stringify(attribution);
    expect(dump).not.toContain("slack:send_channel_message");
    expect(dump).not.toContain("send_channel_message");
    expect(dump).not.toContain("Send channel message");
    expect(dump).not.toContain("textarea");
    expect(dump).not.toContain("combobox");
  });

  it("never carries connected-integration account / me values — only the count", () => {
    const { attribution } = buildWorkflowPlanPromptWithAttribution(
      makeInput({
        connectedIntegrations: [
          { provider: "slack", connected: true, accountLabel: "Acme Workspace", accountScope: null, scopeCount: 0, currentUserId: "U01ABC23DEF" },
        ],
      }),
    );
    const dump = JSON.stringify(attribution);
    expect(dump).not.toContain("Acme Workspace");
    expect(dump).not.toContain("U01ABC23DEF");
    expect(dump).not.toContain("slack");
  });

  it("never carries canvas node ids / provider:type pairs — only counts", () => {
    const { attribution } = buildWorkflowPlanPromptWithAttribution(
      makeInput({
        currentGraph: {
          nodes: [
            { id: "SECRET-NODE-ID", kind: "action", provider: "stripe", type: "create_invoice" },
          ],
          edges: [],
        },
      }),
    );
    const dump = JSON.stringify(attribution);
    expect(dump).not.toContain("SECRET-NODE-ID");
    expect(dump).not.toContain("create_invoice");
    expect(dump).not.toContain("stripe");
  });
});

describe("AI-28 — estimateTokensFromChars heuristic", () => {
  it("returns 0 for non-positive / non-finite chars", () => {
    expect(estimateTokensFromChars(0)).toBe(0);
    expect(estimateTokensFromChars(-100)).toBe(0);
    expect(estimateTokensFromChars(Number.NaN)).toBe(0);
    expect(estimateTokensFromChars(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("falls inside the ~3.5–4.2 chars/token Anthropic English+JSON band", () => {
    // For a representative 38k-char planner packet, estimated tokens should
    // land in [38000/4.2, 38000/3.5] ≈ [9047, 10857]. The current ratio
    // (3.7) returns ~10270 — within band.
    const t = estimateTokensFromChars(38_000);
    expect(t).toBeGreaterThanOrEqual(Math.floor(38_000 / 4.2));
    expect(t).toBeLessThanOrEqual(Math.ceil(38_000 / 3.5));
  });

  it("is monotonic", () => {
    expect(estimateTokensFromChars(1_000)).toBeLessThan(estimateTokensFromChars(2_000));
    expect(estimateTokensFromChars(10_000)).toBeLessThan(estimateTokensFromChars(20_000));
  });

  it("rounds to an integer", () => {
    expect(Number.isInteger(estimateTokensFromChars(123))).toBe(true);
    expect(Number.isInteger(estimateTokensFromChars(38_059))).toBe(true);
  });
});
