import { ifSwitchNode } from "@/src/lib/workflows/builder/nodes/ifSwitch"

describe("ifSwitchNode", () => {
  it("returns true branch when predicate resolves truthy", async () => {
    const result = await ifSwitchNode.run({
      input: { amount: 10 },
      config: { predicateExpr: "inputs.amount > 5" },
      ctx: { runId: "run", globals: {}, nodeId: "node", attempt: 1 },
    })

    expect(result.output.branch).toBe("true")
  })

  it("returns false branch when predicate is false", async () => {
    const result = await ifSwitchNode.run({
      input: { amount: 3 },
      config: { predicateExpr: "inputs.amount > 5" },
      ctx: { runId: "run", globals: {}, nodeId: "node", attempt: 1 },
    })

    expect(result.output.branch).toBe("false")
  })
})
