import { getMailchimpAuth } from './utils'
import { ActionResult } from '../index'
import { ExecutionContext } from '../../execution/types'
import crypto from 'crypto'

import { logger } from '@/lib/utils/logger'

/**
 * Update an existing subscriber in a Mailchimp audience
 */
export async function mailchimpUpdateSubscriber(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const { accessToken, dc } = await getMailchimpAuth(context.userId)

    // Resolve dynamic values
    const audienceId = context.dataFlowManager.resolveVariable(config.audience_id)
    const email = context.dataFlowManager.resolveVariable(config.subscriber_email)
    const newEmail = context.dataFlowManager.resolveVariable(config.new_email)
    const status = context.dataFlowManager.resolveVariable(config.status)

    // Get subscriber details
    const firstName = context.dataFlowManager.resolveVariable(config.first_name)
    const lastName = context.dataFlowManager.resolveVariable(config.last_name)
    const phone = context.dataFlowManager.resolveVariable(config.phone)
    const address = context.dataFlowManager.resolveVariable(config.address)
    const city = context.dataFlowManager.resolveVariable(config.city)
    const state = context.dataFlowManager.resolveVariable(config.state)
    const zip = context.dataFlowManager.resolveVariable(config.zip)
    const country = context.dataFlowManager.resolveVariable(config.country)

    if (!audienceId) {
      throw new Error("Audience is required")
    }

    if (!email) {
      throw new Error("Email address is required")
    }

    // Build merge fields object from standard Mailchimp fields
    const mergeFields: Record<string, any> = {}
    if (firstName) mergeFields.FNAME = firstName
    if (lastName) mergeFields.LNAME = lastName
    if (phone) mergeFields.PHONE = phone
    if (address) mergeFields.ADDRESS = { addr1: address, city, state, zip, country }
    else {
      if (city) mergeFields.CITY = city
      if (state) mergeFields.STATE = state
      if (zip) mergeFields.ZIP = zip
      if (country) mergeFields.COUNTRY = country
    }

    // Build request body - only include fields that are being updated
    const requestBody: any = {}

    if (newEmail) {
      requestBody.email_address = newEmail
    }

    if (status) {
      requestBody.status = status
    }

    if (Object.keys(mergeFields).length > 0) {
      requestBody.merge_fields = mergeFields
    }

    // If nothing to update, return early
    if (Object.keys(requestBody).length === 0) {
      return {
        success: false,
        output: {},
        message: 'No fields specified to update'
      }
    }

    logger.info('Updating subscriber in Mailchimp', {
      audienceId,
      hasNewEmail: !!newEmail,
      hasStatus: !!status,
      hasMergeFields: Object.keys(mergeFields).length > 0
    })

    // The subscriber hash is the MD5 hash of the lowercase current email
    const subscriberHash = crypto.createHash('md5').update(email.toLowerCase()).digest('hex')

    const response = await fetch(
      `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/members/${subscriberHash}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.detail || errorData.title || `HTTP ${response.status}`

      if (response.status === 404) {
        throw new Error(`Subscriber not found: ${email}`)
      }

      logger.error('Mailchimp API error', {
        status: response.status,
        error: errorMessage
      })
      throw new Error(`Mailchimp API error: ${errorMessage}`)
    }

    const data = await response.json()

    logger.info('Successfully updated subscriber in Mailchimp', {
      subscriberId: data.id,
      status: data.status
    })

    return {
      success: true,
      output: {
        subscriber_id: data.id,
        email: data.email_address,
        status: data.status,
        list_id: data.list_id,
        timestamp: new Date().toISOString()
      },
      message: `Successfully updated subscriber: ${data.email_address}`
    }
  } catch (error: any) {
    logger.error('Mailchimp Update Subscriber error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to update subscriber in Mailchimp'
    }
  }
}
