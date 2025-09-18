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
    hasPoll: !!pollQuestion
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

  // Determine which token to use and track if we're actually using user token
  let tokenToUse = integration.access_token; // Default to bot token
  let isActuallyUsingUserToken = false;

  // If asUser is true, try to use the user token to send as the actual user
  if (asUser && integration.metadata?.has_user_token && integration.metadata?.user_token) {
    console.log('[Slack] Attempting to use user token to send as actual user');
    // Decrypt the user token from metadata
    const { decryptToken } = await import('@/lib/integrations/tokenUtils');
    const userToken = await decryptToken(integration.metadata.user_token);

    if (userToken) {
      tokenToUse = userToken;
      isActuallyUsingUserToken = true;
      console.log('[Slack] Successfully using user token - message will appear as sent by the user');
    } else {
      console.warn('[Slack] Failed to decrypt user token, will use bot token with customization');
    }
  } else if (asUser) {
    console.log('[Slack] User requested to send as user, but user token not available. Will customize bot appearance instead.');
  } else {
    console.log('[Slack] Using bot token in standard mode');
  }

  try {
    // Prepare the message payload
    const messagePayload: any = {
      channel: channel.startsWith('#') ? channel : `#${channel}`,
      text: message || '',
      unfurl_links: unfurlLinks,
      unfurl_media: unfurlMedia,
      link_names: linkNames  // Added link_names from schema
    };

    if (isActuallyUsingUserToken) {
      // When using user token, the message is automatically sent as the user
      // Username/icon customization is ignored by Slack when using user token
      console.log('[Slack] Message will appear as sent by the actual user');
      // Don't add any customization fields - the user's actual profile is used
    } else if (!isActuallyUsingUserToken && (username || icon)) {
      // Using bot token and have customization fields
      // This requires chat:write.customize scope
      console.log('[Slack] Customizing bot appearance');

      // Add custom username if provided
      if (username) {
        messagePayload.username = username;
        console.log('[Slack] Setting custom username:', username);
      }

      // Handle icon field (can be URL, uploaded file, or emoji)
      if (icon) {
        if (typeof icon === 'string') {
          // Check if it's a URL
          if (icon.startsWith('http://') || icon.startsWith('https://')) {
            messagePayload.icon_url = icon;
            console.log('[Slack] Setting icon_url:', icon);
          } else if (icon.startsWith(':') && icon.endsWith(':')) {
            // It's already formatted as an emoji code
            messagePayload.icon_emoji = icon;
            console.log('[Slack] Setting icon_emoji:', icon);
          } else if (icon.length <= 2) {
            // Likely a raw emoji character, don't wrap actual emoji
            // Slack expects shortcodes like :smile:, not actual emoji characters
            console.warn('[Slack] Raw emoji characters not supported. Use shortcodes like :smile: instead');
          } else {
            // Assume it's an emoji name without colons
            messagePayload.icon_emoji = `:${icon}:`;
            console.log('[Slack] Setting icon_emoji with colons:', messagePayload.icon_emoji);
          }
        } else if (icon && typeof icon === 'object') {
          // Handle uploaded file object
          if (icon.url) {
            messagePayload.icon_url = icon.url;
            console.log('[Slack] Setting icon_url from object:', icon.url);
          } else if (icon.filePath) {
            // If it's a file path from upload, convert to URL
            // Note: This would need to be a publicly accessible URL
            console.warn('[Slack] File path needs to be converted to public URL for icon');
          }
        }
      }
    } else {
      // Using bot token with default appearance
      console.log('[Slack] Sending as bot with default appearance');
    }

    // Handle file attachments from the schema's attachments field
    // Note: Slack's chat.postMessage doesn't directly support file uploads
    // Files need to be uploaded separately using files.upload API
    if (attachments) {
      console.log('[Slack] File attachments detected. Note: Files should be uploaded using files.upload API first');
      // For now, we'll add a note to the message about attachments
      // In a full implementation, you'd upload files first then reference them
      if (typeof attachments === 'string' && attachments.startsWith('http')) {
        // If it's a URL, add it to the message
        messagePayload.text = messagePayload.text ? `${messagePayload.text}\n\nAttachment: ${attachments}` : `Attachment: ${attachments}`;
      } else if (Array.isArray(attachments)) {
        // If multiple attachments
        const attachmentUrls = attachments.filter(a => typeof a === 'string' || a.url).map(a => typeof a === 'string' ? a : a.url);
        if (attachmentUrls.length > 0) {
          messagePayload.text = messagePayload.text ? `${messagePayload.text}\n\nAttachments:\n${attachmentUrls.join('\n')}` : `Attachments:\n${attachmentUrls.join('\n')}`;
        }
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
      username: messagePayload.username || 'default',
      icon_url: messagePayload.icon_url || 'none',
      icon_emoji: messagePayload.icon_emoji || 'none',
      customizationEnabled: asUser
    });

    // Send the message using Slack Web API with the appropriate token
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenToUse}`,
        'Content-Type': 'application/json',
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