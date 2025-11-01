jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: any) => ({
      json: async () => body,
    }),
  },
}))

import { GET } from "@/app/workflows/v2/api/demo/blank/route"

const insertMock = jest.fn().mockResolvedValue({ error: null })
const createRevisionMock = jest.fn().mockResolvedValue({
  id: "rev-1",
  graph: {
    id: "flow-1",
    name: "Blank Flow v2",
    version: 1,
    nodes: [],
    edges: [],
    trigger: { type: "manual", enabled: true },
    interface: { inputs: [], outputs: [] },
  },
  version: 1,
})

jest.mock("@/src/lib/workflows/builder/api/helpers", () => ({
  getServiceClient: jest.fn(async () => ({
    from: () => ({
      insert: insertMock,
    }),
  })),
  getFlowRepository: jest.fn(async () => ({
    createRevision: createRevisionMock,
  })),
  uuid: jest.fn(() => "flow-1"),
}))

describe("GET /workflows/v2/api/demo/blank", () => {
  it("returns ok with flow and revision ids", async () => {
    const response = await GET()
    const payload = await response.json()

    expect(insertMock).toHaveBeenCalled()
    expect(createRevisionMock).toHaveBeenCalledWith({
      flowId: "flow-1",
      flow: expect.objectContaining({ id: "flow-1" }),
      version: 1,
    })

    expect(payload).toMatchObject({ ok: true, flowId: "flow-1", revisionId: "rev-1" })
  })
})
