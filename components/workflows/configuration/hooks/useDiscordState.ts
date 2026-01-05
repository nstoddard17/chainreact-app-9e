import { useState, useCallback, useEffect, useRef } from 'react';
import { useIntegrationStore } from '@/stores/integrationStore';
import { getDiscordBotInviteUrl } from '../utils/helpers';

import { logger } from '@/lib/utils/logger'

interface BotStatus {
  isInGuild: boolean;
  hasPermissions: boolean;
}

interface ChannelBotStatus {
  isInChannel: boolean;
  canSendMessages: boolean;
  hasPermissions: boolean;
  userCanInviteBot: boolean;
  error?: string;
}

interface UseDiscordStateProps {
  nodeInfo: any;
  values: Record<string, any>;
  loadOptions: (fieldName: string, parentField?: string, parentValue?: any) => Promise<void>;
}

interface RateLimitInfo {
  isRateLimited: boolean;
  retryAfter?: number;
  message?: string;
}

export function useDiscordState({ nodeInfo, values, loadOptions }: UseDiscordStateProps) {
  // Discord-specific state
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [isBotStatusChecking, setIsBotStatusChecking] = useState(false);
  const [channelBotStatus, setChannelBotStatus] = useState<ChannelBotStatus | null>(null);
  const [isChannelBotStatusChecking, setIsChannelBotStatusChecking] = useState(false);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [channelLoadingError, setChannelLoadingError] = useState<string | null>(null);
  const [isDiscordBotConfigured, setIsDiscordBotConfigured] = useState<boolean | null>(null);
  const [discordClientId, setDiscordClientId] = useState<string | null>(null);
  const [isBotConnectionInProgress, setIsBotConnectionInProgress] = useState(false);
  const [isLoadingChannelsAfterBotAdd, setIsLoadingChannelsAfterBotAdd] = useState(false);
  const [selectedEmojiReactions, setSelectedEmojiReactions] = useState<any[]>([]);
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo>({ isRateLimited: false });
  
  const { getIntegrationByProvider, connectIntegration, loadIntegrationData } = useIntegrationStore();
  const discordIntegration = getIntegrationByProvider('discord');
  const needsDiscordConnection = nodeInfo?.providerId === 'discord' && !discordIntegration;
  
  // Check if Discord node
  const isDiscordNode = nodeInfo?.providerId === 'discord';

  // Store loadOptions in a ref to prevent infinite re-render loops
  // When loadOptions changes, we update the ref but don't re-create callbacks that depend on it
  const loadOptionsRef = useRef(loadOptions);
  useEffect(() => {
    loadOptionsRef.current = loadOptions;
  }, [loadOptions]);

  // Function to check Discord bot status in server
  const checkBotStatus = useCallback(async (guildId: string) => {
    if (!guildId || !discordIntegration) return;
    
    try {
      setIsBotStatusChecking(true);
      // Clear any previous channel loading errors when checking bot status
      setChannelLoadingError(null);
      const response = await fetch(`/api/discord/bot-status?guildId=${guildId}`);
      const data = await response.json();
      
      const newBotStatus = {
        isInGuild: data.isInGuild,
        hasPermissions: data.hasPermissions
      };
      
      setBotStatus(newBotStatus);
      
      // If bot is now connected with permissions, automatically load channels
      // BUT only if we don't already have a saved channel value
      if (newBotStatus.isInGuild && newBotStatus.hasPermissions && !values.channelId) {
        logger.debug('🔍 Bot connected with permissions, loading channels for guild:', guildId);
        // Let the useDynamicOptions hook handle all loading state management
        // Use ref to avoid re-creating this callback when loadOptions changes
        loadOptionsRef.current('channelId', 'guildId', guildId)
          .then(() => {
            logger.debug('✅ Channels loaded successfully after bot connection');
            // Clear any rate limit errors
            setRateLimitInfo({ isRateLimited: false });
          })
          .catch((channelError: any) => {
            logger.error('Failed to load channels after bot connection:', channelError);

            // Check if it's a rate limit error
            if (channelError?.message?.includes('rate limit') || channelError?.status === 429) {
              setRateLimitInfo({
                isRateLimited: true,
                retryAfter: channelError.retryAfter || 60,
                message: 'Discord API rate limit reached. Please wait a moment before trying again.'
              });
              setChannelLoadingError('Rate limited by Discord. Please wait a moment and try again.');

              // Auto-retry after the rate limit expires
              if (channelError.retryAfter) {
                setTimeout(() => {
                  logger.debug('🔄 Retrying channel load after rate limit...');
                  setRateLimitInfo({ isRateLimited: false });
                  loadOptionsRef.current('channelId', 'guildId', guildId);
                }, (channelError.retryAfter + 1) * 1000);
              }
            } else {
              setChannelLoadingError('Failed to load channels. Please check your Discord connection.');
            }
          });
      } else if (newBotStatus.isInGuild && newBotStatus.hasPermissions && values.channelId) {
        logger.debug('📌 Bot connected but skipping channel load - using saved channel value:', values.channelId);
      }
    } catch (error) {
      logger.error("Error checking Discord bot status:", error);
      setBotStatus({
        isInGuild: false,
        hasPermissions: false
      });
    } finally {
      setIsBotStatusChecking(false);
    }
    // IMPORTANT: Do NOT include loadOptions in dependencies - use loadOptionsRef instead to prevent infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discordIntegration]);
  
  // Function to check bot status in specific channel
  const checkChannelBotStatus = useCallback(async (channelId: string, guildId: string) => {
    if (!channelId || !guildId || !discordIntegration) return;
    
    try {
      setIsChannelBotStatusChecking(true);
      const response = await fetch(`/api/discord/channel-bot-status?channelId=${channelId}&guildId=${guildId}`);
      const data = await response.json();
      
      setChannelBotStatus({
        isInChannel: data.isInChannel,
        canSendMessages: data.canSendMessages,
        hasPermissions: data.hasPermissions,
        userCanInviteBot: data.userCanInviteBot,
        error: data.error
      });
    } catch (error) {
      logger.error("Error checking Discord channel bot status:", error);
      setChannelBotStatus({
        isInChannel: false,
        canSendMessages: false,
        hasPermissions: false,
        userCanInviteBot: false,
        error: 'Failed to check channel permissions'
      });
    } finally {
      setIsChannelBotStatusChecking(false);
    }
  }, [discordIntegration]);
  
  // Function to check if bot is in server (returns boolean)
  const checkBotInServer = useCallback(async (guildId: string): Promise<boolean> => {
    if (!guildId || !discordIntegration) return false;
    
    try {
      const response = await fetch(`/api/discord/bot-status?guildId=${guildId}`);
      const data = await response.json();
      
      return data.isInGuild && data.hasPermissions;
    } catch (error) {
      logger.error("Error checking if bot is in server:", error);
      return false;
    }
  }, [discordIntegration]);
  
  // Function to load Discord reactions for a specific message
  const loadReactionsForMessage = useCallback(async (channelId: string, messageId: string) => {
    if (!channelId || !messageId || !discordIntegration) {
      logger.warn('Missing required parameters for loading reactions:', { channelId, messageId, hasIntegration: !!discordIntegration });
      return;
    }

    try {
      logger.debug('🔍 Loading reactions for message:', messageId, 'in channel:', channelId);
      
      // Load reactions using the integration service directly
      const reactionsData = await loadIntegrationData('discord_reactions', discordIntegration.id, {
        channelId,
        messageId
      });
      
      // Format the reactions data
      const formattedReactions = (reactionsData.data || reactionsData || []).map((reaction: any) => ({
        value: reaction.value || reaction.id || reaction.emoji,
        label: reaction.name || `${reaction.emoji} (${reaction.count || 0} reactions)`,
        emoji: reaction.emoji,
        count: reaction.count || 0,
        ...reaction
      }));
      
      // Update selected emoji reactions state
      setSelectedEmojiReactions(formattedReactions);
      
      logger.debug('✅ Loaded', formattedReactions.length, 'reactions for message');
    } catch (error: any) {
      logger.error('Failed to load reactions:', error);
      setSelectedEmojiReactions([]);
    }
  }, [discordIntegration, loadIntegrationData]);
  
  // Function to invite bot to Discord server
  const handleInviteBot = useCallback((guildId?: string) => {
    logger.debug('🔍 Discord invite bot called:', { 
      discordClientId: discordClientId ? 'Present' : 'Missing',
      isDiscordBotConfigured,
      guildId 
    });
    
    if (!discordClientId) {
      logger.error('Discord client ID not available - cannot open OAuth flow');
      return;
    }
    
    // Use helper function to get the invite URL
    const inviteUrl = getDiscordBotInviteUrl(discordClientId, guildId);
    
    logger.debug('🔍 Opening Discord OAuth popup with URL:', inviteUrl);
    
    // Set loading state
    setIsBotConnectionInProgress(true);
    
    // Open popup window for Discord OAuth
    const popup = window.open(
      inviteUrl, 
      'discord-bot-auth',
      'width=500,height=700,scrollbars=yes,resizable=yes,status=yes,location=yes,toolbar=no,menubar=no'
    );
    
    if (!popup) {
      setIsBotConnectionInProgress(false);
      alert('Popup blocked! Please allow popups for this site and try again.');
      return;
    }
    
    // Monitor popup for completion
    let pollCount = 0;
    const maxPolls = 600; // 5 minutes max (300s / 0.5s)
    const successDetected = false;
    
    const interval = setInterval(async () => {
      pollCount++;
      
      try {
        // Check if popup is closed
        if (popup.closed) {
          clearInterval(interval);
          setIsBotConnectionInProgress(false);
          
          logger.debug('🔍 Discord OAuth popup closed, checking bot status...');

          // Check bot status after popup closes
          if (guildId) {
            // Set loading state for channels
            setIsLoadingChannelsAfterBotAdd(true);

            // Wait a bit for Discord to process the bot addition
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Check bot status
            await checkBotStatus(guildId);

            // Emit an event that bot connection might have changed
            // This will trigger the channel loading in DiscordConfiguration component
            window.dispatchEvent(new CustomEvent('discord-bot-connected', {
              detail: { guildId }
            }));

            // Load channels after bot is added
            if (botStatus?.isInGuild && botStatus?.hasPermissions) {
              loadOptionsRef.current('channelId', 'guildId', guildId)
                .finally(() => {
                  setIsLoadingChannelsAfterBotAdd(false);
                });
            }

            // Additional checks with delays to handle Discord's eventual consistency
            setTimeout(async () => {
              if (!botStatus?.isInGuild) {
                logger.debug('🔍 Bot not detected yet, checking again...');
                await checkBotStatus(guildId);

                // Try loading channels again if bot is now detected
                if (botStatus?.isInGuild && botStatus?.hasPermissions) {
                  loadOptionsRef.current('channelId', 'guildId', guildId)
                    .finally(() => {
                      setIsLoadingChannelsAfterBotAdd(false);
                    });
                }
              } else {
                setIsLoadingChannelsAfterBotAdd(false);
              }
            }, 2000); // 2 second retry

            setTimeout(async () => {
              if (!botStatus?.isInGuild) {
                logger.debug('🔍 Final bot status check...');
                await checkBotStatus(guildId);
              }
              // Clear loading state after final check
              setIsLoadingChannelsAfterBotAdd(false);
            }, 5000); // 5 second final retry
          }
          
          return;
        }
        
        // Check if we've exceeded max polling time
        if (pollCount >= maxPolls) {
          clearInterval(interval);
          setIsBotConnectionInProgress(false);
          logger.debug('Discord OAuth timeout - exceeded maximum wait time');
          popup.close();
          
        }
      } catch (error) {
        logger.error('Error in popup monitoring:', error);
      }
    }, 500); // Check every 500ms
    
  }, [discordClientId, isDiscordBotConfigured, checkBotStatus, botStatus]);
  
  // Alias for handleInviteBot
  const handleAddBotToServer = useCallback((guildId?: string) => {
    handleInviteBot(guildId);
  }, [handleInviteBot]);
  
  // Function to connect Discord integration
  const handleConnectDiscord = useCallback(async () => {
    logger.debug('Starting Discord connection...');
    const result = await connectIntegration('discord');
    if (result) {
      logger.debug('Discord connected successfully!');
      // The integration data will be updated automatically via the store
    }
  }, [connectIntegration]);
  
  // Check Discord configuration on mount only for Discord nodes
  useEffect(() => {
    if (nodeInfo?.providerId !== 'discord') return;
    
    const fetchDiscordConfig = async () => {
      try {
        const response = await fetch('/api/discord/config');
        const data = await response.json();
        
        logger.debug('🔍 Discord configuration check on mount:', data);
        
        if (data.configured && data.clientId) {
          setIsDiscordBotConfigured(true);
          setDiscordClientId(data.clientId);
        } else {
          setIsDiscordBotConfigured(false);
          // Don't log as warning since this is expected when bot is not configured
          // The bot configuration is optional and checked per-guild later
        }
      } catch (error) {
        logger.error('Error fetching Discord config:', error);
        setIsDiscordBotConfigured(false);
      }
    };
    
    fetchDiscordConfig();
  }, [nodeInfo?.providerId]);
  
  // Track previous values to detect actual changes and avoid duplicate checks
  const previousGuildIdRef = useRef<string | null>(null);
  const previousChannelIdRef = useRef<string | null>(null);

  // CONSOLIDATED: Check bot status when guild or channel selection changes
  // Previously split across 2 separate useEffects
  useEffect(() => {
    if (!discordIntegration || nodeInfo?.providerId !== 'discord') return;

    // Check guild-level bot status when guild ID changes
    if (values.guildId && previousGuildIdRef.current !== values.guildId) {
      logger.debug('🔍 Guild ID changed from', previousGuildIdRef.current, 'to', values.guildId, '- checking bot status');
      previousGuildIdRef.current = values.guildId;
      checkBotStatus(values.guildId);
    }

    // Check channel-level bot permissions when channel ID changes
    if (values.channelId && values.guildId && previousChannelIdRef.current !== values.channelId) {
      previousChannelIdRef.current = values.channelId;
      checkChannelBotStatus(values.channelId, values.guildId);
    }
  }, [values.guildId, values.channelId, discordIntegration, nodeInfo?.providerId, checkBotStatus, checkChannelBotStatus]);
  
  return {
    // State
    botStatus,
    isBotStatusChecking,
    channelBotStatus,
    isChannelBotStatusChecking,
    isLoadingChannels,
    isLoadingChannelsAfterBotAdd,
    channelLoadingError,
    isDiscordBotConfigured,
    discordClientId,
    isBotConnectionInProgress,
    selectedEmojiReactions,
    discordIntegration,
    needsDiscordConnection,
    isDiscordNode,
    rateLimitInfo,
    
    // Actions
    setBotStatus,
    setChannelBotStatus,
    setChannelLoadingError,
    setIsBotConnectionInProgress,
    setSelectedEmojiReactions,
    setRateLimitInfo,
    checkBotStatus,
    checkChannelBotStatus,
    checkBotInServer,
    loadReactionsForMessage,
    handleInviteBot,
    handleAddBotToServer,
    handleConnectDiscord
  };
}