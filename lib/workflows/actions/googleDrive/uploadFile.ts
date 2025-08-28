import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { FileStorageService } from "@/lib/storage/fileStorage"
import { google } from 'googleapis'
import fetch from 'node-fetch'

/**
 * Upload file to Google Drive with full field support
 */
export async function uploadGoogleDriveFile(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const {
      sourceType = 'file',
      uploadedFiles = [],
      fileUrl,
      fileName,
      folderId,
      description,
      mimeType,
      convertToGoogleDocs = false,
      ocr = false,
      ocrLanguage = 'en',
      shareWith = [],
      sharePermission = 'reader',
      starred = false,
      keepRevisionForever = false,
      properties = {},
      appProperties = {}
    } = resolvedConfig

    const accessToken = await getDecryptedAccessToken(userId, "google-drive")
    
    // Initialize Drive API
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    const uploadedFileResults = []

    // Determine files to upload
    let filesToUpload: Array<{
      name: string
      data: Buffer | string
      mimeType: string
    }> = []

    if (sourceType === 'url' && fileUrl) {
      // Download file from URL
      try {
        const response = await fetch(fileUrl)
        if (!response.ok) {
          throw new Error(`Failed to fetch file from URL: ${response.statusText}`)
        }
        
        const buffer = await response.buffer()
        const urlFileName = fileName || fileUrl.split('/').pop() || 'downloaded-file'
        const contentType = response.headers.get('content-type') || 'application/octet-stream'
        
        filesToUpload.push({
          name: urlFileName,
          data: buffer,
          mimeType: contentType
        })
      } catch (error) {
        console.error('Error downloading file from URL:', error)
        return {
          success: false,
          output: {},
          message: `Failed to download file from URL: ${fileUrl}`
        }
      }
    } else if (sourceType === 'file' && uploadedFiles.length > 0) {
      // Get files from storage
      for (const fileId of uploadedFiles) {
        try {
          const fileData = await FileStorageService.getFile(fileId, userId)
          if (fileData) {
            filesToUpload.push({
              name: fileData.fileName,
              data: Buffer.from(fileData.data, 'base64'),
              mimeType: fileData.mimeType || 'application/octet-stream'
            })
          }
        } catch (error) {
          console.warn(`Failed to get file ${fileId} from storage:`, error)
        }
      }
    }

    if (filesToUpload.length === 0) {
      return {
        success: false,
        output: {},
        message: 'No files to upload'
      }
    }

    // Upload each file
    for (const file of filesToUpload) {
      try {
        // Prepare file metadata
        const fileMetadata: any = {
          name: file.name,
          description,
          starred,
          properties,
          appProperties
        }

        // Set parent folder
        if (folderId) {
          fileMetadata.parents = [folderId]
        }

        // Set MIME type for conversion
        let uploadMimeType = file.mimeType
        if (convertToGoogleDocs) {
          const conversionMap: Record<string, string> = {
            'application/msword': 'application/vnd.google-apps.document',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'application/vnd.google-apps.document',
            'application/vnd.ms-excel': 'application/vnd.google-apps.spreadsheet',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'application/vnd.google-apps.spreadsheet',
            'application/vnd.ms-powerpoint': 'application/vnd.google-apps.presentation',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'application/vnd.google-apps.presentation',
            'text/plain': 'application/vnd.google-apps.document',
            'text/csv': 'application/vnd.google-apps.spreadsheet'
          }
          
          if (conversionMap[file.mimeType]) {
            fileMetadata.mimeType = conversionMap[file.mimeType]
          }
        }

        // Upload file
        const uploadResponse = await drive.files.create({
          requestBody: fileMetadata,
          media: {
            mimeType: uploadMimeType,
            body: file.data
          },
          fields: 'id, name, mimeType, webViewLink, webContentLink, parents, size',
          // OCR options
          ocrLanguage: ocr ? ocrLanguage : undefined,
          useContentAsIndexableText: ocr
        })

        const uploadedFile = uploadResponse.data

        // Keep revision forever if requested
        if (keepRevisionForever && uploadedFile.id) {
          try {
            const revisions = await drive.revisions.list({
              fileId: uploadedFile.id
            })
            
            if (revisions.data.revisions && revisions.data.revisions.length > 0) {
              const latestRevision = revisions.data.revisions[revisions.data.revisions.length - 1]
              if (latestRevision.id) {
                await drive.revisions.update({
                  fileId: uploadedFile.id,
                  revisionId: latestRevision.id,
                  requestBody: {
                    keepForever: true
                  }
                })
              }
            }
          } catch (error) {
            console.warn('Failed to set keepForever on revision:', error)
          }
        }

        // Share file if requested
        if (shareWith.length > 0 && uploadedFile.id) {
          for (const email of shareWith) {
            try {
              await drive.permissions.create({
                fileId: uploadedFile.id,
                requestBody: {
                  type: 'user',
                  role: sharePermission,
                  emailAddress: email
                },
                sendNotificationEmail: true
              })
            } catch (error) {
              console.warn(`Failed to share with ${email}:`, error)
            }
          }
        }

        uploadedFileResults.push({
          success: true,
          fileId: uploadedFile.id,
          fileName: uploadedFile.name,
          mimeType: uploadedFile.mimeType,
          webViewLink: uploadedFile.webViewLink,
          webContentLink: uploadedFile.webContentLink,
          size: uploadedFile.size
        })

      } catch (error: any) {
        console.error(`Failed to upload file ${file.name}:`, error)
        uploadedFileResults.push({
          success: false,
          fileName: file.name,
          error: error.message
        })
      }
    }

    const successCount = uploadedFileResults.filter(r => r.success).length

    return {
      success: successCount > 0,
      output: {
        uploadedFiles: uploadedFileResults,
        totalFiles: filesToUpload.length,
        successfulUploads: successCount,
        folderId
      },
      message: `Successfully uploaded ${successCount} of ${filesToUpload.length} files to Google Drive`
    }

  } catch (error: any) {
    console.error('Upload Google Drive file error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to upload files to Google Drive'
    }
  }
}