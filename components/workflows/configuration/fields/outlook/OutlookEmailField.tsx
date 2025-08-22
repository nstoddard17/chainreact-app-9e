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
  
  // Outlook-specific loading behavior
  const handleEmailFieldFocus = () => {
    if (field.dynamic && suggestions.length === 0 && onDynamicLoad && !isLoading) {
      onDynamicLoad(field.name);
    }
  };

  // Outlook-specific option processing
  const processOutlookOptions = (options: any[]) => {
    return options
      .filter(opt => opt && opt.email)
      .sort((a, b) => {
        // Prioritize Outlook contacts first
        if (a.type === 'contact' && b.type !== 'contact') return -1;
        if (b.type === 'contact' && a.type !== 'contact') return 1;
        
        // Then distribution lists
        if (a.type === 'distributionList' && b.type !== 'distributionList') return -1;
        if (b.type === 'distributionList' && a.type !== 'distributionList') return 1;
        
        // Then recent Outlook contacts
        if (a.type === 'recent' && b.type !== 'recent') return -1;
        if (b.type === 'recent' && a.type !== 'recent') return 1;
        
        // Then by display name availability
        if (a.displayName && !b.displayName) return -1;
        if (b.displayName && !a.displayName) return 1;
        
        // Default to alphabetical by display name or email
        return (a.displayName || a.email).localeCompare(b.displayName || b.email);
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

  const processedSuggestions = processOutlookOptions(suggestions);
  const processedError = error ? handleOutlookError(error) : undefined;

  return (
    <EmailAutocomplete
      value={value || ""}
      onChange={onChange}
      placeholder={field.placeholder || `Enter ${field.label || field.name}...`}
      suggestions={processedSuggestions}
      multiple={true}
      isLoading={isLoading}
      disabled={isLoading}
      onFocus={handleEmailFieldFocus}
      onDemandLoading={true}
      error={processedError}
      className={cn(
        error && "border-red-500"
      )}
    />
  );
}