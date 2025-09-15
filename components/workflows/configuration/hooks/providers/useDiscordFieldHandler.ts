import { useCallback } from 'react';

interface UseDiscordFieldHandlerProps {
  nodeInfo: any;
  values: Record<string, any>;
  setValue: (fieldName: string, value: any) => void;
  loadOptions: (fieldName: string, dependsOn?: string, dependsOnValue?: any, forceReload?: boolean) => Promise<void>;
  setLoadingFields: (setter: any) => void;
  resetOptions: (fieldName: string) => void;
  discordState?: any;
}

/**
 * Discord-specific field change handler hook
 * Encapsulates all Discord field dependency logic
 */
export function useDiscordFieldHandler({
  nodeInfo,
  values,
  setValue,
  loadOptions,
  setLoadingFields,
  resetOptions,
  discordState
}: UseDiscordFieldHandlerProps) {

  /**
   * Handle guildId (server) changes
   */
  const handleGuildIdChange = useCallback(async (value: any, previousValue?: any) => {
    console.log('🔍 Discord guildId changed:', { newValue: value, previousValue });
    
    // Only clear fields and reset if the value actually changed
    if (value === previousValue) {
      console.log('📌 Discord guildId unchanged, skipping field operations');
      return;
    }
    
    // Clear dependent fields
    setValue('channelId', '');
    setValue('messageId', '');
    setValue('authorFilter', '');
    
    // Clear Discord state
    discordState?.setChannelBotStatus(null);
    discordState?.setChannelLoadingError(null);
    
    // Reset cached options
    resetOptions('channelId');
    resetOptions('authorFilter');
    resetOptions('messageId');
    
    if (value) {
      // For triggers, check bot status first before loading any fields
      if (nodeInfo?.type?.startsWith('discord_trigger_')) {
        console.log('🤖 Checking bot status for trigger, guild:', value);
        discordState?.checkBotStatus(value);
        // Don't set loading states here - let the bot status check trigger the loading
        // The DiscordConfiguration component will handle loading channels when bot is confirmed
        return;
      }
      
      // For actions, load fields immediately
      if (nodeInfo?.type?.startsWith('discord_action_')) {
        // Set loading states for dependent fields
        setLoadingFields((prev: Set<string>) => {
          const newSet = new Set(prev);
          newSet.add('channelId');
          return newSet;
        });
        
        // Check bot status
        discordState?.checkBotStatus(value);
        
        // Delay to ensure loading state is visible
        setTimeout(() => {
          // Load channels
          loadOptions('channelId', 'guildId', value, true).finally(() => {
            setLoadingFields((prev: Set<string>) => {
              const newSet = new Set(prev);
              newSet.delete('channelId');
              return newSet;
            });
          });
        }, 10);
      }
    }
  }, [nodeInfo, setValue, setLoadingFields, resetOptions, loadOptions, discordState]);

  /**
   * Handle channelId changes
   */
  const handleChannelIdChange = useCallback(async (value: any) => {
    console.log('🔍 Discord channelId changed:', value);
    
    // Check for dependent fields
    const hasMessageField = nodeInfo.configSchema?.some((field: any) => field.name === 'messageId');
    const hasMessagesField = nodeInfo.configSchema?.some((field: any) => field.name === 'messageIds'); // Plural for delete action
    const hasAuthorFilter = nodeInfo.configSchema?.some((field: any) => field.name === 'authorFilter');
    
    // Clear dependent fields
    if (hasMessageField) {
      setValue('messageId', '');
      setLoadingFields((prev: Set<string>) => {
        const newSet = new Set(prev);
        newSet.add('messageId');
        return newSet;
      });
      resetOptions('messageId');
    }

    if (hasMessagesField) {
      setValue('messageIds', []);
      setLoadingFields((prev: Set<string>) => {
        const newSet = new Set(prev);
        newSet.add('messageIds');
        return newSet;
      });
      resetOptions('messageIds');
    }
    
    if (hasAuthorFilter) {
      console.log('🔄 Clearing authorFilter field due to channelId change');
      setValue('authorFilter', '');
      resetOptions('authorFilter');
      // Don't set loading here - let the actual load handle it
    }
    
    if (value && values.guildId) {
      // Load messages if needed
      if (hasMessageField) {
        setTimeout(() => {
          // Pass the action type to filter messages if this is an edit action
          const actionType = nodeInfo?.type;
          loadOptions('messageId', 'channelId', value, true, false, { actionType }).finally(() => {
            setLoadingFields((prev: Set<string>) => {
              const newSet = new Set(prev);
              newSet.delete('messageId');
              return newSet;
            });
          });
        }, 10);
      }

      // Load messages for multi-select (delete action)
      if (hasMessagesField) {
        setTimeout(() => {
          const actionType = nodeInfo?.type;
          loadOptions('messageIds', 'channelId', value, true, false, { actionType }).finally(() => {
            setLoadingFields((prev: Set<string>) => {
              const newSet = new Set(prev);
              newSet.delete('messageIds');
              return newSet;
            });
          });
        }, 10);
      }
      
      // Load users for authorFilter if needed (use channelId for member loading)
      if (hasAuthorFilter && value) {
        console.log('📥 Loading Discord users for channel:', value);
        // Ensure we clear any existing loading state first
        setLoadingFields((prev: Set<string>) => {
          const newSet = new Set(prev);
          newSet.add('authorFilter');
          return newSet;
        });
        
        setTimeout(() => {
          // Pass channelId since discord_channel_members requires it
          loadOptions('authorFilter', 'channelId', value, true)
            .then(() => {
              console.log('✅ Successfully loaded Discord users for authorFilter');
            })
            .catch((error) => {
              console.error('❌ Failed to load Discord users for authorFilter:', error);
            })
            .finally(() => {
              console.log('🔄 Clearing loading state for authorFilter');
              setLoadingFields((prev: Set<string>) => {
                const newSet = new Set(prev);
                newSet.delete('authorFilter');
                return newSet;
              });
            });
        }, 10);
      }
      
      // Check channel bot status (only for Discord actions, not triggers)
      if (nodeInfo?.type?.startsWith('discord_action_')) {
        discordState?.checkChannelBotStatus(value, values.guildId);
      }
    } else {
      // Clear loading states
      setLoadingFields((prev: Set<string>) => {
        const newSet = new Set(prev);
        if (hasMessageField) newSet.delete('messageId');
        if (hasMessagesField) newSet.delete('messageIds');
        if (hasAuthorFilter) newSet.delete('authorFilter');
        return newSet;
      });
    }
  }, [nodeInfo, values, setValue, setLoadingFields, resetOptions, loadOptions, discordState]);

  /**
   * Handle messageId changes for remove reaction action
   */
  const handleMessageIdChange = useCallback((value: any) => {
    if (nodeInfo?.type !== 'discord_action_remove_reaction') return;
    
    console.log('🔍 Discord messageId changed for remove reaction:', value);
    
    // Clear emoji field
    setValue('emoji', '');
    
    if (value && values.channelId) {
      // Load reactions (handled by DiscordReactionSelector component)
      discordState?.loadReactionsForMessage(values.channelId, value);
    }
  }, [nodeInfo, values, setValue, discordState]);

  /**
   * Main Discord field change handler
   */
  const handleFieldChange = useCallback(async (fieldName: string, value: any): Promise<boolean> => {
    if (nodeInfo?.providerId !== 'discord') return false;

    switch (fieldName) {
      case 'guildId':
        // Pass the previous value to detect actual changes
        await handleGuildIdChange(value, values.guildId);
        return true;
      
      case 'channelId':
        await handleChannelIdChange(value);
        return true;
      
      case 'messageId':
        handleMessageIdChange(value);
        return true;
      
      default:
        return false;
    }
  }, [nodeInfo, values, handleGuildIdChange, handleChannelIdChange, handleMessageIdChange]);

  return {
    handleFieldChange,
    handleGuildIdChange,
    handleChannelIdChange,
    handleMessageIdChange
  };
}