import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { FileStorageService } from "@/lib/storage/fileStorage"
import { deleteWorkflowTempFiles } from '@/lib/utils/workflowFileCleanup'
import { google } from 'googleapis'
import fetch from 'node-fetch'
import { Readable } from 'stream'

import { logger } from '@/lib/utils/logger'

/**
 * Upload file to Google Drive with full field support
 */
export async function uploadGoogleDriveFile(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  logger.debug('🚀 [uploadGoogleDriveFile] Starting with config:', {
    config,
    userId,
    hasInput: !!input
  });

  const cleanupPaths = new Set<string>()

  try {
    const resolvedConfig = resolveValue(config, input)
    
    // Handle uploadedFiles being an object with file info
    let processedUploadedFiles = resolvedConfig.uploadedFiles;
    if (processedUploadedFiles && typeof processedUploadedFiles === 'object' && !Array.isArray(processedUploadedFiles)) {
      // If it's an object (temporary file), wrap it in an array
      processedUploadedFiles = [processedUploadedFiles];
    }
    
    const {
      sourceType = 'file',
      fileUrl,
      fileFromNode,
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
    
    const uploadedFiles = processedUploadedFiles || [];
    
    logger.debug('📋 [uploadGoogleDriveFile] Resolved config:', {
      sourceType,
      uploadedFiles,
      fileName,
      hasFileUrl: !!fileUrl,
      hasFileFromNode: !!fileFromNode,
      uploadedFilesType: typeof uploadedFiles,
      uploadedFilesValue: uploadedFiles,
      originalUploadedFiles: resolvedConfig.uploadedFiles
    });

    logger.debug('🔐 [uploadGoogleDriveFile] Getting access token for userId:', userId);
    
    let accessToken;
    try {
      accessToken = await getDecryptedAccessToken(userId, "google-drive")
      logger.debug('✅ [uploadGoogleDriveFile] Got access token');
    } catch (error: any) {
      logger.error('❌ [uploadGoogleDriveFile] Failed to get access token:', error);
      throw new Error(`Failed to get Google Drive access token: ${error.message}`);
    }
    
    // Initialize Drive API
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    const uploadedFileResults = []

    // Determine files to upload
    const filesToUpload: Array<{
      name: string
      data: Buffer | string
      mimeType: string
    }> = []

    if (sourceType === 'node' && fileFromNode) {
      // Handle file from previous node
      try {
        // fileFromNode could be:
        // 1. A base64 string
        // 2. An object with { data, fileName, mimeType }
        // 3. An array of such objects
        
        const processNodeFile = (fileData: any) => {
          if (typeof fileData === 'string') {
            // Base64 string
            const isBase64 = fileData.match(/^data:([^;]+);base64,(.+)$/);
            if (isBase64) {
              const mimeType = isBase64[1];
              const base64Data = isBase64[2];
              return {
                name: fileName || 'file-from-node',
                data: Buffer.from(base64Data, 'base64'),
                mimeType: mimeType || 'application/octet-stream'
              };
            } 
              // Plain base64 without data URL prefix
              return {
                name: fileName || 'file-from-node',
                data: Buffer.from(fileData, 'base64'),
                mimeType: mimeType || 'application/octet-stream'
              };
            
          } else if (fileData && typeof fileData === 'object') {
            // Object with file data
            const fileBuffer = fileData.data 
              ? (typeof fileData.data === 'string' 
                  ? Buffer.from(fileData.data, 'base64')
                  : Buffer.from(fileData.data))
              : Buffer.from('');
              
            return {
              name: fileData.fileName || fileData.name || fileName || 'file-from-node',
              data: fileBuffer,
              mimeType: fileData.mimeType || fileData.type || mimeType || 'application/octet-stream'
            };
          }
          return null;
        };

        if (Array.isArray(fileFromNode)) {
          // Multiple files from node
          for (const file of fileFromNode) {
            const processed = processNodeFile(file);
            if (processed) {
              filesToUpload.push(processed);
            }
          }
        } else {
          // Single file from node
          const processed = processNodeFile(fileFromNode);
          if (processed) {
            filesToUpload.push(processed);
          }
        }
      } catch (error) {
        logger.error('Error processing file from node:', error)
        return {
          success: false,
          output: {},
          message: `Failed to process file from previous node: ${error.message}`
        }
      }
    } else if (sourceType === 'url' && fileUrl) {
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
        logger.error('Error downloading file from URL:', error)
        return {
          success: false,
          output: {},
          message: `Failed to download file from URL: ${fileUrl}`
        }
      }
    } else if (sourceType === 'file') {
      // Handle uploaded files - can be either:
      // 1. Array of node IDs (strings) for permanent files
      // 2. Array of objects with {nodeId, filePath, isTemporary} for temp files
      // 3. Single object/string (convert to array)
      
      logger.debug('📁 [uploadGoogleDriveFile] Processing uploaded files:', {
        uploadedFiles,
        uploadedFilesType: typeof uploadedFiles,
        isArray: Array.isArray(uploadedFiles)
      });
      
      let filesToProcess = [];
      
      // Normalize to array
      if (uploadedFiles) {
        filesToProcess = Array.isArray(uploadedFiles) ? uploadedFiles : [uploadedFiles];
      }
      
      logger.debug('📁 [uploadGoogleDriveFile] Files to process:', filesToProcess);
      
      for (const fileRef of filesToProcess) {
        try {
          let nodeId: string;
          let filePath: string | undefined;
          let isTemp = false;
          
          // Check if it's a temporary file object or a simple node ID
          if (typeof fileRef === 'object' && fileRef.nodeId) {
            // Temporary file format
            nodeId = fileRef.nodeId;
            filePath = fileRef.filePath;
            isTemp = fileRef.isTemporary || false;
            logger.debug('📝 [uploadGoogleDriveFile] Processing temporary file object:', {
              nodeId,
              filePath,
              isTemp
            });
          } else if (typeof fileRef === 'string') {
            // Simple node ID format
            nodeId = fileRef;
            logger.debug('📝 [uploadGoogleDriveFile] Processing node ID string:', nodeId);
          } else {
            logger.warn('Invalid file reference format:', fileRef);
            continue;
          }
          
          // Extract workflow ID if available from the config context
          const workflowId = config.workflowId || null;
          
          if (isTemp && filePath) {
            // For temporary files, we need to fetch directly from storage using the path
            // Since there's no database record yet
            logger.debug('📂 [uploadGoogleDriveFile] Fetching temporary file from storage:', {
              nodeId,
              filePath,
              isTemp
            });

            cleanupPaths.add(filePath)

            const { createClient } = await import('@supabase/supabase-js');
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
            const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY!;
            const supabase = createClient(supabaseUrl, supabaseServiceKey);
            
            const { data: fileData, error } = await supabase.storage
              .from('workflow-files')
              .download(filePath);
            
            if (error) {
              logger.error(`❌ Failed to download temporary file from storage: ${filePath}`, error);
              continue;
            }
            
            logger.debug('✅ [uploadGoogleDriveFile] Successfully downloaded file from storage');
            
            const buffer = await fileData.arrayBuffer();
            const bufferData = Buffer.from(buffer);
            
            logger.debug('📊 [uploadGoogleDriveFile] File buffer created:', {
              bufferSize: bufferData.length,
              fileName: fileName || filePath.split('/').pop()
            });
            
            filesToUpload.push({
              name: fileName || filePath.split('/').pop() || 'uploaded-file',
              data: bufferData,
              mimeType: mimeType || 'application/octet-stream'
            });
          } else {
            // For permanent files, use the FileStorageService
            const fileData = await FileStorageService.getFile(nodeId, userId, workflowId);
            if (fileData) {
              const buffer = await fileData.file.arrayBuffer();
              filesToUpload.push({
                name: fileData.metadata.fileName || fileName,
                data: Buffer.from(buffer),
                mimeType: fileData.metadata.fileType || mimeType || 'application/octet-stream'
              });
            }
          }
        } catch (error) {
          logger.warn(`Failed to process file:`, error);
        }
      }
    }

    logger.debug('📊 [uploadGoogleDriveFile] Files ready for upload:', {
      count: filesToUpload.length,
      files: filesToUpload.map(f => ({ name: f.name, size: f.data?.length || 0 }))
    });

    if (filesToUpload.length === 0) {
      logger.warn('⚠️ [uploadGoogleDriveFile] No files to upload!');
      return {
        success: false,
        output: {},
        message: 'No files to upload'
      }
    }

    // Upload each file
    logger.debug('🚀 [uploadGoogleDriveFile] Starting file uploads to Google Drive...');
    for (const file of filesToUpload) {
      try {
        logger.debug('📤 [uploadGoogleDriveFile] Uploading file:', file.name);
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
        const uploadMimeType = file.mimeType
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
        logger.debug('🚀 [uploadGoogleDriveFile] Calling Google Drive API to create file:', {
          fileName: fileMetadata.name,
          mimeType: uploadMimeType,
          dataSize: file.data?.length || 0,
          hasParents: !!fileMetadata.parents
        });
        
        // Convert Buffer to Stream for Google Drive API
        const fileStream = Readable.from(file.data);
        
        let uploadResponse;
        try {
          uploadResponse = await drive.files.create({
            requestBody: fileMetadata,
            media: {
              mimeType: uploadMimeType,
              body: fileStream
            },
            fields: 'id, name, mimeType, webViewLink, webContentLink, parents, size',
            // OCR options
            ocrLanguage: ocr ? ocrLanguage : undefined,
            useContentAsIndexableText: ocr
          })
        } catch (uploadError: any) {
          logger.error('❌ [uploadGoogleDriveFile] Google Drive API error:', {
            message: uploadError.message,
            code: uploadError.code,
            errors: uploadError.errors,
            response: uploadError.response?.data
          });
          throw uploadError;
        }

        const uploadedFile = uploadResponse.data
        logger.debug('✅ [uploadGoogleDriveFile] File uploaded successfully:', {
          fileId: uploadedFile.id,
          fileName: uploadedFile.name,
          webViewLink: uploadedFile.webViewLink
        });

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
            logger.warn('Failed to set keepForever on revision:', error)
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
              logger.warn(`Failed to share with ${email}:`, error)
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
        logger.error(`Failed to upload file ${file.name}:`, error)
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
    logger.error('❌ [uploadGoogleDriveFile] Upload failed with error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      details: error.response?.data || error
    });
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to upload files to Google Drive'
    }
  } finally {
    if (cleanupPaths.size > 0) {
      await deleteWorkflowTempFiles(cleanupPaths)
    }
  }
}
