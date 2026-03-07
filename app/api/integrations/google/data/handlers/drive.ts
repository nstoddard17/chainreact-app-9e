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
    logger.info("📁 [Google Drive] Starting to fetch folders", {
      integrationId: integration.id,
      provider: integration.provider,
      status: integration.status,
      hasAccessToken: !!integration.access_token
    })

    logger.info("📁 [Google Drive] Validating integration...")
    validateGoogleIntegration(integration)
    logger.info("📁 [Google Drive] Integration validated successfully")

    logger.info("📁 [Google Drive] Decrypting access token...")
    const accessToken = getGoogleAccessToken(integration)
    logger.info("📁 [Google Drive] Access token decrypted successfully")

    logger.info("📁 [Google Drive] Making API request to Google Drive...")
    const response = await makeGoogleApiRequest(
      "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and trashed=false&pageSize=100&fields=files(id,name,parents,createdTime,modifiedTime,webViewLink,owners,shared)&orderBy=name",
      accessToken
    )

    logger.info("📁 [Google Drive] Parsing response...")
    const data = await response.json()

    logger.info("📁 [Google Drive] Mapping folders...", {
      filesCount: data.files?.length || 0
    })

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

    logger.info(`✅ [Google Drive] Retrieved ${folders.length} folders`)
    return folders

  } catch (error: any) {
    logger.error("❌ [Google Drive] Error fetching folders:", {
      error: error?.message || String(error),
      errorName: error?.name,
      errorStatus: error?.status,
      stack: error?.stack,
      errorObject: error
    })
    throw error
  }
}

/**
 * Fetch Google Drive files for the authenticated user
 */
export const getGoogleDriveFiles: GoogleDataHandler<GoogleDriveFile> = async (integration: GoogleIntegration, options?: any) => {
  try {
    validateGoogleIntegration(integration)
    logger.info("📄 [Google Drive] Fetching files")

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

    logger.info(`✅ [Google Drive] Retrieved ${files.length} files`)
    return files

  } catch (error: any) {
    logger.error("❌ [Google Drive] Error fetching files:", error)
    throw error
  }
}

/**
 * Fetch Google Drive files AND folders combined (with group labels)
 * Used by move_file and delete_file actions
 */
export const getGoogleDriveFilesAndFolders: GoogleDataHandler = async (integration: GoogleIntegration, options?: any) => {
  try {
    validateGoogleIntegration(integration)
    logger.info("📁📄 [Google Drive] Fetching files and folders")

    const accessToken = getGoogleAccessToken(integration)

    // Fetch folders and files in parallel
    const [foldersResponse, filesResponse] = await Promise.all([
      makeGoogleApiRequest(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("mimeType='application/vnd.google-apps.folder' and trashed=false")}&pageSize=200&fields=files(id,name,parents,modifiedTime)&orderBy=name`,
        accessToken
      ),
      makeGoogleApiRequest(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("mimeType!='application/vnd.google-apps.folder' and trashed=false")}&pageSize=200&fields=files(id,name,mimeType,parents,modifiedTime)&orderBy=name`,
        accessToken
      )
    ])

    const foldersData = await foldersResponse.json()
    const filesData = await filesResponse.json()
    const rawFolders = foldersData.files || []
    const rawFiles = filesData.files || []

    // Build folder hierarchy for path display
    const folderMap = new Map<string, any>()
    rawFolders.forEach((folder: any) => {
      folderMap.set(folder.id, { id: folder.id, name: folder.name, parents: folder.parents })
    })

    const getFolderPath = (folderId: string, visited = new Set<string>()): string => {
      if (visited.has(folderId)) return ''
      visited.add(folderId)
      const folder = folderMap.get(folderId)
      if (!folder) return ''
      if (!folder.parents || folder.parents.length === 0) return folder.name
      const parentPath = getFolderPath(folder.parents[0], visited)
      return parentPath ? `${parentPath} / ${folder.name}` : folder.name
    }

    const folders = rawFolders.map((folder: any) => ({
      value: folder.id,
      label: getFolderPath(folder.id),
      id: folder.id,
      name: folder.name,
      group: '📁 Folders',
      modifiedTime: folder.modifiedTime
    }))

    const files = rawFiles.map((file: any) => ({
      value: file.id,
      label: file.name,
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      group: '📄 Files',
      modifiedTime: file.modifiedTime
    }))

    const combined = [...folders, ...files]
    logger.info(`✅ [Google Drive] Retrieved ${folders.length} folders and ${files.length} files`)
    return combined

  } catch (error: any) {
    logger.error("❌ [Google Drive] Error fetching files and folders:", error)
    throw error
  }
}

/**
 * Search Google Drive files with preview
 * Used by search_files action
 */
export const getGoogleDriveSearchPreview: GoogleDataHandler = async (integration: GoogleIntegration, options?: any) => {
  try {
    validateGoogleIntegration(integration)
    logger.info("🔍 [Google Drive] Running search preview")

    const accessToken = getGoogleAccessToken(integration)
    const searchConfig = options?.searchConfig || {}
    const searchMode = searchConfig.searchMode || 'simple'
    let queryParts: string[] = ['trashed=false']

    if (searchConfig.folderId) {
      queryParts.push(`'${searchConfig.folderId}' in parents`)
    }

    if (searchMode === 'simple') {
      const fileName = searchConfig.fileName
      const exactMatch = searchConfig.exactMatch || false
      if (fileName) {
        const escaped = fileName.replace(/'/g, "\\'")
        queryParts.push(exactMatch ? `name = '${escaped}'` : `name contains '${escaped}'`)
      }
    } else if (searchMode === 'advanced') {
      if (searchConfig.fileName) {
        queryParts.push(`name contains '${searchConfig.fileName.replace(/'/g, "\\'")}'`)
      }
      if (searchConfig.fileType && searchConfig.fileType !== 'any') {
        if (searchConfig.fileType.endsWith('/*')) {
          queryParts.push(`mimeType contains '${searchConfig.fileType.replace('/*', '')}'`)
        } else {
          queryParts.push(`mimeType='${searchConfig.fileType}'`)
        }
      }
      if (searchConfig.modifiedTime && searchConfig.modifiedTime !== 'any') {
        const now = new Date()
        let startDate: Date
        switch (searchConfig.modifiedTime) {
          case 'today': startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break
          case 'week': startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break
          case 'month': startDate = new Date(now.getFullYear(), now.getMonth(), 1); break
          case 'year': startDate = new Date(now.getFullYear(), 0, 1); break
          default: startDate = new Date(0)
        }
        queryParts.push(`modifiedDate >= '${startDate.toISOString()}'`)
      }
      if (searchConfig.owner && searchConfig.owner !== 'any') {
        if (searchConfig.owner === 'me') queryParts.push(`'me' in owners`)
        else if (searchConfig.owner === 'shared') queryParts.push(`sharedWithMe=true`)
      }
    } else if (searchMode === 'query') {
      if (searchConfig.customQuery) {
        queryParts = [searchConfig.customQuery, 'trashed=false']
      }
    }

    const previewLimit = Math.min(searchConfig.previewLimit || 10, 100)
    const query = queryParts.join(' and ')

    const response = await makeGoogleApiRequest(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,createdTime,size,owners,webViewLink)&pageSize=${previewLimit}&orderBy=modifiedTime desc`,
      accessToken
    )
    const data = await response.json()
    const files = (data.files || []).map((file: any) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime,
      createdTime: file.createdTime,
      size: file.size,
      owner: file.owners?.[0]?.displayName || file.owners?.[0]?.emailAddress || 'Unknown',
      webViewLink: file.webViewLink
    }))

    // Get total count
    const countResponse = await makeGoogleApiRequest(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=100`,
      accessToken
    )
    const countData = await countResponse.json()
    const totalCount = countData.files?.length || 0
    const hasMore = totalCount >= 100

    // Build preview text
    let previewText = ''
    if (totalCount === 0) {
      previewText = 'No files found matching your search criteria.\n\nTry adjusting your search terms or using partial matches instead of exact match.'
    } else {
      const searchSummary: string[] = []
      if (searchConfig.fileName) searchSummary.push(`Name: "${searchConfig.fileName}"${searchConfig.exactMatch ? ' (exact)' : ' (contains)'}`)
      if (searchConfig.fileType && searchConfig.fileType !== 'any') searchSummary.push(`Type: ${searchConfig.fileType}`)
      if (searchConfig.modifiedTime && searchConfig.modifiedTime !== 'any') searchSummary.push(`Modified: ${searchConfig.modifiedTime}`)
      if (searchConfig.owner && searchConfig.owner !== 'any') searchSummary.push(`Owner: ${searchConfig.owner}`)
      const summary = searchSummary.length > 0 ? `Search criteria: ${searchSummary.join(', ')}\n\n` : ''
      previewText = `${summary}Found ${totalCount}${hasMore ? '+' : ''} file${totalCount === 1 ? '' : 's'}:\n\n${files.map((f: any, i: number) => `${i + 1}. ${f.name}`).join('\n')}${hasMore ? '\n\n...and more' : ''}`
    }

    logger.info(`✅ [Google Drive] Search preview found ${totalCount}${hasMore ? '+' : ''} files`)
    return { files, totalCount, hasMore, previewText } as any

  } catch (error: any) {
    logger.error("❌ [Google Drive] Error in search preview:", error)
    throw error
  }
}

/**
 * List Google Drive files with preview
 * Used by list_files action
 */
export const getGoogleDriveListFilesPreview: GoogleDataHandler = async (integration: GoogleIntegration, options?: any) => {
  try {
    validateGoogleIntegration(integration)
    logger.info("📋 [Google Drive] Running list files preview")

    const accessToken = getGoogleAccessToken(integration)
    const listConfig = options || {}
    const queryParts: string[] = ['trashed=false']

    if (listConfig.folderId) {
      queryParts.push(`'${listConfig.folderId}' in parents`)
    }

    if (listConfig.fileTypeFilter) {
      switch (listConfig.fileTypeFilter) {
        case 'files_only': queryParts.push("mimeType != 'application/vnd.google-apps.folder'"); break
        case 'folders_only': queryParts.push("mimeType = 'application/vnd.google-apps.folder'"); break
        case 'documents': queryParts.push("(mimeType contains 'document' or mimeType contains 'pdf')"); break
        case 'images': queryParts.push("mimeType contains 'image/'"); break
        case 'videos': queryParts.push("mimeType contains 'video/'"); break
      }
    }

    let orderBy = 'name'
    if (listConfig.orderBy) {
      switch (listConfig.orderBy) {
        case 'name': orderBy = 'name'; break
        case 'name_desc': orderBy = 'name desc'; break
        case 'modifiedTime': orderBy = 'modifiedTime desc'; break
        case 'modifiedTime_desc': orderBy = 'modifiedTime'; break
        case 'createdTime': orderBy = 'createdTime desc'; break
        case 'folder': orderBy = 'folder,name'; break
        default: orderBy = 'name'
      }
    }

    const previewLimit = Math.min(listConfig.previewLimit || 10, 100)
    const query = queryParts.join(' and ')

    const response = await makeGoogleApiRequest(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,createdTime,size,owners,webViewLink)&pageSize=${previewLimit}&orderBy=${encodeURIComponent(orderBy)}`,
      accessToken
    )
    const data = await response.json()
    const files = (data.files || []).map((file: any) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime,
      createdTime: file.createdTime,
      size: file.size,
      owner: file.owners?.[0]?.displayName || file.owners?.[0]?.emailAddress || 'Unknown',
      webViewLink: file.webViewLink
    }))

    // Get total count
    const countResponse = await makeGoogleApiRequest(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=100`,
      accessToken
    )
    const countData = await countResponse.json()
    const totalCount = countData.files?.length || 0
    const hasMore = totalCount >= 100

    // Build preview text
    let previewText = ''
    if (totalCount === 0) {
      previewText = 'No files found in this folder.\n\nThe folder may be empty or your filters may be too restrictive.'
    } else {
      const filterSummary: string[] = []
      if (listConfig.fileTypeFilter && listConfig.fileTypeFilter !== 'all') {
        filterSummary.push(`Filter: ${listConfig.fileTypeFilter}`)
      }
      const summary = filterSummary.length > 0 ? `${filterSummary.join(', ')}\n\n` : ''
      previewText = `${summary}Found ${totalCount}${hasMore ? '+' : ''} item${totalCount === 1 ? '' : 's'}:\n\n${files.map((f: any, i: number) => `${i + 1}. ${f.name}`).join('\n')}${hasMore ? '\n\n...and more' : ''}`
    }

    logger.info(`✅ [Google Drive] List preview found ${totalCount}${hasMore ? '+' : ''} files`)
    return { files, totalCount, hasMore, previewText } as any

  } catch (error: any) {
    logger.error("❌ [Google Drive] Error in list files preview:", error)
    throw error
  }
}

/**
 * Fetch Google Docs documents for the authenticated user
 */
export const getGoogleDocsDocuments: GoogleDataHandler<GoogleDriveFile> = async (integration: GoogleIntegration, options?: any) => {
  try {
    validateGoogleIntegration(integration)
    logger.info("📝 [Google Docs] Fetching documents")

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

    logger.info(`✅ [Google Docs] Retrieved ${documents.length} documents`)
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
    
    logger.info("📄 [Google Docs] Fetching document content:", { documentId, previewOnly })

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