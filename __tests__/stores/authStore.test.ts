/**
 * Tests for stores/authStore.ts
 *
 * Covers: initial state, updateProfile, signOut, state shape invariants.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockSupabaseFrom = jest.fn()
const mockUpdateUser = jest.fn()
const mockSignOut = jest.fn()
const mockRefreshSession = jest.fn()

jest.mock('@/utils/supabaseClient', () => ({
  supabase: {
    auth: {
      signOut: mockSignOut,
      updateUser: mockUpdateUser,
      refreshSession: mockRefreshSession,
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
    from: mockSupabaseFrom,
  },
}))

jest.mock('@/lib/utils/cross-tab-sync', () => ({
  getCrossTabSync: () => ({
    broadcast: jest.fn(),
    subscribe: jest.fn(),
  }),
}))

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}))

jest.mock('@/stores/authBootMachine', () => {
  const actual: Record<string, any> = {
    BOOT_INITIAL_STATE: {
      phase: 'idle',
      bootId: 0,
      bootError: null,
      lastBootCompletedAt: 0,
      user: null,
      profile: null,
      loading: false,
      error: null,
    },
    boot: jest.fn(),
    mapProfileData: jest.fn((raw: any) => raw),
  }
  return {
    __esModule: true,
    ...actual,
  }
})

// ---------------------------------------------------------------------------
// Import store AFTER mocks are set up
// ---------------------------------------------------------------------------

import { useAuthStore } from '@/stores/authStore'
import type { Profile, User } from '@/stores/authBootMachine'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  useAuthStore.setState({
    phase: 'idle',
    bootId: 0,
    bootError: null,
    lastBootCompletedAt: 0,
    user: null,
    profile: null,
    loading: false,
    error: null,
  })
}

const TEST_USER: User = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  full_name: 'Test User',
}

const TEST_PROFILE: Profile = {
  id: 'user-1',
  email: 'test@example.com',
  provider: 'email',
  admin_capabilities: {},
  full_name: 'Test User',
  username: 'testuser',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetStore()
  jest.clearAllMocks()
  mockSignOut.mockResolvedValue({ error: null })
})

describe('authStore', () => {
  describe('initial state', () => {
    it('starts with user null and phase idle', () => {
      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.profile).toBeNull()
      expect(state.phase).toBe('idle')
      expect(state.loading).toBe(false)
      expect(state.error).toBeNull()
    })
  })

  describe('updateProfile', () => {
    it('updates profile and user in store on success', async () => {
      // Seed authenticated state
      useAuthStore.setState({ user: TEST_USER, profile: TEST_PROFILE, phase: 'ready' })

      mockSupabaseFrom.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({ error: null }),
      })
      mockUpdateUser.mockResolvedValue({ error: null })

      await useAuthStore.getState().updateProfile({ full_name: 'New Name' })

      const state = useAuthStore.getState()
      expect(state.user?.full_name).toBe('New Name')
      expect(state.profile?.full_name).toBe('New Name')
    })

    it('throws when no user is logged in', async () => {
      await expect(
        useAuthStore.getState().updateProfile({ full_name: 'X' })
      ).rejects.toThrow('No user logged in')
    })
  })

  describe('signOut', () => {
    it('clears user, profile, and resets phase to idle', async () => {
      useAuthStore.setState({ user: TEST_USER, profile: TEST_PROFILE, phase: 'ready' })

      await useAuthStore.getState().signOut()

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.profile).toBeNull()
      expect(state.phase).toBe('idle')
      expect(state.loading).toBe(false)
    })
  })

  describe('state shape', () => {
    it('profile includes email, provider, and admin_capabilities', () => {
      useAuthStore.setState({ profile: TEST_PROFILE })

      const { profile } = useAuthStore.getState()
      expect(profile).toBeDefined()
      expect(profile!.email).toBe('test@example.com')
      expect(profile!.provider).toBe('email')
      expect(profile!.admin_capabilities).toEqual({})
    })
  })

  describe('getCurrentUserId', () => {
    it('returns user id when authenticated', () => {
      useAuthStore.setState({ user: TEST_USER })
      expect(useAuthStore.getState().getCurrentUserId()).toBe('user-1')
    })

    it('returns null when no user', () => {
      expect(useAuthStore.getState().getCurrentUserId()).toBeNull()
    })
  })

  describe('isAuthenticated', () => {
    it('returns true when user exists with id', () => {
      useAuthStore.setState({ user: TEST_USER })
      expect(useAuthStore.getState().isAuthenticated()).toBe(true)
    })

    it('returns false when no user', () => {
      expect(useAuthStore.getState().isAuthenticated()).toBe(false)
    })
  })
})
