"use client"

import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageSquare, Calendar, User, Hash, ChevronsUpDown, X } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

interface DiscordMessageOption {
  id: string;
  value?: string;
  label?: string;
  name?: string;
  content?: string;
  author?: {
    username?: string;
    discriminator?: string;
    avatar?: string;
  };
  timestamp?: string;
  reactions?: Array<{
    emoji: { name: string; id?: string };
    count: number;
  }>;
}

interface DiscordMessageSelectorProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  options: DiscordMessageOption[];
  placeholder?: string;
  error?: string;
}

/**
 * Enhanced Discord message selector with better UI
 */
export function DiscordMessageSelector({
  field,
  value,
  onChange,
  options,
  placeholder = "Select a message...",
  error,
}: DiscordMessageSelectorProps) {

  // Format timestamp to readable format
  const formatTimestamp = (timestamp: string | undefined) => {
    if (!timestamp) return "";
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      // Format as "Aug 16, 4:37 PM" or similar
      const options: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      };
      
      // If it's today, just show time
      if (diffDays === 0) {
        return date.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        });
      }
      // If it's this year, don't show year
      else if (date.getFullYear() === now.getFullYear()) {
        return date.toLocaleDateString('en-US', options);
      }
      // Otherwise show full date
      else {
        return date.toLocaleDateString('en-US', { 
          ...options,
          year: 'numeric'
        });
      }
    } catch {
      return "";
    }
  };

  // Truncate message content  
  const truncateContent = (content: string | undefined, maxLength: number = 120) => {
    if (!content) return "Empty message";
    // Remove excessive whitespace and newlines for display
    const cleaned = content.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxLength) return cleaned;
    return cleaned.substring(0, maxLength).trim() + "...";
  };

  // Get author initials for avatar
  const getAuthorInitials = (author: any) => {
    if (!author?.username) return "?";
    return author.username.substring(0, 2).toUpperCase();
  };

  // Get Discord avatar URL or default avatar
  const getAvatarUrl = (author: any) => {
    if (author?.avatar) {
      // Custom avatar
      return `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png?size=64`;
    } else if (author?.id) {
      // Default Discord avatar based on discriminator or user ID
      // Discord uses user ID % 5 for default avatars when discriminator is 0
      const defaultAvatarIndex = author.discriminator && author.discriminator !== "0" 
        ? parseInt(author.discriminator) % 5 
        : (BigInt(author.id) >> 22n) % 6n;
      return `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`;
    }
    return null;
  };

  // Format reactions as emoji pills
  const renderReactions = (reactions: any[] | undefined) => {
    if (!reactions || reactions.length === 0) return null;
    
    return (
      <div className="flex items-center gap-1.5 mt-2">
        {reactions.slice(0, 4).map((reaction, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-full text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <span className="text-sm">{reaction.emoji?.name || "👍"}</span>
            <span className="font-semibold text-slate-600 dark:text-slate-400">
              {reaction.count}
            </span>
          </span>
        ))}
        {reactions.length > 4 && (
          <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">
            +{reactions.length - 4} more
          </span>
        )}
      </div>
    );
  };


  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  // Filter options based on search
  const filteredOptions = useMemo(() => {
    if (!searchValue.trim()) return options;
    const searchLower = searchValue.toLowerCase();
    return options.filter(option => {
      const messageContent = option.content || option.label || option.name || "";
      const authorName = option.author?.username || "";
      const searchText = `${messageContent} ${authorName}`.toLowerCase();
      return searchText.includes(searchLower);
    });
  }, [options, searchValue]);

  // Get selected message
  const selectedMessage = useMemo(() => {
    if (!value) return null;
    return options.find(o => (o.value || o.id) === value);
  }, [value, options]);

  // Render message item (used for both dropdown and selected display)
  const renderMessage = (message: DiscordMessageOption, isSelected: boolean = false) => {
    const authorName = message.author?.username || "Unknown User";
    const messageContent = message.content || message.label || message.name || "";
    const timestamp = formatTimestamp(message.timestamp);
    const avatarUrl = getAvatarUrl(message.author);

    return (
      <div className="w-full">
        {/* First line: Avatar + Author · Timestamp */}
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6 flex-shrink-0">
            {avatarUrl ? (
              <AvatarImage 
                src={avatarUrl} 
                alt={authorName}
              />
            ) : null}
            <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-[10px] font-semibold">
              {getAuthorInitials(message.author)}
            </AvatarFallback>
          </Avatar>
          
          <div className="text-sm text-slate-600 dark:text-slate-400">
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {authorName}
            </span>
            <span className="mx-1.5">·</span>
            <span className="text-xs">{timestamp}</span>
          </div>
        </div>

        {/* Message content - indented to align with author name */}
        <div className="ml-8 mt-1">
          <div className="text-sm text-slate-700 dark:text-slate-300">
            {truncateContent(messageContent, 100)}
          </div>

          {/* Reactions - also indented */}
          {message.reactions && message.reactions.length > 0 && (
            <div className="flex items-center gap-2 mt-1">
              {message.reactions.slice(0, 2).map((reaction: any, index: number) => (
                <span
                  key={index}
                  className="text-xs text-slate-500 dark:text-slate-400"
                >
                  {reaction.emoji?.name || "👍"} {reaction.count}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={cn("relative", error && "has-error")}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between min-h-[2.5rem] h-auto py-2 px-3",
              error && "border-red-500 focus:border-red-500 focus:ring-red-500"
            )}
          >
            <div className="flex-1 text-left">
              {selectedMessage ? (
                renderMessage(selectedMessage, true)
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </div>
            <div className="flex items-center gap-0.5 ml-2 flex-shrink-0">
              {value && (
                <div
                  className="group p-0.5 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange("");
                  }}
                >
                  <X className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600" />
                </div>
              )}
              <ChevronsUpDown className="h-4 w-4 opacity-50" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-[--radix-popover-trigger-width] p-0" 
          align="start" 
          sideOffset={4}
          onOpenAutoFocus={(e) => {
            // Prevent auto-focus to allow immediate scrolling
            e.preventDefault();
          }}
        >
          <div className="flex flex-col max-h-[400px]">
            <div className="flex items-center border-b px-3 flex-shrink-0">
              <svg
                width="15"
                height="15"
                viewBox="0 0 15 15"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="mr-2 h-4 w-4 shrink-0 opacity-50"
              >
                <path
                  d="M11.8536 1.14645C11.6583 0.951184 11.3417 0.951184 11.1465 1.14645L3.71455 8.57836C3.62459 8.66832 3.55263 8.77461 3.50251 8.89155L2.04044 12.303C1.9599 12.491 2.00189 12.709 2.14646 12.8536C2.29103 12.9981 2.50905 13.0401 2.69697 12.9596L6.10847 11.4975C6.22541 11.4474 6.3317 11.3754 6.42166 11.2855L13.8536 3.85355C14.0488 3.65829 14.0488 3.34171 13.8536 3.14645L11.8536 1.14645ZM4.42166 9.28547L11.5 2.20711L12.7929 3.5L5.71455 10.5784L4.21924 11.2192L3.78081 10.7808L4.42166 9.28547Z"
                  fill="currentColor"
                  fillRule="evenodd"
                  clipRule="evenodd"
                ></path>
              </svg>
              <input
                className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Search by message content or author..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
              />
            </div>
            <div 
              className="flex-1 overflow-y-auto overflow-x-hidden min-h-0" 
              style={{ maxHeight: '350px', overscrollBehavior: 'contain' }}
              onWheel={(e) => {
                // Prevent event from bubbling up and ensure scrolling works
                e.stopPropagation();
              }}
            >
              <div className="p-1">
                {filteredOptions.length === 0 ? (
                  <div className="py-6 text-center text-sm">No messages found in this channel.</div>
                ) : (
                  filteredOptions.map((option) => {
                    const optionValue = option.value || option.id;
                    return (
                      <div
                        key={optionValue}
                        onClick={() => {
                          onChange(optionValue);
                          setOpen(false);
                          setSearchValue("");
                        }}
                        className={cn(
                          "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                          "p-2"
                        )}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4 flex-shrink-0",
                            value === optionValue ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {renderMessage(option)}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}