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
}

/**
 * Discord-specific channel selector field
 * Handles Discord channels without adding bot status text
 */
function DiscordChannelFieldComponent({
  field,
  value,
  onChange,
  error,
  options,
  isLoading,
  onDynamicLoad,
}: DiscordChannelFieldProps) {

  // Discord-specific loading behavior
  const handleChannelFieldOpen = (open: boolean) => {
    // Skip loading if we have a saved value - just show the saved value
    if (value) {
      console.log(`📌 [DiscordChannelField] Not loading on dropdown open - using saved value:`, value);
      return;
    }
    
    // Only load if we don't have a saved value or if user explicitly opens the dropdown
    if (open && field.dynamic && onDynamicLoad && !isLoading && options.length === 0 && !value) {
      console.log(`📥 [DiscordChannelField] Loading channels on dropdown open`);
      onDynamicLoad(field.name);
    }
  };

  // Discord-specific option processing
  const processDiscordChannels = (channels: any[]) => {
    // Remove duplicates and filter valid channels
    const uniqueChannels = channels
      .filter(channel => channel && (channel.value || channel.id))
      .reduce((acc: any[], channel: any) => {
        const channelId = channel.value || channel.id;
        const channelName = (channel.label || channel.name || '').toLowerCase().replace('#', '');
        
        // Check if we already have this channel (by ID or by normalized name)
        const isDuplicate = acc.some(existing => {
          const existingId = existing.value || existing.id;
          const existingName = (existing.label || existing.name || '').toLowerCase().replace('#', '');
          return existingId === channelId || (existingName === channelName && channelName !== '');
        });
        
        if (!isDuplicate) {
          acc.push(channel);
        }
        return acc;
      }, [])
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
      
    return uniqueChannels;
  };
  
  // Process the channel options
  let processedOptions = processDiscordChannels(options);
  
  // If we have a saved value, check if we have the actual data or need to show placeholder
  if (value) {
    const matchingOption = processedOptions.find(opt => (opt.value || opt.id) === value);
    
    if (!matchingOption && options.length > 0) {
      // Channel was saved but is no longer accessible (bot removed from channel)
      console.warn(`⚠️ [DiscordChannelField] Saved channel ${value} is no longer accessible`);
      // Clear the invalid value
      onChange('');
      processedOptions = [{
        id: 'channel-not-accessible',
        value: 'channel-not-accessible',
        label: 'Previously selected channel is no longer accessible',
        name: 'Channel Not Accessible',
        disabled: true
      }];
    } else if (!matchingOption && options.length === 0 && !isLoading) {
      // No options loaded yet, show loading placeholder
      console.log(`📌 [DiscordChannelField] Waiting for channel data to load for:`, value);
      processedOptions = [{
        id: value,
        value: value,
        label: 'Loading channel...',
        name: 'Loading channel...'
      }];
    }
  }

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

  const processedError = error ? handleDiscordError(error) : undefined;

  // Special case when no Discord channels are available
  // Automatically trigger loading if we have no options and aren't already loading
  React.useEffect(() => {
    // SKIP auto-load if we have a saved value
    if (value) {
      console.log('📌 [DiscordChannelField] Skipping auto-load - has saved value:', value);
      return;
    }
    
    if (processedOptions.length === 0 && !isLoading && !value && onDynamicLoad && field.dynamic) {
      // Trigger loading automatically
      console.log('📥 Auto-triggering channel load - no options available');
      onDynamicLoad(field.name);
    }
  }, [processedOptions.length, isLoading, value, onDynamicLoad, field.dynamic, field.name]);
  
  // Determine if we should show loading state
  const showLoadingState = (processedOptions.length === 0 && !value) || (field.dynamic && isLoading);
  
  // Ensure value is always defined to prevent uncontrolled/controlled warning
  const selectValue = value === undefined || value === null ? "" : String(value);

  // Always return the same structure
  return (
    <Select 
      value={selectValue} 
      onValueChange={onChange}
      onOpenChange={handleChannelFieldOpen}
      disabled={showLoadingState}
    >
      <SelectTrigger 
        className={cn(
          "h-10 bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200",
          error && "border-red-500 focus:border-red-500 focus:ring-red-500 focus:ring-offset-2"
        )}
      >
        <SelectValue placeholder={showLoadingState ? "Loading Discord channels..." : (field.placeholder || "Select Discord channel...")} />
      </SelectTrigger>
      <SelectContent>
        {processedOptions
          .filter((option: any) => {
            const optionValue = option.value || option.id;
            return !!optionValue; // Only include options with valid values
          })
          .map((option: any) => {
            const optionValue = option.value || option.id;
            const optionLabel = option.label || option.name || option.value || option.id;
            
            // Format channel name with # prefix for text channels ONLY if not already formatted
            const formattedLabel = option.type === 0 && !optionLabel.startsWith('#') ? `#${optionLabel}` : optionLabel;
            
            return (
              <SelectItem 
                key={String(optionValue)} 
                value={String(optionValue)}
              >
                <div className="flex items-center gap-2">
                  <span>{formattedLabel}</span>
                </div>
              </SelectItem>
            );
          })}
      </SelectContent>
    </Select>
  );
}

// Export directly without memoization to avoid React static flag issues
export const DiscordChannelField = DiscordChannelFieldComponent;
