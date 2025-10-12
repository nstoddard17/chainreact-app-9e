"use client"

import React from "react";
import { MultiCombobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

import { logger } from '@/lib/utils/logger'

interface OutlookEmailFieldProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  suggestions: any[];
  isLoading?: boolean;
  onDynamicLoad?: (fieldName: string) => void;
}

/**
 * Outlook-specific email autocomplete field
 * Handles Outlook recipients, contacts, and distribution lists
 */
export function OutlookEmailField({
  field,
  value,
  onChange,
  error,
  suggestions,
  isLoading,
  onDynamicLoad,
}: OutlookEmailFieldProps) {
  const hasRequestedOptionsRef = React.useRef(false);

  const suggestionCount = Array.isArray(suggestions) ? suggestions.length : 0;
  const normalizedSuggestions = Array.isArray(suggestions) ? suggestions : [];

  React.useEffect(() => {
    if (hasRequestedOptionsRef.current) {
      return;
    }

    if (field.dynamic && suggestionCount === 0 && onDynamicLoad && !isLoading) {
      hasRequestedOptionsRef.current = true;
      onDynamicLoad(field.name);
    }
  }, [field.dynamic, field.name, onDynamicLoad, isLoading, suggestionCount]);
  

  // Outlook-specific loading behavior
  const handleEmailFieldFocus = () => {
    if (field.dynamic && suggestionCount === 0 && onDynamicLoad && !isLoading) {
      onDynamicLoad(field.name);
    }
  };

  // Outlook-specific option processing
  const processOutlookOptions = (options: any[]) => {
    return options
      .filter(opt => opt && (opt.email || opt.value))
      .sort((a, b) => {
        const getPriority = (item: any) => {
          if (item.type === 'contact') return 0;
          if (item.type === 'distributionList') return 1;
          if (item.type === 'recent') return 2;
          return 3;
        };

        const priorityDiff = getPriority(a) - getPriority(b);
        if (priorityDiff !== 0) return priorityDiff;

        const aName = (a.name || a.label || a.email || '').toString().toLowerCase();
        const bName = (b.name || b.label || b.email || '').toString().toLowerCase();
        return aName.localeCompare(bName);
      })
      .map(opt => ({
        value: opt.email || opt.value,
        label: opt.name ? `${opt.name} (${opt.email || opt.value})` : (opt.email || opt.value),
        description: opt.type === 'contact' ? 'Outlook contact' : opt.type === 'recent' ? 'Recent contact' : opt.type === 'distributionList' ? 'Distribution list' : undefined
      }));
  };

  // Outlook-specific error handling
  const handleOutlookError = (error: string) => {
    if (error.includes('permission') || error.includes('403')) {
      return 'Outlook permission required. Please reconnect your Microsoft account.';
    }
    if (error.includes('throttle') || error.includes('rate')) {
      return 'Microsoft Graph API rate limit reached. Please try again in a moment.';
    }
    if (error.includes('mailbox')) {
      return 'Outlook mailbox access required. Please check your permissions.';
    }
    return error;
  };

  const processedOptions = processOutlookOptions(normalizedSuggestions);
  const processedError = error ? handleOutlookError(error) : undefined;

  // Convert comma-separated string to array and back (same as Gmail)
  const valueArray = value ? value.split(',').map((email: string) => email.trim()).filter(Boolean) : [];
  const handleChange = (newValue: string[]) => {
    onChange(newValue.join(', '));
  };

  // Handle dropdown opening to load data (same as Gmail)
  const handleDropdownOpen = (isOpen: boolean) => {
    logger.debug('📧 [OutlookEmailField] Dropdown opened:', {
      isOpen,
      fieldName: field.name,
      fieldDynamic: field.dynamic,
      suggestionsLength: suggestions.length,
      hasOnDynamicLoad: !!onDynamicLoad,
      isLoading,
      willCallDynamicLoad: isOpen && field.dynamic && suggestions.length === 0 && onDynamicLoad && !isLoading
    });

    if (isOpen && field.dynamic && suggestions.length === 0 && onDynamicLoad && !isLoading) {
      logger.debug('📧 [OutlookEmailField] Calling onDynamicLoad for:', field.name);
      onDynamicLoad(field.name);
    }
  };

  return (
    <div className="relative">
      <MultiCombobox
        value={valueArray}
        onChange={handleChange}
        options={processedOptions}
        placeholder={isLoading ? "Loading recent recipients..." : (field.placeholder || `Select ${field.label || field.name}...`)}
        searchPlaceholder={isLoading ? "Loading..." : "Search contacts..."}
        emptyPlaceholder={isLoading ? "Loading contacts..." : "No contacts found"}
        disabled={isLoading}
        creatable={!isLoading} // Only allow typing new addresses when not loading
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

