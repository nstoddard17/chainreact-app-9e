import { makeOneDriveApiRequest, buildOneDriveApiUrl, validateOneDriveIntegration } from '../utils'
import type { OneDriveDataHandler, OneDriveFile } from '../types'

export const getOneDriveFiles: OneDriveDataHandler<OneDriveFile> = async (integration, options = {}) => {
  const { folderId } = options as { folderId?: string }

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
    if (folderId) {
      // If the folder ID contains an exclamation mark, it's likely a special format
      if (folderId.includes('!')) {
        // Try using it directly
        baseEndpoint = `/me/drive/items/${folderId}/children`
      } else {
        // Otherwise use standard format
        baseEndpoint = `/me/drive/items/${folderId}/children`
      }
    } else {
      baseEndpoint = '/me/drive/root/children'
    }

    // Build URL without field selection to get all data
    // Note: buildOneDriveApiUrl automatically adds /v1.0 if not present
    const url = buildOneDriveApiUrl(`${baseEndpoint}?$top=200`)

    console.log('🔍 [OneDrive] Fetching files from:', {
      baseEndpoint,
      folderId,
      fullUrl: url
    })

    const response = await makeOneDriveApiRequest(url, accessToken)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ [OneDrive] API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      })
      throw new Error(`OneDrive API error: ${response.status} ${response.statusText}`)
    }

    const payload = await response.json()

    console.log('📦 [OneDrive] Raw API response:', {
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
    // In OneDrive, items with a 'file' property are files, items with 'folder' property are folders
    const files = (payload?.value ?? []).filter((item: any) => {
      const isFile = item.file !== undefined && item.folder === undefined
      if (!isFile && item.name) {
        console.log(`⏭️ Skipping non-file item: ${item.name} (folder: ${!!item.folder})`)
      }
      return isFile
    })

    console.log('✅ [OneDrive] Filtered files:', {
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
    }))
  } catch (error: any) {
    console.error('❌ [OneDrive] Failed to load files', { folderId, error: error?.message || error })
    throw new Error(error?.message || 'Failed to load OneDrive files')
  }
}
