/**
 * Config-level diff for the React Agent preview review rail
 * (HERMES-AGENT-CONFIG-DIFF-REVIEW).
 *
 * These tests protect the rules the right-rail "Review changes" panel depends on:
 * a user must be able to see exactly what config the agent added / changed /
 * removed, what is still missing, and what variables it references — WITHOUT any
 * secret value ever entering the diff, and with `0`/`false`/`""` handled per the
 * Q5 explicit-value rule. The parity test pins the diff's node STATUS to the
 * canvas diff (`buildPreviewDiffGraph`) so the two surfaces can never disagree.
 */
import type { WorkflowNode } from "@/contracts/workflow";
import { buildConfigDiff } from "@/core/workflows/buildConfigDiff";
import type { ConfigDiffFieldMetaByType } from "@/core/workflows/configDiffFieldMeta";
import { buildPreviewDiffGraph } from "@/features/workflow-builder/utils/buildPreviewDiffGraph";

function node(
  id: string,
  provider: string,
  type: string,
  config: Record<string, unknown> = {},
  kind: "trigger" | "action" = "action",
): WorkflowNode {
  return { id, kind, provider, type, config, position: { x: 0, y: 0 } } as WorkflowNode;
}

/** A small metadata map for a `provider:type` so tests can assert labels / required / secret. */
function meta(
  key: string,
  displayName: string,
  fields: ReadonlyArray<{ name: string; label?: string; required?: boolean; secret?: boolean; hasDefault?: boolean }>,
): ConfigDiffFieldMetaByType {
  const out: Record<string, { label: string; required: boolean; secret: boolean; hasDefault: boolean }> = {};
  for (const f of fields) {
    out[f.name] = {
      label: f.label ?? f.name,
      required: f.required ?? false,
      secret: f.secret ?? false,
      hasDefault: f.hasDefault ?? false,
    };
  }
  // The helper returns a single-type map; merge several with object spread when needed.
  return {
    [key]: {
      displayName,
      fields: Object.fromEntries(
        Object.entries(out).map(([name, m]) => [name, { name, ...m }]),
      ),
    },
  };
}

describe("buildConfigDiff — added node", () => {
  it("lists the set config fields of an added node as added fields, omitting empty values", () => {
    const candidate = node("gmail-1", "gmail", "send_email", {
      subject: "Welcome",
      body: "Hi there",
      to: "", // empty → not a set field, surfaces only as missing-required below
    });
    const fieldMeta = meta("gmail:send_email", "Gmail / Send Email", [
      { name: "subject", label: "Subject" },
      { name: "body", label: "Body" },
      { name: "to", label: "To", required: true },
    ]);

    const diff = buildConfigDiff({ current: { nodes: [] }, candidate: { nodes: [candidate] }, fieldMetaByType: fieldMeta });

    expect(diff.nodes).toHaveLength(1);
    const added = diff.nodes[0]!;
    expect(added.status).toBe("added");
    expect(added.label).toBe("Gmail / Send Email");
    const names = added.addedFields.map((f) => f.name).sort();
    expect(names).toEqual(["body", "subject"]);
    // `to` is required but empty → reported as a setup gap, never as an "added field".
    expect(added.missingRequiredFields).toEqual([{ name: "to", label: "To" }]);
  });
});

describe("buildConfigDiff — removed node", () => {
  it("summarizes the removed node's set config as removed fields", () => {
    const current = node("slack-1", "slack", "send_message", {
      channel: "#alerts",
      message: "New lead: Acme",
    });
    const diff = buildConfigDiff({ current: { nodes: [current] }, candidate: { nodes: [] } });

    expect(diff.nodes).toHaveLength(1);
    const removed = diff.nodes[0]!;
    expect(removed.status).toBe("removed");
    const names = removed.removedFields.map((f) => f.name).sort();
    expect(names).toEqual(["channel", "message"]);
    // Removed nodes never report missing-required (they are going away).
    expect(removed.missingRequiredFields).toEqual([]);
  });
});

describe("buildConfigDiff — changed node", () => {
  it("reports a changed field as before → after", () => {
    const current = node("slack-1", "slack", "send_message", { channel: "#support", message: "New ticket" });
    const candidate = node("slack-1", "slack", "send_message", { channel: "#sales", message: "New VIP ticket" });

    const diff = buildConfigDiff({ current: { nodes: [current] }, candidate: { nodes: [candidate] } });

    expect(diff.nodes).toHaveLength(1);
    const changed = diff.nodes[0]!;
    expect(changed.status).toBe("changed");
    const channel = changed.changedFields.find((f) => f.name === "channel")!;
    expect(channel.before).toEqual({ kind: "text", preview: "#support", truncated: false });
    expect(channel.after).toEqual({ kind: "text", preview: "#sales", truncated: false });
  });

  it("classifies a field added/removed within a changed node", () => {
    const current = node("a1", "slack", "send_message", { channel: "#a", oldOnly: "gone" });
    const candidate = node("a1", "slack", "send_message", { channel: "#a", newOnly: "added" });

    const diff = buildConfigDiff({ current: { nodes: [current] }, candidate: { nodes: [candidate] } });
    const changed = diff.nodes[0]!;
    expect(changed.addedFields.map((f) => f.name)).toEqual(["newOnly"]);
    expect(changed.removedFields.map((f) => f.name)).toEqual(["oldOnly"]);
    expect(changed.changedFields).toEqual([]);
  });
});

describe("buildConfigDiff — variables", () => {
  it("extracts the {{...}} references used in changed/added config values", () => {
    const current = node("a1", "slack", "send_message", { message: "hello" });
    const candidate = node("a1", "slack", "send_message", {
      message: "Hi {{trigger.name}}, ticket {{trigger.email}}",
    });

    const diff = buildConfigDiff({ current: { nodes: [current] }, candidate: { nodes: [candidate] } });
    expect([...diff.nodes[0]!.variablesUsed].sort()).toEqual(["{{trigger.email}}", "{{trigger.name}}"]);
  });
});

describe("buildConfigDiff — secret redaction", () => {
  it("redacts secret fields and never carries the raw value anywhere in the result", () => {
    const SECRET = "SUPERSECRET-abc123";
    const current = node("hook-1", "webhook", "call", { url: "https://a.test", apiKey: "OLD-SECRET" });
    const candidate = node("hook-1", "webhook", "call", { url: "https://b.test", apiKey: SECRET });
    const fieldMeta = meta("webhook:call", "Webhook", [
      { name: "url", label: "URL" },
      { name: "apiKey", label: "API Key", secret: true },
    ]);

    const diff = buildConfigDiff({ current: { nodes: [current] }, candidate: { nodes: [candidate] }, fieldMetaByType: fieldMeta });
    const changed = diff.nodes[0]!;
    const apiKey = changed.changedFields.find((f) => f.name === "apiKey")!;
    expect(apiKey.secret).toBe(true);
    expect(apiKey.before).toEqual({ kind: "redacted" });
    expect(apiKey.after).toEqual({ kind: "redacted" });
    // The raw secret value must not appear ANYWHERE in the serialized diff.
    expect(JSON.stringify(diff)).not.toContain(SECRET);
    expect(JSON.stringify(diff)).not.toContain("OLD-SECRET");
  });

  it("redacts a secret-shaped key even without metadata", () => {
    const current = node("hook-1", "webhook", "call", { accessToken: "AAA" });
    const candidate = node("hook-1", "webhook", "call", { accessToken: "BBB" });
    const diff = buildConfigDiff({ current: { nodes: [current] }, candidate: { nodes: [candidate] } });
    const change = diff.nodes[0]!.changedFields.find((f) => f.name === "accessToken")!;
    expect(change.secret).toBe(true);
    expect(JSON.stringify(diff)).not.toContain("AAA");
    expect(JSON.stringify(diff)).not.toContain("BBB");
  });
});

describe("buildConfigDiff — Q5 explicit values (0, false, empty string)", () => {
  it("treats 0 and false as set values (not missing) and shows them", () => {
    const candidate = node("a1", "native", "delay", { seconds: 0, enabled: false });
    const fieldMeta = meta("native:delay", "Delay", [
      { name: "seconds", label: "Seconds", required: true },
      { name: "enabled", label: "Enabled", required: true },
    ]);
    const diff = buildConfigDiff({ current: { nodes: [] }, candidate: { nodes: [candidate] }, fieldMetaByType: fieldMeta });
    const added = diff.nodes[0]!;
    // 0 and false are explicit → listed as added fields, never reported missing.
    expect(added.addedFields.map((f) => f.name).sort()).toEqual(["enabled", "seconds"]);
    expect(added.addedFields.find((f) => f.name === "seconds")!.after).toEqual({ kind: "scalar", value: 0 });
    expect(added.addedFields.find((f) => f.name === "enabled")!.after).toEqual({ kind: "scalar", value: false });
    expect(added.missingRequiredFields).toEqual([]);
  });

  it("treats empty string as not-set: a required empty field is a setup gap, not an added field", () => {
    const candidate = node("a1", "gmail", "send_email", { to: "" });
    const fieldMeta = meta("gmail:send_email", "Gmail", [{ name: "to", label: "To", required: true }]);
    const diff = buildConfigDiff({ current: { nodes: [] }, candidate: { nodes: [candidate] }, fieldMetaByType: fieldMeta });
    const added = diff.nodes[0]!;
    expect(added.addedFields).toEqual([]);
    expect(added.missingRequiredFields).toEqual([{ name: "to", label: "To" }]);
  });

  it("does not report a required field that declares a metadata default", () => {
    const candidate = node("a1", "sheets", "append", {});
    const fieldMeta = meta("sheets:append", "Sheets", [
      { name: "valueInputOption", label: "Value input", required: true, hasDefault: true },
    ]);
    const diff = buildConfigDiff({ current: { nodes: [] }, candidate: { nodes: [candidate] }, fieldMetaByType: fieldMeta });
    expect(diff.nodes[0]!.missingRequiredFields).toEqual([]);
  });
});

describe("buildConfigDiff — object/array summarization", () => {
  it("summarizes object/array values instead of dumping JSON", () => {
    const current = node("a1", "slack", "send_message", { blocks: [{ a: 1 }], opts: { x: 1 } });
    const candidate = node("a1", "slack", "send_message", { blocks: [{ a: 1 }, { b: 2 }], opts: { x: 2 } });
    const diff = buildConfigDiff({ current: { nodes: [current] }, candidate: { nodes: [candidate] } });
    const changed = diff.nodes[0]!;
    expect(changed.changedFields.find((f) => f.name === "blocks")!.after).toEqual({ kind: "summary", summary: "2 items" });
    expect(changed.changedFields.find((f) => f.name === "opts")!.after).toEqual({ kind: "summary", summary: "advanced value" });
  });

  it("drops internal (_-prefixed) keys from the diff", () => {
    const candidate = node("a1", "slack", "send_message", { channel: "#x", _internal: "noise" });
    const diff = buildConfigDiff({ current: { nodes: [] }, candidate: { nodes: [candidate] } });
    expect(diff.nodes[0]!.addedFields.map((f) => f.name)).toEqual(["channel"]);
  });
});

describe("buildConfigDiff — parity with buildPreviewDiffGraph node status", () => {
  it("classifies added/changed/removed/unchanged identically to the canvas diff", () => {
    const current = {
      nodes: [
        node("t1", "native", "manual", {}, "trigger"),
        node("keep", "slack", "send_message", { channel: "#a" }),
        node("edit", "slack", "send_message", { channel: "#a" }),
        node("gone", "discord", "send_message", { channel: "x" }),
        node("swap", "slack", "send_message", { channel: "#a" }),
      ],
      edges: [],
    };
    const candidate = {
      nodes: [
        node("t1", "native", "manual", {}, "trigger"),
        node("keep", "slack", "send_message", { channel: "#a" }), // unchanged
        node("edit", "slack", "send_message", { channel: "#b" }), // changed
        node("new", "gmail", "send_email", { subject: "Hi" }), // added
        node("swap", "gmail", "send_email", { subject: "Hi" }), // capability swap (same id) → removed+added
      ],
      edges: [],
    };

    const canvas = buildPreviewDiffGraph(current, candidate);
    // Canvas-side status per node id (it re-keys the swap's added node, so compare by underlying intent).
    const canvasStatuses = new Map<string, string>();
    for (const n of canvas.nodes) {
      const baseId = n.id.includes("::replacement-") ? n.id.split("::")[0]! : n.id;
      // Unchanged is omitted from the value diff; collapse swap added-id back to its base for comparison.
      if (n.diffStatus === "added" && baseId === "swap") canvasStatuses.set("swap:added", "added");
      else if (n.diffStatus === "removed" && n.id === "swap") canvasStatuses.set("swap:removed", "removed");
      else canvasStatuses.set(`${n.id}:${n.diffStatus}`, n.diffStatus);
    }

    const value = buildConfigDiff({ current, candidate });
    const valueStatuses = new Map(value.nodes.map((n) => [`${n.nodeId}:${n.status}`, n.status]));

    // Every value-diff node has a matching canvas status (added/changed/removed).
    expect(valueStatuses.get("edit:changed")).toBe("changed");
    expect(valueStatuses.get("new:added")).toBe("added");
    expect(valueStatuses.get("gone:removed")).toBe("removed");
    expect(valueStatuses.get("swap:added")).toBe("added");
    expect(valueStatuses.get("swap:removed")).toBe("removed");
    // Unchanged + trigger are omitted from the value diff (no noise).
    expect(value.nodes.find((n) => n.nodeId === "keep")).toBeUndefined();
    expect(value.nodes.find((n) => n.nodeId === "t1")).toBeUndefined();

    // The canvas marks the same set of structural changes.
    expect(canvas.nodes.find((n) => n.id === "edit")!.diffStatus).toBe("changed");
    expect(canvas.nodes.find((n) => n.id === "new")!.diffStatus).toBe("added");
    expect(canvas.nodes.find((n) => n.id === "gone")!.diffStatus).toBe("removed");
    expect(canvas.nodes.find((n) => n.id === "keep")!.diffStatus).toBe("unchanged");
  });
});
