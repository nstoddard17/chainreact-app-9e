import { useState, useEffect, useCallback } from 'react'
import { logger } from '@/lib/utils/logger'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useWorkflowStore } from '@/stores/workflowStore'

export interface WorkspaceContext {
  type: 'personal' | 'team' | 'organization'
  id: string | null
  name: string
  isPersonal: boolean
}

/**
 * Hook to manage workspace context across the app
 *
 * The workspace context is stored in localStorage and synced across tabs.
 * It determines which integrations, workflows, and resources are visible.
 *
 * @returns Workspace context and methods to update it
 */
export function useWorkspaceContext() {
  const [workspaceContext, setWorkspaceContextState] = useState<WorkspaceContext>(() => {
    // Initialize from localStorage or default to personal
    if (typeof window === 'undefined') {
      return {
        type: 'personal' as const,
        id: null,
        name: 'Personal',
        isPersonal: true,
      }
    }

    try {
      const storedId = localStorage.getItem('current_workspace_id')
      const storedType = localStorage.getItem('current_workspace_type') as 'personal' | 'team' | 'organization' | null
      const storedName = localStorage.getItem('current_workspace_name')

      if (storedType && (storedType === 'team' || storedType === 'organization')) {
        return {
          type: storedType,
          id: storedId,
          name: storedName || 'Workspace',
          isPersonal: false,
        }
      }

      // Default to personal
      return {
        type: 'personal' as const,
        id: null,
        name: 'Personal',
        isPersonal: true,
      }
    } catch (error) {
      logger.error('Error loading workspace context from localStorage:', error)
      return {
        type: 'personal' as const,
        id: null,
        name: 'Personal',
        isPersonal: true,
      }
    }
  })

  // Sync localStorage workspace to stores on mount
  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const storedId = localStorage.getItem('current_workspace_id')
      const storedType = localStorage.getItem('current_workspace_type') as 'personal' | 'team' | 'organization' | null

      if (storedType) {
        // Sync to integration store
        const integrationStore = useIntegrationStore.getState()
        if (integrationStore.workspaceType !== storedType || integrationStore.workspaceId !== storedId) {
          logger.debug('[useWorkspaceContext] Syncing localStorage workspace to integrationStore', {
            type: storedType,
            id: storedId
          })
          integrationStore.setWorkspaceContext(storedType, storedId)
        }

        // Sync to workflow store
        const workflowStore = useWorkflowStore.getState()
        if (workflowStore.workspaceType !== storedType || workflowStore.workspaceId !== storedId) {
          logger.debug('[useWorkspaceContext] Syncing localStorage workspace to workflowStore', {
            type: storedType,
            id: storedId
          })
          workflowStore.setWorkspaceContext(storedType, storedId)
        }
      }
    } catch (error) {
      logger.error('[useWorkspaceContext] Error syncing workspace to stores:', error)
    }
  }, []) // Run once on mount

  // Listen for organization-changed events from OrganizationSwitcher
  useEffect(() => {
    const handleOrganizationChanged = (event: CustomEvent) => {
      const org = event.detail
      if (!org) return

      logger.debug('Workspace context changed:', {
        type: org.is_workspace ? 'personal' : (org.team_count > 0 ? 'organization' : 'team'),
        id: org.id,
        name: org.name
      })

      // Determine workspace type
      let type: 'personal' | 'team' | 'organization'
      if (org.is_workspace) {
        type = 'personal'
      } else if (org.team_count > 0) {
        // Has teams, so it's an organization
        type = 'organization'
      } else {
        // No teams, so it's a team
        type = 'team'
      }

      setWorkspaceContextState({
        type,
        id: type === 'personal' ? null : org.id,
        name: org.name || 'Workspace',
        isPersonal: type === 'personal',
      })

      // Store in localStorage for persistence
      localStorage.setItem('current_workspace_type', type)
      if (type !== 'personal') {
        localStorage.setItem('current_workspace_id', org.id)
      } else {
        localStorage.removeItem('current_workspace_id')
      }
      localStorage.setItem('current_workspace_name', org.name || 'Workspace')
    }

    window.addEventListener('organization-changed', handleOrganizationChanged as EventListener)

    return () => {
      window.removeEventListener('organization-changed', handleOrganizationChanged as EventListener)
    }
  }, [])

  // Method to manually set workspace context (useful for programmatic changes)
  const setWorkspaceContext = useCallback((
    type: 'personal' | 'team' | 'organization',
    id: string | null,
    name: string
  ) => {
    setWorkspaceContextState({
      type,
      id,
      name,
      isPersonal: type === 'personal',
    })

    // Store in localStorage
    localStorage.setItem('current_workspace_type', type)
    if (type !== 'personal' && id) {
      localStorage.setItem('current_workspace_id', id)
    } else {
      localStorage.removeItem('current_workspace_id')
    }
    localStorage.setItem('current_workspace_name', name)

    // Dispatch event so other components can react
    window.dispatchEvent(new CustomEvent('workspace-context-changed', {
      detail: { type, id, name, isPersonal: type === 'personal' }
    }))
  }, [])

  return {
    workspaceContext,
    setWorkspaceContext,
    // Convenience methods
    isPersonalWorkspace: workspaceContext.isPersonal,
    isTeamWorkspace: workspaceContext.type === 'team',
    isOrganizationWorkspace: workspaceContext.type === 'organization',
  }
}
