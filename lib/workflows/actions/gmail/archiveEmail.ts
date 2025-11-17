import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'

/**
 * Archives an email in Gmail by removing the INBOX label
 * The email remains in "All Mail" and can be accessed via search or other labels
 */
export async function archiveGmailEmail(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, 'gmail')

    // Get message ID from config
    const messageIdInput = resolveValue(config.messageId, input)

    if (!messageIdInput) {
      return {
        success: false,
        message: 'Message ID is required to archive an email',
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
        message: 'No valid message IDs found to archive',
      }
    }

    logger.debug(`[Gmail Archive] Archiving ${messageIds.length} email(s)`)

    // Archive emails by removing INBOX label
    // This is the Gmail API's way of archiving - the email stays in All Mail
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
              removeLabelIds: ['INBOX'],
            }),
          }
        )

        if (!response.ok) {
          const error = await response.json()
          logger.warn(`[Gmail Archive] Failed to archive ${messageId}:`, error.error?.message)
          results.push({ messageId, success: false, error: error.error?.message })
        } else {
          const result = await response.json()
          results.push({ messageId: result.id, success: true, labels: result.labelIds })
        }
      } catch (error: any) {
        logger.warn(`[Gmail Archive] Error archiving ${messageId}:`, error.message)
        results.push({ messageId, success: false, error: error.message })
      }
    }

    const successCount = results.filter(r => r.success).length

    logger.debug(`[Gmail Archive] Successfully archived ${successCount}/${messageIds.length} email(s)`)

    return {
      success: successCount > 0,
      output: {
        ...input,
        messageIds,
        archivedCount: successCount,
        totalCount: messageIds.length,
        success: true,
        archivedAt: new Date().toISOString(),
        results,
      },
      message: `Successfully archived ${successCount} of ${messageIds.length} email(s)`,
    }
  } catch (error: any) {
    logger.error('[Gmail Archive] Error:', error)
    return {
      success: false,
      message: `Failed to archive email: ${error.message}`,
      error: error.message,
    }
  }
}
