"use client"

import React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfigField, NodeField } from "@/lib/workflows/availableNodes";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { EnhancedTooltip } from "@/components/ui/enhanced-tooltip";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SimpleVariablePicker } from "./SimpleVariablePicker";
import { Combobox, MultiCombobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import EnhancedFileInput from "./EnhancedFileInput";

/**
 * Props for the Field component
 */
interface FieldProps {
  field: ConfigField | NodeField;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  tooltipsEnabled?: boolean;
  workflowData?: { nodes: any[]; edges: any[] };
  currentNodeId?: string;
  dynamicOptions?: Record<string, { value: string; label: string; fields?: any[] }[]>;
  loadingDynamic?: boolean;
  onDynamicLoad?: (fieldName: string, dependsOn?: string, dependsOnValue?: any) => Promise<void>;
}

/**
 * Field renderer component
 */
export function FieldRenderer({
  field,
  value,
  onChange,
  error,
  tooltipsEnabled = true,
  workflowData,
  currentNodeId,
  dynamicOptions,
  loadingDynamic,
  onDynamicLoad,
}: FieldProps) {
  // Prepare field options for select/combobox fields
  const fieldOptions = field.options || 
    (field.dynamic && dynamicOptions?.[field.name]) || 
    [];
  
  /**
   * Renders the label with optional tooltip
   */
  const renderLabel = () => (
    <div className="flex items-center mb-2">
      <Label htmlFor={field.name} className={cn(field.required && "after:content-['*'] after:ml-0.5 after:text-red-500")}>
        {field.label || field.name}
      </Label>
      
      {field.description && (
        <EnhancedTooltip
          description={field.description}
          disabled={!tooltipsEnabled}
        />
      )}
    </div>
  );

  // Handles direct input changes for text fields
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  // Handles select field changes
  const handleSelectChange = (newValue: string) => {
    onChange(newValue);
  };

  // Handles checkbox changes
  const handleCheckboxChange = (checked: boolean) => {
    onChange(checked);
  };

  // Handles date field changes
  const handleDateChange = (date: Date | undefined) => {
    onChange(date ? date.toISOString() : null);
  };

  // Helper to set up variable selection
  const handleVariableSelect = (variable: string) => {
    onChange(variable);
  };

  // Render the appropriate field based on type
  const renderFieldByType = () => {
    switch (field.type) {
      case "text":
      case "email":
      case "url":
      case "phone":
        return (
          <div className="relative">
            <Input
              id={field.name}
              placeholder={field.placeholder}
              value={value || ""}
              onChange={handleChange}
              className={cn(error && "border-red-500")}
              type={field.type === "email" ? "email" : field.type === "url" ? "url" : "text"}
            />
            
            {workflowData && (
              <div className="absolute right-0 top-0">
                <SimpleVariablePicker
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  onVariableSelect={handleVariableSelect}
                  fieldType={field.type}
                />
              </div>
            )}
          </div>
        );

      case "number":
        return (
          <div className="relative">
            <Input
              id={field.name}
              placeholder={field.placeholder}
              value={value || ""}
              onChange={handleChange}
              className={cn(error && "border-red-500")}
              type="number"
              min={field.min}
              max={field.max}
              step={field.step || 1}
            />
            
            {workflowData && (
              <div className="absolute right-0 top-0">
                <SimpleVariablePicker
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  onVariableSelect={handleVariableSelect}
                  fieldType="number"
                />
              </div>
            )}
          </div>
        );

      case "textarea":
        return (
          <div className="relative">
            <Textarea
              id={field.name}
              placeholder={field.placeholder}
              value={value || ""}
              onChange={handleChange}
              className={cn(error && "border-red-500")}
              rows={field.rows || 3}
            />
            
            {workflowData && (
              <div className="absolute right-2 top-2">
                <SimpleVariablePicker
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  onVariableSelect={handleVariableSelect}
                  fieldType="text"
                />
              </div>
            )}
          </div>
        );

      case "select":
        if (field.dynamic) {
          return (
            <>
              <Combobox
                options={fieldOptions.map((opt: any) => ({
                  label: opt.label || opt.name || opt.value,
                  value: opt.value || opt.id,
                }))}
                value={value || ""}
                onChange={handleSelectChange}
                placeholder={field.placeholder || "Select an option..."}
                className={cn(error && "border-red-500")}
                loading={field.dynamic && loadingDynamic}
                onOpenChange={() => {
                  if (field.dynamic && onDynamicLoad && field.dependsOn) {
                    // Load options when dropdown opens if it's a dynamic field
                    onDynamicLoad(field.name, field.dependsOn, value);
                  }
                }}
              />
              
              {field.dynamic && loadingDynamic && (
                <div className="text-xs text-muted-foreground mt-1">
                  Loading options...
                </div>
              )}
            </>
          );
        } else {
          return (
            <Select value={value || ""} onValueChange={handleSelectChange}>
              <SelectTrigger className={cn(error && "border-red-500")}>
                <SelectValue placeholder={field.placeholder || "Select an option..."} />
              </SelectTrigger>
              <SelectContent>
                {fieldOptions.map((option: any) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label || option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }

      case "multi-select":
        return (
          <MultiCombobox
            options={fieldOptions.map((opt: any) => ({
              label: opt.label || opt.name || opt.value,
              value: opt.value || opt.id,
            }))}
            values={value || []}
            onChange={(newValues) => onChange(newValues)}
            placeholder={field.placeholder || "Select options..."}
            className={cn(error && "border-red-500")}
            loading={field.dynamic && loadingDynamic}
            onOpenChange={() => {
              if (field.dynamic && onDynamicLoad && field.dependsOn) {
                onDynamicLoad(field.name, field.dependsOn, value);
              }
            }}
          />
        );

      case "checkbox":
      case "boolean":
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={field.name}
              checked={Boolean(value)}
              onCheckedChange={handleCheckboxChange}
            />
            <label
              htmlFor={field.name}
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {field.checkboxLabel || field.label || field.name}
            </label>
          </div>
        );

      case "date":
        return (
          <DatePicker
            date={value ? new Date(value) : undefined}
            onChange={handleDateChange}
            placeholder={field.placeholder || "Select date..."}
            className={cn(error && "border-red-500")}
          />
        );

      case "time":
        return (
          <TimePicker
            value={value || ""}
            onChange={(time) => onChange(time)}
            className={cn(error && "border-red-500")}
          />
        );

      case "file":
        return (
          <EnhancedFileInput
            fieldDef={field}
            fieldValue={value}
            onValueChange={onChange}
            workflowData={workflowData}
            currentNodeId={currentNodeId}
          />
        );

      default:
        return (
          <Input
            id={field.name}
            placeholder={field.placeholder || "Enter value..."}
            value={value || ""}
            onChange={handleChange}
            className={cn(error && "border-red-500")}
          />
        );
    }
  };

  return (
    <div className="mb-4">
      {renderLabel()}
      {renderFieldByType()}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}