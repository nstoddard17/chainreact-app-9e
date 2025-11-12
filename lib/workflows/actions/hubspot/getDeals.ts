import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Get deals from HubSpot CRM
 */
export async function hubspotGetDeals(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "hubspot")

    // Resolve dynamic values
    const limit = context.dataFlowManager.resolveVariable(config.limit) || 100
    const after = context.dataFlowManager.resolveVariable(config.after)
    const filterProperty = context.dataFlowManager.resolveVariable(config.filterProperty)
    const filterValue = context.dataFlowManager.resolveVariable(config.filterValue)
    const advancedFilters = context.dataFlowManager.resolveVariable(config.advancedFilters)
    const sortProperty = context.dataFlowManager.resolveVariable(config.sortProperty)
    const sortDirection = (context.dataFlowManager.resolveVariable(config.sortDirection) || 'ASCENDING').toUpperCase()
    const properties = context.dataFlowManager.resolveVariable(config.properties) || [
      'dealname', 'amount', 'dealstage', 'pipeline', 'closedate'
    ]

    // Build request payload
    const payload: any = {
      limit: Math.min(limit, 100),
      properties: Array.isArray(properties) ? properties : properties.split(',').map((p: string) => p.trim())
    }

    if (after) {
      payload.after = after
    }

    if (sortProperty) {
      payload.sorts = [
        {
          propertyName: sortProperty,
          direction: sortDirection === 'DESCENDING' ? 'DESCENDING' : 'ASCENDING'
        }
      ]
    }

    const filters: any[] = []

    const normalizeFilterProperties = (value: any): string[] => {
      if (Array.isArray(value)) {
        return value
          .map((prop) => typeof prop === 'string' ? prop.trim() : '')
          .filter(Boolean)
      }
      if (typeof value === 'string' && value.trim()) {
        return [value.trim()]
      }
      return []
    }

    const resolveFilterValueForProperty = (property: string, index: number): any => {
      if (Array.isArray(filterValue)) {
        if (filterValue.length === 0) return undefined
        return filterValue[index] ?? filterValue[filterValue.length - 1]
      }

      if (filterValue && typeof filterValue === 'object') {
        return filterValue[property]
      }

      return filterValue
    }

    const appendAdvancedFilter = (filter: any) => {
      if (!filter) return
      const propertyName = filter.property || filter.field
      const operator = (filter.operator || 'EQ').toUpperCase()

      if (!propertyName) return

      if (['HAS_PROPERTY', 'NOT_HAS_PROPERTY', 'IS_EMPTY', 'IS_NOT_EMPTY'].includes(operator)) {
        filters.push({ propertyName, operator })
        return
      }

      if (operator === 'BETWEEN') {
        if (filter.value && filter.valueTo) {
          filters.push({
            propertyName,
            operator,
            value: filter.value,
            highValue: filter.valueTo
          })
        }
        return
      }

      if (operator === 'IN') {
        const rawValues = Array.isArray(filter.values)
          ? filter.values
          : typeof filter.value === 'string'
            ? filter.value.split(',').map((v: string) => v.trim()).filter(Boolean)
            : []

        if (rawValues.length > 0) {
          filters.push({ propertyName, operator, values: rawValues })
        }
        return
      }

      if (filter.value !== undefined && filter.value !== null && filter.value !== '') {
        filters.push({ propertyName, operator, value: filter.value })
      }
    }

    if (Array.isArray(advancedFilters)) {
      advancedFilters.forEach(appendAdvancedFilter)
    }

    const filterProperties = normalizeFilterProperties(filterProperty)
    filterProperties.forEach((propertyName, index) => {
      const valueForProperty = resolveFilterValueForProperty(propertyName, index)
      if (valueForProperty === undefined || valueForProperty === null || valueForProperty === '') {
        return
      }

      filters.push({
        propertyName,
        operator: 'EQ',
        value: valueForProperty
      })
    })

    if (filters.length > 0) {
      payload.filterGroups = [{ filters }]
    }

    const response = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
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
    const deals = data.results || []
    const nextCursor = data.paging?.next?.after || null
    const hasMore = Boolean(nextCursor)

    return {
      success: true,
      output: {
        deals,
        count: deals.length,
        total: data.total || deals.length,
        nextCursor,
        hasMore,
        paging: data.paging || null
      },
      message: `Successfully retrieved ${deals.length} deals from HubSpot`
    }
  } catch (error: any) {
    logger.error('HubSpot Get Deals error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to retrieve deals from HubSpot'
    }
  }
}
