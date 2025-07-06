import { TokenRefreshService } from "../integrations/tokenRefreshService"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { decrypt } from "@/lib/security/encryption"
import { getSecret } from "@/lib/secrets"
import { createClient } from "@supabase/supabase-js"
import { FileStorageService } from "@/lib/storage/fileStorage"
import {
  // Core utilities
  ActionResult,
  
  // Gmail actions
  sendGmail,
  addGmailLabels,
  searchGmailEmails,
  
  // Google Sheets actions
  readGoogleSheetsData,
  
  // Airtable actions
  moveAirtableRecord,
  createAirtableRecord,
  updateAirtableRecord,
  listAirtableRecords,
  
  // Workflow control actions
  executeIfThenCondition,
  executeWaitForTime
} from './actions'

/**
 * Interface for action execution parameters
 */
export interface ExecuteActionParams {
  node: any
  input: Record<string, any>
  userId: string
  workflowId: string
}

async function getDecryptedAccessToken(userId: string, provider: string): Promise<string> {
  try {
    const supabase = await createSupabaseServerClient()
    
    // Get the user's integration
    const { data: integration, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", provider)
      .single()

    if (error) {
      console.error(`Database error fetching integration for ${provider}:`, error)
      throw new Error(`Database error: ${error.message}`)
    }

    if (!integration) {
      throw new Error(`No integration found for ${provider}`)
    }

    // Check if token needs refresh
    const shouldRefresh = TokenRefreshService.shouldRefreshToken(integration, {
      accessTokenExpiryThreshold: 5 // Refresh if expiring within 5 minutes
    })

    let accessToken = integration.access_token

    if (shouldRefresh.shouldRefresh && integration.refresh_token) {
      console.log(`Refreshing token for ${provider}: ${shouldRefresh.reason}`)
      
      const refreshResult = await TokenRefreshService.refreshTokenForProvider(
        integration.provider,
        integration.refresh_token,
        integration
      )

      if (refreshResult.success && refreshResult.accessToken) {
        accessToken = refreshResult.accessToken
        console.log(`Token refresh successful for ${provider}`)
      } else {
        console.error(`Token refresh failed for ${provider}:`, refreshResult.error)
        throw new Error(`Failed to refresh ${provider} token: ${refreshResult.error}`)
      }
    }

    if (!accessToken) {
      throw new Error(`No valid access token for ${provider}`)
    }

    const secret = await getSecret("encryption_key")
    if (!secret) {
      console.error("Encryption key not found in environment")
      throw new Error("Encryption secret not configured. Please set ENCRYPTION_KEY environment variable.")
    }

    console.log(`Attempting to decrypt access token for ${provider}`)
    console.log(`Token format check:`, {
      hasColon: accessToken.includes(':'),
      tokenLength: accessToken.length,
      tokenPreview: accessToken.substring(0, 20) + '...'
    })
    
    try {
    const decryptedToken = decrypt(accessToken, secret)
    console.log(`Successfully decrypted access token for ${provider}`)
    return decryptedToken
    } catch (decryptError: any) {
      console.error(`Decryption failed for ${provider}:`, {
        error: decryptError.message,
        tokenFormat: accessToken.includes(':') ? 'encrypted' : 'plain',
        tokenLength: accessToken.length
      })
      
      // If the token doesn't have the expected format, it might be stored as plain text
      if (!accessToken.includes(':')) {
        console.log(`Token for ${provider} appears to be stored as plain text, returning as-is`)
        return accessToken
      }
      
      throw new Error(`Failed to decrypt ${provider} access token: ${decryptError.message}`)
    }
  } catch (error: any) {
    console.error(`Error in getDecryptedAccessToken for ${provider}:`, {
      message: error.message,
      stack: error.stack,
      userId,
      provider
    })
    throw error
  }
}

function resolveValue(value: any, input: Record<string, any>): any {
  if (typeof value !== "string") return value
  const match = value.match(/^{{(.*)}}$/)
  if (match) {
    const key = match[1]
    // Basic key access, e.g., {{data.field}}
    // For simplicity, we'll support basic dot notation.
    return key.split(".").reduce((acc: any, part: any) => acc && acc[part], input)
  }
  return value
}

async function fetchGmailLabels(accessToken: string) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  })
  if (!response.ok) throw new Error("Failed to fetch Gmail labels")
  const data = await response.json()
  return data.labels || []
}

async function createGmailLabel(accessToken: string, labelName: string) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    }),
  })
  if (!response.ok) throw new Error("Failed to create Gmail label")
  return await response.json()
}

function convertToMilliseconds(duration: number, unit: string): number {
  switch (unit) {
    case "seconds":
      return duration * 1000
    case "minutes":
      return duration * 60 * 1000
    case "hours":
      return duration * 60 * 60 * 1000
    case "days":
      return duration * 24 * 60 * 60 * 1000
    case "weeks":
      return duration * 7 * 24 * 60 * 60 * 1000
    default:
      return duration * 60 * 1000 // Default to minutes
  }
}

function calculateBusinessHoursWait(
  now: Date, 
  startTime: string, 
  endTime: string, 
  businessDays: string[]
): Date {
  const [startHours, startMinutes] = startTime.split(':').map(Number)
  const [endHours, endMinutes] = endTime.split(':').map(Number)
  
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  const businessDayIndices = businessDays.map(day => dayNames.indexOf(day.toLowerCase()))
  
  let checkDate = new Date(now)
  
  // Find the next business day and time
  for (let i = 0; i < 14; i++) { // Check up to 2 weeks ahead
    const dayOfWeek = checkDate.getDay()
    
    if (businessDayIndices.includes(dayOfWeek)) {
      // This is a business day
      const businessStart = new Date(checkDate)
      businessStart.setHours(startHours, startMinutes, 0, 0)
      
      const businessEnd = new Date(checkDate)
      businessEnd.setHours(endHours, endMinutes, 0, 0)
      
      if (checkDate.getTime() === now.getTime()) {
        // Same day as now
        if (now < businessStart) {
          // Before business hours, wait until start
          return businessStart
        } else if (now < businessEnd) {
          // During business hours, continue immediately
          return now
        }
        // After business hours, check next day
      } else {
        // Future business day, wait until business hours start
        return businessStart
      }
    }
    
    // Move to next day
    checkDate.setDate(checkDate.getDate() + 1)
    checkDate.setHours(0, 0, 0, 0)
  }
  
  // Fallback: wait 24 hours
  return new Date(now.getTime() + 24 * 60 * 60 * 1000)
}

/**
 * Main function to execute a workflow action node
 * Routes to the appropriate handler based on node type
 */
export async function executeAction({ node, input, userId, workflowId }: ExecuteActionParams): Promise<ActionResult> {
  const { type, config } = node.data

  // Check if environment is properly configured
  const hasSupabaseConfig = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const hasEncryptionKey = process.env.ENCRYPTION_KEY

  if (!hasSupabaseConfig) {
    console.warn("Supabase configuration missing, running in test mode")
    return { 
      success: true, 
      output: { test: true, mockResult: true }, 
      message: `Test mode: ${type} executed successfully (missing Supabase config)` 
    }
  }

  // Map of action types to handler functions
  const handlerMap: Record<string, Function> = {
    // Gmail actions
    "gmail_action_send_email": sendGmail,
    "gmail_action_add_label": addGmailLabels,
    "gmail_action_search_email": searchGmailEmails,
    
    // Google Sheets actions
    "google_sheets_action_read_data": readGoogleSheetsData,
    
      // Airtable actions
  "airtable_action_move_record": moveAirtableRecord,
  "airtable_action_create_record": createAirtableRecord,
  "airtable_action_update_record": updateAirtableRecord,
  "airtable_action_list_records": listAirtableRecords,
    
    // Workflow control actions
    "if_then_condition": executeIfThenCondition,
    "wait_for_time": (cfg: any, uid: string, inp: any) => 
      executeWaitForTime(cfg, uid, inp, { workflowId, nodeId: node.id })
  }

  // Get the appropriate handler for this node type
  const handler = handlerMap[type]

  // If there's no handler for this node type, return a default response
  if (!handler) {
    console.warn(`No execution logic for node type: ${type}`)
    return { 
      success: true, 
      output: input, 
      message: `No action found for ${type}` 
    }
  }

  // For encryption-dependent handlers, check if encryption key is available
  if (!hasEncryptionKey && 
      (type.startsWith('gmail_') || 
       type.startsWith('google_sheets_') || 
       type.startsWith('google_drive_') ||
       type.startsWith('airtable_'))) {
    console.warn(`Encryption key missing, running ${type} in test mode`)
    return { 
      success: true, 
      output: { 
        test: true,
        mockResult: true,
        mockType: type
      }, 
      message: `Test mode: ${type} executed successfully (missing encryption key)` 
    }
  }

  // Execute the handler with the provided parameters
  return handler(config, userId, input)
}
