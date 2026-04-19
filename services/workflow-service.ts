import { SessionManager } from "@/lib/auth/session"
import { logger } from '@/lib/utils/logger'
import { useDebugStore } from '@/stores/debugStore'
import type { Workflow } from '@/stores/workflowStore'
import { fetchWithRetry } from '@/lib/utils/fetch-with-retry'

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

/**
 * WorkflowService handles all API operations for workflows
 * Following the same pattern as IntegrationService for workspace context support
 */
export class WorkflowService {

  /**
   * Fetch user's workflows with OPTIONAL workspace filtering (unified view by default)
   *
   * @param force - Force refresh cache
   * @param filterContext - OPTIONAL filter by workspace type ('personal' | 'team' | 'organization' | null)
   *                        If null/undefined, fetches ALL workflows user has access to (unified view)
   * @param workspaceId - Workspace ID (required if filterContext is team/organization)
   * @param includeTrash - If true, include soft-deleted (trashed) workflows in the response
   */
  static async fetchWorkflows(
    force = false,
    filterContext?: 'personal' | 'team' | 'organization' | null,
    workspaceId?: string,
    includeTrash = false
  ): Promise<Workflow[]> {
    const { user, session } = await SessionManager.getSecureUserAndSession()

    logger.info('🌐 [WorkflowService] Making API call (unified view)', {
      force,
      filterContext: filterContext || 'ALL (unified)',
      workspaceId,
      includeTrash,
      timestamp: new Date().toISOString()
    });

    // Build query parameters - OPTIONAL filtering
    const params = new URLSearchParams()
    if (filterContext) {
      params.append('filter_context', filterContext)
    }
    if (workspaceId) {
      params.append('workspace_id', workspaceId)
    }
    if (includeTrash) {
      params.append('include_trash', 'true')
    }

    const url = `/api/workflows${params.toString() ? '?' + params.toString() : ''}`

    const response = await fetchWithRetry(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
    }, {
      maxRetries: 2,
      timeoutMs: 45000,
      useExponentialBackoff: true,
      onRetry: (attempt) => {
        logger.warn(`[WorkflowService] Retrying... (attempt ${attempt})`)
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch workflows: ${response.statusText}`)
    }

    const data = await response.json()
    const workflows = data.data || []

    return workflows
  }

  /**
   * Create a new workflow with workspace context
   *
   * @param name - Workflow name
   * @param description - Workflow description
   * @param workspaceType - Workspace type
   * @param workspaceId - Workspace ID (required for team/organization)
   * @param organizationId - Legacy organization ID (deprecated, use workspace context)
   * @param folderId - Folder ID
   */
  static async createWorkflow(
    name: string,
    description?: string,
    workspaceType: 'personal' | 'team' | 'organization' = 'personal',
    workspaceId?: string,
    organizationId?: string,
    folderId?: string
  ): Promise<Workflow> {
    const { session } = await SessionManager.getSecureUserAndSession()

    logger.info('🌐 [WorkflowService] Creating workflow', {
      name,
      workspaceType,
      workspaceId,
      timestamp: new Date().toISOString()
    });

    const response = await fetchWithRetry('/api/workflows', {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        name,
        description,
        workspace_type: workspaceType,
        workspace_id: workspaceId,
        organization_id: organizationId,
        folder_id: folderId,
      }),
    }, {
      maxRetries: 1, // Don't retry creates to avoid duplicates
      timeoutMs: 30000,
    })

    if (!response.ok) {
      throw new Error(`Failed to create workflow: ${response.statusText}`)
    }

    const data = await response.json()
    const workflow = data.workflow ?? data.data?.workflow

    if (!workflow) {
      throw new Error('No workflow returned from API')
    }

    return workflow
  }

  /**
   * Update a workflow
   *
   * @param id - Workflow ID
   * @param updates - Partial workflow updates
   */
  static async updateWorkflow(
    id: string,
    updates: Partial<Workflow>
  ): Promise<any> {
    const { session } = await SessionManager.getSecureUserAndSession()

    logger.info('🌐 [WorkflowService] Updating workflow', {
      id,
      updates: Object.keys(updates),
      timestamp: new Date().toISOString()
    });

    const response = await fetchWithRetry(`/api/workflows/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(updates),
    }, {
      maxRetries: 1, // Don't retry updates to avoid conflicts
      timeoutMs: 30000,
    })

    if (!response.ok) {
      throw new Error(`Failed to update workflow: ${response.statusText}`)
    }

    const data = await response.json()
    logger.info('✅ [WorkflowService] Successfully updated workflow', { id });
    return data
  }

  /**
   * Delete a workflow
   *
   * @param id - Workflow ID
   */
  static async deleteWorkflow(id: string): Promise<void> {
    const { session } = await SessionManager.getSecureUserAndSession()

    logger.info('🌐 [WorkflowService] Deleting workflow', {
      id,
      timestamp: new Date().toISOString()
    });

    const response = await fetchWithRetry(`/api/workflows/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    }, {
      maxRetries: 1, // Don't retry deletes to avoid confusion
      timeoutMs: 30000,
    })

    if (!response.ok) {
      throw new Error(`Failed to delete workflow: ${response.statusText}`)
    }

    logger.info('✅ [WorkflowService] Successfully deleted workflow', { id });
  }

  // --- Duplication ---

  static async duplicateWorkflow(id: string): Promise<Workflow> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/workflows/${id}/duplicate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `Failed to duplicate workflow: ${response.statusText}`)
    }

    const data = await response.json()
    return data.data?.workflow || data.workflow
  }

  // --- Sharing ---

  static async shareWorkflow(id: string, teamIds: string[]): Promise<any> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/workflows/${id}/share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ teamIds }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `Failed to share workflow: ${response.statusText}`)
    }

    return response.json()
  }

  static async unshareWorkflow(id: string, teamId: string): Promise<void> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/workflows/${id}/share?teamId=${teamId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `Failed to unshare workflow: ${response.statusText}`)
    }
  }

  // --- Permissions ---

  static async addPermission(id: string, userId: string, permission: string): Promise<any> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/workflows/${id}/permissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ user_id: userId, permission }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `Failed to add permission: ${response.statusText}`)
    }

    return response.json()
  }

  static async removePermission(id: string, userId: string): Promise<void> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/workflows/${id}/permissions?user_id=${userId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `Failed to remove permission: ${response.statusText}`)
    }
  }

  static async updatePermission(id: string, userId: string, permission: string): Promise<any> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/workflows/${id}/permissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ user_id: userId, permission }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `Failed to update permission: ${response.statusText}`)
    }

    return response.json()
  }

  // --- Batch Operations ---

  static async batchOperation(
    operation: 'delete' | 'move' | 'trash' | 'restore' | 'empty-trash',
    workflowIds: string[],
    data?: Record<string, any>
  ): Promise<{ success: boolean; processed: number; failed: number; errors: string[] }> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch('/api/workflows/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ operation, workflowIds, data }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Batch ${operation} failed: ${response.statusText}`)
    }

    return response.json()
  }

  // --- Activation ---

  static async activateWorkflow(id: string): Promise<any> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/workflows/${id}/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `Failed to activate workflow: ${response.statusText}`)
    }

    return response.json()
  }

  static async deactivateWorkflow(id: string): Promise<any> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/workflows/${id}/deactivate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `Failed to deactivate workflow: ${response.statusText}`)
    }

    return response.json()
  }

  // --- Folders ---

  static async fetchFolders(): Promise<any[]> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetchWithRetry('/api/workflows/folders', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    }, {
      maxRetries: 2,
      timeoutMs: 15000,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch folders: ${response.statusText}`)
    }

    const data = await response.json()
    return data.data?.folders || data.folders || []
  }

  static async createFolder(name: string, description?: string): Promise<any> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch('/api/workflows/folders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ name, description }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `Failed to create folder: ${response.statusText}`)
    }

    return response.json()
  }

  static async updateFolder(id: string, updates: { name?: string; description?: string }): Promise<void> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/workflows/folders/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(updates),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `Failed to update folder: ${response.statusText}`)
    }
  }

  static async deleteFolder(id: string, options?: { action?: string; targetFolderId?: string | null }): Promise<void> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const fetchOptions: RequestInit = {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    }

    if (options) {
      (fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/json'
      fetchOptions.body = JSON.stringify(options)
    }

    const response = await fetch(`/api/workflows/folders/${id}`, fetchOptions)

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `Failed to delete folder: ${response.statusText}`)
    }
  }

  static async setDefaultFolder(id: string): Promise<void> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/workflows/folders/${id}/set-default`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `Failed to set default folder: ${response.statusText}`)
    }
  }
}
