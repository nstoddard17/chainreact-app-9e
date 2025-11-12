import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Get tickets from HubSpot
 *
 * API Verification:
 * - Endpoint: POST /crm/v3/objects/tickets/search
 * - Docs: https://developers.hubspot.com/docs/api/crm/tickets
 * - Scopes: tickets
 */
export async function hubspotGetTickets(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "hubspot")

    // Resolve dynamic values
    const limit = context.dataFlowManager.resolveVariable(config.limit) || 100
    const rawFilterProperty = context.dataFlowManager.resolveVariable(config.filterProperty)
    const rawFilterValue = context.dataFlowManager.resolveVariable(config.filterValue)
    const filterPipeline = context.dataFlowManager.resolveVariable(config.filterPipeline)
    const filterStage = context.dataFlowManager.resolveVariable(config.filterStage)
    const filterPriority = context.dataFlowManager.resolveVariable(config.filterPriority)
    const properties = context.dataFlowManager.resolveVariable(config.properties) || [
      'subject', 'content', 'hs_pipeline', 'hs_pipeline_stage', 'hs_ticket_priority', 'hs_ticket_category'
    ]

    // Build request payload
    const payload: any = {
      limit: Math.min(limit, 100),
      properties: Array.isArray(properties) ? properties : properties.split(',').map((p: string) => p.trim())
    }

    // Build filters array
    const filters: any[] = []

    const normalizeFilterProperties = (value: any): string[] => {
      if (Array.isArray(value)) {
        return value
          .map((prop) => typeof prop === 'string' ? prop.trim() : '')
          .filter((prop) => Boolean(prop))
      }
      if (typeof value === 'string' && value.trim()) {
        return [value.trim()]
      }
      return []
    }

    const filterProperties = normalizeFilterProperties(rawFilterProperty)

    const resolveFilterValueForProperty = (property: string, index: number): any => {
      if (Array.isArray(rawFilterValue)) {
        if (rawFilterValue.length === 0) return undefined
        return rawFilterValue[index] ?? rawFilterValue[rawFilterValue.length - 1]
      }

      if (rawFilterValue && typeof rawFilterValue === 'object') {
        return rawFilterValue[property]
      }

      return rawFilterValue
    }

    filterProperties.forEach((propertyName, index) => {
      const value = resolveFilterValueForProperty(propertyName, index)

      if (value === undefined || value === null || value === '') {
        return
      }

      filters.push({
        propertyName,
        operator: 'EQ',
        value
      })
    })

    if (filterPipeline) {
      filters.push({
        propertyName: 'hs_pipeline',
        operator: 'EQ',
        value: filterPipeline
      })
    }

    if (filterStage) {
      filters.push({
        propertyName: 'hs_pipeline_stage',
        operator: 'EQ',
        value: filterStage
      })
    }

    if (filterPriority) {
      filters.push({
        propertyName: 'hs_ticket_priority',
        operator: 'EQ',
        value: filterPriority
      })
    }

    if (filters.length > 0) {
      payload.filterGroups = [{
        filters
      }]
    }

    const response = await fetch('https://api.hubapi.com/crm/v3/objects/tickets/search', {
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
    const tickets = data.results || []

    return {
      success: true,
      output: {
        tickets,
        count: tickets.length,
        total: data.total || tickets.length
      },
      message: `Successfully retrieved ${tickets.length} tickets from HubSpot`
    }
  } catch (error: any) {
    logger.error('HubSpot Get Tickets error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to retrieve tickets from HubSpot'
    }
  }
}
