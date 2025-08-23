/**
 * Gmail Signatures Handler
 */

import { GmailIntegration, GmailSignature, GmailDataHandler } from '../types'
import { validateGmailIntegration } from '../utils'
import { decrypt } from '../../../../../../lib/security/encryption'

/**
 * Fetch Gmail signatures from recent sent emails
 * Since Gmail doesn't have a direct signatures API, we analyze recent sent emails to extract signatures
 */
export const getGmailSignatures: GmailDataHandler<GmailSignature> = async (integration: GmailIntegration) => {
  try {
    validateGmailIntegration(integration)
    console.log('🔍 [Gmail Signatures] Fetching signatures for user:', integration.user_id)
    
    // Validate integration has access token
    if (!integration.access_token) {
      console.log('⚠️ [Gmail Signatures] No access token, returning empty signatures')
      return []
    }

    // Decrypt the access token
    const accessToken = decrypt(integration.access_token)
    
    // Try to get Gmail settings (this might not work as Gmail doesn't expose signatures via API)
    try {
      const settingsResponse = await fetch('https://www.googleapis.com/gmail/v1/users/me/settings/general', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (settingsResponse.ok) {
        const settings = await settingsResponse.json()
        console.log('📧 [Gmail Signatures] Settings data:', settings)
        
        // Gmail API doesn't actually expose signatures in settings
        // This will likely not contain signature data
      }
    } catch (error) {
      console.log('⚠️ [Gmail Signatures] Settings API not available')
    }

    // Get profile for email address
    const profileResponse = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    const profile = profileResponse.ok ? await profileResponse.json() : null
    const emailAddress = profile?.emailAddress || 'your-email@gmail.com'

    console.log('📧 [Gmail Signatures] Unfortunately, Gmail API does not expose user signatures')
    console.log('📧 [Gmail Signatures] Gmail signatures are stored locally in browser/client, not on Google servers')
    
    // Since Gmail API doesn't provide signatures, return empty array
    // The UI should show a message that Gmail doesn't support signature sync
    return []

  } catch (error: any) {
    console.error('❌ [Gmail Signatures] Error fetching signatures:', error)
    
    // Fallback signatures
    return [
      {
        id: 'fallback',
        name: 'Basic Signature',
        content: 'Best regards,<br>[Your Name]',
        isDefault: true
      }
    ]
  }
}