import { mapperNode } from "@/src/lib/workflows/builder/nodes/mapper"

describe("mapperNode", () => {
  it("returns the same object", async () => {
    const input = { payload: { text: "hi" } }
    const result = await mapperNode.run({
      input,
      config: {},
      ctx: { runId: "run", globals: {}, nodeId: "node", attempt: 1 },
    })

    expect(result.output).toEqual(input)
    expect(result.output).not.toBe(input)
  })
})
