/**
 * HubSpot Owners Handler
 *
 * API Verification:
 * - Endpoint: GET /crm/v3/owners
 * - Docs: https://developers.hubspot.com/docs/api/crm/owners
 * - Scopes: crm.objects.owners.read
 */

import { HubSpotIntegration, HubSpotDataHandler } from '../types'
import { validateHubSpotIntegration, validateHubSpotToken, makeHubSpotApiRequest, buildHubSpotApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

export interface HubSpotOwner {
  id: string
  email: string
  firstName: string
  lastName: string
  userId: number
}

export const getHubSpotOwners: HubSpotDataHandler<HubSpotOwner> = async (integration: HubSpotIntegration, options: any = {}): Promise<HubSpotOwner[]> => {
  try {
    validateHubSpotIntegration(integration)

    const tokenResult = await validateHubSpotToken(integration)
    if (!tokenResult.success) {
      throw new Error(tokenResult.error || "Authentication failed")
    }

    const apiUrl = buildHubSpotApiUrl('/crm/v3/owners?limit=100')
    const response = await makeHubSpotApiRequest(apiUrl, tokenResult.token!)

    if (!response.ok) {
      throw new Error(`HubSpot API error: ${response.status}`)
    }

    const data = await response.json()
    const owners = (data.results || []).map((owner: any) => ({
      id: owner.id,
      email: owner.email,
      firstName: owner.firstName || '',
      lastName: owner.lastName || '',
      userId: owner.userId
    }))

    logger.debug(`✅ Fetched ${owners.length} owners`)
    return owners

  } catch (error: any) {
    logger.error("Error fetching HubSpot owners:", error)
    throw new Error(error.message || "Error fetching HubSpot owners")
  }
}
