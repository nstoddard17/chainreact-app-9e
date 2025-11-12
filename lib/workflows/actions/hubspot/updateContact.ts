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

    const selectionMode = context.dataFlowManager.resolveVariable(config.contactSelectionMode) || 'picker'
    const lookupEmail = context.dataFlowManager.resolveVariable(config.lookupEmail)
    const lookupContactId = context.dataFlowManager.resolveVariable(config.lookupContactId)
    const contactIdFromPicker = context.dataFlowManager.resolveVariable(config.contactId)

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

    const customPropertyValues =
      config.customProperties ??
      config?.customPropertiesGroup?.customProperties ??
      null

    if (customPropertyValues && typeof customPropertyValues === 'object') {
      Object.entries(customPropertyValues).forEach(([key, rawValue]) => {
        const resolvedValue = context.dataFlowManager.resolveVariable(rawValue as any)
        if (resolvedValue !== undefined && resolvedValue !== null && resolvedValue !== '') {
          properties[key] = resolvedValue
        }
      })
    }

    // Check if there are any properties to update
    if (Object.keys(properties).length === 0) {
      throw new Error('At least one property must be provided to update')
    }

    let targetContactId: string | null = null

    if (selectionMode === 'email') {
      if (!lookupEmail) {
        throw new Error('Lookup email is required when using email mode')
      }
      targetContactId = await findContactIdByEmail(lookupEmail, accessToken)

      const createIfNotFound = Boolean(context.dataFlowManager.resolveVariable(config.createIfNotFound))
      if (!targetContactId && createIfNotFound) {
        const creationProperties = { ...properties }
        if (!creationProperties.email) {
          creationProperties.email = lookupEmail
        }
        if (!creationProperties.email) {
          throw new Error('Email is required to create a new contact')
        }
        targetContactId = await createContactInHubSpot(creationProperties, accessToken)
      }
    } else if (selectionMode === 'id') {
      targetContactId = lookupContactId
    } else {
      targetContactId = contactIdFromPicker
    }

    if (!targetContactId) {
      throw new Error('Contact ID is required')
    }

    const response = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${targetContactId}`, {
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
      message: `Successfully updated contact ${targetContactId} in HubSpot`
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

async function findContactIdByEmail(email: string, accessToken: string): Promise<string | null> {
  const searchResponse = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      limit: 1,
      filterGroups: [{
        filters: [{
          propertyName: 'email',
          operator: 'EQ',
          value: email
        }]
      }]
    })
  })

  if (!searchResponse.ok) {
    const errorText = await searchResponse.text()
    throw new Error(`Failed to search contact by email: ${errorText}`)
  }

  const searchData = await searchResponse.json()
  const match = searchData.results?.[0]
  return match?.id ?? null
}

async function createContactInHubSpot(properties: Record<string, any>, accessToken: string): Promise<string> {
  const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ properties })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to create contact in HubSpot: ${errorText}`)
  }

  const data = await response.json()
  return data.id
}
