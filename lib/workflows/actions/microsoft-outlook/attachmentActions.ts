import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { refreshMicrosoftToken } from '../core/refreshMicrosoftToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'

/**
 * Download attachments from an Outlook email
 * Supports downloading all attachments, filtering by extension, or filtering by name
 */
export async function downloadOutlookAttachment(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)
    const { emailId, downloadMode = 'all', fileExtensions, fileNameFilter, excludeInline = true } = resolvedConfig

    if (!emailId) {
      throw new Error('Email ID is required')
    }

    let accessToken = await getDecryptedAccessToken(userId, "microsoft-outlook")

    // First, list all attachments to get their IDs and metadata
    const listEndpoint = `https://graph.microsoft.com/v1.0/me/messages/${emailId}/attachments`

    const makeListRequest = async (token: string) => {
      return fetch(listEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
    }

    let listResponse = await makeListRequest(accessToken)

    if (listResponse.status === 401) {
      accessToken = await refreshMicrosoftToken(userId, "microsoft-outlook")
      listResponse = await makeListRequest(accessToken)
    }

    if (!listResponse.ok) {
      const errorText = await listResponse.text()
      let errorMessage = `Failed to list attachments: ${listResponse.statusText}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) {
          errorMessage = `Failed to list attachments: ${errorJson.error.message}`
        }
      } catch {}
      throw new Error(errorMessage)
    }

    const listData = await listResponse.json()
    let attachmentList = listData.value || []

    // Filter out inline attachments if requested
    if (excludeInline) {
      attachmentList = attachmentList.filter((att: any) => !att.isInline)
    }

    // Apply filters based on download mode
    if (downloadMode === 'by_extension' && fileExtensions) {
      const extensions = fileExtensions.split(',').map((ext: string) => ext.trim().toLowerCase().replace(/^\./, ''))
      attachmentList = attachmentList.filter((att: any) => {
        const fileName = att.name || ''
        const fileExt = fileName.split('.').pop()?.toLowerCase() || ''
        return extensions.includes(fileExt)
      })
    } else if (downloadMode === 'by_name' && fileNameFilter) {
      const filterLower = fileNameFilter.toLowerCase()
      attachmentList = attachmentList.filter((att: any) => {
        const fileName = att.name || ''
        return fileName.toLowerCase().includes(filterLower)
      })
    }

    if (attachmentList.length === 0) {
      return {
        success: true,
        output: {
          attachments: [],
          count: 0,
          totalSize: 0
        }
      }
    }

    // Download each matching attachment
    const downloadedAttachments: any[] = []
    let totalSize = 0

    for (const att of attachmentList) {
      const downloadEndpoint = `https://graph.microsoft.com/v1.0/me/messages/${emailId}/attachments/${att.id}`

      const makeDownloadRequest = async (token: string) => {
        return fetch(downloadEndpoint, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
      }

      let downloadResponse = await makeDownloadRequest(accessToken)

      if (downloadResponse.status === 401) {
        accessToken = await refreshMicrosoftToken(userId, "microsoft-outlook")
        downloadResponse = await makeDownloadRequest(accessToken)
      }

      if (!downloadResponse.ok) {
        logger.error(`[Outlook Attachments] Failed to download attachment ${att.name}:`, downloadResponse.statusText)
        continue // Skip failed downloads but continue with others
      }

      const attachment = await downloadResponse.json()

      // Only include file attachments with content
      if (attachment['@odata.type'] === '#microsoft.graph.fileAttachment' && attachment.contentBytes) {
        downloadedAttachments.push({
          id: attachment.id,
          name: attachment.name,
          contentType: attachment.contentType,
          size: attachment.size,
          contentBytes: attachment.contentBytes,
          lastModifiedDateTime: attachment.lastModifiedDateTime
        })
        totalSize += attachment.size || 0
      } else if (attachment['@odata.type'] === '#microsoft.graph.itemAttachment') {
        // Item attachment (attached email or calendar event) - include without content
        downloadedAttachments.push({
          id: attachment.id,
          name: attachment.name,
          contentType: attachment.contentType,
          size: attachment.size,
          itemType: attachment.item?.['@odata.type']?.replace('#microsoft.graph.', ''),
          lastModifiedDateTime: attachment.lastModifiedDateTime
        })
        totalSize += attachment.size || 0
      }
    }

    return {
      success: true,
      output: {
        attachments: downloadedAttachments,
        count: downloadedAttachments.length,
        totalSize
      }
    }
  } catch (error: any) {
    logger.error('[Outlook Attachments] Error downloading attachments:', error)
    throw error
  }
}

/**
 * List all attachments from an Outlook email
 */
export async function listOutlookAttachments(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)
    const { emailId } = resolvedConfig

    if (!emailId) {
      throw new Error('Email ID is required')
    }

    let accessToken = await getDecryptedAccessToken(userId, "microsoft-outlook")

    const endpoint = `https://graph.microsoft.com/v1.0/me/messages/${emailId}/attachments`

    const params = new URLSearchParams()
    params.append('$select', 'id,name,contentType,size,isInline,lastModifiedDateTime')

    const fullEndpoint = `${endpoint}?${params.toString()}`

    const makeRequest = async (token: string) => {
      return fetch(fullEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
    }

    let response = await makeRequest(accessToken)

    if (response.status === 401) {
      accessToken = await refreshMicrosoftToken(userId, "microsoft-outlook")
      response = await makeRequest(accessToken)
    }

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Failed to list attachments: ${response.statusText}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) {
          errorMessage = `Failed to list attachments: ${errorJson.error.message}`
        }
      } catch {}
      throw new Error(errorMessage)
    }

    const data = await response.json()
    const attachments = data.value || []

    return {
      success: true,
      output: {
        attachments: attachments.map((att: any) => ({
          id: att.id,
          name: att.name,
          contentType: att.contentType,
          size: att.size,
          isInline: att.isInline,
          lastModifiedDateTime: att.lastModifiedDateTime,
          type: att['@odata.type']?.replace('#microsoft.graph.', '')
        })),
        count: attachments.length
      }
    }
  } catch (error: any) {
    logger.error('[Outlook Attachments] Error listing attachments:', error)
    throw error
  }
}
