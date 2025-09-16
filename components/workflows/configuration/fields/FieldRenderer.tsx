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
// Use the full featured Discord rich text editor
import { DiscordRichTextEditor } from "./DiscordRichTextEditor";
// import { DiscordRichTextEditor } from "./DiscordRichTextEditorOptimized";
import { GmailLabelManager } from "./GmailLabelManager";
import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { Switch } from "@/components/ui/switch";

// Integration-specific field components
import { GmailEmailField } from "./gmail/GmailEmailField";
import { GmailAttachmentField } from "./gmail/GmailAttachmentField";
import { OutlookEmailField } from "./outlook/OutlookEmailField";
import { DiscordServerField } from "./discord/DiscordServerField";
import { DiscordChannelField } from "./discord/DiscordChannelField";
import { DiscordGenericField } from "./discord/DiscordGenericField";
import { AirtableImageField } from "./airtable/AirtableImageField";
import { GoogleDriveFileField } from "./googledrive/GoogleDriveFileField";

// Shared field components
import { GenericSelectField } from "./shared/GenericSelectField";
import { GenericTextInput } from "./shared/GenericTextInput";

// Notion-specific field components
import { NotionBlockFields } from "./notion/NotionBlockFields";

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
  selectedValues?: string[]; // Selected values from bubbles for multi-select fields
  parentValues?: Record<string, any>; // All form values for dependency resolution
  aiFields?: Record<string, boolean>; // Track which fields are set to AI mode
  setAiFields?: (fields: Record<string, boolean>) => void; // Update AI fields
  isConnectedToAIAgent?: boolean; // Whether an AI agent exists in the workflow
  setFieldValue?: (field: string, value: any) => void; // Update other form fields
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
  selectedValues = [],
  parentValues = {},
  aiFields,
  setAiFields,
  isConnectedToAIAgent,
  setFieldValue,
}: FieldProps) {
  // Prepare field options for select/combobox fields
  const fieldOptions = field.options || 
    (field.dynamic && dynamicOptions?.[field.name]) || 
    [];

  // Auto-load options for combobox fields with dynamic data
  useEffect(() => {
    if (field.type === 'combobox' && field.dynamic && onDynamicLoad) {
      
      // Only load if we don't have options yet
      if (!fieldOptions.length && !loadingDynamic) {
        // Check if we need to load based on parent dependency
        if (field.dependsOn) {
          const parentValue = parentValues[field.dependsOn];
          if (parentValue) {
            onDynamicLoad(field.name, field.dependsOn, parentValue);
          } else {
          }
        } else {
          // No dependency, load directly
          onDynamicLoad(field.name);
        }
      }
    }
  }, [field.type, field.dynamic, field.name, field.dependsOn, parentValues[field.dependsOn], fieldOptions.length, loadingDynamic, onDynamicLoad]);

  // Determine which integration this field belongs to
  const getIntegrationProvider = (field: any) => {
    // Check if field has explicit provider
    if (field.provider) return field.provider;
    
    // Check nodeInfo for provider ID (most reliable for determining provider)
    if (nodeInfo?.providerId) {
      return nodeInfo.providerId;
    }
    
    // Detect provider from dynamic data type (only if dynamic is a string)
    if (field.dynamic && typeof field.dynamic === 'string') {
      if (field.dynamic.includes('gmail')) return 'gmail';
      if (field.dynamic.includes('outlook')) return 'outlook';
      if (field.dynamic.includes('discord')) return 'discord';
      if (field.dynamic.includes('slack')) return 'slack';
      if (field.dynamic.includes('google-drive')) return 'google-drive';
    }
    
    // Detect from field name patterns
    if (field.name === 'guildId' || field.name === 'channelId') return 'discord';
    
    // For Gmail attachment fields (uploadedFiles is the field name for Gmail attachments)
    if (field.name === 'uploadedFiles' && field.type === 'file' && nodeInfo?.providerId === 'gmail') return 'gmail';
    
    // For Airtable fields
    if (field.name?.startsWith('airtable_field_')) return 'airtable';
    
    // For Google Drive fields
    if (field.name === 'uploadedFiles' || field.name === 'fileUrl' || field.name === 'fileFromNode' || field.name === 'fileName') return 'google-drive';
    
    return 'generic';
  };
  
  const integrationProvider = getIntegrationProvider(field);

  
  /**
   * Renders the label with optional tooltip
   */
  const renderLabel = () => {
    
    return (
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
  };

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
      case "dynamic_fields":
        // Dynamic fields for Notion blocks
        if (integrationProvider === 'notion' && field.dynamic === 'notion_page_blocks') {
          return (
            <NotionBlockFields
              value={value}
              onChange={onChange}
              field={field}
              values={parentValues}
              loadOptions={onDynamicLoad}
              setFieldValue={setFieldValue}
            />
          );
        }
        return null;
        
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
            fieldName={field.name}
            aiFields={aiFields}
            setAiFields={setAiFields}
            isConnectedToAIAgent={isConnectedToAIAgent}
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
        
        // Special handling for Google Drive file preview
        if (integrationProvider === 'google-drive' && field.name === 'filePreview' && field.type === 'textarea') {
          // For now, use the standard textarea but with enhanced preview text
          // In the future, we could create a custom component that renders images
          return (
            <GenericTextInput
              field={{
                ...field,
                rows: 15,  // Make it larger for better preview
                disabled: true  // Keep it read-only
              }}
              value={value}
              onChange={onChange}
              error={error}
              dynamicOptions={fieldOptions}
              onDynamicLoad={onDynamicLoad}
              workflowNodes={workflowData?.nodes}
            />
          );
        }
        
        // Special handling for Gmail attachments (field name is uploadedFiles)
        if (integrationProvider === 'gmail' && field.name === 'uploadedFiles') {
          return (
            <GmailAttachmentField
              field={field}
              value={value}
              onChange={onChange}
              error={error}
              sourceType="file"
              workflowId={parentValues?.workflowId}
              nodeId={nodeInfo?.id || currentNodeId}
              workflowData={workflowData}
              currentNodeId={currentNodeId}
              parentValues={parentValues}
              setFieldValue={setFieldValue}
            />
          );
        }
        
        // Special handling for Google Drive file uploads
        if (integrationProvider === 'google-drive' && 
            (field.name === 'uploadedFiles' || field.name === 'fileUrl' || field.name === 'fileFromNode')) {
          const sourceType = parentValues?.sourceType || 'file';
          return (
            <GoogleDriveFileField
              field={field}
              value={value}
              onChange={onChange}
              error={error}
              sourceType={sourceType}
              workflowId={parentValues?.workflowId}
              nodeId={nodeInfo?.id || currentNodeId}
              workflowData={workflowData}
              currentNodeId={currentNodeId}
              parentValues={parentValues}
              setFieldValue={setFieldValue}
            />
          );
        } else {
        }
        
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
                selectedValues={selectedValues}
                parentValues={parentValues}
              />
            );
          }
        }
        
        return (
          <GenericTextInput
            field={{
              ...field,
              workflowId: parentValues?.workflowId || workflowData?.id || 'temp',
              nodeId: nodeInfo?.id || currentNodeId || `temp-${Date.now()}`
            }}
            value={value}
            onChange={onChange}
            error={error}
            dynamicOptions={fieldOptions}
            onDynamicLoad={onDynamicLoad}
            workflowNodes={workflowData?.nodes}
            aiFields={aiFields}
            setAiFields={setAiFields}
            isConnectedToAIAgent={isConnectedToAIAgent}
          />
        );

      case "select":
        // Route to integration-specific select field or generic one
        const selectOptions = Array.isArray(field.options) 
          ? field.options.map((opt: any) => typeof opt === 'string' ? { value: opt, label: opt } : opt)
          : fieldOptions;
        
        // Debug logging for board field
        if (field.name === 'boardId') {
          console.log('[FieldRenderer] Board field select options:', {
            fieldName: field.name,
            hasStaticOptions: !!field.options,
            staticOptionsCount: field.options?.length || 0,
            isDynamic: field.dynamic,
            fieldOptions: fieldOptions,
            fieldOptionsCount: fieldOptions.length,
            selectOptions: selectOptions,
            selectOptionsCount: selectOptions.length,
            dynamicOptions: dynamicOptions,
            dynamicOptionsBoardId: dynamicOptions?.boardId
          });
        }

        // Special handling for Discord fields - render them without nested conditionals
        if (integrationProvider === 'discord' && field.name === 'guildId') {
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
        
        if (integrationProvider === 'discord' && field.name === 'channelId') {
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
        
        if (integrationProvider === 'discord' && field.dynamic && typeof field.dynamic === 'string' && field.dynamic.startsWith('discord_')) {
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
                selectedValues={selectedValues}
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
            selectedValues={selectedValues}
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
            selectedValues={selectedValues}
            parentValues={parentValues}
          />
        );

      case "combobox":
        // Combobox fields with search capability and dynamic loading
        const comboboxOptions = Array.isArray(field.options) 
          ? field.options.map((opt: any) => typeof opt === 'string' ? { value: opt, label: opt } : opt)
          : fieldOptions;
        
        
        return (
          <div className="space-y-2">
            {!field.hideLabel && (
              <Label htmlFor={field.name} className="text-sm font-medium text-slate-700">
                {field.label || field.name}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </Label>
            )}
            {field.description && (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
            {/* Show loading state for dynamic fields */}
            {loadingDynamic && field.dynamic ? (
              <div className="flex items-center gap-2 h-10 px-3 py-2 text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-md">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                <span>Loading {field.label?.toLowerCase() || 'options'}...</span>
              </div>
            ) : (
              <Combobox
                value={value || ""}
                onChange={onChange}
                options={comboboxOptions}
                placeholder={field.placeholder || `Select ${field.label || field.name}...`}
                searchPlaceholder={`Search ${field.label || field.name}...`}
                emptyPlaceholder={loadingDynamic ? "Loading options..." : "No options found"}
                disabled={loadingDynamic}
                creatable={field.creatable || false}
              />
            )}
            {error && (
              <p className="text-xs text-red-500 mt-1">{error}</p>
            )}
          </div>
        );

      case "boolean":
        return (
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <Label htmlFor={field.name} className="text-sm font-medium text-slate-700">
                {field.label || field.name}
              </Label>
              {field.description && (
                <p className="text-xs text-muted-foreground mt-1">{field.description}</p>
              )}
            </div>
            <Switch
              id={field.name}
              checked={value || false}
              onCheckedChange={onChange}
              className="ml-4"
            />
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
            field={{
              ...field,
              workflowId: workflowData?.id,
              nodeId: currentNodeId
            }}
            value={value}
            onChange={onChange}
            error={error}
            workflowNodes={workflowData?.nodes}
          />
        );

      case "datetime-local":
        // Handle datetime-local input for date and time selection
        const datetimeValue = useMemo(() => {
          if (!value) return '';
          if (value instanceof Date) {
            // Format as YYYY-MM-DDTHH:mm for datetime-local input
            const year = value.getFullYear();
            const month = String(value.getMonth() + 1).padStart(2, '0');
            const day = String(value.getDate()).padStart(2, '0');
            const hours = String(value.getHours()).padStart(2, '0');
            const minutes = String(value.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day}T${hours}:${minutes}`;
          }
          if (typeof value === 'string' && value) {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              const hours = String(date.getHours()).padStart(2, '0');
              const minutes = String(date.getMinutes()).padStart(2, '0');
              return `${year}-${month}-${day}T${hours}:${minutes}`;
            }
          }
          return '';
        }, [value]);

        return (
          <div className="space-y-2">
            <Input
              type="datetime-local"
              value={datetimeValue}
              onChange={(e) => {
                const newValue = e.target.value;
                if (newValue) {
                  // Convert to ISO string for storage
                  const date = new Date(newValue);
                  onChange(date.toISOString());
                } else {
                  onChange('');
                }
              }}
              min={field.min}
              max={field.max}
              className={cn(
                "w-full",
                error && "border-red-500"
              )}
              placeholder={field.placeholder}
            />
            {field.description && (
              <p className="text-sm text-muted-foreground">{field.description}</p>
            )}
          </div>
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

      case "tag-input":
        const { TagInput } = require("@/components/ui/tag-input");
        return (
          <TagInput
            value={value || []}
            onChange={onChange}
            placeholder={field.placeholder}
            disabled={field.disabled}
            error={error}
          />
        );

      case "multi-select":
        // Check if this is a Discord messages field
        if (field.dynamic === "discord_messages") {
          const { DiscordMultiMessageSelector } = require("./discord/DiscordMultiMessageSelector");
          return (
            <DiscordMultiMessageSelector
              field={field}
              value={value || []}
              onChange={onChange}
              options={fieldOptions}
              placeholder={field.placeholder}
              error={error}
              isLoading={loadingDynamic}
            />
          );
        }
        
        // Default multi-select using MultiCombobox
        const multiSelectOpts = Array.isArray(field.options)
          ? field.options.map(opt => ({
              value: String(opt.value),
              label: opt.label || String(opt.value)
            }))
          : fieldOptions.map(opt => ({
              value: opt.value || opt.id || "",
              label: opt.label || opt.name || opt.value || opt.id || ""
            }));
            
        return (
          <MultiCombobox
            options={multiSelectOpts}
            value={value || []}
            onChange={onChange}
            placeholder={field.placeholder}
            disabled={field.disabled}
          />
        );

      default:
        return (
          <GenericTextInput
            field={{
              ...field,
              workflowId: workflowData?.id,
              nodeId: currentNodeId
            }}
            value={value}
            onChange={onChange}
            error={error}
            workflowNodes={workflowData?.nodes}
            aiFields={aiFields}
            setAiFields={setAiFields}
            isConnectedToAIAgent={isConnectedToAIAgent}
          />
        );
    }
  };

  // Render the field content
  const fieldContent = renderFieldByType();
  
  return (
    <Card className="transition-all duration-200">
      <CardContent className="p-4">
        {field.type !== "button-toggle" && renderLabel()}
        {fieldContent}
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