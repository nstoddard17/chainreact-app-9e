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
  const handleGuildIdChange = useCallback(async (value: any) => {
    console.log('🔍 Discord guildId changed:', value);
    
    // Clear dependent fields
    setValue('channelId', '');
    setValue('messageId', '');
    setValue('filterAuthor', '');
    
    // Clear Discord state
    discordState?.setChannelBotStatus(null);
    discordState?.setChannelLoadingError(null);
    
    // Set loading states for dependent fields
    setLoadingFields((prev: Set<string>) => {
      const newSet = new Set(prev);
      newSet.add('channelId');
      if (nodeInfo.configSchema?.some((f: any) => f.name === 'filterAuthor')) {
        newSet.add('filterAuthor');
      }
      return newSet;
    });
    
    // Reset cached options
    resetOptions('channelId');
    resetOptions('filterAuthor');
    resetOptions('messageId');
    
    if (value) {
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
        
        // Load filter authors if needed
        if (nodeInfo.configSchema?.some((f: any) => f.name === 'filterAuthor')) {
          loadOptions('filterAuthor', 'guildId', value, true).finally(() => {
            setLoadingFields((prev: Set<string>) => {
              const newSet = new Set(prev);
              newSet.delete('filterAuthor');
              return newSet;
            });
          });
        }
        
        // Check bot status (only for Discord actions, not triggers)
        if (nodeInfo?.type?.startsWith('discord_action_')) {
          discordState?.checkBotStatus(value);
        }
      }, 10);
    } else {
      // Clear loading states
      setLoadingFields((prev: Set<string>) => {
        const newSet = new Set(prev);
        newSet.delete('channelId');
        newSet.delete('filterAuthor');
        return newSet;
      });
    }
  }, [nodeInfo, setValue, setLoadingFields, resetOptions, loadOptions, discordState]);

  /**
   * Handle channelId changes
   */
  const handleChannelIdChange = useCallback(async (value: any) => {
    console.log('🔍 Discord channelId changed:', value);
    
    // Check for messageId field
    const hasMessageField = nodeInfo.configSchema?.some((field: any) => field.name === 'messageId');
    
    if (hasMessageField) {
      // Clear and set loading for messageId
      setValue('messageId', '');
      setLoadingFields((prev: Set<string>) => {
        const newSet = new Set(prev);
        newSet.add('messageId');
        return newSet;
      });
      resetOptions('messageId');
    }
    
    if (value && values.guildId) {
      // Load messages if needed
      if (hasMessageField) {
        setTimeout(() => {
          loadOptions('messageId', 'channelId', value, true).finally(() => {
            setLoadingFields((prev: Set<string>) => {
              const newSet = new Set(prev);
              newSet.delete('messageId');
              return newSet;
            });
          });
        }, 10);
      }
      
      // Check channel bot status (only for Discord actions, not triggers)
      if (nodeInfo?.type?.startsWith('discord_action_')) {
        discordState?.checkChannelBotStatus(value, values.guildId);
      }
    } else if (hasMessageField) {
      // Clear loading state
      setLoadingFields((prev: Set<string>) => {
        const newSet = new Set(prev);
        newSet.delete('messageId');
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
        await handleGuildIdChange(value);
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
  }, [nodeInfo, handleGuildIdChange, handleChannelIdChange, handleMessageIdChange]);

  return {
    handleFieldChange,
    handleGuildIdChange,
    handleChannelIdChange,
    handleMessageIdChange
  };
}