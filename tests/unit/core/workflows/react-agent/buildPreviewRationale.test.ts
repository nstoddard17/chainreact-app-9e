/**
 * buildPreviewRationale — deterministic "Why this change?" rationale for the React Agent preview
 * review rail (REACT-AGENT-PREVIEW-WHY).
 *
 * These tests protect the business rules that make the "why" layer safe and trustworthy:
 *   - it explains the proposal from the user's prompt + the deterministic diff status ONLY;
 *   - it labels added / removed / changed nodes and surfaces still-missing required fields;
 *   - it credits a PRESERVED trigger only when something else changed (no "kept everything" noise);
 *   - it NEVER invents reasoning ("better choice"), NEVER claims a copy, and NEVER leaks a config
 *     value, before/after value, or secret into a bullet — labels and the user's own prompt only.
 */
import { buildPreviewRationale } from "@/core/workflows/buildPreviewRationale";
import type { ConfigDiff } from "@/core/workflows/buildConfigDiff";
import type { WorkflowNode } from "@/contracts/workflow";

function node(partial: Partial<WorkflowNode> & Pick<WorkflowNode, "id" | "kind" | "provider" | "type">): WorkflowNode {
  return { config: {}, position: { x: 0, y: 0 }, ...partial } as WorkflowNode;
}

const trigger = node({ id: "t1", kind: "trigger", provider: "native", type: "manual.run" });

// A diff: a Gmail step added (missing required "To"), a Slack step removed.
const replaceDiff: ConfigDiff = {
  nodes: [
    {
      nodeId: "gmail-1",
      provider: "gmail",
      type: "send_email",
      label: "Gmail / Send Email",
      status: "added",
      addedFields: [
        { name: "subject", label: "Subject", secret: false, after: { kind: "text", preview: "Welcome", truncated: false } },
      ],
      changedFields: [],
      removedFields: [],
      missingRequiredFields: [{ name: "to", label: "To" }],
      variablesUsed: [],
    },
    {
      nodeId: "slack-1",
      provider: "slack",
      type: "send_message",
      label: "Slack / Send Channel Message",
      status: "removed",
      addedFields: [],
      changedFields: [],
      removedFields: [
        { name: "channel", label: "Channel", secret: false, before: { kind: "text", preview: "#support", truncated: false } },
      ],
      missingRequiredFields: [],
      variablesUsed: [],
    },
  ],
};

describe("buildPreviewRationale (REACT-AGENT-PREVIEW-WHY)", () => {
  it("echoes the user's prompt verbatim as the request_match bullet", () => {
    const r = buildPreviewRationale({
      prompt: "Send an email instead of a Slack message",
      configDiff: replaceDiff,
      current: { nodes: [trigger] },
      candidate: { nodes: [trigger] },
    });
    const request = r.bullets.find((b) => b.kind === "request_match");
    expect(request?.text).toBe('You asked: "Send an email instead of a Slack message"');
  });

  it("omits the request_match bullet when there is no prompt", () => {
    const r = buildPreviewRationale({
      configDiff: replaceDiff,
      current: { nodes: [trigger] },
      candidate: { nodes: [trigger] },
    });
    expect(r.bullets.some((b) => b.kind === "request_match")).toBe(false);
  });

  it("produces an added / removed / changed bullet per diffed node using node labels", () => {
    const changedDiff: ConfigDiff = {
      nodes: [
        {
          nodeId: "slack-1",
          provider: "slack",
          type: "send_message",
          label: "Slack / Send Channel Message",
          status: "changed",
          addedFields: [],
          changedFields: [
            { name: "channel", label: "Channel", secret: false, before: { kind: "text", preview: "#support", truncated: false }, after: { kind: "text", preview: "#sales", truncated: false } },
          ],
          removedFields: [],
          missingRequiredFields: [],
          variablesUsed: [],
        },
      ],
    };
    const added = buildPreviewRationale({ configDiff: replaceDiff, current: { nodes: [trigger] }, candidate: { nodes: [trigger] } });
    expect(added.bullets.find((b) => b.kind === "node_added")?.text).toBe("Added Gmail / Send Email.");
    expect(added.bullets.find((b) => b.kind === "node_removed")?.text).toBe("Removed Slack / Send Channel Message.");

    const changed = buildPreviewRationale({ configDiff: changedDiff, current: { nodes: [trigger] }, candidate: { nodes: [trigger] } });
    const changedBullet = changed.bullets.find((b) => b.kind === "node_changed");
    expect(changedBullet?.text).toBe("Updated Slack / Send Channel Message.");
    expect(changedBullet?.nodeId).toBe("slack-1");
  });

  it("emits a needs_user_input bullet for each still-missing required field (label only)", () => {
    const r = buildPreviewRationale({ configDiff: replaceDiff, current: { nodes: [trigger] }, candidate: { nodes: [trigger] } });
    const missing = r.bullets.find((b) => b.kind === "needs_user_input");
    expect(missing?.text).toBe("Gmail / Send Email still needs To.");
    expect(missing?.fieldPath).toBe("to");
    expect(missing?.nodeId).toBe("gmail-1");
  });

  it("credits a preserved trigger only when something else changed", () => {
    const r = buildPreviewRationale({
      configDiff: replaceDiff,
      current: { nodes: [trigger] },
      candidate: { nodes: [trigger] },
    });
    const preserved = r.bullets.find((b) => b.kind === "preserved");
    expect(preserved?.text).toBe("Kept the native:manual.run trigger.");
    expect(preserved?.nodeId).toBe("t1");
  });

  it("does NOT credit a preserved trigger when nothing else changed (no 'kept everything' noise)", () => {
    const noChange = buildPreviewRationale({
      prompt: "do nothing",
      configDiff: { nodes: [] },
      current: { nodes: [trigger] },
      candidate: { nodes: [trigger] },
    });
    expect(noChange.bullets.some((b) => b.kind === "preserved")).toBe(false);
    // Only the request echo survives — no invented change bullets.
    expect(noChange.bullets.map((b) => b.kind)).toEqual(["request_match"]);
  });

  it("does NOT credit a trigger that was itself replaced (different provider:type) as preserved", () => {
    const replacedTriggerDiff: ConfigDiff = {
      nodes: [
        { nodeId: "t1", provider: "slack", type: "new_message", label: "Slack trigger", status: "added", addedFields: [], changedFields: [], removedFields: [], missingRequiredFields: [], variablesUsed: [] },
      ],
    };
    const newTrigger = node({ id: "t1", kind: "trigger", provider: "slack", type: "new_message" });
    const r = buildPreviewRationale({
      configDiff: replacedTriggerDiff,
      current: { nodes: [trigger] },
      candidate: { nodes: [newTrigger] },
    });
    expect(r.bullets.some((b) => b.kind === "preserved")).toBe(false);
  });

  it("never leaks a config value, before/after value, or secret into any bullet (no-leak)", () => {
    const secretDiff: ConfigDiff = {
      nodes: [
        {
          nodeId: "hook-1",
          provider: "webhook",
          type: "call",
          label: "Webhook",
          status: "changed",
          addedFields: [],
          changedFields: [
            { name: "apiKey", label: "API Key", secret: true, before: { kind: "redacted" }, after: { kind: "redacted" } },
            { name: "channel", label: "Channel", secret: false, before: { kind: "text", preview: "#support", truncated: false }, after: { kind: "text", preview: "#sales", truncated: false } },
          ],
          removedFields: [],
          missingRequiredFields: [],
          variablesUsed: ["{{trigger.email}}"],
        },
      ],
    };
    const r = buildPreviewRationale({
      prompt: "rotate the key and retarget the channel",
      configDiff: secretDiff,
      current: { nodes: [trigger] },
      candidate: { nodes: [trigger] },
    });
    const text = r.bullets.map((b) => b.text).join("\n");
    // Field/node LABELS are allowed; raw config VALUES are not.
    expect(text).not.toContain("#support");
    expect(text).not.toContain("#sales");
    expect(text).not.toContain("{{trigger.email}}");
    expect(text.toLowerCase()).not.toContain("secret");
  });

  it("never claims a copy and never invents reasoning ('better' / 'recommend')", () => {
    const r = buildPreviewRationale({
      prompt: "replace slack with gmail",
      configDiff: replaceDiff,
      current: { nodes: [trigger] },
      candidate: { nodes: [trigger] },
    });
    const text = r.bullets.map((b) => b.text).join(" ").toLowerCase();
    expect(r.bullets.some((b) => (b.kind as string) === "copied")).toBe(false);
    expect(text).not.toContain("copied");
    expect(text).not.toContain("better");
    expect(text).not.toContain("recommend");
    expect(text).not.toContain("i chose");
  });

  it("carries the agent summary through for display only (not a bullet source)", () => {
    const r = buildPreviewRationale({
      summary: "Replace the Slack step with a Gmail email.",
      configDiff: replaceDiff,
      current: { nodes: [trigger] },
      candidate: { nodes: [trigger] },
    });
    expect(r.summary).toBe("Replace the Slack step with a Gmail email.");
    // The summary text is never turned into a bullet.
    expect(r.bullets.some((b) => b.text === r.summary)).toBe(false);
  });

  it("returns an empty bullet list (nothing to explain) for a null diff and no prompt", () => {
    const r = buildPreviewRationale({ configDiff: null, current: { nodes: [trigger] }, candidate: { nodes: [trigger] } });
    expect(r.bullets).toEqual([]);
    expect(r.title).toBe("Why this change?");
  });

  it("truncates a very long prompt so the rationale stays short", () => {
    const longPrompt = "x".repeat(400);
    const r = buildPreviewRationale({ prompt: longPrompt, configDiff: replaceDiff, current: { nodes: [trigger] }, candidate: { nodes: [trigger] } });
    const request = r.bullets.find((b) => b.kind === "request_match");
    expect(request?.text).toContain("…");
    expect(request?.text.length).toBeLessThan(longPrompt.length);
  });
});

/** A changed-node diff whose Slack step retargets `channel` (recipient) and edits `message` (cosmetic). */
const slackAction = node({ id: "slack-1", kind: "action", provider: "slack", type: "send_message" });
const channelAndMessageDiff: ConfigDiff = {
  nodes: [
    {
      nodeId: "slack-1",
      provider: "slack",
      type: "send_message",
      label: "Slack / Send Channel Message",
      status: "changed",
      addedFields: [],
      changedFields: [
        { name: "channel", label: "Channel", secret: false, before: { kind: "text", preview: "#support", truncated: false }, after: { kind: "text", preview: "#sales", truncated: false } },
        { name: "message", label: "Message", secret: false, before: { kind: "text", preview: "Old body", truncated: false }, after: { kind: "text", preview: "New body", truncated: false } },
      ],
      removedFields: [],
      missingRequiredFields: [],
      variablesUsed: [],
    },
  ],
};

describe("buildPreviewRationale — field-level reasons (REACT-AGENT-PREVIEW-FIELD-REASONS)", () => {
  it("produces a field reason for a high-risk recipient field and NOT for a cosmetic field", () => {
    const r = buildPreviewRationale({
      configDiff: channelAndMessageDiff,
      current: { nodes: [trigger, slackAction] },
      candidate: { nodes: [trigger, slackAction] },
    });
    const channel = r.fieldReasons.find((f) => f.fieldPath === "channel");
    expect(channel).toMatchObject({ nodeId: "slack-1", category: "recipient", status: "changed", fieldLabel: "Channel" });
    expect(channel?.text).toBe("Channel changed: controls where this sends.");
    // The message body is cosmetic — no field reason (avoids noisy output).
    expect(r.fieldReasons.some((f) => f.fieldPath === "message")).toBe(false);
  });

  it("uses declarative metadata sensitivity to flag a recipient + a connection field", () => {
    const diff: ConfigDiff = {
      nodes: [
        {
          nodeId: "acme-1",
          provider: "acme",
          type: "call",
          label: "Acme / Call",
          status: "changed",
          addedFields: [],
          changedFields: [
            { name: "dest", label: "Destination", secret: false, before: { kind: "empty" }, after: { kind: "text", preview: "x", truncated: false } },
            { name: "acct", label: "Account", secret: false, before: { kind: "empty" }, after: { kind: "text", preview: "y", truncated: false } },
          ],
          removedFields: [],
          missingRequiredFields: [],
          variablesUsed: [],
        },
      ],
    };
    const node1 = node({ id: "acme-1", kind: "action", provider: "acme", type: "call" });
    const r = buildPreviewRationale({
      configDiff: diff,
      current: { nodes: [trigger, node1] },
      candidate: { nodes: [trigger, node1] },
      fieldMetaByType: {
        "acme:call": {
          displayName: "Acme / Call",
          fields: {
            dest: { name: "dest", label: "Destination", required: true, hasDefault: false, secret: false, sensitivity: "recipient" },
            acct: { name: "acct", label: "Account", required: true, hasDefault: false, secret: true, sensitivity: "connection" },
          },
        },
      },
    });
    expect(r.fieldReasons.find((f) => f.fieldPath === "dest")?.category).toBe("recipient");
    expect(r.fieldReasons.find((f) => f.fieldPath === "acct")?.category).toBe("connection");
  });

  it("flags any changed field on a TRIGGER as trigger_config (affects when it fires)", () => {
    const triggerNode = node({ id: "trg-1", kind: "trigger", provider: "gmail", type: "new_email" });
    const diff: ConfigDiff = {
      nodes: [
        {
          nodeId: "trg-1",
          provider: "gmail",
          type: "new_email",
          label: "Gmail / New Email",
          status: "changed",
          addedFields: [],
          changedFields: [
            { name: "labelFilter", label: "Label filter", secret: false, before: { kind: "text", preview: "Inbox", truncated: false }, after: { kind: "text", preview: "Support", truncated: false } },
          ],
          removedFields: [],
          missingRequiredFields: [],
          variablesUsed: [],
        },
      ],
    };
    const r = buildPreviewRationale({ configDiff: diff, current: { nodes: [triggerNode] }, candidate: { nodes: [triggerNode] } });
    const reason = r.fieldReasons.find((f) => f.fieldPath === "labelFilter");
    expect(reason?.category).toBe("trigger_config");
    expect(reason?.text).toBe("Label filter changed: affects when this runs.");
  });

  it("flags a secret field as the 'secret' category without leaking any value", () => {
    const diff: ConfigDiff = {
      nodes: [
        {
          nodeId: "hook-1",
          provider: "webhook",
          type: "call",
          label: "Webhook",
          status: "changed",
          addedFields: [],
          changedFields: [
            { name: "apiKey", label: "API Key", secret: true, before: { kind: "redacted" }, after: { kind: "redacted" } },
          ],
          removedFields: [],
          missingRequiredFields: [],
          variablesUsed: [],
        },
      ],
    };
    const node1 = node({ id: "hook-1", kind: "action", provider: "webhook", type: "call" });
    const r = buildPreviewRationale({ configDiff: diff, current: { nodes: [trigger, node1] }, candidate: { nodes: [trigger, node1] } });
    const reason = r.fieldReasons.find((f) => f.fieldPath === "apiKey");
    expect(reason?.category).toBe("secret");
    expect(reason?.text).toBe("API Key changed: credential or auth material.");
  });

  it("never leaks a raw before/after value or secret into any field-reason text (no-leak)", () => {
    const r = buildPreviewRationale({
      configDiff: channelAndMessageDiff,
      current: { nodes: [trigger, slackAction] },
      candidate: { nodes: [trigger, slackAction] },
    });
    const text = r.fieldReasons.map((f) => f.text).join("\n");
    expect(text).not.toContain("#support");
    expect(text).not.toContain("#sales");
    expect(text).not.toContain("Old body");
    expect(text).not.toContain("New body");
  });

  it("returns empty fieldReasons when no high-risk field changed", () => {
    const diff: ConfigDiff = {
      nodes: [
        {
          nodeId: "slack-1",
          provider: "slack",
          type: "send_message",
          label: "Slack / Send Channel Message",
          status: "changed",
          addedFields: [],
          changedFields: [
            { name: "message", label: "Message", secret: false, before: { kind: "text", preview: "a", truncated: false }, after: { kind: "text", preview: "b", truncated: false } },
          ],
          removedFields: [],
          missingRequiredFields: [],
          variablesUsed: [],
        },
      ],
    };
    const r = buildPreviewRationale({ configDiff: diff, current: { nodes: [trigger, slackAction] }, candidate: { nodes: [trigger, slackAction] } });
    expect(r.fieldReasons).toEqual([]);
  });
});
