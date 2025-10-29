import fetchMock from "jest-fetch-mock"

import { notifyNode } from "@/src/lib/workflows/builder/nodes/notify"

beforeAll(() => {
  fetchMock.enableMocks()
})

afterEach(() => {
  fetchMock.resetMocks()
})

describe("notifyNode", () => {
  it("sends payload to webhook", async () => {
    fetchMock.mockResponseOnce("ok")

    const result = await notifyNode.run({
      input: {},
      config: { webhookUrl: "https://hooks", text: "hi" },
      ctx: { runId: "run", globals: {}, nodeId: "node", attempt: 1 },
    })

    expect(fetchMock).toHaveBeenCalledWith("https://hooks", expect.any(Object))
    expect(result.output).toEqual({ ok: true })
  })

  it("throws when no destination configured", async () => {
    await expect(
      notifyNode.run({
        input: {},
        config: {},
        ctx: { runId: "run", globals: {}, nodeId: "node", attempt: 1 },
      })
    ).rejects.toThrow(/requires either webhookUrl or to/)
  })
})
