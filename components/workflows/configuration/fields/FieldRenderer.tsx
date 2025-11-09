"use client"

import React, { useMemo, useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfigField, NodeField } from "@/lib/workflows/nodes";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { HelpCircle, Mail, Hash, Calendar, FileText, Link, User, MessageSquare, Bell, Zap, Bot, X, RefreshCw, Sparkles, Loader2 } from "lucide-react";
import { FileUpload } from "@/components/ui/file-upload";
import { cn } from "@/lib/utils";
import { SimpleVariablePicker } from "./SimpleVariablePicker";
import { MultiCombobox } from "@/components/ui/combobox";
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
import { GmailLabelSelector } from "./GmailLabelSelector";
import { SlashCommandManager } from "./SlashCommandManager";
import { useAuthStore } from "@/stores/authStore";
import { useIntegrationStore } from "@/stores/integrationStore";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

// Phase 1: Enhanced Configuration Components
import { FieldLabel } from "./FieldLabel";
import { generatePlaceholder, generateHelpText, generateExamples, getKeyboardHint } from "@/lib/workflows/configuration/placeholderHelpers";
import { EmptyStateCard } from "../EmptyStateCard";

// Integration-specific field components
import { TimePicker15Min } from './TimePicker15Min';
import { TimezonePicker } from './TimezonePicker';
import { RecurrencePicker } from './RecurrencePicker';
import { GoogleMeetButton } from './GoogleMeetButton';
import { GooglePlacesAutocomplete } from './GooglePlacesAutocomplete';
import { NotificationBuilder } from './NotificationBuilder';
import { ColorSelect } from './ColorSelect';
import { VisibilitySelect } from './VisibilitySelect';
import { ContactPicker } from './ContactPicker';
import { GmailEmailField } from "./gmail/GmailEmailField";
import { GmailAttachmentField } from "./gmail/GmailAttachmentField";
import { OutlookEmailField } from "./outlook/OutlookEmailField";
import { DiscordServerField } from "./discord/DiscordServerField";
import { DiscordChannelField } from "./discord/DiscordChannelField";
import { DiscordGenericField } from "./discord/DiscordGenericField";
import { AirtableImageField } from "./airtable/AirtableImageField";
import { MultipleRecordsField } from "./airtable/MultipleRecordsField";
import { FieldMapperField } from "./airtable/FieldMapperField";
import { GoogleDriveFileField } from "./googledrive/GoogleDriveFileField";

// Shared field components
import { GenericSelectField } from "./shared/GenericSelectField";
import { GenericTextInput } from "./shared/GenericTextInput";
import { ConnectButton } from "./shared/ConnectButton";
import { VariableSelectionDropdown } from "./shared/VariableSelectionDropdown";
import { LoadingFieldState } from "./shared/LoadingFieldState";

// Notion-specific field components
import { NotionBlockFields } from "./notion/NotionBlockFields";
import { NotionDatabaseRowsField } from "./notion/NotionDatabaseRowsField";
import { NotionDatabasePropertyBuilder } from "./NotionDatabasePropertyBuilder";
import { SlackEmojiPicker } from "./SlackEmojiPicker";
import { AIRouterOutputPathsField } from "./ai/AIRouterOutputPathsField";
import { UnifiedDocumentPicker } from "./UnifiedDocumentPicker";
import { ChainReactMemoryPicker } from "./ChainReactMemoryPicker";

import { logger } from '@/lib/utils/logger'

// Tags Input Component
interface TagsInputProps {
  value: any;
  onChange: (value: any) => void;
  field: any;
  error?: string;
}

function TagsInput({ value, onChange, field, error }: TagsInputProps) {
  const tagsValue = Array.isArray(value) ? value : (value ? [value] : []);
  const [tagInput, setTagInput] = useState('');

  return (
    <div className="space-y-2">
      {/* Display existing tags as pills */}
      {tagsValue.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {tagsValue.map((tag: string, idx: number) => (
            <div
              key={idx}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-md text-sm"
            >
              <span>{tag}</span>
              <button
                type="button"
                onClick={() => {
                  const newTags = tagsValue.filter((_: any, i: number) => i !== idx);
                  onChange(newTags);
                }}
                className="hover:bg-blue-200 dark:hover:bg-blue-800/50 rounded p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input field to add new tags */}
      <Input
        type="text"
        value={tagInput}
        onChange={(e) => setTagInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const trimmedTag = tagInput.trim();
            if (trimmedTag && !tagsValue.includes(trimmedTag)) {
              onChange([...tagsValue, trimmedTag]);
              setTagInput('');
            }
          }
        }}
        placeholder={field.placeholder || "Type and press Enter to add..."}
        className={cn(error && "border-red-500")}
      />

      {error && <p className="text-sm text-red-500 mt-1">{error}</p>}

      {field.description && (
        <p className="text-xs text-gray-500 mt-1">{field.description}</p>
      )}
    </div>
  );
}

// Helper function to get contextual empty message for combobox
function getComboboxEmptyMessage(field: any): string {
  const fieldName = field.name?.toLowerCase() || '';
  const label = field.label?.toLowerCase() || '';

  // Discord slash commands
  if (fieldName === 'command' && field.dynamic === 'discord_commands') {
    return "No slash commands found. Type a command name to create one, or add commands via Discord Developer Portal.";
  }

  if (fieldName === 'parentpage' || label.includes('parent page')) {
    return "No pages found. Please create or share pages with your Notion integration.";
  }
  if (label.includes('page')) {
    return "No pages found";
  }
  return "No options found";
}

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
  loadingFields?: Set<string>; // Loading states for individual fields
  onDynamicLoad?: (fieldName: string, dependsOn?: string, dependsOnValue?: any, forceRefresh?: boolean) => Promise<void>;
  nodeInfo?: any; // Node information for context-aware field behavior
  bubbleValues?: string[]; // Values that have bubbles created
  selectedValues?: string[]; // Selected values from bubbles for multi-select fields
  parentValues?: Record<string, any>; // All form values for dependency resolution
  aiFields?: Record<string, boolean>; // Track which fields are set to AI mode
  setAiFields?: (fields: Record<string, boolean>) => void; // Update AI fields
  isConnectedToAIAgent?: boolean; // Whether an AI agent exists in the workflow
  setFieldValue?: (field: string, value: any) => void; // Update other form fields
  aiToggleButton?: React.ReactNode; // AI toggle button to render alongside label
  airtableTableSchema?: any; // Airtable table schema for dynamic field rendering
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
 * Helper to determine if field should use Connect mode vs Variable Picker
 * Connect mode: For simple fields that need ONE variable (subject, email, status, etc.)
 * Variable Picker: For rich text fields that need text + multiple variables (message, body, etc.)
 */
const shouldUseConnectMode = (field: ConfigField | NodeField) => {
  const fieldName = field.name?.toLowerCase() || ''
  const fieldLabel = field.label?.toLowerCase() || ''

  // Check for explicit supportsAI flag first
  if ('supportsAI' in field) {
    // If explicitly set to false, never use connect mode
    if (field.supportsAI === false) {
      return false
    }
    // If explicitly set to true, use connect mode
    if (field.supportsAI === true) {
      return true
    }
  }

  // Structural fields - NEVER use connect mode (these are design-time configuration, not runtime data)
  // No current triggers/actions output these values, so there's no use case for dynamic references
  const structuralFields = ['baseid', 'tablename', 'guildid', 'channelid', 'databaseid', 'teamid', 'listid']
  if (structuralFields.some(sf => fieldName === sf)) {
    return false
  }

  // Airtable dynamic fields - ALWAYS use connect mode (all field types can accept variables)
  if (fieldName.startsWith('airtable_field_')) {
    return true
  }

  // Rich text fields - keep variable picker (allow multiple variables + text)
  const richTextFields = ['message', 'body', 'content', 'description', 'text', 'notes']
  if (richTextFields.some(rt => fieldName.includes(rt) || fieldLabel.includes(rt))) {
    return false
  }

  // Simple fields - use connect mode (single variable reference)
  const simpleFields = [
    'subject', 'title', 'name',
    'to', 'from', 'email', 'cc', 'bcc',
    'status', 'priority', 'assignee',
    'repository', 'label', 'milestone',
    'repo', 'branch', 'tag',
    'schedule', 'scheduled', 'datetime', 'timestamp'
  ]
  if (simpleFields.some(sf => fieldName.includes(sf) || fieldLabel.includes(sf))) {
    return true
  }

  // Default: use connect mode for text, email, number, date, dropdown, object, and array field types
  return field.type === 'text' || field.type === 'email' || field.type === 'number' || field.type === 'date' ||
         field.type === 'combobox' || field.type === 'select' || field.type === 'multi_select' ||
         field.type === 'object' || field.type === 'array'
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
  loadingFields,
  onDynamicLoad,
  nodeInfo,
  bubbleValues = [],
  selectedValues = [],
  parentValues = {},
  aiFields,
  setAiFields,
  isConnectedToAIAgent,
  setFieldValue,
  aiToggleButton,
  airtableTableSchema,
}: FieldProps) {
  // State for file-with-toggle mode - moved outside of render function to prevent infinite loop
  const [inputMode, setInputMode] = useState(() => {
    if (field.type === 'file-with-toggle') {
      // Check if we have a saved value that indicates the mode
      if (value?.mode) {
        return value.mode;
      }
      // Otherwise use the default
      return field.toggleOptions?.defaultMode || field.toggleOptions?.modes?.[0] || 'upload';
    }
    return 'upload';
  });

  // State for refresh button - must be at top level of component
  const [isRefreshingField, setIsRefreshingField] = useState(false);

  // State for Improve Prompt button
  const [isImprovingPrompt, setIsImprovingPrompt] = useState(false);
  const { toast } = useToast();

  // Get integration store (must be at top level due to Rules of Hooks)
  const { getIntegrationByProvider } = useIntegrationStore();

  // State for Connect mode - check if value is already a connected variable
  const isConnectedValue = (val: any) => {
    if (typeof val !== 'string') return false
    const trimmed = val.trim()
    return trimmed.startsWith('{{') && trimmed.endsWith('}}') && !trimmed.includes(' ')
  }

  const [isConnectedMode, setIsConnectedMode] = useState(() =>
    shouldUseConnectMode(field) && isConnectedValue(value)
  );

  // Update connected mode when value changes externally
  useEffect(() => {
    if (shouldUseConnectMode(field)) {
      setIsConnectedMode(isConnectedValue(value))
    }
  }, [value]);

  // Handle connect button toggle
  const handleConnectToggle = () => {
    if (isConnectedMode) {
      // Disconnect: Switch back to text input and clear value
      setIsConnectedMode(false)
      onChange('')
    } else {
      // Connect: Switch to dropdown mode
      setIsConnectedMode(true)
    }
  };

  // Refresh handler for dynamic fields - must be at top level of component
  const handleRefreshField = async () => {
    if (!field.dynamic || !onDynamicLoad || isRefreshingField) return;

    setIsRefreshingField(true);
    try {
      const dependencyValue = field.dependsOn ? parentValues?.[field.dependsOn] : undefined;
      if (field.dependsOn && dependencyValue) {
        await onDynamicLoad(field.name, field.dependsOn, dependencyValue, true);
      } else if (!field.dependsOn) {
        await onDynamicLoad(field.name, undefined, undefined, true);
      }
    } finally {
      setIsRefreshingField(false);
    }
  };

  // Improve Prompt handler - for AI fields with hasImproveButton
  const handleImprovePrompt = async () => {
    // Validate prompt exists
    const currentPrompt = typeof value === 'string' ? value.trim() : '';
    if (!currentPrompt) {
      toast({
        title: "No prompt to improve",
        description: "Please enter a prompt first before clicking Improve.",
        variant: "destructive"
      });
      return;
    }

    setIsImprovingPrompt(true);

    try {
      const response = await fetch('/api/ai/improve-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: currentPrompt })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to improve prompt');
      }

      const data = await response.json();

      // Update the field value with improved prompt
      onChange(data.improvedPrompt);

      // Show success toast with cost info
      toast({
        title: "Prompt improved successfully!",
        description: `Cost: ${data.metadata.costFormatted} • ${data.metadata.tokensUsed} tokens used`,
      });

    } catch (error: any) {
      logger.error('[ImprovePrompt] Error:', error);
      toast({
        title: "Failed to improve prompt",
        description: error.message || "An error occurred. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsImprovingPrompt(false);
    }
  };

  // Prepare field options for select/combobox fields
  const fieldOptions = field.options ||
    (field.dynamic && dynamicOptions?.[field.name]) ||
    [];

  // Auto-load options for combobox/select fields with dynamic data
  useEffect(() => {
    // Load for:
    // - combobox fields (always auto-load)
    // - select fields with loadOnMount: true (e.g., spreadsheetId)
    // - select fields with dependsOn (e.g., sheetName when spreadsheet is selected)
    const shouldAutoLoad = (field.type === 'combobox' && field.dynamic) ||
                          (field.type === 'select' && field.dynamic && (field.loadOnMount || field.dependsOn));

    if (shouldAutoLoad && onDynamicLoad) {
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
    // IMPORTANT: Do NOT include loadingDynamic in dependencies - it causes infinite loops
    // when data loads successfully but returns empty array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.type, field.dynamic, field.name, field.dependsOn, field.loadOnMount, parentValues[field.dependsOn], fieldOptions.length, onDynamicLoad]);

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
      if (field.dynamic.includes('github')) return 'github';
    }
    
    // Detect from field name patterns
    if (field.name === 'guildId' || field.name === 'channelId') return 'discord';
    
    // For Gmail attachment fields (uploadedFiles is the field name for Gmail attachments)
    if (field.name === 'uploadedFiles' && field.type === 'file' && nodeInfo?.providerId === 'gmail') return 'gmail';
    
    // For Airtable fields
    if (field.name?.startsWith('airtable_field_')) return 'airtable';
    
    // For Google Drive fields (only for Google Drive provider)
    if (nodeInfo?.providerId === 'google-drive' &&
        (field.name === 'uploadedFiles' || field.name === 'fileUrl' || field.name === 'fileFromNode' || field.name === 'fileName')) {
      return 'google-drive';
    }

    // For OneDrive, use generic handling
    if (nodeInfo?.providerId === 'onedrive' && field.name === 'uploadedFiles') {
      return 'generic';
    }
    
    return 'generic';
  };
  
  const integrationProvider = getIntegrationProvider(field);

  
  // Get provider ID for context-aware placeholder generation
  const getProviderId = (): string => {
    return nodeInfo?.providerId || '';
  };

  /**
   * Renders the enhanced label with integrated help system
   */
  const renderLabel = () => {
    const providerId = getProviderId();
    const helpText = field.helpText || field.tooltip || field.description || generateHelpText({
      fieldName: field.name,
      fieldType: field.type,
      integrationId: providerId,
      required: field.required,
      fieldLabel: field.label || ''
    });
    const examples = generateExamples({
      fieldName: field.name,
      fieldType: field.type,
      integrationId: providerId,
      fieldLabel: field.label || ''
    });
    const keyboardHint = getKeyboardHint({
      fieldName: field.name,
      fieldType: field.type
    });

    return (
      <div className="flex items-center gap-2 mb-2">
        {/* Field Icon */}
        <div className="p-1.5 bg-muted rounded-md text-muted-foreground flex-shrink-0">
          {getFieldIcon(field.name, field.type)}
        </div>

        {/* Enhanced Field Label */}
        <FieldLabel
          name={field.name}
          label={field.label || field.name}
          required={field.required}
          helpText={tooltipsEnabled ? helpText : undefined}
          examples={tooltipsEnabled && examples.length > 0 ? examples : undefined}
          supportsVariables={field.type !== 'boolean' && field.type !== 'number' && field.type !== 'checkbox'}
          keyboardHint={tooltipsEnabled ? keyboardHint : undefined}
        />

        {/* AI Toggle Button - rendered at the end */}
        {aiToggleButton && (
          <div className="ml-auto flex-shrink-0">
            {aiToggleButton}
          </div>
        )}
      </div>
    );
  };

  /**
   * Get smart placeholder for field
   */
  const getSmartPlaceholder = (): string => {
    const providerId = getProviderId();
    // Generate smart placeholder, but respect existing field placeholder if defined
    return generatePlaceholder({
      fieldName: field.name,
      fieldType: field.type,
      integrationId: providerId,
      required: field.required,
      fieldLabel: field.label || '',
      existingPlaceholder: field.placeholder || ''
    });
  };

  /**
   * Check if field should be disabled based on disabledWhen condition
   */
  const isFieldDisabled = (): boolean => {
    // Check if field has a base disabled property
    if (field.disabled) return true;

    // Check if field has a disabledWhen condition
    const disabledWhen = (field as any).disabledWhen;
    if (!disabledWhen) return false;

    const { field: condField, operator, value: condValue } = disabledWhen;
    const otherFieldValue = parentValues?.[condField];

    switch (operator) {
      case 'equals':
        return otherFieldValue === condValue;
      case 'notEquals':
        return otherFieldValue !== condValue;
      case 'isEmpty':
        return !otherFieldValue || otherFieldValue === '';
      case 'isNotEmpty':
        return !!otherFieldValue && otherFieldValue !== '';
      default:
        return false;
    }
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
    // Special handling for Discord slash command trigger
    // Hide all fields except guildId until a server is selected
    if (nodeInfo?.type === 'discord_trigger_slash_command') {
      // Always show the guildId field
      if (field.name === 'guildId') {
        // Let it render normally via the switch statement below
      } else {
        // For all other fields, check if guildId is selected
        const hasGuildId = parentValues?.guildId;

        if (!hasGuildId) {
          // Hide all other fields until guildId is selected
          return null;
        }

        // For the "command" field, render the full SlashCommandManager
        if (field.name === 'command') {
          // Get Discord integration (getIntegrationByProvider is from top-level hook)
          const discordIntegration = getIntegrationByProvider('discord');

          if (!discordIntegration) {
            return (
              <div className="text-sm text-muted-foreground">
                Discord integration not found. Please connect Discord first.
              </div>
            );
          }

          return (
            <SlashCommandManager
              guildId={parentValues.guildId}
              commandName={value || ''}
              commandDescription={parentValues?.commandDescription || ''}
              commandOptions={parentValues?.commandOptions || []}
              onCommandNameChange={onChange}
              onDescriptionChange={(desc: string) => {
                if (setFieldValue) {
                  setFieldValue('commandDescription', desc);
                }
              }}
              onOptionsChange={(opts: any[]) => {
                if (setFieldValue) {
                  setFieldValue('commandOptions', opts);
                }
              }}
              integrationId={discordIntegration.id}
            />
          );
        }

        // Hide commandDescription and commandOptions fields - they're handled by SlashCommandManager
        if (field.name === 'commandDescription' || field.name === 'commandOptions') {
          return null;
        }
      }
    }

    switch (field.type) {
      case "file-with-toggle":
        // File field with integrated multi-option toggle
        const modes = field.toggleOptions?.modes || ['upload', 'url'];
        const labels = field.toggleOptions?.labels || { upload: 'Upload', url: 'URL' };
        const placeholders = field.toggleOptions?.placeholders || { url: 'Enter URL...' };

        // Render the appropriate input based on mode
        const renderModeInput = () => {
          switch (inputMode) {
            case 'upload':
              // Use FileUpload component for consistent styling
              let fileValue;
              if (integrationProvider === 'trello' && field.name === 'attachment') {
                // Log the value structure for debugging
                logger.debug('[FieldRenderer] Trello attachment value:', {
                  value,
                  valueType: typeof value,
                  hasFile: !!value?.file,
                  hasMode: !!value?.mode,
                  hasUrl: !!value?.url,
                  directUrl: value?.url?.substring(0, 50),
                  fileUrl: value?.file?.url?.substring(0, 50),
                  fileName: value?.file?.name || value?.name,
                  fileSize: value?.file?.size || value?.size,
                  fileType: value?.file?.type || value?.type
                });

                // Handle different value structures
                if (value?.file) {
                  // Structure: { mode: 'upload', file: { url, name, size, type } }
                  fileValue = [value.file];
                } else if (value?.url && value?.mode === 'upload') {
                  // Structure: { mode: 'upload', url, name, size, type }
                  fileValue = [{ url: value.url, name: value.name, size: value.size, type: value.type }];
                } else if (value && !value.mode) {
                  // Direct file object: { url, name, size, type }
                  fileValue = [value];
                } else {
                  fileValue = undefined;
                }
              } else {
                fileValue = value ? (Array.isArray(value) ? value : [value]) : undefined;
              }
              return (
                <FileUpload
                  value={fileValue}
                  onChange={async (files) => {
                    if (files && files.length > 0) {
                      // For Slack attachments, convert to base64 for files under 10MB
                      // or store path for larger files
                      if (integrationProvider === 'slack' && field.name === 'attachments') {
                        const processedFiles = await Promise.all(
                          Array.from(files).map(async (file) => {
                            // 10MB threshold for base64 vs storage
                            const BASE64_SIZE_LIMIT = 10 * 1024 * 1024;

                            if (file.size <= BASE64_SIZE_LIMIT) {
                              // Convert to base64 for smaller files
                              return new Promise((resolve) => {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  resolve({
                                    type: 'base64',
                                    data: reader.result, // Includes data:mime;base64, prefix
                                    name: file.name,
                                    size: file.size,
                                    mimeType: file.type
                                  });
                                };
                                reader.readAsDataURL(file);
                              });
                            } 
                              // For larger files, we'll need to upload to Supabase storage
                              // This will be handled by the action handler
                              // For now, just mark it as a file to be uploaded
                              return {
                                type: 'file',
                                file: file,
                                name: file.name,
                                size: file.size,
                                mimeType: file.type
                              };
                            
                          })
                        );
                        onChange(field.multiple ? processedFiles : processedFiles[0]);
                      } else if (integrationProvider === 'slack' && field.name === 'icon') {
                        // For Slack icon field, convert image to base64 URL for persistence
                        const file = files[0]; // Icon is single file only
                        if (file && file.type.startsWith('image/')) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            // Store as base64 data URL so it can be saved and retrieved
                            onChange({
                              url: reader.result, // This is the base64 data URL
                              name: file.name,
                              size: file.size,
                              type: file.type
                            });
                          };
                          reader.readAsDataURL(file);
                        } else {
                          onChange(files[0]);
                        }
                      } else if (integrationProvider === 'trello' && field.name === 'attachment') {
                        // For Trello attachment field, convert to base64 for persistence
                        const file = files[0]; // Single file attachment
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            // Store with mode and file data so it can be saved and retrieved
                            onChange({
                              mode: 'upload',
                              file: {
                                url: reader.result, // This is the base64 data URL
                                name: file.name,
                                size: file.size,
                                type: file.type
                              }
                            });
                          };
                          reader.readAsDataURL(file);
                        } else {
                          onChange(null);
                        }
                      } else {
                        // For non-Slack or non-attachment fields, use standard handling
                        onChange(field.multiple ? files : files[0]);
                      }
                    } else {
                      onChange(null);
                    }
                  }}
                  accept={field.accept}
                  multiple={field.multiple || false}
                  maxSize={field.maxSize}
                  maxFiles={field.multiple ? (field.maxFiles || 10) : 1}
                  className={cn(error && "border-red-500")}
                />
              );
            case 'url':
            default:
              return (
                <Input
                  type="text"
                  value={integrationProvider === 'trello' && field.name === 'attachment' && value?.url ? value.url : (value || '')}
                  onChange={(e) => {
                    if (integrationProvider === 'trello' && field.name === 'attachment') {
                      // Store with mode for Trello attachments
                      onChange({ mode: 'url', url: e.target.value });
                    } else {
                      onChange(e.target.value);
                    }
                  }}
                  placeholder={placeholders.url}
                  className={cn(error && "border-red-500")}
                />
              );
          }
        };

        return (
          <div className="space-y-2">
            {/* Integrated toggle below the label */}
            <div className="flex gap-1 p-1 bg-muted rounded-md w-full">
              {modes.map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setInputMode(mode);
                    // Clear the value when switching modes for Trello attachments
                    if (integrationProvider === 'trello' && field.name === 'attachment') {
                      // When switching modes, update the value to reflect the new mode
                      if (mode === 'upload') {
                        // Switching to upload mode - clear URL if present
                        if (value?.mode === 'url') {
                          onChange(undefined);
                        }
                      } else if (mode === 'url') {
                        // Switching to URL mode - clear file if present
                        if (value?.mode === 'upload') {
                          onChange(undefined);
                        }
                      }
                    }
                  }}
                  className={cn(
                    "flex-1 px-3 py-1.5 text-sm font-medium rounded transition-colors",
                    inputMode === mode
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {labels[mode] || mode}
                </button>
              ))}
            </div>

            {/* Conditional field based on toggle */}
            {renderModeInput()}
          </div>
        );

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

        // Dynamic fields for Notion database rows
        if (integrationProvider === 'notion' && field.dynamic === 'notion_database_rows') {
          return (
            <NotionDatabaseRowsField
              value={value}
              onChange={onChange}
              field={field}
              values={parentValues}
              loadOptions={onDynamicLoad}
              dynamicOptions={dynamicOptions}
              loadingDynamic={loadingDynamic}
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
            workflowNodes={workflowData?.nodes}
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
          case 'microsoft-outlook':
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

      case "gmail-label-selector":
        // Special Gmail label selector that allows creating new labels
        return (
          <GmailLabelSelector
            value={Array.isArray(value) ? value : (value ? [value] : [])}
            onChange={(newValue) => {
              // Store as array for consistency
              onChange(newValue)
            }}
            options={fieldOptions}
            onRefresh={() => {
              if (onDynamicLoad) {
                onDynamicLoad(field.name, field.dynamic || field.name, true)
              }
            }}
            fieldName={field.name}
            placeholder={field.placeholder}
            isLoading={loadingDynamic}
          />
        );

      case "tags":
        return <TagsInput value={value} onChange={onChange} field={field} error={error} />;

      case "file":
        // Generic file upload handling - render FileUpload component for all file fields
        // unless they have specific custom implementations below

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

        // Special handling for Airtable file uploads (field name is uploadedFile)
        if (integrationProvider === 'airtable' && field.name === 'uploadedFile') {
          // Custom onChange that auto-populates the filename field
          const handleFileUpload = (files: FileList | File[]) => {
            onChange(files);

            // Auto-populate filename field with the uploaded file's name
            if (files && files.length > 0) {
              const uploadedFile = files[0];
              const fileName = uploadedFile instanceof File ? uploadedFile.name : (uploadedFile as any).name;

              if (fileName && setFieldValue) {
                logger.debug('[FieldRenderer] Auto-populating filename field:', fileName);
                setFieldValue('filename', fileName);
              }
            }
          };

          return (
            <FileUpload
              value={value}
              onChange={handleFileUpload}
              accept="*/*"
              placeholder={field.placeholder || "Choose files to upload..."}
              disabled={field.disabled}
              maxFiles={1}
              multiple={false}
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
        }

        // Default file upload for all other file fields (Facebook video, Teams attachments, etc.)
        return (
          <FileUpload
            value={value}
            onChange={onChange}
            accept={field.accept || "*/*"}
            placeholder={field.placeholder || "Choose files to upload..."}
            disabled={field.disabled}
            maxFiles={field.multiple ? (field.maxFiles || 10) : 1}
            multiple={field.multiple || false}
            maxSize={field.maxSize}
            className={cn(error && "border-red-500")}
          />
        );

      case "text":
      case "email":
      case "number":
      case "textarea":
      case "time":

        // Special handling for Google Drive file preview
        if (integrationProvider === 'google-drive' && field.name === 'filePreview' && field.type === 'textarea') {
          // For now, use the standard textarea but with enhanced preview text
          // In the future, we could create a custom component that renders images
          return (
            <GenericTextInput
              field={{
                ...field,
                rows: 15, // Make it larger for better preview
                disabled: true, // Keep it read-only
                placeholder: getSmartPlaceholder()
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
                aiFields={aiFields}
                setAiFields={setAiFields}
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
                workflowNodes={workflowData?.nodes}
                aiFields={aiFields}
                setAiFields={setAiFields}
                isConnectedToAIAgent={isConnectedToAIAgent}
              />
            );
          }
        }

        return (
          <GenericTextInput
            field={{
              ...field,
              workflowId: parentValues?.workflowId || workflowData?.id || 'temp',
              nodeId: nodeInfo?.id || currentNodeId || `temp-${Date.now()}`,
              placeholder: getSmartPlaceholder()
            }}
            value={value}
            onChange={onChange}
            error={error}
            dynamicOptions={fieldOptions}
            onDynamicLoad={onDynamicLoad}
            workflowData={workflowData}
            currentNodeId={currentNodeId}
            workflowNodes={workflowData?.nodes}
            aiFields={aiFields}
            setAiFields={setAiFields}
            isConnectedToAIAgent={isConnectedToAIAgent}
            enableConnectMode={shouldUseConnectMode(field)}
            isConnectedMode={isConnectedMode}
            onConnectToggle={handleConnectToggle}
          />
        );

      case "dynamic_list":
        if (nodeInfo?.type === "ai_router") {
          return (
            <AIRouterOutputPathsField
              value={Array.isArray(value) ? value : []}
              onChange={onChange}
              error={error}
              workflowData={workflowData}
              parentValues={parentValues}
              currentNodeId={currentNodeId}
            />
          )
        }
        return (
          <GenericTextInput
            field={{
              ...field,
              workflowId: parentValues?.workflowId || workflowData?.id || 'temp',
              nodeId: nodeInfo?.id || currentNodeId || `temp-${Date.now()}`,
              placeholder: getSmartPlaceholder()
            }}
            value={value}
            onChange={onChange}
            error={error}
            dynamicOptions={fieldOptions}
            onDynamicLoad={onDynamicLoad}
            workflowData={workflowData}
            currentNodeId={currentNodeId}
            workflowNodes={workflowData?.nodes}
            aiFields={aiFields}
            setAiFields={setAiFields}
            isConnectedToAIAgent={isConnectedToAIAgent}
            enableConnectMode={shouldUseConnectMode(field)}
            isConnectedMode={isConnectedMode}
            onConnectToggle={handleConnectToggle}
          />
        );

      case "toggle_group":
        // Toggle group for pill-style selection
        const toggleOptions = Array.isArray(field.options)
          ? field.options.map((opt: any) => typeof opt === 'string' ? { value: opt, label: opt } : opt)
          : fieldOptions;

        return (
          <div className="w-full">
            <ToggleGroup
              type="single"
              value={value}
              onValueChange={onChange}
              className="justify-start"
            >
              {toggleOptions.map((option: any) => (
                <ToggleGroupItem
                  key={option.value}
                  value={option.value}
                  aria-label={option.label}
                  className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                >
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
          </div>
        );

      case "select":
        // If Connect mode is active, show text input for variable references
        if (isConnectedMode) {
          return (
            <Input
              type="text"
              value={value || ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder="{{trigger.fieldName}} or {{action.output}}"
              className={cn(error && "border-red-500")}
            />
          );
        }

        // Route to integration-specific select field or generic one
        const selectOptions = Array.isArray(field.options)
          ? field.options.map((opt: any) => typeof opt === 'string' ? { value: opt, label: opt } : opt)
          : fieldOptions;

        // Check if THIS specific field is loading (only show loading for the specific field being loaded)
        const isFieldLoading = loadingFields?.has(field.name) || false;

        // Debug logging for board field
        if (field.name === 'boardId') {
          logger.debug('[FieldRenderer] Board field select options:', {
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
                isLoading={isFieldLoading}
                onDynamicLoad={onDynamicLoad}
                nodeInfo={nodeInfo}
                selectedValues={selectedValues}
                parentValues={parentValues}
                workflowNodes={workflowData?.nodes}
                aiFields={aiFields}
                setAiFields={setAiFields}
                isConnectedToAIAgent={isConnectedToAIAgent}
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
            isLoading={isFieldLoading}
            onDynamicLoad={onDynamicLoad}
            nodeInfo={nodeInfo}
            selectedValues={selectedValues}
            parentValues={parentValues}
            workflowNodes={workflowData?.nodes}
            aiFields={aiFields}
            setAiFields={setAiFields}
            isConnectedToAIAgent={isConnectedToAIAgent}
          />
        );

      case "multi_select":
        // If Connect mode is active, show text input for variable references
        if (isConnectedMode) {
          return (
            <Input
              type="text"
              value={value || ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder="{{trigger.fieldName}} or {{action.output}}"
              className={cn(error && "border-red-500")}
            />
          );
        }

        // Multi-select fields (especially for Airtable)
        const multiSelectOptions = Array.isArray(field.options)
          ? field.options.map((opt: any) => typeof opt === 'string' ? { value: opt, label: opt } : opt)
          : fieldOptions;

        // Check if THIS specific field is loading (only show loading for the specific field being loaded)
        const isMultiSelectLoading = loadingFields?.has(field.name) || false;

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
            isLoading={isMultiSelectLoading}
            onDynamicLoad={onDynamicLoad}
            nodeInfo={nodeInfo}
            selectedValues={selectedValues}
            parentValues={parentValues}
            workflowNodes={workflowData?.nodes}
            aiFields={aiFields}
            setAiFields={setAiFields}
            isConnectedToAIAgent={isConnectedToAIAgent}
          />
        );

      case "combobox":
        // If Connect mode is active, show text input for variable references
        if (isConnectedMode) {
          return (
            <Input
              type="text"
              value={value || ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder="{{trigger.fieldName}} or {{action.output}}"
              className={cn(error && "border-red-500")}
            />
          );
        }

        // Otherwise, use GenericSelectField for dropdown selection
        return (
          <GenericSelectField
            field={field}
            value={value}
            onChange={onChange}
            error={error}
            options={fieldOptions}
            isLoading={loadingDynamic}
            onDynamicLoad={onDynamicLoad}
            nodeInfo={nodeInfo}
            selectedValues={selectedValues}
            workflowData={workflowData}
            currentNodeId={currentNodeId}
            aiFields={aiFields}
            setAiFields={setAiFields}
            isConnectedToAIAgent={isConnectedToAIAgent}
          />
        );


      case "boolean":
        const isBooleanDisabled = isFieldDisabled();
        return (
          <div className="flex items-center justify-between">
            <div className="flex-1 flex items-center gap-2">
              <div className="p-1.5 bg-muted rounded-md text-muted-foreground">
                {getFieldIcon(field.name, field.type)}
              </div>
              <Label
                htmlFor={field.name}
                className={cn(
                  "text-sm font-medium",
                  isBooleanDisabled ? "text-slate-400" : "text-slate-700"
                )}
              >
                {field.label || field.name}
              </Label>
              {(field.helpText || field.tooltip || field.description) && tooltipsEnabled && (
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      className="max-w-xs bg-slate-900 text-white border-slate-700"
                      sideOffset={8}
                    >
                      <p className="text-xs">{field.helpText || field.tooltip || field.description}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <Switch
              id={field.name}
              checked={value || false}
              onCheckedChange={onChange}
              disabled={isBooleanDisabled}
              className="ml-4"
            />
          </div>
        );

      case "date": {
        // Handle single date selection with native HTML date input
        // Check if field is in AI mode first
        const isDateFieldInAIMode =
          aiFields?.[field.name] ||
          (typeof value === 'string' && value.startsWith('{{AI_FIELD:'));

        if (isDateFieldInAIMode) {
          return (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-2">
                  {field.label || field.name}
                  {field.required && <span className="text-red-500">*</span>}
                </label>
              </div>
              <div className="bg-gray-700 text-gray-300 rounded-md px-3 py-2 flex items-center gap-2">
                <Bot className="h-4 w-4 text-gray-400" />
                <span className="text-sm flex-1">
                  Defined automatically by the model
                </span>
                {setAiFields && (
                  <button
                    type="button"
                    onClick={() => {
                      // Remove from AI fields
                      const newAiFields = { ...aiFields };
                      delete newAiFields[field.name];
                      setAiFields(newAiFields);
                      // Clear the value
                      onChange('');
                    }}
                    className="text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            </div>
          );
        }

        // If connect mode is enabled, show variable dropdown when in connected mode
        if (shouldUseConnectMode(field) && workflowData && currentNodeId && isConnectedMode) {
          return (
            <VariableSelectionDropdown
              workflowData={workflowData}
              currentNodeId={currentNodeId}
              value={value || ''}
              onChange={onChange}
              placeholder="Select a date variable..."
              disabled={false}
            />
          );
        }

        const rawDateValue = typeof value === 'string' ? value : '';
        const isVariableValue =
          rawDateValue.startsWith('{{') &&
          rawDateValue.endsWith('}}') &&
          rawDateValue !== '{{NOW}}';

        // Check if "Use current date/time" is selected
        const isUsingNow = typeof value === 'string' && value === '{{NOW}}';

        // Format date value for input
        let formattedDateValue = '';
        if (value && !isUsingNow && !isVariableValue) {
          if (value instanceof Date) {
            formattedDateValue = value.toISOString().split('T')[0];
          } else if (typeof value === 'string') {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              formattedDateValue = date.toISOString().split('T')[0];
            }
          }
        }

        const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
          const newValue = e.target.value;
          onChange(newValue || null);
        };

        const handleVariableSelect = (variable: string) => {
          onChange(variable);
        };

        const handleUseNowChange = (checked: boolean) => {
          if (checked) {
            onChange('{{NOW}}');
          } else {
            onChange('');
          }
        };

        return (
          <div className="space-y-2">
            <Input
              type={isVariableValue ? "text" : "date"}
              value={isVariableValue ? rawDateValue : formattedDateValue}
              onChange={(e) => {
                const newValue = e.target.value;
                if (isVariableValue || e.target.type === "text") {
                  onChange(newValue);
                } else {
                  handleDateChange(e);
                }
              }}
              placeholder={field.placeholder || "Select date or insert variable"}
              disabled={field.disabled || (isUsingNow && !isVariableValue)}
              className={cn(
                "w-full",
                error && "border-red-500",
                isUsingNow && !isVariableValue && "opacity-50"
              )}
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id={`${field.name}-use-now`}
                checked={isUsingNow}
                onCheckedChange={handleUseNowChange}
                disabled={field.disabled}
              />
              <Label
                htmlFor={`${field.name}-use-now`}
                className="text-sm text-muted-foreground cursor-pointer font-normal"
              >
                Use current date/time when action runs
              </Label>
            </div>
            {isVariableValue && (
              <p className="text-xs text-muted-foreground">
                Variable value will be resolved when the workflow runs.
              </p>
            )}
          </div>
        );
      }

      case "daterange": {
        const startSource = value?.startDate ?? value?.from ?? '';
        const endSource = value?.endDate ?? value?.to ?? '';

        const rawStartValue =
          typeof startSource === 'string'
            ? startSource
            : startSource instanceof Date
              ? startSource.toISOString()
              : '';
        const rawEndValue =
          typeof endSource === 'string'
            ? endSource
            : endSource instanceof Date
              ? endSource.toISOString()
              : '';

        const startIsVariable =
          typeof rawStartValue === 'string' &&
          rawStartValue.startsWith('{{') &&
          rawStartValue.endsWith('}}');
        const endIsVariable =
          typeof rawEndValue === 'string' &&
          rawEndValue.startsWith('{{') &&
          rawEndValue.endsWith('}}');

        const startDateValue = (() => {
          if (!rawStartValue || startIsVariable) return '';
          const date = new Date(rawStartValue);
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
          }
          return '';
        })();

        const endDateValue = (() => {
          if (!rawEndValue || endIsVariable) return '';
          const date = new Date(rawEndValue);
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
          }
          return '';
        })();

        const updateRange = (start: string | null, end: string | null) => {
          if (!start && !end) {
            onChange(null);
            return;
          }
          onChange({
            startDate: start,
            endDate: end,
            from: start,
            to: end,
          });
        };

        const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
          const newStartDate = e.target.value;
          const currentEnd = typeof rawEndValue === 'string' && rawEndValue !== '' ? rawEndValue : null;
          updateRange(newStartDate || null, currentEnd);
        };

        const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
          const newEndDate = e.target.value;
          const currentStart = typeof rawStartValue === 'string' && rawStartValue !== '' ? rawStartValue : null;
          updateRange(currentStart, newEndDate || null);
        };

        const handleStartVariableSelect = (variable: string) => {
          const currentEnd = typeof rawEndValue === 'string' && rawEndValue !== '' ? rawEndValue : null;
          updateRange(variable, currentEnd);
        };

        const handleEndVariableSelect = (variable: string) => {
          const currentStart = typeof rawStartValue === 'string' && rawStartValue !== '' ? rawStartValue : null;
          updateRange(currentStart, variable);
        };

        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 flex-1">
                <Input
                  type={startIsVariable ? "text" : "date"}
                  value={startIsVariable ? rawStartValue : startDateValue}
                  onChange={(e) => {
                    if (startIsVariable || e.target.type === "text") {
                      updateRange(e.target.value || null, typeof rawEndValue === 'string' && rawEndValue !== '' ? rawEndValue : null);
                    } else {
                      handleStartDateChange(e);
                    }
                  }}
                  placeholder="Start date or variable"
                  disabled={field.disabled}
                  className={cn(
                    "flex-1",
                    error && "border-red-500"
                  )}
                />
                <SimpleVariablePicker
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  currentNodeType={nodeInfo?.type}
                  onVariableSelect={handleStartVariableSelect}
                />
              </div>
              <span className="text-sm text-gray-500">to</span>
              <div className="flex items-center gap-2 flex-1">
                <Input
                  type={endIsVariable ? "text" : "date"}
                  value={endIsVariable ? rawEndValue : endDateValue}
                  onChange={(e) => {
                    if (endIsVariable || e.target.type === "text") {
                      updateRange(typeof rawStartValue === 'string' && rawStartValue !== '' ? rawStartValue : null, e.target.value || null);
                    } else {
                      handleEndDateChange(e);
                    }
                  }}
                  placeholder="End date or variable"
                  disabled={field.disabled}
                  className={cn(
                    "flex-1",
                    error && "border-red-500"
                  )}
                />
                <SimpleVariablePicker
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  currentNodeType={nodeInfo?.type}
                  onVariableSelect={handleEndVariableSelect}
                />
              </div>
            </div>
            {(startIsVariable || endIsVariable) && (
              <p className="text-xs text-muted-foreground">
                Variable values will be resolved when the workflow executes.
              </p>
            )}
          </div>
        );
      }

      case "time":
        return (
          <GenericTextInput
            field={{
              ...field,
              workflowId: workflowData?.id,
              nodeId: currentNodeId,
              placeholder: getSmartPlaceholder()
            }}
            value={value}
            onChange={onChange}
            error={error}
            workflowNodes={workflowData?.nodes}
            workflowData={workflowData}
            currentNodeId={currentNodeId}
            enableConnectMode={shouldUseConnectMode(field)}
            isConnectedMode={isConnectedMode}
            onConnectToggle={handleConnectToggle}
          />
        );

      case "datetime-local": {
        // Handle datetime-local input for date and time selection
        const rawDateTime = typeof value === 'string' ? value : '';
        const isVariableDateTime =
          rawDateTime.startsWith('{{') && rawDateTime.endsWith('}}');

        const datetimeValue = useMemo(() => {
          if (!value || isVariableDateTime) return '';
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
        }, [value, isVariableDateTime]);

        // Check if this field should use connect mode
        const useConnectMode = shouldUseConnectMode(field);

        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {/* Show variable dropdown if in connect mode */}
              {useConnectMode && isConnectedMode ? (
                <VariableSelectionDropdown
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  currentNodeType={nodeInfo?.type}
                  onVariableSelect={(variable) => onChange(variable)}
                  value={value}
                  className="flex-1"
                />
              ) : (
                <Input
                  type={isVariableDateTime ? "text" : "datetime-local"}
                  value={isVariableDateTime ? rawDateTime : datetimeValue}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    if (isVariableDateTime || e.target.type === "text") {
                      onChange(newValue);
                      return;
                    }

                    if (newValue) {
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
                  placeholder={field.placeholder || "Select date & time or insert variable"}
                />
              )}
              {/* Show old variable picker if NOT using connect mode */}
              {!useConnectMode && (
                <SimpleVariablePicker
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  currentNodeType={nodeInfo?.type}
                  onVariableSelect={(variable) => onChange(variable)}
                />
              )}
            </div>
            {field.description && (
              <p className="text-sm text-muted-foreground">{field.description}</p>
            )}
            {isVariableDateTime && !useConnectMode && (
              <p className="text-xs text-muted-foreground">
                Variable value will be resolved at runtime.
              </p>
            )}
          </div>
        );
      }


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

      case "multiselect":
        // Alias for multi-select fields - use GenericSelectField for consistent loading states
        {
          const multiOptions = Array.isArray(field.options)
            ? field.options.map((opt: any) => ({
                value: String(opt.value ?? opt.id ?? opt),
                label: String(opt.label ?? opt.name ?? opt.value ?? opt.id ?? opt)
              }))
            : fieldOptions.map((opt: any) => ({
                value: String(opt.value ?? opt.id ?? ""),
                label: String(opt.label ?? opt.name ?? opt.value ?? opt.id ?? "")
              }));

          // Check if THIS specific field is loading (only show loading for the specific field being loaded)
          const isMultiselectLoading = loadingFields?.has(field.name) || false;

          return (
            <GenericSelectField
              field={{
                ...field,
                type: 'select',
                multiple: true,
                loadingPlaceholder: field.loadingPlaceholder || (field.label ? `Loading ${field.label}...` : 'Loading options...')
              }}
              value={value}
              onChange={onChange}
              error={error}
              options={multiOptions}
              isLoading={isMultiselectLoading}
              onDynamicLoad={onDynamicLoad}
              nodeInfo={nodeInfo}
              selectedValues={selectedValues}
              parentValues={parentValues}
              workflowNodes={workflowData?.nodes}
              aiFields={aiFields}
              setAiFields={setAiFields}
              isConnectedToAIAgent={isConnectedToAIAgent}
            />
          );
        }

      case "emoji-picker":
        return (
          <SlackEmojiPicker
            value={value}
            onChange={onChange}
            options={fieldOptions as any[]}
            loading={loadingDynamic}
            onRefresh={field.dynamic ? () => onDynamicLoad?.(field.name, field.dependsOn, field.dependsOn ? parentValues[field.dependsOn] : undefined, true) : undefined}
            error={error}
          />
        );

      case "custom":
        // Handle custom field types - check which custom component to render
        if (field.name === 'properties' && nodeInfo?.type === 'notion_action_manage_database') {
          // Notion Database Property Builder
          return (
            <NotionDatabasePropertyBuilder
              value={value}
              onChange={onChange}
              disabled={field.disabled}
            />
          );
        }
        // Add more custom field types here as needed
        return null;

      case "custom_multiple_records":
        // Multiple Records Field for Airtable bulk create
        return (
          <MultipleRecordsField
            value={value}
            onChange={onChange}
            field={field}
            nodeInfo={nodeInfo}
            workflowData={workflowData}
            currentNodeId={currentNodeId}
            dynamicOptions={dynamicOptions}
            loadingFields={loadingFields}
            loadOptions={onDynamicLoad}
            parentValues={parentValues}
            aiFields={aiFields}
            setAiFields={setAiFields}
            airtableTableSchema={airtableTableSchema}
          />
        );

      case "custom_field_mapper":
        // Field Mapper for mapping source data to Airtable fields
        return (
          <FieldMapperField
            value={value}
            onChange={onChange}
            field={field}
            airtableTableSchema={airtableTableSchema}
            parentValues={parentValues}
            workflowData={workflowData}
            currentNodeId={currentNodeId}
          />
        );

      case "unified-document-picker":
        // Unified Document Picker for selecting documents across multiple providers
        return (
          <UnifiedDocumentPicker
            field={field}
            value={value}
            onChange={onChange}
            error={error}
            onConnectProvider={async (providerId) => {
              // Handle in-modal connection
              // This could open a connection modal or redirect to integration page
              console.log('Connect provider:', providerId)
            }}
          />
        );

      case "chainreact-memory-picker":
        // ChainReact Memory Picker for selecting memory/knowledge base documents
        return (
          <ChainReactMemoryPicker
            field={field}
            value={value}
            onChange={onChange}
            error={error}
          />
        );

      case "time-picker-15min":
        return (
          <TimePicker15Min
            value={value}
            onChange={onChange}
            placeholder={field.placeholder}
            disabled={field.disabled}
            className={cn(error && "border-red-500")}
          />
        );

      case "timezone-picker":
        return (
          <TimezonePicker
            value={value}
            onChange={onChange}
            options={field.options || []}
            placeholder={field.placeholder}
            disabled={field.disabled}
            className={cn(error && "border-red-500")}
          />
        );

      case "recurrence-picker":
        return (
          <RecurrencePicker
            value={value}
            onChange={onChange}
            options={field.options || []}
            placeholder={field.placeholder}
            disabled={field.disabled}
            startDate={parentValues?.startDate}
            className={cn(error && "border-red-500")}
          />
        );

      case "google-meet-button":
        return (
          <GoogleMeetButton
            value={value}
            onChange={onChange}
            disabled={field.disabled}
            className={cn(error && "border-red-500")}
          />
        );

      case "google-places-autocomplete":
        return (
          <GooglePlacesAutocomplete
            value={value}
            onChange={onChange}
            placeholder={field.placeholder}
            disabled={field.disabled}
            className={cn(error && "border-red-500")}
          />
        );

      case "notification-builder":
        return (
          <NotificationBuilder
            value={value}
            onChange={onChange}
            disabled={field.disabled}
            className={cn(error && "border-red-500")}
          />
        );

      case "color-select":
        return (
          <ColorSelect
            value={value}
            onChange={onChange}
            options={field.options || []}
            placeholder={field.placeholder}
            disabled={field.disabled}
            showColorDots={field.showColorDots}
            className={cn(error && "border-red-500")}
          />
        );

      case "visibility-select":
        return (
          <VisibilitySelect
            value={value}
            onChange={onChange}
            options={field.options || []}
            placeholder={field.placeholder}
            disabled={field.disabled}
            className={cn(error && "border-red-500")}
          />
        );

      case "contact-picker":
        return (
          <ContactPicker
            value={value}
            onChange={onChange}
            placeholder={field.placeholder}
            disabled={field.disabled}
            loadOnMount={field.loadOnMount}
            dynamic={field.dynamic}
            className={cn(error && "border-red-500")}
          />
        );

      default:
        return (
          <GenericTextInput
            field={{
              ...field,
              workflowId: workflowData?.id,
              nodeId: currentNodeId,
              placeholder: getSmartPlaceholder()
            }}
            value={value}
            onChange={onChange}
            error={error}
            workflowNodes={workflowData?.nodes}
            workflowData={workflowData}
            currentNodeId={currentNodeId}
            aiFields={aiFields}
            setAiFields={setAiFields}
            isConnectedToAIAgent={isConnectedToAIAgent}
            enableConnectMode={shouldUseConnectMode(field)}
            isConnectedMode={isConnectedMode}
            onConnectToggle={handleConnectToggle}
          />
        );
    }
  };

  // Render the field content
  const fieldContent = renderFieldByType();

  // Special handling for Discord slash command trigger - hide entire field (including label)
  // until guildId is selected
  if (nodeInfo?.type === 'discord_trigger_slash_command') {
    // Always show guildId field
    if (field.name !== 'guildId') {
      // Check if guildId is selected
      const hasGuildId = parentValues?.guildId;
      if (!hasGuildId) {
        // Hide entire field including label
        return null;
      }
    }
  }

  // If fieldContent is null (field was hidden), don't render anything
  if (fieldContent === null) {
    return null;
  }

  // New inline label design - no cards, grid layout
  // Only exclude label for button-toggle and boolean (which have inline labels), and fields with hideLabel flag
  const shouldShowLabel = field.type !== "button-toggle" && field.type !== "boolean" && !field.hideLabel;

  // For fields without separate labels (boolean, button-toggle), use full width
  if (!shouldShowLabel) {
    return (
      <div className="py-3.5 border-b border-border/30 last:border-0">
        <div className="space-y-1">
          {fieldContent}
          {error && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <HelpCircle className="h-3 w-3" />
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Stacked layout - label above input
  // Generate help text for tooltip
  const providerId = getProviderId();
  const helpText = field.helpText || field.tooltip || field.description || generateHelpText({
    fieldName: field.name,
    fieldType: field.type,
    integrationId: providerId,
    required: field.required,
    fieldLabel: field.label || ''
  });
  const examples = generateExamples({
    fieldName: field.name,
    fieldType: field.type,
    integrationId: providerId,
    fieldLabel: field.label || ''
  });
  const hasTooltipContent = helpText || examples.length > 0;

  // Determine if we should show the Connect button inline with label
  const showConnectButtonInLabel = shouldUseConnectMode(field) && workflowData && currentNodeId;

  return (
    <div className="py-3.5 border-b border-border/30 last:border-0">
      {/* Label with tooltip and Connect button */}
      <div className="flex items-center gap-2 mb-1.5">
        <label
          htmlFor={field.name}
          className="text-sm font-medium text-foreground flex items-center gap-1.5"
        >
          {field.label || field.name}
          {field.required && <span className="text-red-500">*</span>}
        </label>

        {/* Help tooltip icon - always show if we have content */}
        {hasTooltipContent && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  onClick={(e) => e.preventDefault()}
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <div className="space-y-2">
                  {helpText && <p className="text-sm">{helpText}</p>}
                  {examples.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Examples:</p>
                      <ul className="text-xs space-y-0.5 list-disc list-inside">
                        {examples.map((example, i) => (
                          <li key={i} className="font-mono">{example}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Spacer to push buttons to the right */}
        <div className="flex-1" />

        {/* Connect Button - shown inline with label for simple fields */}
        {showConnectButtonInLabel && (
          <ConnectButton
            isConnected={isConnectedMode}
            onClick={handleConnectToggle}
            disabled={false}
          />
        )}

        {/* AI Toggle Button */}
        {aiToggleButton && (
          <div>
            {aiToggleButton}
          </div>
        )}

        {/* Improve Prompt Button - for fields with hasImproveButton */}
        {(field as any).hasImproveButton && !aiFields?.[field.name] && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 h-8"
            onClick={handleImprovePrompt}
            disabled={isImprovingPrompt || !value || (typeof value === 'string' && !value.trim())}
          >
            {isImprovingPrompt ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Improving...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Improve with AI
              </>
            )}
          </Button>
        )}
      </div>

      {/* Input field */}
      <div className="space-y-1">
        {fieldContent}
        {error && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <HelpCircle className="h-3 w-3" />
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
