/**
 * Unit tests for GET/PUT/DELETE /api/teams/[id] (team details, update, delete)
 */

const mockUser = { id: "user-1", email: "owner@test.com" }
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
let mockRouteHandlerFrom: jest.Mock
let serviceTableHandler: (table: string) => any

jest.mock("@/utils/supabase/server", () => ({
  createSupabaseRouteHandlerClient: jest.fn(async () => ({
    auth: { getUser: jest.fn(async () => mockAuthUser) },
    from: (...args: any[]) => mockRouteHandlerFrom(...args),
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
    constructor(url: string, init?: any) {
      this.url = url
      this.body = init?.body
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

import { GET, PUT, DELETE } from "@/app/api/teams/[id]/route"
import { NextRequest } from "next/server"

function makeRequest(body?: Record<string, any>) {
  return new NextRequest(`http://localhost/api/teams/${teamId}`, {
    ...(body ? { body: JSON.stringify(body) } : {}),
  }) as any
}

function makeParams() {
  return { params: Promise.resolve({ id: teamId }) }
}

let teamMemberCallCount: number

// --- GET (team details) ---

describe("GET /api/teams/[id] - Team Details", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthUser = { data: { user: mockUser }, error: null }
    mockRouteHandlerFrom = jest.fn()
    teamMemberCallCount = 0
  })

  it("returns 401 when not authenticated", async () => {
    mockAuthUser = { data: { user: null }, error: { message: "No session" } }

    const res = await GET(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(401)
  })

  it("returns 404 when user is not a team member", async () => {
    serviceTableHandler = (table: string) => {
      if (table === "team_members") {
        return chainable({
          single: jest.fn(async () => ({ data: null, error: { message: "not found" } })),
        })
      }
      return chainable()
    }

    const res = await GET(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe("Team not found")
  })

  it("returns team details with member count and user role", async () => {
    const team = {
      id: teamId,
      name: "Test Team",
      description: "A test team",
      organization_id: null,
      created_by: mockUser.id,
    }

    serviceTableHandler = (table: string) => {
      if (table === "team_members") {
        const call = teamMemberCallCount++
        if (call === 0) {
          // Membership check
          return chainable({
            single: jest.fn(async () => ({ data: { role: "owner" }, error: null })),
          })
        }
        // Member count
        return chainable({
          eq: jest.fn(async () => ({ count: 3 })),
        })
      }
      if (table === "teams") {
        return chainable({
          single: jest.fn(async () => ({ data: team, error: null })),
        })
      }
      if (table === "user_profiles") {
        return chainable({
          single: jest.fn(async () => ({
            data: { plan: "pro", tasks_used: 5, tasks_limit: 100 },
            error: null,
          })),
        })
      }
      return chainable()
    }

    const res = await GET(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.name).toBe("Test Team")
    expect(body.user_role).toBe("owner")
    expect(body.member_count).toBe(3)
    expect(body.billing.billing_source).toBe("owner")
  })

  it("returns org billing source for organization teams", async () => {
    const team = {
      id: teamId,
      name: "Org Team",
      organization_id: "org-1",
      created_by: mockUser.id,
    }

    serviceTableHandler = (table: string) => {
      if (table === "team_members") {
        const call = teamMemberCallCount++
        if (call === 0) {
          return chainable({
            single: jest.fn(async () => ({ data: { role: "admin" }, error: null })),
          })
        }
        return chainable({
          eq: jest.fn(async () => ({ count: 5 })),
        })
      }
      if (table === "teams") {
        return chainable({
          single: jest.fn(async () => ({ data: team, error: null })),
        })
      }
      return chainable()
    }

    const res = await GET(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.billing.billing_source).toBe("organization")
  })
})

// --- PUT (update team) ---

describe("PUT /api/teams/[id] - Update Team", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthUser = { data: { user: mockUser }, error: null }
    mockRouteHandlerFrom = jest.fn()
    teamMemberCallCount = 0
  })

  it("returns 401 when not authenticated", async () => {
    mockAuthUser = { data: { user: null }, error: { message: "No session" } }

    const res = await PUT(makeRequest({ name: "New Name" }), makeParams())
    const body = await res.json()

    expect(res.status).toBe(401)
  })

  it("returns 400 when name is empty", async () => {
    const res = await PUT(makeRequest({ name: "" }), makeParams())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe("Team name is required")
  })

  it("returns 403 when user is not admin/owner", async () => {
    serviceTableHandler = (table: string) => {
      if (table === "team_members") {
        return chainable({
          single: jest.fn(async () => ({ data: { role: "member" }, error: null })),
        })
      }
      return chainable()
    }

    const res = await PUT(makeRequest({ name: "New Name" }), makeParams())
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toContain("don't have permission")
  })

  it("successfully updates team as owner", async () => {
    const updatedTeam = { id: teamId, name: "Updated Team", description: "New desc" }

    serviceTableHandler = (table: string) => {
      if (table === "team_members") {
        return chainable({
          single: jest.fn(async () => ({ data: { role: "owner" }, error: null })),
        })
      }
      if (table === "teams") {
        return chainable({
          single: jest.fn(async () => ({ data: updatedTeam, error: null })),
        })
      }
      return chainable()
    }

    const res = await PUT(
      makeRequest({ name: "Updated Team", description: "New desc" }),
      makeParams()
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.team.name).toBe("Updated Team")
  })

  it("successfully updates team as admin", async () => {
    serviceTableHandler = (table: string) => {
      if (table === "team_members") {
        return chainable({
          single: jest.fn(async () => ({ data: { role: "admin" }, error: null })),
        })
      }
      if (table === "teams") {
        return chainable({
          single: jest.fn(async () => ({
            data: { id: teamId, name: "Admin Updated" },
            error: null,
          })),
        })
      }
      return chainable()
    }

    const res = await PUT(makeRequest({ name: "Admin Updated" }), makeParams())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.team.name).toBe("Admin Updated")
  })
})

// --- DELETE (delete team) ---

describe("DELETE /api/teams/[id] - Delete Team", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthUser = { data: { user: mockUser }, error: null }
    mockRouteHandlerFrom = jest.fn()
  })

  it("returns 401 when not authenticated", async () => {
    mockAuthUser = { data: { user: null }, error: { message: "No session" } }

    const res = await DELETE(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(401)
  })

  it("returns 404 when user is not a team member", async () => {
    serviceTableHandler = (table: string) => {
      if (table === "team_members") {
        return chainable({
          single: jest.fn(async () => ({ data: null, error: { message: "not found" } })),
        })
      }
      return chainable()
    }

    const res = await DELETE(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(404)
  })

  it("returns 403 when user is admin (not owner)", async () => {
    serviceTableHandler = (table: string) => {
      if (table === "team_members") {
        return chainable({
          single: jest.fn(async () => ({ data: { role: "admin" }, error: null })),
        })
      }
      return chainable()
    }

    const res = await DELETE(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toContain("Only the team owner")
  })

  it("returns 403 when user is a manager", async () => {
    serviceTableHandler = (table: string) => {
      if (table === "team_members") {
        return chainable({
          single: jest.fn(async () => ({ data: { role: "manager" }, error: null })),
        })
      }
      return chainable()
    }

    const res = await DELETE(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(403)
  })

  it("successfully deletes team as owner", async () => {
    serviceTableHandler = (table: string) => {
      if (table === "team_members") {
        return chainable({
          single: jest.fn(async () => ({ data: { role: "owner" }, error: null })),
        })
      }
      if (table === "teams") {
        return chainable({
          eq: jest.fn(async () => ({ error: null })),
        })
      }
      return chainable()
    }

    const res = await DELETE(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
  })

  it("returns 500 when delete fails", async () => {
    serviceTableHandler = (table: string) => {
      if (table === "team_members") {
        return chainable({
          single: jest.fn(async () => ({ data: { role: "owner" }, error: null })),
        })
      }
      if (table === "teams") {
        return chainable({
          eq: jest.fn(async () => ({ error: { message: "FK constraint", code: "23503" } })),
        })
      }
      return chainable()
    }

    const res = await DELETE(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(500)
  })
})
