/**
 * Notion Workspaces Handler
 */

import { NotionIntegration, NotionWorkspace, NotionDataHandler } from '../types'
import { validateNotionIntegration, resolveNotionAccessToken } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getNotionWorkspaces: NotionDataHandler<NotionWorkspace> = async (
  integration: NotionIntegration
): Promise<NotionWorkspace[]> => {
  logger.debug('[Notion Workspaces] Fetching workspaces from metadata')

  try {
    validateNotionIntegration(integration)

    const metadata = integration.metadata || {}
    let workspaces = metadata.workspaces || {}

    // Check for workspace data in metadata first
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

    // If still no workspaces, fetch from Notion API directly
    if (Object.keys(workspaces).length === 0) {
      logger.debug('[Notion Workspaces] No workspace in metadata, fetching from Notion API')

      try {
        const accessToken = resolveNotionAccessToken(integration)

        // Get current user/bot info to determine workspace
        const response = await fetch('https://api.notion.com/v1/users/me', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Notion-Version': '2022-06-28',
          },
        })

        if (response.ok) {
          const userData = await response.json()

          // The bot info contains workspace details
          if (userData.bot?.workspace_name) {
            const workspaceId = userData.bot.owner?.workspace ? 'workspace' : userData.id
            workspaces = {
              [workspaceId]: {
                workspace_id: workspaceId,
                workspace_name: userData.bot.workspace_name,
                workspace_icon: null,
                bot_id: userData.id,
                owner_type: userData.bot.owner?.type || 'workspace',
              }
            }
            logger.debug('[Notion Workspaces] Got workspace from API', {
              workspaceName: userData.bot.workspace_name
            })
          }
        } else {
          logger.warn('[Notion Workspaces] Failed to fetch from API', {
            status: response.status
          })
        }
      } catch (apiError: any) {
        logger.warn('[Notion Workspaces] API fetch failed, continuing with empty', {
          error: apiError.message
        })
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
