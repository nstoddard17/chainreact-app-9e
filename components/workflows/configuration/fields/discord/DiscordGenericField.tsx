"use client"

import React, { useEffect, useRef } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { DiscordMessageSelector } from "./DiscordMessageSelector";
import { cn } from "@/lib/utils";

interface DiscordGenericFieldProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  options: any[];
  isLoading?: boolean;
  onDynamicLoad?: (fieldName: string, dependsOn?: string, dependsOnValue?: any) => void;
  nodeInfo?: any; // To access node type for context-aware filtering
  parentValues?: Record<string, any>; // All form values for dependency resolution
}

/**
 * Generic Discord field selector with consistent styling
 * Used for all Discord dynamic fields to ensure consistency
 */
function DiscordGenericFieldComponent({
  field,
  value,
  onChange,
  error,
  options,
  isLoading,
  onDynamicLoad,
  nodeInfo,
  parentValues,
}: DiscordGenericFieldProps) {

  // Track whether we've already attempted to load data to prevent reloading
  const hasAttemptedLoad = useRef(false);
  const previousValue = useRef(value);
  const previousChannelId = useRef<string | null>(null);
  
  // Debug logging for authorFilter
  if (field.name === 'authorFilter') {
    console.log('🎯 [DiscordGenericField] Rendering authorFilter:', {
      value,
      isLoading,
      optionsLength: options?.length || 0,
      dependsOn: field.dependsOn,
      channelId: parentValues?.channelId,
      hasAttemptedLoad: hasAttemptedLoad.current,
      previousChannelId: previousChannelId.current
    });
  }

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
    
    // Skip auto-load if we have a saved value (even for non-dependent fields when reopening)
    if (value) {
      console.log(`📌 [DiscordGenericField] Skipping auto-load for ${field.name} - has saved value:`, value);
      return;
    }
    
    if (!isDependentField && field.dynamic && onDynamicLoad && !isLoading && options.length === 0 && !value && !hasAttemptedLoad.current) {
      hasAttemptedLoad.current = true;
      onDynamicLoad(field.name);
    }
  }, [field.dynamic, field.name, onDynamicLoad, isLoading, options.length, value]);

  // Generic loading behavior for dropdown open
  const handleFieldOpen = (open: boolean) => {
    // Skip loading if we have a saved value - just show the saved value
    if (value) {
      console.log(`📌 [DiscordGenericField] Not loading on dropdown open - using saved value for ${field.name}:`, value);
      return;
    }
    
    // When dropdown is opened and we only have placeholder options, trigger a real load
    const hasOnlyPlaceholder = processedOptions.length === 1 && (
      processedOptions[0].label?.includes('Loading') ||
      processedOptions[0].label === 'Any User'
    );
    
    if (open && field.dynamic && onDynamicLoad && !isLoading) {
      // Only force load if user explicitly opens and we don't have real options yet
      if (hasOnlyPlaceholder && !hasAttemptedLoad.current) {
        console.log(`📥 [DiscordGenericField] User opened dropdown - loading real options for ${field.name}`);
        hasAttemptedLoad.current = true;
        onDynamicLoad(field.name);
      }
    }
  };

  // Generic option processing
  const processOptions = (opts: any[]) => {
    // Remove duplicates and filter valid options
    let uniqueOptions = opts
      .filter(opt => opt && (opt.value !== undefined || opt.id !== undefined))
      .reduce((acc: any[], option: any) => {
        const optionId = option.value !== undefined ? option.value : option.id;
        // Check if we already have this option ID
        if (!acc.some(existingOption => {
          const existingId = existingOption.value !== undefined ? existingOption.value : existingOption.id;
          return existingId === optionId;
        })) {
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

  // If we have a value but no options (saved configuration), use the saved value
  let processedOptions = processOptions(options);
  
  // Check if we have a saved value
  if (value) {
    // For authorFilter, do case-insensitive matching for "anyone" value
    const matchingOption = processedOptions.find(opt => {
      const optValue = opt.value || opt.id;
      if (field.name === 'authorFilter' && 
          (value.toLowerCase() === 'anyone' || optValue?.toLowerCase() === 'anyone')) {
        return optValue?.toLowerCase() === value.toLowerCase();
      }
      // Also check if the value is a user ID that matches
      return String(optValue) === String(value);
    });
    
    if (!matchingOption) {
      console.log(`📌 [DiscordGenericField] Using saved value for ${field.name}:`, value);
      
      // Determine the display label based on available data
      let displayLabel = 'Selected';
      
      // Try to find a matching user in the options to get their name
      const userMatch = processedOptions.find(opt => String(opt.value || opt.id) === String(value));
      if (userMatch) {
        displayLabel = userMatch.label || userMatch.name || displayLabel;
      } else if (field.name === 'authorFilter' || field.name === 'filterAuthor') {
        // Special handling for "anyone" value
        if (value.toLowerCase() === 'anyone') {
          displayLabel = 'Anyone';
        } else {
          displayLabel = value === '' ? 'Any User' : 'Loading user...';
        }
      } else if (field.name === 'messageId') {
        // Try to use the formatted name if available
        const messageMatch = processedOptions.find(opt => String(opt.value || opt.id) === String(value));
        if (messageMatch && (messageMatch.name || messageMatch.label)) {
          displayLabel = messageMatch.name || messageMatch.label;
        } else {
          displayLabel = 'Selected Message';
        }
      }
      
      // Preserve the exact saved value to prevent it from being cleared
      // Always add the saved value as an option to ensure it's selectable
      processedOptions = [{
        id: value,
        value: value,
        label: displayLabel,
        name: displayLabel
      }, ...processedOptions];
    } else {
      console.log(`✅ [DiscordGenericField] Found matching option for ${field.name}:`, matchingOption);
    }
  }

  // Don't add duplicate "Anyone" option - it should come from the API
  // The channel-members handler already adds it with value="anyone"
  
  // Convert options to ComboboxOption format for message fields
  const comboboxOptions: ComboboxOption[] = processedOptions.map(option => {
    const optionValue = option.value !== undefined ? option.value : option.id;
    let optionLabel = option.label || option.name || (option.value !== undefined ? option.value : option.id) || "";
    let searchValue = String(optionLabel); // Ensure it's a string
    
    // Special handling for message fields - use the formatted name from backend if available
    if (field.name === 'messageId') {
      // Use the formatted name from backend which includes author, date, and preview
      if (option.name || option.label) {
        optionLabel = option.name || option.label;
        // Make both the formatted name and content searchable
        searchValue = `${optionLabel} ${option.content || ''}`;
      } else if (option.content) {
        // Fallback to content if no formatted name
        optionLabel = option.content;
        searchValue = option.content;
      } else {
        // Last fallback for messages without content or formatted name
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

  // Track last loaded channelId to prevent duplicate loads
  const lastLoadedChannelId = useRef<string | null>(null);
  
  // Automatically trigger loading if we have no options and aren't already loading
  // MUST be before any conditional returns to follow React hooks rules
  React.useEffect(() => {
    // For authorFilter field, auto-load when channelId changes or when no options available
    if (field.name === 'authorFilter' && parentValues?.channelId) {
      const channelId = parentValues.channelId;
      const needsLoad = processedOptions.length === 0 || 
                       (processedOptions.length === 1 && processedOptions[0].label === 'Selected User');
      
      // Load if channel changed or if we don't have data yet
      if (channelId !== lastLoadedChannelId.current && needsLoad) {
        console.log('📥 [DiscordGenericField] Auto-triggering author filter load for new channel:', {
          fieldName: field.name,
          channelId,
          lastLoadedChannelId: lastLoadedChannelId.current,
          optionsLength: processedOptions.length,
          isLoading,
          value
        });
        lastLoadedChannelId.current = channelId;
        if (onDynamicLoad) {
          onDynamicLoad(field.name, 'channelId', channelId);
        }
      }
    }
  }, [field.name, processedOptions.length, isLoading, onDynamicLoad, field.dynamic, parentValues?.channelId]);

  // Handle special "ANY_USER" value for authorFilter field - define before any returns
  const handleValueChange = (newValue: string) => {
    // Don't clear the value if we're still loading options
    if (isLoading && !newValue && value) {
      console.log(`🛡️ [DiscordGenericField] Preventing value clear for ${field.name} while loading`);
      return;
    }
    // For authorFilter, empty string means "any user"
    onChange(newValue);
  };
  
  // For display, ensure the value matches the option value exactly
  // For authorFilter with "anyone" value, ensure consistency
  let displayValue = value ?? '';
  if (field.name === 'authorFilter' && displayValue.toLowerCase() === 'anyone') {
    // Ensure it matches the exact value from our options
    const anyoneOption = processedOptions.find(opt => 
      (opt.value || opt.id)?.toLowerCase() === 'anyone'
    );
    if (anyoneOption) {
      displayValue = anyoneOption.value || anyoneOption.id || 'anyone';
    }
  }

  // Always show loading state when isLoading is true (even if we have cached data)
  if (field.dynamic && isLoading) {
    return (
      <Select disabled value={value ?? ""}>
        <SelectTrigger 
          className={cn(
            "h-10 bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200",
            error && "border-red-500 focus-border-red-500 focus:ring-red-500 focus:ring-offset-2"
          )}
        >
          <SelectValue placeholder={
            field.name === 'messageId' ? 'Loading Discord messages...' : 
            field.name === 'filterAuthor' ? 'Loading server members...' : 
            field.name === 'userId' ? 'Loading channel members...' :
            'Loading options...'
          } />
        </SelectTrigger>
      </Select>
    );
  }

  // Special case when no options are available
  if (processedOptions.length === 0 && !isLoading) {
    // For authorFilter with channelId set but no members, show "No members found"
    if (field.name === 'authorFilter' && parentValues?.channelId) {
      // If we've attempted to load and still have no options, the channel has no members
      if (hasAttemptedLoad.current || lastLoadedChannelId.current === parentValues.channelId) {
        return (
          <Select disabled value={value ?? ""}>
            <SelectTrigger 
              className={cn(
                "h-10 bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200",
                error && "border-red-500 focus:border-red-500 focus:ring-red-500 focus:ring-offset-2"
              )}
            >
              <SelectValue placeholder="No members found in this channel" />
            </SelectTrigger>
          </Select>
        );
      }
      // Otherwise show loading while we fetch
      return (
        <Select disabled value={value ?? ""}>
          <SelectTrigger 
            className={cn(
              "h-10 bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200",
              error && "border-red-500 focus:border-red-500 focus:ring-red-500 focus:ring-offset-2"
            )}
          >
            <SelectValue placeholder="Loading channel members..." />
          </SelectTrigger>
        </Select>
      );
    }
    
    // For authorFilter without channelId, show a disabled field
    if (field.name === 'authorFilter' && !parentValues?.channelId) {
      return (
        <Select disabled value={value ?? ""}>
          <SelectTrigger 
            className={cn(
              "h-10 bg-gray-50 border-slate-200",
              error && "border-red-500"
            )}
          >
            <SelectValue placeholder="Select a channel first..." />
          </SelectTrigger>
        </Select>
      );
    }
    
    // Special message for remove reaction actions when no messages with reactions are found
    if (field.name === 'messageId' && nodeInfo?.type === 'discord_action_remove_reaction') {
      return (
        <div className="text-sm text-slate-500">
          <p>No messages with reactions found in this channel.</p>
          <p className="mt-1 text-xs">Only messages that have reactions can be selected for reaction removal.</p>
          <Button 
            variant="outline"
            size="sm"
            type="button"
            className="mt-3"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
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
          type="button"
          className="mt-3"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
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

  // Use enhanced Discord message selector for message fields
  if (field.name === 'messageId') {
    return (
      <DiscordMessageSelector
        field={field}
        value={value}
        onChange={onChange}
        options={processedOptions}
        placeholder={field.placeholder || "Select a message..."}
        error={error}
      />
    );
  }

  return (
    <Select 
      value={displayValue} 
      onValueChange={handleValueChange}
      onOpenChange={handleFieldOpen}
    >
      <SelectTrigger 
        className={cn(
          "h-10 bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200",
          error && "border-red-500 focus:border-red-500 focus:ring-red-500 focus:ring-offset-2"
        )}
      >
        <SelectValue placeholder={
        field.name === 'authorFilter' ? "Select a user..." :
        field.name === 'userId' ? "Select a user..." :
        field.placeholder || "Select an option..."
      } />
      </SelectTrigger>
      <SelectContent 
        className="max-h-[200px]" 
        position="popper" 
        sideOffset={4}
      >
        {processedOptions.map((option: any, index: number) => {
          const optionValue = option.value !== undefined ? option.value : option.id;
          const optionLabel = option.label || option.name || (option.value !== undefined ? option.value : option.id) || "";
          
          // Skip rendering if optionValue is empty, null, or undefined
          // Convert empty strings to null to avoid Select.Item error
          if (!optionValue || optionValue === '') {
            console.warn(`Skipping option with empty value:`, option);
            return null;
          }
          
          return (
            <SelectItem 
              key={String(optionValue)} 
              value={String(optionValue)}
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

// Export directly without memoization to avoid React static flag issues
export const DiscordGenericField = DiscordGenericFieldComponent;
