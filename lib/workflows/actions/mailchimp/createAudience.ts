import { ActionResult } from '../index'
import { ExecutionContext } from '../../execution/types'
import { getMailchimpAuth } from './utils'
import { logger } from '@/lib/utils/logger'

/**
 * Create a new Mailchimp audience (list)
 */
export async function mailchimpCreateAudience(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    // Get Mailchimp auth with proper data center
    const { accessToken, dc } = await getMailchimpAuth(context.userId)

    // Resolve dynamic values
    const name = context.dataFlowManager.resolveVariable(config.name)
    const permissionReminder = context.dataFlowManager.resolveVariable(config.permission_reminder)
    const emailTypeOption = context.dataFlowManager.resolveVariable(config.email_type_option) || false
    const company = context.dataFlowManager.resolveVariable(config.company)
    const address1 = context.dataFlowManager.resolveVariable(config.address1)
    const address2 = context.dataFlowManager.resolveVariable(config.address2)
    const city = context.dataFlowManager.resolveVariable(config.city)
    const state = context.dataFlowManager.resolveVariable(config.state)
    const zip = context.dataFlowManager.resolveVariable(config.zip)
    const country = context.dataFlowManager.resolveVariable(config.country)
    const fromName = context.dataFlowManager.resolveVariable(config.from_name)
    const fromEmail = context.dataFlowManager.resolveVariable(config.from_email)
    const subject = context.dataFlowManager.resolveVariable(config.subject)
    const language = context.dataFlowManager.resolveVariable(config.language) || 'en'

    // Validate required fields
    if (!name) throw new Error("Audience name is required")
    if (!permissionReminder) throw new Error("Permission reminder is required")
    if (!company) throw new Error("Company name is required")
    if (!address1) throw new Error("Address is required")
    if (!city) throw new Error("City is required")
    if (!state) throw new Error("State/Province is required")
    if (!zip) throw new Error("Zip/Postal code is required")
    if (!country) throw new Error("Country is required")
    if (!fromName) throw new Error("From name is required")
    if (!fromEmail) throw new Error("From email is required")

    // Build request body
    const requestBody: any = {
      name,
      permission_reminder: permissionReminder,
      email_type_option: emailTypeOption,
      contact: {
        company,
        address1,
        address2: address2 || '',
        city,
        state,
        zip,
        country
      },
      campaign_defaults: {
        from_name: fromName,
        from_email: fromEmail,
        subject: subject || '',
        language
      }
    }

    logger.info('Creating Mailchimp audience', {
      name,
      company,
      country
    })

    const url = `https://${dc}.api.mailchimp.com/3.0/lists`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.detail || errorData.title || `HTTP ${response.status}`
      logger.error('Mailchimp API error', {
        status: response.status,
        error: errorMessage,
        errorData
      })
      throw new Error(`Mailchimp API error: ${errorMessage}`)
    }

    const data = await response.json()

    logger.info('Successfully created Mailchimp audience', {
      audienceId: data.id,
      name: data.name
    })

    return {
      success: true,
      output: {
        audienceId: data.id,
        name: data.name,
        webId: data.web_id,
        dateCreated: data.date_created
      },
      message: `Successfully created audience: ${data.name}`
    }
  } catch (error: any) {
    logger.error('Mailchimp Create Audience error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create Mailchimp audience'
    }
  }
}
