import fetchMock from "jest-fetch-mock"

import { httpRequestNode } from "@/src/lib/workflows/builder/nodes/httpRequest"

beforeAll(() => {
  fetchMock.enableMocks()
})

afterEach(() => {
  fetchMock.resetMocks()
})

describe("httpRequestNode", () => {
  it("returns parsed JSON response", async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })

    const result = await httpRequestNode.run({
      input: {},
      config: { method: "GET", url: "https://example.com" },
      ctx: { runId: "run", globals: {}, nodeId: "node", attempt: 1 },
    })

    expect(result.output.status).toBe(200)
    expect(result.output.body).toEqual({ ok: true })
  })
})
