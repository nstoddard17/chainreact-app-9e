import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'

/**
 * Removes labels from a Gmail message
 */
export async function removeGmailLabel(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, 'gmail')

    // Get message ID from config
    const messageIdInput = resolveValue(config.messageId, input)
    const labelIds = resolveValue(config.labelIds, input)

    if (!messageIdInput) {
      return {
        success: false,
        message: 'Message ID is required to remove labels',
      }
    }

    if (!Array.isArray(labelIds) || labelIds.length === 0) {
      return {
        success: false,
        message: 'At least one label must be selected to remove',
      }
    }

    // Handle different messageId formats:
    // 1. Array of objects with id property (e.g., from search results)
    // 2. Array of strings (message IDs)
    // 3. Single string (message ID)
    let messageIds: string[] = []
    if (Array.isArray(messageIdInput)) {
      messageIds = messageIdInput
        .map(item => typeof item === 'object' && item?.id ? item.id : item)
        .filter(Boolean)
    } else if (messageIdInput.trim()) {
      messageIds = [messageIdInput]
    }

    if (messageIds.length === 0) {
      return {
        success: false,
        message: 'No valid message IDs found to remove labels from',
      }
    }

    logger.debug(`[Gmail Remove Label] Removing labels from ${messageIds.length} email(s):`, labelIds)

    // Remove labels from messages
    const results = []
    for (const messageId of messageIds) {
      try {
        const response = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              removeLabelIds: labelIds,
            }),
          }
        )

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: { message: response.statusText } }))
          logger.warn(`[Gmail Remove Label] Failed to remove labels from ${messageId}:`, error.error?.message)
          results.push({ messageId, success: false, error: error.error?.message })
        } else {
          const result = await response.json()
          results.push({
            messageId: result.id,
            success: true,
            currentLabels: result.labelIds || []
          })
        }
      } catch (error: any) {
        logger.warn(`[Gmail Remove Label] Error removing labels from ${messageId}:`, error.message)
        results.push({ messageId, success: false, error: error.message })
      }
    }

    const successCount = results.filter(r => r.success).length

    logger.debug(`[Gmail Remove Label] Successfully removed labels from ${successCount}/${messageIds.length} email(s)`)

    return {
      success: successCount > 0,
      output: {
        ...input,
        messageIds,
        updatedCount: successCount,
        totalCount: messageIds.length,
        success: true,
        labelsRemoved: labelIds,
        results,
      },
      message: `Successfully removed ${labelIds.length} label(s) from ${successCount} of ${messageIds.length} email(s)`,
    }
  } catch (error: any) {
    logger.error('[Gmail Remove Label] Error:', error)
    return {
      success: false,
      message: `Failed to remove labels: ${error.message}`,
      error: error.message,
    }
  }
}
