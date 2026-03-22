/**
 * Unit tests for POST/DELETE /api/teams/invitations/[id] (accept/decline invitation)
 */

const mockUser = { id: "invitee-1", email: "invitee@test.com" }
const invitationId = "inv-1"

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

import { GET, POST, DELETE } from "@/app/api/teams/invitations/[id]/route"
import { NextRequest } from "next/server"

function makeRequest() {
  return new NextRequest(`http://localhost/api/teams/invitations/${invitationId}`) as any
}

function makeParams() {
  return { params: Promise.resolve({ id: invitationId }) }
}

const pendingInvitation = {
  id: invitationId,
  team_id: "team-1",
  inviter_id: "inviter-1",
  invitee_id: mockUser.id,
  role: "member",
  status: "pending",
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
  team: { id: "team-1", name: "Test Team" },
}

// --- GET (view invitation details) ---

describe("GET /api/teams/invitations/[id] - View Invitation", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthUser = { data: { user: mockUser }, error: null }
  })

  it("returns 401 when not authenticated", async () => {
    mockAuthUser = { data: { user: null }, error: { message: "No session" } }
    serviceTableHandler = () => chainable()

    const res = await GET(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(401)
  })

  it("returns invitation details", async () => {
    serviceTableHandler = (table: string) => {
      if (table === "team_invitations") {
        return chainable({
          single: jest.fn(async () => ({ data: pendingInvitation, error: null })),
        })
      }
      return chainable()
    }

    const res = await GET(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.invitation.id).toBe(invitationId)
    expect(body.invitation.team.name).toBe("Test Team")
  })

  it("returns 404 for non-existent invitation", async () => {
    serviceTableHandler = (table: string) => {
      if (table === "team_invitations") {
        return chainable({
          single: jest.fn(async () => ({ data: null, error: { message: "not found" } })),
        })
      }
      return chainable()
    }

    const res = await GET(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe("Invitation not found")
  })
})

// --- POST (accept invitation) ---

describe("POST /api/teams/invitations/[id] - Accept Invitation", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthUser = { data: { user: mockUser }, error: null }
  })

  it("returns 401 when not authenticated", async () => {
    mockAuthUser = { data: { user: null }, error: { message: "No session" } }
    serviceTableHandler = () => chainable()

    const res = await POST(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(401)
  })

  it("returns 404 when invitation doesn't exist", async () => {
    serviceTableHandler = (table: string) => {
      if (table === "team_invitations") {
        return chainable({
          single: jest.fn(async () => ({ data: null, error: { message: "not found" } })),
        })
      }
      return chainable()
    }

    const res = await POST(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(404)
  })

  it("returns 400 when invitation is already accepted", async () => {
    serviceTableHandler = (table: string) => {
      if (table === "team_invitations") {
        return chainable({
          single: jest.fn(async () => ({
            data: { ...pendingInvitation, status: "accepted" },
            error: null,
          })),
        })
      }
      return chainable()
    }

    const res = await POST(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain("already been accepted")
  })

  it("returns 400 when invitation has expired", async () => {
    const expiredInvitation = {
      ...pendingInvitation,
      expires_at: new Date(Date.now() - 1000).toISOString(), // expired
    }

    serviceTableHandler = (table: string) => {
      if (table === "team_invitations") {
        return chainable({
          single: jest.fn(async () => ({ data: expiredInvitation, error: null })),
        })
      }
      return chainable()
    }

    const res = await POST(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain("expired")
  })

  it("returns 403 when user is on free plan", async () => {
    let invitationCallCount = 0
    serviceTableHandler = (table: string) => {
      if (table === "team_invitations") {
        invitationCallCount++
        if (invitationCallCount === 1) {
          return chainable({
            single: jest.fn(async () => ({ data: pendingInvitation, error: null })),
          })
        }
        return chainable()
      }
      if (table === "user_profiles") {
        return chainable({
          single: jest.fn(async () => ({ data: { role: "free" }, error: null })),
        })
      }
      return chainable()
    }

    const res = await POST(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toContain("Pro plan")
  })

  it("successfully accepts invitation and adds user to team", async () => {
    let invitationCallCount = 0
    serviceTableHandler = (table: string) => {
      if (table === "team_invitations") {
        invitationCallCount++
        if (invitationCallCount === 1) {
          return chainable({
            single: jest.fn(async () => ({ data: pendingInvitation, error: null })),
          })
        }
        // Update invitation status
        return chainable()
      }
      if (table === "user_profiles") {
        return chainable({
          single: jest.fn(async () => ({ data: { role: "pro" }, error: null })),
        })
      }
      if (table === "team_members") {
        return chainable({
          insert: jest.fn(async () => ({ error: null })),
        })
      }
      if (table === "notifications") {
        return chainable()
      }
      return chainable()
    }

    const res = await POST(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.message).toBe("Successfully joined team")
    expect(body.team.name).toBe("Test Team")
  })

  it("returns 500 when adding member fails", async () => {
    let invitationCallCount = 0
    serviceTableHandler = (table: string) => {
      if (table === "team_invitations") {
        invitationCallCount++
        if (invitationCallCount === 1) {
          return chainable({
            single: jest.fn(async () => ({ data: pendingInvitation, error: null })),
          })
        }
        return chainable()
      }
      if (table === "user_profiles") {
        return chainable({
          single: jest.fn(async () => ({ data: { role: "pro" }, error: null })),
        })
      }
      if (table === "team_members") {
        return chainable({
          insert: jest.fn(async () => ({ error: { message: "constraint violation" } })),
        })
      }
      return chainable()
    }

    const res = await POST(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toBe("Failed to join team")
  })
})

// --- DELETE (reject invitation) ---

describe("DELETE /api/teams/invitations/[id] - Reject Invitation", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthUser = { data: { user: mockUser }, error: null }
  })

  it("returns 401 when not authenticated", async () => {
    mockAuthUser = { data: { user: null }, error: { message: "No session" } }
    serviceTableHandler = () => chainable()

    const res = await DELETE(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(401)
  })

  it("returns 404 when invitation doesn't exist", async () => {
    serviceTableHandler = (table: string) => {
      if (table === "team_invitations") {
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

  it("returns 400 when invitation is already rejected", async () => {
    serviceTableHandler = (table: string) => {
      if (table === "team_invitations") {
        return chainable({
          single: jest.fn(async () => ({
            data: { ...pendingInvitation, status: "rejected" },
            error: null,
          })),
        })
      }
      return chainable()
    }

    const res = await DELETE(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain("already been rejected")
  })

  it("successfully rejects invitation", async () => {
    let invitationCallCount = 0
    serviceTableHandler = (table: string) => {
      if (table === "team_invitations") {
        invitationCallCount++
        if (invitationCallCount === 1) {
          return chainable({
            single: jest.fn(async () => ({ data: pendingInvitation, error: null })),
          })
        }
        // Update status
        return chainable()
      }
      if (table === "notifications") {
        return chainable()
      }
      return chainable()
    }

    const res = await DELETE(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.message).toBe("Invitation rejected")
  })

  it("returns 500 when update fails", async () => {
    let invitationCallCount = 0
    serviceTableHandler = (table: string) => {
      if (table === "team_invitations") {
        invitationCallCount++
        if (invitationCallCount === 1) {
          return chainable({
            single: jest.fn(async () => ({ data: pendingInvitation, error: null })),
          })
        }
        // Update fails
        return chainable({
          eq: jest.fn(async () => ({ error: { message: "update failed" } })),
        })
      }
      return chainable()
    }

    const res = await DELETE(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toBe("Failed to reject invitation")
  })
})
