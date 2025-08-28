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
  onDynamicLoad?: (fieldName: string) => void;
  nodeInfo?: any;
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
}: GenericSelectFieldProps) {

  // Generic loading behavior
  const handleFieldOpen = (open: boolean) => {
    console.log('🔍 [GenericSelectField] handleFieldOpen called:', {
      open,
      fieldName: field.name,
      fieldDynamic: field.dynamic,
      hasOnDynamicLoad: !!onDynamicLoad,
      isLoading,
      optionsLength: options?.length || 0,
      options,
      willTriggerLoad: open && field.dynamic && onDynamicLoad && !isLoading && (options?.length === 0)
    });
    
    if (open && field.dynamic && onDynamicLoad && !isLoading && (options?.length === 0)) {
      console.log('🚀 [GenericSelectField] Triggering dynamic load for field:', field.name);
      onDynamicLoad(field.name);
    } else {
      console.log('🚫 [GenericSelectField] Dynamic load NOT triggered. Conditions:', {
        open,
        hasDynamic: !!field.dynamic,
        hasLoader: !!onDynamicLoad,
        notLoading: !isLoading,
        emptyOptions: (options?.length === 0)
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
        disabled={isLoading || field.disabled}
        creatable={isAirtableRecordField} // Allow custom input for Airtable fields
        onOpenChange={handleFieldOpen} // Add missing onOpenChange handler
      />
    );
  }

  // Fallback to regular Select with clear button
  return (
    <div className="relative">
      <Select 
        value={value ?? ""} 
        onValueChange={onChange}
        onOpenChange={handleFieldOpen}
      >
        <SelectTrigger 
          className={cn(
            "h-10 bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 pr-8",
            error && "border-red-500 focus:border-red-500 focus:ring-red-500 focus:ring-offset-2"
          )}
        >
          <SelectValue placeholder={field.placeholder || "Select an option..."} />
        </SelectTrigger>
        <SelectContent>
          {processedOptions.length > 0 ? (
            processedOptions.map((option: any, index: number) => {
              const optionValue = option.value || option.id;
              const optionLabel = option.label || option.name || option.value || option.id;
              
              return (
                <SelectItem 
                  key={`${optionValue}-${index}`} 
                  value={optionValue}
                >
                  {optionLabel}
                </SelectItem>
              );
            })
          ) : (
            <div className="p-2 text-sm text-slate-500 text-center">
              No options available
            </div>
          )}
        </SelectContent>
      </Select>
      {/* Clear button */}
      {value && (
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