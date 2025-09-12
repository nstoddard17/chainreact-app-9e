import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { FileStorageService } from "@/lib/storage/fileStorage"
import { google } from 'googleapis'

/**
 * Enhanced Gmail send email with all field support
 */
export async function sendGmailEmail(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Config is already resolved if coming from GmailIntegrationService
    // Only resolve if it contains template variables
    const needsResolution = typeof config === 'object' && 
      Object.values(config).some(v => 
        typeof v === 'string' && v.includes('{{') && v.includes('}}')
      )
    
    const resolvedConfig = needsResolution ? resolveValue(config, { input }) : config
    const {
      to,
      cc,
      bcc,
      subject,
      body,
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
      'From': 'me', // Gmail API uses 'me' for authenticated user
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
    let messageParts = []

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

    // Debug logging for attachment fields
    console.log('📎 [sendGmailEmail] Attachment config:', {
      sourceType,
      sourceTypeValue: sourceType,
      sourceTypeIsFile: sourceType === 'file',
      uploadedFiles,
      uploadedFilesType: typeof uploadedFiles,
      uploadedFilesIsArray: Array.isArray(uploadedFiles),
      uploadedFilesLength: Array.isArray(uploadedFiles) ? uploadedFiles.length : 'N/A',
      hasUploadedFiles: !!uploadedFiles,
      fileUrl,
      fileFromNode,
      attachments,
      hasAttachments: !!attachments,
      attachmentsType: typeof attachments,
      resolvedConfig,
      originalConfig: config,
      inputData: input
    });
    
    // Handle attachments based on sourceType
    let attachmentList: any[] = [];
    
    // Determine attachment source based on sourceType or legacy attachments field
    console.log('📎 [sendGmailEmail] Checking attachment source:', {
      sourceType,
      hasUploadedFiles: !!uploadedFiles,
      hasAttachments: !!attachments,
      conditionMet: sourceType === 'file' && (uploadedFiles || attachments)
    });
    
    // Check both uploadedFiles and attachments field (for compatibility with GmailAttachmentField)
    if (sourceType === 'file' && (uploadedFiles || attachments)) {
      const fileData = uploadedFiles || attachments;
      // Handle uploaded files from the file field
      console.log('📎 [sendGmailEmail] ENTERING FILE UPLOAD BRANCH - Processing file data:', {
        type: typeof fileData,
        isArray: Array.isArray(fileData),
        hasContent: fileData?.content ? 'yes' : 'no',
        hasNodeId: fileData?.nodeId ? 'yes' : 'no',
        keys: fileData && typeof fileData === 'object' ? Object.keys(fileData) : null
      });
      
      if (typeof fileData === 'string') {
        // It's a file ID from storage
        console.log('📎 [sendGmailEmail] String file ID detected');
        attachmentList = [fileData];
      } else if (Array.isArray(fileData)) {
        // It's an array of uploaded files
        console.log('📎 [sendGmailEmail] Array of files detected:', fileData.length, 'files');
        attachmentList = fileData;
      } else if (fileData && typeof fileData === 'object') {
        // It's a single file object - check if it has content directly (from GmailAttachmentField)
        if (fileData.content && fileData.fileName) {
          console.log('📎 [sendGmailEmail] File object with content detected (from GmailAttachmentField)');
          // The file already has base64 content, use it directly
          attachmentList = [fileData];
        } else {
          console.log('📎 [sendGmailEmail] Single file object detected');
          attachmentList = [fileData];
        }
      }
    } else if (sourceType === 'url' && fileUrl) {
      // Handle file from URL - would need to download first
      console.log('File from URL not yet implemented:', fileUrl);
    } else if (sourceType === 'node' && fileFromNode) {
      // Handle file from previous node (variable reference)
      console.log('📎 [sendGmailEmail] Processing fileFromNode:', JSON.stringify(fileFromNode, null, 2));
      
      // Check if fileFromNode is already a file object from Google Drive
      if (fileFromNode && typeof fileFromNode === 'object') {
        // Check for Google Drive Get File structure: {file: {content, filename, mimeType}}
        if (fileFromNode.file && fileFromNode.file.content) {
          console.log('📎 Detected Google Drive Get File structure');
          attachmentList = [fileFromNode.file]; // Use the file object directly
        } else if (fileFromNode.content) {
          // Direct file object with content
          console.log('📎 Detected direct file object with content');
          attachmentList = [fileFromNode];
        } else if (fileFromNode.uploadedFiles && Array.isArray(fileFromNode.uploadedFiles)) {
          // Google Drive Upload File result structure
          console.log('📎 Detected Google Drive Upload File result');
          // Each uploaded file has: {fileId, fileName, mimeType, webViewLink, webContentLink}
          // We need to fetch these files' content
          for (const uploadedFile of fileFromNode.uploadedFiles) {
            if (uploadedFile.fileId) {
              // This is just metadata, we'd need to fetch the actual file content
              // For now, log a warning
              console.warn('📎 Google Drive Upload result contains file metadata only. Use Google Drive Get File action to retrieve file content.');
            }
          }
          attachmentList = []; // Can't attach without content
        } else if (fileFromNode.fileId || fileFromNode.id) {
          // It might be a reference object with just the ID
          console.log('📎 Detected file ID reference');
          attachmentList = [fileFromNode];
        } else if (Array.isArray(fileFromNode)) {
          console.log('📎 Detected array of files');
          attachmentList = fileFromNode;
        } else {
          // Unknown structure, try to use it as is
          console.log('📎 Unknown structure, using as is');
          attachmentList = [fileFromNode];
        }
      } else if (typeof fileFromNode === 'string') {
        // It's a file ID string
        console.log('📎 Detected file ID string');
        attachmentList = [fileFromNode];
      } else if (Array.isArray(fileFromNode)) {
        console.log('📎 Detected array');
        attachmentList = fileFromNode;
      }
    } else if (uploadedFiles && sourceType === 'file') {
      // Handle uploaded files from Gmail attachment upload
      console.log('📎 [sendGmailEmail] Processing uploaded files:', uploadedFiles);
      attachmentList = Array.isArray(uploadedFiles) ? uploadedFiles : [uploadedFiles];
    } else if (attachments) {
      // Legacy support for existing workflows using attachments field
      attachmentList = Array.isArray(attachments) ? attachments : [attachments];
    }
    
    console.log('📎 [sendGmailEmail] Final attachmentList:', {
      count: attachmentList.length,
      items: attachmentList
    });
    
    // Process attachments
    for (const attachment of attachmentList) {
      try {
        let fileData: any = null;
        
        console.log('📎 [sendGmailEmail] Processing attachment:', {
          type: typeof attachment,
          hasId: attachment?.id ? 'yes' : 'no',
          hasContent: attachment?.content ? 'yes' : 'no',
          hasFile: attachment?.file ? 'yes' : 'no',
          hasFileName: attachment?.fileName || attachment?.filename ? 'yes' : 'no',
          structure: attachment ? Object.keys(attachment) : null,
          fullAttachment: attachment
        });
        
        // Check if it's an uploaded file object with id (from file upload field)
        if (attachment && typeof attachment === 'object' && attachment.id) {
          // File uploaded via the standard workflow file upload
          console.log('📎 [sendGmailEmail] Fetching uploaded file with ID:', attachment.id);
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
              console.log('📎 [sendGmailEmail] Successfully retrieved file from storage');
            }
          } catch (error) {
            console.error('📎 [sendGmailEmail] Error fetching file from storage:', error);
          }
        } else if (attachment && typeof attachment === 'object' && attachment.content && attachment.fileName) {
          // File with inline content (for backwards compatibility)
          console.log('📎 [sendGmailEmail] Using file with inline content');
          fileData = {
            data: attachment.content, // Already base64 encoded
            fileName: attachment.fileName || attachment.name || 'attachment',
            mimeType: attachment.mimeType || attachment.fileType || attachment.type || 'application/octet-stream'
          };
        } else if (attachment && typeof attachment === 'object' && attachment.name && !attachment.content && !attachment.file) {
          // This is a file metadata object from the upload field
          // Check if it's a Google Drive file that we can fetch
          if (attachment.id && attachment.id.startsWith('google-drive-')) {
            console.log('📎 Detected Google Drive file metadata, attempting to fetch content:', attachment.name);
            
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
                console.log('📎 Successfully fetched Google Drive file content');
              } else {
                console.log('📎 Failed to fetch Google Drive file content');
                continue;
              }
            } catch (error) {
              console.warn('📎 Error fetching Google Drive file:', error);
              continue;
            }
          } else if (attachment.filePath) {
            // File uploaded to storage but content not included inline
            console.log('📎 [sendGmailEmail] Fetching file from storage path:', attachment.filePath);
            
            try {
              const { createClient } = await import('@supabase/supabase-js');
              const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
              const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
              const supabase = createClient(supabaseUrl, supabaseServiceKey);
              
              const { data: storageFile, error } = await supabase.storage
                .from('workflow-files')
                .download(attachment.filePath);
              
              if (error) {
                console.error('📎 [sendGmailEmail] Error downloading file from storage:', error);
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
                console.log('📎 [sendGmailEmail] Successfully retrieved file from storage');
              }
            } catch (error) {
              console.error('📎 [sendGmailEmail] Error fetching file from storage:', error);
              continue;
            }
          } else {
            // Regular file upload without content - skip
            console.log('Skipping file attachment - file content not available:', attachment.name);
            continue;
          }
        } else if (attachment && typeof attachment === 'object' && attachment.content) {
          // Direct file object with content (e.g., from Google Drive Get File)
          fileData = {
            data: attachment.content, // Already base64 encoded
            fileName: attachment.filename || attachment.fileName || attachment.name || 'attachment',
            mimeType: attachment.mimeType || attachment.type || 'application/octet-stream'
          };
          console.log('📎 Using direct file object with content:', {
            fileName: fileData.fileName,
            mimeType: fileData.mimeType,
            dataLength: fileData.data?.length
          });
        } else if (attachment && typeof attachment === 'object' && attachment.file && attachment.file.content) {
          // Nested file object (e.g., {{node.output.file}})
          fileData = {
            data: attachment.file.content, // Already base64 encoded
            fileName: attachment.file.filename || attachment.file.fileName || attachment.file.name || attachment.fileName || 'attachment',
            mimeType: attachment.file.mimeType || attachment.file.type || 'application/octet-stream'
          };
          console.log('📎 Using nested file object');
        } else if (typeof attachment === 'string') {
          // File ID from FileStorageService
          console.log('📎 Fetching file from storage with ID:', attachment);
          fileData = await FileStorageService.getFile(attachment, userId);
        } else {
          console.log('📎 Unknown attachment structure, skipping:', attachment);
        }
        
        if (fileData) {
          console.log('📎 Adding attachment to MIME message:', {
            fileName: fileData.fileName,
            mimeType: fileData.mimeType,
            dataLength: fileData.data?.length
          });
          
          messageParts.push(`--${boundary}`)
          messageParts.push(`Content-Type: ${fileData.mimeType || 'application/octet-stream'}`)
          messageParts.push(`Content-Transfer-Encoding: base64`)
          messageParts.push(`Content-Disposition: attachment; filename="${fileData.fileName}"`)
          messageParts.push('')
          messageParts.push(fileData.data)
        } else {
          console.log('📎 No fileData for attachment, skipping');
        }
      } catch (error) {
        console.warn(`Failed to attach file:`, error)
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
      console.log('Scheduled send requested for:', scheduleSend)
      // For now, send immediately with a note
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
        console.warn('Failed to apply labels:', labelError)
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
    console.error('Send Gmail error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to send email'
    }
  }
}