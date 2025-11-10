/**
 * HubSpot Ticket Stages Handler
 *
 * API Verification:
 * - Endpoint: GET /crm/v3/pipelines/tickets/{pipelineId}
 * - Docs: https://developers.hubspot.com/docs/api/crm/pipelines
 * - Scopes: tickets
 * - Returns: Pipeline object with stages array
 */

import { HubSpotIntegration, HubSpotTicketStage, HubSpotDataHandler, HubSpotHandlerOptions } from '../types'
import { validateHubSpotIntegration, validateHubSpotToken, makeHubSpotApiRequest, buildHubSpotApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getHubSpotTicketStages: HubSpotDataHandler<HubSpotTicketStage> = async (integration: HubSpotIntegration, options: HubSpotHandlerOptions = {}): Promise<HubSpotTicketStage[]> => {
  const { pipeline } = options

  logger.debug("🔍 HubSpot ticket stages fetcher called with:", {
    integrationId: integration.id,
    pipeline,
    hasToken: !!integration.access_token
  })

  try {
    // Validate integration status
    validateHubSpotIntegration(integration)

    logger.debug(`🔍 Validating HubSpot token...`)
    const tokenResult = await validateHubSpotToken(integration)

    if (!tokenResult.success) {
      logger.debug(`❌ HubSpot token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }

    if (!pipeline) {
      throw new Error('Pipeline ID is required for fetching ticket stages')
    }

    logger.debug('🔍 Fetching HubSpot ticket stages from API...')
    const apiUrl = buildHubSpotApiUrl(`/crm/v3/pipelines/tickets/${pipeline}`)

    const response = await makeHubSpotApiRequest(apiUrl, tokenResult.token!)

    const data = await response.json()

    if (!response.ok) {
      logger.error(`❌ HubSpot ticket stages API error: ${response.status} ${JSON.stringify(data)}`)
      throw new Error(`HubSpot API error: ${response.status}`)
    }

    // Return the stages from the pipeline
    const stages = data.stages || []

    logger.debug(`✅ HubSpot ticket stages fetched successfully: ${stages.length} stages`)
    return stages

  } catch (error: any) {
    logger.error("Error fetching HubSpot ticket stages:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('HubSpot authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('HubSpot API rate limit exceeded. Please try again later.')
    }

    throw new Error(error.message || "Error fetching HubSpot ticket stages")
  }
}
