import React, { useState, useEffect } from 'react';
import { useIntegrationStore } from '@/stores/integrationStore';

interface DiscordReactionSelectorProps {
  channelId: string;
  messageId: string;
  selectedEmoji?: string;
  onSelect: (emojiValue: string) => void;
}

/**
 * Component that fetches and displays reaction emojis for a Discord message
 * with X button overlays for removal selection
 */
export function DiscordReactionSelector({
  channelId,
  messageId,
  selectedEmoji,
  onSelect
}: DiscordReactionSelectorProps) {
  const [reactions, setReactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  console.log('🔍 [DiscordReactionSelector] Component rendered with props:', {
    channelId,
    messageId,
    selectedEmoji
  });
  
  const { integrations, loadIntegrationData, getIntegrationByProvider } = useIntegrationStore();

  // Get Discord integration using the same method as ConfigurationForm
  const discordIntegration = getIntegrationByProvider('discord');
  
  console.log('🔍 [DiscordReactionSelector] Integration check:', {
    integrationsCount: integrations.length,
    discordIntegration: discordIntegration ? 'FOUND' : 'NOT FOUND',
    discordIntegrationId: discordIntegration?.id
  });

  // Load reactions when channelId or messageId changes
  useEffect(() => {
    console.log('🔍 [DiscordReactionSelector] useEffect triggered:', {
      channelId: !!channelId,
      messageId: !!messageId,
      discordIntegration: !!discordIntegration,
      willLoad: !!(channelId && messageId && discordIntegration)
    });
    
    if (channelId && messageId && discordIntegration) {
      loadReactions();
    }
  }, [channelId, messageId, discordIntegration]);

  const loadReactions = async () => {
    if (!channelId || !messageId || !discordIntegration) return;

    try {
      setIsLoading(true);
      setError(null);
      
      console.log('🔍 Loading reactions for message:', messageId, 'in channel:', channelId);
      
      const reactionsData = await loadIntegrationData(
        'discord_reactions', 
        discordIntegration.id, 
        { channelId, messageId }
      );
      
      console.log('🔍 Raw API response:', reactionsData);
      console.log('🔍 reactionsData.data:', reactionsData.data);
      console.log('🔍 Direct reactionsData:', reactionsData);
      
      // Try different ways to access the reaction data
      let rawReactions = reactionsData;
      if (reactionsData.data) {
        rawReactions = reactionsData.data;
      }
      if (reactionsData.reactions) {
        rawReactions = reactionsData.reactions;
      }
      
      console.log('🔍 Raw reactions array:', rawReactions);
      
      // Ensure we have an array
      const reactionsArray = Array.isArray(rawReactions) ? rawReactions : [rawReactions].filter(Boolean);
      
      // Format reaction data
      const formattedReactions = reactionsArray.map((reaction: any, index: number) => {
        console.log(`🔍 Processing reaction ${index}:`, reaction);
        return {
          value: reaction.value || reaction.id || reaction.emoji,
          emoji: reaction.emoji,
          count: reaction.count || 1,
          ...reaction
        };
      });
      
      console.log('✅ Final formatted reactions:', formattedReactions);
      setReactions(formattedReactions);
      
    } catch (err: any) {
      console.error('Failed to load reactions:', err);
      setError(err.message || 'Failed to load reactions');
      setReactions([]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!channelId || !messageId) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          <span className="text-sm text-blue-700">Loading message reactions...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
        <div className="flex items-center justify-between">
          <p className="text-sm text-red-700">Error loading reactions: {error}</p>
          <button
            onClick={loadReactions}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!reactions || reactions.length === 0) {
    return (
      <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">No reactions found on this message</p>
          <button
            onClick={loadReactions}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            Refresh
          </button>
        </div>
        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
          <p className="text-yellow-800 font-medium">Debug Info:</p>
          <p className="text-yellow-700">Reactions array length: {reactions?.length || 0}</p>
          <p className="text-yellow-700">Message ID: {messageId}</p>
          <p className="text-yellow-700">Channel ID: {channelId}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-gray-700 mb-2">
        Select a reaction to remove (click the ✕):
      </p>
      <div className="flex flex-wrap gap-2">
        {reactions.map((reaction, index) => {
          const isSelected = selectedEmoji === (reaction.value || reaction.emoji);
          
          return (
            <div
              key={`${reaction.value || reaction.emoji}-${index}`}
              className={`relative inline-flex items-center gap-1 px-3 py-2 rounded-full border-2 transition-all duration-200 ${
                isSelected
                  ? 'bg-red-100 border-red-400 shadow-lg ring-2 ring-red-200'
                  : 'bg-white border-gray-200 hover:border-red-200 hover:shadow-sm'
              }`}
            >
              {/* Emoji and count */}
              <span className="text-lg">{reaction.emoji}</span>
              <span className="text-sm text-gray-600">{reaction.count}</span>
              
              {/* X button overlay */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('🔍 [DiscordReactionSelector] X button clicked for reaction:', reaction.emoji);
                  onSelect(reaction.value || reaction.emoji);
                }}
                className="ml-1 w-4 h-4 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center text-xs transition-colors"
                title={`Remove ${reaction.emoji} reaction`}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
      
      {selectedEmoji && (
        <div className="mt-3 p-3 bg-red-50 rounded-lg border-2 border-red-200 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            <p className="text-sm font-medium text-red-800">
              Ready to remove: <span className="text-lg">{reactions.find(r => (r.value || r.emoji) === selectedEmoji)?.emoji}</span>
            </p>
          </div>
          <p className="text-xs text-red-600 mt-1">This reaction will be removed when the workflow runs</p>
        </div>
      )}
    </div>
  );
}