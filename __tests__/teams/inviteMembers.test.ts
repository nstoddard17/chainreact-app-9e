/**
 * Unit tests for POST /api/teams/[id]/members (invite member)
 */

// --- Mocks ---

const mockUser = { id: "inviter-1", email: "admin@test.com" }
const mockInvitee = {
  id: "invitee-1",
  email: "newmember@test.com",
  full_name: "New Member",
  username: "newmember",
  role: "free",
}

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

// Track service client queries by table
type TableHandler = (table: string) => any
let serviceTableHandler: TableHandler

jest.mock("@/utils/supabase/server", () => ({
  createSupabaseRouteHandlerClient: jest.fn(async () => ({
    auth: { getUser: jest.fn(async () => mockAuthUser) },
  })),
  createSupabaseServiceClient: jest.fn(async () => ({
    from: (table: string) => serviceTableHandler(table),
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

jest.mock("@/lib/services/resend", () => ({
  sendTeamInvitationEmail: jest.fn(async () => ({ success: true })),
}))

jest.mock("@/lib/utils/getBaseUrl", () => ({
  getBaseUrl: jest.fn(() => "http://localhost:3000"),
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

import { POST } from "@/app/api/teams/[id]/members/route"
import { NextRequest } from "next/server"
import { sendTeamInvitationEmail } from "@/lib/services/resend"

const teamId = "team-1"

function makeRequest(body: Record<string, any>) {
  return new NextRequest(`http://localhost/api/teams/${teamId}/members`, {
    body: JSON.stringify(body),
  }) as any
}

function makeParams() {
  return { params: Promise.resolve({ id: teamId }) }
}

/**
 * Helper to set up service client mock with per-table handlers.
 * Tables not specified return a generic chainable.
 */
function setupService(handlers: Record<string, () => any>) {
  serviceTableHandler = (table: string) => {
    if (handlers[table]) return handlers[table]()
    return chainable()
  }
}

/**
 * Sets up a "happy path" service mock where inviter is a Pro owner,
 * invitee exists, no existing membership or invitation, team exists.
 */
function setupHappyPath(overrides: Record<string, () => any> = {}) {
  // Track which call to user_profiles we're on (1st = inviter, 2nd = invitee, 3rd = inviter for email)
  let userProfileCallCount = 0

  setupService({
    user_profiles: () => {
      userProfileCallCount++
      if (userProfileCallCount === 1) {
        // Inviter profile (role check)
        return chainable({
          single: jest.fn(async () => ({
            data: { role: "pro" },
            error: null,
          })),
        })
      }
      if (userProfileCallCount === 2) {
        // Invitee profile
        return chainable({
          single: jest.fn(async () => ({
            data: mockInvitee,
            error: null,
          })),
        })
      }
      // 3rd call: inviter profile for email
      return chainable({
        single: jest.fn(async () => ({
          data: {
            email: mockUser.email,
            full_name: "Admin User",
            username: "admin",
          },
          error: null,
        })),
      })
    },
    team_members: () => {
      // 1st call: check inviter role, 2nd call: check existing membership
      const call = teamMemberCallCount++
      if (call === 0) {
        return chainable({
          single: jest.fn(async () => ({
            data: { role: "owner" },
            error: null,
          })),
        })
      }
      return chainable({
        single: jest.fn(async () => ({ data: null, error: null })),
      })
    },
    team_invitations: () => {
      // 1st call: check existing invitation, 2nd call: create invitation
      const call = teamInvitationCallCount++
      if (call === 0) {
        return chainable({
          single: jest.fn(async () => ({ data: null, error: null })),
        })
      }
      return chainable({
        single: jest.fn(async () => ({
          data: {
            id: "inv-1",
            team_id: teamId,
            inviter_id: mockUser.id,
            invitee_id: mockInvitee.id,
            role: "member",
            expires_at: "2026-04-20T00:00:00Z",
          },
          error: null,
        })),
      })
    },
    teams: () =>
      chainable({
        single: jest.fn(async () => ({
          data: { id: teamId, name: "Test Team", organization_id: null },
          error: null,
        })),
      }),
    notifications: () =>
      chainable({
        select: jest.fn(async () => ({
          data: [{ id: "notif-1" }],
          error: null,
        })),
      }),
    ...overrides,
  })
}

let teamMemberCallCount: number
let teamInvitationCallCount: number

describe("POST /api/teams/[id]/members - Invite Member", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthUser = { data: { user: mockUser }, error: null }
    teamMemberCallCount = 0
    teamInvitationCallCount = 0
  })

  it("returns 401 when user is not authenticated", async () => {
    mockAuthUser = { data: { user: null }, error: { message: "No session" } }
    setupService({})

    const res = await POST(
      makeRequest({ user_id: "invitee-1" }),
      makeParams()
    )
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toBe("Unauthorized")
  })

  it("returns 400 when user_id is missing", async () => {
    setupService({
      user_profiles: () =>
        chainable({
          single: jest.fn(async () => ({
            data: { role: "pro" },
            error: null,
          })),
        }),
    })

    const res = await POST(makeRequest({}), makeParams())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe("User ID is required")
  })

  it("returns 403 when inviter is on free plan", async () => {
    setupService({
      user_profiles: () =>
        chainable({
          single: jest.fn(async () => ({
            data: { role: "free" },
            error: null,
          })),
        }),
    })

    const res = await POST(
      makeRequest({ user_id: "invitee-1" }),
      makeParams()
    )
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toContain("Pro plan")
  })

  it("returns 403 when inviter is a regular member (not admin/owner/manager)", async () => {
    let userProfileCallCount = 0
    setupService({
      user_profiles: () => {
        userProfileCallCount++
        return chainable({
          single: jest.fn(async () => ({
            data: userProfileCallCount === 1 ? { role: "pro" } : mockInvitee,
            error: null,
          })),
        })
      },
      team_members: () =>
        chainable({
          single: jest.fn(async () => ({
            data: { role: "member" },
            error: null,
          })),
        }),
    })

    const res = await POST(
      makeRequest({ user_id: "invitee-1" }),
      makeParams()
    )
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toContain("Only team owners")
  })

  it("returns 409 when user is already a team member", async () => {
    let userProfileCallCount = 0
    setupService({
      user_profiles: () => {
        userProfileCallCount++
        return chainable({
          single: jest.fn(async () => ({
            data: userProfileCallCount === 1 ? { role: "pro" } : mockInvitee,
            error: null,
          })),
        })
      },
      team_members: () => {
        const call = teamMemberCallCount++
        if (call === 0) {
          // Inviter role check
          return chainable({
            single: jest.fn(async () => ({
              data: { role: "owner" },
              error: null,
            })),
          })
        }
        // Existing membership check - user already a member
        return chainable({
          single: jest.fn(async () => ({
            data: { id: "existing-member" },
            error: null,
          })),
        })
      },
    })

    const res = await POST(
      makeRequest({ user_id: "invitee-1" }),
      makeParams()
    )
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toContain("already a member")
  })

  it("returns 409 when invitation is already pending", async () => {
    let userProfileCallCount = 0
    setupService({
      user_profiles: () => {
        userProfileCallCount++
        return chainable({
          single: jest.fn(async () => ({
            data: userProfileCallCount === 1 ? { role: "pro" } : mockInvitee,
            error: null,
          })),
        })
      },
      team_members: () => {
        const call = teamMemberCallCount++
        if (call === 0) {
          return chainable({
            single: jest.fn(async () => ({
              data: { role: "owner" },
              error: null,
            })),
          })
        }
        return chainable({
          single: jest.fn(async () => ({ data: null, error: null })),
        })
      },
      team_invitations: () =>
        chainable({
          single: jest.fn(async () => ({
            data: { id: "existing-inv", status: "pending" },
            error: null,
          })),
        }),
    })

    const res = await POST(
      makeRequest({ user_id: "invitee-1" }),
      makeParams()
    )
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toContain("already pending")
  })

  it("successfully creates invitation, notification, and sends email", async () => {
    setupHappyPath()

    const res = await POST(
      makeRequest({ user_id: "invitee-1", role: "member" }),
      makeParams()
    )
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.invitation.id).toBe("inv-1")
    expect(body.invitation.team.name).toBe("Test Team")
    expect(body.invitation.invitee.email).toBe("newmember@test.com")
    expect(sendTeamInvitationEmail).toHaveBeenCalledWith(
      "newmember@test.com",
      "New Member",
      expect.any(String),
      expect.any(String),
      "Test Team",
      "member",
      expect.stringContaining("/teams/invitations/inv-1"),
      expect.anything()
    )
  })

  it("returns 404 when invitee user does not exist", async () => {
    let userProfileCallCount = 0
    setupService({
      user_profiles: () => {
        userProfileCallCount++
        if (userProfileCallCount === 1) {
          return chainable({
            single: jest.fn(async () => ({
              data: { role: "pro" },
              error: null,
            })),
          })
        }
        // Invitee not found
        return chainable({
          single: jest.fn(async () => ({ data: null, error: null })),
        })
      },
      team_members: () => {
        const call = teamMemberCallCount++
        if (call === 0) {
          return chainable({
            single: jest.fn(async () => ({
              data: { role: "owner" },
              error: null,
            })),
          })
        }
        return chainable({
          single: jest.fn(async () => ({ data: null, error: null })),
        })
      },
      team_invitations: () =>
        chainable({
          single: jest.fn(async () => ({ data: null, error: null })),
        }),
      teams: () =>
        chainable({
          single: jest.fn(async () => ({
            data: { id: teamId, name: "Test Team", organization_id: null },
            error: null,
          })),
        }),
    })

    const res = await POST(
      makeRequest({ user_id: "nonexistent-user" }),
      makeParams()
    )
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe("User not found")
  })
})
