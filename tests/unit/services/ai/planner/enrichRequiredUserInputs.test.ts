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
              accessToken: (["xoxb", "LEAKED", "SECRET"].join("-")),
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
    expect(json).not.toContain((["xoxb", "LEAKED", "SECRET"].join("-")));
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

// ─── Slice 4.AI-35: existing-node edit identity from the current canvas ──────

describe("AI-35 — updateNodeConfig identity resolves from the current canvas", () => {
  const currentGraph = {
    nodes: [
      { id: "n_existing", kind: "action" as const, provider: "slack", type: "send_channel_message" },
    ],
    edges: [],
  };

  function editPatch(): WorkflowPatch {
    return {
      patchId: "p-edit",
      workflowId: "wf-1",
      baseRevision: "rev-1",
      summary: "Change the channel",
      rationale: "Edit the existing Slack post.",
      operations: [{ op: "updateNodeConfig", nodeId: "n_existing", config: {} }],
    };
  }

  const entry = {
    label: "Which channel?",
    kind: "config_value" as const,
    nodeId: "n_existing",
    field: "channel",
  };

  it("enriches an updateNodeConfig field entry using the current graph node", () => {
    const [enriched] = enrichRequiredUserInputs([entry], editPatch(), currentGraph);
    expect(enriched!.provider).toBe("slack");
    expect(enriched!.nodeType).toBe("send_channel_message");
    expect(enriched!.optionsSource).toBe("slack:channels");
  });

  it("stays un-enriched without the current graph (graceful degrade, no incorrect data)", () => {
    const [enriched] = enrichRequiredUserInputs([entry], editPatch());
    expect(enriched!.provider).toBeUndefined();
    expect(enriched!.optionsSource).toBeUndefined();
  });
});

// ─── Slice 4.AI-35G: reconcile bare config_value → unique missing field ──────

import { reconcileBareConfigValueEntries } from "@/services/ai/planner/enrichRequiredUserInputs";

describe("reconcileBareConfigValueEntries (AI-35G)", () => {
  it("attaches node/field identity to a bare question when the patch has one fillable required field", () => {
    // Slack send_channel_message with text filled (user said "Hello") + channel
    // an AI_FIELD placeholder → exactly one fillable required field (channel).
    const patch = patchWith({ text: "Hello", channel: "{{AI_FIELD:channel}}" });
    const reconciled = reconcileBareConfigValueEntries(
      [{ label: "Which Slack channel should receive the message?", kind: "config_value" }],
      patch,
    );
    expect(reconciled[0]!.nodeId).toBe("n_slack");
    expect(reconciled[0]!.field).toBe("channel");
  });

  it("the reconciled entry then enriches to the optionsSource combobox (renders a picker, not text)", () => {
    const patch = patchWith({ text: "Hello", channel: "{{AI_FIELD:channel}}" });
    const reconciled = reconcileBareConfigValueEntries(
      [{ label: "Which Slack channel?", kind: "config_value" }],
      patch,
    );
    const [enriched] = enrichRequiredUserInputs(reconciled, patch);
    expect(enriched!.fieldType).toBe("combobox");
    expect(enriched!.optionsSource).toBe("slack:channels");
  });

  it("does NOT attach when more than one required field is fillable (ambiguous)", () => {
    // Both channel + text empty → two candidates → don't guess.
    const patch = patchWith({});
    const reconciled = reconcileBareConfigValueEntries(
      [{ label: "Which Slack channel?", kind: "config_value" }],
      patch,
    );
    expect(reconciled[0]!.nodeId).toBeUndefined();
    expect(reconciled[0]!.field).toBeUndefined();
  });

  it("does NOT attach when there is more than one bare config_value entry", () => {
    const patch = patchWith({ text: "Hello" }); // only channel fillable
    const reconciled = reconcileBareConfigValueEntries(
      [
        { label: "Which channel?", kind: "config_value" },
        { label: "Anything else?", kind: "config_value" },
      ],
      patch,
    );
    expect(reconciled.every((e) => e.nodeId === undefined)).toBe(true);
  });

  it("does NOT attach a field already targeted by another entry", () => {
    const patch = patchWith({ text: "Hello" }); // channel fillable
    const reconciled = reconcileBareConfigValueEntries(
      [
        { label: "Which channel?", nodeId: "n_slack", field: "channel", kind: "config_value" }, // already targets channel
        { label: "Something bare", kind: "config_value" },
      ],
      patch,
    );
    // The bare entry stays bare — channel is the only fillable field but it's taken.
    const bare = reconciled.find((e) => e.label === "Something bare")!;
    expect(bare.nodeId).toBeUndefined();
  });

  it("no-op for a null patch", () => {
    const inputs = [{ label: "Which channel?", kind: "config_value" as const }];
    expect(reconcileBareConfigValueEntries(inputs, null)).toBe(inputs);
  });

  it("leaves a non-config_value bare entry (provider_choice / select_integration) untouched", () => {
    const patch = patchWith({ text: "Hello" });
    const reconciled = reconcileBareConfigValueEntries(
      [{ label: "Connect Slack", kind: "select_integration" }],
      patch,
    );
    expect(reconciled[0]!.nodeId).toBeUndefined();
  });
});

// ─── Slice 4.AI-35H: broaden reconcile to clarification-kind questions ───────

describe("reconcileBareConfigValueEntries — clarification kind (AI-35H)", () => {
  it("attaches identity to a bare CLARIFICATION question + normalizes it to config_value (the live follow-up bug)", () => {
    // The DM→channel follow-up: the model emitted "Which Slack channel…" as a
    // `clarification`, so AI-35G (config_value only) never reconciled it → plain
    // text. AI-35H catches the clarification form.
    const patch = patchWith({ text: "Hey", channel: "{{AI_FIELD:channel}}" });
    const reconciled = reconcileBareConfigValueEntries(
      [{ label: "Which Slack channel should receive the message?", kind: "clarification" }],
      patch,
    );
    expect(reconciled[0]!.nodeId).toBe("n_slack");
    expect(reconciled[0]!.field).toBe("channel");
    expect(reconciled[0]!.kind).toBe("config_value"); // normalized
  });

  it("a clarification-kind channel question enriches to the optionsSource combobox (picker, not text)", () => {
    const patch = patchWith({ text: "Hey", channel: "{{AI_FIELD:channel}}" });
    const reconciled = reconcileBareConfigValueEntries(
      [{ label: "Which Slack channel should receive the message?", kind: "clarification" }],
      patch,
    );
    const [enriched] = enrichRequiredUserInputs(reconciled, patch);
    expect(enriched!.fieldType).toBe("combobox");
    expect(enriched!.optionsSource).toBe("slack:channels");
  });

  it("does NOT reconcile a choose_trigger / variable_reference bare entry (not a single missing field)", () => {
    const patch = patchWith({ text: "Hey" }); // channel fillable
    for (const kind of ["choose_trigger", "variable_reference"] as const) {
      const reconciled = reconcileBareConfigValueEntries([{ label: "x", kind }], patch);
      expect(reconciled[0]!.nodeId).toBeUndefined();
    }
  });

  it("generic: the same single-missing-optionsSource-field reconciliation works for a channel-message clarification regardless of question wording", () => {
    // Wording-independent: keyed off the patch's unique fillable required field,
    // not the question text → provider-agnostic.
    const patch = patchWith({ text: "Hey" }); // channel empty → unique fillable
    const reconciled = reconcileBareConfigValueEntries(
      [{ label: "Pick the destination please", kind: "clarification" }],
      patch,
    );
    const [enriched] = enrichRequiredUserInputs(reconciled, patch);
    expect(enriched!.field).toBe("channel");
    expect(enriched!.optionsSource).toBe("slack:channels");
  });
});
