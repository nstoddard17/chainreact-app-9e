import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'

/**
 * Creates a new label in Gmail
 */
export async function createGmailLabel(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, 'gmail')

    // Get label details from config
    const labelName = resolveValue(config.labelName, input)
    const labelListVisibility = resolveValue(config.labelListVisibility, input) || 'labelShow'
    const messageListVisibility = resolveValue(config.messageListVisibility, input) || 'show'
    const backgroundColor = resolveValue(config.backgroundColor, input)
    const textColor = resolveValue(config.textColor, input)

    if (!labelName || !labelName.trim()) {
      return {
        success: false,
        message: 'Label name is required',
      }
    }

    logger.debug(`[Gmail Create Label] Creating label: ${labelName}`)

    // Build request body
    const requestBody: any = {
      name: labelName,
      labelListVisibility,
      messageListVisibility,
    }

    // Add color if specified
    if (backgroundColor || textColor) {
      requestBody.color = {}
      if (backgroundColor) {
        requestBody.color.backgroundColor = backgroundColor
      }
      if (textColor) {
        requestBody.color.textColor = textColor
      }
    }

    // Create label
    const response = await fetch(
      'https://www.googleapis.com/gmail/v1/users/me/labels',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }))

      // Check if label already exists
      if (response.status === 409 || error.error?.message?.includes('already exists')) {
        return {
          success: false,
          message: `Label "${labelName}" already exists`,
          error: 'Label already exists',
        }
      }

      throw new Error(error.error?.message || `Failed to create label: ${response.status}`)
    }

    const result = await response.json()

    logger.debug('[Gmail Create Label] Successfully created label:', result.id)

    return {
      success: true,
      output: {
        ...input,
        labelId: result.id,
        labelName: result.name,
        success: true,
        createdAt: new Date().toISOString(),
      },
      message: `Label "${labelName}" created successfully`,
    }
  } catch (error: any) {
    logger.error('[Gmail Create Label] Error:', error)
    return {
      success: false,
      message: `Failed to create label: ${error.message}`,
      error: error.message,
    }
  }
}
