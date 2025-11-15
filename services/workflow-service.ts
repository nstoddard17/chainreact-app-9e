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
   */
  static async fetchWorkflows(
    force = false,
    filterContext?: 'personal' | 'team' | 'organization' | null,
    workspaceId?: string
  ): Promise<Workflow[]> {
    const { user, session } = await SessionManager.getSecureUserAndSession()

    logger.debug('🌐 [WorkflowService] Making API call (unified view)', {
      force,
      filterContext: filterContext || 'ALL (unified)',
      workspaceId,
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

    logger.debug('🌐 [WorkflowService] Creating workflow', {
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
    const workflow = data.data?.workflow

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
  ): Promise<void> {
    const { session } = await SessionManager.getSecureUserAndSession()

    logger.debug('🌐 [WorkflowService] Updating workflow', {
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

    logger.debug('✅ [WorkflowService] Successfully updated workflow', { id });
  }

  /**
   * Delete a workflow
   *
   * @param id - Workflow ID
   */
  static async deleteWorkflow(id: string): Promise<void> {
    const { session } = await SessionManager.getSecureUserAndSession()

    logger.debug('🌐 [WorkflowService] Deleting workflow', {
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

    logger.debug('✅ [WorkflowService] Successfully deleted workflow', { id });
  }
}
