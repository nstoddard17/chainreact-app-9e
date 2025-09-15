"use client"

import React, { useEffect, useRef, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import { forceRefreshDiscordGuilds } from "@/stores/discordGuildsCacheStore";

interface DiscordServerFieldProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  options: any[];
  isLoading?: boolean;
  onDynamicLoad?: (fieldName: string) => void;
}

/**
 * Discord-specific server/guild selector field
 * Handles Discord guilds with bot status checking
 */
function DiscordServerFieldComponent({
  field,
  value,
  onChange,
  error,
  options,
  isLoading,
  onDynamicLoad,
}: DiscordServerFieldProps) {
  
  // Track whether we've already attempted to load servers to prevent reloading
  const hasAttemptedLoad = useRef(false);
  const previousValue = useRef(value);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // For edit message (no value), always start with loading state
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [hasReceivedOptions, setHasReceivedOptions] = useState(false);

  // Reset load attempt flag if field is intentionally cleared
  useEffect(() => {
    if (previousValue.current && !value) {
      // Field was cleared, allow loading again
      hasAttemptedLoad.current = false;
    }
    previousValue.current = value;
  }, [value]);

  // Auto-load Discord servers on mount only if no value is selected
  useEffect(() => {
    // Only trigger load if:
    // 1. We haven't attempted to load yet
    // 2. Field is dynamic
    // 3. We have the load function
    // 4. IMPORTANT: Only load if no value is selected (for new configurations)
    //    OR if we have a value but no options (for edit configurations)
    if (!hasAttemptedLoad.current && field.dynamic && onDynamicLoad) {
      // If we have a value and options, don't reload
      if (value && options.length > 0) {
        // Skip auto-load - value exists with options
        hasAttemptedLoad.current = true;
        return;
      }
      
      // Auto-loading servers on mount
      hasAttemptedLoad.current = true;
      onDynamicLoad(field.name);
    }
  }, []); // Only run on mount
  
  // Track when we receive options for the first time
  useEffect(() => {
    if (options.length > 0 && !hasReceivedOptions) {
      setHasReceivedOptions(true);
      setIsInitialLoad(false);
      // If we have a value and now have options, we're done loading
      if (value) {
        hasAttemptedLoad.current = true;
      }
    }
  }, [options.length, hasReceivedOptions, value]);
  
  // Also clear initial load if loading completes with no options
  useEffect(() => {
    if (!isLoading && hasAttemptedLoad.current && isInitialLoad) {
      setIsInitialLoad(false);
    }
  }, [isLoading, isInitialLoad]);

  // Discord-specific loading behavior for dropdown open
  const handleServerFieldOpen = (open: boolean) => {
    // Don't reload if we already have options loaded or if we're currently loading
    if (options.length > 0 || isLoading || hasAttemptedLoad.current) {
      return;
    }
    
    // Load servers when dropdown opens if not already loaded
    if (open && field.dynamic && onDynamicLoad) {
      // Loading servers on dropdown open
      hasAttemptedLoad.current = true;
      onDynamicLoad(field.name);
    }
  };

  // Discord-specific option processing
  const processDiscordServers = (servers: any[]) => {
    // Remove duplicates and filter valid servers
    const uniqueServers = servers
      .filter(server => server && (server.value || server.id))
      .reduce((acc: any[], server: any) => {
        const serverId = server.value || server.id;
        // Check if we already have this server ID
        if (!acc.some(existingServer => (existingServer.value || existingServer.id) === serverId)) {
          acc.push(server);
        }
        return acc;
      }, []);

    return uniqueServers.sort((a, b) => {
      // Sort by member count (larger servers first)
      if (a.approximate_member_count && b.approximate_member_count) {
        return b.approximate_member_count - a.approximate_member_count;
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
      return 'Discord bot not found in servers. Please add the bot to your servers.';
    }
    return error;
  };

  // Handle manual refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    hasAttemptedLoad.current = false; // Reset the load flag
    try {
      await forceRefreshDiscordGuilds();
      // Trigger reload through the onDynamicLoad callback
      if (onDynamicLoad) {
        onDynamicLoad(field.name);
      }
    } catch (error) {
      console.error('Error refreshing Discord servers:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const processedOptions = processDiscordServers(options);
  const processedError = error ? handleDiscordError(error) : undefined;


  // We no longer show a separate loading state - saved values are shown immediately
  // and options load in the background

  // Special case when no Discord servers are available after loading
  // Only show this if we've actually received a response (not still in initial load)
  if (processedOptions.length === 0 && !isLoading && hasAttemptedLoad.current && hasReceivedOptions) {
    return (
      <div className="text-sm text-slate-500">
        <p>No Discord servers found. You may need to:</p>
        <ul className="list-disc list-inside mt-1 ml-2">
          <li>Reconnect your Discord account</li>
          <li>Ensure the bot is added to your servers</li>
          <li>Check server permissions</li>
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
          Retry Loading Servers
        </Button>
      </div>
    );
  }

  // Ensure value is always defined to prevent uncontrolled/controlled warning
  const selectValue = value === undefined || value === null ? "" : String(value);

  // When we have a saved value, always show it immediately while options load in background
  let displayOptions = processedOptions;
  if (selectValue) {
    // Check if the saved value exists in loaded options
    const savedOptionExists = processedOptions.some(opt =>
      String(opt.value || opt.id) === selectValue
    );

    // If the saved value doesn't exist in options yet, create a temporary placeholder
    if (!savedOptionExists) {
      // Create a nicer label for the temporary option
      const tempLabel = processedOptions.length === 0
        ? `Loading server...` // While loading, show a loading message
        : `Server ID: ${selectValue}`; // If loaded but not found, show the ID

      // Add the temporary option at the beginning
      displayOptions = [{
        value: selectValue,
        id: selectValue,
        label: tempLabel,
        temporary: true
      }, ...processedOptions];
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={selectValue}
        onValueChange={onChange}
        onOpenChange={handleServerFieldOpen}
        className="flex-1"
        disabled={isRefreshing}
      >
        <SelectTrigger
          className={cn(
            "h-10 bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200",
            error && "border-red-500 focus:border-red-500 focus:ring-red-500 focus:ring-offset-2",
            isRefreshing && "opacity-70"
          )}
        >
          <SelectValue placeholder={isRefreshing ? "Refreshing servers..." : (field.placeholder || "Select Discord server...")} />
        </SelectTrigger>
        <SelectContent
          className="bg-slate-900 text-white max-h-[200px]"
          position="popper"
          sideOffset={4}
          style={{
            backgroundColor: 'hsl(0 0% 10%)',
            color: 'white'
          }}
        >
          {/* Show loading state inside dropdown if options are being fetched */}
          {isLoading && (
            <div className="px-2 py-4 text-sm text-slate-400 text-center">
              <RefreshCw className="h-4 w-4 animate-spin inline-block mr-2" />
              Loading Discord servers...
            </div>
          )}

          {/* Show server count when not loading */}
          {!isLoading && (
            <div className="px-2 py-1.5 text-xs text-slate-400 border-b border-slate-700 mb-1">
              {displayOptions.filter(opt => !opt.temporary).length} server{displayOptions.filter(opt => !opt.temporary).length !== 1 ? 's' : ''} available
            </div>
          )}

          {displayOptions.map((option: any, index: number) => {
            const optionValue = option.value || option.id;
            const optionLabel = option.label || option.name || option.value || option.id;
            if (!optionValue) return null;

            // Mark temporary options with a different style
            const isTemp = option.temporary;

            return (
              <SelectItem
                key={String(optionValue)}
                value={String(optionValue)}
                className={isTemp ? "italic text-slate-400" : ""}
              >
                <span>{optionLabel}</span>
                {isTemp && processedOptions.length === 0 && (
                  <span className="ml-2 text-xs">(Current selection)</span>
                )}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      
      {/* Refresh button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleRefresh}
        disabled={isRefreshing || isLoading}
        className="h-10 px-3"
        title="Refresh server list"
      >
        <RefreshCw className={cn(
          "h-4 w-4",
          (isRefreshing || isLoading) && "animate-spin"
        )} />
      </Button>
    </div>
  );
}

// Export directly without memoization to avoid React static flag issues
export const DiscordServerField = DiscordServerFieldComponent;
