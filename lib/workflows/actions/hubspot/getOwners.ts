import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Get Owners from HubSpot
 *
 * API: GET /crm/v3/owners
 */
export async function hubspotGetOwners(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "hubspot")

    const limit = context.dataFlowManager.resolveVariable(config.limit) || 100
    const email = context.dataFlowManager.resolveVariable(config.email)

    let url = `https://api.hubapi.com/crm/v3/owners?limit=${limit}`
    if (email) {
      url += `&email=${encodeURIComponent(email)}`
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HubSpot API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const owners = (data.results || []).map((owner: any) => ({
      id: owner.id,
      email: owner.email,
      firstName: owner.firstName,
      lastName: owner.lastName,
      userId: owner.userId,
      createdAt: owner.createdAt,
      updatedAt: owner.updatedAt
    }))

    return {
      success: true,
      output: {
        owners,
        count: owners.length,
        total: data.total || owners.length
      },
      message: `Successfully retrieved ${owners.length} owners from HubSpot`
    }
  } catch (error: any) {
    logger.error('HubSpot Get Owners error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to retrieve owners from HubSpot'
    }
  }
}
