"use client"

import React, { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfigField, NodeField } from "@/lib/workflows/nodes";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { HelpCircle, Mail, Hash, Calendar, FileText, Link, User, MessageSquare, Bell, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { SimpleVariablePicker } from "./SimpleVariablePicker";
import { Combobox, MultiCombobox } from "@/components/ui/combobox";
import { TimePicker } from "@/components/ui/time-picker";
import EnhancedFileInput from "./EnhancedFileInput";
import { Card, CardContent } from "@/components/ui/card";
import { useDragDrop } from "@/hooks/use-drag-drop";
import { EmailAutocomplete } from "@/components/ui/email-autocomplete";
import { EmailRichTextEditor } from "./EmailRichTextEditor";
// Using optimized version to prevent freeze while maintaining features
// import { DiscordRichTextEditor } from "./DiscordRichTextEditor";
import { DiscordRichTextEditor } from "./DiscordRichTextEditorOptimized";
import { GmailLabelManager } from "./GmailLabelManager";
import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { Switch } from "@/components/ui/switch";

// Integration-specific field components
import { GmailEmailField } from "./gmail/GmailEmailField";
import { OutlookEmailField } from "./outlook/OutlookEmailField";
import { DiscordServerField } from "./discord/DiscordServerField";
import { DiscordChannelField } from "./discord/DiscordChannelField";
import { DiscordGenericField } from "./discord/DiscordGenericField";
import { AirtableImageField } from "./airtable/AirtableImageField";

// Shared field components
import { GenericSelectField } from "./shared/GenericSelectField";
import { GenericTextInput } from "./shared/GenericTextInput";

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
  nodeInfo?: any; // Node information for context-aware field behavior
  bubbleValues?: string[]; // Values that have bubbles created
  parentValues?: Record<string, any>; // All form values for dependency resolution
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
  nodeInfo,
  bubbleValues = [],
  parentValues = {},
}: FieldProps) {
  // Prepare field options for select/combobox fields
  const fieldOptions = field.options || 
    (field.dynamic && dynamicOptions?.[field.name]) || 
    [];



  // Determine which integration this field belongs to
  const getIntegrationProvider = (field: any) => {
    // Check if field has explicit provider
    if (field.provider) return field.provider;
    
    // Detect provider from dynamic data type (only if dynamic is a string)
    if (field.dynamic && typeof field.dynamic === 'string') {
      if (field.dynamic.includes('gmail')) return 'gmail';
      if (field.dynamic.includes('outlook')) return 'outlook';
      if (field.dynamic.includes('discord')) return 'discord';
      if (field.dynamic.includes('slack')) return 'slack';
    }
    
    // Detect from field name patterns
    if (field.name === 'guildId' || field.name === 'channelId') return 'discord';
    
    // For Airtable fields
    if (field.name?.startsWith('airtable_field_')) return 'airtable';
    
    return 'generic';
  };
  
  const integrationProvider = getIntegrationProvider(field);

  
  /**
   * Renders the label with optional tooltip
   */
  const renderLabel = () => (
    <div className="flex items-center gap-2 mb-3">
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-muted rounded-md text-muted-foreground">
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
        <HelpCircle className="h-4 w-4 text-muted-foreground" title={field.description} />
      )}
      
      {field.required && (
        <span className="text-xs text-red-500 font-medium">Required</span>
      )}
    </div>
  );

  // Handles checkbox changes
  const handleCheckboxChange = (checked: boolean) => {
    onChange(checked);
  };

  // Handles date field changes
  const handleDateChange = (date: Date | undefined) => {
    // Use YYYY-MM-DD format to match Airtable's date format
    onChange(date ? date.toISOString().split('T')[0] : null);
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
            guildId={parentValues?.guildId}
            channelId={parentValues?.channelId}
            userId={user?.id}
            className={cn(
              error && "border-red-500"
            )}
          />
        );

      case "email-autocomplete":
        // Route to integration-specific email field
        switch (integrationProvider) {
          case 'gmail':
            return (
              <GmailEmailField
                field={field}
                value={value}
                onChange={onChange}
                error={error}
                suggestions={fieldOptions}
                isLoading={loadingDynamic}
                onDynamicLoad={onDynamicLoad}
              />
            );
          case 'outlook':
            return (
              <OutlookEmailField
                field={field}
                value={value}
                onChange={onChange}
                error={error}
                suggestions={fieldOptions}
                isLoading={loadingDynamic}
                onDynamicLoad={onDynamicLoad}
              />
            );
          default:
            // Fallback to generic email autocomplete
            return (
              <EmailAutocomplete
                value={value || ""}
                onChange={onChange}
                placeholder={field.placeholder || `Enter ${field.label || field.name}...`}
                suggestions={fieldOptions}
                multiple={true}
                isLoading={loadingDynamic}
                disabled={loadingDynamic}
                className={cn(
                  error && "border-red-500"
                )}
              />
            );
        }

      case "text":
      case "email":
      case "number":
      case "textarea":
      case "time":
      case "file":
        // Special handling for Airtable image/attachment fields
        if (integrationProvider === 'airtable' && field.name?.startsWith('airtable_field_')) {
          const airtableFieldType = (field as any).airtableFieldType;
          
          // Handle attachment/image fields
          if (airtableFieldType === 'multipleAttachments' || 
              airtableFieldType === 'attachment' || 
              airtableFieldType === 'image') {
            return (
              <AirtableImageField
                field={field}
                value={value}
                onChange={onChange}
                error={error}
              />
            );
          }
          
          // Handle single/multiple select fields that weren't already caught
          if (airtableFieldType === 'singleSelect' || airtableFieldType === 'multipleSelects') {
            const selectOptions = Array.isArray(field.options) 
              ? field.options.map((opt: any) => typeof opt === 'string' ? { value: opt, label: opt } : opt)
              : fieldOptions;
              
            return (
              <GenericSelectField
                field={{
                  ...field,
                  type: airtableFieldType === 'multipleSelects' ? 'multi_select' : 'select'
                }}
                value={value}
                onChange={onChange}
                error={error}
                options={selectOptions}
                isLoading={loadingDynamic}
                onDynamicLoad={onDynamicLoad}
                nodeInfo={nodeInfo}
                selectedValues={bubbleValues}
                parentValues={parentValues}
              />
            );
          }
        }
        
        return (
          <GenericTextInput
            field={field}
            value={value}
            onChange={onChange}
            error={error}
            dynamicOptions={fieldOptions}
            onDynamicLoad={onDynamicLoad}
          />
        );

      case "select":
        // Route to integration-specific select field or generic one
        const selectOptions = Array.isArray(field.options) 
          ? field.options.map((opt: any) => typeof opt === 'string' ? { value: opt, label: opt } : opt)
          : fieldOptions;

        // Special handling for Discord guild/server fields
        if (field.name === 'guildId' && integrationProvider === 'discord') {
          return (
            <DiscordServerField
              field={field}
              value={value}
              onChange={onChange}
              error={error}
              options={selectOptions}
              isLoading={loadingDynamic}
              onDynamicLoad={onDynamicLoad}
            />
          );
        }

        // Special handling for Discord channel fields
        if (field.name === 'channelId' && integrationProvider === 'discord') {
          return (
            <DiscordChannelField
              field={field}
              value={value}
              onChange={onChange}
              error={error}
              options={selectOptions}
              isLoading={loadingDynamic}
              onDynamicLoad={onDynamicLoad}
            />
          );
        }
        
        // Special handling for all other Discord dynamic fields
        if (field.dynamic && typeof field.dynamic === 'string' && field.dynamic.startsWith('discord_') && integrationProvider === 'discord') {
          return (
            <DiscordGenericField
              field={field}
              value={value}
              onChange={onChange}
              error={error}
              options={selectOptions}
              isLoading={loadingDynamic}
              onDynamicLoad={onDynamicLoad}
              nodeInfo={nodeInfo}
              parentValues={parentValues}
            />
          );
        }

        // For Gmail labels, keep the existing logic with GmailLabelManager
        if (field.name === 'labelIds' && integrationProvider === 'gmail') {
          return (
            <div className="space-y-3">
              <GenericSelectField
                field={field}
                value={value}
                onChange={onChange}
                error={error}
                options={selectOptions}
                isLoading={loadingDynamic}
                onDynamicLoad={onDynamicLoad}
                nodeInfo={nodeInfo}
                selectedValues={bubbleValues}
                parentValues={parentValues}
              />
              {(field as any).showManageButton && (
                <GmailLabelManager
                  existingLabels={selectOptions}
                  onLabelsChange={() => {
                    if (onDynamicLoad) {
                      onDynamicLoad(field.name, undefined, undefined, true);
                    }
                  }}
                />
              )}
            </div>
          );
        }

        // Default to generic select field - this replaces all the complex logic below
        return (
          <GenericSelectField
            field={field}
            value={value}
            onChange={onChange}
            error={error}
            options={selectOptions}
            isLoading={loadingDynamic}
            onDynamicLoad={onDynamicLoad}
            nodeInfo={nodeInfo}
            selectedValues={bubbleValues}
            parentValues={parentValues}
          />
        );

      case "multi_select":
        // Multi-select fields (especially for Airtable)
        const multiSelectOptions = Array.isArray(field.options) 
          ? field.options.map((opt: any) => typeof opt === 'string' ? { value: opt, label: opt } : opt)
          : fieldOptions;
        
        return (
          <GenericSelectField
            field={{
              ...field,
              type: 'select', // GenericSelectField handles multi vs single based on value type
              multiple: true
            }}
            value={value}
            onChange={onChange}
            error={error}
            options={multiSelectOptions}
            isLoading={loadingDynamic}
            onDynamicLoad={onDynamicLoad}
            nodeInfo={nodeInfo}
            selectedValues={bubbleValues}
            parentValues={parentValues}
          />
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
        // Handle single date selection with native HTML date input
        const dateValue = useMemo(() => {
          if (!value) return '';
          if (value instanceof Date) {
            return value.toISOString().split('T')[0]; // Format as YYYY-MM-DD
          }
          if (typeof value === 'string' && value) {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              return date.toISOString().split('T')[0]; // Format as YYYY-MM-DD
            }
          }
          return '';
        }, [value]);
        
        const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
          const newValue = e.target.value;
          // Use YYYY-MM-DD format to match Airtable's date format
          onChange(newValue || null);
        };
        
        return (
          <Input
            type="date"
            value={dateValue}
            onChange={handleDateChange}
            placeholder={field.placeholder || "Select date..."}
            disabled={field.disabled}
            className={cn(
              "w-full",
              error && "border-red-500"
            )}
          />
        );

      case "daterange":
        // Handle date range with two native HTML date inputs
        const startDateValue = useMemo(() => {
          if (!value) return '';
          const startDate = value.startDate || value.from;
          if (startDate) {
            const date = new Date(startDate);
            if (!isNaN(date.getTime())) {
              return date.toISOString().split('T')[0];
            }
          }
          return '';
        }, [value]);

        const endDateValue = useMemo(() => {
          if (!value) return '';
          const endDate = value.endDate || value.to;
          if (endDate) {
            const date = new Date(endDate);
            if (!isNaN(date.getTime())) {
              return date.toISOString().split('T')[0];
            }
          }
          return '';
        }, [value]);

        const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
          const newStartDate = e.target.value;
          const currentEndDate = value?.endDate || value?.to;
          
          if (newStartDate) {
            // Use YYYY-MM-DD format to match Airtable's date format
            onChange({
              startDate: newStartDate,
              endDate: currentEndDate,
              from: newStartDate,
              to: currentEndDate
            });
          } else if (!currentEndDate) {
            onChange(null);
          } else {
            onChange({
              startDate: null,
              endDate: currentEndDate,
              from: null,
              to: currentEndDate
            });
          }
        };

        const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
          const newEndDate = e.target.value;
          const currentStartDate = value?.startDate || value?.from;
          
          if (newEndDate) {
            // Use YYYY-MM-DD format to match Airtable's date format
            onChange({
              startDate: currentStartDate,
              endDate: newEndDate,
              from: currentStartDate,
              to: newEndDate
            });
          } else if (!currentStartDate) {
            onChange(null);
          } else {
            onChange({
              startDate: currentStartDate,
              endDate: null,
              from: currentStartDate,
              to: null
            });
          }
        };

        return (
          <div className="flex gap-2 items-center">
            <Input
              type="date"
              value={startDateValue}
              onChange={handleStartDateChange}
              placeholder="Start date"
              disabled={field.disabled}
              className={cn(
                "flex-1",
                error && "border-red-500"
              )}
            />
            <span className="text-sm text-gray-500">to</span>
            <Input
              type="date"
              value={endDateValue}
              onChange={handleEndDateChange}
              placeholder="End date"
              disabled={field.disabled}
              className={cn(
                "flex-1",
                error && "border-red-500"
              )}
            />
          </div>
        );

      case "time":
        return (
          <GenericTextInput
            field={field}
            value={value}
            onChange={onChange}
            error={error}
          />
        );

      case "file":
        return (
          <GenericTextInput
            field={field}
            value={value}
            onChange={onChange}
            error={error}
          />
        );

      case "button-toggle":
        // Render a switch toggle button with labels
        const isChecked = value === field.options?.[1]?.value; // Second option is the "checked" state
        const handleToggle = (checked: boolean) => {
          const newValue = checked ? field.options?.[1]?.value : field.options?.[0]?.value;
          onChange(newValue);
        };
        
        return (
          <div className="flex items-center gap-3">
            <span className={cn(
              "text-sm font-medium transition-colors",
              !isChecked ? "text-slate-700" : "text-muted-foreground"
            )}>
              {field.options?.[0]?.label || "Off"}
            </span>
            <Switch
              checked={isChecked}
              onCheckedChange={handleToggle}
              className="data-[state=checked]:bg-blue-500"
            />
            <span className={cn(
              "text-sm font-medium transition-colors",
              isChecked ? "text-slate-700" : "text-muted-foreground"
            )}>
              {field.options?.[1]?.label || "On"}
            </span>
          </div>
        );

      case "google_sheets_data_preview":
        // This is a special field that should be rendered by ConfigurationForm
        // Return null as the preview UI is handled at the form level
        return null;

      default:
        return (
          <GenericTextInput
            field={field}
            value={value}
            onChange={onChange}
            error={error}
          />
        );
    }
  };

  return (
    <Card className="transition-all duration-200">
      <CardContent className="p-4">
        {field.type !== "button-toggle" && renderLabel()}
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