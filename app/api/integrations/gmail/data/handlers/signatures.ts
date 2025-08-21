/**
 * Gmail Signatures Handler
 */

import { GmailIntegration, GmailSignature, GmailDataHandler } from '../types'
import { validateGmailIntegration } from '../utils'
import { getBaseUrl } from '../../../../../../lib/utils/getBaseUrl'

/**
 * Fetch Gmail signatures for the authenticated user
 * Uses the dedicated Gmail signatures API endpoint
 */
export const getGmailSignatures: GmailDataHandler<GmailSignature> = async (integration: GmailIntegration) => {
  try {
    validateGmailIntegration(integration)
    console.log('🔍 [Gmail Signatures] Fetching signatures for user:', integration.user_id)
    
    // Use the dedicated Gmail signatures API endpoint
    const baseUrl = getBaseUrl()
    const apiUrl = `${baseUrl}/api/integrations/gmail/signatures?userId=${integration.user_id}`
    console.log('🔍 [Gmail Signatures] Calling API:', apiUrl)
    
    const response = await fetch(apiUrl, {
      headers: {
        "Content-Type": "application/json",
      },
    })

    console.log('🔍 [Gmail Signatures] API response status:', response.status)

    if (!response.ok) {
      console.error(`❌ [Gmail Signatures] API error: ${response.status}`)
      const errorData = await response.json().catch(() => ({}))
      console.log('🔍 [Gmail Signatures] Error response data:', errorData)
      
      // If Gmail integration not connected, return empty array
      if (errorData.needsConnection) {
        console.log('⚠️ [Gmail Signatures] Integration needs reconnection, returning empty results')
        return []
      }
      
      throw new Error(`Gmail signatures API error: ${response.status} - ${errorData.error || response.statusText}`)
    }

    const result = await response.json()
    console.log('✅ [Gmail Signatures] Successfully fetched signatures:', {
      count: result.signatures?.length || 0,
      hasDefault: result.signatures?.some((s: any) => s.isDefault) || false
    })

    return result.signatures || []

  } catch (error: any) {
    console.error('❌ [Gmail Signatures] Error fetching signatures:', error)
    
    // For connection errors, return empty array instead of throwing
    if (error.message?.includes('needsConnection') || error.message?.includes('reconnect')) {
      console.log('⚠️ [Gmail Signatures] Connection issue, returning empty results')
      return []
    }
    
    throw error
  }
}