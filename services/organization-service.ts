import { SessionManager } from "@/lib/auth/session"
import { logger } from '@/lib/utils/logger'
import { fetchWithRetry } from '@/lib/utils/fetch-with-retry'

/**
 * OrganizationService handles all API operations for organizations.
 * Follows the same pattern as WorkflowService/IntegrationService.
 */
export class OrganizationService {

  // --- Organization CRUD ---

  static async updateOrganization(id: string, data: Record<string, any>): Promise<void> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/organizations/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Failed to update organization: ${response.statusText}`)
    }
  }

  static async deleteOrganization(id: string): Promise<void> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/organizations/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Failed to delete organization: ${response.statusText}`)
    }
  }

  // --- Members ---

  static async fetchMembers(orgId: string): Promise<any[]> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetchWithRetry(`/api/organizations/${orgId}/members`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    }, {
      maxRetries: 2,
      timeoutMs: 10000,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch members: ${response.statusText}`)
    }

    const data = await response.json()
    return data.data?.members || data.members || data || []
  }

  static async inviteMember(orgId: string, email: string, role: string): Promise<void> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/organizations/${orgId}/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ email, role }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Failed to invite member: ${response.statusText}`)
    }
  }

  static async updateMemberRole(orgId: string, memberId: string, role: string): Promise<void> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/organizations/${orgId}/members/${memberId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ role }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Failed to update member role: ${response.statusText}`)
    }
  }

  static async removeMember(orgId: string, memberId: string): Promise<void> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/organizations/${orgId}/members/${memberId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Failed to remove member: ${response.statusText}`)
    }
  }

  // --- Invitations ---

  static async fetchInvitations(orgId: string): Promise<any[]> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetchWithRetry(`/api/organizations/${orgId}/invitations`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    }, {
      maxRetries: 2,
      timeoutMs: 10000,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch invitations: ${response.statusText}`)
    }

    const data = await response.json()
    return data.data?.invitations || data.invitations || data || []
  }

  static async cancelInvitation(orgId: string, invitationId: string): Promise<void> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/organizations/${orgId}/invitations?invitationId=${invitationId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Failed to cancel invitation: ${response.statusText}`)
    }
  }
}
