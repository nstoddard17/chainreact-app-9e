/**
 * Action Dispatcher
 * 
 * Central system for mapping action types to their handlers and executing actions
 */

import { sendGmail, ACTION_METADATA as SEND_GMAIL_METADATA } from "@/integrations/gmail/sendEmail"
import { addGmailLabels, ACTION_METADATA as ADD_GMAIL_LABELS_METADATA } from "@/integrations/gmail/addLabel"
import { searchGmailEmails, ACTION_METADATA as SEARCH_GMAIL_EMAILS_METADATA } from "@/integrations/gmail/searchEmails"

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
 * Interface for action metadata
 */
export interface ActionMetadata {
  key: string
  name: string
  description: string
  icon: string
}

/**
 * Type for an action handler function
 */
type ActionHandler = (params: ActionParams) => Promise<ActionResult>

/**
 * Map of action types to their handler functions
 */
export const actionMap: Record<string, ActionHandler> = {
  // Gmail actions
  [SEND_GMAIL_METADATA.key]: sendGmail,
  [ADD_GMAIL_LABELS_METADATA.key]: addGmailLabels,
  [SEARCH_GMAIL_EMAILS_METADATA.key]: searchGmailEmails,
  
  // Add more actions here as they are implemented
}

/**
 * Map of action types to their metadata
 */
export const actionMetadataMap: Record<string, ActionMetadata> = {
  [SEND_GMAIL_METADATA.key]: SEND_GMAIL_METADATA,
  [ADD_GMAIL_LABELS_METADATA.key]: ADD_GMAIL_LABELS_METADATA,
  [SEARCH_GMAIL_EMAILS_METADATA.key]: SEARCH_GMAIL_EMAILS_METADATA,
  
  // Add more metadata here as actions are implemented
}

/**
 * Executes an action by its type
 * 
 * @param actionType - The type of action to execute
 * @param params - Action parameters
 * @returns Result of the action execution
 */
export async function executeAction(
  actionType: string, 
  params: ActionParams
): Promise<ActionResult> {
  try {
    // Check if the action type exists in the map
    const handler = actionMap[actionType]
    
    if (!handler) {
      return {
        success: false,
        error: `Unknown action type: ${actionType}`
      }
    }
    
    // Get action metadata for logging
    const metadata = actionMetadataMap[actionType]
    const actionName = metadata?.name || actionType
    
    // Add timing and logging for monitoring
    const startTime = Date.now()
    console.log(`Executing action: ${actionName} (${actionType})`)
    
    // Execute the handler
    const result = await handler(params)
    
    // Log completion time
    const executionTime = Date.now() - startTime
    console.log(`Action ${actionName} completed in ${executionTime}ms with success=${result.success}`)
    
    // Return the result
    return result
    
  } catch (error: any) {
    // Handle any unexpected errors
    console.error(`Error executing action ${actionType}:`, error)
    
    return {
      success: false,
      error: error.message || `Unknown error executing ${actionType}`
    }
  }
}

/**
 * Gets information about an action type
 * 
 * @param actionType - The action type to get information about
 * @returns Information about the action including metadata if available
 */
export function getActionInfo(actionType: string) {
  const exists = actionType in actionMap
  const metadata = actionMetadataMap[actionType]
  
  return {
    exists,
    type: actionType,
    metadata: exists ? metadata : undefined
  }
}

/**
 * Lists all available actions with their metadata
 * 
 * @returns Array of all registered actions with metadata
 */
export function listAvailableActions(): ActionMetadata[] {
  return Object.values(actionMetadataMap)
} 