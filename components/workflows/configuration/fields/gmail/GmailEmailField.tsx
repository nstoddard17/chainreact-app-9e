"use client"

import React from "react";
import { MultiCombobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

import { logger } from '@/lib/utils/logger'

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
  // Store variable aliases for display
  const [variableOptions, setVariableOptions] = React.useState<Array<{value: string, label: string}>>([]);

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

  // Combine regular options with variable options
  const processedGmailOptions = processGmailOptions(suggestions);
  const processedOptions = [...processedGmailOptions, ...variableOptions];
  const processedError = error ? handleGmailError(error) : undefined;

  // Convert comma-separated string to array and back
  const valueArray = value ? value.split(',').map((email: string) => email.trim()).filter(Boolean) : [];
  const handleChange = (newValue: string[]) => {
    onChange(newValue.join(', '));
  };

  // Handle dropdown opening to load data
  const handleDropdownOpen = (isOpen: boolean) => {
    logger.debug('📧 [GmailEmailField] Dropdown opened:', {
      isOpen,
      fieldName: field.name,
      fieldDynamic: field.dynamic,
      suggestionsLength: suggestions.length,
      hasOnDynamicLoad: !!onDynamicLoad,
      isLoading,
      willCallDynamicLoad: isOpen && field.dynamic && suggestions.length === 0 && onDynamicLoad && !isLoading
    });

    if (isOpen && field.dynamic && suggestions.length === 0 && onDynamicLoad && !isLoading) {
      logger.debug('📧 [GmailEmailField] Calling onDynamicLoad for:', field.name);
      onDynamicLoad(field.name);
    }
  };

  // Handle variable drops
  const handleVariableDrop = React.useCallback((e: React.DragEvent) => {
    // Extract variable and alias from drag data
    const jsonData = e.dataTransfer.getData('application/json')
    let droppedText = e.dataTransfer.getData('text/plain')
    let alias: string | null = null

    if (jsonData) {
      try {
        const parsed = JSON.parse(jsonData)
        if (parsed.variable) {
          droppedText = parsed.variable
        }
        if (parsed.alias) {
          alias = parsed.alias
        }
      } catch (err) {
        logger.warn('[GmailEmailField] Failed to parse JSON drag data:', err)
      }
    }

    logger.debug('📧 [GmailEmailField] Variable dropped:', {
      fieldName: field.name,
      droppedText,
      alias,
      isVariable: droppedText.startsWith('{{') && droppedText.endsWith('}}')
    })

    // Check if it's a variable reference
    if (droppedText && droppedText.startsWith('{{') && droppedText.endsWith('}}')) {
      // Add the variable to the options list with its alias as the label
      const displayLabel = alias || droppedText
      setVariableOptions(prev => {
        // Check if this variable is already in the options
        const exists = prev.some(opt => opt.value === droppedText)
        if (exists) return prev

        return [...prev, { value: droppedText, label: displayLabel }]
      })

      // Add the variable to the current values
      onChange(value ? `${value}, ${droppedText}` : droppedText)

      logger.debug('✅ [GmailEmailField] Variable accepted:', {
        fieldName: field.name,
        variable: droppedText,
        alias,
        displayLabel,
        newValue: value ? `${value}, ${droppedText}` : droppedText
      })
    }
  }, [field.name, value, onChange])

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
        onDrop={handleVariableDrop}
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