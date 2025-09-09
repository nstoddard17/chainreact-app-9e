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

  // Reset load attempt flag if field is intentionally cleared
  useEffect(() => {
    if (previousValue.current && !value) {
      // Field was cleared, allow loading again
      hasAttemptedLoad.current = false;
    }
    previousValue.current = value;
  }, [value]);

  // Auto-load Discord servers on mount immediately
  useEffect(() => {
    // Skip auto-loading if we already have options available
    if (options.length > 0) {
      console.log('📌 Skipping Discord server auto-load - options exist:', {
        value,
        optionsCount: options.length
      });
      hasAttemptedLoad.current = true; // Mark as attempted to prevent future loads
      return;
    }
    
    if (field.dynamic && onDynamicLoad && !hasAttemptedLoad.current) {
      console.log('🔍 Auto-loading Discord servers on mount for field:', field.name);
      hasAttemptedLoad.current = true;
      onDynamicLoad(field.name);
    }
  }, [field.dynamic, field.name, onDynamicLoad, options.length]);

  // Discord-specific loading behavior for dropdown open
  const handleServerFieldOpen = (open: boolean) => {
    // Don't reload if we already have a selected value OR if we have options
    if (value || options.length > 0) {
      console.log('📌 Skipping Discord server reload on dropdown open - value or options exist:', {
        value,
        optionsCount: options.length
      });
      return;
    }
    
    if (open && field.dynamic && onDynamicLoad && !isLoading && !hasAttemptedLoad.current) {
      console.log('🔍 Loading Discord servers on dropdown open for field:', field.name);
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
      console.log('🔄 Manually refreshing Discord servers...');
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

  // Show loading state immediately when modal opens and no options are available
  if (field.dynamic && (isLoading || (options.length === 0 && !hasAttemptedLoad.current))) {
    return (
      <Select disabled value={value === undefined || value === null ? "" : String(value)}>
        <SelectTrigger 
          className={cn(
            "h-10 bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200",
            error && "border-red-500 focus:border-red-500 focus:ring-red-500 focus:ring-offset-2"
          )}
        >
          <SelectValue placeholder="Loading Discord servers..." />
        </SelectTrigger>
      </Select>
    );
  }

  // Special case when no Discord servers are available after loading
  if (processedOptions.length === 0 && !isLoading && hasAttemptedLoad.current) {
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
  
  return (
    <div className="flex items-center gap-2">
      <Select 
        value={selectValue} 
        onValueChange={onChange}
        onOpenChange={handleServerFieldOpen}
        className="flex-1"
      >
        <SelectTrigger 
          className={cn(
            "h-10 bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200",
            error && "border-red-500 focus:border-red-500 focus:ring-red-500 focus:ring-offset-2"
          )}
        >
          <SelectValue placeholder={field.placeholder || "Select Discord server..."} />
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
          {/* Add refresh option at the top */}
          <div className="px-2 py-1.5 text-xs text-slate-400 border-b border-slate-700 mb-1">
            {processedOptions.length} server{processedOptions.length !== 1 ? 's' : ''} available
          </div>
          
          {processedOptions.map((option: any, index: number) => {
            const optionValue = option.value || option.id;
            const optionLabel = option.label || option.name || option.value || option.id;
            if (!optionValue) return null;
            
            return (
              <SelectItem 
                key={String(optionValue)} 
                value={String(optionValue)}
              >
                <span>{optionLabel}</span>
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
