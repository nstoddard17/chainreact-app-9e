"use client"

import React, { useEffect, useRef, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

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
      // Trigger reload through the onDynamicLoad callback with force refresh
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

  // Try to get saved label from localStorage for immediate display
  const getSavedLabel = (serverId: string): string | null => {
    if (!serverId) return null;
    try {
      const storageKey = `discord_server_label_${serverId}`;
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

      // Create a nicer label for the temporary option
      const tempLabel = savedLabel ||
        (processedOptions.length === 0
          ? `Server (${selectValue.substring(0, 8)}...)` // Show truncated ID while loading
          : `Server ID: ${selectValue}`); // If loaded but not found, show the ID

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
    <div className="w-full space-y-2">
      <div className="flex items-center gap-2">
        <Select
          value={selectValue}
          onValueChange={(selectedValue) => {
            onChange(selectedValue);
            try {
              const selectedOption = displayOptions.find(
                (opt) => String(opt.value || opt.id) === selectedValue
              );
              if (selectedOption) {
                const storageKey = `discord_server_label_${selectedValue}`;
                localStorage.setItem(
                  storageKey,
                  selectedOption.label || selectedOption.name || selectedOption.value || selectedOption.id
                );
              }
            } catch (e) {
              console.error('Error saving label to storage:', e);
            }
          }}
          onOpenChange={handleServerFieldOpen}
        >
          <SelectTrigger
            className={cn(
              "w-full",
              (error || processedError) && "border-red-500",
              (isLoading || isRefreshing) && "opacity-70"
            )}
          >
            <SelectValue
              placeholder={
                isLoading || isInitialLoad
                  ? "Loading Discord servers..."
                  : "Select a Discord server"
              }
            />
          </SelectTrigger>
          <SelectContent className="max-h-[280px]">
            {displayOptions.length > 0 ? (
              displayOptions.map((server: any) => (
                <SelectItem
                  key={server.value || server.id}
                  value={String(server.value || server.id)}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span>{server.label || server.name || server.value || server.id}</span>
                    {server.temporary && (
                      <span className="text-xs text-muted-foreground">(Loading details...)</span>
                    )}
                  </div>
                  {server.approximate_member_count && (
                    <span className="text-xs text-muted-foreground">
                      {server.approximate_member_count.toLocaleString()} members
                    </span>
                  )}
                </SelectItem>
              ))
            ) : (
              <div className="p-4 text-center text-sm text-muted-foreground">
                <p>No servers available for this Discord account.</p>
                <p className="mt-1 text-xs">
                  Invite the ChainReact bot to your server or check your Discord permissions.
                </p>
              </div>
            )}
          </SelectContent>
        </Select>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                disabled={isLoading || isRefreshing}
                onClick={handleRefresh}
              >
                <RefreshCw
                  className={cn(
                    "h-4 w-4",
                    (isLoading || isRefreshing) && "animate-spin"
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" align="center">
              <p className="text-xs">Refresh servers</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {isLoading || isRefreshing || isInitialLoad
            ? "Loading Discord servers..."
            : displayOptions.length > 0
              ? "Discord servers are loaded."
              : "No servers available."}
        </span>
      </div>
    </div>
  );
}

// Export directly without memoization to avoid React static flag issues
export const DiscordServerField = DiscordServerFieldComponent;
