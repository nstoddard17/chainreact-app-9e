/**
 * Unit tests for POST /api/teams (team creation)
 */

// --- Mocks ---

const mockUser = { id: "user-1", email: "owner@test.com" }

// Supabase query builder helpers
function chainable(overrides: Record<string, any> = {}) {
  const chain: any = {
    select: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    delete: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    single: jest.fn(() => chain),
    order: jest.fn(() => chain),
    in: jest.fn(() => chain),
    ...overrides,
  }
  return chain
}

let mockAuthUser: any = { data: { user: mockUser }, error: null }
let mockRouteHandlerFrom: jest.Mock
let mockServiceFrom: jest.Mock

jest.mock("@/utils/supabase/server", () => ({
  createSupabaseRouteHandlerClient: jest.fn(async () => ({
    auth: { getUser: jest.fn(async () => mockAuthUser) },
    from: (...args: any[]) => mockRouteHandlerFrom(...args),
  })),
  createSupabaseServiceClient: jest.fn(async () => ({
    from: (...args: any[]) => mockServiceFrom(...args),
  })),
}))

jest.mock("@/lib/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}))

let mockRequireFeatureResult: any = { allowed: true }
jest.mock("@/lib/utils/require-entitlement", () => ({
  requireFeature: jest.fn(async () => mockRequireFeatureResult),
}))

jest.mock("next/server", () => ({
  NextRequest: class {
    url: string
    body: any
    constructor(url: string, init?: any) {
      this.url = url
      this.body = init?.body
    }
    async json() {
      return JSON.parse(this.body)
    }
  },
  NextResponse: {
    json: (body: any, init?: any) => ({
      status: init?.status || 200,
      json: async () => body,
      headers: {
        set: jest.fn(),
        get: jest.fn(),
      },
    }),
  },
}))

import { POST } from "@/app/api/teams/route"
import { NextRequest } from "next/server"

function makeRequest(body: Record<string, any>) {
  return new NextRequest("http://localhost/api/teams", {
    body: JSON.stringify(body),
  }) as any
}

describe("POST /api/teams - Create Team", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthUser = { data: { user: mockUser }, error: null }
    mockRouteHandlerFrom = jest.fn()
    mockServiceFrom = jest.fn()
    mockRequireFeatureResult = { allowed: true }
  })

  it("returns 401 when user is not authenticated", async () => {
    mockAuthUser = { data: { user: null }, error: { message: "No session" } }

    const res = await POST(makeRequest({ name: "My Team" }))
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toBe("Unauthorized")
  })

  it("returns 400 when team name is empty", async () => {
    const res = await POST(makeRequest({ name: "" }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe("Team name is required")
  })

  it("returns 400 when team name is missing", async () => {
    const res = await POST(makeRequest({}))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe("Team name is required")
  })

  it("creates team and adds creator as owner", async () => {
    const createdTeam = {
      id: "team-1",
      name: "My Team",
      slug: "my-team-abc123",
      description: null,
      organization_id: null,
      created_by: mockUser.id,
    }

    // Service client: teams.insert + team_members.insert
    mockServiceFrom.mockImplementation((table: string) => {
      if (table === "teams") {
        return chainable({
          single: jest.fn(async () => ({ data: createdTeam, error: null })),
        })
      }
      if (table === "team_members") {
        return chainable({
          insert: jest.fn(async () => ({ error: null })),
        })
      }
      return chainable()
    })

    const res = await POST(makeRequest({ name: "My Team" }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.team.name).toBe("My Team")
    expect(body.team.user_role).toBe("owner")
    expect(body.team.member_count).toBe(1)
  })

  it("creates team with description", async () => {
    const createdTeam = {
      id: "team-2",
      name: "Dev Team",
      slug: "dev-team-xyz789",
      description: "Our development team",
      organization_id: null,
      created_by: mockUser.id,
    }

    mockServiceFrom.mockImplementation((table: string) => {
      if (table === "teams") {
        return chainable({
          single: jest.fn(async () => ({ data: createdTeam, error: null })),
        })
      }
      if (table === "team_members") {
        return chainable({
          insert: jest.fn(async () => ({ error: null })),
        })
      }
      return chainable()
    })

    const res = await POST(
      makeRequest({ name: "Dev Team", description: "Our development team" })
    )
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.team.description).toBe("Our development team")
  })

  it("verifies org membership when organization_id is provided", async () => {
    const orgMembershipChain = chainable({
      single: jest.fn(async () => ({
        data: { role: "admin" },
        error: null,
      })),
    })

    // Route handler client: org membership check
    mockRouteHandlerFrom.mockImplementation((table: string) => {
      if (table === "organization_members") return orgMembershipChain
      return chainable()
    })

    const createdTeam = {
      id: "team-3",
      name: "Org Team",
      slug: "org-team-abc",
      description: null,
      organization_id: "org-1",
      created_by: mockUser.id,
    }

    mockServiceFrom.mockImplementation((table: string) => {
      if (table === "teams") {
        return chainable({
          single: jest.fn(async () => ({ data: createdTeam, error: null })),
        })
      }
      if (table === "team_members") {
        return chainable({
          insert: jest.fn(async () => ({ error: null })),
        })
      }
      return chainable()
    })

    const res = await POST(
      makeRequest({ name: "Org Team", organization_id: "org-1" })
    )
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(orgMembershipChain.eq).toHaveBeenCalledWith(
      "organization_id",
      "org-1"
    )
  })

  it("returns 403 when user has no org access", async () => {
    mockRouteHandlerFrom.mockImplementation((table: string) => {
      if (table === "organization_members") {
        return chainable({
          single: jest.fn(async () => ({
            data: null,
            error: { message: "not found" },
          })),
        })
      }
      return chainable()
    })

    const res = await POST(
      makeRequest({ name: "Org Team", organization_id: "org-1" })
    )
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toContain("don't have access")
  })

  it("cleans up team if adding member fails", async () => {
    const deleteChain = chainable()

    mockServiceFrom.mockImplementation((table: string) => {
      if (table === "teams") {
        const c = chainable({
          single: jest.fn(async () => ({
            data: { id: "team-cleanup", name: "Fail" },
            error: null,
          })),
        })
        c.delete = jest.fn(() => deleteChain)
        return c
      }
      if (table === "team_members") {
        return chainable({
          insert: jest.fn(async () => ({
            error: { message: "insert failed" },
          })),
        })
      }
      return chainable()
    })

    const res = await POST(makeRequest({ name: "Fail Team" }))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(deleteChain.eq).toHaveBeenCalledWith("id", "team-cleanup")
  })
})
