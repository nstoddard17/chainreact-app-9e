"use client"

import React from "react";
import { Combobox, MultiCombobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { Bot, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { parseVariableReference } from "@/lib/workflows/variableReferences";

import { logger } from '@/lib/utils/logger'

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
  workflowNodes?: any[]; // All workflow nodes for variable context
  aiFields?: Record<string, boolean>;
  setAiFields?: (fields: Record<string, boolean>) => void;
  isConnectedToAIAgent?: boolean;
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
 * Handles basic select and multi-select functionality with AI mode support
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
  workflowNodes = [],
  aiFields,
  setAiFields,
  isConnectedToAIAgent,
}: GenericSelectFieldProps) {
  // All hooks must be at the top level before any conditional returns
  // Store the display label for the selected value
  const [displayLabel, setDisplayLabel] = React.useState<string | null>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);

  // State for refresh button - must be at top level before any returns
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // Track if we've attempted to load for this field to prevent repeated attempts
  const [hasAttemptedLoad, setHasAttemptedLoad] = React.useState(false);
  const [lastLoadTimestamp, setLastLoadTimestamp] = React.useState(0);

  // Refresh handler - must be at top level before any conditional returns
  const handleRefresh = React.useCallback(async () => {
    if (!field.dynamic || !onDynamicLoad || isRefreshing) return;

    setIsRefreshing(true);
    try {
      const dependencyValue = field.dependsOn ? parentValues[field.dependsOn] : undefined;
      if (field.dependsOn && dependencyValue) {
        await onDynamicLoad(field.name, field.dependsOn, dependencyValue, true);
      } else if (!field.dependsOn) {
        await onDynamicLoad(field.name, undefined, undefined, true);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [field.dynamic, field.name, field.dependsOn, parentValues, onDynamicLoad, isRefreshing]);

  // Check if this field is in AI mode
  const isAIEnabled = aiFields?.[field.name] || (typeof value === 'string' && value.startsWith('{{AI_FIELD:'));
  // Debug logging for board field
  if (field.name === 'boardId') {
    logger.debug('[GenericSelectField] Board field props:', {
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

  // Function to extract friendly label from variable syntax
  const getFriendlyVariableLabel = React.useCallback((variableStr: string, workflowNodes?: any[]): string | null => {
    const parsed = parseVariableReference(variableStr)
    if (!parsed || parsed.kind !== 'node' || !parsed.nodeId) return null

    const nodeId = parsed.nodeId
    const fieldName = parsed.fieldPath[parsed.fieldPath.length - 1]

    // Try to find the node title if workflowNodes is available
    let nodeTitle = ''
    let nodeProvider = ''
    if (workflowNodes) {
      const node = workflowNodes.find(n => n.id === nodeId)
      if (node?.data) {
        nodeTitle = node.data.title || node.data.type || ''
        nodeProvider = node.data.providerId || ''
      }
    }

    // Map common field names to friendly labels based on provider context
    const fieldLabelMap: Record<string, string> = {
      // Discord fields
      'memberUsername': 'Discord Username',
      'memberTag': 'Discord Member Tag',
      'memberId': 'Discord Member ID',
      'memberDiscriminator': 'Discord Discriminator',
      'memberAvatar': 'Discord Avatar',
      'userName': 'Discord Username',
      'authorName': 'Discord Author',
      'authorId': 'Discord Author ID',
      'userId': 'Discord User ID',
      'channelName': 'Discord Channel',
      'channelId': 'Discord Channel ID',
      'guildName': 'Discord Server',
      'guildId': 'Discord Server ID',
      'messageId': 'Discord Message ID',
      'content': nodeProvider === 'discord' ? 'Discord Message' : 'Content',
      'roleId': 'Discord Role ID',
      'roleName': 'Discord Role',
      'inviteCode': 'Discord Invite Code',
      'inviteUrl': 'Discord Invite URL',
      'inviterTag': 'Discord Inviter',
      'inviterId': 'Discord Inviter ID',
      'commandName': 'Discord Command',

      // Gmail/Email fields
      'from': 'Email From',
      'to': 'Email To',
      'subject': 'Email Subject',
      'body': 'Email Body',
      'messageId': nodeProvider === 'gmail' || nodeProvider === 'outlook' ? 'Email ID' : 'Message ID',
      'threadId': 'Email Thread ID',
      'labelIds': 'Email Labels',
      'attachments': 'Email Attachments',

      // Slack fields
      'text': nodeProvider === 'slack' ? 'Slack Message' : 'Text',
      'channel': nodeProvider === 'slack' ? 'Slack Channel' : 'Channel',
      'ts': 'Slack Timestamp',
      'thread_ts': 'Slack Thread',
      'user': nodeProvider === 'slack' ? 'Slack User' : 'User',
      'username': nodeProvider === 'slack' ? 'Slack Username' : 'Username',

      // Notion fields
      'pageId': 'Notion Page ID',
      'databaseId': 'Notion Database ID',
      'pageTitle': 'Notion Page Title',
      'pageUrl': 'Notion Page URL',
      'properties': 'Notion Properties',

      // GitHub fields
      'issueId': 'GitHub Issue ID',
      'issueNumber': 'GitHub Issue Number',
      'pullRequestId': 'GitHub PR ID',
      'repository': 'GitHub Repository',
      'owner': 'GitHub Owner',
      'state': 'GitHub State',
      'labels': 'GitHub Labels',

      // Airtable fields
      'baseId': 'Airtable Base',
      'tableId': 'Airtable Table',
      'tableName': 'Airtable Table',
      'recordId': 'Airtable Record ID',
      'fields': 'Airtable Fields',

      // HubSpot fields
      'contactId': 'HubSpot Contact ID',
      'email': nodeProvider === 'hubspot' ? 'HubSpot Email' : 'Email',
      'firstName': 'First Name',
      'lastName': 'Last Name',
      'company': 'Company',

      // Trello fields
      'boardId': 'Trello Board ID',
      'boardName': 'Trello Board',
      'listId': 'Trello List ID',
      'listName': 'Trello List',
      'cardId': 'Trello Card ID',
      'cardName': 'Trello Card',

      // Google Calendar fields
      'eventId': 'Calendar Event ID',
      'eventTitle': 'Calendar Event',
      'start': 'Event Start',
      'end': 'Event End',
      'htmlLink': 'Calendar Link',
      'meetLink': 'Meet Link',
      'attendees': 'Event Attendees',

      // Google Sheets fields
      'spreadsheetId': 'Spreadsheet ID',
      'sheetName': 'Sheet Name',
      'range': 'Sheet Range',
      'values': 'Sheet Values',
      'data': 'Sheet Data',
      'rowId': 'Row ID',

      // Webhook fields
      'headers': 'Webhook Headers',
      'method': 'HTTP Method',
      'statusCode': 'Status Code',

      // AI/OpenAI fields
      'prompt': 'AI Prompt',
      'completion': 'AI Response',
      'model': 'AI Model',
      'usage': 'Token Usage',

      // Generic fields
      'id': 'ID',
      'name': 'Name',
      'title': 'Title',
      'description': 'Description',
      'url': 'URL',
      'timestamp': 'Timestamp',
      'response': 'Response',
      'output': 'Output',
      'result': 'Result',
      'success': 'Success',
      'error': 'Error',
      'count': 'Count',
      'joinedAt': 'Join Time',
      'createdAt': 'Created At',
      'updatedAt': 'Updated At',
    }

    // Get the base label from the map
    let label = fieldLabelMap[fieldName]

    // If not found, create a label from the field name
    if (!label) {
      label = fieldName
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .trim()
        .replace(/\b\w/g, (l) => l.toUpperCase())
    }

    // Add node title context if available and useful
    if (nodeTitle && !label.includes(nodeTitle)) {
      // For triggers, prepend "From [Node]"
      if (nodeTitle.toLowerCase().includes('trigger')) {
        return `${label} (from trigger)`
      }
      // For specific node types, add context
      if (nodeTitle.toLowerCase().includes('new message')) {
        return `New Message ${label}`
      }
      if (nodeTitle.toLowerCase().includes('user joined')) {
        return `Joined User ${label}`
      }
    }

    return label
  }, [])

  const loadingPlaceholder = field.loadingPlaceholder || 'Loading options...';
  const basePlaceholder = field.placeholder || (field.label ? `Select ${field.label}...` : 'Select an option...');
  const placeholderText = field.dynamic && isLoading ? loadingPlaceholder : basePlaceholder;

  // Cache key for persisting display labels across modal reopen
  const labelCacheKey = React.useMemo(() => {
    const provider = nodeInfo?.providerId || 'generic';
    const nodeType = nodeInfo?.type || 'unknown';
    return `workflow-field-label:${provider}:${nodeType}:${field.name}`;
  }, [nodeInfo?.providerId, nodeInfo?.type, field.name]);

  const loadCachedLabel = React.useCallback(
    (val: string): string | null => {
      if (typeof window === 'undefined' || !val) return null;
      try {
        const raw = window.localStorage.getItem(labelCacheKey);
        if (!raw) return null;
        const cache = JSON.parse(raw) as Record<string, string>;
        return cache?.[val] ?? null;
      } catch (error) {
        logger.warn('[GenericSelectField] Failed to load cached label', error);
        return null;
      }
    },
    [labelCacheKey]
  );

  const saveLabelToCache = React.useCallback(
    (val: string, label: string | null | undefined) => {
      if (typeof window === 'undefined' || !val || !label) return;
      try {
        const raw = window.localStorage.getItem(labelCacheKey);
        const cache = raw ? (JSON.parse(raw) as Record<string, string>) : {};
        cache[val] = label;
        window.localStorage.setItem(labelCacheKey, JSON.stringify(cache));
      } catch (error) {
        logger.warn('[GenericSelectField] Failed to cache label', error);
      }
    },
    [labelCacheKey]
  );

  // When value changes, update the display label if we find the option or it's a variable
  React.useEffect(() => {
    // If value is empty, clear the display label
    if (!value || value === '') {
      setDisplayLabel(null);
      return;
    }

    // Check if value is a variable
    if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
      const friendlyLabel = getFriendlyVariableLabel(value, workflowNodes)
      setDisplayLabel(friendlyLabel)
      if (friendlyLabel) {
        saveLabelToCache(String(value), friendlyLabel);
      }
    } else if (options?.length > 0) {
      const option = options.find((opt: any) => {
        const optValue = opt.value || opt.id;
        return String(optValue) === String(value);
      });
      if (option) {
        const label = option.label || option.name || option.value || option.id;
        setDisplayLabel(label);
        saveLabelToCache(String(value), label);
      }
    } else {
      // Attempt to hydrate from cached label while options load
      const cached = loadCachedLabel(String(value));
      if (cached) {
        setDisplayLabel(cached);
      }
    }
  }, [value, options, getFriendlyVariableLabel, workflowNodes, loadCachedLabel, saveLabelToCache]);
  
  // If we still don't have a display label yet but a value exists, attempt to load cached label once
  React.useEffect(() => {
    if (!displayLabel && value) {
      const cached = loadCachedLabel(String(value));
      if (cached) {
        setDisplayLabel(cached);
      }
    }
  }, [displayLabel, value, loadCachedLabel]);
  
  // Reset load attempt tracking when dependencies change
  React.useEffect(() => {
    if (field.dependsOn && parentValues[field.dependsOn]) {
      setHasAttemptedLoad(false);
      setLastLoadTimestamp(0);
    }
  }, [field.dependsOn, parentValues[field.dependsOn]]);
  
  // Generic loading behavior
  const handleFieldOpen = (open: boolean) => {
    logger.debug('🔍 [GenericSelectField] handleFieldOpen called:', {
      open,
      fieldName: field.name,
      fieldDynamic: field.dynamic,
      fieldDependsOn: field.dependsOn,
      hasOnDynamicLoad: !!onDynamicLoad,
      isLoading,
      optionsLength: options?.length || 0,
      hasAttemptedLoad,
      timeSinceLastLoad: Date.now() - lastLoadTimestamp
    });

    const hasOptions = processedOptions.length > 0
    const timeSinceLastLoad = Date.now() - lastLoadTimestamp
    const recentlyLoaded = timeSinceLastLoad < 10000 // Don't reload if loaded in last 10 seconds (increased from 5)

    // Special cases for fields that shouldn't reload frequently
    const isGoogleSheetsSheetName = nodeInfo?.providerId === 'google-sheets' && field.name === 'sheetName'
    const isOneDriveFileId = nodeInfo?.providerId === 'onedrive' && field.name === 'fileId'

    // For dependent fields like OneDrive fileId, be extra cautious about reloading
    const isDependentField = !!field.dependsOn
    const dependencyValue = field.dependsOn ? parentValues[field.dependsOn] : undefined

    // If this is a dependent field and dependency hasn't changed, don't reload if recently loaded
    if (isDependentField && hasAttemptedLoad && recentlyLoaded) {
      logger.debug('⏭️ [GenericSelectField] Skipping reload for dependent field - recently loaded:', field.name)
      return
    }

    // Check if this is a loadOnMount field that already has data
    const isLoadOnMountWithData = field.loadOnMount && hasOptions

    // Only load if:
    // 1. Dropdown is open
    // 2. Field is dynamic
    // 3. Not currently loading
    // 4. Not a loadOnMount field that already has data (avoid double loading)
    // 5. Either hasn't attempted to load, OR (has no options AND hasn't loaded recently)
    // 6. For special fields (Google Sheets sheetName, OneDrive fileId), also check if we haven't loaded recently
    const shouldLoad = open && field.dynamic && onDynamicLoad && !isLoading &&
                      !isLoadOnMountWithData &&
                      (!hasAttemptedLoad || (!hasOptions && !recentlyLoaded)) &&
                      (!(isGoogleSheetsSheetName || isOneDriveFileId) || !recentlyLoaded)

    if (shouldLoad) {
      const forceRefresh = hasAttemptedLoad && !hasOptions // Only force refresh if we tried but got no options

      logger.debug('🚀 [GenericSelectField] Triggering dynamic load for field:', field.name, 'with dependencies:', {
        dependsOn: field.dependsOn,
        dependsOnValue: dependencyValue,
        forceRefresh,
        timeSinceLastLoad,
        recentlyLoaded
      })

      setHasAttemptedLoad(true)
      setLastLoadTimestamp(Date.now())

      if (field.dependsOn && dependencyValue) {
        onDynamicLoad(field.name, field.dependsOn, dependencyValue, forceRefresh)
      } else if (!field.dependsOn) {
        // Only load fields without dependencies if dependency not required
        onDynamicLoad(field.name, undefined, undefined, forceRefresh)
      }
    }
  };

  // Generic option processing
  const processOptions = (opts: any[]) => {
    return opts.filter(opt => opt && (opt.value || opt.id));
  };

  const processedOptions = processOptions(options);

  // Drag and drop handlers
  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    logger.debug('🎯 [GenericSelectField] Drag over:', { fieldName: field.name })
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
    e.dataTransfer.dropEffect = 'copy'
  }, [field.name])

  const handleDragLeave = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    // Try to get JSON data first (which includes alias)
    const jsonData = e.dataTransfer.getData('application/json')
    let droppedText = e.dataTransfer.getData('text/plain')
    let alias: string | null = null

    // Parse JSON data if available to get the alias
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
        logger.warn('[GenericSelectField] Failed to parse JSON drag data:', err)
      }
    }

    logger.debug('🎯 [GenericSelectField] Variable dropped:', {
      fieldName: field.name,
      droppedText,
      alias,
      isVariable: droppedText.startsWith('{{') && droppedText.endsWith('}}'),
      isMultiple: field.multiple
    })

    // Check if it's a variable syntax
    if (droppedText && droppedText.startsWith('{{') && droppedText.endsWith('}}')) {
      // For multi-select fields, add to array
      if (field.multiple) {
        const currentValues = Array.isArray(value) ? value : []
        onChange([...currentValues, droppedText])
      } else {
        // For single select, just set the value
        onChange(droppedText)
      }

      // Use the alias from drag data if available, otherwise generate one
      const friendlyLabel = alias || getFriendlyVariableLabel(droppedText, workflowNodes)
      setDisplayLabel(friendlyLabel)

      // Cache the label for persistence
      if (friendlyLabel) {
        saveLabelToCache(droppedText, friendlyLabel)
      }

      logger.debug('✅ [GenericSelectField] Variable accepted:', {
        fieldName: field.name,
        variable: droppedText,
        friendlyLabel,
        usedProvidedAlias: !!alias,
        isMultiple: field.multiple
      })
    }
  }, [field.name, field.multiple, value, onChange, getFriendlyVariableLabel, workflowNodes, saveLabelToCache])

  // Show loading state for dynamic fields
  // Always show loading indicator when the field is actively loading
  // This ensures users see feedback even when cached options exist
  const shouldShowLoading = field.dynamic && isLoading;

  // If in AI mode, show the "Defined by AI" UI
  if (isAIEnabled) {
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

  // Render field content (normal mode)
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
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <MultiCombobox
            value={Array.isArray(value) ? value : (value ? [value] : [])}
            onChange={onChange}
            options={processedOptions}
            placeholder={placeholderText}
            emptyPlaceholder={isLoading ? loadingPlaceholder : "No options available"}
            searchPlaceholder="Search options..."
            disabled={false}
            creatable={true} // Always allow custom input for variables
            onOpenChange={handleFieldOpen}
            selectedValues={effectiveSelectedValues} // Pass selected values for checkmarks
            hideSelectedBadges={isAirtableLinkedField} // Hide badges for Airtable fields with bubbles
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          />
        </div>
        {field.dynamic && onDynamicLoad && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleRefresh}
                  disabled={isRefreshing || isLoading}
                  className="flex-shrink-0"
                >
                  <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Refresh options</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    );
  }

  // Check if this is an Airtable create/update record field that should support custom input
  const isAirtableRecordField = nodeInfo?.providerId === 'airtable' && 
    (nodeInfo?.type === 'airtable_action_create_record' || 
     nodeInfo?.type === 'airtable_action_update_record') &&
    field.name?.startsWith('airtable_field_');

  // Use Combobox for all select fields to support variables
  // Variables can be entered using {{variable_name}} syntax
  if (field.type === 'select' && !field.multiple) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Combobox
            value={value ?? ""}
            onChange={(newValue) => {
              onChange(newValue);
              // Clear display label when value is cleared
              if (!newValue) {
                setDisplayLabel(null);
              } else if (newValue.startsWith('{{') && newValue.endsWith('}}')) {
                // Set friendly label for variables
                const friendlyLabel = getFriendlyVariableLabel(newValue, workflowNodes);
                setDisplayLabel(friendlyLabel);
              }
            }}
            options={processedOptions}
            placeholder={placeholderText}
            searchPlaceholder="Search options..."
            emptyPlaceholder={isLoading ? loadingPlaceholder : "No options found"}
            disabled={false}
            creatable={true} // Always allow custom input for variables
            onOpenChange={handleFieldOpen} // Add missing onOpenChange handler
            selectedValues={effectiveSelectedValues} // Pass selected values for checkmarks
            displayLabel={displayLabel} // Pass the saved display label
            disableSearch={(field as any).disableSearch} // Support disabling search for simple dropdowns
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          />
        </div>
        {field.dynamic && onDynamicLoad && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleRefresh}
                  disabled={isRefreshing || isLoading}
                  className="flex-shrink-0"
                >
                  <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Refresh options</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    );
  }

  // Default fallback: Use Combobox for all remaining select fields to support variables
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <Combobox
          value={value ?? ""}
          onChange={(newValue) => {
            onChange(newValue);
            // Clear display label when value is cleared
            if (!newValue) {
              setDisplayLabel(null);
            } else if (newValue.startsWith('{{') && newValue.endsWith('}}')) {
              // Set friendly label for variables
              const friendlyLabel = getFriendlyVariableLabel(newValue, workflowNodes);
              setDisplayLabel(friendlyLabel);
            }
          }}
          options={processedOptions}
          placeholder={placeholderText}
          searchPlaceholder="Search options..."
          emptyPlaceholder={isLoading ? loadingPlaceholder : getEmptyMessage(field.name, field.label)}
          disabled={false}
          creatable={true} // Always allow custom input for variables
          onOpenChange={handleFieldOpen}
          selectedValues={effectiveSelectedValues}
          displayLabel={displayLabel}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        />
      </div>
      {field.dynamic && onDynamicLoad && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleRefresh}
                disabled={isRefreshing || isLoading}
                className="flex-shrink-0"
              >
                <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Refresh options</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
