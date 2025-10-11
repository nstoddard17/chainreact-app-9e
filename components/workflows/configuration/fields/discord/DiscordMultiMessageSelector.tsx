"use client"

import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChevronsUpDown, X, Loader2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";

interface DiscordMessageOption {
  id: string;
  value?: string;
  label?: string;
  name?: string;
  content?: string;
  author?: {
    id?: string;
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

interface DiscordMultiMessageSelectorProps {
  field: any;
  value: string[];
  onChange: (value: string[]) => void;
  options: DiscordMessageOption[];
  placeholder?: string;
  error?: string;
  isLoading?: boolean;
}

/**
 * Multi-select Discord message selector with same design as single selector
 */
export function DiscordMultiMessageSelector({
  field,
  value = [],
  onChange,
  options,
  placeholder = "Select messages...",
  error,
  isLoading = false,
}: DiscordMultiMessageSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  // Format timestamp to readable format matching Discord style
  const formatTimestamp = (timestamp: string | undefined) => {
    if (!timestamp) return "";
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) {
        // Today - show time only like "4:37 PM"
        return date.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        });
      } else if (diffDays === 1) {
        // Yesterday
        return `Yesterday at ${date.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        })}`;
      } else if (diffDays < 7) {
        // Within a week - show day name
        return date.toLocaleDateString('en-US', {
          weekday: 'long',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
      } else if (date.getFullYear() === now.getFullYear()) {
        // This year - show month, day and time like "Aug 16, 4:37 PM"
        const month = date.toLocaleDateString('en-US', { month: 'short' });
        const day = date.getDate();
        const time = date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        return `${month} ${day}, ${time}`;
      } 
        // Different year
        return date.toLocaleDateString('en-US', { 
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
      
    } catch {
      return "";
    }
  };

  // Truncate message content  
  const truncateContent = (content: string | undefined, maxLength: number = 100) => {
    if (!content) return "Empty message";
    const cleaned = content.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxLength) return cleaned;
    return `${cleaned.substring(0, maxLength).trim() }...`;
  };

  // Get author initials for avatar
  const getAuthorInitials = (author: any) => {
    if (!author?.username) return "?";
    return author.username.substring(0, 2).toUpperCase();
  };

  // Get Discord avatar URL or default avatar
  const getAvatarUrl = (author: any) => {
    if (author?.avatar) {
      // User has a custom avatar - use Discord CDN
      return `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png?size=128`;
    } else if (author?.id) {
      // User has no custom avatar - use Discord's default avatars
      // Discord migrated to new username system, discriminator might be "0" or missing
      const defaultAvatarIndex = author.discriminator && author.discriminator !== "0" 
        ? parseInt(author.discriminator) % 5 
        : (BigInt(author.id) >> 22n) % 6n;
      return `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`;
    }
    return null;
  };

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

  // Get selected messages
  const selectedMessages = useMemo(() => {
    return options.filter(o => value.includes(o.value || o.id));
  }, [value, options]);

  // Toggle message selection
  const toggleMessage = (messageId: string) => {
    if (value.includes(messageId)) {
      onChange(value.filter(id => id !== messageId));
    } else {
      onChange([...value, messageId]);
    }
  };

  // Remove specific message
  const removeMessage = (messageId: string) => {
    onChange(value.filter(id => id !== messageId));
  };

  // Clear all selections
  const clearAll = () => {
    onChange([]);
  };

  // Render message item (copied exactly from DiscordMessageSelector)
  const renderMessage = (message: DiscordMessageOption, isSelected: boolean = false) => {
    const authorName = message.author?.username || "Unknown User";
    // Use ONLY message.content for the actual message text, not the formatted name
    const messageContent = message.content || "";
    const timestamp = formatTimestamp(message.timestamp);
    const avatarUrl = getAvatarUrl(message.author);

    return (
      <div className="w-full flex gap-3">
        {/* Avatar on the left */}
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
        
        {/* Message content on the right */}
        <div className="flex-1 min-w-0">
          {/* Author name and timestamp on same line */}
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="font-medium text-sm text-slate-900 dark:text-slate-100">
              {authorName}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              ·
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {timestamp}
            </span>
          </div>
          
          {/* Message content */}
          <div className="text-sm text-slate-700 dark:text-slate-300 break-words">
            {truncateContent(messageContent, 150)}
          </div>

          {/* Reactions */}
          {message.reactions && message.reactions.length > 0 && (
            <div className="flex items-center gap-2 mt-1.5">
              {message.reactions.slice(0, 3).map((reaction: any, index: number) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-xs"
                >
                  <span>{reaction.emoji?.name || "👍"}</span>
                  <span className="text-slate-600 dark:text-slate-400">{reaction.count}</span>
                </span>
              ))}
              {message.reactions.length > 3 && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  +{message.reactions.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render selected messages in field
  const renderSelectedInField = () => {
    if (isLoading) {
      return (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading messages...</span>
        </div>
      );
    }
    
    if (selectedMessages.length === 0) {
      return <span className="text-muted-foreground">{placeholder}</span>;
    }

    if (selectedMessages.length === 1) {
      // Single selection - show full message like single selector
      return renderMessage(selectedMessages[0], true);
    }

    // Multiple selections - show stacked with count
    return (
      <div className="space-y-2">
        {selectedMessages.slice(0, 2).map((message, index) => (
          <div 
            key={message.value || message.id} 
            className={cn(
              "relative",
              index < selectedMessages.slice(0, 2).length - 1 && "pb-2 border-b border-slate-200 dark:border-slate-700"
            )}
          >
            {renderMessage(message, true)}
          </div>
        ))}
        {selectedMessages.length > 2 && (
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 pl-[36px]">
            <span className="font-medium">+{selectedMessages.length - 2} more</span>
            <span>message{selectedMessages.length - 2 > 1 ? 's' : ''} selected</span>
          </div>
        )}
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
              "w-full justify-between min-h-[3rem] h-auto py-3 px-4",
              error && "border-red-500 focus:border-red-500 focus:ring-red-500"
            )}
          >
            <div className="flex-1 text-left">
              {renderSelectedInField()}
            </div>
            <div className="flex items-center gap-0.5 ml-2 flex-shrink-0">
              {value.length > 0 && (
                <div
                  className="group p-0.5 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearAll();
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
                    const isSelected = value.includes(optionValue);
                    
                    return (
                      <div
                        key={optionValue}
                        onClick={() => toggleMessage(optionValue)}
                        className={cn(
                          "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                          "p-2"
                        )}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4 flex-shrink-0",
                            isSelected ? "opacity-100" : "opacity-0"
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