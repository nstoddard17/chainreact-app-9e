"use client"

import React from "react";
import { EmailAutocomplete } from "@/components/ui/email-autocomplete";
import { cn } from "@/lib/utils";

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
      .map(opt => ({
        ...opt,
        email: opt.email || opt.value,
        label: opt.label || (opt.name ? `${opt.name} <${opt.email || opt.value}>` : opt.email || opt.value)
      }))
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
      });
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

  const processedSuggestions = processOutlookOptions(normalizedSuggestions);
  const processedError = error ? handleOutlookError(error) : undefined;

  return (
    <EmailAutocomplete
      value={value || ""}
      onChange={onChange}
      placeholder={field.placeholder || `Enter ${field.label || field.name}...`}
      suggestions={processedSuggestions}
      multiple={true}
      isLoading={isLoading}
      disabled={false}
      onFocus={handleEmailFieldFocus}
      onDemandLoading={false}
      error={processedError}
      className={cn(
        error && "border-red-500"
      )}
    />
  );
}

