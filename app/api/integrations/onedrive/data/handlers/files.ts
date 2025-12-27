import { makeOneDriveApiRequest, buildOneDriveApiUrl, validateOneDriveIntegration } from '../utils'

import { logger } from '@/lib/utils/logger'
import type { OneDriveDataHandler, OneDriveFile } from '../types'

export const getOneDriveFiles: OneDriveDataHandler<OneDriveFile> = async (integration, options = {}) => {
  // Support multiple field names for folder ID - different actions use different names
  const { folderId, sourceFolderId } = options as { folderId?: string; sourceFolderId?: string }
  const effectiveFolderId = folderId || sourceFolderId

  try {
    validateOneDriveIntegration(integration)

    const accessToken = integration.access_token as string
    if (!accessToken) {
      throw new Error('Microsoft authentication required. Please reconnect your account.')
    }

    // Don't select specific fields - get everything to see what's available
    // Some folders might use different ID formats
    let baseEndpoint = ''

    // Handle different folder ID formats
    // 'root' is a special value meaning the root folder
    if (effectiveFolderId && effectiveFolderId !== 'root') {
      // If the folder ID contains an exclamation mark, it's likely a special format
      if (effectiveFolderId.includes('!')) {
        // Try using it directly
        baseEndpoint = `/me/drive/items/${effectiveFolderId}/children`
      } else {
        // Otherwise use standard format
        baseEndpoint = `/me/drive/items/${effectiveFolderId}/children`
      }
    } else {
      // No folder selected or 'root' selected - load from root
      baseEndpoint = '/me/drive/root/children'
    }

    // Build URL without field selection to get all data
    // Note: buildOneDriveApiUrl automatically adds /v1.0 if not present
    const url = buildOneDriveApiUrl(`${baseEndpoint}?$top=200`)

    logger.debug('🔍 [OneDrive] Fetching files from:', {
      baseEndpoint,
      folderId: effectiveFolderId,
      fullUrl: url
    })

    const response = await makeOneDriveApiRequest(url, accessToken)

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('❌ [OneDrive] API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      })
      throw new Error(`OneDrive API error: ${response.status} ${response.statusText}`)
    }

    const payload = await response.json()

    logger.debug('📦 [OneDrive] Raw API response:', {
      totalItems: payload?.value?.length || 0,
      hasValue: !!payload?.value,
      firstFewItems: payload?.value?.slice(0, 3)?.map((item: any) => ({
        name: item.name,
        hasFile: Boolean(item.file),
        hasFolder: Boolean(item.folder),
        mimeType: item.file?.mimeType,
        size: item.size
      }))
    })

    // Filter to only get files (not folders)
    // In OneDrive, items with a 'file' property are regular files
    // Items with 'package' property are special packages like OneNote notebooks
    // Items with 'folder' property are folders - exclude these
    const files = (payload?.value ?? []).filter((item: any) => {
      // Include items that have 'file' property OR 'package' property (for OneNote etc.)
      // Exclude items that have 'folder' property
      const isFile = (item.file !== undefined || item.package !== undefined) && item.folder === undefined
      if (!isFile && item.name) {
        logger.debug(`⏭️ Skipping non-file item: ${item.name} (folder: ${!!item.folder}, package: ${!!item.package})`)
      }
      return isFile
    })

    logger.debug('✅ [OneDrive] Filtered files:', {
      totalFiles: files.length,
      fileNames: files.map((f: any) => f.name)
    })

    return files.map((file: any) => ({
      id: file.id,
      name: file.name,
      webUrl: file.webUrl,
      createdDateTime: file.createdDateTime,
      lastModifiedDateTime: file.lastModifiedDateTime,
      size: file.size,
      parentReference: file.parentReference,
      file: file.file,
      package: file.package, // For OneNote notebooks and other packages
    }))
  } catch (error: any) {
    logger.error('❌ [OneDrive] Failed to load files', { folderId: effectiveFolderId, error: error?.message || error })
    throw new Error(error?.message || 'Failed to load OneDrive files')
  }
}
