/**
 * OneNote Action Utilities
 */

import { createSupabaseServiceClient } from '@/utils/supabase/server'

/**
 * Get Microsoft Graph access token for OneNote integration
 */
export async function getOneNoteAccessToken(userId: string): Promise<string> {
  const supabase = await createSupabaseServiceClient()

  // Try common provider keys in order
  const providerCandidates = [
    'microsoft-onenote',
    'microsoft_onenote',
    'onenote',
  ]

  for (const provider of providerCandidates) {
    const { data: integration } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', provider)
      .eq('status', 'connected')
      .maybeSingle()

    if (integration && integration.access_token) {
      return integration.access_token as string
    }
  }

  throw new Error('OneNote integration not found or not connected')
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