import { ActionResult } from '../index'
import { ExecutionContext } from '../../execution/types'
import { getMailchimpAuth } from './utils'
import crypto from 'crypto'

import { logger } from '@/lib/utils/logger'

/**
 * Add a note to a subscriber's profile in Mailchimp
 */
export async function mailchimpAddNote(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    // Get Mailchimp auth with proper data center
    const { accessToken, dc } = await getMailchimpAuth(context.userId)

    // Resolve dynamic values
    const audienceId = context.dataFlowManager.resolveVariable(config.audience_id)
    const email = context.dataFlowManager.resolveVariable(config.email)
    const note = context.dataFlowManager.resolveVariable(config.note)

    if (!audienceId) {
      throw new Error("Audience is required")
    }

    if (!email) {
      throw new Error("Email address is required")
    }

    if (!note) {
      throw new Error("Note content is required")
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      throw new Error("Invalid email address format")
    }

    // The subscriber hash is the MD5 hash of the lowercase email
    const subscriberHash = crypto.createHash('md5').update(email.toLowerCase()).digest('hex')

    const url = `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/members/${subscriberHash}/notes`

    logger.info('Adding note to subscriber in Mailchimp', {
      audienceId,
      subscriberHash,
      noteLength: note.length
    })

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        note: note
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.detail || errorData.title || `HTTP ${response.status}`
      logger.error('Mailchimp API error adding note', {
        status: response.status,
        error: errorMessage,
        errorData
      })
      throw new Error(`Mailchimp API error: ${errorMessage}`)
    }

    const data = await response.json()

    logger.info('Successfully added note to subscriber', {
      noteId: data.id,
      email
    })

    return {
      success: true,
      output: {
        noteId: data.id,
        note: data.note,
        createdAt: data.created_at,
        createdBy: data.created_by,
        subscriberEmail: email
      },
      message: `Successfully added note to subscriber ${email}`
    }
  } catch (error: any) {
    logger.error('Mailchimp Add Note error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to add note to subscriber'
    }
  }
}
