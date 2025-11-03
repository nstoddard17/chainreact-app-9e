import { planEdits } from "@/src/lib/workflows/builder/agent/planner"
import { FlowSchema } from "@/src/lib/workflows/builder/schema"

const blankFlow = FlowSchema.parse({
  id: "flow-1",
  name: "Test",
  version: 1,
  nodes: [],
  edges: [],
  trigger: { type: "manual", enabled: true },
  interface: { inputs: [], outputs: [] },
})

describe("planEdits", () => {
  it("adds AI and notify nodes for Slack prompt", async () => {
    const result = await planEdits({ prompt: "Create HTTP -> AI(JSON) -> Slack summary", flow: blankFlow })
    const types = result.edits
      .filter((edit) => edit.op === "addNode")
      .map((edit) => edit.node.type)
    expect(types).toEqual(expect.arrayContaining(["http.trigger", "ai.generate", "notify.dispatch"]))
  })
})
