/**
 * Google Drive Handlers
 */

import { GoogleIntegration, GoogleDriveFolder, GoogleDriveFile, GoogleDataHandler } from '../types'
import { validateGoogleIntegration, makeGoogleApiRequest } from '../utils'

/**
 * Fetch Google Drive folders for the authenticated user
 */
export const getGoogleDriveFolders: GoogleDataHandler<GoogleDriveFolder> = async (integration: GoogleIntegration) => {
  try {
    validateGoogleIntegration(integration)
    console.log("📁 [Google Drive] Fetching folders")

    const response = await makeGoogleApiRequest(
      "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and trashed=false&pageSize=100&fields=files(id,name,parents,createdTime,modifiedTime,webViewLink,owners,shared)&orderBy=name",
      integration.access_token
    )

    const data = await response.json()
    
    const folders = (data.files || []).map((folder: any): GoogleDriveFolder => ({
      id: folder.id,
      name: folder.name,
      value: folder.id,
      parent_ids: folder.parents,
      created_time: folder.createdTime,
      modified_time: folder.modifiedTime,
      web_view_link: folder.webViewLink,
      owners: folder.owners,
      shared: folder.shared
    }))

    console.log(`✅ [Google Drive] Retrieved ${folders.length} folders`)
    return folders

  } catch (error: any) {
    console.error("❌ [Google Drive] Error fetching folders:", error)
    throw error
  }
}

/**
 * Fetch Google Drive files for the authenticated user
 */
export const getGoogleDriveFiles: GoogleDataHandler<GoogleDriveFile> = async (integration: GoogleIntegration, options?: any) => {
  try {
    validateGoogleIntegration(integration)
    console.log("📄 [Google Drive] Fetching files")

    // Build query based on options
    let query = "trashed=false"
    const { folderId, mimeType } = options || {}
    
    if (folderId) {
      query += ` and '${folderId}' in parents`
    }
    
    if (mimeType) {
      query += ` and mimeType='${mimeType}'`
    } else {
      // Exclude folders by default when fetching files
      query += " and mimeType != 'application/vnd.google-apps.folder'"
    }

    const response = await makeGoogleApiRequest(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&pageSize=100&fields=files(id,name,parents,createdTime,modifiedTime,mimeType,size,webViewLink,thumbnailLink,owners,shared)&orderBy=name`,
      integration.access_token
    )

    const data = await response.json()
    
    const files = (data.files || []).map((file: any): GoogleDriveFile => ({
      id: file.id,
      name: file.name,
      value: file.id,
      parent_ids: file.parents,
      created_time: file.createdTime,
      modified_time: file.modifiedTime,
      mime_type: file.mimeType,
      size: file.size,
      web_view_link: file.webViewLink,
      thumbnail_link: file.thumbnailLink,
      owners: file.owners,
      shared: file.shared
    }))

    console.log(`✅ [Google Drive] Retrieved ${files.length} files`)
    return files

  } catch (error: any) {
    console.error("❌ [Google Drive] Error fetching files:", error)
    throw error
  }
}