"use client"

import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiCombobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

interface GenericSelectFieldProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  options: any[];
  isLoading?: boolean;
  onDynamicLoad?: (fieldName: string) => void;
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
}: GenericSelectFieldProps) {

  // Generic loading behavior
  const handleFieldOpen = (open: boolean) => {
    if (open && field.dynamic && onDynamicLoad && !isLoading && options.length === 0) {
      onDynamicLoad(field.name);
    }
  };

  // Generic option processing
  const processOptions = (opts: any[]) => {
    return opts.filter(opt => opt && (opt.value || opt.id));
  };

  const processedOptions = processOptions(options);

  // Show loading state for dynamic fields
  if (field.dynamic && isLoading && processedOptions.length === 0) {
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

  // Single selection
  return (
    <Select 
      value={value || ""} 
      onValueChange={onChange}
      onOpenChange={handleFieldOpen}
    >
      <SelectTrigger 
        className={cn(
          "h-10 bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200",
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
  );
}