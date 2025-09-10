"use client"

import React, { useState, useRef, KeyboardEvent } from "react";
import { X } from "lucide-react";
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
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === "Tab") && inputValue.trim()) {
      e.preventDefault();
      const newTag = inputValue.trim();
      if (!value.includes(newTag)) {
        onChange([...value, newTag]);
      }
      setInputValue("");
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      // Remove last tag if backspace is pressed with empty input
      onChange(value.slice(0, -1));
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter(tag => tag !== tagToRemove));
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div 
        className={cn(
          "flex flex-wrap gap-2 p-2 min-h-[2.5rem] border rounded-md bg-background",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          disabled && "opacity-50 cursor-not-allowed",
          error && "border-red-500 focus-within:ring-red-500"
        )}
        onClick={() => inputRef.current?.focus()}
      >
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
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ""}
          disabled={disabled}
          className={cn(
            "flex-1 min-w-[120px] bg-transparent outline-none text-sm",
            "placeholder:text-muted-foreground",
            disabled && "cursor-not-allowed"
          )}
        />
      </div>
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}