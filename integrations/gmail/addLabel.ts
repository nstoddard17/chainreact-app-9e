/**
 * Gmail Add Label Action Handler
 * 
 * Adds one or more labels to an email in Gmail
 */

import { getIntegrationCredentials } from "@/lib/integrations/getDecryptedAccessToken"
import { resolveValue } from "@/lib/integrations/resolveValue"

/**
 * Action metadata for UI display and reference
 */
export const ACTION_METADATA = {
  key: "gmail_action_add_label",
  name: "Apply Gmail Labels",
  description: "Add one or more labels to incoming Gmail messages from a specific email address",
  icon: "tag"
};

/**
 * Standard interface for action parameters
 */
export interface ActionParams {
  userId: string
  config: Record<string, any>
  input: Record<string, any>
}

/**
 * Standard interface for action results
 */
export interface ActionResult {
  success: boolean
  output?: Record<string, any>
  message?: string
  error?: string
}

/**
 * Adds one or more labels to incoming emails from a specific email address via the Gmail API
 * 
 * @param params - Standard action parameters
 * @returns Action result with success/failure and any outputs
 */
export async function addGmailLabels(params: ActionParams): Promise<ActionResult> {
  try {
    const { userId, config, input } = params
    
    // 1. Get Gmail OAuth token
    const credentials = await getIntegrationCredentials(userId, "gmail")
    
    // 2. Resolve any templated values in the config
    const resolvedConfig = resolveValue(config, {
      input,
    })
    
    // 3. Extract required parameters
    const { 
      email, 
      labelIds = []
    } = resolvedConfig
    
    // 4. Validate required parameters
    if (!email) {
      return {
        success: false,
        error: "Missing required parameter: email address"
      }
    }
    
    if (labelIds.length === 0) {
      return {
        success: false,
        error: "You must specify at least one label"
      }
    }
    
    // 5. Get the incoming email data from the trigger input
    const incomingEmailData = input
    const messageId = incomingEmailData?.messageId || incomingEmailData?.id
    const fromEmail = incomingEmailData?.from || incomingEmailData?.sender
    
    // 6. Check if we have the necessary data from the trigger
    if (!messageId) {
      return {
        success: false,
        error: "No incoming email message ID found. This action should be used with a Gmail trigger."
      }
    }
    
    if (!fromEmail) {
      return {
        success: false,
        error: "No sender email found in the incoming message data."
      }
    }
    
    // 7. Check if the incoming email is from the specified email address
    const normalizedFrom = fromEmail.toLowerCase().trim()
    const normalizedTarget = email.toLowerCase().trim()
    
    // Extract email from "Name <email@domain.com>" format if needed
    const extractEmail = (emailStr: string) => {
      const match = emailStr.match(/<([^>]+)>/)
      return match ? match[1] : emailStr
    }
    
    const extractedFrom = extractEmail(normalizedFrom)
    const extractedTarget = extractEmail(normalizedTarget)
    
    if (extractedFrom !== extractedTarget) {
      return {
        success: false,
        message: `Email from ${fromEmail} does not match target address ${email}. No labels applied.`
      }
    }
    
    // 8. Process label IDs - some might be names that need to be created
    // Get existing labels to check which ones are IDs vs names
    const labelsResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (!labelsResponse.ok) {
      return {
        success: false,
        error: `Failed to fetch existing labels: ${await labelsResponse.text()}`
      }
    }
    
    const labelsData = await labelsResponse.json()
    const existingLabels = labelsData.labels || []
    const existingLabelIds = existingLabels.map((label: any) => label.id)
    
    // Separate actual label IDs from label names that need to be created
    const actualLabelIds: string[] = []
    const labelNamesToCreate: string[] = []
    
    for (const labelId of labelIds) {
      if (existingLabelIds.includes(labelId)) {
        // This is an existing label ID
        actualLabelIds.push(labelId)
      } else {
        // This might be a label name that needs to be created
        labelNamesToCreate.push(labelId)
      }
    }
    
    // Create new labels if needed
    let newLabelIds: string[] = []
    if (labelNamesToCreate.length > 0) {
      newLabelIds = await getOrCreateLabels(credentials.accessToken, labelNamesToCreate)
    }
    
    const allLabelIds = [...actualLabelIds, ...newLabelIds]
    
    // 9. Apply labels to the incoming email message
    try {
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          addLabelIds: allLabelIds,
          removeLabelIds: []
        })
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        return {
          success: false,
          error: `Failed to add labels to incoming email: ${errorText}`
        }
      }
      
      const data = await response.json()
      
      return {
        success: true,
        output: {
          messageId: data.id,
          threadId: data.threadId,
          labelIds: data.labelIds,
          appliedLabels: allLabelIds,
          fromEmail: fromEmail
        },
        message: `Successfully added ${allLabelIds.length} label(s) to incoming email from ${fromEmail}`
      }
      
    } catch (error: any) {
      return {
        success: false,
        error: `Error applying labels to incoming email: ${error.message}`
      }
    }
    
  } catch (error: any) {
    // 10. Handle errors and return failure result
    console.error("Gmail add labels failed:", error)
    return {
      success: false,
      error: error.message || "Failed to add labels to email"
    }
  }
}

/**
 * Gets or creates Gmail labels by name
 * 
 * @param accessToken - Gmail API access token
 * @param labelNames - Array of label names to get or create
 * @returns Array of label IDs
 */
async function getOrCreateLabels(accessToken: string, labelNames: string[]): Promise<string[]> {
  // 1. Get existing labels
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to get labels: ${errorText}`)
  }
  
  const labelsResponse = await response.json()
  const existingLabels = labelsResponse.labels || []
  
  // 2. Map of existing label names to IDs
  const labelNameToId: Record<string, string> = {}
  existingLabels.forEach((label: any) => {
    labelNameToId[label.name.toLowerCase()] = label.id
  })
  
  // 3. Process each label name
  const labelIds: string[] = []
  for (const name of labelNames) {
    const normalizedName = name.toLowerCase()
    
    // If label exists, use its ID
    if (labelNameToId[normalizedName]) {
      labelIds.push(labelNameToId[normalizedName])
      continue
    }
    
    // Otherwise create a new label
    const createResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show'
      })
    })
    
    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      throw new Error(`Failed to create label "${name}": ${errorText}`)
    }
    
    const newLabel = await createResponse.json()
    labelIds.push(newLabel.id)
  }
  
  return labelIds
} 