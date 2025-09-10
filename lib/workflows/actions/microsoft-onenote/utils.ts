/**
 * OneNote Action Utilities
 */

import { getSupabaseClient } from '@/lib/supabase'

/**
 * Get Microsoft Graph access token for OneNote integration
 */
export async function getOneNoteAccessToken(userId: string): Promise<string> {
  const supabase = getSupabaseClient()
  
  const { data: integration, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'microsoft-onenote')
    .eq('status', 'connected')
    .single()

  if (error || !integration) {
    throw new Error('OneNote integration not found or not connected')
  }

  if (!integration.access_token) {
    throw new Error('No access token found for OneNote integration')
  }

  return integration.access_token
}

/**
 * Make authenticated request to Microsoft Graph API
 */
export async function makeGraphRequest(
  url: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<any> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': options.headers?.['Content-Type'] || 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Microsoft Graph API error: ${response.status} - ${errorText}`)
  }

  return response.json()
}