import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Update an existing company in HubSpot CRM
 *
 * API Verification:
 * - Endpoint: PATCH /crm/v3/objects/companies/{companyId}
 * - Docs: https://developers.hubspot.com/docs/api/crm/companies
 * - Scopes: crm.objects.companies.write
 */
export async function hubspotUpdateCompany(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "hubspot")

    // Resolve company ID
    const companyId = context.dataFlowManager.resolveVariable(config.companyId)
    if (!companyId) {
      throw new Error('Company ID is required')
    }

    // Build properties object with all non-empty fields
    const properties: any = {}

    const fieldsToUpdate = [
      'name', 'domain', 'description', 'phone', 'website',
      'address', 'address2', 'city', 'state', 'zip', 'country',
      'industry', 'numberofemployees', 'annualrevenue', 'type', 'lifecyclestage',
      'hubspot_owner_id', 'linkedin_company_page', 'twitterhandle', 'facebookcompanypage'
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

    const response = await fetch(`https://api.hubapi.com/crm/v3/objects/companies/${companyId}`, {
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
        companyId: data.id,
        ...data.properties,
        lastmodifieddate: data.updatedAt,
        properties: data.properties
      },
      message: `Successfully updated company ${companyId} in HubSpot`
    }
  } catch (error: any) {
    logger.error('HubSpot Update Company error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to update company in HubSpot'
    }
  }
}
