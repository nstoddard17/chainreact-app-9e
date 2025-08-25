"use client"

import React, { useMemo } from "react";
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

// Integration-specific field components
import { GmailEmailField } from "./gmail/GmailEmailField";
import { OutlookEmailField } from "./outlook/OutlookEmailField";
import { DiscordServerField } from "./discord/DiscordServerField";
import { DiscordChannelField } from "./discord/DiscordChannelField";
import { DiscordGenericField } from "./discord/DiscordGenericField";

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
}: FieldProps) {
  // Prepare field options for select/combobox fields
  const fieldOptions = field.options || 
    (field.dynamic && dynamicOptions?.[field.name]) || 
    [];



  // Determine which integration this field belongs to
  const getIntegrationProvider = (field: any) => {
    // Check if field has explicit provider
    if (field.provider) return field.provider;
    
    // Detect provider from dynamic data type
    if (field.dynamic) {
      if (field.dynamic.includes('gmail')) return 'gmail';
      if (field.dynamic.includes('outlook')) return 'outlook';
      if (field.dynamic.includes('discord')) return 'discord';
      if (field.dynamic.includes('slack')) return 'slack';
    }
    
    // Detect from field name patterns
    if (field.name === 'guildId' || field.name === 'channelId') return 'discord';
    
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

  // Handles checkbox changes
  const handleCheckboxChange = (checked: boolean) => {
    onChange(checked);
  };

  // Handles date field changes
  const handleDateChange = (date: Date | undefined) => {
    onChange(date ? date.toISOString() : null);
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
        if (field.dynamic && field.dynamic.startsWith('discord_') && integrationProvider === 'discord') {
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
        // Safely parse date value
        const dateValue = useMemo(() => {
          if (!value) return undefined;
          const date = new Date(value);
          return isNaN(date.getTime()) ? undefined : date;
        }, [value]);
        
        return (
          <DatePicker
            value={dateValue}
            onChange={handleDateChange}
            placeholder={field.placeholder || "Select date..."}
            className={cn(
              "w-auto max-w-[200px]",
              error && "border-red-500"
            )}
          />
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