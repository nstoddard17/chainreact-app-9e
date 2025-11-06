"use client"

import React, { useState, useRef, KeyboardEvent } from "react";
import { X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  error?: string;
}

export function TagInput({
  value = [],
  onChange,
  placeholder = "Type and press Enter",
  disabled = false,
  className,
  error
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [duplicateError, setDuplicateError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === "Tab") && inputValue.trim()) {
      e.preventDefault();
      const newTag = inputValue.trim();

      // Check for duplicates
      if (value.includes(newTag)) {
        setDuplicateError(true);
        setTimeout(() => setDuplicateError(false), 2000);
        return;
      }

      onChange([...value, newTag]);
      setInputValue("");
      setDuplicateError(false);
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      // Remove last tag if backspace is pressed with empty input
      onChange(value.slice(0, -1));
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter(tag => tag !== tagToRemove));
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Input field only */}
      <div
        className={cn(
          "flex items-center gap-2 p-2 min-h-[2.5rem] border rounded-md bg-white dark:bg-slate-950 relative",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          disabled && "opacity-50 cursor-not-allowed",
          (error || duplicateError) && "border-red-500 focus-within:ring-red-500"
        )}
        onClick={() => inputRef.current?.focus()}
      >
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "flex-1 bg-transparent outline-none text-sm",
            "placeholder:text-muted-foreground",
            disabled && "cursor-not-allowed"
          )}
        />
        {/* Press Enter indicator with pulse effect */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
          <span>Press</span>
          <kbd className={cn(
            "px-1.5 py-0.5 text-[10px] font-semibold border rounded bg-muted relative overflow-visible",
            "transition-all duration-300"
          )}>
            {isFocused && (
              <span className="absolute inset-0 rounded border-2 border-blue-400 animate-pulse-border" />
            )}
            <span className="relative">↵ Enter</span>
          </kbd>
        </div>
      </div>

      {/* Pills displayed below */}
      {value.length > 0 && (
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap gap-2 flex-1">
            {value.map((tag, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="px-2 py-1 flex items-center gap-1"
              >
                <span className="text-xs">{tag}</span>
                {!disabled && (
                  <X
                    className="h-3 w-3 cursor-pointer hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTag(tag);
                    }}
                  />
                )}
              </Badge>
            ))}
          </div>
          {/* Clear all button below on the right */}
          {!disabled && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 whitespace-nowrap font-medium flex-shrink-0"
            >
              Clear all ({value.length})
            </button>
          )}
        </div>
      )}

      {/* Help box when focused and no items yet */}
      {isFocused && value.length === 0 && (
        <div className="bg-muted/50 border border-border rounded-md p-3 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">Multi-Value Input</p>
              <p>Add items one by one to create a list:</p>
              <ol className="list-decimal ml-4 space-y-0.5">
                <li>Type a value in the field above</li>
                <li>Press <kbd className="px-1 py-0.5 text-[10px] font-semibold border rounded bg-background">Enter</kbd> key to add it</li>
                <li>Repeat to add more values</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Error messages */}
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
      {duplicateError && (
        <p className="text-xs text-red-500">This value already exists</p>
      )}
    </div>
  );
}