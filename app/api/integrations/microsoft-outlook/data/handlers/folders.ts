/**
 * Microsoft Outlook Folders Handler
 * Fetches user's mail folders from Outlook with actual folder IDs
 */

import { decryptToken } from '@/lib/integrations/tokenUtils'
import { logger } from '@/lib/utils/logger'

export interface OutlookFolder {
  value: string
  label: string
}

/**
 * Fetch Outlook mail folders with actual folder IDs
 * Microsoft Graph requires real folder IDs for move operations, not well-known names
 */
export async function getOutlookFolders(integration: any): Promise<OutlookFolder[]> {
  try {
    logger.debug('[Outlook API] Fetching mail folders')

    if (!integration.access_token) {
      throw new Error('No access token available')
    }
    const accessToken = await decryptToken(integration.access_token)
    if (!accessToken) {
      throw new Error('Failed to decrypt access token')
    }

    const response = await fetch('https://graph.microsoft.com/v1.0/me/mailFolders?$top=100', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('[Outlook API] Failed to fetch folders:', errorText)
      return getFallbackFolders(accessToken)
    }

    const data = await response.json()
    const folders = data.value || []

    logger.debug(`[Outlook API] Found ${folders.length} mail folders`)

    const folderOptions: OutlookFolder[] = folders.map((folder: any) => ({
      value: folder.id,
      label: folder.displayName || 'Unnamed Folder'
    }))

    const priorityFolders = ['Inbox', 'Sent Items', 'Drafts', 'Deleted Items', 'Archive', 'Junk Email']
    folderOptions.sort((a, b) => {
      const aIndex = priorityFolders.indexOf(a.label)
      const bIndex = priorityFolders.indexOf(b.label)
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
      if (aIndex !== -1) return -1
      if (bIndex !== -1) return 1
      return a.label.localeCompare(b.label)
    })

    return folderOptions

  } catch (error: any) {
    logger.error('[Outlook API] Failed to get folders:', error)
    return []
  }
}

async function getFallbackFolders(accessToken: string): Promise<OutlookFolder[]> {
  const wellKnownFolders = [
    { name: 'inbox', label: 'Inbox' },
    { name: 'sentitems', label: 'Sent Items' },
    { name: 'drafts', label: 'Drafts' },
    { name: 'deleteditems', label: 'Deleted Items' },
    { name: 'archive', label: 'Archive' },
    { name: 'junkemail', label: 'Junk Email' }
  ]

  const folderPromises = wellKnownFolders.map(async (folder) => {
    try {
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/me/mailFolders/${folder.name}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (response.ok) {
        const data = await response.json()
        return {
          value: data.id,
          label: data.displayName || folder.label
        }
      }
      return null
    } catch {
      return null
    }
  })

  const results = await Promise.all(folderPromises)
  return results.filter((f): f is OutlookFolder => f !== null)
}
