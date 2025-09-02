import { TokenRefreshService } from "../integrations/tokenRefreshService"
import type { Integration } from "@/types/integration"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { decrypt } from "@/lib/security/encryption"
import { getSecret } from "@/lib/secrets"
import { createClient } from "@supabase/supabase-js"
import { FileStorageService } from "@/lib/storage/fileStorage"
import { actionHandlerRegistry, getWaitForTimeHandler } from './actions/registry'
import { executeGenericAction } from './actions/generic'
import { ActionResult } from './actions'

/**
 * Interface for action execution parameters
 */
export interface ExecuteActionParams {
  node: any
  input: Record<string, any>
  userId: string
  workflowId: string
}

export async function getDecryptedAccessToken(userId: string, provider: string): Promise<string> {
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

    // Cast the integration to the proper type
    const typedIntegration = integration as unknown as Integration

    // Check if token needs refresh
    const shouldRefresh = TokenRefreshService.shouldRefreshToken(typedIntegration, {
      accessTokenExpiryThreshold: 5 // Refresh if expiring within 5 minutes
    })

    let accessToken = integration.access_token

    if (shouldRefresh.shouldRefresh && integration.refresh_token) {
      console.log(`Refreshing token for ${provider}: ${shouldRefresh.reason}`)
      
      const refreshResult = await TokenRefreshService.refreshTokenForProvider(
        integration.provider,
        integration.refresh_token,
        typedIntegration
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

  // Special handling for wait_for_time action that needs workflow context
  if (type === "wait_for_time") {
    const handler = getWaitForTimeHandler(workflowId, node.id)
    return handler(config, userId, input)
  }

  // Get the appropriate handler from the registry
  const handler = actionHandlerRegistry[type]

  // If there's no handler for this node type, try the generic handler
  if (!handler) {
    console.log(`Using generic handler for node type: ${type}`)
    return executeGenericAction(
      { ...config, actionType: type },
      userId,
      input
    )
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
  return handler({ config, userId, input })
}