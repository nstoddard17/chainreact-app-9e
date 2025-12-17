/**
 * OneDrive Folders Handler
 * Fetches ALL folders recursively from the entire OneDrive
 */

import { OneDriveIntegration, OneDriveFolder, OneDriveDataHandler } from '../types'
import { validateOneDriveIntegration, validateOneDriveToken, makeOneDriveApiRequest, parseOneDriveApiResponse, buildOneDriveApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

/**
 * Recursively fetch all folders from a given parent folder
 */
async function fetchFoldersRecursively(
  token: string,
  parentId: string | null,
  parentPath: string,
  allFolders: any[],
  depth: number = 0,
  maxDepth: number = 10 // Prevent infinite recursion
): Promise<void> {
  if (depth >= maxDepth) {
    logger.debug(`[OneDrive] Max depth ${maxDepth} reached at path: ${parentPath}`)
    return
  }

  // Build the API URL based on whether we're at root or a subfolder
  const endpoint = parentId
    ? `/me/drive/items/${parentId}/children?$filter=folder ne null&$select=id,name,webUrl,size,createdDateTime,lastModifiedDateTime,folder,parentReference`
    : `/me/drive/root/children?$filter=folder ne null&$select=id,name,webUrl,size,createdDateTime,lastModifiedDateTime,folder,parentReference`

  const foldersApiUrl = buildOneDriveApiUrl(endpoint)
  const foldersResponse = await makeOneDriveApiRequest(foldersApiUrl, token)

  if (!foldersResponse.ok) {
    // Don't fail the whole operation if one folder fails - just log and continue
    logger.debug(`[OneDrive] Could not fetch children of folder ${parentId}: ${foldersResponse.status}`)
    return
  }

  const folders = await parseOneDriveApiResponse<OneDriveFolder>(foldersResponse)

  // Process each folder
  for (const folder of folders) {
    const folderPath = parentPath ? `${parentPath}/${folder.name}` : folder.name

    // Add to our collection with indented label showing hierarchy
    const indent = '  '.repeat(depth)
    const prefix = depth > 0 ? '└─ ' : ''

    allFolders.push({
      value: folder.id,
      label: `${indent}${prefix}${folder.name}`,
      id: folder.id,
      name: folder.name,
      path: folderPath,
      webUrl: folder.webUrl,
      size: folder.size,
      createdDateTime: folder.createdDateTime,
      lastModifiedDateTime: folder.lastModifiedDateTime,
      folder: folder.folder,
      parentReference: folder.parentReference
    })

    // If this folder has children, recursively fetch them
    if (folder.folder && folder.folder.childCount > 0) {
      await fetchFoldersRecursively(token, folder.id, folderPath, allFolders, depth + 1, maxDepth)
    }
  }
}

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

    // Fetch ALL folders recursively
    logger.debug('🔍 Fetching ALL OneDrive folders recursively...')
    const allFolders: any[] = []

    await fetchFoldersRecursively(tokenResult.token!, null, '', allFolders)

    // Add "Root folder" option at the beginning so users can explicitly select root
    const rootOption = {
      value: 'root',
      label: '📁 Root folder (My files)',
      id: 'root',
      name: 'Root folder',
      path: '/',
      webUrl: undefined,
      size: 0,
      createdDateTime: undefined,
      lastModifiedDateTime: undefined,
      folder: { childCount: allFolders.filter(f => !f.parentReference?.path?.includes('/')).length },
      parentReference: undefined
    }

    logger.debug(`✅ OneDrive folders fetched successfully: ${allFolders.length} folders + root`)
    return [rootOption, ...allFolders]

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