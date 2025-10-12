/**
 * Google Drive Handlers
 */

import { GoogleIntegration, GoogleDriveFolder, GoogleDriveFile, GoogleDataHandler } from '../types'
import { validateGoogleIntegration, makeGoogleApiRequest, getGoogleAccessToken } from '../utils'

import { logger } from '@/lib/utils/logger'

/**
 * Fetch Google Drive folders for the authenticated user
 */
export const getGoogleDriveFolders: GoogleDataHandler<GoogleDriveFolder> = async (integration: GoogleIntegration) => {
  try {
    logger.debug("📁 [Google Drive] Starting to fetch folders", {
      integrationId: integration.id,
      provider: integration.provider,
      status: integration.status,
      hasAccessToken: !!integration.access_token
    })
    
    validateGoogleIntegration(integration)
    logger.debug("📁 [Google Drive] Integration validated")

    const accessToken = getGoogleAccessToken(integration)
    logger.debug("📁 [Google Drive] Access token decrypted successfully")
    const response = await makeGoogleApiRequest(
      "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and trashed=false&pageSize=100&fields=files(id,name,parents,createdTime,modifiedTime,webViewLink,owners,shared)&orderBy=name",
      accessToken
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

    logger.debug(`✅ [Google Drive] Retrieved ${folders.length} folders`)
    return folders

  } catch (error: any) {
    logger.error("❌ [Google Drive] Error fetching folders:", error)
    throw error
  }
}

/**
 * Fetch Google Drive files for the authenticated user
 */
export const getGoogleDriveFiles: GoogleDataHandler<GoogleDriveFile> = async (integration: GoogleIntegration, options?: any) => {
  try {
    validateGoogleIntegration(integration)
    logger.debug("📄 [Google Drive] Fetching files")

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

    const accessToken = getGoogleAccessToken(integration)
    const response = await makeGoogleApiRequest(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&pageSize=100&fields=files(id,name,parents,createdTime,modifiedTime,mimeType,size,webViewLink,thumbnailLink,owners,shared)&orderBy=name`,
      accessToken
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

    logger.debug(`✅ [Google Drive] Retrieved ${files.length} files`)
    return files

  } catch (error: any) {
    logger.error("❌ [Google Drive] Error fetching files:", error)
    throw error
  }
}

/**
 * Fetch Google Docs documents for the authenticated user
 */
export const getGoogleDocsDocuments: GoogleDataHandler<GoogleDriveFile> = async (integration: GoogleIntegration, options?: any) => {
  try {
    validateGoogleIntegration(integration)
    logger.debug("📝 [Google Docs] Fetching documents")

    // Query specifically for Google Docs documents
    let query = "mimeType='application/vnd.google-apps.document' and trashed=false"
    const { folderId } = options || {}
    
    if (folderId) {
      query += ` and '${folderId}' in parents`
    }

    const accessToken = getGoogleAccessToken(integration)
    const response = await makeGoogleApiRequest(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&pageSize=100&fields=files(id,name,parents,createdTime,modifiedTime,mimeType,webViewLink,owners,shared)&orderBy=modifiedTime desc`,
      accessToken
    )

    const data = await response.json()
    
    const documents = (data.files || []).map((doc: any): GoogleDriveFile => ({
      id: doc.id,
      name: doc.name,
      value: doc.id,
      label: doc.name, // Add label for dropdown display
      parent_ids: doc.parents,
      created_time: doc.createdTime,
      modified_time: doc.modifiedTime,
      mime_type: doc.mimeType,
      web_view_link: doc.webViewLink,
      owners: doc.owners,
      shared: doc.shared
    }))

    logger.debug(`✅ [Google Docs] Retrieved ${documents.length} documents`)
    return documents

  } catch (error: any) {
    logger.error("❌ [Google Docs] Error fetching documents:", error)
    throw error
  }
}

/**
 * Fetch Google Docs document content/preview
 */
export const getGoogleDocsContent: GoogleDataHandler<any> = async (integration: GoogleIntegration, options?: any) => {
  try {
    validateGoogleIntegration(integration)
    const { documentId, previewOnly = true } = options || {}
    
    if (!documentId) {
      throw new Error("Document ID is required")
    }
    
    logger.debug("📄 [Google Docs] Fetching document content:", { documentId, previewOnly })

    const accessToken = getGoogleAccessToken(integration)
    
    // Use Google Docs API to get document content
    const response = await makeGoogleApiRequest(
      `https://docs.googleapis.com/v1/documents/${documentId}`,
      accessToken
    )

    const document = await response.json()
    
    // Extract text content from the document
    let textContent = ""
    if (document.body && document.body.content) {
      document.body.content.forEach((element: any) => {
        if (element.paragraph && element.paragraph.elements) {
          element.paragraph.elements.forEach((elem: any) => {
            if (elem.textRun && elem.textRun.content) {
              textContent += elem.textRun.content
            }
          })
        }
      })
    }
    
    // If preview only, return first 10 lines
    if (previewOnly) {
      const lines = textContent.split('\n')
      const preview = lines.slice(0, 10).join('\n')
      const hasMore = lines.length > 10
      
      return {
        preview: preview || "(Empty document)",
        lineCount: lines.length,
        hasMore,
        title: document.title
      }
    }
    
    return {
      content: textContent,
      title: document.title,
      documentId: document.documentId
    }

  } catch (error: any) {
    logger.error("❌ [Google Docs] Error fetching document content:", error)
    // Return a user-friendly error message
    if (error.message?.includes('404')) {
      return {
        preview: "(Document not found or you don't have access)",
        error: true
      }
    }
    return {
      preview: "(Unable to load document preview)",
      error: true
    }
  }
}