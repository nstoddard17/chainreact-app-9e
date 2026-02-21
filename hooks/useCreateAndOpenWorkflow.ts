/**
 * Hook for creating a workflow and navigating directly to the builder.
 * This unifies the workflow creation flow - no separate AI agent page needed.
 * The builder opens with the AI panel visible by default.
 */

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useWorkspaceContext } from '@/hooks/useWorkspaceContext'
import { useAuthStore } from '@/stores/authStore'
import { logger } from '@/lib/utils/logger'

interface CreateWorkflowOptions {
  /** Initial prompt to pass to the AI agent (optional) */
  prompt?: string
  /** Workspace type override */
  workspaceType?: 'personal' | 'team' | 'organization'
  /** Workspace ID override */
  workspaceId?: string | null
}

export function useCreateAndOpenWorkflow() {
  const router = useRouter()
  const { setWorkspaceContext } = useWorkflowStore()
  const { workspaceContext } = useWorkspaceContext()
  const { profile } = useAuthStore()
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createAndOpen = useCallback(async (options: CreateWorkflowOptions = {}) => {
    setIsCreating(true)
    setError(null)

    try {
      // Determine workspace context
      const wsType = options.workspaceType || workspaceContext?.type || 'personal'
      const wsId = options.workspaceId !== undefined ? options.workspaceId : workspaceContext?.id || null

      // Set workspace context
      setWorkspaceContext(wsType, wsId)

      logger.info('[useCreateAndOpenWorkflow] Creating workflow', {
        workspaceType: wsType,
        workspaceId: wsId,
        hasPrompt: !!options.prompt,
      })

      // Create workflow via API
      const response = await fetch('/workflows/v2/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Workflow',
          description: '',
        }),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText)
        throw new Error(errorText || 'Failed to create workflow')
      }

      const data = await response.json()
      const flowId = data?.flowId

      if (!flowId) {
        throw new Error('No workflow ID returned')
      }

      logger.info('[useCreateAndOpenWorkflow] Workflow created', { flowId })

      // Build the URL - always open AI panel for new workflows
      let url = `/workflows/builder/${flowId}?openPanel=true`
      if (options.prompt) {
        url += `&prompt=${encodeURIComponent(options.prompt)}`
      }

      // Navigate to builder
      router.push(url)

      return { flowId }
    } catch (err: any) {
      const message = err?.message || 'Failed to create workflow'
      logger.error('[useCreateAndOpenWorkflow] Error', { error: message })
      setError(message)
      throw err
    } finally {
      setIsCreating(false)
    }
  }, [router, setWorkspaceContext, workspaceContext])

  return {
    createAndOpen,
    isCreating,
    error,
  }
}
