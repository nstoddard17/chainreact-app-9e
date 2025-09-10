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
        console.log(`✅ OneNote API success! Found ${data.value?.length || 0} items`)
        
        if (data.value && data.value.length > 0) {
          return {
            data: data.value || [],
            error: undefined
          }
        }
      } else {
        const errorText = await response.text()
        console.log(`❌ OneNote API failed: ${response.status} ${errorText}`)
      }
    } catch (error) {
      console.log(`❌ OneNote API error:`, error)
    }
  }
  
  console.log(`❌ All OneNote endpoints failed for ${operation}`)
  return {
    data: [],
    error: {
      message: `No ${operation} found or API access failed`
    }
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

    // Decrypt the access token
    let accessToken: string
    try {
      accessToken = decrypt(integration.access_token)
    } catch (decryptError) {
      // If decryption fails, try using the token as-is (for backward compatibility)
      console.log('⚠️ Token decryption failed, trying as plain text')
      accessToken = integration.access_token
    }

    // Test if the current token is valid
    const testResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (testResponse.ok) {
      // Token is valid
      return {
        success: true,
        token: accessToken
      }
    }

    if (testResponse.status === 401) {
      // Token is expired, try to refresh
      console.log('🔄 OneNote token expired, attempting refresh...')
      
      if (!integration.refresh_token) {
        return {
          success: false,
          error: "Token expired and no refresh token available. Please reconnect your Microsoft account."
        }
      }

      // Refresh the token
      const refreshedToken = await refreshOneNoteToken(integration)
      if (refreshedToken) {
        return {
          success: true,
          token: refreshedToken
        }
      } else {
        return {
          success: false,
          error: "Failed to refresh token. Please reconnect your Microsoft account."
        }
      }
    }

    // Other error
    return {
      success: false,
      error: `Token validation failed with status: ${testResponse.status}`
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
    const clientId = process.env.MICROSOFT_CLIENT_ID
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
    
    if (!clientId || !clientSecret) {
      console.error('❌ Microsoft OAuth credentials not configured')
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
      const error = await response.text()
      console.error('❌ Failed to refresh Microsoft token:', error)
      return null
    }

    const data = await response.json()
    
    // Update the integration with new tokens
    await updateIntegrationTokens(integration.id, data)
    
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