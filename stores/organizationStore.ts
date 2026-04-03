"use client"

import { create } from "zustand"
import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout'
import { OrganizationService } from "@/services/organization-service"

import { logger } from '@/lib/utils/logger'

interface Organization {
  id: string
  name: string
  slug: string
  description?: string
  logo_url?: string
  settings: any
  owner_id: string
  billing_email?: string
  billing_address?: any
  created_at: string
  updated_at: string
  members?: OrganizationMember[]
  role?: string
  member_count?: number
}

interface OrganizationMember {
  id: string
  organization_id: string
  user_id: string
  role: "owner" | "admin" | "manager" | "hr" | "finance"
  permissions: any
  invited_by?: string
  invited_at?: string
  joined_at: string
  created_at: string
  updated_at: string
  user?: {
    email: string
    user_metadata?: any
  }
}

interface OrganizationInvitation {
  id: string
  organization_id: string
  email: string
  role: "owner" | "admin" | "manager" | "hr" | "finance"
  permissions: any
  invited_by: string
  token: string
  expires_at: string
  accepted_at?: string
  created_at: string
}

interface AuditLog {
  id: string
  organization_id?: string
  user_id: string
  action: string
  resource_type: string
  resource_id?: string
  details: any
  ip_address?: string
  user_agent?: string
  created_at: string
}

interface OrganizationState {
  organizations: Organization[]
  currentOrganization: Organization | null
  members: OrganizationMember[]
  invitations: OrganizationInvitation[]
  auditLogs: AuditLog[]
  loading: boolean
  error: string | null
}

interface OrganizationActions {
  fetchOrganizations: () => Promise<void>
  createOrganization: (data: Partial<Organization>) => Promise<Organization>
  updateOrganization: (id: string, data: Partial<Organization>) => Promise<void>
  deleteOrganization: (id: string) => Promise<void>
  setCurrentOrganization: (org: Organization | null) => void

  fetchMembers: (orgId: string) => Promise<void>
  inviteMember: (orgId: string, email: string, role: string) => Promise<void>
  updateMemberRole: (memberId: string, role: string) => Promise<void>
  removeMember: (memberId: string) => Promise<void>

  fetchInvitations: (orgId: string) => Promise<void>
  cancelInvitation: (invitationId: string) => Promise<void>
  resendInvitation: (invitationId: string) => Promise<void>

  fetchAuditLogs: (orgId: string) => Promise<void>
  logAction: (action: string, resourceType: string, resourceId?: string, details?: any) => Promise<void>
}

export const useOrganizationStore = create<OrganizationState & OrganizationActions>((set, get) => ({
  organizations: [],
  currentOrganization: null,
  members: [],
  invitations: [],
  auditLogs: [],
  loading: false,
  error: null,

  fetchOrganizations: async () => {
    set({ loading: true, error: null })

    try {
      const response = await fetchWithTimeout('/api/organizations', {}, 8000)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch organizations')
      }

      const organizations = await response.json()
      set({ organizations, loading: false })
    } catch (error: any) {
      logger.error('Fetch organizations error:', error)
      set({ error: error.message || 'Failed to fetch organizations', loading: false })
    }
  },

  createOrganization: async (data: Partial<Organization>) => {
    try {
      logger.info('Starting organization creation with data:', data)

      const response = await fetchWithTimeout(
        '/api/organizations',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        },
        8000
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create organization')
      }

      const organization = await response.json()
      logger.info('Organization created successfully:', organization)

      set((state) => ({
        organizations: [organization, ...state.organizations],
      }))

      return organization
    } catch (error: any) {
      logger.error('Create organization error:', error)
      set({ error: error.message || 'Failed to create organization' })
      throw error
    }
  },

  updateOrganization: async (id: string, data: Partial<Organization>) => {
    // Optimistic update
    set((state) => ({
      organizations: state.organizations.map((org) => (org.id === id ? { ...org, ...data } : org)),
      currentOrganization:
        state.currentOrganization?.id === id ? { ...state.currentOrganization, ...data } : state.currentOrganization,
    }))

    try {
      await OrganizationService.updateOrganization(id, data as Record<string, any>)
    } catch (error: any) {
      // Rollback — refetch
      get().fetchOrganizations()
      set({ error: error.message })
      throw error
    }
  },

  deleteOrganization: async (id: string) => {
    // Optimistic remove
    const originalOrgs = get().organizations

    set((state) => ({
      organizations: state.organizations.filter((org) => org.id !== id),
      currentOrganization: state.currentOrganization?.id === id ? null : state.currentOrganization,
    }))

    try {
      await OrganizationService.deleteOrganization(id)
    } catch (error: any) {
      // Rollback
      set({ organizations: originalOrgs, error: error.message })
      throw error
    }
  },

  setCurrentOrganization: (org: Organization | null) => {
    set({ currentOrganization: org })
  },

  fetchMembers: async (orgId: string) => {
    set({ loading: true })

    try {
      const members = await OrganizationService.fetchMembers(orgId)
      set({ members: members || [], loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  inviteMember: async (orgId: string, email: string, role: string) => {
    try {
      await OrganizationService.inviteMember(orgId, email, role)
      await get().fetchInvitations(orgId)
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  updateMemberRole: async (memberId: string, role: string) => {
    // Optimistic update
    set((state) => ({
      members: state.members.map((member) => (member.id === memberId ? { ...member, role: role as any } : member)),
    }))

    try {
      const member = get().members.find(m => m.id === memberId)
      if (!member) throw new Error('Member not found')
      await OrganizationService.updateMemberRole(member.organization_id, memberId, role)
    } catch (error: any) {
      // Rollback — refetch
      const member = get().members.find(m => m.id === memberId)
      if (member) get().fetchMembers(member.organization_id)
      set({ error: error.message })
      throw error
    }
  },

  removeMember: async (memberId: string) => {
    const memberToRemove = get().members.find(m => m.id === memberId)

    // Optimistic remove
    set((state) => ({
      members: state.members.filter((member) => member.id !== memberId),
    }))

    try {
      if (!memberToRemove) throw new Error('Member not found')
      await OrganizationService.removeMember(memberToRemove.organization_id, memberId)
    } catch (error: any) {
      // Rollback
      if (memberToRemove) {
        set((state) => ({ members: [...state.members, memberToRemove] }))
      }
      set({ error: error.message })
      throw error
    }
  },

  fetchInvitations: async (orgId: string) => {
    try {
      const invitations = await OrganizationService.fetchInvitations(orgId)
      set({ invitations: invitations || [] })
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  cancelInvitation: async (invitationId: string) => {
    const invitationToCancel = get().invitations.find(inv => inv.id === invitationId)

    // Optimistic remove
    set((state) => ({
      invitations: state.invitations.filter((inv) => inv.id !== invitationId),
    }))

    try {
      if (!invitationToCancel) throw new Error('Invitation not found')
      await OrganizationService.cancelInvitation(invitationToCancel.organization_id, invitationId)
    } catch (error: any) {
      // Rollback
      if (invitationToCancel) {
        set((state) => ({ invitations: [...state.invitations, invitationToCancel] }))
      }
      set({ error: error.message })
      throw error
    }
  },

  resendInvitation: async (invitationId: string) => {
    // Resend uses the invite endpoint — re-invite with same email/role
    const invitation = get().invitations.find(inv => inv.id === invitationId)
    if (!invitation) throw new Error('Invitation not found')

    try {
      // Cancel old and re-invite
      await OrganizationService.cancelInvitation(invitation.organization_id, invitationId)
      await OrganizationService.inviteMember(invitation.organization_id, invitation.email, invitation.role)
      await get().fetchInvitations(invitation.organization_id)
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  fetchAuditLogs: async (orgId: string) => {
    // Read-path exception: no audit logs API route exists yet.
    // This remains a direct fetch to the existing org endpoint or is a no-op.
    // TODO: Create /api/organizations/[id]/audit-logs route
    try {
      const response = await fetchWithTimeout(`/api/organizations/${orgId}`, {}, 8000)
      if (!response.ok) throw new Error('Failed to fetch organization')
      // Audit logs are not currently exposed via API — clear for now
      set({ auditLogs: [] })
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  logAction: async (action: string, resourceType: string, resourceId?: string, details?: any) => {
    // Audit logging should be handled server-side by API routes, not client-side.
    // This is a no-op — server endpoints handle audit logging automatically.
    logger.debug('[OrganizationStore] logAction called (server-side concern):', { action, resourceType, resourceId })
  },
}))
