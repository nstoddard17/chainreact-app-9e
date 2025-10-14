import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'

import { logger } from '@/lib/utils/logger'

/**
 * Fetches Gmail labels for the authenticated user
 */
async function fetchGmailLabels(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/gmail/v1/users/me/labels", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  
  if (!response.ok) {
    throw new Error(`Failed to fetch Gmail labels: ${response.status}`)
  }
  
  return await response.json()
}

/**
 * Creates a new Gmail label if it doesn't exist
 */
async function createGmailLabel(accessToken: string, labelName: string) {
  const response = await fetch("https://www.googleapis.com/gmail/v1/users/me/labels", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: labelName }),
  })
  
  if (!response.ok) {
    throw new Error(`Failed to create Gmail label: ${response.status}`)
  }
  
  return await response.json()
}

/**
 * Adds labels to a Gmail message
 */
export async function addGmailLabels(
  config: any, 
  userId: string, 
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "gmail")
    
    // Get message ID from config or input
    const messageId = resolveValue(config.messageId, input)
    
    if (!messageId) {
      return { success: false, message: "No message ID provided" }
    }
    
    // Get labels to add
    const labelNames = Array.isArray(config.labels) ? config.labels : []
    const labelIds = Array.isArray(config.labelIds) ? config.labelIds : []
    
    if (labelNames.length === 0 && labelIds.length === 0) {
      return { success: false, message: "No labels specified to add" }
    }
    
    // If label names are provided, we need to fetch all labels to get their IDs
    // or create new labels if they don't exist
    if (labelNames.length > 0) {
      const labelsResponse = await fetchGmailLabels(accessToken)
      const existingLabels = labelsResponse.labels || []
      
      for (const labelName of labelNames) {
        // Check if the label already exists
        const existingLabel = existingLabels.find((l: any) => l.name === labelName)
        
        if (existingLabel) {
          labelIds.push(existingLabel.id)
        } else {
          // Create the label if it doesn't exist
          try {
            const newLabel = await createGmailLabel(accessToken, labelName)
            labelIds.push(newLabel.id)
          } catch (error: any) {
            logger.error(`Failed to create label "${labelName}":`, error)
            // Continue with other labels
          }
        }
      }
    }
    
    if (labelIds.length === 0) {
      return { success: false, message: "No valid label IDs found or created" }
    }
    
    // Add the labels to the message
    const response = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        addLabelIds: labelIds,
      }),
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || `Failed to add labels: ${response.status}`)
    }
    
    const result = await response.json()
    
    return {
      success: true,
      output: {
        ...input,
        messageId: result.id,
        labelIds: result.labelIds,
        labelsAdded: labelIds,
      },
      message: `Successfully added ${labelIds.length} label(s) to the message`,
    }
  } catch (error: any) {
    logger.error("Error adding Gmail labels:", error)
    return {
      success: false,
      message: `Failed to add labels: ${error.message}`,
      error: error.message,
    }
  }
} 