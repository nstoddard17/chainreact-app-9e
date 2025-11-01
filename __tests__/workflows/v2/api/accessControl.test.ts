jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: any, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}))

jest.mock("@/src/lib/workflows/builder/api/helpers", () => ({
  getRouteClient: jest.fn(),
  getFlowRepository: jest.fn(),
  getServiceClient: jest.fn(),
  ensureNodeRegistry: jest.fn(),
  uuid: jest.fn(() => "run-123"),
  createRunStore: jest.fn(),
}))

const helpers = jest.requireMock("@/src/lib/workflows/builder/api/helpers") as jest.Mocked<{
  getRouteClient: jest.Mock
  getFlowRepository: jest.Mock
}>

function createSupabaseMock({
  user,
  definition,
}: {
  user: { id: string } | null
  definition: { data: any; error: any }
}) {
  const definitionResponse = definition

  return {
    auth: {
      getUser: jest.fn(async () => ({ data: { user }, error: null })),
    },
    from: jest.fn((table: string) => {
      if (table !== "flow_v2_definitions") {
        throw new Error(`Unexpected table ${table}`)
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(async () => definitionResponse),
      }
    }),
  }
}

describe("Flow v2 access controls", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.FLOW_V2_ENABLED
  })

  it("allows members to list revisions", async () => {
    const supabase = createSupabaseMock({
      user: { id: "user-1" },
      definition: { data: { id: "flow-1" }, error: null },
    })

    helpers.getRouteClient.mockResolvedValue(supabase as any)
    helpers.getFlowRepository.mockResolvedValue({
      listRevisions: jest.fn().mockResolvedValue([{ id: "rev-1" }]),
    })

    let response: any
    await jest.isolateModulesAsync(async () => {
      const { GET } = await import("@/app/workflows/v2/api/flows/[flowId]/revisions/route")
      response = await GET(new Request("http://localhost"), { params: { flowId: "flow-1" } })
    })

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toMatchObject({ ok: true, revisions: [{ id: "rev-1" }] })
  })

  it("hides flows outside the member workspace", async () => {
    const supabase = createSupabaseMock({
      user: { id: "user-1" },
      definition: { data: null, error: null },
    })

    helpers.getRouteClient.mockResolvedValue(supabase as any)
    helpers.getFlowRepository.mockResolvedValue({
      listRevisions: jest.fn(),
    })

    let response: any
    await jest.isolateModulesAsync(async () => {
      const { GET } = await import("@/app/workflows/v2/api/flows/[flowId]/revisions/route")
      response = await GET(new Request("http://localhost"), { params: { flowId: "flow-1" } })
    })

    expect(response.status).toBe(404)
    const payload = await response.json()
    expect(payload.ok).toBe(false)
  })

  it("honors the flow v2 feature flag", async () => {
    process.env.FLOW_V2_ENABLED = "false"

    let response: any
    await jest.isolateModulesAsync(async () => {
      const { GET } = await import("@/app/workflows/v2/api/flows/[flowId]/revisions/route")
      response = await GET(new Request("http://localhost"), { params: { flowId: "flow-1" } })
    })

    expect(response.status).toBe(404)
    const payload = await response.json()
    expect(payload).toMatchObject({ ok: false, code: "flow_v2_disabled" })
  })
})
