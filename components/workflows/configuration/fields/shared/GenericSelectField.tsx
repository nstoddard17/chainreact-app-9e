"use client"

import React from "react";
import { Combobox, MultiCombobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { Bot, X, RefreshCw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { parseVariableReference } from "@/lib/workflows/variableReferences";

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
  // Cache store - must be at top level
  const { get: getCache, set: setCache, invalidate: invalidateCache } = useConfigCacheStore()

  // All hooks must be at the top level before any conditional returns
  // Store the display label for the selected value
  const [displayLabel, setDisplayLabel] = React.useState<string | null>(null);
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

  // Cached dynamic load wrapper - checks cache before calling onDynamicLoad
  const cachedDynamicLoad = React.useCallback(async (
    fieldName: string,
    dependsOn?: string,
    dependsOnValue?: any,
    forceRefresh = false
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
    await onDynamicLoad(fieldName, dependsOn, dependsOnValue, forceRefresh)

    // Note: We don't cache here because we don't have direct access to the options
    // The parent component (ConfigurationModal) will need to handle caching after receiving data
  }, [nodeInfo, onDynamicLoad, getCache, invalidateCache])

  // Refresh handler - must be at top level before any conditional returns
  const handleRefresh = React.useCallback(async () => {
    if (!field.dynamic || !onDynamicLoad || isRefreshing) return;

    setIsRefreshing(true);
    try {
      const dependencyValue = field.dependsOn ? parentValues[field.dependsOn] : undefined;
      if (field.dependsOn && dependencyValue) {
        await cachedDynamicLoad(field.name, field.dependsOn, dependencyValue, true);
      } else if (!field.dependsOn) {
        await cachedDynamicLoad(field.name, undefined, undefined, true);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [field.dynamic, field.name, field.dependsOn, parentValues, cachedDynamicLoad, isRefreshing]);

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

  const loadingPlaceholder = field.loadingPlaceholder || (field.label ? `Loading ${field.label}...` : 'Loading options...');
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

    // Only load if:
    // 1. Field is dynamic
    // 2. Not currently loading
    // 3. Not a loadOnMount field that already has data (avoid double loading)
    // 4. Either hasn't attempted to load, OR (has no options AND hasn't loaded recently)
    // 5. For special fields (Google Sheets sheetName, OneDrive fileId), also check if we haven't loaded recently
    const shouldLoad = field.dynamic && onDynamicLoad && !isLoading &&
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
        isLoadOnMountWithData,
        hasAttemptedLoad,
        hasOptions,
        recentlyLoaded,
        optionsArray: options,
        processedOptionsLength: processedOptions.length
      });
    }

    if (shouldLoad) {
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

      // Trigger load and clear loading flag when done
      // Always create a promise so finally() is guaranteed to run
      let loadPromise: Promise<void>;

      if (field.dependsOn && dependencyValue) {
        loadPromise = cachedDynamicLoad(field.name, field.dependsOn, dependencyValue, forceRefresh);
      } else if (!field.dependsOn) {
        loadPromise = cachedDynamicLoad(field.name, undefined, undefined, forceRefresh);
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

    // Log performance for searchField
    if (field.name === 'searchField') {
      console.log(`⚡ [GenericSelectField] searchField processOptions took ${duration.toFixed(2)}ms for ${processed.length} options`);
    }

    return processed;
  }, [options, processOptions, field.name]);

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

    return (
      <div className="flex items-center gap-2">
        {isFromCache && (
          <TooltipProvider>
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
          </TooltipProvider>
        )}
        <div className="flex-1">
          <MultiCombobox
            value={Array.isArray(value) ? value : (value ? [value] : [])}
            onChange={onChange}
            options={processedOptions}
            placeholder={placeholderText}
            emptyPlaceholder={isLoading ? loadingPlaceholder : "No options available"}
            searchPlaceholder="Search options..."
            disabled={isLoading}
            loading={isLoading}
            creatable={field.dynamic ? false : true} // Never allow creating new options for dynamic fields (they load from existing data), but allow variables for static fields
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
        {isFromCache && (
          <TooltipProvider>
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
          </TooltipProvider>
        )}
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
            disabled={isLoading}
            loading={isLoading}
            creatable={field.dynamic ? false : true} // Never allow creating new options for dynamic fields (they load from existing data), but allow variables for static fields
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
      {isFromCache && (
        <TooltipProvider>
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
        </TooltipProvider>
      )}
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
          disabled={isLoading}
          loading={isLoading}
          creatable={field.dynamic ? false : true} // Never allow creating new options for dynamic fields (they load from existing data), but allow variables for static fields
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
