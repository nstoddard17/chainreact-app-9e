/**
 * Tests for server-side feature entitlement enforcement.
 */

// Plan data now comes from DB — tests mock the server cache

// Mock Supabase service client
const mockSingle = jest.fn()
const mockSelect = jest.fn(() => ({ eq: jest.fn(() => ({ single: mockSingle })) }))
jest.mock('@/utils/supabase/server', () => ({
  createSupabaseServiceClient: jest.fn(() => ({
    from: jest.fn(() => ({ select: mockSelect })),
  })),
}))

// Mock server-cache so buildDefaultProfileFields tests don't hit DB
// Mock server-cache so tests don't hit the real DB
const planLimitsMap: Record<string, Record<string, any>> = {
  free: { tasksPerMonth: 300, maxTeamMembers: 1, maxWorkflowsTotal: 5, maxActiveWorkflows: 3, maxBusinessContextEntries: 1 },
  pro: { tasksPerMonth: 1000, maxTeamMembers: 5, maxWorkflowsTotal: -1, maxActiveWorkflows: -1, maxBusinessContextEntries: 10 },
  team: { tasksPerMonth: 5000, maxTeamMembers: 25, maxWorkflowsTotal: -1, maxActiveWorkflows: -1, maxBusinessContextEntries: 50 },
  business: { tasksPerMonth: -1, maxTeamMembers: -1, maxWorkflowsTotal: -1, maxActiveWorkflows: -1, maxBusinessContextEntries: -1 },
  enterprise: { tasksPerMonth: -1, maxTeamMembers: -1, maxWorkflowsTotal: -1, maxActiveWorkflows: -1, maxBusinessContextEntries: -1 },
}
const featureAccessMap: Record<string, Set<string>> = {
  free: new Set(['webhooks']),
  pro: new Set(['webhooks', 'aiAgents', 'advancedAnalytics']),
  team: new Set(['webhooks', 'aiAgents', 'advancedAnalytics', 'teamSharing']),
  business: new Set(['webhooks', 'aiAgents', 'advancedAnalytics', 'teamSharing']),
  enterprise: new Set(['webhooks', 'aiAgents', 'advancedAnalytics', 'teamSharing']),
}
jest.mock('@/lib/plans/server-cache', () => ({
  getTaskLimitFromDB: jest.fn().mockResolvedValue(300),
  getPlanLimitsFromDB: jest.fn().mockImplementation(async (plan: string) => {
    return planLimitsMap[plan] || planLimitsMap.free
  }),
  getPlanFromDB: jest.fn().mockImplementation(async (plan: string) => ({
    name: plan,
    displayName: plan.charAt(0).toUpperCase() + plan.slice(1),
    description: `${plan} plan`,
    priceMonthly: 0,
    priceAnnual: 0,
    limits: planLimitsMap[plan] || planLimitsMap.free,
    features: [],
  })),
  hasFeatureAccessFromDB: jest.fn().mockImplementation(async (plan: string, feature: string) => {
    return featureAccessMap[plan]?.has(feature) ?? false
  }),
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
      expect(body.upgradeUrl).toBe('/subscription')
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
  it('derives tasks_limit from DB free plan', async () => {
    const { buildDefaultProfileFields } = await import('@/lib/utils/profile-defaults')
    const defaults = await buildDefaultProfileFields()
    expect(defaults.tasks_limit).toBeGreaterThan(0)
    expect(defaults.plan).toBe('free')
    expect(defaults.tasks_used).toBe(0)
    expect(defaults.billing_period_start).toBeDefined()
    expect(defaults.billing_period_end).toBeDefined()
  })

  it('sets billing_period_end ~30 days from now', async () => {
    const { buildDefaultProfileFields } = await import('@/lib/utils/profile-defaults')
    const defaults = await buildDefaultProfileFields()
    const end = new Date(defaults.billing_period_end)
    const now = new Date()
    const diffDays = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThan(29)
    expect(diffDays).toBeLessThan(31)
  })
})
