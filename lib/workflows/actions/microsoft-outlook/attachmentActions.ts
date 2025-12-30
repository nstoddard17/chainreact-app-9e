import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { refreshMicrosoftToken } from '../core/refreshMicrosoftToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'

/**
 * Download an attachment from an Outlook email
 */
export async function downloadOutlookAttachment(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)
    const { emailId, attachmentId } = resolvedConfig

    if (!emailId) {
      throw new Error('Email ID is required')
    }
    if (!attachmentId) {
      throw new Error('Attachment ID is required')
    }

    let accessToken = await getDecryptedAccessToken(userId, "microsoft-outlook")

    const endpoint = `https://graph.microsoft.com/v1.0/me/messages/${emailId}/attachments/${attachmentId}`

    const makeRequest = async (token: string) => {
      return fetch(endpoint, {
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
      let errorMessage = `Failed to download attachment: ${response.statusText}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) {
          errorMessage = `Failed to download attachment: ${errorJson.error.message}`
        }
      } catch {}
      throw new Error(errorMessage)
    }

    const attachment = await response.json()

    // Handle different attachment types
    // FileAttachment has contentBytes, ItemAttachment has item
    if (attachment['@odata.type'] === '#microsoft.graph.fileAttachment') {
      return {
        success: true,
        output: {
          id: attachment.id,
          name: attachment.name,
          contentType: attachment.contentType,
          size: attachment.size,
          contentBytes: attachment.contentBytes, // Base64 encoded content
          isInline: attachment.isInline,
          lastModifiedDateTime: attachment.lastModifiedDateTime
        }
      }
    } else if (attachment['@odata.type'] === '#microsoft.graph.itemAttachment') {
      // Item attachment (attached email or calendar event)
      return {
        success: true,
        output: {
          id: attachment.id,
          name: attachment.name,
          contentType: attachment.contentType,
          size: attachment.size,
          isInline: attachment.isInline,
          itemType: attachment.item?.['@odata.type'],
          item: attachment.item
        }
      }
    } else {
      // Reference attachment or unknown type
      return {
        success: true,
        output: {
          id: attachment.id,
          name: attachment.name,
          contentType: attachment.contentType,
          size: attachment.size,
          isInline: attachment.isInline
        }
      }
    }
  } catch (error: any) {
    logger.error('[Outlook Attachments] Error downloading attachment:', error)
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
