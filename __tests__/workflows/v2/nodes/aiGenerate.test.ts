import { aiGenerateNode } from "@/src/lib/workflows/builder/nodes/aiGenerate"

describe("aiGenerateNode", () => {
  it("parses JSON output", async () => {
    const result = await aiGenerateNode.run({
      input: {},
      config: { model: "gpt", user: '{"hello": "world"}' },
      ctx: { runId: "run", globals: {}, nodeId: "node", attempt: 1 },
    })

    expect(result.output.json).toEqual({ hello: "world" })
  })

  it("throws helpful error on invalid JSON", async () => {
    await expect(
      aiGenerateNode.run({
        input: {},
        config: { model: "gpt", user: "not json" },
        ctx: { runId: "run", globals: {}, nodeId: "node", attempt: 1 },
      })
    ).rejects.toMatchObject({
      message: expect.stringContaining("valid JSON"),
    })
  })
})
