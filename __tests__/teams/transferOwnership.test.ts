/**
 * Unit tests for POST /api/teams/[id]/transfer-ownership
 */

const mockUser = { id: "owner-1", email: "owner@test.com" }
const teamId = "team-1"

function chainable(overrides: Record<string, any> = {}) {
  const chain: any = {
    select: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    update: jest.fn(() => chain),
    delete: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    single: jest.fn(() => chain),
    order: jest.fn(() => chain),
    in: jest.fn(() => chain),
    ...overrides,
  }
  return chain
}

let mockAuthUser: any
let serviceTableHandler: (table: string) => any

// Mock global fetch for activity logging
const mockFetch = jest.fn(async () => ({ ok: true }))
global.fetch = mockFetch as any

jest.mock("@/utils/supabase/server", () => ({
  createSupabaseRouteHandlerClient: jest.fn(async () => ({
    auth: { getUser: jest.fn(async () => mockAuthUser) },
  })),
  createSupabaseServiceClient: jest.fn(async () => ({
    from: (table: string) => serviceTableHandler(table),
  })),
}))

jest.mock("@/lib/utils/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}))

jest.mock("next/server", () => ({
  NextRequest: class {
    url: string
    body: any
    _headers: Map<string, string>
    headers: { get: (key: string) => string | null }
    constructor(url: string, init?: any) {
      this.url = url
      this.body = init?.body
      this._headers = new Map()
      this.headers = { get: (key: string) => this._headers.get(key) || null }
    }
    async json() { return JSON.parse(this.body) }
  },
  NextResponse: {
    json: (body: any, init?: any) => ({
      status: init?.status || 200,
      json: async () => body,
      headers: { set: jest.fn(), get: jest.fn() },
    }),
  },
}))

import { POST } from "@/app/api/teams/[id]/transfer-ownership/route"
import { NextRequest } from "next/server"

function makeRequest(body: Record<string, any>) {
  return new NextRequest(`http://localhost/api/teams/${teamId}/transfer-ownership`, {
    body: JSON.stringify(body),
  }) as any
}

function makeParams() {
  return { params: Promise.resolve({ id: teamId }) }
}

let teamMemberCallCount: number

describe("POST /api/teams/[id]/transfer-ownership", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthUser = { data: { user: mockUser }, error: null }
    teamMemberCallCount = 0
  })

  it("returns 401 when not authenticated", async () => {
    mockAuthUser = { data: { user: null }, error: { message: "No session" } }
    serviceTableHandler = () => chainable()

    const res = await POST(makeRequest({ new_owner_id: "user-2" }), makeParams())
    const body = await res.json()

    expect(res.status).toBe(401)
  })

  it("returns 400 when new_owner_id is missing", async () => {
    serviceTableHandler = () => chainable()

    const res = await POST(makeRequest({}), makeParams())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe("new_owner_id is required")
  })

  it("returns 403 when current user is not the owner", async () => {
    serviceTableHandler = (table: string) => {
      if (table === "team_members") {
        return chainable({
          single: jest.fn(async () => ({ data: { role: "admin" }, error: null })),
        })
      }
      return chainable()
    }

    const res = await POST(makeRequest({ new_owner_id: "user-2" }), makeParams())
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toContain("Only the team owner")
  })

  it("returns 400 when new owner is not a team member", async () => {
    serviceTableHandler = (table: string) => {
      if (table === "team_members") {
        const call = teamMemberCallCount++
        if (call === 0) {
          // Current user is owner
          return chainable({
            single: jest.fn(async () => ({ data: { role: "owner" }, error: null })),
          })
        }
        // New owner not found
        return chainable({
          single: jest.fn(async () => ({ data: null, error: null })),
        })
      }
      return chainable()
    }

    const res = await POST(makeRequest({ new_owner_id: "user-2" }), makeParams())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain("must be a member")
  })

  it("successfully transfers ownership", async () => {
    serviceTableHandler = (table: string) => {
      if (table === "team_members") {
        const call = teamMemberCallCount++
        if (call === 0) {
          // Current user is owner
          return chainable({
            single: jest.fn(async () => ({ data: { role: "owner" }, error: null })),
          })
        }
        if (call === 1) {
          // New owner is a member
          return chainable({
            single: jest.fn(async () => ({ data: { role: "member" }, error: null })),
          })
        }
        // Update calls — .update().eq().eq() chain resolves with { error }
        const updateChain: any = {
          update: jest.fn(() => updateChain),
          eq: jest.fn(() => updateChain),
          then: (fn: any) => Promise.resolve({ error: null }).then(fn),
        }
        return updateChain
      }
      if (table === "teams") {
        const updateChain: any = {
          update: jest.fn(() => updateChain),
          eq: jest.fn(() => updateChain),
          then: (fn: any) => Promise.resolve({ error: null }).then(fn),
        }
        return updateChain
      }
      if (table === "user_profiles") {
        return chainable({
          single: jest.fn(async () => ({
            data: { email: "newowner@test.com", full_name: "New Owner" },
            error: null,
          })),
        })
      }
      return chainable()
    }

    const res = await POST(makeRequest({ new_owner_id: "user-2" }), makeParams())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.message).toBe("Ownership transferred successfully")
    expect(body.new_owner_id).toBe("user-2")
  })

  it("logs activity after successful transfer", async () => {
    serviceTableHandler = (table: string) => {
      if (table === "team_members") {
        const call = teamMemberCallCount++
        if (call === 0) {
          return chainable({
            single: jest.fn(async () => ({ data: { role: "owner" }, error: null })),
          })
        }
        if (call === 1) {
          return chainable({
            single: jest.fn(async () => ({ data: { role: "admin" }, error: null })),
          })
        }
        const updateChain: any = {
          update: jest.fn(() => updateChain),
          eq: jest.fn(() => updateChain),
          then: (fn: any) => Promise.resolve({ error: null }).then(fn),
        }
        return updateChain
      }
      if (table === "teams") {
        const updateChain: any = {
          update: jest.fn(() => updateChain),
          eq: jest.fn(() => updateChain),
          then: (fn: any) => Promise.resolve({ error: null }).then(fn),
        }
        return updateChain
      }
      if (table === "user_profiles") {
        return chainable({
          single: jest.fn(async () => ({
            data: { email: "newowner@test.com", full_name: "New Owner" },
            error: null,
          })),
        })
      }
      return chainable()
    }

    await POST(makeRequest({ new_owner_id: "user-2" }), makeParams())

    // Verify activity log was posted
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/teams/${teamId}/activity`),
      expect.objectContaining({ method: "POST" })
    )
  })

  it("returns 500 when updating new owner role fails", async () => {
    serviceTableHandler = (table: string) => {
      if (table === "team_members") {
        const call = teamMemberCallCount++
        if (call === 0) {
          return chainable({
            single: jest.fn(async () => ({ data: { role: "owner" }, error: null })),
          })
        }
        if (call === 1) {
          return chainable({
            single: jest.fn(async () => ({ data: { role: "member" }, error: null })),
          })
        }
        // Update new owner fails
        return chainable({
          eq: jest.fn(async () => ({ error: { message: "update failed" } })),
        })
      }
      return chainable()
    }

    const res = await POST(makeRequest({ new_owner_id: "user-2" }), makeParams())
    const body = await res.json()

    expect(res.status).toBe(500)
  })
})
