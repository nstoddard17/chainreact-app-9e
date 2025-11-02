import { SessionManager } from "@/lib/auth/session"
import { logger } from '@/lib/utils/logger'
import { useDebugStore } from '@/stores/debugStore'
import type { Workflow } from '@/stores/workflowStore'

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

    // Retry logic
    const maxRetries = 2
    let lastError: any = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Add timeout to prevent hanging requests
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 45000) // 45 second timeout

      try {
        logger.debug('🌐 [WorkflowService] Making API call (unified view)', {
          attempt: attempt + 1,
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
        const startTime = Date.now()

        // Debug logging
        const requestId = useDebugStore.getState().logApiCall('GET', url, { filterContext, workspaceId })

        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          signal: controller.signal,
        })

        clearTimeout(timeoutId)
        const duration = Date.now() - startTime

        if (!response.ok) {
          useDebugStore.getState().logApiError(requestId, new Error(`HTTP ${response.status}: ${response.statusText}`), duration)
          throw new Error(`Failed to fetch workflows: ${response.statusText}`)
        }

        const data = await response.json()
        const workflows = data.data || []

        // Debug log successful response
        useDebugStore.getState().logApiResponse(requestId, response.status, {
          count: workflows.length,
          hasPermissions: workflows.filter((w: any) => w.user_permission).length,
          sample: workflows.slice(0, 2).map((w: any) => ({
            name: w.name,
            workspace_type: w.workspace_type,
            user_permission: w.user_permission
          }))
        }, duration)

        logger.debug('✅ [WorkflowService] Successfully fetched workflows', {
          count: workflows.length,
          duration: `${duration}ms`,
          filterContext: filterContext || 'ALL',
          workspaceId
        });

        return workflows

      } catch (error: any) {
        lastError = error

        // Handle abort (timeout) errors
        if (error.name === 'AbortError') {
          logger.warn(`[WorkflowService] Request timeout on attempt ${attempt + 1}/${maxRetries + 1}`)

          // Don't retry on last attempt
          if (attempt === maxRetries) {
            logger.error('[WorkflowService] All retry attempts exhausted (timeout)')
            throw new Error('Request timeout - please try again')
          }

          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)))
          continue
        }

        // Handle network errors
        if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
          logger.warn(`[WorkflowService] Network error on attempt ${attempt + 1}/${maxRetries + 1}: ${error.message}`)

          if (attempt === maxRetries) {
            logger.error('[WorkflowService] All retry attempts exhausted (network error)')
            throw new Error('Network error - please check your connection')
          }

          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)))
          continue
        }

        // For other errors, throw immediately
        logger.error('[WorkflowService] Fetch failed:', error)
        throw error
      }
    }

    // If we get here, all retries failed
    throw lastError || new Error('Failed to fetch workflows after retries')
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

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    try {
      logger.debug('🌐 [WorkflowService] Creating workflow', {
        name,
        workspaceType,
        workspaceId,
        timestamp: new Date().toISOString()
      });

      const requestId = useDebugStore.getState().logApiCall('POST', '/api/workflows', {
        name,
        workspaceType,
        workspaceId
      })

      const response = await fetch('/api/workflows', {
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
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        useDebugStore.getState().logApiError(requestId, new Error(`HTTP ${response.status}: ${response.statusText}`))
        throw new Error(`Failed to create workflow: ${response.statusText}`)
      }

      const data = await response.json()
      const workflow = data.data?.workflow

      if (!workflow) {
        throw new Error('No workflow returned from API')
      }

      useDebugStore.getState().logApiResponse(requestId, response.status, {
        workflowId: workflow.id,
        name: workflow.name
      })

      logger.debug('✅ [WorkflowService] Successfully created workflow', {
        workflowId: workflow.id,
        name: workflow.name
      });

      return workflow

    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - please try again')
      }
      logger.error('[WorkflowService] Create workflow failed:', error)
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
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

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    try {
      logger.debug('🌐 [WorkflowService] Updating workflow', {
        id,
        updates: Object.keys(updates),
        timestamp: new Date().toISOString()
      });

      const response = await fetch(`/api/workflows/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(updates),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Failed to update workflow: ${response.statusText}`)
      }

      logger.debug('✅ [WorkflowService] Successfully updated workflow', { id });

    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - please try again')
      }
      logger.error('[WorkflowService] Update workflow failed:', error)
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Delete a workflow
   *
   * @param id - Workflow ID
   */
  static async deleteWorkflow(id: string): Promise<void> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    try {
      logger.debug('🌐 [WorkflowService] Deleting workflow', {
        id,
        timestamp: new Date().toISOString()
      });

      const response = await fetch(`/api/workflows/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Failed to delete workflow: ${response.statusText}`)
      }

      logger.debug('✅ [WorkflowService] Successfully deleted workflow', { id });

    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - please try again')
      }
      logger.error('[WorkflowService] Delete workflow failed:', error)
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }
}
