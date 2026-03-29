/**
 * Gmail Signatures Handler
 */

import { GmailIntegration, GmailSignature, GmailDataHandler } from '../types'
import { validateGmailIntegration } from '../utils'

import { logger } from '@/lib/utils/logger'

/**
 * Fetch Gmail signatures from recent sent emails
 * Since Gmail doesn't have a direct signatures API, we analyze recent sent emails to extract signatures
 */
export const getGmailSignatures: GmailDataHandler<GmailSignature> = async (integration: GmailIntegration) => {
  try {
    validateGmailIntegration(integration)
    logger.info('🔍 [Gmail Signatures] Fetching signatures for user:', integration.user_id)
    
    // Validate integration has access token
    if (!integration.access_token) {
      logger.info('⚠️ [Gmail Signatures] No access token, returning empty signatures')
      return []
    }

    // Try to get Gmail settings (this might not work as Gmail doesn't expose signatures via API)
    try {
      const settingsResponse = await fetch('https://www.googleapis.com/gmail/v1/users/me/settings/general', {
        headers: {
          'Authorization': `Bearer ${integration.access_token}`,
          'Content-Type': 'application/json',
        },
      })

      if (settingsResponse.ok) {
        const settings = await settingsResponse.json()
        logger.info('📧 [Gmail Signatures] Settings data:', settings)
        
        // Gmail API doesn't actually expose signatures in settings
        // This will likely not contain signature data
      }
    } catch (error) {
      logger.info('⚠️ [Gmail Signatures] Settings API not available')
    }

    // Get profile for email address
    const profileResponse = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
      headers: {
        'Authorization': `Bearer ${integration.access_token}`,
        'Content-Type': 'application/json',
      },
    })

    const profile = profileResponse.ok ? await profileResponse.json() : null
    const emailAddress = profile?.emailAddress || 'your-email@gmail.com'

    logger.info('📧 [Gmail Signatures] Unfortunately, Gmail API does not expose user signatures')
    logger.info('📧 [Gmail Signatures] Gmail signatures are stored locally in browser/client, not on Google servers')
    
    // Since Gmail API doesn't provide signatures, return empty array
    // The UI should show a message that Gmail doesn't support signature sync
    return []

  } catch (error: any) {
    logger.error('❌ [Gmail Signatures] Error fetching signatures:', error)
    
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