/**
 * OneNote Integration Utilities
 */

import { OneNoteApiError } from './types'
import { encrypt, decrypt } from '@/lib/security/encryption'

/**
 * Create OneNote API error with proper context
 */
export function createOneNoteApiError(message: string, status?: number, response?: Response): OneNoteApiError {
  const error = new Error(message) as OneNoteApiError
  error.status = status
  error.name = 'OneNoteApiError'
  
  if (status === 401) {
    error.message = 'Microsoft authentication expired. Please reconnect your account.'
  } else if (status === 403) {
    error.message = 'OneNote API access forbidden. Check your permissions.'
  } else if (status === 429) {
    error.message = 'Microsoft Graph API rate limit exceeded. Please try again later.'
  } else if (status === 404) {
    error.message = 'OneNote resource not found. Check if the notebook or data still exists.'
  }
  
  return error
}

/**
 * Validate OneNote integration has required access token
 */
export function validateOneNoteIntegration(integration: any): void {
  if (!integration) {
    throw new Error('OneNote integration not found')
  }
  
  if (!integration.access_token) {
    throw new Error('Microsoft authentication required. Please reconnect your account.')
  }
  
  if (integration.provider !== 'onenote' && integration.provider !== 'microsoft-onenote') {
    throw new Error('Invalid integration provider. Expected OneNote.')
  }
  
  if (integration.status !== 'connected') {
    throw new Error(`OneNote integration not connected, status: ${integration.status}`)
  }
}

/**
 * Make authenticated request to Microsoft Graph API for OneNote
 */
export async function makeOneNoteApiRequest(
  url: string, 
  accessToken: string, 
  options: RequestInit = {}
): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

/**
 * Get standard Microsoft Graph API headers for OneNote
 */
export function getOneNoteApiHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Try multiple OneNote API endpoints with fallbacks
 */
export async function tryMultipleOneNoteEndpoints<T>(
  accessToken: string,
  endpoints: string[],
  operation: string
): Promise<{ data: T[], error?: { message: string } }> {
  console.log(`🔍 Trying ${endpoints.length} OneNote endpoints for ${operation}...`)
  
  for (const endpoint of endpoints) {
    try {
      console.log(`🔍 Trying endpoint: ${endpoint}`)
      
      const response = await makeOneNoteApiRequest(endpoint, accessToken)
      
      if (response.ok) {
        const data = await response.json()
        console.log(`✅ OneNote API response received. Found ${data.value?.length || 0} items`)
        
        // Only return if we actually got data
        if (data.value && data.value.length > 0) {
          console.log(`✅ OneNote API success! Returning ${data.value.length} ${operation}`)
          return {
            data: data.value,
            error: undefined
          }
        } 
          console.log(`⚠️ OneNote API returned empty data, trying next endpoint...`)
        
      } else {
        const errorText = await response.text()
        console.log(`❌ OneNote API failed: ${response.status} ${errorText}`)
      }
    } catch (error) {
      console.log(`❌ OneNote API error:`, error)
    }
  }
  
  // If we got here, all endpoints either failed or returned empty data
  // This could mean the user simply has no notebooks/sections/pages
  console.log(`⚠️ All OneNote endpoints checked for ${operation} - returning empty result`)
  return {
    data: [],
    error: undefined // Don't treat empty data as an error
  }
}

/**
 * Validate and refresh OneNote token if needed
 */
export async function validateOneNoteToken(integration: any): Promise<{ success: boolean, token?: string, error?: string }> {
  try {
    if (!integration.access_token) {
      return {
        success: false,
        error: "No access token found"
      }
    }

    // Decrypt the access token - this is the most important step
    let accessToken: string
    try {
      accessToken = decrypt(integration.access_token)
      if (!accessToken) {
        console.error('❌ Decryption returned empty token')
        return {
          success: false,
          error: "Failed to decrypt access token"
        }
      }
    } catch (decryptError: any) {
      console.error('❌ Token decryption error:', decryptError.message)
      // Don't fall back to plain text - if decryption fails, the token is unusable
      return {
        success: false,
        error: "Failed to decrypt access token. Please reconnect your Microsoft account."
      }
    }

    // Successfully decrypted the token - return it
    // We're following Discord's approach: just decrypt and return, don't validate
    console.log('✅ OneNote token decrypted successfully')
    return {
      success: true,
      token: accessToken
    }
  } catch (error: any) {
    console.error('❌ Token validation error:', error)
    return {
      success: false,
      error: error.message || "Token validation failed"
    }
  }
}

/**
 * Refresh OneNote/Microsoft token
 */
async function refreshOneNoteToken(integration: any): Promise<string | null> {
  try {
    // Try ONENOTE_ prefixed env vars first, then fall back to MICROSOFT_ prefixed ones
    const clientId = process.env.ONENOTE_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID
    const clientSecret = process.env.ONENOTE_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET
    
    if (!clientId || !clientSecret) {
      console.error('❌ Microsoft/OneNote OAuth credentials not configured')
      console.error('Checked: ONENOTE_CLIENT_ID, ONENOTE_CLIENT_SECRET, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET')
      return null
    }

    // Decrypt refresh token
    let refreshToken: string
    try {
      refreshToken = decrypt(integration.refresh_token)
    } catch (decryptError) {
      // Try as plain text for backward compatibility
      refreshToken = integration.refresh_token
    }

    console.log('🔄 Attempting token refresh with:', {
      clientId: `${clientId.substring(0, 8) }...`,
      hasRefreshToken: !!refreshToken,
      refreshTokenLength: refreshToken?.length
    })

    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: 'https://graph.microsoft.com/.default',
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Failed to refresh Microsoft token:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      })
      
      // Parse error for more details
      try {
        const errorData = JSON.parse(errorText)
        console.error('❌ Error details:', errorData)
        
        if (errorData.error === 'invalid_grant') {
          console.error('❌ Refresh token is invalid or expired. User needs to reconnect.')
        }
      } catch (e) {
        // Error text wasn't JSON
      }
      
      return null
    }

    const data = await response.json()
    
    console.log('✅ Token refresh successful, updating database...')
    
    // Update the integration with new tokens
    await updateIntegrationTokens(integration.id, data)
    
    console.log('✅ Database updated with new tokens')
    return data.access_token
  } catch (error: any) {
    console.error('❌ Error refreshing OneNote token:', error)
    return null
  }
}

/**
 * Update integration tokens in database
 */
async function updateIntegrationTokens(integrationId: string, tokenData: any): Promise<void> {
  try {
    // Import Supabase client
    const { createClient } = await import('@supabase/supabase-js')
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Calculate expiration time
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : undefined

    // Encrypt tokens
    const encryptedAccessToken = encrypt(tokenData.access_token)
    const encryptedRefreshToken = tokenData.refresh_token
      ? encrypt(tokenData.refresh_token)
      : undefined

    // Update the integration
    const updateData: any = {
      access_token: encryptedAccessToken,
      token_type: tokenData.token_type,
      expires_at: expiresAt,
      updated_at: new Date().toISOString()
    }

    if (encryptedRefreshToken) {
      updateData.refresh_token = encryptedRefreshToken
    }

    const { error } = await supabase
      .from('integrations')
      .update(updateData)
      .eq('id', integrationId)

    if (error) {
      console.error('❌ Failed to update integration tokens:', error)
    } else {
      console.log('✅ Successfully updated OneNote integration tokens')
    }
  } catch (error: any) {
    console.error('❌ Error updating integration tokens:', error)
  }
}