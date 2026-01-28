import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

import { MicrosoftGraphAuth } from '@/lib/microsoft-graph/auth'
import { getWebhookBaseUrl } from '@/lib/utils/getBaseUrl'
import { logger } from '@/lib/utils/logger'
import { PollingContext, PollingHandler } from '@/lib/triggers/polling'

const ROLE_POLL_INTERVAL_MS: Record<string, number> = {
  free: 15 * 60 * 1000,
  pro: 2 * 60 * 1000,
  'beta-pro': 2 * 60 * 1000,
  business: 60 * 1000,
  enterprise: 60 * 1000,
  admin: 60 * 1000
}

const DEFAULT_POLL_INTERVAL_MS = 15 * 60 * 1000

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

type PageSnapshot = {
  pageIds: Record<string, string>  // pageId -> hash of page metadata
  updatedAt: string
}

async function fetchPagesSnapshot(
  accessToken: string,
  notebookId: string,
  sectionId?: string
): Promise<{ pages: any[]; pageIds: Record<string, string> }> {
  const pages: any[] = []

  if (sectionId) {
    // Fetch pages from specific section
    const url = `https://graph.microsoft.com/v1.0/me/onenote/sections/${sectionId}/pages?$top=100&$orderby=createdDateTime desc&$select=id,title,createdDateTime,lastModifiedDateTime,parentSection,links`

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OneNote pages fetch failed: ${response.status} ${errorText}`)
    }

    const data = await response.json()
    pages.push(...(Array.isArray(data?.value) ? data.value : []))
  } else {
    // Fetch all sections in notebook, then fetch pages from each
    const sectionsUrl = `https://graph.microsoft.com/v1.0/me/onenote/notebooks/${notebookId}/sections?$select=id,displayName`
    const sectionsResponse = await fetch(sectionsUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!sectionsResponse.ok) {
      const errorText = await sectionsResponse.text()
      throw new Error(`OneNote sections fetch failed: ${sectionsResponse.status} ${errorText}`)
    }

    const sectionsData = await sectionsResponse.json()
    const sections = Array.isArray(sectionsData?.value) ? sectionsData.value : []

    // Fetch pages from all sections in parallel
    const pagePromises = sections.map(async (section: any) => {
      const pagesUrl = `https://graph.microsoft.com/v1.0/me/onenote/sections/${section.id}/pages?$top=50&$orderby=createdDateTime desc&$select=id,title,createdDateTime,lastModifiedDateTime,parentSection,links`
      const response = await fetch(pagesUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        return Array.isArray(data?.value) ? data.value : []
      }
      return []
    })

    const allPages = await Promise.all(pagePromises)
    pages.push(...allPages.flat())
  }

  // Build page IDs map with metadata hashes
  const pageIds: Record<string, string> = {}
  pages.forEach((page: any) => {
    if (!page.id) return
    // Hash key metadata to detect changes
    const metadata = JSON.stringify({
      title: page.title,
      createdDateTime: page.createdDateTime
    })
    pageIds[page.id] = crypto.createHash('sha256').update(metadata).digest('hex')
  })

  return { pages, pageIds }
}

function formatPageOutput(page: any, notebookId: string, sectionId?: string) {
  return {
    id: page.id,
    title: page.title,
    content: null, // Content requires separate API call
    contentUrl: page.contentUrl,
    webUrl: page.links?.oneNoteWebUrl?.href || page.links?.oneNoteClientUrl?.href || null,
    createdDateTime: page.createdDateTime,
    lastModifiedDateTime: page.lastModifiedDateTime,
    level: page.level || 0,
    order: page.order || 0,
    notebookId: notebookId,
    notebookName: '',
    sectionId: sectionId || page.parentSection?.id,
    sectionName: page.parentSection?.displayName || ''
  }
}

export const microsoftOnenotePollingHandler: PollingHandler = {
  id: 'microsoft-onenote',
  canHandle: (trigger) => trigger?.trigger_type?.startsWith('microsoft-onenote_'),
  getIntervalMs: (userRole: string) => ROLE_POLL_INTERVAL_MS[userRole] ?? DEFAULT_POLL_INTERVAL_MS,
  poll: async ({ trigger }: PollingContext) => {
    const config = trigger.config || {}
    if (!config.notebookId) {
      logger.warn('[OneNote Poll] Missing notebookId in trigger config', {
        triggerId: trigger.id
      })
      return
    }

    const graphAuth = new MicrosoftGraphAuth()
    const accessToken = await graphAuth.getValidAccessToken(trigger.user_id, 'microsoft-onenote')

    if (trigger.trigger_type === 'microsoft-onenote_trigger_new_note') {
      const snapshot = await fetchPagesSnapshot(accessToken, config.notebookId, config.sectionId)
      const previousSnapshot = config.onenotePageSnapshot as PageSnapshot | undefined
      const currentSnapshot: PageSnapshot = {
        pageIds: snapshot.pageIds,
        updatedAt: new Date().toISOString()
      }

      // Find new page IDs that weren't in previous snapshot
      const newPageId = Object.keys(snapshot.pageIds)
        .find((pageId) => !previousSnapshot?.pageIds?.[pageId])

      // Update snapshot in database
      await getSupabase()
        .from('trigger_resources')
        .update({
          config: {
            ...config,
            onenotePageSnapshot: currentSnapshot,
            polling: {
              ...(config.polling || {}),
              lastPolledAt: new Date().toISOString()
            }
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', trigger.id)

      // Skip trigger on first poll (just capture baseline)
      if (!previousSnapshot) {
        logger.debug('[OneNote Poll] First poll - captured baseline snapshot', {
          pageCount: Object.keys(snapshot.pageIds).length,
          triggerId: trigger.id
        })
        return
      }

      // If no new page found, nothing to do
      if (!newPageId) {
        logger.debug('[OneNote Poll] No new pages detected', {
          triggerId: trigger.id,
          workflowId: trigger.workflow_id
        })
        return
      }

      // Find the new page data
      const newPage = snapshot.pages.find((page: any) => page.id === newPageId)
      if (!newPage) return

      const pageData = formatPageOutput(newPage, config.notebookId, config.sectionId)

      logger.debug('[OneNote Poll] New page detected, triggering workflow', {
        pageId: newPageId,
        pageTitle: newPage.title,
        workflowId: trigger.workflow_id
      })

      // Trigger workflow execution
      const executionPayload = {
        workflowId: trigger.workflow_id,
        testMode: false,
        executionMode: 'live',
        skipTriggers: true,
        inputData: {
          source: 'microsoft-onenote-poll',
          triggerType: trigger.trigger_type,
          notebookId: config.notebookId,
          sectionId: config.sectionId,
          ...pageData
        }
      }

      const base = getWebhookBaseUrl()
      const response = await fetch(`${base}/api/workflows/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': trigger.user_id
        },
        body: JSON.stringify(executionPayload)
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('[OneNote Poll] Workflow execution failed', {
          status: response.status,
          error: errorText,
          workflowId: trigger.workflow_id
        })
      }

      return
    }

    logger.debug('[OneNote Poll] Completed polling', {
      triggerId: trigger.id,
      workflowId: trigger.workflow_id
    })
  }
}
