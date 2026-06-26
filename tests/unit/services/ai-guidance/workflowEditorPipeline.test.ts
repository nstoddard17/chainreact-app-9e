/**
 * @jest-environment node
 *
 * FULL model-response pipeline for conversational workflow editing (HERMES-AGENT-WORKFLOW-EDITOR-LIVE).
 *
 * This is the proof the feature is REAL: every case drives a genuine MODEL TEXT REPLY (a fenced ```json
 * operations block referencing OPAQUE editable-graph refs) through the ENTIRE server path with ONLY the
 * HTTP transport mocked —
 *
 *   live draft → buildEditableWorkflowGraph (safe graph + private refMap + version)
 *     → buildGatewayGuidancePrompt (the model prompt)
 *     → [mock gateway fetch returns model text]
 *     → requestHermesAgentGuidanceNormalized → normalizeGatewayResponse → extract ops + editVersion
 *     → runWorkflowEditFromModel (stale guard → resolve opaque refs → validate → candidate + preview)
 *     → graphSlice.replaceGraphLocal (explicit Apply → exact graph)
 *
 * NOT a mocked-patch-into-proposeWorkflowMutation shortcut. The operations are parsed from real model
 * text and reference opaque refs the route never lets the model bypass.
 */

// graphSlice (used for the explicit-Apply step) calls the typed client; mock it so no network occurs.
const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => ({
  WorkflowApiError: class WorkflowApiError extends Error {},
  updateWorkflow: (...a: unknown[]) => mockUpdateWorkflow(...a),
}));

import { buildEditableWorkflowGraph } from "@/services/ai-guidance/editableGraph/buildEditableWorkflowGraph";
import { buildGatewayGuidancePrompt } from "@/services/ai-guidance/gateway/buildGatewayGuidancePrompt";
import { requestHermesAgentGuidanceNormalized, type GatewayFetch } from "@/services/ai-guidance/gateway/hermesAgentGatewayClient";
import { runWorkflowEditFromModel, STALE_EDIT_MESSAGE } from "@/services/ai-guidance/mutation/runWorkflowEditFromModel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import type { WorkflowGuidanceRequest } from "@/contracts/aiGuidance";

const CONFIG = { gatewayUrl: "https://gw.example.com", gatewayToken: "tok-GATEWAY-SECRET", timeoutMs: 30000 };
const REQUEST: WorkflowGuidanceRequest = {
  schemaVersion: 1,
  guidanceKind: "workflow_design",
  workflow: { nodeCount: 0, edgeCount: 0, nodes: [], edges: [] },
};
const CATALOG = ["native:manual.run", "slack:send_channel_message", "gmail:send_email", "gmail:new_email", "native:delay"];

// Deterministic id generators so the candidate's new ids are assertable.
let nodeN = 0;
let edgeN = 0;
const GENS = { nodeIdGen: () => `sys-n${++nodeN}`, edgeIdGen: () => `sys-e${++edgeN}` };
beforeEach(() => {
  nodeN = 0;
  edgeN = 0;
  mockUpdateWorkflow.mockReset();
  useGraphSlice.getState().reset();
});

/** manual.run (trig-1) → slack:send_channel_message (slack-1), config carries PRIVATE values. */
function manualSlackDraft(): WorkflowDefinition {
  return {
    nodes: [
      { id: "trig-1", kind: "trigger", provider: "native", type: "manual.run", config: {}, position: { x: 0, y: 0 } },
      { id: "slack-1", kind: "action", provider: "slack", type: "send_channel_message", config: { channel: "C-PRIVATE-1", text: "hush hush" }, position: { x: 0, y: 100 } },
    ],
    edges: [{ id: "ed-1", from: "trig-1", to: "slack-1" }],
  };
}

/** manual.run (trig-1) → slack A (slack-1) and → slack B (slack-2): two similar Slack steps. */
function twoSlackDraft(): WorkflowDefinition {
  return {
    nodes: [
      { id: "trig-1", kind: "trigger", provider: "native", type: "manual.run", config: {}, position: { x: 0, y: 0 } },
      { id: "slack-1", kind: "action", provider: "slack", type: "send_channel_message", config: { channel: "C-A" }, position: { x: 0, y: 100 } },
      { id: "slack-2", kind: "action", provider: "slack", type: "send_channel_message", config: { channel: "C-B" }, position: { x: 200, y: 100 } },
    ],
    edges: [
      { id: "ed-1", from: "trig-1", to: "slack-1" },
      { id: "ed-2", from: "trig-1", to: "slack-2" },
    ],
  };
}

/** Build the OpenAI-style envelope content: prose + a fenced operations block echoing the version. */
function patchReply(version: string | null, ops: unknown[], prose = "Here's the change."): string {
  const body = version ? { editVersion: version, operations: ops } : { operations: ops };
  return `${prose}\n\n\`\`\`json\n${JSON.stringify(body)}\n\`\`\``;
}

interface PipelineOpts {
  readonly currentDraft?: WorkflowDefinition;
  readonly goalText?: string;
}

/** Drive a model reply through the whole server pipeline. Returns the captured prompt + final result. */
async function pipeline(
  draft: WorkflowDefinition,
  makeContent: (version: string) => string,
  opts: PipelineOpts = {},
) {
  const built = buildEditableWorkflowGraph(draft);
  const content = makeContent(built.version);
  let capturedBody = "";
  const fetchImpl: GatewayFetch = async (_url, init) => {
    capturedBody = init.body;
    return { ok: true, status: 200, json: async () => ({ ok: true, response: { choices: [{ message: { content } }] } }), text: async () => "" };
  };
  const normalized = await requestHermesAgentGuidanceNormalized({
    request: REQUEST,
    config: CONFIG,
    goalText: opts.goalText ?? "edit it",
    editableGraph: built.graph,
    capabilityCatalog: CATALOG,
    fetchImpl,
  });
  const edit = runWorkflowEditFromModel(
    {
      currentDraft: opts.currentDraft ?? draft,
      editableGraph: built,
      operations: normalized.ok ? normalized.mutationOperations ?? [] : [],
      ...(normalized.ok && normalized.mutationBaseVersion ? { modelBaseVersion: normalized.mutationBaseVersion } : {}),
    },
    GENS,
  );
  return { built, normalized, edit, prompt: capturedBody };
}

function caps(def: WorkflowDefinition): string[] {
  return def.nodes.map((n) => `${n.provider}:${n.type}`);
}

describe("editor pipeline — the model proposes general edits via opaque refs", () => {
  it("replaces Slack with Gmail using the OPAQUE node refs it was given", async () => {
    const { edit, prompt } = await pipeline(manualSlackDraft(), (v) =>
      patchReply(v, [
        { op: "removeNode", nodeId: "node_2" },
        { op: "addNode", node: { id: "new_email", kind: "action", provider: "gmail", type: "send_email", config: {}, position: { x: 0, y: 0 } } },
        { op: "addEdge", edge: { id: "e_new", from: "node_1", to: "new_email" } },
      ]),
    );
    expect(edit.kind).toBe("proposal");
    if (edit.kind !== "proposal") return;
    expect(caps(edit.proposedDefinition)).toEqual(["native:manual.run", "gmail:send_email"]);
    expect(edit.proposedDefinition.nodes.some((n) => n.provider === "slack")).toBe(false);
    // The prompt presented opaque refs + capability ids, never the real ids/secrets.
    expect(prompt).toContain("node_2");
    expect(prompt).toContain("slack:send_channel_message");
    expect(prompt).not.toContain("slack-1");
  });

  it("adds a delay BEFORE the action by removing the existing edge (edge ref) and re-wiring", async () => {
    const { edit } = await pipeline(manualSlackDraft(), (v) =>
      patchReply(v, [
        { op: "removeEdge", edgeId: "edge_1" },
        { op: "addNode", node: { id: "new_delay", kind: "action", provider: "native", type: "delay", config: {}, position: { x: 0, y: 0 } } },
        { op: "addEdge", edge: { id: "e_a", from: "node_1", to: "new_delay" } },
        { op: "addEdge", edge: { id: "e_b", from: "new_delay", to: "node_2" } },
      ]),
    );
    expect(edit.kind).toBe("proposal");
    if (edit.kind !== "proposal") return;
    expect(caps(edit.proposedDefinition).sort()).toEqual(["native:delay", "native:manual.run", "slack:send_channel_message"]);
    const delayId = edit.proposedDefinition.nodes.find((n) => n.type === "delay")!.id;
    const e = edit.proposedDefinition.edges;
    expect(e.some((x) => x.from === "trig-1" && x.to === delayId)).toBe(true);
    expect(e.some((x) => x.from === delayId && x.to === "slack-1")).toBe(true);
    expect(e.some((x) => x.from === "trig-1" && x.to === "slack-1")).toBe(false); // old direct edge gone
  });

  it("removes ONE of two similar Slack steps by its opaque reference", async () => {
    const { edit } = await pipeline(twoSlackDraft(), (v) => patchReply(v, [{ op: "removeNode", nodeId: "node_3" }]));
    expect(edit.kind).toBe("proposal");
    if (edit.kind !== "proposal") return;
    expect(edit.proposedDefinition.nodes.map((n) => n.id).sort()).toEqual(["slack-1", "trig-1"]);
    expect(edit.proposedDefinition.nodes.some((n) => n.id === "slack-2")).toBe(false);
  });

  it("asks WHICH step (prose only, no operations) when 'remove the Slack step' is ambiguous → draft untouched", async () => {
    const { normalized, edit } = await pipeline(
      twoSlackDraft(),
      () => "You have two Slack steps — the one posting to channel A and the one posting to channel B. Which should I remove?",
      { goalText: "remove the slack step" },
    );
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.mutationOperations).toBeUndefined(); // no patch block → nothing proposed
    expect(normalized.guidanceText).toMatch(/which should I remove/i);
    expect(edit.kind).toBe("noop"); // no proposal → the draft is never changed
  });

  it("updates a SAFE editable config field (merge, preserves siblings)", async () => {
    const { edit } = await pipeline(manualSlackDraft(), (v) =>
      patchReply(v, [{ op: "updateNodeConfig", nodeId: "node_2", config: { channel: "C-NEW" } }]),
    );
    expect(edit.kind).toBe("proposal");
    if (edit.kind !== "proposal") return;
    const slack = edit.proposedDefinition.nodes.find((n) => n.id === "slack-1")!;
    expect(slack.config).toEqual({ channel: "C-NEW", text: "hush hush" });
  });

  it("changes the trigger while preserving + re-wiring the downstream action", async () => {
    const { edit } = await pipeline(manualSlackDraft(), (v) =>
      patchReply(v, [{ op: "replaceTrigger", node: { id: "new_trig", kind: "trigger", provider: "gmail", type: "new_email", config: {}, position: { x: 0, y: 0 } } }]),
    );
    expect(edit.kind).toBe("proposal");
    if (edit.kind !== "proposal") return;
    const triggers = edit.proposedDefinition.nodes.filter((n) => n.kind === "trigger");
    expect(triggers.map((n) => `${n.provider}:${n.type}`)).toEqual(["gmail:new_email"]);
    const trig = triggers[0]!;
    expect(edit.proposedDefinition.nodes.some((n) => n.id === "slack-1")).toBe(true);
    expect(edit.proposedDefinition.edges.some((e) => e.from === trig.id && e.to === "slack-1")).toBe(true);
  });

  it("adds a parallel branch and keeps the graph wired (fan-out from the trigger)", async () => {
    const { edit } = await pipeline(manualSlackDraft(), (v) =>
      patchReply(v, [
        { op: "addNode", node: { id: "new_email", kind: "action", provider: "gmail", type: "send_email", config: {}, position: { x: 0, y: 0 } } },
        { op: "addEdge", edge: { id: "e_branch", from: "node_1", to: "new_email" } },
      ]),
    );
    expect(edit.kind).toBe("proposal");
    if (edit.kind !== "proposal") return;
    expect(caps(edit.proposedDefinition).sort()).toEqual(["gmail:send_email", "native:manual.run", "slack:send_channel_message"]);
    const fromTrigger = edit.proposedDefinition.edges.filter((e) => e.from === "trig-1");
    expect(fromTrigger).toHaveLength(2); // trigger now branches to BOTH actions
  });

  it("performs MULTIPLE operations atomically (config + add + edge in one patch)", async () => {
    const { edit } = await pipeline(manualSlackDraft(), (v) =>
      patchReply(v, [
        { op: "updateNodeConfig", nodeId: "node_2", config: { channel: "C2" } },
        { op: "addNode", node: { id: "new_email", kind: "action", provider: "gmail", type: "send_email", config: {}, position: { x: 0, y: 0 } } },
        { op: "addEdge", edge: { id: "e_chain", from: "node_2", to: "new_email" } },
      ]),
    );
    expect(edit.kind).toBe("proposal");
    if (edit.kind !== "proposal") return;
    expect(edit.proposedDefinition.nodes.find((n) => n.id === "slack-1")!.config).toMatchObject({ channel: "C2" });
    expect(edit.proposedDefinition.nodes.some((n) => n.provider === "gmail")).toBe(true);
    expect(edit.proposedDefinition.edges.some((e) => e.from === "slack-1")).toBe(true);
  });
});

describe("editor pipeline — rejection + stale safety", () => {
  it("rejects an INVENTED node reference (no silent guess) with an actionable message", async () => {
    const { edit } = await pipeline(manualSlackDraft(), (v) => patchReply(v, [{ op: "removeNode", nodeId: "node_99" }]));
    expect(edit.kind).toBe("invalid");
    if (edit.kind !== "invalid") return;
    expect(edit.message).toMatch(/no longer in your current workflow/i);
    expect(edit.message).not.toMatch(/secret|token|credential/i);
    // SAFE: the raw opaque ref ("node_99") must NOT appear in the user-facing message.
    expect(edit.message).not.toContain("node_99");
  });

  it("rejects a STALE patch when the local draft changed since the model read it (snapshot drift)", async () => {
    // The model edited draft A, but the live draft is B (the user added a step meanwhile).
    const changed: WorkflowDefinition = {
      ...manualSlackDraft(),
      nodes: [...manualSlackDraft().nodes, { id: "extra-1", kind: "action", provider: "native", type: "delay", config: { seconds: 5 }, position: { x: 0, y: 0 } }],
    };
    const { edit } = await pipeline(
      manualSlackDraft(),
      (v) => patchReply(v, [{ op: "removeNode", nodeId: "node_2" }]),
      { currentDraft: changed },
    );
    expect(edit.kind).toBe("stale");
    if (edit.kind !== "stale") return;
    expect(edit.message).toBe(STALE_EDIT_MESSAGE);
  });

  it("rejects as STALE when the model echoes a different editVersion than the live draft", async () => {
    const { edit } = await pipeline(manualSlackDraft(), () =>
      // Echo a bogus version that doesn't match the draft the route validates against.
      patchReply("deadbeef", [{ op: "removeNode", nodeId: "node_2" }]),
    );
    expect(edit.kind).toBe("stale");
  });
});

describe("editor pipeline — no secret/credential/private data reaches the model prompt", () => {
  it("the gateway request body carries opaque refs + safe fields only — no real ids, channel, message, or token", async () => {
    const { prompt } = await pipeline(manualSlackDraft(), (v) => patchReply(v, [{ op: "removeNode", nodeId: "node_2" }]));
    // It IS a guidance request body (single safe prompt).
    const body = JSON.parse(prompt) as { prompt: string };
    expect(typeof body.prompt).toBe("string");
    for (const forbidden of ["trig-1", "slack-1", "ed-1", "C-PRIVATE-1", "hush hush", "tok-GATEWAY-SECRET"]) {
      expect({ forbidden, leaked: body.prompt.includes(forbidden) }).toEqual({ forbidden, leaked: false });
    }
    // It DOES present the editable graph with opaque refs + the ref-vs-capability distinction.
    expect(body.prompt).toContain("Editable workflow");
    expect(body.prompt).toContain("node_2");
    expect(body.prompt).toMatch(/opaque REFERENCE/i);
  });
});

describe("editor pipeline — explicit Apply replaces the local draft exactly (+ stale guard)", () => {
  it("a valid proposal applies EXACTLY onto the live draft when the version still matches", async () => {
    const draft = manualSlackDraft();
    const { edit } = await pipeline(draft, (v) =>
      patchReply(v, [
        { op: "removeNode", nodeId: "node_2" },
        { op: "addNode", node: { id: "new_email", kind: "action", provider: "gmail", type: "send_email", config: {}, position: { x: 0, y: 0 } } },
        { op: "addEdge", edge: { id: "e_new", from: "node_1", to: "new_email" } },
      ]),
    );
    expect(edit.kind).toBe("proposal");
    if (edit.kind !== "proposal") return;
    // The proposal auto-previews (a DraftPreview was produced) ...
    expect(edit.previewDraft.nodes.length).toBe(2);
    // ... and explicit Apply REPLACES the local draft with the exact candidate (version still matches).
    useGraphSlice.getState().hydrate("wf-1", draft);
    const outcome = useGraphSlice.getState().replaceGraphLocal(edit.proposedDefinition, { expectedBaseVersion: edit.baseGraphVersion });
    expect(outcome.ok).toBe(true);
    const s = useGraphSlice.getState();
    expect(s.pendingNodes.map((n) => `${n.provider}:${n.type}`)).toEqual(["native:manual.run", "gmail:send_email"]);
    expect(s.pendingNodes.some((n) => n.provider === "slack")).toBe(false);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled(); // NO save / run / activate / network
  });

  it("Apply is REFUSED (stale) when the user edited the canvas after the proposal — draft untouched", async () => {
    const draft = manualSlackDraft();
    const { edit } = await pipeline(draft, (v) => patchReply(v, [{ op: "removeNode", nodeId: "node_2" }]));
    expect(edit.kind).toBe("proposal");
    if (edit.kind !== "proposal") return;
    useGraphSlice.getState().hydrate("wf-1", draft);
    // The user edits the canvas (adds an action) → the live version drifts from the proposal's base.
    useGraphSlice.getState().addAction({ provider: "native", type: "delay", config: { seconds: 3 } });
    const before = useGraphSlice.getState().pendingNodes;
    const outcome = useGraphSlice.getState().replaceGraphLocal(edit.proposedDefinition, { expectedBaseVersion: edit.baseGraphVersion });
    expect(outcome).toEqual({ ok: false, reason: "stale" });
    expect(useGraphSlice.getState().pendingNodes).toBe(before); // unchanged — the user's edit is preserved
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});

describe("editor pipeline — the exact screenshot reply travels the full normalization path", () => {
  it("loose-shaped ops + a Gmail/Outlook question → JSON stripped, NO patch, only the question survives", async () => {
    const screenshotReply = (version: string) =>
      "I can switch the notification to email — should I use Gmail or Outlook? Tell me which and I'll update the preview.\n\n" +
      "```json\n" +
      JSON.stringify({
        editVersion: version,
        operations: [
          { removeEdge: { edgeId: "edge_1" } },
          { removeNode: { nodeId: "node_2" } },
          { addNode: { nodeId: "new_email", providerType: "gmail:send_email" } },
          { addEdge: { edgeId: "edge_2", from: "node_1", to: "new_email" } },
        ],
      }) +
      "\n```";
    const { normalized, edit } = await pipeline(manualSlackDraft(), screenshotReply, { goalText: "change the slack notification to an email instead" });
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    // Raw machine JSON never survives normalization.
    expect(normalized.guidanceText).not.toContain("```");
    expect(normalized.guidanceText).not.toMatch(/"operations"|editVersion|providerType|node_2|new_email/);
    // The contradiction is resolved as clarification: no patch, just the question.
    expect(normalized.mutationOperations).toBeUndefined();
    expect(normalized.guidanceText).toMatch(/gmail or outlook/i);
    expect(edit.kind).toBe("noop");
  });

  it("the 'Use Gmail' follow-up (prose, NO question, loose-but-valid ops) → a real Gmail proposal", async () => {
    const useGmailReply = (version: string) =>
      "Replacing the Slack step with a Gmail email step.\n\n" +
      "```json\n" +
      JSON.stringify({
        editVersion: version,
        operations: [
          { removeEdge: { edgeId: "edge_1" } },
          { removeNode: { nodeId: "node_2" } },
          { addNode: { nodeId: "new_email", providerType: "gmail:send_email" } },
          { addEdge: { edgeId: "ne", from: "node_1", to: "new_email" } },
        ],
      }) +
      "\n```";
    const { normalized, edit } = await pipeline(manualSlackDraft(), useGmailReply, { goalText: "use gmail" });
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.guidanceText).not.toContain("```");
    expect(edit.kind).toBe("proposal");
    if (edit.kind !== "proposal") return;
    expect(caps(edit.proposedDefinition)).toEqual(["native:manual.run", "gmail:send_email"]);
  });
});

describe("editor pipeline — new-workflow guidance is unaffected (no editable block when not editing)", () => {
  it("buildGatewayGuidancePrompt omits the editable-workflow block when no editable graph is supplied", () => {
    const prompt = buildGatewayGuidancePrompt({ request: REQUEST, goalText: "build me a lead workflow", capabilityCatalog: CATALOG });
    expect(prompt).not.toContain("Editable workflow");
    expect(prompt).not.toMatch(/opaque REFERENCE/i);
  });
});
