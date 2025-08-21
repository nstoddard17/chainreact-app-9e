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
import { HelpCircle, Mail, Hash, Calendar, FileText, Link, User, MessageSquare, Bell, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { SimpleVariablePicker } from "./SimpleVariablePicker";
import { Combobox, MultiCombobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import EnhancedFileInput from "./EnhancedFileInput";
import { Card, CardContent } from "@/components/ui/card";
import { useDragDrop } from "@/hooks/use-drag-drop";
import { EmailAutocomplete } from "@/components/ui/email-autocomplete";
import { EmailRichTextEditor } from "./EmailRichTextEditor";
import { DiscordRichTextEditor } from "./DiscordRichTextEditor";
import { GmailLabelManager } from "./GmailLabelManager";
import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";

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
  onDynamicLoad?: (fieldName: string, dependsOn?: string, dependsOnValue?: any, forceRefresh?: boolean) => Promise<void>;
}

/**
 * Get icon for field type
 */
const getFieldIcon = (fieldName: string, fieldType: string) => {
  const name = fieldName.toLowerCase();
  const type = fieldType.toLowerCase();
  
  if (name.includes('email') || name.includes('from') || name.includes('to')) return <Mail className="h-4 w-4" />
  if (name.includes('subject') || name.includes('title')) return <Hash className="h-4 w-4" />
  if (name.includes('date') || name.includes('time')) return <Calendar className="h-4 w-4" />
  if (name.includes('message') || name.includes('body') || name.includes('content')) return <MessageSquare className="h-4 w-4" />
  if (name.includes('url') || name.includes('link')) return <Link className="h-4 w-4" />
  if (name.includes('user') || name.includes('name')) return <User className="h-4 w-4" />
  if (name.includes('trigger') || name.includes('event')) return <Bell className="h-4 w-4" />
  if (name.includes('action') || name.includes('task')) return <Zap className="h-4 w-4" />
  if (type === 'file' || name.includes('file') || name.includes('attachment')) return <FileText className="h-4 w-4" />
  
  return <Hash className="h-4 w-4" />
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



  // Lazy loading function for email autocomplete fields
  const handleEmailFieldFocus = () => {
    if (field.type === 'email-autocomplete' && field.dynamic && fieldOptions.length === 0 && onDynamicLoad && !loadingDynamic) {
      onDynamicLoad(field.name);
    }
  };

  // Drag and drop functionality
  const { handleDragOver, handleDrop } = useDragDrop({
    onVariableDrop: (variable: string) => {
      // Insert variable at cursor position or append to current value
      if (typeof value === 'string') {
        const newValue = value + variable
        onChange(newValue)
      } else {
        onChange(variable)
      }
    }
  })
  
  /**
   * Renders the label with optional tooltip
   */
  const renderLabel = () => (
    <div className="flex items-center gap-2 mb-3">
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-slate-100 rounded-md text-slate-600">
          {getFieldIcon(field.name, field.type)}
        </div>
        <Label 
          htmlFor={field.name} 
          className={cn(
            "text-sm font-medium text-slate-700",
            field.required && "after:content-['*'] after:ml-0.5 after:text-red-500"
          )}
        >
          {field.label || field.name}
        </Label>
      </div>
      
      {field.description && (
        <EnhancedTooltip
          description={field.description}
          disabled={!tooltipsEnabled}
        />
      )}
      
      {field.required && (
        <span className="text-xs text-red-500 font-medium">Required</span>
      )}
    </div>
  );

  // Handles direct input changes for text fields
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  // Handles select field changes
  const handleSelectChange = (newValue: string) => {
    // Ensure we're passing a properly formatted value
    onChange(newValue === "" ? null : newValue);
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

  // Get user session for email signature integration
  const { user } = useAuthStore()

  // Render the appropriate field based on type
  const renderFieldByType = () => {
    switch (field.type) {
      case "email-rich-text":
        // Enhanced rich text editor specifically for email composition
        return (
          <EmailRichTextEditor
            value={value || ""}
            onChange={onChange}
            placeholder={field.placeholder || "Compose your email..."}
            error={error}
            integrationProvider={field.provider || 'gmail'}
            userId={user?.id}
            className={cn(
              error && "border-red-500"
            )}
          />
        );

      case "discord-rich-text":
        // Enhanced rich text editor specifically for Discord message composition
        return (
          <DiscordRichTextEditor
            value={value || ""}
            onChange={onChange}
            placeholder={field.placeholder || "Type your Discord message..."}
            error={error}
            workflowData={workflowData}
            currentNodeId={currentNodeId}
            onVariableInsert={onChange}
            guildId={workflowData?.nodes?.find(n => n.id === currentNodeId)?.data?.config?.guildId}
            channelId={workflowData?.nodes?.find(n => n.id === currentNodeId)?.data?.config?.channelId}
            userId={user?.id}
            className={cn(
              error && "border-red-500"
            )}
          />
        );

      case "email-autocomplete":
        return (
          <EmailAutocomplete
            value={value || ""}
            onChange={onChange}
            placeholder={field.placeholder || `Enter ${field.label || field.name}...`}
            suggestions={fieldOptions}
            multiple={true}
            isLoading={loadingDynamic}
            disabled={loadingDynamic}
            onFocus={handleEmailFieldFocus}
            className={cn(
              "bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200",
              error && "border-red-500 focus:border-red-500 focus:ring-red-500 focus:ring-offset-2"
            )}
          />
        );

      case "text":
      case "email":
        return (
          <Input
            id={field.name}
            placeholder={field.placeholder || `Enter ${field.label || field.name}...`}
            value={value || ""}
            onChange={handleChange}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={cn(
              "h-10 bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200",
              error && "border-red-500 focus:border-red-500 focus:ring-red-500 focus:ring-offset-2"
            )}
            type={field.type === "email" ? "email" : "text"}
          />
        );

      case "number":
        return (
          <Input
            id={field.name}
            placeholder={field.placeholder || `Enter ${field.label || field.name}...`}
            value={value || ""}
            onChange={handleChange}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={cn(
              "h-10 bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200",
              error && "border-red-500 focus:border-red-500 focus:ring-red-500 focus:ring-offset-2"
            )}
            type="number"
            min={(field as any).min}
            max={(field as any).max}
            step={(field as any).step || 1}
          />
        );

      case "textarea":
        return (
          <Textarea
            id={field.name}
            placeholder={field.placeholder || `Enter ${field.label || field.name}...`}
            value={value || ""}
            onChange={handleChange}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={cn(
              "min-h-[80px] bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 resize-none",
              error && "border-red-500 focus:border-red-500 focus:ring-red-500 focus:ring-offset-2"
            )}
            rows={(field as any).rows || 3}
          />
        );

      case "select":
        // Handle both array options and object options
        const selectOptions = Array.isArray(field.options) 
          ? field.options.map((opt: any) => typeof opt === 'string' ? { value: opt, label: opt } : opt)
          : fieldOptions;
        
        // Force load options if they're empty (especially for Discord servers)
        if (field.dynamic && selectOptions.length === 0 && onDynamicLoad && field.name === 'guildId' && !loadingDynamic) {
          // Use setTimeout to avoid potential render issues
          setTimeout(() => {
            onDynamicLoad(field.name);
          }, 100);
        }
        
        // Force load options for Gmail labels
        if (field.dynamic && selectOptions.length === 0 && onDynamicLoad && field.name === 'labelIds' && !loadingDynamic) {
          setTimeout(() => {
            onDynamicLoad(field.name);
          }, 100);
        }
        
        // Show loading state or fallback message for dynamic fields
        if (field.dynamic && loadingDynamic && selectOptions.length === 0) {
          return (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
              Loading options...
            </div>
          );
        }
        
        // Special case for Discord servers when no options are available
        if (field.name === 'guildId' && selectOptions.length === 0 && !loadingDynamic) {
          return (
            <div className="text-sm text-slate-500">
              <p>No Discord servers found. You may need to:</p>
              <ul className="list-disc list-inside mt-1 ml-2">
                <li>Reconnect your Discord account</li>
                <li>Ensure the bot is added to your servers</li>
                <li>Check server permissions</li>
                <li>Check browser console for errors</li>
              </ul>
              <Button 
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  if (onDynamicLoad) {
                    // Single call is enough, we've added rate limiting in useDynamicOptions
                    onDynamicLoad(field.name);
                  }
                }}
              >
                Retry Loading Servers
              </Button>
            </div>
          );
        }
        
        // Show fallback message for Gmail fields when no options are available
        if (field.dynamic && selectOptions.length === 0 && !loadingDynamic) {
          if (field.name === 'from' || field.name === 'to') {
            return (
              <div className="text-sm text-slate-500">
                <p>No recent recipients found. You may need to:</p>
                <ul className="list-disc list-inside mt-1 ml-2">
                  <li>Reconnect your Gmail account</li>
                  <li>Send some emails to populate recent recipients</li>
                </ul>
              </div>
            );
          }
          if (field.name === 'labelIds') {
            return (
              <div className="text-sm text-slate-500">
                <p>No Gmail labels found. You may need to:</p>
                <ul className="list-disc list-inside mt-1 ml-2">
                  <li>Reconnect your Gmail account</li>
                  <li>Create some labels in Gmail</li>
                </ul>
              </div>
            );
          }
          // For Airtable tables field, always show dropdown even if no data
          if (field.name === 'tableName') {
            // Don't return early, let it render the empty dropdown below
          } else {
            // For other dynamic fields, show appropriate message
            return (
              <div className="text-sm text-slate-500">
                <p>No {field.label || field.name} found.</p>
              </div>
            );
          }
        }
        
        // Check if this is a multiple selection field
        if ((field as any).multiple) {
          return (
            <div className="space-y-3">
              <MultiCombobox
                value={Array.isArray(value) ? value : (value ? [value] : [])}
                onChange={(newValues) => {
                  onChange(newValues);
                }}
                options={selectOptions}
                placeholder={field.placeholder || "Select options..."}
                emptyText="No options available"
                searchPlaceholder="Search options..."
                isLoading={loadingDynamic}
                disabled={loadingDynamic}
                creatable={(field as any).creatable || false}
                onOpenChange={(open) => {
                  // Trigger dynamic loading when opened
                  if (open && field.dynamic && onDynamicLoad && !loadingDynamic && selectOptions.length === 0) {
                    onDynamicLoad(field.name);
                  }
                }}
                className={cn(
                  "bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200",
                  error && "border-red-500 focus:border-red-500 focus:ring-red-500 focus:ring-offset-2"
                )}
              />
              {(field as any).showManageButton && (
                <GmailLabelManager
                  existingLabels={selectOptions}
                  onLabelsChange={() => {
                    // Force refresh the labels when they change (bypass cache)
                    if (onDynamicLoad) {
                      // Force refresh to bypass cache and get fresh data
                      onDynamicLoad(field.name, undefined, undefined, true);
                    }
                  }}
                />
              )}
            </div>
          );
        }
        
        return (
          <Select 
            value={value || ""} 
            onValueChange={handleSelectChange}
            onOpenChange={(open) => {
              // Only try to load options when dropdown opens and we're not already loading
              if (open && field.dynamic && onDynamicLoad && !loadingDynamic) {
                // For Discord, only try to load if we have no options
                if (field.name === 'guildId' && fieldOptions.length === 0) {
                  onDynamicLoad(field.name);
                } else if (field.name !== 'guildId' && selectOptions.length === 0) {
                  onDynamicLoad(field.name);
                }
              }
            }}
          >
            <SelectTrigger 
              className={cn(
                "h-10 bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200",
                error && "border-red-500 focus:border-red-500 focus:ring-red-500 focus:ring-offset-2"
              )}
              onClick={() => {
                // Handle trigger click if needed
              }}
            >
              <SelectValue placeholder={field.placeholder || "Select an option..."} />
            </SelectTrigger>
            <SelectContent>
              {selectOptions.length > 0 ? (
                selectOptions
                  .filter((option: any) => option && (option.value || option.id)) // Ensure option is valid
                  .map((option: any, index: number) => {
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
                  {field.name === 'tableName' ? 'Select a base first to load tables' : 'No options available'}
                </div>
              )}
            </SelectContent>
          </Select>
        );

      case "boolean":
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={field.name}
              checked={value || false}
              onCheckedChange={handleCheckboxChange}
              className="data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
            />
            <Label htmlFor={field.name} className="text-sm text-slate-700">
              {field.label || field.name}
            </Label>
          </div>
        );

      case "date":
        return (
          <DatePicker
            value={value ? new Date(value) : undefined}
            onChange={handleDateChange}
            placeholder={field.placeholder || "Select date..."}
            className={cn(
              "h-10 bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200",
              error && "border-red-500 focus:border-red-500 focus:ring-red-500 focus:ring-offset-2"
            )}
          />
        );

      case "time":
        return (
          <Input
            id={field.name}
            placeholder={field.placeholder || "Select time..."}
            value={value || ""}
            onChange={handleChange}
            className={cn(
              "h-10 bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200",
              error && "border-red-500 focus:border-red-500 focus:ring-red-500 focus:ring-offset-2"
            )}
            type="time"
          />
        );

      case "file":
        return (
          <Input
            id={field.name}
            placeholder={field.placeholder || "Select file..."}
            value={value || ""}
            onChange={handleChange}
            className={cn(
              "h-10 bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200",
              error && "border-red-500 focus:border-red-500 focus:ring-red-500 focus:ring-offset-2"
            )}
            type="file"
          />
        );

      default:
        return (
          <Input
            id={field.name}
            placeholder={field.placeholder || `Enter ${field.label || field.name}...`}
            value={value || ""}
            onChange={handleChange}
            className={cn(
              "h-10 bg-white border-slate-200 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200",
              error && "border-red-500 focus:border-red-500 focus:ring-red-500 focus:ring-offset-2"
            )}
          />
        );
    }
  };

  return (
    <Card className="border-slate-200 bg-white hover:border-slate-300 transition-all duration-200">
      <CardContent className="p-4">
        {renderLabel()}
        {renderFieldByType()}
        {error && (
          <p className="text-sm text-red-500 mt-2 flex items-center gap-1">
            <HelpCircle className="h-3 w-3" />
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}