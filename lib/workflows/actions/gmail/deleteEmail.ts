import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'

/**
 * Deletes an email in Gmail
 * - Default: Moves email to trash (recoverable for 30 days)
 * - Permanent: Immediately deletes email (cannot be recovered)
 */
export async function deleteGmailEmail(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, 'gmail')

    // Get message ID from config
    const messageIdInput = resolveValue(config.messageId, input)
    const permanentDelete = resolveValue(config.permanentDelete, input) === true

    if (!messageIdInput) {
      return {
        success: false,
        message: 'Message ID is required to delete an email',
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
        message: 'No valid message IDs found to delete',
      }
    }

    logger.debug(`[Gmail Delete] ${permanentDelete ? 'Permanently deleting' : 'Moving to trash'} ${messageIds.length} email(s)`)

    // Delete emails
    const results = []
    for (const messageId of messageIds) {
      try {
        // Choose endpoint based on delete type
        // Trash: POST /messages/{id}/trash - Moves to trash (recoverable)
        // Permanent: DELETE /messages/{id} - Permanently deletes (not recoverable)
        const endpoint = permanentDelete
          ? `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}`
          : `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`

        const response = await fetch(endpoint, {
          method: permanentDelete ? 'DELETE' : 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        })

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: { message: response.statusText } }))
          logger.warn(`[Gmail Delete] Failed to delete ${messageId}:`, error.error?.message)
          results.push({ messageId, success: false, error: error.error?.message })
        } else {
          // Permanent delete returns 204 No Content
          // Trash returns the modified message
          let result = null
          if (!permanentDelete && response.status !== 204) {
            result = await response.json()
          }
          results.push({
            messageId: permanentDelete ? messageId : result?.id || messageId,
            success: true,
            labels: result?.labelIds || []
          })
        }
      } catch (error: any) {
        logger.warn(`[Gmail Delete] Error deleting ${messageId}:`, error.message)
        results.push({ messageId, success: false, error: error.message })
      }
    }

    const successCount = results.filter(r => r.success).length

    logger.debug(`[Gmail Delete] Successfully ${permanentDelete ? 'permanently deleted' : 'moved to trash'} ${successCount}/${messageIds.length} email(s)`)

    return {
      success: successCount > 0,
      output: {
        ...input,
        messageIds,
        deletedCount: successCount,
        totalCount: messageIds.length,
        success: true,
        deletedAt: new Date().toISOString(),
        permanent: permanentDelete,
        results,
      },
      message: permanentDelete
        ? `Permanently deleted ${successCount} of ${messageIds.length} email(s) (cannot be recovered)`
        : `Moved ${successCount} of ${messageIds.length} email(s) to trash (can be recovered within 30 days)`,
    }
  } catch (error: any) {
    logger.error('[Gmail Delete] Error:', error)
    return {
      success: false,
      message: `Failed to delete email: ${error.message}`,
      error: error.message,
    }
  }
}
