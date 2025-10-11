import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { decrypt } from '@/lib/security/encryption'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Get user from session
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the data type and optional parameters
    const searchParams = req.nextUrl.searchParams
    const type = searchParams.get('type')
    const folderId = searchParams.get('folderId')

    // Get Google Drive integration
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'google-drive')
      .single()

    if (integrationError || !integration) {
      return NextResponse.json({ error: 'Google Drive not connected' }, { status: 400 })
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
        return NextResponse.json(folders.map(folder => ({
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

        console.log('[Google Drive API] Fetching files with query:', query)

        const filesResponse = await drive.files.list({
          q: query,
          fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink, webContentLink, parents)',
          pageSize: 1000, // Increase page size to get more files
          orderBy: 'name'
        })

        console.log('[Google Drive API] Found files:', filesResponse.data.files?.length || 0)

        const files = filesResponse.data.files || []
        return NextResponse.json(files.map(file => ({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          size: file.size,
          modifiedTime: file.modifiedTime,
          webViewLink: file.webViewLink,
          webContentLink: file.webContentLink
        })))

      default:
        return NextResponse.json({ error: 'Invalid data type' }, { status: 400 })
    }
  } catch (error: any) {
    console.error('Error fetching Google Drive data:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch data' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const body = await req.json()
    const { integrationId, dataType, options = {} } = body

    console.log('[Google Drive API] POST request received:', {
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
        .eq('provider', 'google-drive')
        .single()

      if (integrationError || !integration) {
        return NextResponse.json({ error: 'Google Drive not connected' }, { status: 400 })
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

        console.log(`[Google Drive API] Successfully fetched ${files.length} files`)

        return NextResponse.json({
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

        console.log(`[Google Drive API] Successfully fetched ${folders.length} folders`)

        return NextResponse.json({
          data: folders,
          success: true
        })
      }

      return NextResponse.json({ error: 'Unsupported data type' }, { status: 400 })
    }

    // Legacy pattern with fileId (kept for backward compatibility)
    const { fileId } = body
    if (!fileId) {
      return NextResponse.json({ error: 'File ID or integration ID is required' }, { status: 400 })
    }

    // Get user from session for legacy pattern
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get Google Drive integration
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'google-drive')
      .single()

    if (integrationError || !integration) {
      return NextResponse.json({ error: 'Google Drive not connected' }, { status: 400 })
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
        console.error('Error fetching file content:', error)
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
        console.error('Error exporting Google Docs file:', error)
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

    return NextResponse.json({
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
    console.error('Error fetching file preview:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch file preview' },
      { status: 500 }
    )
  }
}