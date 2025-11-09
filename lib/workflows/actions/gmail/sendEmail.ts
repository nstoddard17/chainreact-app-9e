import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { FileStorageService } from "@/lib/storage/fileStorage"
import { deleteWorkflowTempFiles } from '@/lib/utils/workflowFileCleanup'
import { applyEmailMetaVariables } from './resolveEmailMetaVariables'
import { google } from 'googleapis'

import { logger } from '@/lib/utils/logger'

/**
 * Enhanced Gmail send email with all field support
 */
export async function sendGmailEmail(
  params: { config: any; userId: string; input: Record<string, any> }
): Promise<ActionResult> {
  const { config, userId, input } = params
  const cleanupPaths = new Set<string>()

  try {
    // Debug logging
    logger.debug('📧 [sendGmailEmail] Raw config:', JSON.stringify(config, null, 2))
    logger.debug('📧 [sendGmailEmail] Input keys:', Object.keys(input || {}))
    logger.debug('📧 [sendGmailEmail] Input structure:', JSON.stringify(input, (key, value) => {
      if (typeof value === 'string' && value.length > 100) return value.substring(0, 100) + '...'
      return value
    }, 2))

    // Config is already resolved if coming from GmailIntegrationService
    // Only resolve if it contains template variables
    const needsResolution = typeof config === 'object' &&
      Object.values(config).some(v =>
        typeof v === 'string' && v.includes('{{') && v.includes('}}')
      )

    logger.debug('📧 [sendGmailEmail] Needs resolution:', needsResolution)

    // IMPORTANT: Pass input directly, not wrapped in { input }
    const resolvedConfig = needsResolution ? resolveValue(config, input) : config

    logger.debug('📧 [sendGmailEmail] Resolved config.to:', resolvedConfig.to)
    logger.debug('📧 [sendGmailEmail] Resolved config.body:', resolvedConfig.body)

    // Apply meta-variable resolution to subject and body
    // This resolves {{recipient_name}}, {{sender_email}}, etc. based on To/From fields
    const { subject: resolvedSubject, body: resolvedBody } = await applyEmailMetaVariables(
      {
        to: resolvedConfig.to,
        from: resolvedConfig.from,
        cc: resolvedConfig.cc,
        bcc: resolvedConfig.bcc,
        subject: resolvedConfig.subject,
        body: resolvedConfig.body
      },
      userId
    )

    const {
      from,
      to,
      cc,
      bcc,
      signature,
      attachments,
      sourceType,
      uploadedFiles,
      fileUrl,
      fileFromNode,
      replyTo,
      priority = 'normal',
      readReceipt = false,
      labels = [],
      scheduleSend,
      trackOpens = false,
      trackClicks = false,
      isHtml = false
    } = resolvedConfig

    // Use the meta-variable resolved subject and body
    const subject = resolvedSubject
    const body = resolvedBody

    // Auto-detect HTML if not explicitly set
    const bodyIsHtml = isHtml || (body && typeof body === 'string' && 
      (body.includes('<div') || body.includes('<p>') || body.includes('<br') || 
       body.includes('<span') || body.includes('<table')))

    const accessToken = await getDecryptedAccessToken(userId, "gmail")
    
    // Initialize Gmail API
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Build email headers
    const headers: Record<string, string> = {
      'To': Array.isArray(to) ? to.join(', ') : to,
      'Subject': subject,
      'From': from || 'me', // Use specified sender or default to authenticated user
    }

    if (cc) {
      headers['Cc'] = Array.isArray(cc) ? cc.join(', ') : cc
    }

    if (bcc) {
      headers['Bcc'] = Array.isArray(bcc) ? bcc.join(', ') : bcc
    }

    if (replyTo) {
      headers['Reply-To'] = replyTo
    }

    // Set priority headers
    if (priority === 'high') {
      headers['X-Priority'] = '1'
      headers['Importance'] = 'High'
    } else if (priority === 'low') {
      headers['X-Priority'] = '5'
      headers['Importance'] = 'Low'
    }

    // Request read receipt
    if (readReceipt) {
      headers['Disposition-Notification-To'] = 'me'
      headers['Return-Receipt-To'] = 'me'
    }

    // Add tracking pixels if requested (basic implementation)
    let finalBody = body
    if (signature) {
      finalBody = bodyIsHtml 
        ? `${body}<br><br>${signature}`
        : `${body}\n\n${signature}`
    }

    if (trackOpens && bodyIsHtml) {
      // Add invisible tracking pixel (would need backend to actually track)
      const trackingId = `${userId}_${Date.now()}`
      finalBody += `<img src="https://your-tracking-domain.com/track/open/${trackingId}" width="1" height="1" style="display:none;" />`
    }

    // Build MIME message
    const boundary = `boundary_${Date.now()}`
    const messageParts = []

    // Add headers
    for (const [key, value] of Object.entries(headers)) {
      messageParts.push(`${key}: ${value}`)
    }
    messageParts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)
    messageParts.push('')
    messageParts.push(`--${boundary}`)

    // Add body
    if (bodyIsHtml) {
      messageParts.push('Content-Type: text/html; charset=utf-8')
    } else {
      messageParts.push('Content-Type: text/plain; charset=utf-8')
    }
    messageParts.push('')
    messageParts.push(finalBody)

    
    // Handle attachments based on sourceType
    let attachmentList: any[] = [];
    
    // Determine attachment source based on sourceType or legacy attachments field
    
    // Check both uploadedFiles and attachments field (for compatibility with GmailAttachmentField)
    if (sourceType === 'file' && (uploadedFiles || attachments)) {
      const fileData = uploadedFiles || attachments;
      // Handle uploaded files from the file field
      
      if (typeof fileData === 'string') {
        // It's a file ID from storage
        attachmentList = [fileData];
      } else if (Array.isArray(fileData)) {
        // It's an array of uploaded files
        attachmentList = fileData;
      } else if (fileData && typeof fileData === 'object') {
        // It's a single file object - check if it has content directly (from GmailAttachmentField)
        if (fileData.content && fileData.fileName) {
          // The file already has base64 content, use it directly
          attachmentList = [fileData];
        } else {
          attachmentList = [fileData];
        }
      }
    } else if (sourceType === 'url' && fileUrl) {
      // Handle file from URL - would need to download first
      // File from URL not yet implemented
    } else if (sourceType === 'node' && fileFromNode) {
      // Handle file from previous node (variable reference)
      
      // Check if fileFromNode is already a file object from Google Drive
      if (fileFromNode && typeof fileFromNode === 'object') {
        // Check for Google Drive Get File structure: {file: {content, filename, mimeType}}
        if (fileFromNode.file && fileFromNode.file.content) {
          attachmentList = [fileFromNode.file]; // Use the file object directly
        } else if (fileFromNode.content) {
          // Direct file object with content
          attachmentList = [fileFromNode];
        } else if (fileFromNode.uploadedFiles && Array.isArray(fileFromNode.uploadedFiles)) {
          // Google Drive Upload File result structure
          // Each uploaded file has: {fileId, fileName, mimeType, webViewLink, webContentLink}
          // We need to fetch these files' content
          for (const uploadedFile of fileFromNode.uploadedFiles) {
            if (uploadedFile.fileId) {
              // This is just metadata, we'd need to fetch the actual file content
              // For now, log a warning
              // Google Drive Upload result contains file metadata only. Use Google Drive Get File action to retrieve file content.
            }
          }
          attachmentList = []; // Can't attach without content
        } else if (fileFromNode.fileId || fileFromNode.id) {
          // It might be a reference object with just the ID
          attachmentList = [fileFromNode];
        } else if (Array.isArray(fileFromNode)) {
          attachmentList = fileFromNode;
        } else {
          // Unknown structure, try to use it as is
          attachmentList = [fileFromNode];
        }
      } else if (typeof fileFromNode === 'string') {
        // It's a file ID string
        attachmentList = [fileFromNode];
      } else if (Array.isArray(fileFromNode)) {
        attachmentList = fileFromNode;
      }
    } else if (uploadedFiles && sourceType === 'file') {
      // Handle uploaded files from Gmail attachment upload
      attachmentList = Array.isArray(uploadedFiles) ? uploadedFiles : [uploadedFiles];
    } else if (attachments) {
      // Legacy support for existing workflows using attachments field
      attachmentList = Array.isArray(attachments) ? attachments : [attachments];
    }
    
    // Process attachments
    for (const attachment of attachmentList) {
      try {
        let fileData: any = null;

        if (
          attachment &&
          typeof attachment === 'object' &&
          attachment.isTemporary &&
          typeof attachment.filePath === 'string'
        ) {
          cleanupPaths.add(attachment.filePath)
        }

        // Check if it's an uploaded file object with id (from file upload field)
        if (attachment && typeof attachment === 'object' && attachment.id) {
          // File uploaded via the standard workflow file upload
          try {
            const storedFile = await FileStorageService.getFile(attachment.id, userId);
            if (storedFile) {
              const arrayBuffer = await storedFile.file.arrayBuffer();
              const base64Content = Buffer.from(arrayBuffer).toString('base64');
              
              fileData = {
                data: base64Content,
                fileName: attachment.fileName || storedFile.fileName || 'attachment',
                mimeType: attachment.fileType || storedFile.fileType || 'application/octet-stream'
              };
            }
          } catch (error) {
            logger.error('📎 [sendGmailEmail] Error fetching file from storage:', error);
          }
        } else if (attachment && typeof attachment === 'object' && attachment.content && attachment.fileName) {
          // File with inline content (for backwards compatibility)
          fileData = {
            data: attachment.content, // Already base64 encoded
            fileName: attachment.fileName || attachment.name || 'attachment',
            mimeType: attachment.mimeType || attachment.fileType || attachment.type || 'application/octet-stream'
          };
        } else if (attachment && typeof attachment === 'object' && attachment.name && !attachment.content && !attachment.file) {
          // This is a file metadata object from the upload field
          // Check if it's a Google Drive file that we can fetch
          if (attachment.id && attachment.id.startsWith('google-drive-')) {
            
            try {
              // Extract the actual file ID from the Google Drive ID format
              const fileId = attachment.id.replace('google-drive-', '');
              
              // Import and use the Google Drive get file function
              const { getGoogleDriveFile } = await import('../googleDrive/getFile');
              
              // Fetch the file content from Google Drive
              const driveResult = await getGoogleDriveFile(
                { fileId },
                userId,
                input
              );
              
              if (driveResult.success && driveResult.output?.file) {
                fileData = {
                  data: driveResult.output.file.content,
                  fileName: driveResult.output.file.filename || attachment.name,
                  mimeType: driveResult.output.file.mimeType || attachment.type || 'application/octet-stream'
                };
              } else {
                continue;
              }
            } catch (error) {
              // Error fetching Google Drive file
              continue;
            }
          } else if (attachment.filePath) {
            // File uploaded to storage but content not included inline
            
            try {
              const { createClient } = await import('@supabase/supabase-js');
              const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
              const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
              const supabase = createClient(supabaseUrl, supabaseServiceKey);
              
              const { data: storageFile, error } = await supabase.storage
                .from('workflow-files')
                .download(attachment.filePath);
              
              if (error) {
                logger.error('📎 [sendGmailEmail] Error downloading file from storage:', error);
                continue;
              }
              
              if (storageFile) {
                const arrayBuffer = await storageFile.arrayBuffer();
                const base64Content = Buffer.from(arrayBuffer).toString('base64');
                
                fileData = {
                  data: base64Content,
                  fileName: attachment.fileName || attachment.name || 'attachment',
                  mimeType: attachment.mimeType || attachment.fileType || attachment.type || 'application/octet-stream'
                };
                }
            } catch (error) {
              logger.error('📎 [sendGmailEmail] Error fetching file from storage:', error);
              continue;
            }
          } else {
            // Regular file upload without content - skip
            // Skipping file attachment - file content not available
            continue;
          }
        } else if (attachment && typeof attachment === 'object' && attachment.content) {
          // Direct file object with content (e.g., from Google Drive Get File)
          fileData = {
            data: attachment.content, // Already base64 encoded
            fileName: attachment.filename || attachment.fileName || attachment.name || 'attachment',
            mimeType: attachment.mimeType || attachment.type || 'application/octet-stream'
          };
        } else if (attachment && typeof attachment === 'object' && attachment.file && attachment.file.content) {
          // Nested file object (e.g., {{nodeId.file}})
          fileData = {
            data: attachment.file.content, // Already base64 encoded
            fileName: attachment.file.filename || attachment.file.fileName || attachment.file.name || attachment.fileName || 'attachment',
            mimeType: attachment.file.mimeType || attachment.file.type || 'application/octet-stream'
          };
        } else if (typeof attachment === 'string') {
          // File ID from FileStorageService
          // Fetching file from storage with ID
          fileData = await FileStorageService.getFile(attachment, userId);
        } else {
          // Unknown attachment structure, skipping
        }
        
        if (fileData) {
          
          messageParts.push(`--${boundary}`)
          messageParts.push(`Content-Type: ${fileData.mimeType || 'application/octet-stream'}`)
          messageParts.push(`Content-Transfer-Encoding: base64`)
          messageParts.push(`Content-Disposition: attachment; filename="${fileData.fileName}"`)
          messageParts.push('')
          messageParts.push(fileData.data)
        } else {
          // No fileData for attachment, skipping
        }
      } catch (error) {
        logger.error(`Failed to attach file:`, error)
      }
    }

    messageParts.push(`--${boundary}--`)

    // Encode message
    const message = messageParts.join('\r\n')
    const encodedMessage = Buffer.from(message).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    // Handle scheduled send
    if (scheduleSend) {
      // Gmail doesn't have native scheduled send via API
      // Would need to implement with a job queue
      // Scheduled send requested but not implemented yet
      // For now, send immediately
    }

    // Send the email
    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
        labelIds: labels.length > 0 ? labels : undefined
      }
    })

    // Apply labels if specified
    if (labels.length > 0 && result.data.id) {
      try {
        await gmail.users.messages.modify({
          userId: 'me',
          id: result.data.id,
          requestBody: {
            addLabelIds: labels
          }
        })
      } catch (labelError) {
        logger.error('Failed to apply labels:', labelError)
      }
    }

    return {
      success: true,
      output: {
        messageId: result.data.id,
        threadId: result.data.threadId,
        to,
        subject,
        labelIds: result.data.labelIds
      },
      message: `Email sent successfully to ${Array.isArray(to) ? to.join(', ') : to}`
    }

  } catch (error: any) {
    logger.error('Send Gmail error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to send email'
    }
  } finally {
    if (cleanupPaths.size > 0) {
      await deleteWorkflowTempFiles(cleanupPaths)
    }
  }
}
