/**
 * OneDrive Folders Handler
 */

import { OneDriveIntegration, OneDriveFolder, OneDriveDataHandler } from '../types'
import { validateOneDriveIntegration, validateOneDriveToken, makeOneDriveApiRequest, parseOneDriveApiResponse, buildOneDriveApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getOneDriveFolders: OneDriveDataHandler<OneDriveFolder> = async (integration: OneDriveIntegration, options: any = {}): Promise<OneDriveFolder[]> => {
  logger.debug("🔍 OneDrive folders fetcher called with integration:", {
    id: integration.id,
    provider: integration.provider,
    hasToken: !!integration.access_token,
    tokenLength: integration.access_token?.length
  })
  
  try {
    // Validate integration status
    validateOneDriveIntegration(integration)
    
    logger.debug(`🔍 Validating OneDrive token...`)
    const tokenResult = await validateOneDriveToken(integration)
    
    if (!tokenResult.success) {
      logger.debug(`❌ OneDrive token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }
    
    logger.debug('🔍 Testing OneDrive drive access...')

    // First, test if we can access the drive at all
    // Note: buildOneDriveApiUrl automatically adds /v1.0
    const driveApiUrl = buildOneDriveApiUrl('/me/drive')
    const driveResponse = await makeOneDriveApiRequest(driveApiUrl, tokenResult.token!)
    
    if (!driveResponse.ok) {
      const errorData = await driveResponse.json().catch(() => ({}))
      logger.error(`❌ OneDrive drive access failed: ${driveResponse.status}`, errorData)
      
      if (driveResponse.status === 401) {
        throw new Error('Microsoft authentication expired. Please reconnect your account.')
      } else if (driveResponse.status === 403) {
        throw new Error('OneDrive access forbidden. Check your permissions.')
      } else {
        throw new Error(`OneDrive API error: ${driveResponse.status} - ${errorData.error?.message || "Unknown error"}`)
      }
    }
    
    logger.debug('✅ OneDrive drive access successful')
    
    // Now fetch the root folder items, filtering for folders only
    logger.debug('🔍 Fetching OneDrive folders from root directory...')
    const foldersApiUrl = buildOneDriveApiUrl("/me/drive/root/children?$filter=folder ne null&$select=id,name,webUrl,size,createdDateTime,lastModifiedDateTime,folder,parentReference")
    
    const foldersResponse = await makeOneDriveApiRequest(foldersApiUrl, tokenResult.token!)
    
    const folders = await parseOneDriveApiResponse<OneDriveFolder>(foldersResponse)
    
    // Transform folders to expected format
    const transformedFolders = folders.map((folder: any) => ({
      value: folder.id,
      label: folder.name,
      id: folder.id,
      name: folder.name,
      webUrl: folder.webUrl,
      size: folder.size,
      createdDateTime: folder.createdDateTime,
      lastModifiedDateTime: folder.lastModifiedDateTime,
      folder: folder.folder,
      parentReference: folder.parentReference
    }))
    
    logger.debug(`✅ OneDrive folders fetched successfully: ${transformedFolders.length} folders`)
    return transformedFolders
    
  } catch (error: any) {
    logger.error("Error fetching OneDrive folders:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Microsoft authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Microsoft Graph API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching OneDrive folders")
  }
}