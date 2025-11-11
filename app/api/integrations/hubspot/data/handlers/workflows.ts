/**
 * HubSpot Workflows Handler
 *
 * API Verification:
 * - Endpoint: GET /automation/v4/flows
 * - Docs: https://developers.hubspot.com/docs/api/automation/workflows-v4
 * - Scopes: automation
 */

import { HubSpotIntegration, HubSpotDataHandler } from '../types'
import { validateHubSpotIntegration, validateHubSpotToken, makeHubSpotApiRequest, buildHubSpotApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

export interface HubSpotWorkflow {
  id: string
  name: string
  type: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export const getHubSpotWorkflows: HubSpotDataHandler<HubSpotWorkflow> = async (integration: HubSpotIntegration, options: any = {}): Promise<HubSpotWorkflow[]> => {
  logger.debug("🔍 HubSpot workflows fetcher called", {
    integrationId: integration.id,
    hasToken: !!integration.access_token
  })

  try {
    validateHubSpotIntegration(integration)

    logger.debug(`🔍 Validating HubSpot token...`)
    const tokenResult = await validateHubSpotToken(integration)

    if (!tokenResult.success) {
      logger.debug(`❌ HubSpot token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }

    logger.debug('🔍 Fetching HubSpot workflows from API...')
    const apiUrl = buildHubSpotApiUrl('/automation/v4/flows')

    const response = await makeHubSpotApiRequest(apiUrl, tokenResult.token!)

    if (!response.ok) {
      const errorData = await response.json()
      logger.error(`❌ HubSpot workflows API error: ${response.status} ${JSON.stringify(errorData)}`)
      throw new Error(`HubSpot API error: ${response.status}`)
    }

    const data = await response.json()
    const workflows = (data.results || []).map((workflow: any) => ({
      id: workflow.id,
      name: workflow.name,
      type: workflow.type,
      enabled: workflow.enabled,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt
    }))

    logger.debug(`✅ HubSpot workflows fetched successfully: ${workflows.length} workflows`)
    return workflows

  } catch (error: any) {
    logger.error("Error fetching HubSpot workflows:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('HubSpot authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('HubSpot API rate limit exceeded. Please try again later.')
    }

    throw new Error(error.message || "Error fetching HubSpot workflows")
  }
}
