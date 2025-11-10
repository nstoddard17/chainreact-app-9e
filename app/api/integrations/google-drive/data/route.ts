import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { decrypt } from '@/lib/security/encryption'

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Get user from session
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('Unauthorized' , 401)
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return errorResponse('Unauthorized' , 401)
    }

    // Get the data type and optional parameters
    const searchParams = req.nextUrl.searchParams
    const type = searchParams.get('type')
    const folderId = searchParams.get('folderId')

    // Get Google Drive integration (or Google Docs which includes Drive scopes)
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .in('provider', ['google-drive', 'google-docs'])
      .limit(1)
      .maybeSingle()

    if (integrationError || !integration) {
      return errorResponse('Google Drive or Google Docs not connected' , 400)
    }

    // Decrypt access token
    const accessToken = decrypt(integration.access_token)
    
    // Initialize Google Drive API
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    switch (type) {
      case 'folders':
        // Fetch all folders
        const foldersResponse = await drive.files.list({
          q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
          fields: 'files(id, name, parents)',
          pageSize: 100,
          orderBy: 'name'
        })

        const folders = foldersResponse.data.files || []
        return jsonResponse(folders.map(folder => ({
          id: folder.id,
          name: folder.name,
          parents: folder.parents
        })))

      case 'files':
        // Fetch files, optionally filtered by folder
        let query = "trashed=false and mimeType!='application/vnd.google-apps.folder'"
        if (folderId) {
          query = `'${folderId}' in parents and ${query}`
        }

        logger.debug('[Google Drive API] Fetching files with query:', query)

        const filesResponse = await drive.files.list({
          q: query,
          fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink, webContentLink, parents)',
          pageSize: 1000, // Increase page size to get more files
          orderBy: 'name'
        })

        logger.debug('[Google Drive API] Found files:', filesResponse.data.files?.length || 0)

        const files = filesResponse.data.files || []
        return jsonResponse(files.map(file => ({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          size: file.size,
          modifiedTime: file.modifiedTime,
          webViewLink: file.webViewLink,
          webContentLink: file.webContentLink
        })))

      default:
        return errorResponse('Invalid data type' , 400)
    }
  } catch (error: any) {
    logger.error('Error fetching Google Drive data:', error)
    return errorResponse(error.message || 'Failed to fetch data' , 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const body = await req.json()
    const { integrationId, dataType, options = {} } = body

    logger.debug('[Google Drive API] POST request received:', {
      integrationId,
      dataType,
      hasOptions: !!options,
      optionsKeys: Object.keys(options)
    })

    // Handle both patterns - with integrationId or with fileId
    if (integrationId && dataType) {
      // New pattern matching Notion endpoint
      const { data: integration, error: integrationError } = await supabase
        .from('integrations')
        .select('*')
        .eq('id', integrationId)
        .in('provider', ['google-drive', 'google-docs'])
        .maybeSingle()

      if (integrationError || !integration) {
        return errorResponse('Google Drive or Google Docs not connected' , 400)
      }

      // Decrypt access token
      const encryptionKey = process.env.ENCRYPTION_KEY!
      const accessToken = decrypt(integration.access_token, encryptionKey)
      
      // Initialize Google Drive API
      const oauth2Client = new google.auth.OAuth2()
      oauth2Client.setCredentials({ access_token: accessToken })
      const drive = google.drive({ version: 'v3', auth: oauth2Client })

      // Handle different data types
      if (dataType === 'files' || dataType === 'google-drive-files') {
        const query = [`trashed = false`]

        // If folderId is provided, filter by parent folder
        if (options.folderId) {
          query.push(`'${options.folderId}' in parents`)
        }

        // Filter out folders unless specifically requested
        if (!options.includeFolders) {
          query.push(`mimeType != 'application/vnd.google-apps.folder'`)
        }

        if (options.mimeType) {
          const mimeTypes = options.mimeType.split(',')
          const mimeQuery = mimeTypes.map((m: string) => `mimeType='${m.trim()}'`).join(' or ')
          query.push(`(${mimeQuery})`)
        }

        const response = await drive.files.list({
          q: query.join(' and '),
          fields: 'files(id,name,mimeType,webViewLink,iconLink,thumbnailLink,modifiedTime,parents)',
          pageSize: options.maxResults || 100,
          orderBy: 'modifiedTime desc'
        })

        // Format the response for dropdown compatibility
        const files = (response.data.files || []).map(file => ({
          value: file.id,
          label: file.name,
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          webViewLink: file.webViewLink,
          modifiedTime: file.modifiedTime
        }))

        logger.debug(`[Google Drive API] Successfully fetched ${files.length} files`)

        return jsonResponse({
          data: files,
          success: true
        })
      }

      if (dataType === 'folders' || dataType === 'google-drive-folders') {
        const response = await drive.files.list({
          q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
          fields: 'files(id,name,parents,modifiedTime)',
          pageSize: options.maxResults || 100,
          orderBy: 'name'
        })

        // Format the response for dropdown compatibility
        const folders = (response.data.files || []).map(folder => ({
          value: folder.id,
          label: folder.name,
          id: folder.id,
          name: folder.name,
          parents: folder.parents,
          modifiedTime: folder.modifiedTime
        }))

        logger.debug(`[Google Drive API] Successfully fetched ${folders.length} folders`)

        return jsonResponse({
          data: folders,
          success: true
        })
      }

      if (dataType === 'files-and-folders' || dataType === 'google-drive-files-and-folders') {
        // Fetch both folders and files in parallel
        const [foldersResponse, filesResponse] = await Promise.all([
          drive.files.list({
            q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
            fields: 'files(id,name,parents,modifiedTime)',
            pageSize: 200,
            orderBy: 'name'
          }),
          drive.files.list({
            q: "mimeType!='application/vnd.google-apps.folder' and trashed=false",
            fields: 'files(id,name,mimeType,parents,modifiedTime)',
            pageSize: 200,
            orderBy: 'name'
          })
        ])

        // Build folder hierarchy to show parent paths
        const folderMap = new Map()
        const rawFolders = foldersResponse.data.files || []

        // First pass: create map of all folders
        rawFolders.forEach(folder => {
          folderMap.set(folder.id, {
            id: folder.id,
            name: folder.name,
            parents: folder.parents
          })
        })

        // Second pass: build full paths for folders
        const getFolderPath = (folderId: string, visited = new Set()): string => {
          if (visited.has(folderId)) return '' // Prevent infinite loops
          visited.add(folderId)

          const folder = folderMap.get(folderId)
          if (!folder) return ''

          if (!folder.parents || folder.parents.length === 0) {
            // Root level folder
            return folder.name
          }

          // Get parent path
          const parentPath = getFolderPath(folder.parents[0], visited)
          return parentPath ? `${parentPath} / ${folder.name}` : folder.name
        }

        // Format folders with hierarchy
        const folders = rawFolders.map(folder => ({
          value: folder.id,
          label: getFolderPath(folder.id!),
          id: folder.id,
          name: folder.name,
          group: '📁 Folders',
          modifiedTime: folder.modifiedTime
        }))

        // Format files
        const files = (filesResponse.data.files || []).map(file => ({
          value: file.id,
          label: file.name,
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          group: '📄 Files',
          modifiedTime: file.modifiedTime
        }))

        // Combine folders first, then files (groups will be rendered in order they appear)
        const combined = [...folders, ...files]

        logger.debug(`[Google Drive API] Successfully fetched ${folders.length} folders and ${files.length} files`)

        return jsonResponse({
          data: combined,
          success: true
        })
      }

      if (dataType === 'search-preview') {
        // Build search query based on search configuration
        const searchConfig = options.searchConfig || {}
        const searchMode = searchConfig.searchMode || 'simple'
        let query: string[] = ['trashed=false']

        // Add folder filter if specified
        if (searchConfig.folderId) {
          query.push(`'${searchConfig.folderId}' in parents`)
        }

        if (searchMode === 'simple') {
          const fileName = searchConfig.fileName
          const exactMatch = searchConfig.exactMatch || false
          if (fileName) {
            if (exactMatch) {
              query.push(`name = '${fileName.replace(/'/g, "\\'")}'`)
            } else {
              query.push(`name contains '${fileName.replace(/'/g, "\\'")}'`)
            }
          }
        } else if (searchMode === 'advanced') {
          const fileName = searchConfig.fileName
          if (fileName) {
            query.push(`name contains '${fileName.replace(/'/g, "\\'")}'`)
          }

          const fileType = searchConfig.fileType
          if (fileType && fileType !== 'any') {
            if (fileType.endsWith('/*')) {
              // Handle wildcards like image/*, video/*
              const baseType = fileType.replace('/*', '')
              query.push(`mimeType contains '${baseType}'`)
            } else {
              query.push(`mimeType='${fileType}'`)
            }
          }

          const modifiedTime = searchConfig.modifiedTime
          if (modifiedTime && modifiedTime !== 'any') {
            const now = new Date()
            let startDate: Date
            switch (modifiedTime) {
              case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
                break
              case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
                break
              case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1)
                break
              case 'year':
                startDate = new Date(now.getFullYear(), 0, 1)
                break
              default:
                startDate = new Date(0)
            }
            query.push(`modifiedDate >= '${startDate.toISOString()}'`)
          }

          const owner = searchConfig.owner
          if (owner && owner !== 'any') {
            if (owner === 'me') {
              query.push(`'me' in owners`)
            } else if (owner === 'shared') {
              query.push(`sharedWithMe=true`)
            }
          }
        } else if (searchMode === 'query') {
          const customQuery = searchConfig.customQuery
          if (customQuery) {
            query = [customQuery, 'trashed=false']
          }
        }

        // Get preview limit from config (default 10, max 100)
        const previewLimit = Math.min(searchConfig.previewLimit || 10, 100)

        // Execute search with configurable limit for preview
        const response = await drive.files.list({
          q: query.join(' and '),
          fields: 'files(id,name,mimeType,modifiedTime,createdTime,size,owners,webViewLink)',
          pageSize: previewLimit,
          orderBy: 'modifiedTime desc'
        })

        const files = response.data.files || []
        const fileList = files.map(file => ({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          modifiedTime: file.modifiedTime,
          createdTime: file.createdTime,
          size: file.size,
          owner: file.owners?.[0]?.displayName || file.owners?.[0]?.emailAddress || 'Unknown',
          webViewLink: file.webViewLink
        }))

        // Get total count (limited to 100 to avoid performance issues)
        const countResponse = await drive.files.list({
          q: query.join(' and '),
          fields: 'files(id)',
          pageSize: 100
        })

        const totalCount = countResponse.data.files?.length || 0
        const hasMore = totalCount >= 100

        logger.debug(`[Google Drive API] Search preview found ${totalCount}${hasMore ? '+' : ''} files`)

        // Build detailed preview text
        let previewText = ''
        if (totalCount === 0) {
          previewText = 'No files found matching your search criteria.\n\nTry adjusting your search terms or using partial matches instead of exact match.'
        } else {
          const searchSummary = []
          if (searchConfig.fileName) {
            searchSummary.push(`Name: "${searchConfig.fileName}"${searchConfig.exactMatch ? ' (exact)' : ' (contains)'}`)
          }
          if (searchConfig.fileType && searchConfig.fileType !== 'any') {
            searchSummary.push(`Type: ${searchConfig.fileType}`)
          }
          if (searchConfig.modifiedTime && searchConfig.modifiedTime !== 'any') {
            searchSummary.push(`Modified: ${searchConfig.modifiedTime}`)
          }
          if (searchConfig.owner && searchConfig.owner !== 'any') {
            searchSummary.push(`Owner: ${searchConfig.owner}`)
          }

          const summary = searchSummary.length > 0 ? `Search criteria: ${searchSummary.join(', ')}\n\n` : ''

          previewText = `${summary}Found ${totalCount}${hasMore ? '+' : ''} file${totalCount === 1 ? '' : 's'}:\n\n${fileList.map((f, i) => `${i + 1}. ${f.name}`).join('\n')}${hasMore ? '\n\n...and more' : ''}`
        }

        return jsonResponse({
          data: {
            files: fileList,
            totalCount,
            hasMore,
            previewText
          },
          success: true
        })
      }

      // List files preview handler
      if (dataType === 'list-files-preview') {
        const listConfig = options as any

        // Build query
        const query: string[] = ['trashed=false']

        // Folder filter
        if (listConfig.folderId) {
          query.push(`'${listConfig.folderId}' in parents`)
        }

        // File type filter
        if (listConfig.fileTypeFilter) {
          switch (listConfig.fileTypeFilter) {
            case 'files_only':
              query.push("mimeType != 'application/vnd.google-apps.folder'")
              break
            case 'folders_only':
              query.push("mimeType = 'application/vnd.google-apps.folder'")
              break
            case 'documents':
              query.push("(mimeType contains 'document' or mimeType contains 'pdf')")
              break
            case 'images':
              query.push("mimeType contains 'image/'")
              break
            case 'videos':
              query.push("mimeType contains 'video/'")
              break
            // 'all' - no filter
          }
        }

        // Determine orderBy
        let orderBy = 'name'
        if (listConfig.orderBy) {
          switch (listConfig.orderBy) {
            case 'name':
              orderBy = 'name'
              break
            case 'name_desc':
              orderBy = 'name desc'
              break
            case 'modifiedTime':
              orderBy = 'modifiedTime desc'
              break
            case 'modifiedTime_desc':
              orderBy = 'modifiedTime'
              break
            case 'createdTime':
              orderBy = 'createdTime desc'
              break
            case 'folder':
              orderBy = 'folder,name'
              break
            default:
              orderBy = 'name'
          }
        }

        logger.debug(`[Google Drive API] List files preview query: ${query.join(' and ')}`)

        // Get preview limit from config (default 10, max 100)
        const previewLimit = Math.min(listConfig.previewLimit || 10, 100)

        // Execute list with configurable limit for preview
        const response = await drive.files.list({
          q: query.join(' and '),
          fields: 'files(id,name,mimeType,modifiedTime,createdTime,size,owners,webViewLink)',
          pageSize: previewLimit,
          orderBy
        })

        const files = response.data.files || []
        const fileList = files.map(file => ({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          modifiedTime: file.modifiedTime,
          createdTime: file.createdTime,
          size: file.size,
          owner: file.owners?.[0]?.displayName || file.owners?.[0]?.emailAddress || 'Unknown',
          webViewLink: file.webViewLink
        }))

        // Get total count (limited to 100 to avoid performance issues)
        const countResponse = await drive.files.list({
          q: query.join(' and '),
          fields: 'files(id)',
          pageSize: 100
        })

        const totalCount = countResponse.data.files?.length || 0
        const hasMore = totalCount >= 100

        logger.debug(`[Google Drive API] List preview found ${totalCount}${hasMore ? '+' : ''} files`)

        // Build preview text
        let previewText = ''
        if (totalCount === 0) {
          previewText = 'No files found in this folder.\n\nThe folder may be empty or your filters may be too restrictive.'
        } else {
          const filterSummary = []
          if (listConfig.fileTypeFilter && listConfig.fileTypeFilter !== 'all') {
            filterSummary.push(`Filter: ${listConfig.fileTypeFilter}`)
          }

          const summary = filterSummary.length > 0 ? `${filterSummary.join(', ')}\n\n` : ''

          previewText = `${summary}Found ${totalCount}${hasMore ? '+' : ''} item${totalCount === 1 ? '' : 's'}:\n\n${fileList.map((f, i) => `${i + 1}. ${f.name}`).join('\n')}${hasMore ? '\n\n...and more' : ''}`
        }

        return jsonResponse({
          data: {
            files: fileList,
            totalCount,
            hasMore,
            previewText
          },
          success: true
        })
      }

      return errorResponse('Unsupported data type' , 400)
    }

    // Legacy pattern with fileId (kept for backward compatibility)
    const { fileId } = body
    if (!fileId) {
      return errorResponse('File ID or integration ID is required' , 400)
    }

    // Get user from session for legacy pattern
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('Unauthorized' , 401)
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return errorResponse('Unauthorized' , 401)
    }

    // Get Google Drive integration (or Google Docs which includes Drive scopes)
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .in('provider', ['google-drive', 'google-docs'])
      .limit(1)
      .maybeSingle()

    if (integrationError || !integration) {
      return errorResponse('Google Drive or Google Docs not connected' , 400)
    }

    // Decrypt access token
    const accessToken = decrypt(integration.access_token)
    
    // Initialize Google Drive API
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    // Get file metadata
    const fileResponse = await drive.files.get({
      fileId: fileId,
      fields: 'id, name, mimeType, size, modifiedTime, createdTime'
    })

    const file = fileResponse.data

    // For text files, try to get a preview
    let preview = 'File preview not available for this type'
    
    const textMimeTypes = [
      'text/plain',
      'text/html',
      'text/css',
      'text/javascript',
      'application/json',
      'application/xml',
      'text/xml',
      'text/csv',
      'application/x-sh',
      'text/markdown'
    ]

    const googleDocsMimeTypes = [
      'application/vnd.google-apps.document',
      'application/vnd.google-apps.spreadsheet',
      'application/vnd.google-apps.presentation'
    ]

    if (textMimeTypes.includes(file.mimeType || '') || file.mimeType?.startsWith('text/')) {
      // Download text file content for preview
      try {
        const contentResponse = await drive.files.get({
          fileId: fileId,
          alt: 'media'
        }, { responseType: 'text' })

        const content = contentResponse.data as string
        // Limit preview to first 1000 characters
        preview = content.substring(0, 1000)
        if (content.length > 1000) {
          preview += '\n\n... (truncated)'
        }
      } catch (error) {
        logger.error('Error fetching file content:', error)
        preview = 'Unable to load file preview'
      }
    } else if (googleDocsMimeTypes.includes(file.mimeType || '')) {
      // For Google Docs files, export as plain text for preview
      try {
        let exportMimeType = 'text/plain'
        if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
          exportMimeType = 'text/csv'
        }

        const contentResponse = await drive.files.export({
          fileId: fileId,
          mimeType: exportMimeType
        }, { responseType: 'text' })

        const content = contentResponse.data as string
        // Limit preview to first 1000 characters
        preview = content.substring(0, 1000)
        if (content.length > 1000) {
          preview += '\n\n... (truncated)'
        }
      } catch (error) {
        logger.error('Error exporting Google Docs file:', error)
        preview = 'Google Docs file - view in Google Drive for full content'
      }
    } else if (file.mimeType?.startsWith('image/')) {
      // For images, provide a thumbnail URL if available or construct a preview link
      const thumbnailLink = `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`
      const viewLink = `https://drive.google.com/file/d/${fileId}/view`
      
      preview = `📷 Image Preview\n\nFile: ${file.name}\nType: ${file.mimeType}\nSize: ${Math.round((file.size || 0) / 1024)} KB\n\nThumbnail URL:\n${thumbnailLink}\n\nView in Google Drive:\n${viewLink}\n\nNote: You can use the thumbnail URL in an <img> tag or the view link to open in browser.`
    } else {
      preview = `File: ${file.name}\nSize: ${file.size} bytes\nType: ${file.mimeType}\nModified: ${file.modifiedTime}`
    }

    return jsonResponse({
      preview,
      metadata: {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        createdTime: file.createdTime,
        modifiedTime: file.modifiedTime
      }
    })
  } catch (error: any) {
    logger.error('Error fetching file preview:', error)
    return errorResponse(error.message || 'Failed to fetch file preview' , 500)
  }
}