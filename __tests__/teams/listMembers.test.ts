/**
 * Unit tests for GET /api/teams/[id]/members (list members + invitations)
 */

const mockUser = { id: "user-1", email: "admin@test.com" }
const teamId = "team-1"

function chainable(overrides: Record<string, any> = {}) {
  const chain: any = {
    select: jest.fn(() => chain),
    insert: jest.fn(() => chain),
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

import { GET } from "@/app/api/teams/[id]/members/route"
import { NextRequest } from "next/server"

function makeRequest(query = "") {
  return new NextRequest(`http://localhost/api/teams/${teamId}/members${query}`) as any
}

function makeParams() {
  return { params: Promise.resolve({ id: teamId }) }
}

let teamMemberCallCount: number

describe("GET /api/teams/[id]/members - List Members", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthUser = { data: { user: mockUser }, error: null }
    teamMemberCallCount = 0
  })

  it("returns 401 when not authenticated", async () => {
    mockAuthUser = { data: { user: null }, error: { message: "No session" } }
    serviceTableHandler = () => chainable()

    const res = await GET(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toBe("Unauthorized")
  })

  it("returns 403 when user is not a team member", async () => {
    serviceTableHandler = (table: string) => {
      if (table === "team_members") {
        return chainable({
          single: jest.fn(async () => ({ data: null, error: null })),
        })
      }
      return chainable()
    }

    const res = await GET(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toBe("Access denied")
  })

  it("returns members with profile data", async () => {
    const members = [
      { user_id: "user-1", role: "owner", joined_at: "2026-01-01" },
      { user_id: "user-2", role: "member", joined_at: "2026-02-01" },
    ]
    const profiles = [
      { id: "user-1", email: "admin@test.com", full_name: "Admin", username: "admin" },
      { id: "user-2", email: "member@test.com", full_name: "Member", username: "member" },
    ]

    serviceTableHandler = (table: string) => {
      if (table === "team_members") {
        const call = teamMemberCallCount++
        if (call === 0) {
          // Role check
          return chainable({
            single: jest.fn(async () => ({ data: { role: "owner" }, error: null })),
          })
        }
        // Members list (via Promise.all)
        return chainable({
          eq: jest.fn(() => ({
            data: members,
            error: null,
            then: (fn: any) => Promise.resolve({ data: members, error: null }).then(fn),
          })),
        })
      }
      if (table === "user_profiles") {
        return chainable({
          in: jest.fn(async () => ({ data: profiles, error: null })),
        })
      }
      return chainable()
    }

    const res = await GET(makeRequest(), makeParams())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.members).toHaveLength(2)
    expect(body.members[0].user.email).toBe("admin@test.com")
  })

  it("includes invitations when requested by admin", async () => {
    const members = [{ user_id: "user-1", role: "owner", joined_at: "2026-01-01" }]
    const invitations = [
      { id: "inv-1", role: "member", status: "pending", invited_at: "2026-03-01", expires_at: "2026-04-01", invitee_id: "user-3" },
    ]
    const profiles = [
      { id: "user-1", email: "admin@test.com", full_name: "Admin", username: "admin" },
      { id: "user-3", email: "invitee@test.com", full_name: "Invitee", username: "invitee" },
    ]

    serviceTableHandler = (table: string) => {
      if (table === "team_members") {
        const call = teamMemberCallCount++
        if (call === 0) {
          return chainable({
            single: jest.fn(async () => ({ data: { role: "owner" }, error: null })),
          })
        }
        // Members list (returned from Promise.all - needs to be thenable)
        const membersChain: any = {
          select: jest.fn(() => membersChain),
          eq: jest.fn(() => membersChain),
          then: (fn: any) => Promise.resolve({ data: members, error: null }).then(fn),
        }
        return membersChain
      }
      if (table === "team_invitations") {
        const invChain: any = {
          select: jest.fn(() => invChain),
          eq: jest.fn(() => invChain),
          order: jest.fn(() => invChain),
          then: (fn: any) => Promise.resolve({ data: invitations, error: null }).then(fn),
        }
        return invChain
      }
      if (table === "user_profiles") {
        return chainable({
          in: jest.fn(async () => ({ data: profiles, error: null })),
        })
      }
      return chainable()
    }

    const res = await GET(makeRequest("?include_invitations=true"), makeParams())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.invitations).toHaveLength(1)
    expect(body.invitations[0].invitee.email).toBe("invitee@test.com")
  })

  it("does not include invitations for regular members even if requested", async () => {
    const members = [{ user_id: "user-1", role: "member", joined_at: "2026-01-01" }]

    serviceTableHandler = (table: string) => {
      if (table === "team_members") {
        const call = teamMemberCallCount++
        if (call === 0) {
          return chainable({
            single: jest.fn(async () => ({ data: { role: "member" }, error: null })),
          })
        }
        const membersChain: any = {
          select: jest.fn(() => membersChain),
          eq: jest.fn(() => membersChain),
          then: (fn: any) => Promise.resolve({ data: members, error: null }).then(fn),
        }
        return membersChain
      }
      if (table === "user_profiles") {
        return chainable({
          in: jest.fn(async () => ({
            data: [{ id: "user-1", email: "member@test.com", full_name: "Member", username: "member" }],
            error: null,
          })),
        })
      }
      return chainable()
    }

    const res = await GET(makeRequest("?include_invitations=true"), makeParams())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.invitations).toBeUndefined()
  })
})
