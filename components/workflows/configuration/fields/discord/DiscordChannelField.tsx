"use client"

import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DiscordChannelFieldProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  options: any[];
  isLoading?: boolean;
  onDynamicLoad?: (fieldName: string) => void;
  dynamicOptions?: Record<string, any[]>;
}

/**
 * Discord-specific channel selector field
 * Handles Discord channels without adding bot status text
 */
export function DiscordChannelField({
  field,
  value,
  onChange,
  error,
  options,
  isLoading,
  onDynamicLoad,
  dynamicOptions,
}: DiscordChannelFieldProps) {

  // Discord-specific loading behavior
  const handleChannelFieldOpen = (open: boolean) => {
    if (open && field.dynamic && onDynamicLoad && !isLoading && options.length === 0) {
      onDynamicLoad(field.name);
    }
  };

  // Discord-specific option processing
  const processDiscordChannels = (channels: any[]) => {
    return channels
      .filter(channel => channel && (channel.value || channel.id))
      .sort((a, b) => {
        // Sort by position first
        if (a.position !== undefined && b.position !== undefined) {
          return a.position - b.position;
        }
        
        // Default to alphabetical
        const aName = a.label || a.name || a.value || a.id;
        const bName = b.label || b.name || b.value || b.id;
        return aName.localeCompare(bName);
      });
  };

  // Discord-specific error handling
  const handleDiscordError = (error: string) => {
    if (error.includes('permission') || error.includes('403')) {
      return 'Discord permission required. Please reconnect your Discord account.';
    }
    if (error.includes('bot')) {
      return 'Discord bot not found in server. Please add the bot to your server.';
    }
    return error;
  };

  // Process options and add fallback for saved value when no options loaded
  let processedOptions = processDiscordChannels(options);
  
  // If we have a saved value but no options loaded, create a temporary option
  if (value && processedOptions.length === 0 && !isLoading) {
    // Try to find the channel name from saved dynamicOptions
    let channelName = value; // Default to ID
    
    if (dynamicOptions && dynamicOptions.channelId) {
      const savedChannel = dynamicOptions.channelId.find((ch: any) => 
        (ch.value || ch.id) === value
      );
      if (savedChannel) {
        channelName = savedChannel.name || savedChannel.label || value;
      }
    }
    
    processedOptions = [{
      id: value,
      value: value,
      name: channelName,
      label: channelName,
      type: 0, // Assume text channel
      isFallback: true // Mark as fallback option
    }];
  }
  const processedError = error ? handleDiscordError(error) : undefined;

  // Show loading state for dynamic fields
  if (field.dynamic && isLoading) {
    return (
      <Select disabled>
        <SelectTrigger 
          className={cn(
            "h-10 bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200",
            processedError && "border-red-500 focus:border-red-500 focus:ring-red-500 focus:ring-offset-2"
          )}
        >
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
            <span>Loading Discord channels...</span>
          </div>
        </SelectTrigger>
      </Select>
    );
  }

  // Special case when no Discord channels are available
  // Don't show retry button if we have a saved value (it will load properly)
  if (processedOptions.length === 0 && !isLoading && !value) {
    return (
      <div className="text-sm text-slate-500">
        <p>No Discord channels found. You may need to:</p>
        <ul className="list-disc list-inside mt-1 ml-2">
          <li>Select a Discord server first</li>
          <li>Ensure the bot is added to the selected server</li>
          <li>Check channel permissions</li>
        </ul>
        <Button 
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => {
            if (onDynamicLoad) {
              onDynamicLoad(field.name);
            }
          }}
        >
          Retry Loading Channels
        </Button>
      </div>
    );
  }

  return (
    <Select 
      value={value ?? ""} 
      onValueChange={onChange}
      onOpenChange={handleChannelFieldOpen}
    >
      <SelectTrigger 
        className={cn(
          "h-10 bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200",
          error && "border-red-500 focus:border-red-500 focus:ring-red-500 focus:ring-offset-2"
        )}
      >
        <SelectValue placeholder={field.placeholder || "Select Discord channel..."} />
      </SelectTrigger>
      <SelectContent>
        {processedOptions.map((option: any, index: number) => {
          const optionValue = option.value || option.id;
          const optionLabel = option.label || option.name || option.value || option.id;
          
          // Format channel name with # prefix for text channels
          const formattedLabel = option.type === 0 ? `#${optionLabel}` : optionLabel;
          
          return (
            <SelectItem 
              key={`${optionValue}-${index}`} 
              value={optionValue}
              className={option.isFallback ? "text-slate-600" : ""}
            >
              <div className="flex items-center gap-2">
                <span>{formattedLabel}</span>
                {option.isFallback && (
                  <span className="text-xs text-slate-400 italic">(saved)</span>
                )}
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}