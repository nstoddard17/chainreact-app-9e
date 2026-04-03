/**
 * Tests for server-side feature entitlement enforcement.
 */

import { PLAN_LIMITS } from '@/lib/utils/plan-restrictions'

// Mock Supabase service client
const mockSingle = jest.fn()
const mockSelect = jest.fn(() => ({ eq: jest.fn(() => ({ single: mockSingle })) }))
jest.mock('@/utils/supabase/server', () => ({
  createSupabaseServiceClient: jest.fn(() => ({
    from: jest.fn(() => ({ select: mockSelect })),
  })),
}))

// Import after mocks
import { requireFeature, requireActionLimit } from '@/lib/utils/require-entitlement'

function mockUserPlan(plan: string | null, admin: boolean = false) {
  mockSingle.mockResolvedValueOnce({
    data: {
      plan,
      admin_capabilities: admin ? { super_admin: true } : {},
    },
    error: null,
  })
}

function mockUserNotFound() {
  mockSingle.mockResolvedValueOnce({
    data: null,
    error: { message: 'not found', code: 'PGRST116' },
  })
}

describe('requireFeature', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('allows admin for any feature regardless of plan', async () => {
    mockUserPlan('free', true)
    const result = await requireFeature('user-1', 'aiAgents')
    expect(result.allowed).toBe(true)
    if (result.allowed) expect(result.plan).toBe('free')
  })

  it('denies free user for aiAgents with 403', async () => {
    mockUserPlan('free')
    const result = await requireFeature('user-1', 'aiAgents')
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.response.status).toBe(403)
      const body = JSON.parse(await result.response.text())
      expect(body.code).toBe('FEATURE_NOT_AVAILABLE')
      expect(body.feature).toBe('aiAgents')
      expect(body.currentPlan).toBe('free')
      expect(body.requiredPlan).toBe('pro')
      expect(body.upgradeUrl).toBe('/settings/billing')
    }
  })

  it('allows pro user for aiAgents', async () => {
    mockUserPlan('pro')
    const result = await requireFeature('user-1', 'aiAgents')
    expect(result.allowed).toBe(true)
  })

  it('denies free user for teamSharing with correct requiredPlan', async () => {
    mockUserPlan('free')
    const result = await requireFeature('user-1', 'teamSharing')
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      const body = JSON.parse(await result.response.text())
      expect(body.requiredPlan).toBe('team')
    }
  })

  it('allows team user for teamSharing', async () => {
    mockUserPlan('team')
    const result = await requireFeature('user-1', 'teamSharing')
    expect(result.allowed).toBe(true)
  })

  it('normalizes beta plan to pro', async () => {
    mockUserPlan('beta')
    const result = await requireFeature('user-1', 'aiAgents')
    expect(result.allowed).toBe(true)
  })

  it('normalizes beta-pro plan to pro', async () => {
    mockUserPlan('beta-pro')
    const result = await requireFeature('user-1', 'aiAgents')
    expect(result.allowed).toBe(true)
  })

  it('defaults null plan to free', async () => {
    mockUserPlan(null)
    const result = await requireFeature('user-1', 'aiAgents')
    expect(result.allowed).toBe(false)
  })

  it('defaults to free when user not found', async () => {
    mockUserNotFound()
    const result = await requireFeature('user-1', 'aiAgents')
    expect(result.allowed).toBe(false)
  })

  it('allows features available to all plans', async () => {
    mockUserPlan('free')
    const result = await requireFeature('user-1', 'webhooks')
    expect(result.allowed).toBe(true)
  })

  it('denies free user for advancedAnalytics', async () => {
    mockUserPlan('free')
    const result = await requireFeature('user-1', 'advancedAnalytics')
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      const body = JSON.parse(await result.response.text())
      expect(body.feature).toBe('advancedAnalytics')
    }
  })
})

describe('requireActionLimit', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('allows admin for any action', async () => {
    mockUserPlan('free', true)
    const result = await requireActionLimit('user-1', 'addTeamMember', 100)
    expect(result.allowed).toBe(true)
  })

  it('allows action within limits', async () => {
    mockUserPlan('team')
    const result = await requireActionLimit('user-1', 'addTeamMember', 2)
    expect(result.allowed).toBe(true)
  })

  it('denies action at limit with 403', async () => {
    mockUserPlan('free')
    // Free plan maxTeamMembers = 1
    const result = await requireActionLimit('user-1', 'addTeamMember', 1)
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      const body = JSON.parse(await result.response.text())
      expect(result.response.status).toBe(403)
      expect(body.code).toBe('ACTION_LIMIT_REACHED')
      expect(body.action).toBe('addTeamMember')
    }
  })
})

describe('buildDefaultProfileFields', () => {
  it('derives tasks_limit from PLAN_LIMITS.free', async () => {
    const { buildDefaultProfileFields } = await import('@/lib/utils/profile-defaults')
    const defaults = buildDefaultProfileFields()
    expect(defaults.tasks_limit).toBe(PLAN_LIMITS.free.tasksPerMonth)
    expect(defaults.plan).toBe('free')
    expect(defaults.tasks_used).toBe(0)
    expect(defaults.billing_period_start).toBeDefined()
    expect(defaults.billing_period_end).toBeDefined()
  })

  it('sets billing_period_end ~30 days from now', async () => {
    const { buildDefaultProfileFields } = await import('@/lib/utils/profile-defaults')
    const defaults = buildDefaultProfileFields()
    const end = new Date(defaults.billing_period_end)
    const now = new Date()
    const diffDays = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThan(29)
    expect(diffDays).toBeLessThan(31)
  })
})
