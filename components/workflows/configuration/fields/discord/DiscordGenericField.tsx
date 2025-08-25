"use client"

import React, { useEffect, useRef } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

interface DiscordGenericFieldProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  options: any[];
  isLoading?: boolean;
  onDynamicLoad?: (fieldName: string) => void;
  nodeInfo?: any; // To access node type for context-aware filtering
}

/**
 * Generic Discord field selector with consistent styling
 * Used for all Discord dynamic fields to ensure consistency
 */
export function DiscordGenericField({
  field,
  value,
  onChange,
  error,
  options,
  isLoading,
  onDynamicLoad,
  nodeInfo,
}: DiscordGenericFieldProps) {

  // Track whether we've already attempted to load data to prevent reloading
  const hasAttemptedLoad = useRef(false);
  const previousValue = useRef(value);

  // Reset load attempt flag if field is intentionally cleared
  useEffect(() => {
    if (previousValue.current && !value) {
      // Field was cleared, allow loading again
      hasAttemptedLoad.current = false;
    }
    previousValue.current = value;
  }, [value]);

  // Auto-load Discord data on mount if no data exists (but not for dependent fields)
  useEffect(() => {
    // Don't auto-load dependent fields - they should be loaded by the form when dependencies change
    const isDependentField = ['filterAuthor', 'channelId', 'messageId'].includes(field.name);
    
    if (field.name === 'messageId') {
      console.log('🔍 [DiscordGenericField] messageId field detected:', {
        isDependentField,
        fieldDynamic: field.dynamic,
        hasOnDynamicLoad: !!onDynamicLoad,
        isLoading,
        optionsLength: options.length,
        hasValue: !!value,
        hasAttemptedLoadCurrent: hasAttemptedLoad.current
      });
    }
    
    if (field.name === 'filterAuthor') {
      console.log('🔍 [DiscordGenericField] filterAuthor - skipping auto-load, waiting for form to trigger based on guildId');
    }
    
    if (!isDependentField && field.dynamic && onDynamicLoad && !isLoading && options.length === 0 && !value && !hasAttemptedLoad.current) {
      hasAttemptedLoad.current = true;
      onDynamicLoad(field.name);
    }
  }, [field.dynamic, field.name, onDynamicLoad, isLoading, options.length, value]);

  // Generic loading behavior for dropdown open
  const handleFieldOpen = (open: boolean) => {
    if (open && field.dynamic && onDynamicLoad && !isLoading && options.length === 0 && !value && !hasAttemptedLoad.current) {
      hasAttemptedLoad.current = true;
      onDynamicLoad(field.name);
    }
  };

  // Generic option processing
  const processOptions = (opts: any[]) => {
    // Remove duplicates and filter valid options
    let uniqueOptions = opts
      .filter(opt => opt && (opt.value || opt.id))
      .reduce((acc: any[], option: any) => {
        const optionId = option.value || option.id;
        // Check if we already have this option ID
        if (!acc.some(existingOption => (existingOption.value || existingOption.id) === optionId)) {
          acc.push(option);
        }
        return acc;
      }, []);

    // Special filtering for messageId in remove reaction actions - only show messages with reactions
    if (field.name === 'messageId' && nodeInfo?.type === 'discord_action_remove_reaction') {
      console.log('🔍 [DiscordGenericField] Processing messages for remove reaction action');
      console.log('🔍 [DiscordGenericField] Total messages before filtering:', uniqueOptions.length);
      
      if (uniqueOptions.length > 0) {
        const firstMessage = uniqueOptions[0];
        console.log('🔍 [DiscordGenericField] First message detailed breakdown:', {
          id: firstMessage.id,
          value: firstMessage.value,
          label: firstMessage.label,
          reactions: firstMessage.reactions,
          reactionsType: typeof firstMessage.reactions,
          reactionsIsArray: Array.isArray(firstMessage.reactions),
          allProperties: Object.keys(firstMessage)
        });
      }
      
      // Filter to only show messages that have reactions
      const messagesWithReactions = uniqueOptions.filter(message => {
        const hasReactions = message.reactions && Array.isArray(message.reactions) && message.reactions.length > 0;
        console.log(`🔍 [DiscordGenericField] Message ${message.id}: ${hasReactions ? 'HAS reactions' : 'no reactions'} (${message.reactions?.length || 0})`);
        return hasReactions;
      });

      console.log(`🔍 [DiscordGenericField] Filtered ${uniqueOptions.length} messages down to ${messagesWithReactions.length} messages with reactions`);
      uniqueOptions = messagesWithReactions;
    }
    
    // If these are Discord guilds (have member count), sort them
    if (uniqueOptions.length > 0 && uniqueOptions.some(opt => opt.hasOwnProperty('approximate_member_count'))) {
      return uniqueOptions.sort((a, b) => {
        // Sort by member count (larger servers first)
        if (a.approximate_member_count && b.approximate_member_count) {
          return b.approximate_member_count - a.approximate_member_count;
        }
        
        // Default to alphabetical
        const aName = a.label || a.name || a.value || a.id;
        const bName = b.label || b.name || b.value || b.id;
        return aName.localeCompare(bName);
      });
    }
    
    return uniqueOptions;
  };

  const processedOptions = processOptions(options);

  // Convert options to ComboboxOption format for message fields
  const comboboxOptions: ComboboxOption[] = processedOptions.map(option => {
    const optionValue = option.value || option.id;
    let optionLabel = option.label || option.name || option.value || option.id;
    let searchValue = String(optionLabel); // Ensure it's a string
    
    // Special handling for message fields - show full message content
    if (field.name === 'messageId') {
      if (option.content) {
        optionLabel = option.content;
        searchValue = option.content; // Make the full message content searchable
      } else {
        // Fallback for messages without content
        const fallbackLabel = `Message by ${option.author?.username || 'Unknown'} (${option.timestamp ? new Date(option.timestamp).toLocaleString() : 'Unknown time'})`;
        optionLabel = fallbackLabel;
        searchValue = `${option.author?.username || 'Unknown'} ${fallbackLabel}`;
      }
      
      // No special formatting for remove reaction actions
    }
    
    return {
      value: String(optionValue),
      label: String(optionLabel),
      searchValue: String(searchValue)
    };
  });

  // Always show loading state when isLoading is true (even if we have cached data)
  if (field.dynamic && isLoading) {
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
            <span>
              {field.name === 'messageId' ? 'Loading Discord messages...' : 
               field.name === 'filterAuthor' ? 'Loading server members...' : 
               'Loading options...'}
            </span>
          </div>
        </SelectTrigger>
      </Select>
    );
  }

  // Special case when no options are available
  if (processedOptions.length === 0 && !isLoading) {
    // Special message for remove reaction actions when no messages with reactions are found
    if (field.name === 'messageId' && nodeInfo?.type === 'discord_action_remove_reaction') {
      return (
        <div className="text-sm text-slate-500">
          <p>No messages with reactions found in this channel.</p>
          <p className="mt-1 text-xs">Only messages that have reactions can be selected for reaction removal.</p>
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
            Retry Loading
          </Button>
        </div>
      );
    }
    
    // Generic message for other fields
    return (
      <div className="text-sm text-slate-500">
        <p>No options found. You may need to:</p>
        <ul className="list-disc list-inside mt-1 ml-2">
          <li>Check your Discord connection</li>
          <li>Ensure the bot has proper permissions</li>
          <li>Verify previous field selections</li>
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
          Retry Loading
        </Button>
      </div>
    );
  }

  // Use Combobox for message fields to enable search, Select for others
  if (field.name === 'messageId') {
    return (
      <Combobox
        options={comboboxOptions}
        value={value || ""}
        onChange={onChange}
        placeholder={field.placeholder || "Select a message..."}
        searchPlaceholder="Search messages..."
        emptyPlaceholder="No messages found."
      />
    );
  }

  return (
    <Select 
      value={value || ""} 
      onValueChange={onChange}
      onOpenChange={handleFieldOpen}
    >
      <SelectTrigger 
        className={cn(
          "h-10 bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200",
          error && "border-red-500 focus:border-red-500 focus:ring-red-500 focus:ring-offset-2"
        )}
      >
        <SelectValue placeholder={field.placeholder || "Select an option..."} />
      </SelectTrigger>
      <SelectContent 
        className="max-h-[200px]" 
        position="popper" 
        sideOffset={4}
      >
        {processedOptions.map((option: any, index: number) => {
          const optionValue = option.value || option.id;
          const optionLabel = option.label || option.name || option.value || option.id;
          
          return (
            <SelectItem 
              key={`${optionValue}-${index}`} 
              value={optionValue}
              className="truncate"
            >
              <span className="truncate">{optionLabel}</span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}