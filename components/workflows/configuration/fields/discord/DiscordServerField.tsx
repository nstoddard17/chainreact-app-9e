"use client"

import React, { useEffect, useRef } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
export function DiscordServerField({
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

  // Reset load attempt flag if field is intentionally cleared
  useEffect(() => {
    if (previousValue.current && !value) {
      // Field was cleared, allow loading again
      hasAttemptedLoad.current = false;
    }
    previousValue.current = value;
  }, [value]);

  // Auto-load Discord servers on mount ONLY if no data exists AND no value is selected
  useEffect(() => {
    // Skip auto-loading if we already have a selected value OR if we have options available
    if (value || options.length > 0) {
      console.log('📌 Skipping Discord server auto-load - value or options exist:', {
        value,
        optionsCount: options.length
      });
      hasAttemptedLoad.current = true; // Mark as attempted to prevent future loads
      return;
    }
    
    if (field.dynamic && onDynamicLoad && !isLoading && !hasAttemptedLoad.current) {
      console.log('🔍 Auto-loading Discord servers on mount for field:', field.name);
      hasAttemptedLoad.current = true;
      onDynamicLoad(field.name);
    }
  }, [field.dynamic, field.name, onDynamicLoad, isLoading, options.length, value]);

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

  const processedOptions = processDiscordServers(options);
  const processedError = error ? handleDiscordError(error) : undefined;

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
            <span>Loading Discord servers...</span>
          </div>
        </SelectTrigger>
      </Select>
    );
  }

  // Special case when no Discord servers are available
  if (processedOptions.length === 0 && !isLoading) {
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

  return (
    <Select 
      value={value ?? ""} 
      onValueChange={onChange}
      onOpenChange={handleServerFieldOpen}
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
        {processedOptions.map((option: any, index: number) => {
          const optionValue = option.value || option.id;
          const optionLabel = option.label || option.name || option.value || option.id;
          
          return (
            <SelectItem 
              key={`${optionValue}-${index}`} 
              value={optionValue}
            >
              <span>{optionLabel}</span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}