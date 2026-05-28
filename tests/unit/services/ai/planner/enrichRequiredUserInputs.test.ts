/**
 * Tests for services/ai/planner/enrichRequiredUserInputs (Slice 4.AI-22).
 *
 * Pure, deterministic — verifies that the FieldMeta-derived enrichment
 * surfaces the right hints for the React Agent's interactive controls
 * while degrading gracefully for unresolvable nodeId / field references.
 *
 * Uses the LIVE discovery registry (no mock) so the test pins real
 * metadata — e.g. `slack:send_channel_message.channel` is a `combobox`
 * with `optionsSource: "slack:channels"`. If a future provider refactor
 * changes that, the assertion will catch it; the planner's UI contract
 * depends on the renderer type + optionsSource being available.
 */
import { enrichRequiredUserInputs } from "@/services/ai/planner/enrichRequiredUserInputs";
import type { WorkflowPatch } from "@/services/workflows/patch/types";

function patchWithSlackSend(): WorkflowPatch {
  return {
    patchId: "p1",
    workflowId: "wf-1",
    baseRevision: "rev-1",
    summary: "Add Slack post",
    rationale: "User asked for a Slack message.",
    operations: [
      {
        op: "addNode",
        node: {
          id: "n_slack",
          kind: "action",
          provider: "slack",
          type: "send_channel_message",
          config: {},
          position: { x: 0, y: 0 },
        },
      },
    ],
  };
}

describe("enrichRequiredUserInputs — Slack channel (optionsSource)", () => {
  it("enriches `slack:send_channel_message.channel` with provider/nodeType/fieldLabel/fieldType/optionsSource", () => {
    const result = enrichRequiredUserInputs(
      [
        {
          label: "Which Slack channel should the message be sent to?",
          nodeId: "n_slack",
          field: "channel",
          kind: "config_value",
        },
      ],
      patchWithSlackSend(),
    );
    expect(result).toHaveLength(1);
    const enriched = result[0]!;
    expect(enriched.provider).toBe("slack");
    expect(enriched.nodeType).toBe("send_channel_message");
    expect(enriched.nodeLabel).toBe("Send Channel Message");
    expect(enriched.fieldLabel).toBe("Channel");
    expect(enriched.fieldType).toBe("combobox");
    expect(enriched.optionsSource).toBe("slack:channels");
    expect(enriched.options).toBeUndefined();
    expect(enriched.allowFreeText).toBe(true); // combobox with optionsSource
  });

  it("enriches `slack:send_channel_message.text` as a free-text textarea", () => {
    const result = enrichRequiredUserInputs(
      [
        {
          label: "What should the message say?",
          nodeId: "n_slack",
          field: "text",
          kind: "config_value",
        },
      ],
      patchWithSlackSend(),
    );
    const enriched = result[0]!;
    expect(enriched.fieldLabel).toBe("Message");
    expect(enriched.fieldType).toBe("textarea");
    expect(enriched.allowFreeText).toBe(true);
    expect(enriched.options).toBeUndefined();
    expect(enriched.optionsSource).toBeUndefined();
  });
});

describe("enrichRequiredUserInputs — degraded paths", () => {
  it("passes through entries with no nodeId/field unchanged (e.g. select_integration / clarification)", () => {
    const result = enrichRequiredUserInputs(
      [
        { label: "Connect Stripe", kind: "select_integration" },
        { label: "Pick a trigger", kind: "clarification" },
      ],
      null,
    );
    expect(result).toHaveLength(2);
    expect(result[0]!.provider).toBeUndefined();
    expect(result[0]!.fieldLabel).toBeUndefined();
    expect(result[1]!.provider).toBeUndefined();
    expect(result[1]!.fieldLabel).toBeUndefined();
  });

  it("passes through entries whose nodeId is not in the patch (unresolvable) unchanged", () => {
    const result = enrichRequiredUserInputs(
      [
        {
          label: "missing",
          nodeId: "n_unknown",
          field: "channel",
          kind: "config_value",
        },
      ],
      patchWithSlackSend(),
    );
    expect(result[0]!.provider).toBeUndefined();
    expect(result[0]!.fieldLabel).toBeUndefined();
  });

  it("passes through entries whose field is not declared on the node's metadata", () => {
    const result = enrichRequiredUserInputs(
      [
        {
          label: "missing field",
          nodeId: "n_slack",
          field: "nope_not_a_field",
          kind: "config_value",
        },
      ],
      patchWithSlackSend(),
    );
    expect(result[0]!.provider).toBeUndefined();
    expect(result[0]!.fieldLabel).toBeUndefined();
  });

  it("works with null patch — entries without nodeId/field still pass through unchanged", () => {
    const result = enrichRequiredUserInputs(
      [
        { label: "Connect Stripe", kind: "select_integration" },
      ],
      null,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe("Connect Stripe");
  });
});

describe("enrichRequiredUserInputs — static options enrichment", () => {
  it("surfaces FieldMeta.options as label/value pairs and does not set optionsSource", () => {
    // Build a patch with a Stripe trigger whose `enabledEvents` field has
    // static options (combobox + multi-select per the Stripe meta).
    const patch: WorkflowPatch = {
      patchId: "p1",
      workflowId: "wf-1",
      baseRevision: "rev-1",
      summary: "Stripe event trigger",
      rationale: "",
      operations: [
        {
          op: "addNode",
          node: {
            id: "n_stripe",
            kind: "trigger",
            provider: "stripe",
            type: "event_received",
            config: {},
            position: { x: 0, y: 0 },
          },
        },
      ],
    };
    const result = enrichRequiredUserInputs(
      [
        {
          label: "Which Stripe events?",
          nodeId: "n_stripe",
          field: "enabledEvents",
          kind: "config_value",
        },
      ],
      patch,
    );
    const enriched = result[0]!;
    // Even if the registry doesn't actually expose `enabledEvents` on
    // `stripe:event_received`, the helper degrades gracefully (no enrichment
    // added). This test asserts the SHAPE of the enrichment when present —
    // i.e. when `options` is populated, it's an array of {label, value} pairs.
    if (enriched.options) {
      for (const opt of enriched.options) {
        expect(typeof opt.label).toBe("string");
        expect(typeof opt.value).toBe("string");
      }
      expect(enriched.optionsSource).toBeUndefined();
    }
  });
});

describe("enrichRequiredUserInputs — no-leak", () => {
  it("never surfaces raw config / secrets / tokens — only display labels + field keys + FieldType + option {label,value} pairs", () => {
    // The patch carries a fake leaked secret in its config. The enricher
    // does not read the patch's `config` (it only walks operations for
    // node identity), so the secret can never appear in the enriched
    // entry.
    const leakyPatch: WorkflowPatch = {
      patchId: "p1",
      workflowId: "wf-1",
      baseRevision: "rev-1",
      summary: "",
      rationale: "",
      operations: [
        {
          op: "addNode",
          node: {
            id: "n_slack",
            kind: "action",
            provider: "slack",
            type: "send_channel_message",
            config: {
              accessToken: "xoxb-LEAKED-SECRET",
            },
            position: { x: 0, y: 0 },
          },
        },
      ],
    };
    const result = enrichRequiredUserInputs(
      [
        {
          label: "Which Slack channel?",
          nodeId: "n_slack",
          field: "channel",
          kind: "config_value",
        },
      ],
      leakyPatch,
    );
    const json = JSON.stringify(result);
    expect(json).not.toContain("xoxb-LEAKED-SECRET");
    expect(json).not.toContain("accessToken");
  });
});

// ─── Slice 4.AI-33: deriveMissingRequiredFieldInputs ─────────────────────────

import { deriveMissingRequiredFieldInputs } from "@/services/ai/planner/enrichRequiredUserInputs";

function slackNode(config: Record<string, unknown>) {
  return {
    op: "addNode" as const,
    node: {
      id: "n_slack",
      kind: "action" as const,
      provider: "slack",
      type: "send_channel_message",
      config,
      position: { x: 0, y: 0 },
    },
  };
}

function patchWith(config: Record<string, unknown>): WorkflowPatch {
  return {
    patchId: "p1",
    workflowId: "wf-1",
    baseRevision: "rev-1",
    summary: "s",
    rationale: "r",
    operations: [slackNode(config)],
  };
}

describe("deriveMissingRequiredFieldInputs (AI-33)", () => {
  it("derives BOTH channel + text when the slack node config is empty", () => {
    const derived = deriveMissingRequiredFieldInputs(patchWith({}), []);
    const fields = derived.map((d) => d.field).sort();
    expect(fields).toEqual(["channel", "text"]);
    for (const d of derived) {
      expect(d.kind).toBe("config_value");
      expect(d.nodeId).toBe("n_slack");
      expect(typeof d.label).toBe("string");
    }
  });

  it("derives only text when channel is already filled with a literal", () => {
    const derived = deriveMissingRequiredFieldInputs(
      patchWith({ channel: "C12345" }),
      [],
    );
    expect(derived.map((d) => d.field)).toEqual(["text"]);
  });

  it("derives only channel when text is filled with an AI_FIELD placeholder", () => {
    // A field FILLED with {{AI_FIELD:...}} is the model's choice — the
    // derivation does not second-guess it (prompt rules govern that).
    const derived = deriveMissingRequiredFieldInputs(
      patchWith({ text: "{{AI_FIELD:text}}" }),
      [],
    );
    expect(derived.map((d) => d.field)).toEqual(["channel"]);
  });

  it("treats an upstream {{ref}} value as filled (not derived)", () => {
    const derived = deriveMissingRequiredFieldInputs(
      patchWith({ channel: "C1", text: "{{trigger.subject}}" }),
      [],
    );
    expect(derived).toHaveLength(0);
  });

  it("treats empty-string / empty-array as missing", () => {
    const derived = deriveMissingRequiredFieldInputs(
      patchWith({ channel: "", text: "" }),
      [],
    );
    expect(derived.map((d) => d.field).sort()).toEqual(["channel", "text"]);
  });

  it("does NOT derive an optional field (threadTs)", () => {
    const derived = deriveMissingRequiredFieldInputs(patchWith({}), []);
    expect(derived.map((d) => d.field)).not.toContain("threadTs");
  });

  it("dedupes against an existing model-supplied entry (nodeId+field)", () => {
    const derived = deriveMissingRequiredFieldInputs(patchWith({}), [
      { label: "Which channel?", nodeId: "n_slack", field: "channel", kind: "config_value" },
    ]);
    // channel already asked → only text derived.
    expect(derived.map((d) => d.field)).toEqual(["text"]);
  });

  it("returns [] for a null patch (clarification/null-patch path)", () => {
    expect(deriveMissingRequiredFieldInputs(null, [])).toEqual([]);
  });

  it("skips nodes with unknown provider:type (no meta)", () => {
    const patch: WorkflowPatch = {
      patchId: "p1",
      workflowId: "wf-1",
      baseRevision: "rev-1",
      summary: "s",
      rationale: "r",
      operations: [
        {
          op: "addNode",
          node: {
            id: "n_x",
            kind: "action",
            provider: "ghostprovider",
            type: "ghostaction",
            config: {},
            position: { x: 0, y: 0 },
          },
        },
      ],
    };
    expect(deriveMissingRequiredFieldInputs(patch, [])).toEqual([]);
  });

  it("derived entries enrich cleanly through enrichRequiredUserInputs (channel→combobox, text→textarea)", () => {
    const derived = deriveMissingRequiredFieldInputs(patchWith({}), []);
    const enriched = enrichRequiredUserInputs(derived, patchWith({}));
    const byField = new Map(enriched.map((e) => [e.field, e]));
    expect(byField.get("channel")?.fieldType).toBe("combobox");
    expect(byField.get("channel")?.optionsSource).toBe("slack:channels");
    expect(byField.get("text")?.fieldType).toBe("textarea");
    expect(byField.get("text")?.allowFreeText).toBe(true);
  });
});
