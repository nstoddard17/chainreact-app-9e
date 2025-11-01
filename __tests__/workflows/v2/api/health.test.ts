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
}))

const helpers = jest.requireMock("@/src/lib/workflows/builder/api/helpers") as jest.Mocked<{
  getRouteClient: jest.Mock
}>

function createSupabaseMock({
  pendingCount,
  lastRun,
}: {
  pendingCount: number
  lastRun: { id: string; status: string; finished_at: string; started_at?: string } | null
}) {
  const pendingResult = { count: pendingCount, error: null }
  const lastRunResult = { data: lastRun, error: null }

  return {
    auth: {
      getUser: jest.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })),
    },
    from: jest.fn((table: string) => {
      if (table !== "flow_v2_runs") {
        throw new Error(`Unexpected table ${table}`)
      }
      return {
        select: jest.fn((_, opts) => {
          if (opts?.head) {
            return {
              in: jest.fn(async () => pendingResult),
            }
          }
          return {
            order: jest.fn(() => ({
              order: jest.fn(() => ({
                limit: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => lastRunResult),
                })),
              })),
            })),
          }
        }),
      }
    }),
  }
}

describe("Flow v2 health endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.FLOW_V2_ENABLED
  })

  it("returns health information", async () => {
    const supabase = createSupabaseMock({
      pendingCount: 2,
      lastRun: {
        id: "run-1",
        status: "success",
        finished_at: "2025-10-27T00:00:00Z",
      },
    })

    helpers.getRouteClient.mockResolvedValue(supabase as any)

    let response: any
    await jest.isolateModulesAsync(async () => {
      const { GET } = await import("@/app/workflows/v2/api/health/route")
      response = await GET()
    })

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toEqual({
      ok: true,
      db: "ok",
      pendingRuns: 2,
      lastRun: {
        id: "run-1",
        status: "success",
        finishedAt: "2025-10-27T00:00:00Z",
      },
    })
  })
})
