/**
 * Notion Workspaces Handler
 */

import { NotionIntegration, NotionWorkspace, NotionDataHandler } from '../types'
import { validateNotionIntegration } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getNotionWorkspaces: NotionDataHandler<NotionWorkspace> = async (
  integration: NotionIntegration
): Promise<NotionWorkspace[]> => {
  logger.debug('[Notion Workspaces] Fetching workspaces from metadata')

  try {
    validateNotionIntegration(integration)

    const metadata = integration.metadata || {}
    let workspaces = metadata.workspaces || {}

    if (Object.keys(workspaces).length === 0 && metadata.workspace_id && metadata.workspace_name) {
      workspaces = {
        [metadata.workspace_id]: {
          workspace_id: metadata.workspace_id,
          workspace_name: metadata.workspace_name,
          workspace_icon: metadata.workspace_icon,
          bot_id: metadata.bot_id,
          owner_type: metadata.owner_type,
          user_info: metadata.user_info
        }
      }
    }

    const workspaceArray = Object.entries(workspaces).map(([id, workspace]: [string, any]) => ({
      id,
      name: workspace.workspace_name || workspace.name || id,
      value: id,
      label: workspace.workspace_name || workspace.name || id,
      icon: workspace.workspace_icon || workspace.icon,
      owner: workspace.owner_type || workspace.owner,
      object: workspace.object || 'workspace'
    }))

    logger.debug('[Notion Workspaces] Found workspaces', { count: workspaceArray.length })

    return workspaceArray
  } catch (error: any) {
    logger.error('[Notion Workspaces] Error fetching workspaces', { message: error.message })
    throw new Error(error.message || 'Error fetching Notion workspaces')
  }
}
