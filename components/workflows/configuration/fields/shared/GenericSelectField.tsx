"use client"

import React from "react";
import { Combobox, MultiCombobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

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
  workflowNodes = [],
}: GenericSelectFieldProps) {
  // Store the display label for the selected value
  const [displayLabel, setDisplayLabel] = React.useState<string | null>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);
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

  // Function to extract friendly label from variable syntax
  const getFriendlyVariableLabel = React.useCallback((variableStr: string, workflowNodes?: any[]): string | null => {
    // Match pattern like {{node_id.output.field_name}}
    const match = variableStr.match(/\{\{([^}]+)\}\}/)
    if (!match) return null

    const parts = match[1].split('.')
    if (parts.length < 3) return variableStr // Return original if format is unexpected

    // Extract the node ID and field name
    const nodeId = parts[0]
    const fieldName = parts[parts.length - 1]

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

  // When value changes, update the display label if we find the option or it's a variable
  React.useEffect(() => {
    // Check if value is a variable
    if (value && typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
      const friendlyLabel = getFriendlyVariableLabel(value, workflowNodes)
      setDisplayLabel(friendlyLabel)
    } else if (value && options?.length > 0) {
      const option = options.find((opt: any) => {
        const optValue = opt.value || opt.id;
        return String(optValue) === String(value);
      });
      if (option) {
        const label = option.label || option.name || option.value || option.id;
        setDisplayLabel(label);
      }
    }
  }, [value, options, getFriendlyVariableLabel, workflowNodes]);
  
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
      timeSinceLastLoad: Date.now() - lastLoadTimestamp
    });

    const hasOptions = processedOptions.length > 0
    const timeSinceLastLoad = Date.now() - lastLoadTimestamp
    const recentlyLoaded = timeSinceLastLoad < 5000 // Don't reload if loaded in last 5 seconds

    // Special case for Google Sheets sheetName: don't reload if we've attempted recently
    const isGoogleSheetsSheetName = nodeInfo?.providerId === 'google-sheets' && field.name === 'sheetName'

    // Only load if:
    // 1. Dropdown is open
    // 2. Field is dynamic
    // 3. Not currently loading
    // 4. Either hasn't attempted to load, OR (has no options AND hasn't loaded recently)
    // 5. For Google Sheets sheetName, also check if we haven't loaded recently
    const shouldLoad = open && field.dynamic && onDynamicLoad && !isLoading &&
                      (!hasAttemptedLoad || (!hasOptions && !recentlyLoaded)) &&
                      (!isGoogleSheetsSheetName || !recentlyLoaded)

    if (shouldLoad) {
      const forceRefresh = hasAttemptedLoad && !hasOptions // Only force refresh if we tried but got no options

      console.log('🚀 [GenericSelectField] Triggering dynamic load for field:', field.name, 'with dependencies:', {
        dependsOn: field.dependsOn,
        dependsOnValue: field.dependsOn ? parentValues[field.dependsOn] : undefined,
        forceRefresh,
        timeSinceLastLoad,
        recentlyLoaded
      })

      setHasAttemptedLoad(true)
      setLastLoadTimestamp(Date.now())

      if (field.dependsOn && parentValues[field.dependsOn]) {
        onDynamicLoad(field.name, field.dependsOn, parentValues[field.dependsOn], forceRefresh)
      } else {
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
    console.log('🎯 [GenericSelectField] Drag over:', { fieldName: field.name })
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

    const droppedText = e.dataTransfer.getData('text/plain')
    console.log('🎯 [GenericSelectField] Variable dropped:', {
      fieldName: field.name,
      droppedText,
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

      // Set the display label to a friendly name
      const friendlyLabel = getFriendlyVariableLabel(droppedText, workflowNodes)
      setDisplayLabel(friendlyLabel)

      console.log('✅ [GenericSelectField] Variable accepted:', {
        fieldName: field.name,
        variable: droppedText,
        friendlyLabel,
        isMultiple: field.multiple
      })
    }
  }, [field.name, field.multiple, value, onChange, getFriendlyVariableLabel, workflowNodes])

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
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        />
    );
  }

  // Default fallback: Use Combobox for all remaining select fields to support variables
  return (
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
  );
}
