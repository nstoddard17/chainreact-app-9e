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