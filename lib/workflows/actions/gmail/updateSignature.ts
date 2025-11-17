import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'

/**
 * Updates the Gmail signature for the authenticated user
 * Note: This requires the gmail.settings.basic scope
 */
export async function updateGmailSignature(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, 'gmail')

    // Get signature details from config
    const signature = resolveValue(config.signature, input)
    const sendAsEmail = resolveValue(config.sendAsEmail, input)

    if (signature === undefined || signature === null) {
      return {
        success: false,
        message: 'Signature content is required',
      }
    }

    logger.debug('[Gmail Update Signature] Updating signature')

    // If sendAsEmail is not provided, get the primary email address
    let targetEmail = sendAsEmail

    if (!targetEmail) {
      // Get the user's primary email
      const profileResponse = await fetch(
        'https://www.googleapis.com/gmail/v1/users/me/profile',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )

      if (!profileResponse.ok) {
        throw new Error(`Failed to get user profile: ${profileResponse.status}`)
      }

      const profile = await profileResponse.json()
      targetEmail = profile.emailAddress
    }

    // Update the signature
    const response = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/settings/sendAs/${encodeURIComponent(targetEmail)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signature,
        }),
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }))
      throw new Error(error.error?.message || `Failed to update signature: ${response.status}`)
    }

    const result = await response.json()

    logger.debug('[Gmail Update Signature] Successfully updated signature')

    return {
      success: true,
      output: {
        ...input,
        signature: result.signature,
        email: targetEmail,
        success: true,
        updatedAt: new Date().toISOString(),
      },
      message: 'Gmail signature updated successfully',
    }
  } catch (error: any) {
    logger.error('[Gmail Update Signature] Error:', error)
    return {
      success: false,
      message: `Failed to update signature: ${error.message}`,
      error: error.message,
    }
  }
}
