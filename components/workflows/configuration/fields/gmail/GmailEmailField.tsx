"use client"

import React from "react";
import { MultiCombobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { X, Mail, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LoadingFieldState } from "../shared/LoadingFieldState";

import { logger } from '@/lib/utils/logger'

interface GmailEmailFieldProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  suggestions: any[];
  isLoading?: boolean;
  onDynamicLoad?: (fieldName: string, dependsOn?: string, dependsOnValue?: any, forceRefresh?: boolean, silent?: boolean) => void;
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
  const loadOnMountRef = React.useRef(false);

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
  const showTagPreview = field.name === 'from';
  const handleRemoveTag = (emailToRemove: string) => {
    const newValues = valueArray.filter((email) => email !== emailToRemove);
    handleChange(newValues);
  };
  const handleRefresh = React.useCallback(() => {
    if (onDynamicLoad) {
      onDynamicLoad(field.name, undefined, undefined, true);
    }
  }, [field.name, onDynamicLoad]);

  // Auto-load on mount if requested
  React.useEffect(() => {
    if (field.dynamic && field.loadOnMount && onDynamicLoad && !loadOnMountRef.current) {
      loadOnMountRef.current = true;
      onDynamicLoad(field.name);
    }
  }, [field.dynamic, field.loadOnMount, field.name, onDynamicLoad]);

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

  // Show loading placeholder when loading with no options and no value
  // This matches the behavior of GenericSelectField for consistency
  const shouldShowLoadingState = isLoading && processedOptions.length === 0 && valueArray.length === 0;

  if (shouldShowLoadingState) {
    return <LoadingFieldState message={field.loadingPlaceholder || `Loading ${field.label || 'contacts'}...`} />;
  }

  return (
    <div className="flex items-start gap-2">
      <div className="flex-1 relative">
        {showTagPreview && valueArray.length > 1 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {valueArray.map((email) => (
              <Badge
                key={email}
                variant="secondary"
                className="flex items-center gap-1 pr-1"
              >
                <Mail className="w-3 h-3" />
                <span className="break-words">{email}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveTag(email);
                  }}
                  className="ml-1 hover:bg-muted rounded-full p-0.5"
                  aria-label={`Remove ${email}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <MultiCombobox
          value={valueArray}
          onChange={handleChange}
          options={processedOptions}
          placeholder={field.placeholder || `Select ${field.label || field.name}...`}
          searchPlaceholder="Search contacts..."
          emptyPlaceholder="No contacts found"
          disabled={false}
          creatable={true} // Always allow typing email addresses
          onOpenChange={handleDropdownOpen}
          onDrop={handleVariableDrop}
          className={cn(
            error && "border-red-500"
          )}
          showFullEmails={true} // Pass prop to show full emails
          hideSelectedBadges={showTagPreview}
          showPlaceholderWhenSelected={showTagPreview}
          loading={false} // Don't show loading in combobox since we use LoadingFieldState
        />
      </div>
      {showTagPreview && onDynamicLoad && (
        <button
          type="button"
          onClick={handleRefresh}
          className={cn(
            "mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground",
            isLoading && "opacity-50 cursor-not-allowed"
          )}
          aria-label="Refresh senders"
          disabled={isLoading}
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
        </button>
      )}
    </div>
  );
}
