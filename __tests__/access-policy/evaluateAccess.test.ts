import { evaluateAccess } from '@/lib/access-policy/evaluateAccess'
import { buildAccessSubject } from '@/lib/access-policy/buildAccessSubject'
import { normalizePlan, isRecognizedPlan } from '@/lib/access-policy/normalize'
import { getRouteRule } from '@/lib/access-policy/routeConfig'
import type { AccessSubject } from '@/lib/access-policy/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function subject(overrides: Partial<AccessSubject> = {}): AccessSubject {
  return {
    isAuthenticated: true,
    hasUsername: true,
    plan: 'free',
    isAdmin: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// normalizePlan
// ---------------------------------------------------------------------------

describe('normalizePlan', () => {
  it.each([
    ['free', 'free'],
    ['pro', 'pro'],
    ['team', 'team'],
    ['business', 'business'],
    ['enterprise', 'enterprise'],
    ['beta', 'pro'],
    ['beta-pro', 'pro'],
    ['Beta', 'pro'],
    ['BETA-PRO', 'pro'],
    ['PRO', 'pro'],
    [null, 'free'],
    [undefined, 'free'],
    ['', 'free'],
    ['garbage', 'free'],
    ['premium', 'free'],
    ['  pro  ', 'pro'],
  ])('normalizePlan(%j) → %s', (input, expected) => {
    expect(normalizePlan(input as string | null | undefined)).toBe(expected)
  })
})

describe('isRecognizedPlan', () => {
  it.each([
    ['free', true],
    ['pro', true],
    ['beta', true],
    ['beta-pro', true],
    ['enterprise', true],
    [null, false],
    [undefined, false],
    ['garbage', false],
    ['', false],
  ])('isRecognizedPlan(%j) → %s', (input, expected) => {
    expect(isRecognizedPlan(input as string | null | undefined)).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// buildAccessSubject
// ---------------------------------------------------------------------------

describe('buildAccessSubject', () => {
  it('builds from profile with plan', () => {
    const s = buildAccessSubject({ plan: 'pro', username: 'alice' }, true)
    expect(s).toEqual({
      isAuthenticated: true,
      hasUsername: true,
      plan: 'pro',
      isAdmin: false,
    })
  })

  it('normalizes beta plan', () => {
    const s = buildAccessSubject({ plan: 'beta-pro', username: 'bob' }, true)
    expect(s.plan).toBe('pro')
  })

  it('defaults null plan to free', () => {
    const s = buildAccessSubject({ plan: null, username: 'carol' }, true)
    expect(s.plan).toBe('free')
  })

  it('defaults missing plan to free', () => {
    const s = buildAccessSubject({ username: 'dave' }, true)
    expect(s.plan).toBe('free')
  })

  it('defaults invalid plan to free', () => {
    const s = buildAccessSubject({ plan: 'garbage', username: 'eve' }, true)
    expect(s.plan).toBe('free')
  })

  it('sets isAdmin from admin_capabilities', () => {
    const s = buildAccessSubject({ plan: 'free', admin_capabilities: { super_admin: true }, username: 'admin' }, true)
    expect(s.isAdmin).toBe(true)
  })

  it('treats missing admin_capabilities as non-admin', () => {
    const s = buildAccessSubject({ plan: 'free', admin_capabilities: null, username: 'user' }, true)
    expect(s.isAdmin).toBe(false)
  })

  it('detects empty username', () => {
    const s = buildAccessSubject({ plan: 'free', username: '' }, true)
    expect(s.hasUsername).toBe(false)
  })

  it('detects whitespace-only username', () => {
    const s = buildAccessSubject({ plan: 'free', username: '   ' }, true)
    expect(s.hasUsername).toBe(false)
  })

  it('detects null username', () => {
    const s = buildAccessSubject({ plan: 'free', username: null }, true)
    expect(s.hasUsername).toBe(false)
  })

  it('handles null profile', () => {
    const s = buildAccessSubject(null, false)
    expect(s).toEqual({
      isAuthenticated: false,
      hasUsername: false,
      plan: 'free',
      isAdmin: false,
    })
  })

  it('does not accept role field', () => {
    // TypeScript enforces this at compile time; this test documents the intent
    const profile = { plan: 'pro', username: 'user' }
    const s = buildAccessSubject(profile, true)
    expect(s.plan).toBe('pro')
    // role is not part of the subject
    expect('role' in s).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getRouteRule
// ---------------------------------------------------------------------------

describe('getRouteRule', () => {
  it('returns rule for exact match', () => {
    expect(getRouteRule('/admin')).toEqual({ adminOnly: true })
  })

  it('returns rule for prefix match', () => {
    const rule = getRouteRule('/teams/my-team/members')
    expect(rule).toBeTruthy()
    expect(rule!.minPlan).toBe('team')
  })

  it('uses longest prefix match', () => {
    // /ai-assistant should not match /admin
    const rule = getRouteRule('/ai-assistant/chat')
    expect(rule).toBeTruthy()
    expect(rule!.minPlan).toBe('pro')
  })

  it('returns null for routes without rules', () => {
    expect(getRouteRule('/workflows')).toBeNull()
    expect(getRouteRule('/workflows/builder/123')).toBeNull()
    expect(getRouteRule('/integrations')).toBeNull()
    expect(getRouteRule('/settings')).toBeNull()
    expect(getRouteRule('/home')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// evaluateAccess — core logic
// ---------------------------------------------------------------------------

describe('evaluateAccess', () => {
  describe('authentication', () => {
    it('denies unauthenticated user with redirect to login', () => {
      const decision = evaluateAccess(subject({ isAuthenticated: false }), '/workflows')
      expect(decision.allowed).toBe(false)
      expect(decision.denial?.reason).toBe('not-authenticated')
      expect(decision.denial?.redirectTo).toBe('/auth/login')
    })
  })

  describe('username', () => {
    it('denies user without username with redirect to setup', () => {
      const decision = evaluateAccess(subject({ hasUsername: false }), '/workflows')
      expect(decision.allowed).toBe(false)
      expect(decision.denial?.reason).toBe('missing-username')
      expect(decision.denial?.redirectTo).toBe('/auth/setup-username')
    })
  })

  describe('admin bypass', () => {
    it.each([
      '/workflows',
      '/admin',
      '/enterprise',
      '/analytics',
      '/teams',
      '/organization',
      '/ai-assistant',
    ])('admin is allowed on %s', (pathname) => {
      const decision = evaluateAccess(subject({ isAdmin: true }), pathname)
      expect(decision.allowed).toBe(true)
      expect(decision.denial).toBeUndefined()
    })
  })

  describe('routes without rules', () => {
    it.each([
      '/workflows',
      '/workflows/builder/123',
      '/integrations',
      '/integrations/slack',
      '/settings',
      '/settings/billing',
      '/learn',
      '/community',
      '/profile',
      '/home',
    ])('any authenticated user can access %s', (pathname) => {
      const decision = evaluateAccess(subject({ plan: 'free' }), pathname)
      expect(decision.allowed).toBe(true)
    })
  })

  describe('/admin — adminOnly', () => {
    it('denies non-admin users', () => {
      const decision = evaluateAccess(subject({ plan: 'enterprise' }), '/admin')
      expect(decision.allowed).toBe(false)
      expect(decision.denial?.reason).toBe('admin-only')
      expect(decision.denial?.redirectTo).toBe('/workflows')
    })

    it('denies even enterprise plan without admin flag', () => {
      const decision = evaluateAccess(subject({ plan: 'enterprise', isAdmin: false }), '/admin')
      expect(decision.allowed).toBe(false)
    })
  })

  describe('/enterprise — allowedPlansExact', () => {
    it('allows enterprise plan', () => {
      const decision = evaluateAccess(subject({ plan: 'enterprise' }), '/enterprise')
      expect(decision.allowed).toBe(true)
    })

    it('denies business plan', () => {
      const decision = evaluateAccess(subject({ plan: 'business' }), '/enterprise')
      expect(decision.allowed).toBe(false)
      expect(decision.denial?.reason).toBe('plan-insufficient')
      expect(decision.denial?.redirectTo).toBe('/workflows')
      expect(decision.denial?.requiredPlan).toBe('enterprise')
    })

    it('denies free plan', () => {
      const decision = evaluateAccess(subject({ plan: 'free' }), '/enterprise')
      expect(decision.allowed).toBe(false)
    })

    it('does not show upgrade modal', () => {
      const decision = evaluateAccess(subject({ plan: 'free' }), '/enterprise')
      expect(decision.denial?.showUpgradeModal).toBeFalsy()
    })
  })

  describe('/analytics — minPlan with upgradeModal', () => {
    it('allows pro plan', () => {
      expect(evaluateAccess(subject({ plan: 'pro' }), '/analytics').allowed).toBe(true)
    })

    it('allows higher plans', () => {
      expect(evaluateAccess(subject({ plan: 'team' }), '/analytics').allowed).toBe(true)
      expect(evaluateAccess(subject({ plan: 'business' }), '/analytics').allowed).toBe(true)
      expect(evaluateAccess(subject({ plan: 'enterprise' }), '/analytics').allowed).toBe(true)
    })

    it('denies free plan with upgrade modal', () => {
      const decision = evaluateAccess(subject({ plan: 'free' }), '/analytics')
      expect(decision.allowed).toBe(false)
      expect(decision.denial?.reason).toBe('plan-insufficient')
      expect(decision.denial?.requiredPlan).toBe('pro')
      expect(decision.denial?.showUpgradeModal).toBe(true)
      expect(decision.denial?.redirectTo).toBeUndefined()
    })
  })

  describe('/ai-assistant — minPlan pro', () => {
    it('allows pro', () => {
      expect(evaluateAccess(subject({ plan: 'pro' }), '/ai-assistant').allowed).toBe(true)
    })

    it('denies free with upgrade modal', () => {
      const decision = evaluateAccess(subject({ plan: 'free' }), '/ai-assistant')
      expect(decision.allowed).toBe(false)
      expect(decision.denial?.requiredPlan).toBe('pro')
      expect(decision.denial?.showUpgradeModal).toBe(true)
    })
  })

  describe('/teams — minPlan business', () => {
    it('allows business', () => {
      expect(evaluateAccess(subject({ plan: 'business' }), '/teams').allowed).toBe(true)
    })

    it('allows enterprise', () => {
      expect(evaluateAccess(subject({ plan: 'enterprise' }), '/teams').allowed).toBe(true)
    })

    it('allows team plan', () => {
      const decision = evaluateAccess(subject({ plan: 'team' }), '/teams')
      expect(decision.allowed).toBe(true)
    })

    it('denies free with upgrade modal', () => {
      const decision = evaluateAccess(subject({ plan: 'free' }), '/teams')
      expect(decision.allowed).toBe(false)
      expect(decision.denial?.showUpgradeModal).toBe(true)
    })
  })

  describe('/organization — minPlan enterprise', () => {
    it('allows enterprise', () => {
      expect(evaluateAccess(subject({ plan: 'enterprise' }), '/organization').allowed).toBe(true)
    })

    it('allows business plan', () => {
      const decision = evaluateAccess(subject({ plan: 'business' }), '/organization')
      expect(decision.allowed).toBe(true)
    })
  })

  describe('prefix matching', () => {
    it('/teams/slug/members inherits /teams rule', () => {
      const decision = evaluateAccess(subject({ plan: 'free' }), '/teams/slug/members')
      expect(decision.allowed).toBe(false)
      expect(decision.denial?.requiredPlan).toBe('team')
    })

    it('/admin/settings inherits /admin rule', () => {
      const decision = evaluateAccess(subject({ plan: 'enterprise' }), '/admin/settings')
      expect(decision.allowed).toBe(false)
      expect(decision.denial?.reason).toBe('admin-only')
    })

    it('/analytics/dashboard inherits /analytics rule', () => {
      const decision = evaluateAccess(subject({ plan: 'free' }), '/analytics/dashboard')
      expect(decision.allowed).toBe(false)
      expect(decision.denial?.requiredPlan).toBe('pro')
    })
  })

  describe('evaluation order', () => {
    it('checks auth before username', () => {
      const decision = evaluateAccess(
        subject({ isAuthenticated: false, hasUsername: false }),
        '/workflows'
      )
      expect(decision.denial?.reason).toBe('not-authenticated')
    })

    it('checks username before plan', () => {
      const decision = evaluateAccess(
        subject({ hasUsername: false, plan: 'free' }),
        '/analytics'
      )
      expect(decision.denial?.reason).toBe('missing-username')
    })

    it('checks admin before route rules', () => {
      const decision = evaluateAccess(
        subject({ isAdmin: true, plan: 'free' }),
        '/admin'
      )
      expect(decision.allowed).toBe(true)
    })
  })
})
