import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { google } from 'googleapis'

import { logger } from '@/lib/utils/logger'

/**
 * Apply labels to Gmail messages
 */
export async function applyGmailLabels(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const {
      messageId,
      threadId,
      labels = [],
      addLabels = [],
      removeLabels = [],
      createIfNotExists = false,
      applyToThread = false,
      searchQuery
    } = resolvedConfig

    const accessToken = await getDecryptedAccessToken(userId, "gmail")
    
    // Initialize Gmail API
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Combine labels for backward compatibility
    const labelsToAdd = [...labels, ...addLabels].filter(Boolean)
    const labelsToRemove = removeLabels.filter(Boolean)

    // Get or create labels
    const labelIds: { add: string[], remove: string[] } = { add: [], remove: [] }
    
    // Fetch existing labels
    const existingLabelsResponse = await gmail.users.labels.list({
      userId: 'me'
    })
    const existingLabels = existingLabelsResponse.data.labels || []
    const labelMap = new Map(existingLabels.map(l => [l.name?.toLowerCase(), l.id]))

    // Process labels to add
    for (const labelName of labelsToAdd) {
      let labelId = labelMap.get(labelName.toLowerCase())
      
      if (!labelId && createIfNotExists) {
        // Create the label
        try {
          const newLabel = await gmail.users.labels.create({
            userId: 'me',
            requestBody: {
              name: labelName,
              labelListVisibility: 'labelShow',
              messageListVisibility: 'show'
            }
          })
          labelId = newLabel.data.id
          logger.debug(`Created new label: ${labelName} (${labelId})`)
        } catch (error) {
          logger.warn(`Failed to create label ${labelName}:`, error)
          continue
        }
      }
      
      if (labelId) {
        labelIds.add.push(labelId)
      }
    }

    // Process labels to remove
    for (const labelName of labelsToRemove) {
      const labelId = labelMap.get(labelName.toLowerCase())
      if (labelId) {
        labelIds.remove.push(labelId)
      }
    }

    // Determine target messages
    let targetMessages: string[] = []
    
    if (messageId) {
      targetMessages.push(messageId)
    } else if (searchQuery) {
      // Search for messages matching the query
      const searchResponse = await gmail.users.messages.list({
        userId: 'me',
        q: searchQuery,
        maxResults: 100
      })
      targetMessages = searchResponse.data.messages?.map(m => m.id!).filter(Boolean) || []
    } else if (threadId) {
      // Get all messages in the thread
      const threadResponse = await gmail.users.threads.get({
        userId: 'me',
        id: threadId
      })
      targetMessages = threadResponse.data.messages?.map(m => m.id!).filter(Boolean) || []
    }

    if (targetMessages.length === 0) {
      return {
        success: false,
        output: {},
        message: 'No messages found to apply labels to'
      }
    }

    // Apply labels to messages
    const results = []
    for (const msgId of targetMessages) {
      try {
        const modifyRequest: any = {
          userId: 'me',
          id: msgId,
          requestBody: {}
        }
        
        if (labelIds.add.length > 0) {
          modifyRequest.requestBody.addLabelIds = labelIds.add
        }
        if (labelIds.remove.length > 0) {
          modifyRequest.requestBody.removeLabelIds = labelIds.remove
        }
        
        if (labelIds.add.length > 0 || labelIds.remove.length > 0) {
          const result = await gmail.users.messages.modify(modifyRequest)
          results.push({
            messageId: msgId,
            success: true,
            labelIds: result.data.labelIds
          })
        }
      } catch (error) {
        logger.warn(`Failed to modify message ${msgId}:`, error)
        results.push({
          messageId: msgId,
          success: false,
          error: (error as any).message
        })
      }
    }

    const successCount = results.filter(r => r.success).length

    return {
      success: successCount > 0,
      output: {
        processedMessages: targetMessages.length,
        successfulUpdates: successCount,
        labelsAdded: labelsToAdd,
        labelsRemoved: labelsToRemove,
        results
      },
      message: `Labels applied to ${successCount} of ${targetMessages.length} messages`
    }

  } catch (error: any) {
    logger.error('Apply Gmail labels error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to apply labels'
    }
  }
}