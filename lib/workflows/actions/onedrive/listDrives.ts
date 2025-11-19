import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * List all available OneDrive drives
 */
export async function listOnedriveDrives(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "onedrive")

    // Resolve dynamic values
    const driveType = context.dataFlowManager.resolveVariable(config.driveType) || 'all'
    const siteId = context.dataFlowManager.resolveVariable(config.siteId)

    logger.debug('[OneDrive] Listing drives:', { driveType, siteId })

    // Build drives URL
    let drivesUrl: string
    if (siteId) {
      // List drives for a specific SharePoint site
      drivesUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives`
    } else {
      // List all drives for the user
      drivesUrl = 'https://graph.microsoft.com/v1.0/me/drives'
    }

    const response = await fetch(drivesUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OneDrive API error: ${response.status} - ${errorText}`)
    }

    const drivesResult = await response.json()
    let drives = drivesResult.value || []

    // Filter by drive type if specified
    if (driveType !== 'all') {
      const driveTypeMap: Record<string, string> = {
        personal: 'personal',
        business: 'business',
        sharepoint: 'documentLibrary'
      }

      const filterType = driveTypeMap[driveType]
      if (filterType) {
        drives = drives.filter((drive: any) => drive.driveType === filterType)
      }
    }

    // Map drives to output format
    const mappedDrives = drives.map((drive: any) => ({
      id: drive.id,
      name: drive.name,
      driveType: drive.driveType,
      webUrl: drive.webUrl,
      owner: drive.owner?.user?.displayName || drive.owner?.user?.email,
      quota: {
        total: drive.quota?.total,
        used: drive.quota?.used,
        remaining: drive.quota?.remaining,
        state: drive.quota?.state
      }
    }))

    return {
      success: true,
      output: {
        drives: mappedDrives,
        totalCount: mappedDrives.length,
        items: mappedDrives
      },
      message: `Found ${mappedDrives.length} drive(s)`
    }
  } catch (error: any) {
    logger.error('OneDrive List Drives error:', error)
    return {
      success: false,
      output: {
        drives: [],
        totalCount: 0,
        items: []
      },
      message: error.message || 'Failed to list drives in OneDrive'
    }
  }
}
