"use client"

import React from "react";
import { MultiCombobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface GmailEmailFieldProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  suggestions: any[];
  isLoading?: boolean;
  onDynamicLoad?: (fieldName: string) => void;
}

/**
 * Gmail-specific email autocomplete field
 * Handles Gmail recipients, enhanced recipients, and contact groups
 */
export function GmailEmailField({
  field,
  value,
  onChange,
  error,
  suggestions,
  isLoading,
  onDynamicLoad,
}: GmailEmailFieldProps) {
  
  // Gmail-specific loading behavior
  const handleEmailFieldFocus = () => {
    if (field.dynamic && suggestions.length === 0 && onDynamicLoad && !isLoading) {
      onDynamicLoad(field.name);
    }
  };

  // Gmail-specific option processing
  const processGmailOptions = (options: any[]) => {
    return options
      .filter(opt => opt && opt.email)
      .sort((a, b) => {
        // Prioritize Gmail contacts first
        if (a.type === 'contact' && b.type !== 'contact') return -1;
        if (b.type === 'contact' && a.type !== 'contact') return 1;
        
        // Then recent Gmail contacts
        if (a.type === 'recent' && b.type !== 'recent') return -1;
        if (b.type === 'recent' && a.type !== 'recent') return 1;
        
        // Then by name availability
        if (a.name && !b.name) return -1;
        if (b.name && !a.name) return 1;
        
        // Default to alphabetical
        return (a.name || a.email).localeCompare(b.name || b.email);
      })
      .map(opt => ({
        value: opt.email,
        label: opt.name ? `${opt.name} (${opt.email})` : opt.email,
        description: opt.type === 'recent' ? 'Recent contact' : opt.type === 'contact' ? 'Gmail contact' : undefined
      }));
  };

  // Gmail-specific error handling
  const handleGmailError = (error: string) => {
    if (error.includes('permission') || error.includes('403')) {
      return 'Gmail permission required. Please reconnect your Gmail account.';
    }
    if (error.includes('quota') || error.includes('rate')) {
      return 'Gmail API rate limit reached. Please try again in a moment.';
    }
    return error;
  };

  const processedOptions = processGmailOptions(suggestions);
  const processedError = error ? handleGmailError(error) : undefined;

  // Convert comma-separated string to array and back
  const valueArray = value ? value.split(',').map((email: string) => email.trim()).filter(Boolean) : [];
  const handleChange = (newValue: string[]) => {
    onChange(newValue.join(', '));
  };

  // Handle dropdown opening to load data
  const handleDropdownOpen = (isOpen: boolean) => {
    console.log('📧 [GmailEmailField] Dropdown opened:', {
      isOpen,
      fieldName: field.name,
      fieldDynamic: field.dynamic,
      suggestionsLength: suggestions.length,
      hasOnDynamicLoad: !!onDynamicLoad,
      isLoading,
      willCallDynamicLoad: isOpen && field.dynamic && suggestions.length === 0 && onDynamicLoad && !isLoading
    });
    
    if (isOpen && field.dynamic && suggestions.length === 0 && onDynamicLoad && !isLoading) {
      console.log('📧 [GmailEmailField] Calling onDynamicLoad for:', field.name);
      onDynamicLoad(field.name);
    }
  };

  return (
    <div className="relative">
      <MultiCombobox
        value={valueArray}
        onChange={handleChange}
        options={processedOptions}
        placeholder={
          isLoading && processedOptions.length === 0
            ? "Loading recent recipients..."
            : isLoading
              ? field.placeholder || `Select ${field.label || field.name}...`
              : field.placeholder || `Select ${field.label || field.name}...`
        }
        searchPlaceholder={isLoading ? "Loading..." : "Search contacts..."}
        emptyPlaceholder={isLoading ? "Loading contacts..." : "No contacts found"}
        disabled={false}
        creatable={true} // Always allow typing email addresses
        onOpenChange={handleDropdownOpen}
        className={cn(
          error && "border-red-500",
          isLoading && "opacity-70"
        )}
        showFullEmails={true} // Pass prop to show full emails
      />
      {isLoading && (
        <div className="absolute right-10 top-1/2 -translate-y-1/2 pointer-events-none">
          <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
        </div>
      )}
    </div>
  );
}