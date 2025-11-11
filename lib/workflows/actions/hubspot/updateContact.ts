import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Update an existing contact in HubSpot CRM
 *
 * API Verification:
 * - Endpoint: PATCH /crm/v3/objects/contacts/{contactId}
 * - Docs: https://developers.hubspot.com/docs/api/crm/contacts
 * - Scopes: crm.objects.contacts.write
 */
export async function hubspotUpdateContact(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "hubspot")

    // Resolve contact ID
    const contactId = context.dataFlowManager.resolveVariable(config.contactId)
    if (!contactId) {
      throw new Error('Contact ID is required')
    }

    // Build properties object with all non-empty fields
    const properties: any = {}

    const fieldsToUpdate = [
      'email', 'firstname', 'lastname', 'phone', 'mobilephone',
      'company', 'jobtitle', 'website',
      'address', 'city', 'state', 'zip', 'country',
      'lifecyclestage', 'hs_lead_status', 'hubspot_owner_id'
    ]

    fieldsToUpdate.forEach(field => {
      const value = context.dataFlowManager.resolveVariable(config[field])
      if (value !== undefined && value !== null && value !== '') {
        properties[field] = value
      }
    })

    // Check if there are any properties to update
    if (Object.keys(properties).length === 0) {
      throw new Error('At least one property must be provided to update')
    }

    const response = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ properties })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HubSpot API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    return {
      success: true,
      output: {
        contactId: data.id,
        ...data.properties,
        lastmodifieddate: data.updatedAt,
        properties: data.properties
      },
      message: `Successfully updated contact ${contactId} in HubSpot`
    }
  } catch (error: any) {
    logger.error('HubSpot Update Contact error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to update contact in HubSpot'
    }
  }
}
