"use client"

import React from "react";
import { Combobox, MultiCombobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { Bot, X, RefreshCw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { parseVariableReference } from "@/lib/workflows/variableReferences";
import { SimpleVariablePicker } from "@/components/workflows/configuration/fields/SimpleVariablePicker";

import { logger } from '@/lib/utils/logger'
import { useConfigCacheStore } from "@/stores/configCacheStore"
import { buildCacheKey, getFieldTTL, shouldCacheField } from "@/lib/workflows/configuration/cache-utils"
import { LoadingFieldState } from "./LoadingFieldState"

interface GenericSelectFieldProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  options: any[];
  isLoading?: boolean;
  onDynamicLoad?: (fieldName: string, dependsOn?: string, dependsOnValue?: any, forceRefresh?: boolean, silent?: boolean) => Promise<void>;
  nodeInfo?: any;
  selectedValues?: string[]; // Values that already have bubbles
  parentValues?: Record<string, any>; // Parent form values for dependency resolution
  workflowNodes?: any[]; // All workflow nodes for variable context
  aiFields?: Record<string, boolean>;
  setAiFields?: (fields: Record<string, boolean>) => void;
  isConnectedToAIAgent?: boolean;
  workflowData?: { nodes: any[], edges: any[] }; // Full workflow data for variable picker
  currentNodeId?: string; // Current node ID for variable picker context
  aiToggleButton?: React.ReactNode; // AI toggle button to render alongside label
  onLabelStore?: (fieldName: string, value: string, label: string) => void; // Store label alongside value for instant display on reopen
}

/**
 * Get appropriate empty message based on field configuration or field name
 */
function getEmptyMessage(fieldName: string, fieldLabel?: string, customEmptyMessage?: string): string {
  // If field has a custom empty message, use that first
  if (customEmptyMessage) {
    return customEmptyMessage;
  }

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
  workflowData,
  currentNodeId,
  aiToggleButton,
  onLabelStore,
}: GenericSelectFieldProps) {
  // Cache store - must be at top level
  const { get: getCache, set: setCache, invalidate: invalidateCache } = useConfigCacheStore()

  // Cache key for persisting display labels across modal reopen
  const labelCacheKeyForInit = React.useMemo(() => {
    const provider = nodeInfo?.providerId || 'generic';
    const nodeType = nodeInfo?.type || 'unknown';
    return `workflow-field-label:${provider}:${nodeType}:${field.name}`;
  }, [nodeInfo?.providerId, nodeInfo?.type, field.name]);

  // All hooks must be at the top level before any conditional returns
  // Store the display label for the selected value
  // Initialize with cached label for instant display of saved values (Zapier-like UX)
  const [displayLabel, setDisplayLabel] = React.useState<string | null>(() => {
    // PRIORITY 1: Check for stored label in form values (_label_fieldName convention)
    // This is the primary source for instant label display on modal reopen
    if (value) {
      const storedLabelKey = `_label_${field.name}`;
      const storedLabel = parentValues?.[storedLabelKey];
      if (storedLabel && typeof storedLabel === 'string') {
        return storedLabel;
      }
    }

    // PRIORITY 2: Check for saved labels in parentValues (for Airtable linked record fields)
    // This ensures linked record fields NEVER show IDs, always labels
    if (value && field.name?.startsWith('airtable_field_')) {
      const labelMetadataKey = `${field.name}_labels`;
      const savedLabels = parentValues?.[labelMetadataKey] as Record<string, string> | undefined;
      if (savedLabels && savedLabels[String(value)]) {
        return savedLabels[String(value)];
      }
    }

    // PRIORITY 3: Try to load cached label from localStorage
    if (typeof window !== 'undefined' && value) {
      try {
        const raw = window.localStorage.getItem(labelCacheKeyForInit);
        if (raw) {
          const cache = JSON.parse(raw) as Record<string, string>;
          const cached = cache?.[String(value)];
          if (cached) {
            return cached;
          }
        }
      } catch (error) {
        // Ignore errors, will fallback to null
      }
    }
    return null;
  });
  const [isDragOver, setIsDragOver] = React.useState(false);

  // State for refresh button - must be at top level before any returns
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // Track if current options are from cache
  const [isFromCache, setIsFromCache] = React.useState(false);

  // Track if we've attempted to load for this field to prevent repeated attempts
  const [hasAttemptedLoad, setHasAttemptedLoad] = React.useState(false);
  const [lastLoadTimestamp, setLastLoadTimestamp] = React.useState(0);
  const isLoadingRef = React.useRef(false); // Prevent concurrent loads
  const isOpenRef = React.useRef(false); // Track if dropdown is currently open

  // Track the last dependency value to detect actual changes (not just object reference changes)
  const lastDependencyValueRef = React.useRef<any>(null);

  // State for search functionality (for fields like gmail-recent-emails)
  const [isSearching, setIsSearching] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  // Check if this is an Airtable create/update record field that should support custom input
  const isAirtableRecordField = nodeInfo?.providerId === 'airtable' &&
    (nodeInfo?.type === 'airtable_action_create_record' ||
     nodeInfo?.type === 'airtable_action_update_record') &&
    field.name?.startsWith('airtable_field_');

  // Cached dynamic load wrapper - checks cache before calling onDynamicLoad
  const cachedDynamicLoad = React.useCallback(async (
    fieldName: string,
    dependsOn?: string,
    dependsOnValue?: any,
    forceRefresh = false,
    silent = false
  ) => {
    if (!onDynamicLoad) return;

    // Build cache key
    const providerId = nodeInfo?.providerId || 'generic'
    const integrationId = nodeInfo?.integrationId || 'default'
    const params = dependsOnValue ? { [dependsOn || 'parent']: dependsOnValue } : undefined
    const cacheKey = buildCacheKey(providerId, integrationId, fieldName, params)

    // Check if this field should be cached
    const shouldCache = shouldCacheField(fieldName)

    // If force refresh, invalidate cache first
    if (forceRefresh && shouldCache) {
      logger.debug('[GenericSelectField] Force refresh - invalidating cache:', cacheKey)
      invalidateCache(cacheKey)
      setIsFromCache(false)
    }

    // Try to get from cache (unless force refresh)
    if (!forceRefresh && shouldCache) {
      const cached = getCache(cacheKey)
      if (cached) {
        logger.debug('[GenericSelectField] Cache HIT:', { fieldName, cacheKey, optionsCount: cached.length })
        setIsFromCache(true)
        // Cache hit! No need to call onDynamicLoad - options are already set via parent component
        return
      }
      logger.debug('[GenericSelectField] Cache MISS:', { fieldName, cacheKey })
    }

    // Cache miss or no cache - load from API
    setIsFromCache(false)
    await onDynamicLoad(fieldName, dependsOn, dependsOnValue, forceRefresh, silent)

    // Note: We don't cache here because we don't have direct access to the options
    // The parent component (ConfigurationModal) will need to handle caching after receiving data
  }, [nodeInfo, onDynamicLoad, getCache, invalidateCache])

  // Refresh handler - must be at top level before any conditional returns
  const handleRefresh = React.useCallback(async () => {
    if (!field.dynamic || !onDynamicLoad) return;

    // Use ref to check if already refreshing to avoid stale closure
    if (isRefreshing) {
      logger.debug('[GenericSelectField] Refresh already in progress, skipping');
      return;
    }

    setIsRefreshing(true);
    try {
      const dependencyValue = field.dependsOn ? parentValues[field.dependsOn] : undefined;
      logger.debug('[GenericSelectField] Refreshing field:', {
        fieldName: field.name,
        dependsOn: field.dependsOn,
        dependencyValue
      });

      if (field.dependsOn && dependencyValue) {
        await cachedDynamicLoad(field.name, field.dependsOn, dependencyValue, true);
      } else if (!field.dependsOn) {
        await cachedDynamicLoad(field.name, undefined, undefined, true);
      } else {
        logger.debug('[GenericSelectField] Skipping refresh - dependent field missing parent value');
      }
    } catch (error) {
      logger.error('[GenericSelectField] Refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [field.dynamic, field.name, field.dependsOn, parentValues, cachedDynamicLoad, onDynamicLoad, isRefreshing]);

  // Handle search query changes (debounced search for fields like gmail-recent-emails)
  // Note: Combobox already debounces by 300ms before calling this
  const handleSearchChange = React.useCallback(async (query: string) => {
    console.log('🔍 [GenericSelectField] handleSearchChange called:', {
      fieldName: field.name,
      query,
      fieldDynamic: field.dynamic,
      hasOnDynamicLoad: !!onDynamicLoad,
      isSearchable: (field as any).searchable
    });

    // Only enable search for specific dynamic fields that support it
    if (!field.dynamic || !onDynamicLoad) {
      console.log('❌ [GenericSelectField] Search skipped - no dynamic or onDynamicLoad');
      return;
    }

    // Only enable for searchable fields or fields with searchable: true
    const searchableFields = ['gmail-recent-emails', 'gmail_from_addresses', 'gmail-enhanced-recipients', 'gmail_recent_senders', 'gmail-recent-senders'];
    if (!searchableFields.includes(field.dynamic) && !(field as any).searchable) {
      console.log('❌ [GenericSelectField] Search skipped - field not in searchableFields:', field.dynamic);
      return;
    }

    // Require minimum characters to search (Gmail senders can search after 1 char for quicker suggestions)
    const minSearchLength = field.dynamic === 'gmail_recent_senders' ? 1 : 2;
    if (query.length < minSearchLength) {
      console.log('❌ [GenericSelectField] Search skipped - query too short:', query.length);
      setSearchQuery('');
      return;
    }

    console.log('✅ [GenericSelectField] Proceeding with search for:', query);
    setSearchQuery(query);
    setIsSearching(true);

    try {
      logger.debug('[GenericSelectField] Search query:', { fieldName: field.name, query });

      // Call onDynamicLoad with search parameter
      // The API handler will receive this as part of options
      // Search is always silent since we're filtering existing data
      await onDynamicLoad(field.name, 'searchQuery', query, true, true);
      console.log('✅ [GenericSelectField] Search completed for:', query);
    } catch (error) {
      console.error('❌ [GenericSelectField] Search error:', error);
      logger.error('[GenericSelectField] Search error:', error);
    } finally {
      setIsSearching(false);
    }
  }, [field.dynamic, field.name, onDynamicLoad]);

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

  // Handle variable selection from SimpleVariablePicker
  const handleVariableSelect = React.useCallback((variable: string) => {
    logger.debug('[GenericSelectField] Variable selected:', { fieldName: field.name, variable });
    onChange(variable);

    // Set display label for the variable
    const friendlyLabel = getFriendlyVariableLabel(variable, workflowNodes);
    setDisplayLabel(friendlyLabel);

    // Cache the label
    if (friendlyLabel) {
      saveLabelToCache(variable, friendlyLabel);
    }
  }, [field.name, onChange, getFriendlyVariableLabel, workflowNodes, saveLabelToCache]);

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

  const loadingPlaceholder = field.loadingPlaceholder || (field.label ? `Loading ${field.label}...` : 'Loading options...');
  const basePlaceholder = field.placeholder || (field.label ? `Select ${field.label}...` : 'Select an option...');
  const emptyPlaceholderText = (field as any).emptyPlaceholder || basePlaceholder;

  // Use dynamic placeholder: loading text, empty text when no options, or base placeholder
  // IMPORTANT: Only show loading placeholder if we DON'T have a saved value yet
  // This ensures saved values display instantly when reopening modals (Zapier-like UX)
  const hasDisplayableValue = !!(value || displayLabel);
  const placeholderText = field.dynamic && isLoading && !hasDisplayableValue
    ? loadingPlaceholder
    : (!isLoading && options.length === 0 && (field as any).emptyPlaceholder)
      ? emptyPlaceholderText
      : basePlaceholder;

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
      // IMPORTANT: If options loaded but our value isn't in them, keep the existing displayLabel
      // This prevents the label from disappearing when options reload for dependent fields
    } else if (!displayLabel) {
      // Only attempt to load from cache if we don't already have a displayLabel
      // This prevents clearing the label when options are temporarily empty during reload
      const cached = loadCachedLabel(String(value));
      if (cached) {
        setDisplayLabel(cached);
      }
    }
    // If we have a displayLabel and options are empty/loading, KEEP the existing displayLabel
    // Note: displayLabel is intentionally NOT in dependencies to avoid infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options, getFriendlyVariableLabel, workflowNodes, loadCachedLabel, saveLabelToCache]);

  // Load cached label immediately on mount for instant display
  React.useEffect(() => {
    if (value && !displayLabel && (typeof value === 'string' || typeof value === 'number')) {
      const cached = loadCachedLabel(String(value));
      if (cached) {
        setDisplayLabel(cached);
      }
    }
  }, []); // Run only once on mount

  // Auto-select single option for disabled fields (e.g., monetization eligibility status)
  React.useEffect(() => {
    // Only auto-select if:
    // 1. Field is disabled (status/info fields)
    // 2. There's exactly one option
    // 3. Value is not already set
    // 4. Not loading
    if (field.disabled && options.length === 1 && !value && !isLoading) {
      const singleOption = options[0];
      const optionValue = singleOption.value || singleOption.id;

      logger.debug('[GenericSelectField] Auto-selecting single option for disabled field:', {
        fieldName: field.name,
        optionValue,
        optionLabel: singleOption.label
      });

      onChange(optionValue);
    }
  }, [field.disabled, field.name, options, value, isLoading, onChange]);

  // If we still don't have a display label yet but a value exists, attempt to load cached label once
  React.useEffect(() => {
    if (!displayLabel && value) {
      const cached = loadCachedLabel(String(value));
      if (cached) {
        setDisplayLabel(cached);
      }
    }
  }, [displayLabel, value, loadCachedLabel]);
  
  // Check if dependency value has changed and reset load tracking if needed
  // This runs on every render but only updates state when the value actually changes
  React.useEffect(() => {
    if (field.dependsOn) {
      const currentValue = parentValues[field.dependsOn];
      const previousValue = lastDependencyValueRef.current;

      // Only reset if the VALUE actually changed (not just object reference)
      if (currentValue !== previousValue && currentValue !== undefined) {
        // Debug logging for searchField specifically
        if (field.name === 'searchField') {
          console.log('🔄 [GenericSelectField] searchField dependency VALUE changed, resetting load attempt:', {
            fieldDependsOn: field.dependsOn,
            currentValue: currentValue,
            previousValue: previousValue,
          });
        }
        lastDependencyValueRef.current = currentValue;
        setHasAttemptedLoad(false);
        setLastLoadTimestamp(0);
      }
    }
  }); // No dependency array - runs every render but only updates when value changes
  
  // Generic loading behavior
  const handleFieldOpen = (open: boolean) => {
    // Track open/close state transitions
    const wasOpen = isOpenRef.current;
    isOpenRef.current = open;

    // Only trigger load on transition from closed to open (not on every render while open)
    const isOpeningNow = open && !wasOpen;

    // COMPREHENSIVE LOGGING for selectedProperties to debug infinite loop
    if (field.name === 'selectedProperties') {
      console.log('🔍🔍🔍 [GenericSelectField] selectedProperties handleFieldOpen called:', {
        open,
        wasOpen,
        isOpeningNow,
        fieldName: field.name,
        fieldDynamic: field.dynamic,
        loadOnMount: field.loadOnMount,
        fieldDependsOn: field.dependsOn,
        hasOnDynamicLoad: !!onDynamicLoad,
        isLoading,
        optionsLength: options?.length || 0,
        hasAttemptedLoad,
        timeSinceLastLoad: Date.now() - lastLoadTimestamp,
        isLoadingRefCurrent: isLoadingRef.current,
        timestamp: new Date().toISOString()
      });
    }

    logger.debug('🔍 [GenericSelectField] handleFieldOpen called:', {
      open,
      wasOpen,
      isOpeningNow,
      fieldName: field.name,
      fieldDynamic: field.dynamic,
      fieldDependsOn: field.dependsOn,
      hasOnDynamicLoad: !!onDynamicLoad,
      isLoading,
      optionsLength: options?.length || 0,
      hasAttemptedLoad,
      timeSinceLastLoad: Date.now() - lastLoadTimestamp
    });

    // If not opening now (just a re-render while already open), skip
    if (!isOpeningNow) {
      if (field.name === 'searchField') {
        console.log('⏭️ [GenericSelectField] searchField not opening now:', { open, wasOpen, isOpeningNow });
      }
      return;
    }

    // Log when searchField is actually opening
    if (field.name === 'searchField') {
      console.log('🎯 [GenericSelectField] searchField IS OPENING NOW!', { open, wasOpen, isOpeningNow });
    }

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

    // CRITICAL FIX: Don't load loadOnMount fields when dropdown opens
    // These fields should only load once on mount via ConfigurationForm's loadOnMount useEffect
    // Loading them again on dropdown open causes infinite loops
    const isLoadOnMountField = field.loadOnMount === true

    // Only load if:
    // 1. Field is dynamic
    // 2. Not currently loading
    // 3. NOT a loadOnMount field (these are loaded by ConfigurationForm's useEffect)
    // 4. Not a loadOnMount field that already has data (avoid double loading)
    // 5. Either hasn't attempted to load, OR (has no options AND hasn't loaded recently)
    // 6. For special fields (Google Sheets sheetName, OneDrive fileId), also check if we haven't loaded recently
    const shouldLoad = field.dynamic && onDynamicLoad && !isLoading &&
                      !isLoadOnMountField &&
                      !isLoadOnMountWithData &&
                      (!hasAttemptedLoad || (!hasOptions && !recentlyLoaded)) &&
                      (!(isGoogleSheetsSheetName || isOneDriveFileId) || !recentlyLoaded)

    // Debug why searchField might not load
    if (field.name === 'searchField') {
      console.log('🔍 [GenericSelectField] searchField shouldLoad check:', {
        shouldLoad,
        dynamic: field.dynamic,
        hasOnDynamicLoad: !!onDynamicLoad,
        isLoading,
        isLoadOnMountField,
        isLoadOnMountWithData,
        hasAttemptedLoad,
        hasOptions,
        recentlyLoaded,
        optionsArray: options,
        processedOptionsLength: processedOptions.length
      });
    }

    // Debug for selectedProperties field specifically (HubSpot infinite loop fix)
    if (field.name === 'selectedProperties') {
      console.log('🎯🎯🎯 [GenericSelectField] selectedProperties shouldLoad check:', {
        shouldLoad,
        isLoadOnMountField,
        hasOptions,
        optionsCount: options?.length,
        loadOnMount: field.loadOnMount,
        dynamic: field.dynamic,
        hasOnDynamicLoad: !!onDynamicLoad,
        isLoading,
        isLoadOnMountWithData,
        hasAttemptedLoad,
        recentlyLoaded,
        timeSinceLastLoad: Date.now() - lastLoadTimestamp,
        timestamp: new Date().toISOString()
      });
    }

    if (shouldLoad) {
      // COMPREHENSIVE LOGGING for selectedProperties
      if (field.name === 'selectedProperties') {
        console.error('🚨🚨🚨 [GenericSelectField] selectedProperties WILL LOAD (THIS SHOULD NOT HAPPEN!):', {
          fieldName: field.name,
          loadOnMount: field.loadOnMount,
          shouldLoad,
          isLoadOnMountField,
          reason: 'This should be prevented by isLoadOnMountField check',
          timestamp: new Date().toISOString()
        });
      }
      // Prevent concurrent loads using ref
      if (isLoadingRef.current) {
        if (field.name === 'searchField') {
          console.log('⏸️ [GenericSelectField] searchField already loading, skipping');
        }
        return;
      }

      const forceRefresh = hasAttemptedLoad && !hasOptions // Only force refresh if we tried but got no options

      // Debug logging for searchField specifically
      if (field.name === 'searchField') {
        console.log('🚀🚀🚀 [GenericSelectField] LOADING searchField:', {
          dependsOn: field.dependsOn,
          dependsOnValue: dependencyValue,
          forceRefresh,
          hasAttemptedLoad,
          hasOptions,
          timeSinceLastLoad,
          recentlyLoaded,
          isLoadingRefCurrent: isLoadingRef.current
        });
      } else {
        logger.debug('🚀 [GenericSelectField] Triggering dynamic load for field:', field.name, 'with dependencies:', {
          dependsOn: field.dependsOn,
          dependsOnValue: dependencyValue,
          forceRefresh,
          timeSinceLastLoad,
          recentlyLoaded
        });
      }

      // Mark as loading
      isLoadingRef.current = true;
      setHasAttemptedLoad(true)
      setLastLoadTimestamp(Date.now())

      // Determine if we should load silently (when field already has a value)
      // This prevents showing "Loading..." placeholder when reopening saved configs
      const shouldLoadSilently = !!(value || displayLabel);

      // Trigger load and clear loading flag when done
      // Always create a promise so finally() is guaranteed to run
      let loadPromise: Promise<void>;

      if (field.dependsOn && dependencyValue) {
        loadPromise = cachedDynamicLoad(field.name, field.dependsOn, dependencyValue, forceRefresh, shouldLoadSilently);
      } else if (!field.dependsOn) {
        loadPromise = cachedDynamicLoad(field.name, undefined, undefined, forceRefresh, shouldLoadSilently);
      } else {
        // Dependency required but not provided - clear loading immediately
        isLoadingRef.current = false;
        if (field.name === 'searchField') {
          console.log('⚠️ [GenericSelectField] searchField dependency not met, clearing loading');
        }
        return;
      }

      // Always clear loading flag when done
      loadPromise.finally(() => {
        const endTime = performance.now();
        isLoadingRef.current = false;
        if (field.name === 'searchField') {
          console.log('✅ [GenericSelectField] searchField load complete, options:', {
            optionsCount: options?.length,
            processedOptionsCount: processedOptions.length,
            optionsSample: options?.slice(0, 3),
            isLoading
          });

          // Schedule a check to see when options actually appear in the UI
          requestAnimationFrame(() => {
            console.log(`🎨 [GenericSelectField] searchField RAF complete - UI should be painted`);
          });
        }
      }).catch((error) => {
        // Catch any errors to ensure finally runs
        logger.error('[GenericSelectField] Load error for field:', field.name, error);
      });
    } else if (field.name === 'searchField') {
      console.log('❌ [GenericSelectField] searchField NOT loading - shouldLoad is false');
    }
  };

  // Generic option processing - MEMOIZED to prevent re-processing on every render
  const processOptions = React.useCallback((opts: any[]) => {
    return opts.filter(opt => opt && (opt.value || opt.id));
  }, []);

  const processedOptions = React.useMemo(() => {
    const startTime = performance.now();
    const processed = processOptions(options);
    const duration = performance.now() - startTime;

    // For multi-select fields with arrays, add temporary options for ALL selected values
    // This ensures multi-select linked record fields ALWAYS show labels, never IDs
    if (Array.isArray(value) && value.length > 0 && field.name?.startsWith('airtable_field_')) {
      const labelMetadataKey = `${field.name}_labels`;
      const savedLabels = parentValues?.[labelMetadataKey] as Record<string, string> | undefined;

      value.forEach((val: any) => {
        if (val && !processed.some(opt => opt.value === val)) {
          const tempLabel = savedLabels?.[String(val)] || loadCachedLabel(String(val)) || String(val);
          processed.push({
            value: val,
            label: tempLabel,
            isTemporal: true // Mark as temporary so we know to replace it when real options load
          });
        }
      });
    }
    // If we have a saved single value but it's not in the options yet, add it as a temporary option
    // This allows fields to display their saved value immediately while options load in background
    // Only do this for primitive values (strings/numbers), not objects/arrays
    else if (value && !processed.some(opt => opt.value === value) && (typeof value === 'string' || typeof value === 'number')) {
      const tempLabel = displayLabel || loadCachedLabel(String(value)) || String(value);
      processed.unshift({
        value,
        label: tempLabel,
        isTemporal: true // Mark as temporary so we know to replace it when real options load
      });
    }

    // Debug logging for HubSpot listId field
    if (nodeInfo?.providerId === 'hubspot' && field.name === 'listId') {
      console.log('🟠 [GenericSelectField] listId processedOptions:', {
        fieldName: field.name,
        rawOptionsLength: options?.length,
        processedLength: processed.length,
        rawOptions: options,
        processed: processed
      });
    }

    // Log performance for searchField
    if (field.name === 'searchField') {
      console.log(`⚡ [GenericSelectField] searchField processOptions took ${duration.toFixed(2)}ms for ${processed.length} options`);
    }

    return processed;
  }, [options, processOptions, field.name, nodeInfo?.providerId, value, displayLabel, loadCachedLabel, parentValues]);

  // Track when options change for performance monitoring
  React.useEffect(() => {
    if (field.name === 'searchField' && processedOptions.length > 0) {
      console.log(`📊 [GenericSelectField] searchField options updated in React:`, {
        count: processedOptions.length,
        timestamp: Date.now(),
        sample: processedOptions.slice(0, 5).map(o => o.label)
      });
    }
  }, [processedOptions, field.name]);

  // Update displayLabel when parentValues labels are updated (for Airtable linked record fields)
  // This ensures we NEVER show IDs, always labels - even when labels load after initial render
  React.useEffect(() => {
    if (!value || !field.name?.startsWith('airtable_field_')) return;

    const labelMetadataKey = `${field.name}_labels`;
    const savedLabels = parentValues?.[labelMetadataKey] as Record<string, string> | undefined;
    if (savedLabels && savedLabels[String(value)]) {
      const newLabel = savedLabels[String(value)];
      if (newLabel !== displayLabel) {
        setDisplayLabel(newLabel);
        // Also save to localStorage cache for future reopens
        saveLabelToCache(String(value), newLabel);
      }
    }
  }, [value, field.name, parentValues, displayLabel, saveLabelToCache]);

  // If dynamic options were loaded elsewhere (e.g., auto-load), mark as attempted to prevent duplicate fetches on dropdown open
  React.useEffect(() => {
    if (!field.dynamic) return;
    if (processedOptions.length === 0) return;
    if (hasAttemptedLoad) return;

    setHasAttemptedLoad(true);
    setLastLoadTimestamp(Date.now());
  }, [field.dynamic, processedOptions.length, hasAttemptedLoad]);

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

  // Wrapped onChange with logging to track infinite loops
  const handleChangeWithLogging = React.useCallback((newValue: any) => {
    // COMPREHENSIVE LOGGING for selectedProperties
    if (field.name === 'selectedProperties') {
      console.log('📝📝📝 [GenericSelectField] selectedProperties onChange called:', {
        fieldName: field.name,
        oldValue: Array.isArray(value) ? value.length : value,
        newValue: Array.isArray(newValue) ? newValue.length : newValue,
        valueChanged: JSON.stringify(value) !== JSON.stringify(newValue),
        timestamp: new Date().toISOString(),
        stackTrace: new Error().stack?.split('\n').slice(0, 5).join('\n')
      });
    }

    onChange(newValue);
  }, [field.name, value, onChange])

  // Show loading state for dynamic fields
  // Show full LoadingFieldState for any dynamic field that's currently loading
  // This ensures a clean, consistent loading experience across all providers (Airtable, Gmail, etc.)
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
    return <LoadingFieldState message={loadingPlaceholder} />;
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

    // Hide badges for disabled/status fields (like monetization eligibility)
    const isDisabledStatusField = field.disabled &&
      (field.name?.toLowerCase().includes('status') ||
       field.name?.toLowerCase().includes('eligibility'));

    return (
      <div className="flex items-center gap-2">
        {isFromCache && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex-shrink-0">
                  <Zap className="h-3 w-3 text-yellow-500" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Loaded from cache</p>
              </TooltipContent>
            </Tooltip>
        )}
        <div className="flex-1 min-w-0">
          <MultiCombobox
            value={Array.isArray(value) ? value : (value ? [value] : [])}
            onChange={handleChangeWithLogging}
            options={processedOptions}
            placeholder={placeholderText}
            emptyPlaceholder={isLoading ? loadingPlaceholder : getEmptyMessage(field.name, field.label, (field as any).emptyMessage)}
            searchPlaceholder="Search options..."
            disabled={isLoading && !displayLabel && processedOptions.length === 0}
            loading={isLoading && !displayLabel && processedOptions.length === 0}
            creatable={(field as any).creatable || isAirtableRecordField} // Allow custom option creation for Airtable fields or if specified in field schema
            onOpenChange={handleFieldOpen}
            selectedValues={effectiveSelectedValues} // Pass selected values for checkmarks
            hideSelectedBadges={isAirtableLinkedField || isDisabledStatusField} // Hide badges for Airtable fields with bubbles and disabled status fields
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          />
        </div>
        {field.dynamic && onDynamicLoad && (
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
        )}
        {/* Only show SimpleVariablePicker for non-select fields
            Select fields use the Connect button instead (in FieldRenderer) */}
        {field.supportsVariables && workflowData && currentNodeId && field.type !== 'select' && (
          <SimpleVariablePicker
            workflowData={workflowData}
            currentNodeId={currentNodeId}
            onVariableSelect={handleVariableSelect}
            fieldType={field.type}
            currentNodeType={nodeInfo?.type}
          />
        )}
      </div>
    );
  }

  // Use Combobox for all select fields to support variables
  // Variables can be entered using {{variable_name}} syntax
  if (field.type === 'select' && !field.multiple) {
    return (
      <div className="flex items-center gap-2">
        {isFromCache && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex-shrink-0">
                  <Zap className="h-3 w-3 text-yellow-500" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Loaded from cache</p>
              </TooltipContent>
            </Tooltip>
        )}
        <div className="flex-1 min-w-0">
          <Combobox
            value={value ?? ""}
            onChange={(newValue) => {
              onChange(newValue);
              // Clear display label when value is cleared
              if (!newValue) {
                setDisplayLabel(null);
                // Also clear stored label
                onLabelStore?.(field.name, '', '');
              } else if (newValue.startsWith('{{') && newValue.endsWith('}}')) {
                // Set friendly label for variables
                const friendlyLabel = getFriendlyVariableLabel(newValue, workflowNodes);
                setDisplayLabel(friendlyLabel);
                if (friendlyLabel) {
                  saveLabelToCache(newValue, friendlyLabel);
                  // Store label in form values for instant display on reopen
                  onLabelStore?.(field.name, newValue, friendlyLabel);
                }
              } else {
                // For regular options, find the label and cache it immediately
                const option = processedOptions.find((opt: any) => {
                  const optValue = opt.value || opt.id;
                  return String(optValue) === String(newValue);
                });
                if (option) {
                  const label = typeof option.label === 'string' ? option.label : (option.name || option.value || option.id);
                  setDisplayLabel(label);
                  saveLabelToCache(String(newValue), label);
                  // Store label in form values for instant display on reopen
                  onLabelStore?.(field.name, String(newValue), label);
                }
              }
            }}
            options={processedOptions}
            placeholder={placeholderText}
            searchPlaceholder="Search options..."
            emptyPlaceholder={isLoading || isSearching ? loadingPlaceholder : ((field as any).emptyMessage || "No options found")}
            disabled={isLoading && !value && !displayLabel && processedOptions.length === 0}
            loading={(isLoading || isSearching) && !value && !displayLabel && processedOptions.length === 0}
            creatable={(field as any).creatable || isAirtableRecordField} // Allow custom option creation for Airtable fields or if specified in field schema
            onOpenChange={handleFieldOpen} // Add missing onOpenChange handler
            onSearchChange={handleSearchChange} // Handle debounced search
            selectedValues={effectiveSelectedValues} // Pass selected values for checkmarks
            displayLabel={displayLabel} // Pass the saved display label
            disableSearch={(field as any).disableSearch} // Support disabling search for simple dropdowns
            hideClearButton={(field as any).hideClearButton} // Support hiding clear button
            showColorPreview={(field as any).showColorPreview} // Show color preview balls if enabled
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          />
        </div>
        {field.dynamic && onDynamicLoad && (
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
        )}
        {/* Only show SimpleVariablePicker for non-select fields
            Select fields use the Connect button instead (in FieldRenderer) */}
        {field.supportsVariables && workflowData && currentNodeId && field.type !== 'select' && (
          <SimpleVariablePicker
            workflowData={workflowData}
            currentNodeId={currentNodeId}
            onVariableSelect={handleVariableSelect}
            fieldType={field.type}
            currentNodeType={nodeInfo?.type}
          />
        )}
      </div>
    );
  }

  // Default fallback: Use Combobox for all remaining select fields to support variables
  return (
    <div className="flex items-center gap-2">
      {isFromCache && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex-shrink-0">
                <Zap className="h-3 w-3 text-yellow-500" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Loaded from cache</p>
            </TooltipContent>
          </Tooltip>
      )}
      <div className="flex-1 min-w-0">
        <Combobox
          value={value ?? ""}
          onChange={(newValue) => {
            onChange(newValue);
            // Clear display label when value is cleared
            if (!newValue) {
              setDisplayLabel(null);
              // Also clear stored label
              onLabelStore?.(field.name, '', '');
            } else if (typeof newValue === 'string' && newValue.startsWith('{{') && newValue.endsWith('}}')) {
              // Set friendly label for variables
              const friendlyLabel = getFriendlyVariableLabel(newValue, workflowNodes);
              setDisplayLabel(friendlyLabel);
              if (friendlyLabel) {
                saveLabelToCache(newValue, friendlyLabel);
                // Store label in form values for instant display on reopen
                onLabelStore?.(field.name, newValue, friendlyLabel);
              }
            } else {
              // For regular options, find the label and cache it immediately
              const option = processedOptions.find((opt: any) => {
                const optValue = opt.value || opt.id;
                return String(optValue) === String(newValue);
              });
              if (option) {
                const label = typeof option.label === 'string' ? option.label : (option.name || option.value || option.id);
                setDisplayLabel(label);
                saveLabelToCache(String(newValue), label);
                // Store label in form values for instant display on reopen
                onLabelStore?.(field.name, String(newValue), label);
              }
            }
          }}
          options={processedOptions}
          placeholder={placeholderText}
          searchPlaceholder="Search options..."
          emptyPlaceholder={isLoading || isSearching ? loadingPlaceholder : getEmptyMessage(field.name, field.label, (field as any).emptyMessage)}
          disabled={isLoading && !value && !displayLabel && processedOptions.length === 0}
          loading={(isLoading || isSearching) && !value && !displayLabel && processedOptions.length === 0}
          creatable={(field as any).creatable || isAirtableRecordField} // Allow custom option creation for Airtable fields or if specified in field schema
          onOpenChange={handleFieldOpen}
          onSearchChange={handleSearchChange} // Handle debounced search
          selectedValues={effectiveSelectedValues}
          displayLabel={displayLabel}
          showColorPreview={(field as any).showColorPreview} // Show color preview balls if enabled
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        />
      </div>
      {field.dynamic && onDynamicLoad && (
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
      )}
    </div>
  );
}
