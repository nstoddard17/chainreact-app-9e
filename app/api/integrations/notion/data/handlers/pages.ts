/**
 * Notion Pages Handler
 */

import { NotionIntegration, NotionPage, NotionDataHandler } from '../types'
import {
    validateNotionIntegration,
    makeNotionApiRequest,
    resolveNotionAccessToken,
    getNotionRequestOptions
} from '../utils'

import { logger } from '@/lib/utils/logger'

const pageCache = new Map<string, { data: NotionPage[]; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

const TITLE_CANDIDATES = [
    'title',
    'Title',
    'Name',
    'name',
    'Page',
    'Task Name',
    'Task name',
    'Project name',
    'Project Name',
    'Item',
    'item',
    'Task',
    'task'
]

export const getNotionPages: NotionDataHandler<NotionPage> = async (
    integration: NotionIntegration,
    context?: any
): Promise<NotionPage[]> => {
    validateNotionIntegration(integration)

    const { workspaceId: requestedWorkspace } = getNotionRequestOptions(context)
    const cacheKey = `${integration.id}_${requestedWorkspace || 'all'}`
    const cached = pageCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        logger.debug('[Notion Pages] Returning cached result', {
            integrationId: integration.id,
            workspace: requestedWorkspace || 'all'
        })
        return cached.data
    }

    const workspaceMap = integration.metadata?.workspaces || {}
    const workspaceIds = Object.keys(workspaceMap)

    if (workspaceIds.length === 0) {
        throw new Error('No workspaces found in Notion integration metadata')
    }

    const workspacesToProcess = requestedWorkspace
        ? workspaceIds.filter(id => id === requestedWorkspace)
        : workspaceIds

    if (!workspacesToProcess.length) {
        logger.warn('[Notion Pages] Requested workspace not found', {
            integrationId: integration.id,
            requestedWorkspace
        })
        return []
    }

    const allPages: NotionPage[] = []

    for (const workspaceId of workspacesToProcess) {
        const workspace = workspaceMap[workspaceId]
        const workspaceName = workspace?.workspace_name || workspace?.name || workspaceId

        try {
            const accessToken = resolveNotionAccessToken(integration, workspaceId)
            const response = await makeNotionApiRequest(
                'https://api.notion.com/v1/search',
                accessToken,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        filter: { property: 'object', value: 'page' },
                        sort: { direction: 'descending', timestamp: 'last_edited_time' },
                        page_size: 50
                    })
                }
            )

            const data = await response.json()
            const pages = (data.results || []).filter((item: any) => item.object === 'page')

            logger.debug('[Notion Pages] Workspace pages fetched', {
                workspaceId,
                workspaceName,
                count: pages.length
            })

            const transformedPages = pages
                .filter((page: any) => !page.archived)
                .map(page => transformPage(page, workspaceName, workspaceId))
                .filter((page): page is NotionPage => Boolean(page))

            allPages.push(...transformedPages)
        } catch (error: any) {
            logger.error('[Notion Pages] Workspace fetch failed', {
                workspaceId,
                workspaceName,
                message: error.message
            })
        }
    }

    pageCache.set(cacheKey, { data: allPages, timestamp: Date.now() })

    logger.debug('[Notion Pages] Total pages returned', {
        integrationId: integration.id,
        workspace: requestedWorkspace || 'all',
        count: allPages.length
    })

    return allPages
}

function transformPage(page: any, workspaceName: string, workspaceId: string): NotionPage | null {
    const title = extractTitle(page)
    const hasContent = pageHasContent(page, title)

    if (!hasContent) {
        return null
    }

    return {
        id: page.id,
        name: title,
        title,
        value: page.id,
        label: title !== 'Untitled' ? title : `Page (${page.id.substring(0, 8)}...)`,
        url: page.url,
        created_time: page.created_time,
        last_edited_time: page.last_edited_time,
        workspace: workspaceName,
        workspaceId,
        object: page.object,
        parent: page.parent,
        archived: page.archived,
        properties: page.properties
    }
}

function extractTitle(page: any): string {
    if (!page?.properties) {
        return 'Untitled'
    }

    for (const key of TITLE_CANDIDATES) {
        const property = page.properties[key]
        if (property && property.type === 'title' && property.title?.length) {
            return property.title[0]?.plain_text || 'Untitled'
        }
    }

    for (const property of Object.values(page.properties)) {
        if ((property as any).type === 'title') {
            const titleItems = (property as any).title || []
            if (titleItems.length) {
                return titleItems[0]?.plain_text || 'Untitled'
            }
        }
    }

    return 'Untitled'
}

function pageHasContent(page: any, title: string): boolean {
    if (title !== 'Untitled') {
        return true
    }

    if (!page.properties) {
        return page.last_edited_time !== page.created_time
    }

    return Object.values(page.properties).some((prop: any) => {
        if (prop.type === 'title') {
            return false
        }

        switch (prop.type) {
            case 'rich_text':
                return prop.rich_text?.length > 0
            case 'number':
                return prop.number !== null
            case 'checkbox':
                return prop.checkbox === true
            case 'select':
                return !!prop.select?.name
            case 'multi_select':
                return (prop.multi_select?.length || 0) > 0
            case 'date':
                return !!prop.date?.start
            case 'people':
                return (prop.people?.length || 0) > 0
            case 'files':
                return (prop.files?.length || 0) > 0
            case 'url':
                return !!prop.url
            case 'email':
                return !!prop.email
            case 'phone_number':
                return !!prop.phone_number
            default:
                return false
        }
    })
}

/**
 * Get archived pages from Notion
 * Similar to getNotionPages but only returns archived pages
 */
export const getNotionArchivedPages: NotionDataHandler<NotionPage> = async (
    integration: NotionIntegration,
    context?: any
): Promise<NotionPage[]> => {
    validateNotionIntegration(integration)

    const { workspaceId: requestedWorkspace } = getNotionRequestOptions(context)
    const cacheKey = `archived_${integration.id}_${requestedWorkspace || 'all'}`
    const cached = pageCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        logger.debug('[Notion Archived Pages] Returning cached result', {
            integrationId: integration.id,
            workspace: requestedWorkspace || 'all'
        })
        return cached.data
    }

    const workspaceMap = integration.metadata?.workspaces || {}
    const workspaceIds = Object.keys(workspaceMap)

    if (workspaceIds.length === 0) {
        throw new Error('No workspaces found in Notion integration metadata')
    }

    const workspacesToProcess = requestedWorkspace
        ? workspaceIds.filter(id => id === requestedWorkspace)
        : workspaceIds

    if (!workspacesToProcess.length) {
        logger.warn('[Notion Archived Pages] Requested workspace not found', {
            integrationId: integration.id,
            requestedWorkspace
        })
        return []
    }

    const allPages: NotionPage[] = []

    for (const workspaceId of workspacesToProcess) {
        const workspace = workspaceMap[workspaceId]
        const workspaceName = workspace?.workspace_name || workspace?.name || workspaceId

        try {
            const accessToken = resolveNotionAccessToken(integration, workspaceId)

            // Search for pages - Notion search doesn't have a direct "archived" filter
            // so we fetch more pages and filter client-side
            const response = await makeNotionApiRequest(
                'https://api.notion.com/v1/search',
                accessToken,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        filter: { property: 'object', value: 'page' },
                        sort: { direction: 'descending', timestamp: 'last_edited_time' },
                        page_size: 100 // Fetch more to find archived pages
                    })
                }
            )

            const data = await response.json()
            const pages = (data.results || []).filter((item: any) => item.object === 'page')

            logger.debug('[Notion Archived Pages] Workspace pages fetched', {
                workspaceId,
                workspaceName,
                totalCount: pages.length
            })

            // Filter to ONLY archived pages
            const transformedPages = pages
                .filter((page: any) => page.archived === true)
                .map((page: any) => transformArchivedPage(page, workspaceName, workspaceId))
                .filter((page): page is NotionPage => Boolean(page))

            logger.debug('[Notion Archived Pages] Archived pages found', {
                workspaceId,
                archivedCount: transformedPages.length
            })

            allPages.push(...transformedPages)
        } catch (error: any) {
            logger.error('[Notion Archived Pages] Workspace fetch failed', {
                workspaceId,
                workspaceName,
                message: error.message
            })
        }
    }

    pageCache.set(cacheKey, { data: allPages, timestamp: Date.now() })

    logger.debug('[Notion Archived Pages] Total archived pages returned', {
        integrationId: integration.id,
        workspace: requestedWorkspace || 'all',
        count: allPages.length
    })

    return allPages
}

function transformArchivedPage(page: any, workspaceName: string, workspaceId: string): NotionPage | null {
    const title = extractTitle(page)

    return {
        id: page.id,
        name: title,
        title,
        value: page.id,
        label: `${title} (archived)`,
        url: page.url,
        created_time: page.created_time,
        last_edited_time: page.last_edited_time,
        workspace: workspaceName,
        workspaceId,
        object: page.object,
        parent: page.parent,
        archived: page.archived,
        properties: page.properties
    }
}
