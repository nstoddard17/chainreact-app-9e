import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Get Deal Pipelines from HubSpot
 *
 * API: GET /crm/v3/pipelines/deals
 */
export async function hubspotGetDealPipelines(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "hubspot")

    const response = await fetch(
      'https://api.hubapi.com/crm/v3/pipelines/deals',
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
    const pipelines = (data.results || []).map((pipeline: any) => ({
      id: pipeline.id,
      label: pipeline.label,
      displayOrder: pipeline.displayOrder,
      stages: (pipeline.stages || []).map((stage: any) => ({
        id: stage.id,
        label: stage.label,
        displayOrder: stage.displayOrder,
        metadata: stage.metadata
      }))
    }))

    return {
      success: true,
      output: {
        pipelines,
        count: pipelines.length
      },
      message: `Successfully retrieved ${pipelines.length} deal pipelines from HubSpot`
    }
  } catch (error: any) {
    logger.error('HubSpot Get Deal Pipelines error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to retrieve deal pipelines from HubSpot'
    }
  }
}
