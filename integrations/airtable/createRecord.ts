/**
 * Airtable Create Record Action Handler
 * 
 * Creates a new record in an Airtable base using the Airtable API
 */

import { getIntegrationCredentials } from "@/lib/integrations/getDecryptedAccessToken"
import { resolveValue } from "@/lib/integrations/resolveValue"

/**
 * Action metadata for UI display and reference
 */
export const ACTION_METADATA = {
  key: "airtable_action_create_record",
  name: "Create Airtable Record",
  description: "Create a new record in an Airtable table",
  icon: "database"
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
 * Creates a new Airtable record
 * 
 * @param params - Standard action parameters
 * @returns Action result with success/failure and any outputs
 */
export async function createAirtableRecord(params: ActionParams): Promise<ActionResult> {
  try {
    const { userId, config, input } = params
    
    // 1. Get Airtable API key
    const credentials = await getIntegrationCredentials(userId, "airtable")
    
    // 2. Resolve any templated values in the config
    const resolvedConfig = resolveValue(config, {
      input,
    })
    
    // 3. Extract required parameters
    const { 
      baseId,
      tableName,
      fields = {},
      typecast = false
    } = resolvedConfig
    
    // 4. Validate required parameters
    if (!baseId) {
      return {
        success: false,
        error: "Missing required parameter: baseId"
      }
    }
    
    if (!tableName) {
      return {
        success: false,
        error: "Missing required parameter: tableName"
      }
    }
    
    if (Object.keys(fields).length === 0) {
      return {
        success: false,
        error: "Missing required parameter: fields (at least one field is required)"
      }
    }
    
    // 5. Prepare the request payload
    const payload = {
      fields,
      typecast
    }
    
    // 6. Make Airtable API request
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    
    // 7. Handle API response
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Airtable API error (${response.status}): ${errorText}`)
    }
    
    const data = await response.json()
    
    // 8. Return success result with any outputs
    return {
      success: true,
      output: {
        recordId: data.id,
        createdTime: data.createdTime,
        fields: data.fields,
        commentCount: data.commentCount
      },
      message: `Record created successfully in ${tableName}`
    }
    
  } catch (error: any) {
    // 9. Handle errors and return failure result
    console.error("Airtable create record failed:", error)
    return {
      success: false,
      error: error.message || "Failed to create Airtable record"
    }
  }
} 