/**
 * Slack Send Message Action
 * Supports both simple messages and interactive messages with Block Kit
 */

import { ExecutionContext } from '../../executeNode';

import { logger } from '@/lib/utils/logger'
import { formatRichTextForTarget } from '@/lib/workflows/formatters/richText'

export async function sendSlackMessage(context: ExecutionContext): Promise<any> {
  const {
    channel,
    message,
    attachments,
    threadTimestamp,
    blocks
  } = context.config;

  const formattedMessage = formatRichTextForTarget(message, 'slack')
  const slackTextContent = formattedMessage ?? message ?? ''

  logger.debug('[Slack] Preparing to send message:', {
    channel,
    messageLength: slackTextContent.length,
    hasAttachments: !!attachments,
    hasBlocks: !!blocks,
    hasThreadTimestamp: !!threadTimestamp
  });

  // Validate required fields
  if (!channel) {
    throw new Error('Channel is required for sending Slack messages');
  }

  if (!slackTextContent && !blocks) {
    throw new Error('Message text or blocks are required');
  }

  // Check test mode
  if (context.testMode) {
    logger.debug('[Slack] Test mode - simulating message send');
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

  // Import decryptToken function for token handling
  const { decryptToken } = await import('@/lib/integrations/tokenUtils');

  // Use bot token
  const tokenToUse = await decryptToken(integration.access_token);

  // Ensure we have a valid token
  if (!tokenToUse) {
    throw new Error('Failed to decrypt Slack token. Please reconnect your Slack account.');
  }

  logger.debug('[Slack] Using bot token to send message');

  try {
    // Prepare the message payload
    const messagePayload: any = {
      channel: channel.startsWith('#') ? channel : (channel.startsWith('C') || channel.startsWith('U') || channel.startsWith('D') ? channel : `#${channel}`),
      text: slackTextContent
    };

    // Handle file attachments from the schema's attachments field
    // Upload files to Supabase storage and get public URLs for Slack
    if (attachments) {
      logger.debug('[Slack] Processing file attachments...');
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
              logger.debug('[Slack] Processing uploaded file:', attachment.fileName || 'attachment');

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
                    upsert: false
                  });

                if (!uploadError && uploadData) {
                  // Get public URL
                  const { data: { publicUrl } } = supabase.storage
                    .from('slack-attachments')
                    .getPublicUrl(fileName);

                  fileUrl = publicUrl;
                  logger.debug('[Slack] File uploaded to public storage:', fileName);

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
                    upsert: false
                  });

                if (!uploadError && uploadData) {
                  const { data: { publicUrl } } = supabase.storage
                    .from('slack-attachments')
                    .getPublicUrl(fileName);

                  fileUrl = publicUrl;
                  logger.debug('[Slack] File uploaded from storage service:', fileName);
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
          logger.error('[Slack] Error processing attachment:', error);
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

        logger.debug(`[Slack] Added ${attachmentUrls.length} attachment(s) to message`);
      }
    }

    // Add thread timestamp if provided
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

    // Add custom blocks if provided
    if (blocks) {
      try {
        const parsedBlocks = typeof blocks === 'string' ? JSON.parse(blocks) : blocks;
        messagePayload.blocks = parsedBlocks;
        logger.debug('[Slack] Using custom Block Kit blocks');
      } catch (error) {
        logger.warn('[Slack] Failed to parse blocks JSON:', error);
        throw new Error('Invalid Block Kit JSON format. Please check your configuration at https://app.slack.com/block-kit-builder');
      }
    }

    logger.debug('[Slack] Sending message with payload:', {
      channel: messagePayload.channel,
      hasText: !!messagePayload.text,
      hasBlocks: !!messagePayload.blocks,
      hasThreadTs: !!messagePayload.thread_ts
    });

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
      logger.error('[Slack] API error:', result);
      throw new Error(`Slack API error: ${result.error || 'Unknown error'}`);
    }

    logger.debug('[Slack] Message sent successfully:', {
      channel: result.channel,
      timestamp: result.ts,
      messageId: result.message?.ts
    });

    return {
      success: true,
      messageId: result.ts,
      channel: result.channel,
      timestamp: result.ts,
      message: result.message,
      permalink: result.permalink
    };

  } catch (error: any) {
    logger.error('[Slack] Error sending message:', error);
    throw new Error(`Failed to send Slack message: ${error.message}`);
  }
}

// Export with the expected action name
export const slackActionSendMessage = sendSlackMessage;
