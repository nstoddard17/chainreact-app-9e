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
export function DiscordChannelField({
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
  
  // Process the channel options
  let processedOptions = processDiscordChannels(options);
  
  // If we have a saved value, check if we have the actual data or need to show placeholder
  if (value) {
    const matchingOption = processedOptions.find(opt => (opt.value || opt.id) === value);
    
    if (!matchingOption) {
      console.log(`📌 [DiscordChannelField] Using saved channel value:`, value);
      // Show a nice placeholder while the actual data loads in background
      processedOptions = [{
        id: value,
        value: value,
        label: 'Selected Channel', // Generic text instead of ID
        name: 'Selected Channel'
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
  
  // Always show loading state when no channels are available (they're being loaded)
  if (processedOptions.length === 0 && !value) {
    return (
      <Select disabled>
        <SelectTrigger 
          className={cn(
            "h-10 bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200",
            error && "border-red-500 focus:border-red-500 focus:ring-red-500 focus:ring-offset-2"
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