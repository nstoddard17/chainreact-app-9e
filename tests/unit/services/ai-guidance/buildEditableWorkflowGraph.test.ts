/**
 * @jest-environment node
 *
 * Model-facing EDITABLE GRAPH contract + no-leak (HERMES-AGENT-WORKFLOW-EDITOR-LIVE).
 *
 * Pins the EXACT serialization the conversational-editor model is given: required opaque references +
 * role/provider/type/capabilityKey + safe display description + the SAFE editable config fields and the
 * graph connections by ref + a version token — while proving every FORBIDDEN class is excluded (real
 * ids, credentials/connection fields, secrets, OAuth/secret values, hidden/undeclared config, the user's
 * own node label, and `{{realId}}` variable tokens). This is the contract the boundary test pins.
 */

import { buildEditableWorkflowGraph } from "@/services/ai-guidance/editableGraph/buildEditableWorkflowGraph";
import { getActionMeta } from "@/services/discovery/_registry";
import { EDITABLE_GRAPH_SCHEMA_VERSION } from "@/contracts/editableWorkflowGraph";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";

/**
 * A draft that deliberately carries EVERY forbidden class: real ids, a `connection` field
 * (google-analytics accountId), a `secret` field (apiSecret), an undeclared/hidden config key, a
 * private channel id, message text, a `{{realId.path}}` variable token, and a user node displayName.
 */
function sensitiveDraft(): WorkflowDefinition {
  return {
    nodes: [
      {
        id: "trig-real-id-AAA",
        kind: "trigger",
        provider: "native",
        type: "manual.run",
        config: {},
        position: { x: 0, y: 0 },
        displayName: "My Private Trigger Label",
      },
      {
        id: "ga-real-id-BBB",
        kind: "action",
        provider: "google-analytics",
        type: "send_event",
        config: {
          accountId: "ACCT-PRIVATE-123", // sensitivity: connection → DROP
          apiSecret: "sk-SUPERSECRETKEY1234567890", // sensitivity: secret → DROP
          measurementId: "G-PRIVATE-MID", // combobox → key only, no value
          clientId: "client-PRIVATE-9", // text → key only, no value
          eventName: "purchase_private", // text → key only, no value
          eventParams: '{"v":"PRIVATE"}', // textarea → key only, no value
          undeclaredHiddenKey: "INTERNAL-ONLY-VALUE", // not in meta → DROP entirely
        },
        position: { x: 0, y: 0 },
      },
      {
        id: "delay-real-id-CCC",
        kind: "action",
        provider: "native",
        type: "delay",
        config: { seconds: 12 }, // number → value SAFE to echo
        position: { x: 0, y: 0 },
      },
      {
        id: "slack-real-id-DDD",
        kind: "action",
        provider: "slack",
        type: "send_channel_message",
        config: { channel: "C-PRIVATE-XYZ", text: "Hello {{ga-real-id-BBB.eventName}} team" },
        position: { x: 0, y: 0 },
      },
    ],
    edges: [
      { id: "edge-real-1", from: "trig-real-id-AAA", to: "ga-real-id-BBB" },
      { id: "edge-real-2", from: "ga-real-id-BBB", to: "delay-real-id-CCC" },
      { id: "edge-real-3", from: "delay-real-id-CCC", to: "slack-real-id-DDD" },
    ],
  };
}

describe("buildEditableWorkflowGraph — required contract", () => {
  it("stamps schema version + a deterministic version token + opaque refs + counts", () => {
    const { graph, version } = buildEditableWorkflowGraph(sensitiveDraft());
    expect(graph.schemaVersion).toBe(EDITABLE_GRAPH_SCHEMA_VERSION);
    expect(typeof version).toBe("string");
    expect(version.length).toBeGreaterThan(0);
    expect(graph.version).toBe(version);
    expect(graph.nodeCount).toBe(4);
    expect(graph.edgeCount).toBe(3);
    expect(graph.nodes.map((n) => n.ref)).toEqual(["node_1", "node_2", "node_3", "node_4"]);
    // Deterministic: same draft → same version.
    expect(buildEditableWorkflowGraph(sensitiveDraft()).version).toBe(version);
  });

  it("maps each opaque ref back to the real node id PRIVATELY (refMap, never on the graph)", () => {
    const { graph, refMap } = buildEditableWorkflowGraph(sensitiveDraft());
    expect(refMap.get("node_1")).toBe("trig-real-id-AAA");
    expect(refMap.get("node_2")).toBe("ga-real-id-BBB");
    expect(refMap.get("node_4")).toBe("slack-real-id-DDD");
    // The graph itself carries no real ids.
    expect(JSON.stringify(graph)).not.toContain("real-id");
  });

  it("carries role/provider/type/capabilityKey + the SAFE catalog description (not the user label)", () => {
    const { graph } = buildEditableWorkflowGraph(sensitiveDraft());
    const ga = graph.nodes[1]!;
    expect(ga.role).toBe("action");
    expect(ga.provider).toBe("google-analytics");
    expect(ga.type).toBe("send_event");
    expect(ga.capabilityKey).toBe("google-analytics:send_event");
    // Description is the CATALOG display name, never the user's own node displayName.
    expect(ga.description).toBe(getActionMeta("google-analytics:send_event")!.displayName);
  });

  it("surfaces ONLY registry-declared, non-secret/non-connection config fields (allow-list)", () => {
    const { graph } = buildEditableWorkflowGraph(sensitiveDraft());
    const ga = graph.nodes[1]!;
    const keys = ga.config.map((f) => f.key);
    // Declared, non-sensitive → present.
    expect(keys).toEqual(expect.arrayContaining(["measurementId", "clientId", "eventName", "eventParams"]));
    // connection / secret / undeclared → never present.
    expect(keys).not.toContain("accountId"); // sensitivity: connection
    expect(keys).not.toContain("apiSecret"); // sensitivity: secret
    expect(keys).not.toContain("undeclaredHiddenKey"); // not in registry meta
  });

  it("echoes a VALUE only for low-risk primitive types; redacts free-text / channels to presence", () => {
    const { graph } = buildEditableWorkflowGraph(sensitiveDraft());
    const delaySeconds = graph.nodes[2]!.config.find((f) => f.key === "seconds")!;
    expect(delaySeconds.isSet).toBe(true);
    expect(delaySeconds.value).toBe(12); // number → echoed (supports "change the threshold")

    const slack = graph.nodes[3]!;
    const channel = slack.config.find((f) => f.key === "channel")!;
    expect(channel.isSet).toBe(true); // model knows it's set ("change this channel") …
    expect(channel.value).toBeUndefined(); // … but the private channel id is never echoed
    const text = slack.config.find((f) => f.key === "text")!;
    expect(text.isSet).toBe(true);
    expect(text.value).toBeUndefined(); // message text (with a {{realId}} token) never echoed
  });

  it("renders connections by opaque node + edge refs (never real ids)", () => {
    const { graph, edgeRefMap } = buildEditableWorkflowGraph(sensitiveDraft());
    expect(graph.edges.map((e) => e.ref)).toEqual(["edge_1", "edge_2", "edge_3"]);
    expect(graph.edges[0]).toMatchObject({ ref: "edge_1", fromRef: "node_1", toRef: "node_2" });
    for (const e of graph.edges) {
      expect(e.fromRef.startsWith("node_")).toBe(true);
      expect(e.toRef.startsWith("node_")).toBe(true);
    }
    // Edge refs map back to real edge ids PRIVATELY.
    expect(edgeRefMap.get("edge_1")).toBe("edge-real-1");
  });

  it("NO-LEAK — the serialized graph contains NO forbidden value class", () => {
    const { graph } = buildEditableWorkflowGraph(sensitiveDraft());
    const blob = JSON.stringify(graph);
    const forbidden = [
      // real node / edge ids
      "trig-real-id-AAA", "ga-real-id-BBB", "delay-real-id-CCC", "slack-real-id-DDD",
      "edge-real-1", "edge-real-2", "edge-real-3",
      // credential / connection / secret VALUES + keys
      "ACCT-PRIVATE-123", "accountId", "apiSecret", "sk-SUPERSECRETKEY1234567890",
      // private config values that must stay presence-only
      "G-PRIVATE-MID", "client-PRIVATE-9", "purchase_private", "PRIVATE",
      "C-PRIVATE-XYZ", "Hello", "{{ga-real-id-BBB.eventName}}", "{{ga-real-id",
      // hidden/undeclared config + user node label
      "undeclaredHiddenKey", "INTERNAL-ONLY-VALUE", "My Private Trigger Label",
    ];
    for (const needle of forbidden) {
      expect({ needle, leaked: blob.includes(needle) }).toEqual({ needle, leaked: false });
    }
  });
});
