/**
 * Unit tests for GET /api/teams (list user's teams)
 */

const mockUser = { id: "user-1", email: "owner@test.com" }

function chainable(overrides: Record<string, any> = {}) {
  const chain: any = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    order: jest.fn(() => chain),
    single: jest.fn(() => chain),
    in: jest.fn(() => chain),
    ...overrides,
  }
  return chain
}

let mockAuthUser: any
let mockRouteHandlerFrom: jest.Mock

jest.mock("@/utils/supabase/server", () => ({
  createSupabaseRouteHandlerClient: jest.fn(async () => ({
    auth: { getUser: jest.fn(async () => mockAuthUser) },
    from: (...args: any[]) => mockRouteHandlerFrom(...args),
  })),
}))

jest.mock("@/lib/utils/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}))

jest.mock("next/server", () => ({
  NextRequest: class {
    url: string
    constructor(url: string) { this.url = url }
  },
  NextResponse: {
    json: (body: any, init?: any) => ({
      status: init?.status || 200,
      json: async () => body,
      headers: { set: jest.fn(), get: jest.fn() },
    }),
  },
}))

import { GET } from "@/app/api/teams/route"
import { NextRequest } from "next/server"

function makeRequest(query = "") {
  return new NextRequest(`http://localhost/api/teams${query}`) as any
}

describe("GET /api/teams - List Teams", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthUser = { data: { user: mockUser }, error: null }
    mockRouteHandlerFrom = jest.fn()
  })

  it("returns 401 when user is not authenticated", async () => {
    mockAuthUser = { data: { user: null }, error: { message: "No session" } }

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toBe("Unauthorized")
  })

  it("returns user's teams", async () => {
    const teams = [
      { id: "team-1", name: "Alpha", team_members: [{ role: "owner", joined_at: "2026-01-01" }] },
      { id: "team-2", name: "Beta", team_members: [{ role: "member", joined_at: "2026-02-01" }] },
    ]

    mockRouteHandlerFrom.mockImplementation(() =>
      chainable({
        order: jest.fn(async () => ({ data: teams, error: null })),
      })
    )

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.teams).toHaveLength(2)
    expect(body.teams[0].name).toBe("Alpha")
  })

  it("filters by organization_id when provided", async () => {
    const eqMock = jest.fn()

    mockRouteHandlerFrom.mockImplementation(() => {
      const c = chainable({
        order: jest.fn(async () => ({ data: [], error: null })),
      })
      c.eq = jest.fn(() => c)
      eqMock.mockImplementation(c.eq)
      return c
    })

    const res = await GET(makeRequest("?organization_id=org-1"))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.teams).toEqual([])
  })

  it("returns empty array when user has no teams", async () => {
    mockRouteHandlerFrom.mockImplementation(() =>
      chainable({
        order: jest.fn(async () => ({ data: [], error: null })),
      })
    )

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.teams).toEqual([])
  })

  it("returns 500 on database error", async () => {
    mockRouteHandlerFrom.mockImplementation(() =>
      chainable({
        order: jest.fn(async () => ({
          data: null,
          error: { message: "DB error", details: null, hint: null, code: "500" },
        })),
      })
    )

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toBe("DB error")
  })
})
