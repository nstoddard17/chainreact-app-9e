/**
 * HubSpot Forms Handler
 *
 * API Verification:
 * - Endpoint: GET /marketing/v3/forms
 * - Docs: https://developers.hubspot.com/docs/api-reference/marketing-forms-v3
 * - Scopes: forms
 */

import { HubSpotIntegration, HubSpotDataHandler } from '../types'
import { validateHubSpotIntegration, validateHubSpotToken, makeHubSpotApiRequest, buildHubSpotApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

export interface HubSpotForm {
  id: string
  name: string
  portalId: number
  guid: string
  createdAt: string
  updatedAt: string
}

export const getHubSpotForms: HubSpotDataHandler<HubSpotForm> = async (integration: HubSpotIntegration, options: any = {}): Promise<HubSpotForm[]> => {
  logger.debug("🔍 HubSpot forms fetcher called", {
    integrationId: integration.id
  })

  try {
    validateHubSpotIntegration(integration)

    const tokenResult = await validateHubSpotToken(integration)
    if (!tokenResult.success) {
      throw new Error(tokenResult.error || "Authentication failed")
    }

    const apiUrl = buildHubSpotApiUrl('/marketing/v3/forms')
    const response = await makeHubSpotApiRequest(apiUrl, tokenResult.token!)

    if (!response.ok) {
      throw new Error(`HubSpot API error: ${response.status}`)
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

    logger.debug(`✅ Fetched ${forms.length} forms`)
    return forms

  } catch (error: any) {
    logger.error("Error fetching HubSpot forms:", error)
    throw new Error(error.message || "Error fetching HubSpot forms")
  }
}
