import { useState, useCallback, useEffect } from 'react';
import { useIntegrationStore } from '@/stores/integrationStore';
import { getDiscordBotInviteUrl } from '../utils/helpers';

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
  const [selectedEmojiReactions, setSelectedEmojiReactions] = useState<any[]>([]);
  
  const { getIntegrationByProvider, connectIntegration, loadIntegrationData } = useIntegrationStore();
  const discordIntegration = getIntegrationByProvider('discord');
  const needsDiscordConnection = nodeInfo?.providerId === 'discord' && !discordIntegration;
  
  // Check if Discord node
  const isDiscordNode = nodeInfo?.providerId === 'discord';
  
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
      if (newBotStatus.isInGuild && newBotStatus.hasPermissions) {
        console.log('🔍 Bot connected with permissions, loading channels for guild:', guildId);
        // Let the useDynamicOptions hook handle all loading state management
        loadOptions('channelId', 'guildId', guildId)
          .then(() => {
            console.log('✅ Channels loaded successfully after bot connection');
          })
          .catch((channelError) => {
            console.error('Failed to load channels after bot connection:', channelError);
            setChannelLoadingError('Failed to load channels after bot connection');
          });
      }
    } catch (error) {
      console.error("Error checking Discord bot status:", error);
      setBotStatus({
        isInGuild: false,
        hasPermissions: false
      });
    } finally {
      setIsBotStatusChecking(false);
    }
  }, [discordIntegration, loadOptions]);
  
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
      console.error("Error checking Discord channel bot status:", error);
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
      console.error("Error checking if bot is in server:", error);
      return false;
    }
  }, [discordIntegration]);
  
  // Function to load Discord reactions for a specific message
  const loadReactionsForMessage = useCallback(async (channelId: string, messageId: string) => {
    if (!channelId || !messageId || !discordIntegration) {
      console.warn('Missing required parameters for loading reactions:', { channelId, messageId, hasIntegration: !!discordIntegration });
      return;
    }

    try {
      console.log('🔍 Loading reactions for message:', messageId, 'in channel:', channelId);
      
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
      
      console.log('✅ Loaded', formattedReactions.length, 'reactions for message');
    } catch (error: any) {
      console.error('Failed to load reactions:', error);
      setSelectedEmojiReactions([]);
    }
  }, [discordIntegration, loadIntegrationData]);
  
  // Function to invite bot to Discord server
  const handleInviteBot = useCallback((guildId?: string) => {
    console.log('🔍 Discord invite bot called:', { 
      discordClientId: discordClientId ? 'Present' : 'Missing',
      isDiscordBotConfigured,
      guildId 
    });
    
    if (!discordClientId) {
      console.error('Discord client ID not available - cannot open OAuth flow');
      return;
    }
    
    // Use helper function to get the invite URL
    const inviteUrl = getDiscordBotInviteUrl(discordClientId, guildId);
    
    console.log('🔍 Opening Discord OAuth popup with URL:', inviteUrl);
    
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
    let successDetected = false;
    
    const interval = setInterval(async () => {
      pollCount++;
      
      try {
        // Check if popup is closed
        if (popup.closed) {
          clearInterval(interval);
          setIsBotConnectionInProgress(false);
          
          console.log('🔍 Discord OAuth popup closed, checking bot status...');
          
          // Check bot status after popup closes
          if (guildId) {
            // Initial quick check
            await checkBotStatus(guildId);
            
            // Additional checks with delays to handle Discord's eventual consistency
            setTimeout(async () => {
              if (!botStatus?.isInGuild) {
                console.log('🔍 Bot not detected yet, checking again...');
                await checkBotStatus(guildId);
              }
            }, 2000); // 2 second retry
            
            setTimeout(async () => {
              if (!botStatus?.isInGuild) {
                console.log('🔍 Final bot status check...');
                await checkBotStatus(guildId);
              }
            }, 5000); // 5 second final retry
          }
          
          return;
        }
        
        // Check if we've exceeded max polling time
        if (pollCount >= maxPolls) {
          clearInterval(interval);
          setIsBotConnectionInProgress(false);
          console.log('Discord OAuth timeout - exceeded maximum wait time');
          popup.close();
          return;
        }
      } catch (error) {
        console.error('Error in popup monitoring:', error);
      }
    }, 500); // Check every 500ms
    
  }, [discordClientId, isDiscordBotConfigured, checkBotStatus, botStatus]);
  
  // Alias for handleInviteBot
  const handleAddBotToServer = useCallback((guildId?: string) => {
    handleInviteBot(guildId);
  }, [handleInviteBot]);
  
  // Function to connect Discord integration
  const handleConnectDiscord = useCallback(async () => {
    console.log('Starting Discord connection...');
    const result = await connectIntegration('discord');
    if (result) {
      console.log('Discord connected successfully!');
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
        
        console.log('🔍 Discord configuration check on mount:', data);
        
        if (data.isConfigured && data.clientId) {
          setIsDiscordBotConfigured(true);
          setDiscordClientId(data.clientId);
        } else {
          setIsDiscordBotConfigured(false);
          console.warn('Discord bot is not configured');
        }
      } catch (error) {
        console.error('Error fetching Discord config:', error);
        setIsDiscordBotConfigured(false);
      }
    };
    
    fetchDiscordConfig();
  }, [nodeInfo?.providerId]);
  
  // Check bot status when guild ID changes
  useEffect(() => {
    if (values.guildId && discordIntegration && nodeInfo?.providerId === 'discord') {
      checkBotStatus(values.guildId);
    }
  }, [values.guildId, discordIntegration, nodeInfo?.providerId, checkBotStatus]);
  
  // Check channel bot status when channel ID changes
  useEffect(() => {
    if (values.channelId && values.guildId && discordIntegration && nodeInfo?.providerId === 'discord') {
      checkChannelBotStatus(values.channelId, values.guildId);
    }
  }, [values.channelId, values.guildId, discordIntegration, nodeInfo?.providerId, checkChannelBotStatus]);
  
  return {
    // State
    botStatus,
    isBotStatusChecking,
    channelBotStatus,
    isChannelBotStatusChecking,
    isLoadingChannels,
    channelLoadingError,
    isDiscordBotConfigured,
    discordClientId,
    isBotConnectionInProgress,
    selectedEmojiReactions,
    discordIntegration,
    needsDiscordConnection,
    isDiscordNode,
    
    // Actions
    setBotStatus,
    setChannelBotStatus,
    setChannelLoadingError,
    setIsBotConnectionInProgress,
    setSelectedEmojiReactions,
    checkBotStatus,
    checkChannelBotStatus,
    checkBotInServer,
    loadReactionsForMessage,
    handleInviteBot,
    handleAddBotToServer,
    handleConnectDiscord
  };
}