import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Get Forms from HubSpot
 *
 * API: GET /marketing/v3/forms
 */
export async function hubspotGetForms(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "hubspot")

    const limit = context.dataFlowManager.resolveVariable(config.limit) || 100

    const response = await fetch(
      `https://api.hubapi.com/marketing/v3/forms?limit=${limit}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HubSpot API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const forms = (data.results || []).map((form: any) => ({
      id: form.id,
      name: form.name,
      portalId: form.portalId,
      guid: form.guid,
      createdAt: form.createdAt,
      updatedAt: form.updatedAt
    }))

    return {
      success: true,
      output: {
        forms,
        count: forms.length,
        total: data.total || forms.length
      },
      message: `Successfully retrieved ${forms.length} forms from HubSpot`
    }
  } catch (error: any) {
    logger.error('HubSpot Get Forms error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to retrieve forms from HubSpot'
    }
  }
}
