/**
 * Slack Send Message Action
 * Supports both simple messages and interactive messages with Block Kit
 */

import { ExecutionContext } from '../../executeNode';

export async function sendSlackMessage(context: ExecutionContext): Promise<any> {
  const {
    channel,
    message,
    asUser = false,  // Default to false (don't customize bot appearance)
    username,
    icon,  // Changed from iconEmoji to match schema
    attachments,  // Added attachments field from schema
    linkNames = false,  // Added from schema
    unfurlLinks = true,
    threadTimestamp,
    unfurlMedia = true,
    messageType = 'simple',
    buttonConfig,
    statusTitle,
    statusMessage: statusText,
    statusColor,
    statusFields,
    approvalTitle,
    approvalDescription,
    approvalApproveText,
    approvalDenyText,
    pollQuestion,
    pollOptions,
    customBlocks,
    legacyAttachments
  } = context.config;

  console.log('[Slack] Preparing to send message:', {
    channel,
    messageLength: message?.length,
    messageType,
    hasButtons: !!buttonConfig,
    hasStatus: !!statusTitle,
    hasPoll: !!pollQuestion,
    asUser,
    username,
    icon,
    hasUsername: !!username,
    hasIcon: !!icon
  });

  // Validate required fields
  if (!channel) {
    throw new Error('Channel is required for sending Slack messages');
  }

  if (!message && messageType === 'simple') {
    throw new Error('Message text is required for simple messages');
  }

  // Check test mode
  if (context.testMode) {
    console.log('[Slack] Test mode - simulating message send');
    return {
      success: true,
      messageId: `test_slack_${Date.now()}`,
      channel,
      message: message || 'Interactive message',
      timestamp: new Date().toISOString(),
      testMode: true
    };
  }

  // Get the Slack integration
  const integration = await context.getIntegration('slack');
  if (!integration) {
    throw new Error('Slack integration not found. Please connect your Slack account.');
  }

  if (!integration.access_token) {
    throw new Error('Slack access token not found. Please reconnect your Slack account.');
  }

  // Log OAuth scopes for debugging customization issues
  if (integration.scopes) {
    const scopes = Array.isArray(integration.scopes)
      ? integration.scopes
      : (typeof integration.scopes === 'string' ? integration.scopes.split(',') : []);

    const hasCustomizeScope = scopes.includes('chat:write.customize');
    console.log('[Slack] 🔑 OAuth Scopes Available:', {
      totalScopes: scopes.length,
      hasCustomizeScope,
      scopes: scopes.length > 0 ? scopes.join(', ') : 'none'
    });

    if ((username || icon) && !hasCustomizeScope) {
      console.warn('[Slack] ⚠️ Bot customization requested but chat:write.customize scope is missing!');
      console.warn('[Slack] ℹ️ To enable customization: Disconnect and reconnect your Slack integration');
    }
  } else {
    console.log('[Slack] ⚠️ No scope information available for this integration');
  }

  // Import decryptToken function for token handling
  const { decryptToken } = await import('@/lib/integrations/tokenUtils');

  // Determine which token to use based on asUser flag
  let tokenToUse: string;
  let isActuallyUsingUserToken = false;

  console.log('[Slack] Token selection - asUser:', asUser, 'has_user_token:', integration.metadata?.has_user_token);

  if (asUser) {
    // User wants to send as themselves
    if (integration.metadata?.has_user_token && integration.metadata?.user_token) {
      console.log('[Slack] Attempting to decrypt and use USER token to send as actual user');

      // Decrypt the user token from metadata
      const userToken = await decryptToken(integration.metadata.user_token);

      if (userToken && userToken.startsWith('xoxp-')) {
        tokenToUse = userToken;
        isActuallyUsingUserToken = true;
        console.log('[Slack] ✅ Successfully using USER token (xoxp-) - message will appear as sent by the user');
      } else if (userToken) {
        // Token exists but might not be the right format
        console.warn('[Slack] User token exists but may not be valid format:', userToken.substring(0, 5) + '...');
        tokenToUse = userToken;
        isActuallyUsingUserToken = true;
      } else {
        // Failed to decrypt user token, fall back to bot token
        console.warn('[Slack] ⚠️ Failed to decrypt user token, falling back to BOT token with customization');
        tokenToUse = await decryptToken(integration.access_token);
        isActuallyUsingUserToken = false;
      }
    } else {
      // No user token available
      console.log('[Slack] ⚠️ User requested to send as user, but user token not available. Using BOT token.');
      tokenToUse = await decryptToken(integration.access_token);
      isActuallyUsingUserToken = false;
    }
  } else {
    // User wants to send as bot
    console.log('[Slack] Using BOT token (xoxb-) to send as bot/app');
    tokenToUse = await decryptToken(integration.access_token);
    isActuallyUsingUserToken = false;
  }

  // Ensure we have a valid token
  if (!tokenToUse) {
    throw new Error('Failed to decrypt Slack token. Please reconnect your Slack account.');
  }

  // Log token type for debugging (safely, without exposing the full token)
  const tokenType = tokenToUse.startsWith('xoxp-') ? 'USER' : tokenToUse.startsWith('xoxb-') ? 'BOT' : 'UNKNOWN';
  console.log(`[Slack] Using ${tokenType} token (${tokenToUse.substring(0, 10)}...)`);
  console.log('[Slack] Will message appear as user?', isActuallyUsingUserToken);

  try {
    // Prepare the message payload
    // Channel format: Can be channel ID (C1234567890), channel name (#general), or user ID for DMs
    // Bot tokens can use channel names with #, user tokens work better with IDs
    const messagePayload: any = {
      channel: channel.startsWith('#') ? channel : (channel.startsWith('C') || channel.startsWith('U') || channel.startsWith('D') ? channel : `#${channel}`),
      text: message || '',
      unfurl_links: unfurlLinks,
      unfurl_media: unfurlMedia,
      link_names: linkNames  // Added link_names from schema
    };

    // Declare iconUrl at a higher scope for use in diagnostic logging
    let iconUrl: string | null = null;

    if (isActuallyUsingUserToken) {
      // When using user token, the message is automatically sent as the user
      // Username/icon customization is ignored by Slack when using user token
      console.log('[Slack] 👤 Using USER token - Message will appear as sent by the actual user');
      console.log('[Slack] Note: Username/icon customization is ignored when using user token');
      // Don't add any customization fields - the user's actual profile is used
    } else {
      // Using bot token - customization is allowed
      console.log('[Slack] 🤖 Using BOT token - customization available');

      // Add custom username if provided
      // This overrides the bot's default name for this message only
      if (username) {
        messagePayload.username = username;
        console.log('[Slack] Setting custom bot username:', username);
      }

      // Handle icon field - upload to Supabase if needed and get public URL
      if (icon) {
        console.log('[Slack] Processing icon field, type:', typeof icon, 'length:', typeof icon === 'string' ? icon.length : 'N/A');

        // CRITICAL: If icon is just raw base64 (very long string), don't send it to Slack
        // Slack has a limit and will reject large payloads
        if (typeof icon === 'string' && icon.length > 10000 && !icon.startsWith('http') && !icon.startsWith('data:')) {
          console.warn('[Slack] ⚠️ Icon appears to be raw base64 data (length:', icon.length, '). Will attempt to upload to Supabase.');
          // Force processing as raw base64
        }

        if (typeof icon === 'string') {
          // Check if it's a URL
          if (icon.startsWith('http://') || icon.startsWith('https://')) {
            iconUrl = icon;
            console.log('[Slack] Icon is already a URL');
          } else if (icon.startsWith('data:')) {
            // It's a base64 data URL - need to upload to Supabase
            console.log('[Slack] Converting base64 data URL icon to public URL...');
            try {
              // Import Supabase client
              const { createClient } = await import('@supabase/supabase-js');
              const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
              const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
              const supabase = createClient(supabaseUrl, supabaseServiceKey);

              // Extract base64 data and mime type
              const matches = icon.match(/^data:([^;]+);base64,(.+)$/);
              if (matches) {
                const mimeType = matches[1];
                const base64Data = matches[2];
                const buffer = Buffer.from(base64Data, 'base64');

                // Generate unique filename
                const extension = mimeType.split('/')[1] || 'png';
                const fileName = `slack-icons/${context.userId}/${Date.now()}.${extension}`;

                // Ensure bucket exists
                const { data: buckets } = await supabase.storage.listBuckets();
                const bucketExists = buckets?.some(b => b.name === 'slack-attachments');

                if (!bucketExists) {
                  await supabase.storage.createBucket('slack-attachments', {
                    public: true,
                    fileSizeLimit: 50 * 1024 * 1024
                  });
                }

                // Upload icon
                const { data: uploadData, error: uploadError } = await supabase.storage
                  .from('slack-attachments')
                  .upload(fileName, buffer, {
                    contentType: mimeType,
                    cacheControl: '3600',
                    upsert: false
                  });

                if (!uploadError && uploadData) {
                  const { data: { publicUrl } } = supabase.storage
                    .from('slack-attachments')
                    .getPublicUrl(fileName);

                  iconUrl = publicUrl;
                  console.log('[Slack] Icon uploaded to public storage:', fileName);
                }
              }
            } catch (error) {
              console.error('[Slack] Error uploading icon:', error);
            }
          } else {
            // Raw base64 data without data URL prefix - common from file uploads
            console.log('[Slack] Detected raw base64 data (no data: prefix), attempting to convert...');
            try {
              // Import Supabase client
              const { createClient } = await import('@supabase/supabase-js');
              const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
              const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
              const supabase = createClient(supabaseUrl, supabaseServiceKey);

              // Assume it's base64 image data (likely PNG or JPEG)
              const buffer = Buffer.from(icon, 'base64');

              // Try to detect mime type from buffer magic numbers
              let mimeType = 'image/png'; // default
              if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
                mimeType = 'image/jpeg';
              } else if (buffer[0] === 0x89 && buffer[1] === 0x50) {
                mimeType = 'image/png';
              } else if (buffer[0] === 0x47 && buffer[1] === 0x49) {
                mimeType = 'image/gif';
              }

              // Generate unique filename
              const extension = mimeType.split('/')[1] || 'png';
              const fileName = `slack-icons/${context.userId}/${Date.now()}.${extension}`;

              // Ensure bucket exists
              const { data: buckets } = await supabase.storage.listBuckets();
              const bucketExists = buckets?.some(b => b.name === 'slack-attachments');

              if (!bucketExists) {
                await supabase.storage.createBucket('slack-attachments', {
                  public: true,
                  fileSizeLimit: 50 * 1024 * 1024
                });
              }

              // Upload icon
              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('slack-attachments')
                .upload(fileName, buffer, {
                  contentType: mimeType,
                  cacheControl: '3600',
                  upsert: false
                });

              if (!uploadError && uploadData) {
                const { data: { publicUrl } } = supabase.storage
                  .from('slack-attachments')
                  .getPublicUrl(fileName);

                iconUrl = publicUrl;
                console.log('[Slack] Raw base64 icon uploaded to public storage:', fileName);
              } else if (uploadError) {
                console.error('[Slack] Error uploading raw base64 icon:', uploadError);
              }
            } catch (error) {
              console.error('[Slack] Error processing raw base64 icon:', error);
              console.warn('[Slack] Icon must be a valid URL (http:// or https://) or base64 data');
            }
          }
        } else if (icon && typeof icon === 'object') {
          // Handle uploaded file object
          if (icon.url) {
            iconUrl = icon.url;
          } else if (icon.filePath) {
            // Upload file from storage to public URL
            console.log('[Slack] Converting uploaded icon to public URL...');
            try {
              const { createClient } = await import('@supabase/supabase-js');
              const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
              const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
              const supabase = createClient(supabaseUrl, supabaseServiceKey);

              // Download from workflow storage
              const { data: storageFile, error } = await supabase.storage
                .from('workflow-files')
                .download(icon.filePath);

              if (!error && storageFile) {
                const arrayBuffer = await storageFile.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                // Upload to public storage
                const fileName = `slack-icons/${context.userId}/${Date.now()}-icon`;

                // Ensure bucket exists
                const { data: buckets } = await supabase.storage.listBuckets();
                const bucketExists = buckets?.some(b => b.name === 'slack-attachments');

                if (!bucketExists) {
                  await supabase.storage.createBucket('slack-attachments', {
                    public: true,
                    fileSizeLimit: 50 * 1024 * 1024
                  });
                }

                const { data: uploadData, error: uploadError } = await supabase.storage
                  .from('slack-attachments')
                  .upload(fileName, buffer, {
                    contentType: icon.mimeType || icon.fileType || 'image/png',
                    cacheControl: '3600',
                    upsert: false
                  });

                if (!uploadError && uploadData) {
                  const { data: { publicUrl } } = supabase.storage
                    .from('slack-attachments')
                    .getPublicUrl(fileName);

                  iconUrl = publicUrl;
                  console.log('[Slack] Icon uploaded from storage:', fileName);
                }
              }
            } catch (error) {
              console.error('[Slack] Error uploading icon from storage:', error);
            }
          } else if (icon.data || icon.content) {
            // Handle base64 data in object format
            const base64Data = icon.data || icon.content;
            if (base64Data && typeof base64Data === 'string') {
              console.log('[Slack] Converting icon data to public URL (object format, length:', base64Data.length, ')...');
              try {
                const { createClient } = await import('@supabase/supabase-js');
                const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
                const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
                const supabase = createClient(supabaseUrl, supabaseServiceKey);

                let buffer: Buffer;
                let mimeType: string;

                // Check if it has data URL prefix or is raw base64
                const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
                if (matches) {
                  // Has data URL prefix
                  mimeType = matches[1];
                  const base64Content = matches[2];
                  buffer = Buffer.from(base64Content, 'base64');
                } else {
                  // Raw base64 data
                  buffer = Buffer.from(base64Data, 'base64');

                  // Try to detect mime type from buffer magic numbers
                  mimeType = 'image/png'; // default
                  if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
                    mimeType = 'image/jpeg';
                  } else if (buffer[0] === 0x89 && buffer[1] === 0x50) {
                    mimeType = 'image/png';
                  } else if (buffer[0] === 0x47 && buffer[1] === 0x49) {
                    mimeType = 'image/gif';
                  }
                }

                  // Generate unique filename
                  const extension = mimeType.split('/')[1] || 'png';
                  const fileName = `slack-icons/${context.userId}/${Date.now()}.${extension}`;

                  // Ensure bucket exists
                  const { data: buckets } = await supabase.storage.listBuckets();
                  const bucketExists = buckets?.some(b => b.name === 'slack-attachments');

                  if (!bucketExists) {
                    await supabase.storage.createBucket('slack-attachments', {
                      public: true,
                      fileSizeLimit: 50 * 1024 * 1024
                    });
                  }

                  // Upload icon
                  const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('slack-attachments')
                    .upload(fileName, buffer, {
                      contentType: mimeType,
                      cacheControl: '3600',
                      upsert: false
                    });

                if (!uploadError && uploadData) {
                  const { data: { publicUrl } } = supabase.storage
                    .from('slack-attachments')
                    .getPublicUrl(fileName);

                  iconUrl = publicUrl;
                  console.log('[Slack] Icon data uploaded to public storage:', fileName);
                } else if (uploadError) {
                  console.error('[Slack] Error uploading icon data:', uploadError);
                }
              } catch (error) {
                console.error('[Slack] Error uploading icon data:', error);
              }
            }
          }
        }

        if (iconUrl) {
          messagePayload.icon_url = iconUrl;
          console.log('[Slack] Setting bot icon_url:', iconUrl);
        } else if (icon && typeof icon === 'string' && icon.length > 1000) {
          // If we couldn't process the icon and it's very long (likely base64), don't include it
          console.warn('[Slack] ⚠️ Icon could not be processed and appears to be raw data. Skipping icon to avoid API error.');
          // Don't set any icon field - better to have no icon than to fail the entire message
        }
      }

      if (!username && !icon) {
        console.log('[Slack] No customization provided - using bot defaults');
      } else {
        console.log('[Slack] Note: Customization may be ignored if workspace has "Lock bot name & icon" enabled');
      }
    }

    // Handle file attachments from the schema's attachments field
    // Upload files to Supabase storage and get public URLs for Slack
    if (attachments) {
      console.log('[Slack] Processing file attachments...');
      const attachmentUrls: string[] = [];

      // Import Supabase client
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Ensure attachments is an array
      const attachmentArray = Array.isArray(attachments) ? attachments : [attachments];

      for (const attachment of attachmentArray) {
        try {
          let fileUrl: string | null = null;

          if (typeof attachment === 'string') {
            // It's already a URL
            if (attachment.startsWith('http')) {
              fileUrl = attachment;
            }
          } else if (attachment && typeof attachment === 'object') {
            // Check if it's a file object with content or path
            if (attachment.filePath) {
              // File already uploaded to workflow-files storage
              console.log('[Slack] Processing uploaded file:', attachment.fileName || 'attachment');

              // Download the file from workflow storage
              const { data: storageFile, error } = await supabase.storage
                .from('workflow-files')
                .download(attachment.filePath);

              if (!error && storageFile) {
                const arrayBuffer = await storageFile.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                // Upload to public temp storage for Slack access
                const fileName = `slack-attachments/${context.userId}/${Date.now()}-${attachment.fileName || 'attachment'}`;

                // Create public bucket if it doesn't exist
                const { data: buckets } = await supabase.storage.listBuckets();
                const bucketExists = buckets?.some(b => b.name === 'slack-attachments');

                if (!bucketExists) {
                  await supabase.storage.createBucket('slack-attachments', {
                    public: true, // Make it public so Slack can access
                    fileSizeLimit: 50 * 1024 * 1024 // 50MB limit
                  });
                }

                // Upload the file
                const { data: uploadData, error: uploadError } = await supabase.storage
                  .from('slack-attachments')
                  .upload(fileName, buffer, {
                    contentType: attachment.mimeType || attachment.fileType || 'application/octet-stream',
                    cacheControl: '3600',
                    upsert: false
                  });

                if (!uploadError && uploadData) {
                  // Get public URL
                  const { data: { publicUrl } } = supabase.storage
                    .from('slack-attachments')
                    .getPublicUrl(fileName);

                  fileUrl = publicUrl;
                  console.log('[Slack] File uploaded to public storage:', fileName);

                  // Schedule cleanup after 24 hours (optional)
                  // This would need a separate cleanup job
                }
              }
            } else if (attachment.id) {
              // File uploaded via FileStorageService
              const { FileStorageService } = await import('@/lib/storage/fileStorage');
              const fileData = await FileStorageService.getFile(attachment.id, context.userId);

              if (fileData) {
                const arrayBuffer = await fileData.file.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                // Upload to public temp storage
                const fileName = `slack-attachments/${context.userId}/${Date.now()}-${fileData.metadata.fileName}`;

                // Ensure bucket exists
                const { data: buckets } = await supabase.storage.listBuckets();
                const bucketExists = buckets?.some(b => b.name === 'slack-attachments');

                if (!bucketExists) {
                  await supabase.storage.createBucket('slack-attachments', {
                    public: true,
                    fileSizeLimit: 50 * 1024 * 1024
                  });
                }

                const { data: uploadData, error: uploadError } = await supabase.storage
                  .from('slack-attachments')
                  .upload(fileName, buffer, {
                    contentType: fileData.metadata.fileType,
                    cacheControl: '3600',
                    upsert: false
                  });

                if (!uploadError && uploadData) {
                  const { data: { publicUrl } } = supabase.storage
                    .from('slack-attachments')
                    .getPublicUrl(fileName);

                  fileUrl = publicUrl;
                  console.log('[Slack] File uploaded from storage service:', fileName);
                }
              }
            } else if (attachment.url) {
              // Direct URL provided
              fileUrl = attachment.url;
            }
          }

          if (fileUrl) {
            attachmentUrls.push(fileUrl);
          }
        } catch (error) {
          console.error('[Slack] Error processing attachment:', error);
        }
      }

      // Add attachment URLs to the message
      if (attachmentUrls.length > 0) {
        const attachmentText = attachmentUrls.map((url, index) => {
          // Extract filename from URL if possible
          const filename = url.split('/').pop()?.split('?')[0] || `Attachment ${index + 1}`;
          return `📎 <${url}|${filename}>`;
        }).join('\n');

        // Add attachments to the message text
        messagePayload.text = messagePayload.text
          ? `${messagePayload.text}\n\n${attachmentText}`
          : attachmentText;

        console.log(`[Slack] Added ${attachmentUrls.length} attachment(s) to message`);
      }
    }

    if (threadTimestamp) {
      // Handle datetime field - could be ISO string or Unix timestamp
      let timestamp = threadTimestamp;

      // If it's an ISO date string, convert to Slack timestamp format
      if (typeof threadTimestamp === 'string' && threadTimestamp.includes('T')) {
        // Convert ISO date to Unix timestamp with microseconds
        const date = new Date(threadTimestamp);
        timestamp = (date.getTime() / 1000).toFixed(6);
      } else if (typeof threadTimestamp === 'number') {
        // If it's a number, ensure it has the right format
        timestamp = threadTimestamp.toFixed(6);
      }

      messagePayload.thread_ts = timestamp;
    }

    // Build blocks based on message type
    if (messageType !== 'simple') {
      const blocks: any[] = [];
      
      switch (messageType) {
        case 'buttons':
          // Add message text as a section
          if (message) {
            blocks.push({
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: message
              }
            });
          }
          
          // Add buttons from buttonConfig array
          if (buttonConfig && Array.isArray(buttonConfig)) {
            const buttonElements = buttonConfig.map((btn: any) => {
              const button: any = {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: btn.buttonText || 'Click Me',
                  emoji: true
                },
                action_id: btn.actionId || `button_${Date.now()}`
              };
              
              // Add style if specified
              if (btn.style && btn.style !== 'default') {
                button.style = btn.style;
              }
              
              // Add URL if specified
              if (btn.url) {
                button.url = btn.url;
              }
              
              // Add value for action handling
              if (btn.value) {
                button.value = btn.value;
              }
              
              return button;
            });
            
            // Add action block with buttons
            blocks.push({
              type: 'actions',
              elements: buttonElements
            });
          }
          break;
          
        case 'status':
          // Create status attachment (using attachments for colored sidebar)
          const statusAttachment: any = {
            color: statusColor || 'good',
            blocks: []
          };
          
          // Add title if provided
          if (statusTitle) {
            statusAttachment.blocks.push({
              type: 'header',
              text: {
                type: 'plain_text',
                text: statusTitle,
                emoji: true
              }
            });
          }
          
          // Add message if provided
          if (statusText) {
            statusAttachment.blocks.push({
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: statusText
              }
            });
          }
          
          // Add status fields if provided
          if (statusFields && Array.isArray(statusFields)) {
            const fields = statusFields.map((field: any) => ({
              type: 'mrkdwn',
              text: `*${field.fieldName || 'Field'}:*\n${field.fieldValue || 'Value'}`
            }));
            
            if (fields.length > 0) {
              statusAttachment.blocks.push({
                type: 'section',
                fields: fields
              });
            }
          }
          
          // Use attachments for status messages to get colored sidebar
          messagePayload.attachments = [statusAttachment];
          
          // Clear blocks since we're using attachments
          blocks.length = 0;
          break;
          
        case 'approval':
          // Add title
          if (approvalTitle) {
            blocks.push({
              type: 'header',
              text: {
                type: 'plain_text',
                text: approvalTitle,
                emoji: true
              }
            });
          }
          
          // Add description
          if (approvalDescription) {
            blocks.push({
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: approvalDescription
              }
            });
          }
          
          // Add approval buttons
          blocks.push({
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: approvalApproveText || 'Approve',
                  emoji: true
                },
                style: 'primary',
                action_id: 'approve_action',
                value: 'approve'
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: approvalDenyText || 'Deny',
                  emoji: true
                },
                style: 'danger',
                action_id: 'deny_action',
                value: 'deny'
              }
            ]
          });
          break;
          
        case 'poll':
          // Add poll question
          if (pollQuestion) {
            blocks.push({
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: pollQuestion
              }
            });
          }
          
          // Add poll options as buttons
          if (pollOptions && Array.isArray(pollOptions)) {
            const pollButtons = pollOptions.map((option: any, index: number) => ({
              type: 'button',
              text: {
                type: 'plain_text',
                text: option.optionText || `Option ${index + 1}`,
                emoji: true
              },
              action_id: `poll_option_${index}`,
              value: option.optionText || `option_${index}`
            }));
            
            // Split into multiple action blocks if more than 5 options (Slack limit)
            for (let i = 0; i < pollButtons.length; i += 5) {
              blocks.push({
                type: 'actions',
                elements: pollButtons.slice(i, i + 5)
              });
            }
          }
          break;
          
        case 'custom':
          // Use custom blocks JSON
          if (customBlocks) {
            try {
              const parsedBlocks = typeof customBlocks === 'string' ? JSON.parse(customBlocks) : customBlocks;
              messagePayload.blocks = parsedBlocks;
              blocks.length = 0; // Clear our blocks array since we're using custom
            } catch (error) {
              console.warn('[Slack] Failed to parse custom blocks JSON:', error);
              throw new Error('Invalid custom blocks JSON format. Please check your Block Kit configuration.');
            }
          }
          break;
      }
      
      // Add blocks to payload if we have any
      if (blocks.length > 0) {
        messagePayload.blocks = blocks;
      }
    }
    
    // Add legacy attachments if provided (for advanced usage)
    if (legacyAttachments) {
      try {
        const parsedAttachments = typeof legacyAttachments === 'string' ? JSON.parse(legacyAttachments) : legacyAttachments;
        
        // Merge with existing attachments if status message already created some
        if (messagePayload.attachments) {
          messagePayload.attachments = [...messagePayload.attachments, ...parsedAttachments];
        } else {
          messagePayload.attachments = parsedAttachments;
        }
      } catch (error) {
        console.warn('[Slack] Failed to parse legacy attachments JSON:', error);
        throw new Error('Invalid legacy attachments JSON format.');
      }
    }

    console.log('[Slack] Sending message with payload:', {
      channel: messagePayload.channel,
      hasText: !!messagePayload.text,
      hasBlocks: !!messagePayload.blocks,
      hasAttachments: !!messagePayload.attachments,
      username: messagePayload.username || 'none',
      icon_url: messagePayload.icon_url || 'none',
      tokenType: tokenToUse.startsWith('xoxp-') ? 'USER (xoxp-)' : tokenToUse.startsWith('xoxb-') ? 'BOT (xoxb-)' : 'UNKNOWN',
      sendAsUserRequested: asUser,
      actuallyUsingUserToken: isActuallyUsingUserToken
    });

    // Safeguard: Check payload size and warn if it's too large
    const payloadString = JSON.stringify(messagePayload);
    if (payloadString.length > 100000) {
      console.warn('[Slack] ⚠️ Payload is very large:', payloadString.length, 'characters. This might cause issues.');

      // Check if any field contains what looks like base64 data
      for (const [key, value] of Object.entries(messagePayload)) {
        if (typeof value === 'string' && value.length > 10000 && !value.startsWith('http')) {
          console.error(`[Slack] ❌ Field '${key}' contains very long data (${value.length} chars) that might be base64. This will likely fail.`);
          // Remove the problematic field to prevent API failure
          delete messagePayload[key];
          console.warn(`[Slack] Removed field '${key}' to prevent API failure`);
        }
      }
    }

    // Log the exact payload being sent to Slack API (truncated if too long)
    const payloadForLogging = payloadString.length > 5000
      ? payloadString.substring(0, 5000) + '... (truncated)'
      : payloadString;
    console.log('[Slack] Full API payload:', payloadForLogging);

    // Send the message using Slack Web API with the appropriate token
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenToUse}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(messagePayload)
    });

    const result = await response.json();

    if (!result.ok) {
      console.error('[Slack] API error:', result);
      throw new Error(`Slack API error: ${result.error || 'Unknown error'}`);
    }

    console.log('[Slack] Message sent successfully:', {
      channel: result.channel,
      timestamp: result.ts,
      messageId: result.message?.ts
    });

    // Enhanced diagnostic logging for customization issues
    if (username || icon) {
      console.log('[Slack] 🔍 Bot Customization Diagnostic:');
      console.log('  - Requested username:', username || 'none');
      console.log('  - Requested icon:', iconUrl ? 'URL provided' : 'none');
      console.log('  - Token type used:', tokenToUse.startsWith('xoxp-') ? 'USER TOKEN (xoxp-)' : tokenToUse.startsWith('xoxb-') ? 'BOT TOKEN (xoxb-)' : 'UNKNOWN');
      console.log('  - Send as user enabled:', asUser);

      // Check what was actually sent in the message
      if (result.message) {
        console.log('  - Actual bot name in response:', result.message.username || result.message.bot_profile?.name || 'default bot name');
        console.log('  - Actual bot icon in response:', result.message.icons?.image_48 || result.message.bot_profile?.icons?.image_48 || 'default icon');
      }

      // Log potential reasons for customization failure
      if (!username && !icon) {
        console.log('  ℹ️ No customization was requested');
      } else if (asUser) {
        console.log('  ⚠️ Customization ignored: Send as User is enabled (messages appear as the authenticated user)');
      } else if (tokenToUse.startsWith('xoxp-')) {
        console.log('  ⚠️ Using user token but Send as User is disabled - customization may not work');
      } else if (!result.message?.username || result.message?.username === 'bot') {
        console.log('  ⚠️ Customization may have been ignored. Possible reasons:');
        console.log('    1. Missing OAuth scope: chat:write.customize (requires reconnection)');
        console.log('    2. Workspace setting: "Lock bot name & icon" is enabled');
        console.log('    3. Using legacy integration that doesn\'t support customization');
        console.log('  ℹ️ To fix scope issues: Disconnect and reconnect Slack integration');
      } else {
        console.log('  ✅ Customization appears to have been applied');
      }
    }

    return {
      success: true,
      messageId: result.ts,
      channel: result.channel,
      timestamp: result.ts,
      message: result.message,
      permalink: result.permalink
    };

  } catch (error: any) {
    console.error('[Slack] Error sending message:', error);
    throw new Error(`Failed to send Slack message: ${error.message}`);
  }
}

// Export with the expected action name
export const slackActionSendMessage = sendSlackMessage;