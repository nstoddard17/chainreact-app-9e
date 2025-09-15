"use client"

import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

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
  
  // Ensure value is always defined to prevent uncontrolled/controlled warning
  const selectValue = value === undefined || value === null ? "" : String(value);

  // Try to get saved label from localStorage for immediate display
  const getSavedLabel = (channelId: string): string | null => {
    if (!channelId) return null;
    try {
      const storageKey = `discord_channel_label_${channelId}`;
      return localStorage.getItem(storageKey);
    } catch (e) {
      console.error('Error reading saved label:', e);
      return null;
    }
  };

  // When we have a saved value, always show it immediately while options load in background
  let displayOptions = processedOptions;
  if (selectValue) {
    // Check if the saved value exists in loaded options
    const savedOptionExists = processedOptions.some(opt =>
      String(opt.value || opt.id) === selectValue
    );

    // If the saved value doesn't exist in options yet, create a temporary placeholder
    if (!savedOptionExists) {
      // Try to get the saved label from localStorage first for immediate display
      const savedLabel = getSavedLabel(selectValue);

      // Create a nicer label for the temporary option - always prefix with # for Discord channels
      const tempLabel = savedLabel ||
        (processedOptions.length === 0
          ? `#channel-${selectValue.substring(0, 6)}...` // Show truncated ID while loading
          : `Channel ID: ${selectValue}`); // If loaded but not found, show the ID

      // Add the temporary option at the beginning
      displayOptions = [{
        value: selectValue,
        id: selectValue,
        label: tempLabel,
        temporary: true
      }, ...processedOptions];
    }
  }

  // Never disable the dropdown - let users interact even while loading
  const showLoadingState = false;

  // Always return the same structure
  return (
    <Select
      value={selectValue}
      onValueChange={(newValue) => {
        // When value changes, also try to store the label for future use
        const selectedOption = displayOptions.find(opt =>
          String(opt.value || opt.id) === newValue
        );
        if (selectedOption && !selectedOption.temporary) {
          // Get the formatted label
          const optionLabel = selectedOption.label || selectedOption.name || selectedOption.value || selectedOption.id;
          const formattedLabel = selectedOption.type === 0 && !optionLabel.startsWith('#') ? `#${optionLabel}` : optionLabel;
          // Store label in localStorage for immediate access on next load
          if (formattedLabel && newValue) {
            const storageKey = `discord_channel_label_${newValue}`;
            localStorage.setItem(storageKey, formattedLabel);
          }
        }
        onChange(newValue);
      }}
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
        {/* Show loading state inside dropdown if options are being fetched */}
        {isLoading && (
          <div className="px-2 py-4 text-sm text-slate-400 text-center">
            <RefreshCw className="h-4 w-4 animate-spin inline-block mr-2" />
            Loading Discord channels...
          </div>
        )}

        {/* Show channel count when not loading */}
        {!isLoading && displayOptions.filter(opt => !opt.temporary).length > 0 && (
          <div className="px-2 py-1.5 text-xs text-slate-400 border-b border-slate-700 mb-1">
            {displayOptions.filter(opt => !opt.temporary).length} channel{displayOptions.filter(opt => !opt.temporary).length !== 1 ? 's' : ''} available
          </div>
        )}

        {displayOptions
          .filter((option: any) => {
            const optionValue = option.value || option.id;
            return !!optionValue; // Only include options with valid values
          })
          .map((option: any) => {
            const optionValue = option.value || option.id;
            const optionLabel = option.label || option.name || option.value || option.id;
            const isTemp = option.temporary;

            // Format channel name with # prefix for text channels ONLY if not already formatted
            const formattedLabel = !isTemp && option.type === 0 && !optionLabel.startsWith('#') ? `#${optionLabel}` : optionLabel;

            return (
              <SelectItem
                key={String(optionValue)}
                value={String(optionValue)}
                className={isTemp ? "italic text-slate-400" : ""}
              >
                <div className="flex items-center gap-2">
                  <span>{formattedLabel}</span>
                  {isTemp && processedOptions.length === 0 && (
                    <span className="ml-2 text-xs">(Current selection)</span>
                  )}
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
