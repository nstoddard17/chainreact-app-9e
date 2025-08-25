"use client"

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiscordReactionRemoverProps {
  messageId: string;
  channelId: string;
  onReactionSelect: (emoji: string) => void;
  selectedReaction?: string;
  dynamicOptions: any;
  onLoadReactions: () => void;
  isLoading?: boolean;
}

/**
 * Component that displays reaction buttons for a selected message
 * with X buttons to remove them
 */
export function DiscordReactionRemover({
  messageId,
  channelId,
  onReactionSelect,
  selectedReaction,
  dynamicOptions,
  onLoadReactions,
  isLoading
}: DiscordReactionRemoverProps) {
  const [reactions, setReactions] = useState<any[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Get reactions for the selected message
  useEffect(() => {
    if (messageId && channelId) {
      setHasLoaded(false);
      // Load reactions when message is selected
      onLoadReactions();
    }
  }, [messageId, channelId, onLoadReactions]);

  // Update reactions when dynamic options change
  useEffect(() => {
    if (dynamicOptions?.selectedEmoji) {
      setReactions(dynamicOptions.selectedEmoji);
      setHasLoaded(true);
    } else {
      setReactions([]);
      if (!isLoading) {
        setHasLoaded(true);
      }
    }
  }, [dynamicOptions?.selectedEmoji, isLoading]);

  if (!messageId || !channelId) {
    return null;
  }

  // Show loading state
  if (isLoading || !hasLoaded) {
    return (
      <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          <span className="text-sm text-blue-700">Loading reactions...</span>
        </div>
      </div>
    );
  }

  // Show when no reactions
  if (!reactions || reactions.length === 0) {
    return (
      <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">No reactions found on this message</p>
          <button
            onClick={onLoadReactions}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  // Show reactions as bubbles with X buttons
  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-gray-700 mb-2">Click ✕ to remove a reaction:</p>
      <div className="flex flex-wrap gap-2">
        {reactions.map((reaction, index) => (
          <div
            key={`${reaction.value || reaction.emoji}-${index}`}
            className={`relative inline-flex items-center gap-1 px-3 py-2 rounded-full border-2 transition-all duration-200 ${
              selectedReaction === (reaction.value || reaction.emoji)
                ? 'bg-red-50 border-red-300 shadow-md'
                : 'bg-white border-gray-200 hover:border-red-200'
            }`}
          >
            <span className="text-lg">{reaction.emoji}</span>
            <span className="text-sm text-gray-600">{reaction.count}</span>
            <button
              onClick={() => onReactionSelect(reaction.value || reaction.emoji)}
              className="ml-1 w-4 h-4 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center text-xs transition-colors"
              title={`Remove ${reaction.emoji} reaction`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      {selectedReaction && (
        <div className="mt-3 p-2 bg-red-50 rounded border border-red-200">
          <p className="text-sm text-red-700">
            ✓ Ready to remove: {reactions.find(r => (r.value || r.emoji) === selectedReaction)?.emoji}
          </p>
        </div>
      )}
    </div>
  );
}