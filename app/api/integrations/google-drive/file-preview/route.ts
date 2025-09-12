import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { decrypt } from '@/lib/security/encryption'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest) {
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

    const body = await req.json()
    const { fileId } = body

    if (!fileId) {
      return NextResponse.json({ error: 'File ID is required' }, { status: 400 })
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
        const lines = content.split('\n')
        const lineCount = lines.length
        const charCount = content.length
        
        // Create a formatted preview with file info header
        preview = `📄 TEXT FILE\n` +
                 `════════════════════════════════════════\n\n` +
                 `File Name: ${file.name}\n` +
                 `File Type: ${file.mimeType}\n` +
                 `Total Lines: ${lineCount}\n` +
                 `Total Characters: ${charCount}\n\n` +
                 `════════════════════════════════════════\n` +
                 `CONTENT PREVIEW:\n` +
                 `────────────────────────────────────────\n\n`
        
        // Add first 1500 characters of content
        const contentPreview = content.substring(0, 1500)
        preview += contentPreview
        
        if (content.length > 1500) {
          preview += '\n\n... (showing first 1500 characters of ' + charCount + ' total)'
        }
      } catch (error) {
        console.error('Error fetching file content:', error)
        preview = 'Unable to load file preview'
      }
    } else if (googleDocsMimeTypes.includes(file.mimeType || '')) {
      // For Google Docs files, export as plain text for preview
      try {
        let exportMimeType = 'text/plain'
        let fileTypeLabel = '📝 GOOGLE DOCUMENT'
        
        if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
          exportMimeType = 'text/csv'
          fileTypeLabel = '📊 GOOGLE SPREADSHEET'
        } else if (file.mimeType === 'application/vnd.google-apps.presentation') {
          fileTypeLabel = '📊 GOOGLE PRESENTATION'
        }

        const contentResponse = await drive.files.export({
          fileId: fileId,
          mimeType: exportMimeType
        }, { responseType: 'text' })

        const content = contentResponse.data as string
        const lines = content.split('\n')
        const lineCount = lines.length
        const charCount = content.length
        
        // Create a formatted preview with file info header
        preview = `${fileTypeLabel}\n` +
                 `════════════════════════════════════════\n\n` +
                 `File Name: ${file.name}\n` +
                 `File Type: ${file.mimeType}\n` +
                 `Total Lines: ${lineCount}\n` +
                 `Total Characters: ${charCount}\n\n` +
                 `════════════════════════════════════════\n` +
                 `CONTENT PREVIEW:\n` +
                 `────────────────────────────────────────\n\n`
        
        // Add first 1500 characters of content
        const contentPreview = content.substring(0, 1500)
        preview += contentPreview
        
        if (content.length > 1500) {
          preview += '\n\n... (showing first 1500 characters of ' + charCount + ' total)'
        }
      } catch (error) {
        console.error('Error exporting Google Docs file:', error)
        preview = 'Google Docs file - view in Google Drive for full content'
      }
    } else if (file.mimeType?.startsWith('image/')) {
      // For images, we need to provide a special preview format
      // Since textareas can't render images, we'll return metadata and indicate it's an image
      try {
        // Get image metadata and create a descriptive preview
        const sizeInKB = Math.round((file.size || 0) / 1024)
        const sizeInMB = (sizeInKB / 1024).toFixed(2)
        const displaySize = sizeInKB > 1024 ? `${sizeInMB} MB` : `${sizeInKB} KB`
        
        // Try to get image dimensions if possible (would require additional API calls)
        // For now, provide a comprehensive text preview
        preview = `📷 IMAGE FILE\n` +
                 `════════════════════════════════════════\n\n` +
                 `File Name: ${file.name}\n` +
                 `File Type: ${file.mimeType}\n` +
                 `File Size: ${displaySize}\n` +
                 `Created: ${new Date(file.createdTime || '').toLocaleString()}\n` +
                 `Modified: ${new Date(file.modifiedTime || '').toLocaleString()}\n\n` +
                 `════════════════════════════════════════\n\n` +
                 `ℹ️ This is an image file. The actual image\n` +
                 `content will be available when the workflow\n` +
                 `executes. You can use this file in subsequent\n` +
                 `nodes to process, analyze, or upload the image.\n\n` +
                 `To view the image now, you can open it in\n` +
                 `Google Drive directly.`
        
        // Store the actual image data in metadata for execution
        // but don't try to display it in the textarea
      } catch (error) {
        console.error('Error processing image preview:', error)
        preview = `📷 Image File: ${file.name}\n\nUnable to generate preview. The image will be available during workflow execution.`
      }
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