import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { google } from 'googleapis'

import { logger } from '@/lib/utils/logger'

/**
 * Get a file from Google Drive
 */
export async function getGoogleDriveFile(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  logger.debug('🚀 [getGoogleDriveFile] Starting with config:', {
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

    logger.debug('📋 [getGoogleDriveFile] Resolved config:', {
      fileId,
      folderId: resolvedConfig.folderId
    });

    logger.debug('🔐 [getGoogleDriveFile] Getting access token for userId:', userId);
    
    let accessToken;
    try {
      accessToken = await getDecryptedAccessToken(userId, "google-drive")
      logger.debug('✅ [getGoogleDriveFile] Got access token');
    } catch (error: any) {
      logger.error('❌ [getGoogleDriveFile] Failed to get access token:', error);
      throw new Error(`Failed to get Google Drive access token: ${error.message}`);
    }
    
    // Initialize Drive API
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    logger.debug('📁 [getGoogleDriveFile] Fetching file metadata for:', fileId);
    
    // Get file metadata
    const metadataResponse = await drive.files.get({
      fileId: fileId,
      fields: 'id, name, mimeType, size, modifiedTime, createdTime, webViewLink, webContentLink, parents, description'
    })

    const fileMetadata = metadataResponse.data
    
    logger.debug('✅ [getGoogleDriveFile] Got file metadata:', {
      name: fileMetadata.name,
      mimeType: fileMetadata.mimeType,
      size: fileMetadata.size
    });

    // Download the file as binary data for use as attachment
    logger.debug('📥 [getGoogleDriveFile] Downloading file for attachment use');
    
    let fileBuffer: Buffer;
    let finalFileName = fileMetadata.name || 'file';
    let finalMimeType = fileMetadata.mimeType || 'application/octet-stream';
    
    try {
      // Check if it's a Google Docs file that needs to be exported
      const googleDocsMimeTypes: Record<string, { exportType: string, extension: string }> = {
        'application/vnd.google-apps.document': { exportType: 'application/pdf', extension: '.pdf' },
        'application/vnd.google-apps.spreadsheet': { exportType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: '.xlsx' },
        'application/vnd.google-apps.presentation': { exportType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', extension: '.pptx' },
        'application/vnd.google-apps.drawing': { exportType: 'application/pdf', extension: '.pdf' },
      }
      
      if (googleDocsMimeTypes[fileMetadata.mimeType || '']) {
        // Export Google Docs files to standard formats
        const exportConfig = googleDocsMimeTypes[fileMetadata.mimeType || ''];
        logger.debug('📝 [getGoogleDriveFile] Exporting Google Docs file as:', exportConfig.exportType);
        
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
      
      logger.debug('✅ [getGoogleDriveFile] Downloaded file:', {
        fileName: finalFileName,
        size: fileBuffer.length,
        mimeType: finalMimeType
      });
      
      // Return the file in a format that can be used directly as an email attachment
      // The file is base64 encoded for transport through the workflow system
      const result = {
        file: {
          content: fileBuffer.toString('base64'),
          filename: finalFileName,
          mimeType: finalMimeType,
          size: fileBuffer.length
        },
        fileName: finalFileName
      }
      
      return {
        success: true,
        output: result,
        message: `Successfully retrieved file: ${finalFileName}`
      }
      
    } catch (error: any) {
      logger.error('⚠️ [getGoogleDriveFile] Error downloading file:', error)
      throw new Error(`Failed to download file: ${error.message}`)
    }

  } catch (error: any) {
    logger.error('❌ [getGoogleDriveFile] Failed with error:', {
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