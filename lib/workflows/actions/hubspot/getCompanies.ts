import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Get companies from HubSpot CRM
 */
export async function hubspotGetCompanies(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "hubspot")

    // Resolve dynamic values
    const limit = context.dataFlowManager.resolveVariable(config.limit) || 100
    const filterProperty = context.dataFlowManager.resolveVariable(config.filterProperty)
    const filterValue = context.dataFlowManager.resolveVariable(config.filterValue)
    const properties = context.dataFlowManager.resolveVariable(config.properties) || [
      'name', 'domain', 'city', 'state', 'country', 'industry'
    ]

    // Build request payload
    const payload: any = {
      limit: Math.min(limit, 100),
      properties: Array.isArray(properties) ? properties : properties.split(',').map((p: string) => p.trim())
    }

    // Add filtering if specified
    if (filterProperty && filterValue) {
      payload.filters = [{
        propertyName: filterProperty,
        operator: 'EQ',
        value: filterValue
      }]
    }

    const response = await fetch('https://api.hubapi.com/crm/v3/objects/companies/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HubSpot API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const companies = data.results || []

    return {
      success: true,
      output: {
        companies,
        count: companies.length,
        total: data.total || companies.length
      },
      message: `Successfully retrieved ${companies.length} companies from HubSpot`
    }
  } catch (error: any) {
    logger.error('HubSpot Get Companies error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to retrieve companies from HubSpot'
    }
  }
}
