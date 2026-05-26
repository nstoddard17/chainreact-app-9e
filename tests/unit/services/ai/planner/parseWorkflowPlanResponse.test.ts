/**
 * @jest-environment node
 *
 * Tests for services/ai/planner/parseWorkflowPlanResponse.ts (Slice 4.AI-8A).
 *
 * The parser is the boundary that refuses to trust raw model text. These pin:
 * empty/non-JSON rejection, markdown-fence stripping, strict-after-fence prose
 * rejection, shape validation, AI-3 patch validation, nullable/absent patch
 * handling, unsupportedRequests capture, and the secret refusal (with no-leak on
 * the error message itself).
 */
import { parseWorkflowPlanResponse } from "@/services/ai/planner/parseWorkflowPlanResponse";

function validPatch(): Record<string, unknown> {
  return {
    patchId: "patch-1",
    workflowId: null,
    baseRevision: "rev-1",
    operations: [
      {
        op: "addNode",
        node: { id: "n1", kind: "trigger", provider: "slack", type: "new_message" },
      },
    ],
    summary: "Add a Slack trigger",
    rationale: "Start the workflow on new Slack messages",
  };
}

function validResponse(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    intentSummary: "Notify on new Slack messages",
    assumptions: [],
    requiredUserInput: [],
    proposedPatch: validPatch(),
    confidence: "high",
    safetyNotes: [],
    unsupportedRequests: [],
    ...overrides,
  };
}

describe("valid responses", () => {
  it("parses a well-formed response with a proposed patch", () => {
    const result = parseWorkflowPlanResponse(JSON.stringify(validResponse()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.intentSummary).toBe("Notify on new Slack messages");
    expect(result.response.confidence).toBe("high");
    expect(result.response.proposedPatch).not.toBeNull();
    expect(result.response.proposedPatch!.operations).toHaveLength(1);
  });

  it("accepts an explicit null proposedPatch (needs user input / nothing to apply)", () => {
    const result = parseWorkflowPlanResponse(
      JSON.stringify(validResponse({ proposedPatch: null })),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.proposedPatch).toBeNull();
  });

  it("treats an absent proposedPatch as null", () => {
    const body = validResponse();
    delete body.proposedPatch;
    const result = parseWorkflowPlanResponse(JSON.stringify(body));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.proposedPatch).toBeNull();
  });

  it("captures requiredUserInput and unsupportedRequests", () => {
    const result = parseWorkflowPlanResponse(
      JSON.stringify(
        validResponse({
          proposedPatch: null,
          requiredUserInput: [
            { label: "Pick a Slack channel", kind: "config_value", nodeId: "n2", field: "channel" },
          ],
          unsupportedRequests: ["send a fax"],
        }),
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.requiredUserInput).toHaveLength(1);
    expect(result.response.requiredUserInput[0]!.kind).toBe("config_value");
    expect(result.response.unsupportedRequests).toEqual(["send a fax"]);
  });

  it("strips unknown top-level keys (lenient wrapper)", () => {
    const result = parseWorkflowPlanResponse(
      JSON.stringify(validResponse({ chainOfThought: "secret reasoning", extra: 1 })),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response as unknown as Record<string, unknown>).not.toHaveProperty("chainOfThought");
  });
});

describe("empty / non-JSON", () => {
  it.each(["", "   ", "\n\t "])("rejects blank output as EMPTY_RESPONSE (%j)", (raw) => {
    const result = parseWorkflowPlanResponse(raw);
    expect(result).toMatchObject({ ok: false, code: "EMPTY_RESPONSE" });
  });

  it("rejects non-JSON as NOT_JSON", () => {
    const result = parseWorkflowPlanResponse("I think you should add a Slack node.");
    expect(result).toMatchObject({ ok: false, code: "NOT_JSON" });
  });
});

describe("markdown fences and surrounding prose", () => {
  it("strips a ```json fenced block and parses it", () => {
    const fenced = "```json\n" + JSON.stringify(validResponse()) + "\n```";
    const result = parseWorkflowPlanResponse(fenced);
    expect(result.ok).toBe(true);
  });

  it("strips a bare ``` fenced block and parses it", () => {
    const fenced = "```\n" + JSON.stringify(validResponse()) + "\n```";
    const result = parseWorkflowPlanResponse(fenced);
    expect(result.ok).toBe(true);
  });

  it("rejects prose wrapped around the JSON (strict after fence strip)", () => {
    const noisy = "Sure! Here is your plan:\n" + JSON.stringify(validResponse()) + "\nHope that helps!";
    const result = parseWorkflowPlanResponse(noisy);
    expect(result).toMatchObject({ ok: false, code: "NOT_JSON" });
  });
});

describe("shape validation", () => {
  it("rejects a response missing confidence as INVALID_SHAPE", () => {
    const body = validResponse();
    delete body.confidence;
    expect(parseWorkflowPlanResponse(JSON.stringify(body))).toMatchObject({
      ok: false,
      code: "INVALID_SHAPE",
    });
  });

  it("rejects an invalid confidence enum as INVALID_SHAPE", () => {
    expect(
      parseWorkflowPlanResponse(JSON.stringify(validResponse({ confidence: "very-high" }))),
    ).toMatchObject({ ok: false, code: "INVALID_SHAPE" });
  });

  it("rejects a non-object JSON (array) as INVALID_SHAPE", () => {
    expect(parseWorkflowPlanResponse("[]")).toMatchObject({
      ok: false,
      code: "INVALID_SHAPE",
    });
  });
});

describe("patch validation (AI-3 schema)", () => {
  it("rejects a proposedPatch with no operations as INVALID_PATCH", () => {
    const result = parseWorkflowPlanResponse(
      JSON.stringify(validResponse({ proposedPatch: { ...validPatch(), operations: [] } })),
    );
    expect(result).toMatchObject({ ok: false, code: "INVALID_PATCH" });
  });

  it("rejects a proposedPatch with an unknown operation as INVALID_PATCH", () => {
    const result = parseWorkflowPlanResponse(
      JSON.stringify(
        validResponse({
          proposedPatch: { ...validPatch(), operations: [{ op: "nukeEverything" }] },
        }),
      ),
    );
    expect(result).toMatchObject({ ok: false, code: "INVALID_PATCH" });
  });

  it("rejects a proposedPatch missing envelope fields as INVALID_PATCH", () => {
    const result = parseWorkflowPlanResponse(
      JSON.stringify(validResponse({ proposedPatch: { patchId: "p1" } })),
    );
    expect(result).toMatchObject({ ok: false, code: "INVALID_PATCH" });
  });

  it("rejects an addNode whose node is missing kind/provider as INVALID_PATCH", () => {
    // The exact AI-12B failure mode: a node with only {id, type} (no separate
    // kind/provider) — what a model emits when it isn't told the node shape.
    const patch = {
      ...validPatch(),
      operations: [{ op: "addNode", node: { id: "n1", type: "slack:send_direct_message" } }],
    };
    const result = parseWorkflowPlanResponse(
      JSON.stringify(validResponse({ proposedPatch: patch })),
    );
    expect(result).toMatchObject({ ok: false, code: "INVALID_PATCH" });
  });

  it("rejects an operation carrying an extra key as INVALID_PATCH (.strict ops)", () => {
    const patch = {
      ...validPatch(),
      operations: [
        {
          op: "moveNode",
          nodeId: "n1",
          position: { x: 1, y: 2 },
          surprise: "extra-key-not-in-schema",
        },
      ],
    };
    const result = parseWorkflowPlanResponse(
      JSON.stringify(validResponse({ proposedPatch: patch })),
    );
    expect(result).toMatchObject({ ok: false, code: "INVALID_PATCH" });
  });
});

describe("secret refusal (no-leak)", () => {
  it("refuses a literal secret value in patch config as SECRET_IN_RESPONSE", () => {
    const SECRET = "ya29.A0ARrdaM-LEAKED-TOKEN";
    const patch = validPatch();
    (patch.operations as Array<Record<string, unknown>>)[0]!.node = {
      id: "n1",
      kind: "action",
      provider: "slack",
      type: "send_channel_message",
      config: { accessToken: SECRET },
    };
    const result = parseWorkflowPlanResponse(
      JSON.stringify(validResponse({ proposedPatch: patch })),
    );
    expect(result).toMatchObject({ ok: false, code: "SECRET_IN_RESPONSE" });
    // The error message must never echo the offending secret.
    if (!result.ok) expect(result.message).not.toContain(SECRET);
  });

  it("allows a variable reference under a secret-named key (not a literal secret)", () => {
    const patch = validPatch();
    (patch.operations as Array<Record<string, unknown>>)[0]!.node = {
      id: "n1",
      kind: "action",
      provider: "http",
      type: "request",
      config: { apiKey: "{{trigger.apiKey}}" },
    };
    const result = parseWorkflowPlanResponse(
      JSON.stringify(validResponse({ proposedPatch: patch })),
    );
    expect(result.ok).toBe(true);
  });

  it("does not flag benign numeric config under a token-ish key", () => {
    const patch = validPatch();
    (patch.operations as Array<Record<string, unknown>>)[0]!.node = {
      id: "n1",
      kind: "action",
      provider: "openai",
      type: "complete",
      config: { maxTokens: 500 },
    };
    const result = parseWorkflowPlanResponse(
      JSON.stringify(validResponse({ proposedPatch: patch })),
    );
    expect(result.ok).toBe(true);
  });
});
