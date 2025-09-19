"use client"

import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox, MultiCombobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface GenericSelectFieldProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  options: any[];
  isLoading?: boolean;
  onDynamicLoad?: (fieldName: string, dependsOn?: string, dependsOnValue?: any, forceRefresh?: boolean) => Promise<void>;
  nodeInfo?: any;
  selectedValues?: string[]; // Values that already have bubbles
  parentValues?: Record<string, any>; // Parent form values for dependency resolution
}

/**
 * Get appropriate empty message based on field name
 */
function getEmptyMessage(fieldName: string, fieldLabel?: string): string {
  const label = fieldLabel?.toLowerCase() || fieldName.toLowerCase();

  // Specific messages for common field types
  if (fieldName === 'parentDatabase' || label.includes('database')) {
    return "No databases found. Note: Only full database pages are shown, not inline databases within pages. Please create a full-page database or share existing databases with your integration.";
  }
  if (fieldName === 'parentPage' || label.includes('page')) {
    return "No pages found. Please create or share pages with your Notion integration.";
  }
  if (label.includes('workspace')) {
    return "No workspaces found. Please connect your Notion account.";
  }
  if (label.includes('user')) {
    return "No users found.";
  }
  if (label.includes('channel')) {
    return "No channels found.";
  }
  if (label.includes('server') || label.includes('guild')) {
    return "No servers found.";
  }

  // Default message
  return "No options available";
}

/**
 * Generic select field for non-integration-specific dropdowns
 * Handles basic select and multi-select functionality
 */
export function GenericSelectField({
  field,
  value,
  onChange,
  error,
  options,
  isLoading,
  onDynamicLoad,
  nodeInfo,
  selectedValues = [],
  parentValues = {},
}: GenericSelectFieldProps) {
  // Debug logging for board field
  if (field.name === 'boardId') {
    console.log('[GenericSelectField] Board field props:', {
      fieldName: field.name,
      options: options,
      optionsLength: options?.length || 0,
      isLoading,
      firstOption: options?.[0]
    });
  }
  
  // For Airtable create record fields, we need to get the bubble values from the form
  // Since we can't pass them through easily, we'll get them from window object
  const isAirtableCreateRecord = nodeInfo?.type === 'airtable_action_create_record' && 
                                 field.name?.startsWith('airtable_field_');
  
  // Get bubble values from window object for Airtable create fields
  let effectiveSelectedValues = selectedValues;
  if (isAirtableCreateRecord && typeof window !== 'undefined') {
    const bubbleValues = (window as any).__airtableBubbleValues?.[field.name];
    if (bubbleValues) {
      effectiveSelectedValues = bubbleValues.map((b: any) => b.value);
    }
  }

  // Track if we've attempted to load for this field to prevent repeated attempts
  const [hasAttemptedLoad, setHasAttemptedLoad] = React.useState(false);
  const [lastLoadTimestamp, setLastLoadTimestamp] = React.useState(0);
  
  // Reset load attempt tracking when dependencies change
  React.useEffect(() => {
    if (field.dependsOn && parentValues[field.dependsOn]) {
      setHasAttemptedLoad(false);
      setLastLoadTimestamp(0);
    }
  }, [field.dependsOn, parentValues[field.dependsOn]]);
  
  // Generic loading behavior
  const handleFieldOpen = (open: boolean) => {
    console.log('🔍 [GenericSelectField] handleFieldOpen called:', {
      open,
      fieldName: field.name,
      fieldDynamic: field.dynamic,
      fieldDependsOn: field.dependsOn,
      hasOnDynamicLoad: !!onDynamicLoad,
      isLoading,
      optionsLength: options?.length || 0,
      hasAttemptedLoad,
      timeSinceLastLoad: Date.now() - lastLoadTimestamp,
      willTriggerLoad: open && field.dynamic && onDynamicLoad && !isLoading
    });

    // For certain fields like parentDatabase, always refresh when opened
    // This ensures users see the most up-to-date list
    const shouldAlwaysRefresh = ['parentDatabase', 'parentPage', 'database', 'page'].includes(field.name);
    const hasValue = value !== undefined && value !== null && value !== '';

    // Allow refresh for fields that should always update
    const shouldAllowRefresh = shouldAlwaysRefresh && hasValue && options?.length > 0;

    // Load options when:
    // 1. Opening and field is dynamic
    // 2. Has a loader function
    // 3. Not currently loading
    // 4. Either: haven't attempted load yet OR it's a field that should refresh
    const shouldLoad = open &&
      field.dynamic &&
      onDynamicLoad &&
      !isLoading &&
      (!hasAttemptedLoad || shouldAllowRefresh);

    if (shouldLoad) {
      const isRefresh = hasAttemptedLoad && shouldAllowRefresh;
      console.log('🚀 [GenericSelectField] ' + (isRefresh ? 'Refreshing' : 'Triggering') + ' dynamic load for field:', field.name, 'with dependencies:', {
        dependsOn: field.dependsOn,
        dependsOnValue: field.dependsOn ? parentValues[field.dependsOn] : undefined,
        isRefresh
      });

      setHasAttemptedLoad(true);
      setLastLoadTimestamp(Date.now());

      // If field has dependencies, pass them with forceRefresh for refresh fields
      if (field.dependsOn && parentValues[field.dependsOn]) {
        onDynamicLoad(field.name, field.dependsOn, parentValues[field.dependsOn], shouldAllowRefresh);
      } else {
        // No dependencies, just load the field
        onDynamicLoad(field.name, undefined, undefined, shouldAllowRefresh);
      }
    } else {
      console.log('🚫 [GenericSelectField] Dynamic load NOT triggered. Conditions:', {
        open,
        hasDynamic: !!field.dynamic,
        hasLoader: !!onDynamicLoad,
        notLoading: !isLoading,
        emptyOptions: (options?.length === 0),
        hasAttemptedLoad,
        timeSinceLastLoad: Date.now() - lastLoadTimestamp,
        shouldAllowRefresh
      });
    }
  };

  // Generic option processing
  const processOptions = (opts: any[]) => {
    return opts.filter(opt => opt && (opt.value || opt.id));
  };

  const processedOptions = processOptions(options);

  // Show loading state for dynamic fields
  // For Airtable filterValue field, always show loading when isLoading is true
  // For other fields, only show loading when there are no options
  const shouldShowLoading = field.dynamic && isLoading && (
    field.name === 'filterValue' || processedOptions.length === 0
  );
  
  if (shouldShowLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
        Loading options...
      </div>
    );
  }

  // Handle multiple selection fields
  if ((field as any).multiple) {
    // Check if this is an Airtable field with bubbles (linked records or multi-select fields)
    const isAirtableLinkedField = nodeInfo?.providerId === 'airtable' &&
      field.name?.startsWith('airtable_field_') &&
      (field.airtableFieldType === 'multipleRecordLinks' ||
       field.airtableFieldType === 'multipleSelects' ||
       field.airtableFieldType === 'singleRecordLink' ||
       field.multiple); // Any Airtable field marked as multiple uses bubbles
    
    return (
      <MultiCombobox
        value={Array.isArray(value) ? value : (value ? [value] : [])}
        onChange={onChange}
        options={processedOptions}
        placeholder={field.placeholder || "Select options..."}
        emptyText="No options available"
        searchPlaceholder="Search options..."
        isLoading={isLoading}
        disabled={isLoading}
        creatable={(field as any).creatable || false}
        onOpenChange={handleFieldOpen}
        selectedValues={effectiveSelectedValues} // Pass selected values for checkmarks
        hideSelectedBadges={isAirtableLinkedField} // Hide badges for Airtable fields with bubbles
        className={cn(
          "bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200",
          error && "border-red-500 focus:border-red-500 focus:ring-red-500 focus:ring-offset-2"
        )}
      />
    );
  }

  // Check if this is an Airtable create/update record field that should support custom input
  const isAirtableRecordField = nodeInfo?.providerId === 'airtable' && 
    (nodeInfo?.type === 'airtable_action_create_record' || 
     nodeInfo?.type === 'airtable_action_update_record') &&
    field.name?.startsWith('airtable_field_');

  // Use Combobox for Airtable fields or fields that need clear functionality
  if (isAirtableRecordField || field.clearable !== false) {
    return (
      <Combobox
        value={value ?? ""}
        onChange={onChange}
        options={processedOptions}
        placeholder={field.placeholder || "Select an option..."}
        searchPlaceholder="Search options..."
        emptyPlaceholder="No options found"
        disabled={isLoading}
        creatable={isAirtableRecordField} // Allow custom input for Airtable fields
        onOpenChange={handleFieldOpen} // Add missing onOpenChange handler
        selectedValues={effectiveSelectedValues} // Pass selected values for checkmarks
      />
    );
  }

  // Find the selected option to display its label
  const selectedOption = processedOptions.find((opt: any) => {
    const optValue = opt.value || opt.id;
    return String(optValue) === String(value);
  });
  
  // Always prefer label over value for display
  const displayValue = selectedOption ? 
    (selectedOption.label || selectedOption.name || selectedOption.value || selectedOption.id) : 
    (value || '');

  // Fallback to regular Select with clear button
  return (
    <div className="relative">
      <Select 
        value={value ?? ""} 
        onValueChange={onChange}
        onOpenChange={handleFieldOpen}
        disabled={isLoading}
      >
        <SelectTrigger 
          className={cn(
            "h-10 bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 pr-8",
            error && "border-red-500 focus:border-red-500 focus:ring-red-500 focus:ring-offset-2"
          )}
          disabled={isLoading}
        >
          <SelectValue placeholder={field.placeholder || "Select an option..."}>
            {displayValue || (field.placeholder || "Select an option...")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {processedOptions.length > 0 ? (
            processedOptions.map((option: any, index: number) => {
              const optionValue = option.value || option.id;
              const optionLabel = option.label || option.name || option.value || option.id;
              if (!optionValue) return null;
              
              return (
                <SelectItem 
                  key={String(optionValue)} 
                  value={String(optionValue)}
                >
                  {optionLabel}
                </SelectItem>
              );
            })
          ) : (
            <div className="p-2 text-sm text-slate-500 text-center">
              {isLoading ? "Loading..." : getEmptyMessage(field.name, field.label)}
            </div>
          )}
        </SelectContent>
      </Select>
      {/* Clear button - only show if clearable is not false */}
      {value && field.clearable !== false && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange("");
          }}
          className="group absolute right-9 top-1/2 -translate-y-1/2 p-1.5 hover:bg-slate-100 rounded-md transition-colors"
          aria-label="Clear selection"
        >
          <X className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600 transition-colors" />
        </button>
      )}
    </div>
  );
}
