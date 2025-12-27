import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { FileStorageService } from '@/lib/storage/fileStorage'
import { deleteWorkflowTempFiles } from '@/lib/utils/workflowFileCleanup'
import { logger } from '@/lib/utils/logger'
import FormData from 'form-data'

/**
 * Add a file to a Monday.com item using multipart upload
 */
export async function addMondayFile(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  const cleanupPaths = new Set<string>()

  try {
    // Resolve configuration values
    const itemId = await resolveValue(config.itemId, input)
    const columnId = await resolveValue(config.columnId, input)
    const sourceType = await resolveValue(config.sourceType, input) || 'file'
    const fileUrl = await resolveValue(config.fileUrl, input)
    const fileFromNode = await resolveValue(config.fileFromNode, input)
    const customFileName = await resolveValue(config.fileName, input)

    // Handle uploadedFiles being an object with file info
    let processedUploadedFiles = config.uploadedFiles
    if (processedUploadedFiles && typeof processedUploadedFiles === 'object' && !Array.isArray(processedUploadedFiles)) {
      processedUploadedFiles = [processedUploadedFiles]
    }
    const uploadedFiles = processedUploadedFiles || []

    // Validate required fields
    if (!itemId) {
      throw new Error('Item ID is required')
    }
    if (!columnId) {
      throw new Error('Column ID is required')
    }

    // Get access token
    const accessToken = await getDecryptedAccessToken(userId, 'monday')

    // Determine file to upload based on source type
    let fileBuffer: Buffer | null = null
    let fileName = customFileName || 'uploaded-file'
    let mimeType = 'application/octet-stream'

    if (sourceType === 'url' && fileUrl) {
      // Download file from URL
      logger.debug('[Monday.com] Downloading file from URL:', fileUrl)
      const response = await fetch(fileUrl)
      if (!response.ok) {
        throw new Error(`Failed to fetch file from URL: ${response.statusText}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      fileBuffer = Buffer.from(arrayBuffer)
      fileName = customFileName || fileUrl.split('/').pop()?.split('?')[0] || 'downloaded-file'
      mimeType = response.headers.get('content-type') || 'application/octet-stream'

    } else if (sourceType === 'node' && fileFromNode) {
      // Handle file from previous node
      logger.debug('[Monday.com] Processing file from node:', fileFromNode)

      if (typeof fileFromNode === 'string') {
        // Base64 string
        const isBase64 = fileFromNode.match(/^data:([^;]+);base64,(.+)$/)
        if (isBase64) {
          mimeType = isBase64[1]
          fileBuffer = Buffer.from(isBase64[2], 'base64')
        } else {
          fileBuffer = Buffer.from(fileFromNode, 'base64')
        }
      } else if (fileFromNode && typeof fileFromNode === 'object') {
        // Object with file data
        if (fileFromNode.data) {
          fileBuffer = typeof fileFromNode.data === 'string'
            ? Buffer.from(fileFromNode.data, 'base64')
            : Buffer.from(fileFromNode.data)
        } else if (fileFromNode.content) {
          fileBuffer = typeof fileFromNode.content === 'string'
            ? Buffer.from(fileFromNode.content, 'base64')
            : Buffer.from(fileFromNode.content)
        }
        fileName = customFileName || fileFromNode.fileName || fileFromNode.name || 'file-from-node'
        mimeType = fileFromNode.mimeType || fileFromNode.type || 'application/octet-stream'
      }

    } else if (sourceType === 'file' && uploadedFiles.length > 0) {
      // Handle uploaded files from workflow file storage
      logger.debug('[Monday.com] Processing uploaded files:', uploadedFiles)

      for (const fileRef of uploadedFiles) {
        try {
          let nodeId: string
          let filePath: string | undefined
          let isTemp = false

          if (typeof fileRef === 'object' && fileRef.nodeId) {
            nodeId = fileRef.nodeId
            filePath = fileRef.filePath
            isTemp = fileRef.isTemporary || false
          } else if (typeof fileRef === 'string') {
            nodeId = fileRef
          } else {
            continue
          }

          if (isTemp && filePath) {
            cleanupPaths.add(filePath)

            const { createClient } = await import('@supabase/supabase-js')
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
            const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY!
            const supabase = createClient(supabaseUrl, supabaseServiceKey)

            const { data: fileData, error } = await supabase.storage
              .from('workflow-files')
              .download(filePath)

            if (error) {
              logger.error(`Failed to download temporary file: ${filePath}`, error)
              continue
            }

            const buffer = await fileData.arrayBuffer()
            fileBuffer = Buffer.from(buffer)
            fileName = customFileName || filePath.split('/').pop() || 'uploaded-file'
          } else {
            const workflowId = config.workflowId || null
            const fileData = await FileStorageService.getFile(nodeId, userId, workflowId)
            if (fileData) {
              const buffer = await fileData.file.arrayBuffer()
              fileBuffer = Buffer.from(buffer)
              fileName = customFileName || fileData.metadata.fileName
              mimeType = fileData.metadata.fileType || 'application/octet-stream'
            }
          }
          // Only upload first file for now
          break
        } catch (error) {
          logger.warn('Failed to process file:', error)
        }
      }
    }

    if (!fileBuffer) {
      throw new Error('No file provided. Please upload a file, provide a URL, or select a file from a previous node.')
    }

    logger.debug('[Monday.com] Uploading file:', { fileName, size: fileBuffer.length, mimeType })

    // Monday.com requires multipart form upload
    // Build the GraphQL mutation
    const mutation = `
      mutation($file: File!) {
        add_file_to_column(
          item_id: ${itemId}
          column_id: "${columnId}"
          file: $file
        ) {
          id
          name
          url
        }
      }
    `

    // Create form data for multipart upload
    const formData = new FormData()
    formData.append('query', mutation)
    formData.append('variables[file]', fileBuffer, {
      filename: fileName,
      contentType: mimeType
    })

    // Make multipart API request to Monday.com file endpoint
    const response = await fetch('https://api.monday.com/v2/file', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'API-Version': '2024-01',
        ...formData.getHeaders()
      },
      body: formData as any
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Monday.com API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    if (data.errors && data.errors.length > 0) {
      const errorMessages = data.errors.map((e: any) => e.message).join(', ')
      throw new Error(`Monday.com error: ${errorMessages}`)
    }

    const asset = data.data?.add_file_to_column

    if (!asset) {
      throw new Error('Failed to add file: No data returned')
    }

    logger.info('✅ Monday.com file added successfully', { assetId: asset.id, itemId, columnId, userId })

    return {
      success: true,
      output: {
        fileId: asset.id,
        fileName: asset.name || fileName,
        fileUrl: asset.url,
        itemId: itemId,
        columnId: columnId,
        fileSize: fileBuffer.length,
        uploadedAt: new Date().toISOString()
      },
      message: `File "${fileName}" added successfully to Monday.com item`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com add file error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to add file to Monday.com item'
    }
  } finally {
    if (cleanupPaths.size > 0) {
      await deleteWorkflowTempFiles(cleanupPaths)
    }
  }
}
