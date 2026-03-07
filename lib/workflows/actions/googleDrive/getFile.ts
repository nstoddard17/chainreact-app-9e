import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { google } from 'googleapis'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomUUID } from 'crypto'

import { logger } from '@/lib/utils/logger'

const MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024  // 50MB - max downloadable size
const INLINE_SIZE_LIMIT = 25 * 1024 * 1024  // 25MB - max for inline base64
const STORAGE_BUCKET = 'workflow-files'
const STORAGE_BASE_PATH = 'temp-attachments/google-drive'
const STORAGE_EXPIRATION_MS = 60 * 60 * 1000 // 1 hour - cron cleanup safety net

const googleDocsMimeTypes: Record<string, { exportType: string, extension: string }> = {
  'application/vnd.google-apps.document': { exportType: 'application/pdf', extension: '.pdf' },
  'application/vnd.google-apps.spreadsheet': { exportType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: '.xlsx' },
  'application/vnd.google-apps.presentation': { exportType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', extension: '.pptx' },
  'application/vnd.google-apps.drawing': { exportType: 'application/pdf', extension: '.pdf' },
}

function sanitizeFileName(name: string): string {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '') || 'file'
}

function formatSizeMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(2)
}

function buildMetadataOnlyResult(
  fileMetadata: any,
  fileId: string,
  fileName: string,
  mimeType: string,
  sizeBytes: number
): ActionResult {
  const sizeMB = formatSizeMB(sizeBytes)
  const limitMB = formatSizeMB(MAX_DOWNLOAD_SIZE)

  return {
    success: true,
    output: {
      file: null,
      fileName,
      fileId,
      mimeType,
      size: sizeBytes,
      webViewLink: fileMetadata.webViewLink || null,
      webContentLink: fileMetadata.webContentLink || null,
      tooLargeForDownload: true,
      sizeLimitMB: Math.round(MAX_DOWNLOAD_SIZE / (1024 * 1024)),
    },
    message: `File "${fileName}" is ${sizeMB} MB, which exceeds the ${limitMB} MB download limit. File metadata and download links are provided instead.`
  }
}

/**
 * Get a file from Google Drive
 */
export async function getGoogleDriveFile(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  logger.info('[getGoogleDriveFile] Starting with config:', {
    config,
    userId,
    hasInput: !!input
  });

  try {
    const resolvedConfig = resolveValue(config, input)

    // Get the file ID
    const fileId = resolvedConfig.fileId

    if (!fileId) {
      return {
        success: false,
        output: {},
        message: 'No file selected'
      }
    }

    logger.info('[getGoogleDriveFile] Resolved config:', {
      fileId,
      folderId: resolvedConfig.folderId
    });

    let accessToken;
    try {
      accessToken = await getDecryptedAccessToken(userId, "google-drive")
    } catch (error: any) {
      logger.error('[getGoogleDriveFile] Failed to get access token:', error);
      throw new Error(`Failed to get Google Drive access token: ${error.message}`);
    }

    // Initialize Drive API
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    // Get file metadata
    const metadataResponse = await drive.files.get({
      fileId: fileId,
      fields: 'id, name, mimeType, size, modifiedTime, createdTime, webViewLink, webContentLink, parents, description'
    })

    const fileMetadata = metadataResponse.data

    logger.info('[getGoogleDriveFile] Got file metadata:', {
      name: fileMetadata.name,
      mimeType: fileMetadata.mimeType,
      size: fileMetadata.size
    });

    let finalFileName = fileMetadata.name || 'file';
    let finalMimeType = fileMetadata.mimeType || 'application/octet-stream';
    const isGoogleDocsFile = !!googleDocsMimeTypes[fileMetadata.mimeType || '']

    // Pre-download size check for regular files (Google Docs don't report size)
    if (!isGoogleDocsFile && fileMetadata.size) {
      const fileSizeBytes = parseInt(fileMetadata.size, 10)
      if (fileSizeBytes > MAX_DOWNLOAD_SIZE) {
        logger.info(`[getGoogleDriveFile] File too large for download: ${formatSizeMB(fileSizeBytes)} MB`)
        return buildMetadataOnlyResult(fileMetadata, fileId, finalFileName, finalMimeType, fileSizeBytes)
      }
    }

    // Download the file
    let fileBuffer: Buffer;

    try {
      if (isGoogleDocsFile) {
        // Export Google Docs files to standard formats
        const exportConfig = googleDocsMimeTypes[fileMetadata.mimeType || ''];
        logger.info('[getGoogleDriveFile] Exporting Google Docs file as:', exportConfig.exportType);

        const contentResponse = await drive.files.export({
          fileId: fileId,
          mimeType: exportConfig.exportType
        }, { responseType: 'arraybuffer' })

        fileBuffer = Buffer.from(contentResponse.data as ArrayBuffer)

        // Add extension if not present
        if (!finalFileName.endsWith(exportConfig.extension)) {
          finalFileName = finalFileName + exportConfig.extension;
        }
        finalMimeType = exportConfig.exportType;
      } else {
        // Download regular files as-is
        const contentResponse = await drive.files.get({
          fileId: fileId,
          alt: 'media'
        }, { responseType: 'arraybuffer' })

        fileBuffer = Buffer.from(contentResponse.data as ArrayBuffer)
      }

      logger.info('[getGoogleDriveFile] Downloaded file:', {
        fileName: finalFileName,
        size: fileBuffer.length,
        mimeType: finalMimeType
      });

      // Post-download size check (safety net for Google Docs exports)
      if (fileBuffer.length > MAX_DOWNLOAD_SIZE) {
        logger.info(`[getGoogleDriveFile] Downloaded file exceeds max size: ${formatSizeMB(fileBuffer.length)} MB`)
        return buildMetadataOnlyResult(fileMetadata, fileId, finalFileName, finalMimeType, fileBuffer.length)
      }

      // Tiered handling based on file size
      if (fileBuffer.length > INLINE_SIZE_LIMIT) {
        // Medium files (25-50MB): Upload to Supabase Storage
        logger.info(`[getGoogleDriveFile] File ${formatSizeMB(fileBuffer.length)} MB exceeds inline limit, uploading to storage`)

        const safeName = sanitizeFileName(finalFileName)
        const storagePath = `${STORAGE_BASE_PATH}/${randomUUID()}-${safeName}`

        const supabase = createAdminClient()
        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, fileBuffer, {
            contentType: finalMimeType,
            upsert: true
          })

        if (uploadError) {
          logger.error('[getGoogleDriveFile] Failed to upload to storage:', uploadError)
          return buildMetadataOnlyResult(fileMetadata, fileId, finalFileName, finalMimeType, fileBuffer.length)
        }

        // Register in workflow_files table with 1-hour expiration (cron safety net for orphans)
        const expiresAt = new Date(Date.now() + STORAGE_EXPIRATION_MS)
        await (supabase as any).from('workflow_files').insert({
          file_name: finalFileName,
          file_type: finalMimeType,
          file_size: fileBuffer.length,
          file_path: storagePath,
          user_id: userId,
          expires_at: expiresAt.toISOString()
        })

        return {
          success: true,
          output: {
            file: {
              filePath: storagePath,
              filename: finalFileName,
              name: finalFileName, // For Gmail sendEmail compatibility (line 278 check)
              mimeType: finalMimeType,
              size: fileBuffer.length,
              isStorageRef: true,
              isTemporary: true,
            },
            fileName: finalFileName,
            fileId,
            size: fileBuffer.length,
            mimeType: finalMimeType,
            webViewLink: fileMetadata.webViewLink || null,
            webContentLink: fileMetadata.webContentLink || null,
            tooLargeForDownload: false,
          },
          message: `Successfully retrieved file: ${finalFileName} (${formatSizeMB(fileBuffer.length)} MB, stored in temporary storage)`
        }
      }

      // Small files (≤25MB): Return inline base64 (current behavior)
      const result = {
        file: {
          content: fileBuffer.toString('base64'),
          filename: finalFileName,
          mimeType: finalMimeType,
          size: fileBuffer.length
        },
        fileName: finalFileName,
        fileId,
        size: fileBuffer.length,
        mimeType: finalMimeType,
        webViewLink: fileMetadata.webViewLink || null,
        webContentLink: fileMetadata.webContentLink || null,
        tooLargeForDownload: false,
      }

      return {
        success: true,
        output: result,
        message: `Successfully retrieved file: ${finalFileName}`
      }

    } catch (error: any) {
      logger.error('[getGoogleDriveFile] Error downloading file:', error)
      throw new Error(`Failed to download file: ${error.message}`)
    }

  } catch (error: any) {
    logger.error('[getGoogleDriveFile] Failed with error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      details: error.response?.data || error
    });
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to retrieve file from Google Drive'
    }
  }
}
