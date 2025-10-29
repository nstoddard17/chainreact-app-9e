import { httpTriggerNode } from "@/src/lib/workflows/builder/nodes/httpTrigger"

describe("httpTriggerNode", () => {
  it("wraps the payload", async () => {
    const result = await httpTriggerNode.run({
      input: { payload: { hello: "world" } },
      config: {},
      ctx: { runId: "run", globals: {}, nodeId: "node", attempt: 1 },
    })

    expect(result.output).toEqual({ payload: { hello: "world" } })
  })
})
