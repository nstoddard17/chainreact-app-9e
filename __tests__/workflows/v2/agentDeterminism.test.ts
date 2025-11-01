import crypto from "crypto"

import { applyAgentPrompt } from "@/src/lib/workflows/compat/v2Adapter"

jest.mock("@/src/lib/workflows/compat/v2Adapter", () => {
  const actual = jest.requireActual("@/src/lib/workflows/compat/v2Adapter")
  return {
    ...actual,
    applyAgentPrompt: jest.fn(),
  }
})

describe("FlowV2 agent planner determinism", () => {
  const editsFixture = [
    { op: "addNode", node: { id: "node-1", type: "http.trigger" } },
    { op: "connect", edge: { from: { nodeId: "node-1" }, to: { nodeId: "node-2" } } },
    { op: "setConfig", nodeId: "node-2", patch: { url: "https://example.com" } },
  ]

  const hash = (payload: unknown) =>
    crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex")

  beforeEach(() => {
    ;(applyAgentPrompt as jest.Mock).mockResolvedValue({
      flow: { id: "flow-test", nodes: [], edges: [], version: 1 },
      edits: editsFixture,
    })
  })

  it("returns identical edit hashes for the same prompt", async () => {
    const first = hash((await applyAgentPrompt("flow-test", "make webhook to slack")).edits)
    const second = hash((await applyAgentPrompt("flow-test", "make webhook to slack")).edits)

    expect(first).toEqual(second)
  })
})
