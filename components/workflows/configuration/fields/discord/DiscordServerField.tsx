"use client"

import React from "react";
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

  // Discord-specific loading behavior
  const handleServerFieldOpen = (open: boolean) => {
    if (open && field.dynamic && onDynamicLoad && !isLoading && options.length === 0) {
      onDynamicLoad(field.name);
    }
  };

  // Discord-specific option processing
  const processDiscordServers = (servers: any[]) => {
    return servers
      .filter(server => server && (server.value || server.id))
      .sort((a, b) => {
        // Prioritize servers where bot has permissions
        if (a.botInGuild && !b.botInGuild) return -1;
        if (b.botInGuild && !a.botInGuild) return 1;
        
        // Then by member count (larger servers first)
        if (a.memberCount && b.memberCount) {
          return b.memberCount - a.memberCount;
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

  // Show loading state for dynamic fields
  if (field.dynamic && isLoading && processedOptions.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
        Loading Discord servers...
      </div>
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
      value={value || ""} 
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
      <SelectContent>
        {processedOptions.map((option: any, index: number) => {
          const optionValue = option.value || option.id;
          const optionLabel = option.label || option.name || option.value || option.id;
          const hasBot = option.botInGuild;
          
          return (
            <SelectItem 
              key={`${optionValue}-${index}`} 
              value={optionValue}
              className={cn(
                !hasBot && "opacity-60"
              )}
            >
              <div className="flex items-center gap-2">
                <span>{optionLabel}</span>
                {!hasBot && (
                  <span className="text-xs text-orange-500">(Bot not added)</span>
                )}
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}