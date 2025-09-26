"use client"

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Settings } from 'lucide-react';
import { useDynamicOptions } from './hooks/useDynamicOptions';
import { useFieldChangeHandler } from './hooks/useFieldChangeHandler';
import { useIntegrationStore } from '@/stores/integrationStore';
import { useWorkflowStore } from '@/stores/workflowStore';
import { ConfigurationLoadingScreen } from '@/components/ui/loading-screen';
// import { saveNodeConfig } from '@/lib/workflows/configPersistence'; // Removed - was causing slow saves

// Provider-specific components
import { DiscordConfiguration } from './providers/DiscordConfiguration';
import { AirtableConfiguration } from './providers/AirtableConfiguration';
import { GoogleSheetsConfiguration } from './providers/GoogleSheetsConfiguration';
import { TwitterConfiguration } from './providers/TwitterConfiguration';
import { GmailConfiguration } from './providers/GmailConfiguration';
import { SlackConfiguration } from './providers/SlackConfiguration';
import { NotionConfiguration } from './providers/NotionConfiguration';
import { TrelloConfiguration } from './providers/TrelloConfiguration';
import { HubSpotConfiguration } from './providers/HubSpotConfiguration';
import { StripeConfiguration } from './providers/StripeConfiguration';
import { TeamsConfiguration } from './providers/TeamsConfiguration';
import { OutlookConfiguration } from './providers/OutlookConfiguration';
import { OneDriveConfiguration } from './providers/OneDriveConfiguration';
import { OneNoteConfiguration } from './providers/OneNoteConfiguration';
import { GoogleCalendarConfiguration } from './providers/GoogleCalendarConfiguration';
import { GoogleDriveConfiguration } from './providers/GoogleDriveConfiguration';
import { GoogleDocsConfiguration } from './providers/GoogleDocsConfiguration';
import { FacebookConfiguration } from './providers/FacebookConfiguration';
import { LinkedInConfiguration } from './providers/LinkedInConfiguration';
import { InstagramConfiguration } from './providers/InstagramConfiguration';
import { ShopifyConfiguration } from './providers/ShopifyConfiguration';
import { DropboxConfiguration } from './providers/DropboxConfiguration';
import { YouTubeConfiguration } from './providers/YouTubeConfiguration';
import { YouTubeStudioConfiguration } from './providers/YouTubeStudioConfiguration';
import { BoxConfiguration } from './providers/BoxConfiguration';
import { GitHubConfiguration } from './providers/GitHubConfiguration';
import { PayPalConfiguration } from './providers/PayPalConfiguration';
import { TikTokConfiguration } from './providers/TikTokConfiguration';
import { GenericConfiguration } from './providers/GenericConfiguration';
import { GmailFetchConfiguration } from './providers/gmail/GmailFetchConfiguration';
import { ScheduleConfiguration } from './providers/ScheduleConfiguration';
import { IfThenConfiguration } from './providers/IfThenConfiguration';

interface ConfigurationFormProps {
  nodeInfo: any;
  initialData?: Record<string, any>;
  onSave: (data: Record<string, any>) => void;
  onCancel: () => void;
  onBack?: () => void;
  isEditMode?: boolean;
  workflowData?: any;
  currentNodeId?: string;
  onLoadingChange?: (isLoading: boolean) => void;
  getFormValues?: () => Record<string, any>;
  integrationName?: string;
  isConnectedToAIAgent?: boolean;
}

function ConfigurationForm({
  nodeInfo,
  initialData = {},
  onSave,
  onCancel,
  onBack,
  isEditMode = false,
  workflowData,
  currentNodeId,
  onLoadingChange,
  getFormValues,
  integrationName: integrationNameProp,
  isConnectedToAIAgent
}: ConfigurationFormProps) {
  // FIRST: All hooks must be called before any conditional returns
  
  // Common state and hooks
  const [values, setValues] = useState<Record<string, any>>(() => {
    // Extract real config values, excluding the __dynamicOptions key
    const { __dynamicOptions, ...configValues } = initialData || {};
    console.log('🔄 [ConfigForm] Initializing values with initialData:', {
      nodeType: nodeInfo?.type,
      currentNodeId,
      initialData: configValues,
      hasGuildId: !!configValues?.guildId,
      hasChannelId: !!initialData?.channelId,
      hasMessage: !!initialData?.message
    });
    return configValues || {};
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  // Initialize AI fields based on initial data containing AI placeholders or _allFieldsAI flag
  const [aiFields, setAiFields] = useState<Record<string, boolean>>(() => {
    const fields: Record<string, boolean> = {};
    if (initialData) {
      // Check if _allFieldsAI flag is set (for AI-generated workflows)
      if (initialData._allFieldsAI === true) {
        // Set all fields to AI mode by default (will be populated when fields are known)
        fields._allFieldsAI = true;
      } else {
        // Check individual fields for AI placeholders
        Object.entries(initialData).forEach(([key, value]) => {
          if (typeof value === 'string' && value.startsWith('{{AI_FIELD:')) {
            fields[key] = true;
          }
        });
      }
    }
    return fields;
  });
  const [loadingFields, setLoadingFields] = useState<Set<string>>(new Set());
  
  // Provider-specific state
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [showPreviewData, setShowPreviewData] = useState(false);
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [googleSheetsSortField, setGoogleSheetsSortField] = useState<string | null>(null);
  const [googleSheetsSortDirection, setGoogleSheetsSortDirection] = useState<'asc' | 'desc'>('asc');
  const [googleSheetsSelectedRows, setGoogleSheetsSelectedRows] = useState<Set<string>>(new Set());
  const [airtableRecords, setAirtableRecords] = useState<any[]>([]);
  const [airtableTableSchema, setAirtableTableSchema] = useState<any>(null);
  
  const { getIntegrationByProvider, connectIntegration, fetchIntegrations } = useIntegrationStore();
  const { currentWorkflow } = useWorkflowStore();

  // Extract provider and node type (safe even if nodeInfo is null)
  const provider = nodeInfo?.providerId;
  const nodeType = nodeInfo?.type;
  
  // Check integration connection
  const integration = provider ? getIntegrationByProvider(provider) : null;
  const needsConnection = provider && provider !== 'logic' && provider !== 'ai' && (!integration || integration?.status === 'needs_reauthorization');
  const integrationName = integrationNameProp || nodeInfo?.label?.split(' ')[0] || provider;

  // Debug logging for HubSpot
  if (provider === 'hubspot') {
    console.log('🎯 [ConfigForm] HubSpot integration check:', {
      provider,
      integration,
      status: integration?.status,
      needsConnection,
      integrationName
    });
  }

  // Extract saved dynamic options from initialData if present
  const savedDynamicOptions = initialData?.__dynamicOptions;

  // Ensure Google providers appear connected by fetching integrations if store hasn't resolved yet
  const hasRequestedIntegrationsRef = useRef(false);
  useEffect(() => {
    if (!provider) return;
    const isGoogleProvider = provider === 'google-sheets' || provider === 'google_drive' || provider === 'google-drive' || provider === 'google-docs' || provider === 'google_calendar' || provider === 'google-calendar' || provider === 'google' || provider === 'gmail';
    if (isGoogleProvider && !integration && !hasRequestedIntegrationsRef.current) {
      hasRequestedIntegrationsRef.current = true;
      // Non-forced fetch to avoid wiping cache mid-UI, just ensure the store has data
      try { fetchIntegrations(false); } catch {}
    }
  }, [provider, integration, fetchIntegrations]);

  // Dynamic options hook
  const {
    dynamicOptions,
    loading: loadingDynamic,
    isInitialLoading: isLoadingDynamicOptions,
    loadOptions,
    resetOptions
  } = useDynamicOptions({
    nodeType: nodeInfo?.type,
    providerId: nodeInfo?.providerId || provider,
    onLoadingChange: (fieldName: string, isLoading: boolean) => {
      console.log(`🔧 [ConfigForm] onLoadingChange called:`, { fieldName, isLoading });

      setLoadingFields(prev => {
        const newSet = new Set(prev);
        if (isLoading) {
          console.log(`➕ [ConfigForm] Adding ${fieldName} to loadingFields`);
          newSet.add(fieldName);

          // Set a timeout to clear loading state after 10 seconds to prevent infinite loading
          setTimeout(() => {
            console.log(`⏱️ [ConfigForm] Timeout reached for ${fieldName}, clearing loading state`);
            setLoadingFields(prevFields => {
              const updatedSet = new Set(prevFields);
              if (updatedSet.has(fieldName)) {
                console.log(`🧹 [ConfigForm] Force clearing ${fieldName} from loadingFields due to timeout`);
                updatedSet.delete(fieldName);
              }
              return updatedSet;
            });
          }, 10000);
        } else {
          console.log(`➖ [ConfigForm] Removing ${fieldName} from loadingFields`);
          newSet.delete(fieldName);
        }
        console.log(`📊 [ConfigForm] LoadingFields after update:`, Array.from(newSet));
        return newSet;
      });

      // Call the parent onLoadingChange if it exists
      if (onLoadingChange) {
        // Need to check the new size after the state update
        setLoadingFields(prev => {
          onLoadingChange(prev.size > 0);
          return prev;
        });
      }
    },
    getFormValues: () => values,
    initialOptions: savedDynamicOptions
  });

  // Base value setter (without provider logic)
  const setValueBase = useCallback((field: string, value: any) => {
    setValues(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear error for this field
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  }, []);

  // Ref to track which fields have already loaded options to prevent infinite loops
  const loadedFieldsWithValues = useRef<Set<string>>(new Set());

  // Consolidated field change handler hook
  const { handleFieldChange } = useFieldChangeHandler({
    nodeInfo,
    values,
    setValue: setValueBase,
    loadOptions,
    setLoadingFields,
    resetOptions,
    dynamicOptions,
    discordState: undefined, // TODO: Add Discord state if needed
    setSelectedRecord,
    setPreviewData,
    setShowPreviewData,
    setTableSearchQuery,
    setGoogleSheetsSortField,
    setGoogleSheetsSortDirection,
    setGoogleSheetsSelectedRows,
    setAirtableRecords,
    setAirtableTableSchema,
    currentNodeId,
    selectedRecord,
    loadedFieldsWithValues // Pass the tracking ref
  });

  // Use the consolidated handler as setValue (except for Discord which uses setValueBase directly)
  const setValue = handleFieldChange;

  // NOW we can do the conditional return (after all hooks)
  if (!nodeInfo) {
    console.log('⚠️ [ConfigForm] No nodeInfo provided');
    return (
      <div className="flex items-center justify-center h-32 text-slate-500">
        <div className="text-center">
          <Settings className="h-8 w-8 mx-auto mb-2 text-slate-400" />
          <p>No configuration available for this node.</p>
        </div>
      </div>
    );
  }

  console.log('🔍 [ConfigForm] Provider routing:', {
    provider,
    nodeType,
    hasConfigSchema: !!nodeInfo.configSchema,
    schemaLength: nodeInfo.configSchema?.length || 0
  });

  // Initialize values from initial data or defaults
  useEffect(() => {
    if (!nodeInfo?.configSchema) return;
    
    console.log('🔄 [ConfigForm] Initializing form values:', {
      nodeType: nodeInfo?.type,
      initialData,
      hasInitialData: !!initialData && Object.keys(initialData).length > 0,
      initialDataKeys: initialData ? Object.keys(initialData) : []
    });
    
    const initialValues: Record<string, any> = {};
    
    // Set initial data first
    if (initialData && Object.keys(initialData).length > 0) {
      // Check if _allFieldsAI is set (for AI-generated workflows)
      const allFieldsAI = initialData._allFieldsAI === true;
      
      Object.entries(initialData).forEach(([key, value]) => {
        if (key === '_allFieldsAI') {
          // Don't include the flag itself in values
          return;
        }
        if (value !== undefined) {
          initialValues[key] = value;
        }
      });
      
      // If _allFieldsAI is set, initialize all fields with AI placeholders
      if (allFieldsAI) {
        nodeInfo.configSchema.forEach((field: any) => {
          // Don't set AI placeholders for non-editable fields
          if (!field.computed && !field.autoNumber && !field.formula && !field.readOnly) {
            if (initialValues[field.name] === undefined || initialValues[field.name] === '') {
              initialValues[field.name] = `{{AI_FIELD:${field.name}}}`;
            }
          }
        });
      }
    }
    
    // Set defaults for missing fields (only if not using AI for all fields)
    if (!initialData?._allFieldsAI) {
      nodeInfo.configSchema.forEach((field: any) => {
        if (field.defaultValue !== undefined && initialValues[field.name] === undefined) {
          initialValues[field.name] = field.defaultValue;
        }
      });
    }
    
    console.log('🔄 [ConfigForm] Setting form values to:', initialValues);
    setValues(initialValues);
    setIsInitialLoading(false);
  }, [nodeInfo, initialData]);
  
  // Track if we've already loaded on mount to prevent duplicate calls
  const hasLoadedOnMount = useRef(false);
  const previousNodeKeyRef = useRef<string | null>(null);

  // Ensure integrations are loaded on mount - WITH DEBOUNCE
  useEffect(() => {
    const componentId = Math.random().toString(36).substr(2, 9);
    console.log('🚨 [ConfigForm] MOUNT EFFECT RUNNING', {
      nodeType: nodeInfo?.type,
      providerId: nodeInfo?.providerId,
      timestamp: new Date().toISOString(),
      componentId
    });

    let mounted = true;
    let timeoutId: NodeJS.Timeout;

    // Don't reset the flag here - it's handled in the nodeInfo change effect
    // hasLoadedOnMount.current = false;

    // Clear options for Dropbox path field on mount to ensure fresh load
    if (nodeInfo?.providerId === 'dropbox' && resetOptions) {
      console.log('🧹 [ConfigForm] Clearing Dropbox path options on mount');
      resetOptions('path');
    }

    // Clear options for Trello board field on mount to ensure fresh load
    // This is critical after workflow execution that may have created new boards
    if (nodeInfo?.providerId === 'trello' && resetOptions) {
      console.log('🧹 [ConfigForm] Clearing Trello board options on mount to ensure fresh data');
      resetOptions('boardId');
    }

    // Skip integration fetch for providers that don't need it or already have their integration loaded
    // Check if we already have the integration for this provider
    const existingIntegration = getIntegrationByProvider(nodeInfo?.providerId || '');
    const skipIntegrationFetch = nodeInfo?.providerId === 'logic' ||
                                 nodeInfo?.providerId === 'core' ||
                                 nodeInfo?.providerId === 'manual' ||
                                 nodeInfo?.providerId === 'schedule' ||
                                 nodeInfo?.providerId === 'webhook' ||
                                 (existingIntegration && existingIntegration.status === 'connected');

    if (skipIntegrationFetch) {
      console.log('⏭️ [ConfigForm] Skipping integration fetch', {
        provider: nodeInfo?.providerId,
        hasExistingIntegration: !!existingIntegration,
        isConnected: existingIntegration?.status === 'connected'
      });
      return;
    }

    // Debounce the integration fetch - wait 500ms to see if component stays mounted
    const loadIntegrations = async () => {
      // Wait a bit to see if component stays mounted
      timeoutId = setTimeout(async () => {
        if (mounted) {
          console.log('🔄 [ConfigForm] Component stayed mounted, loading integrations', { componentId });
          await fetchIntegrations(); // Regular fetch - concurrent calls are now handled properly
        } else {
          console.log('⏭️ [ConfigForm] Component unmounted quickly, skipping integration fetch', { componentId });
        }
      }, 500); // Wait 500ms before fetching
    };

    loadIntegrations();

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      console.log('🚨 [ConfigForm] UNMOUNT EFFECT CLEANUP', {
        nodeType: nodeInfo?.type,
        timestamp: new Date().toISOString(),
        componentId
      });
    };
  }, []); // Empty deps - cleanup only runs on unmount

  // Reset hasLoadedOnMount and clear options when modal opens (nodeInfo changes)
  useEffect(() => {
    // Store the previous node ID to check if we're opening the same node
    const prevNodeKey = `${nodeInfo?.id}-${nodeInfo?.type}`;
    const isNewNode = prevNodeKey !== previousNodeKeyRef.current;

    if (isNewNode) {
      hasLoadedOnMount.current = false;
      loadedFieldsWithValues.current.clear(); // Clear the tracked loaded fields
      console.log('🔄 [ConfigForm] Reset hasLoadedOnMount flag - NEW node opened', {
        nodeId: nodeInfo?.id,
        nodeType: nodeInfo?.type,
        currentNodeId,
        previousKey: previousNodeKeyRef.current,
        newKey: prevNodeKey
      });
      previousNodeKeyRef.current = prevNodeKey;
    } else {
      console.log('🔄 [ConfigForm] Same node reopened - keeping cache', {
        nodeId: nodeInfo?.id,
        nodeType: nodeInfo?.type
      });
    }

    // Only clear specific fields that need fresh data on each modal open
    // For Trello, always clear boards to get fresh data
    if (nodeInfo?.providerId === 'trello' && isNewNode) {
      console.log('🔄 [ConfigForm] Clearing Trello board cache on modal reopen');
      resetOptions('boardId');
    }

    // For Airtable, don't reset bases as they rarely change
    // Only reset if it's a completely different node
    if (nodeInfo?.providerId === 'airtable') {
      console.log('🔄 [ConfigForm] Airtable node - skipping base reset to prevent constant reloading');
      // Don't reset baseId - let it use cached values
    } else if (nodeInfo?.configSchema && isNewNode) {
      // For other providers, reset loadOnMount fields only if it's a new node
      nodeInfo.configSchema.forEach((field: any) => {
        if (field.loadOnMount && field.dynamic) {
          console.log(`🔄 [ConfigForm] Resetting options for field: ${field.name}`);
          resetOptions(field.name);
        }
      });
    }
  }, [nodeInfo?.id, nodeInfo?.type, currentNodeId, resetOptions]); // Also track nodeType and currentNodeId

  // Load fields marked with loadOnMount immediately when form opens
  useEffect(() => {
    if (!nodeInfo?.configSchema || isInitialLoading) return;

    // Check if we've already loaded for this specific node instance
    // Use a combination of nodeId, nodeType, and currentNodeId to ensure uniqueness
    const nodeInstanceKey = `${nodeInfo?.id}-${nodeInfo?.type}-${currentNodeId}`;

    console.log('🚀 [ConfigForm] Checking for loadOnMount fields...', {
      nodeInstanceKey,
      hasLoadedOnMount: hasLoadedOnMount.current,
      isInitialLoading,
      hasBoardIdValue: !!values.boardId
    });

    // Find fields that should load on mount
    const fieldsToLoad = nodeInfo.configSchema.filter((field: any) => {
      // Skip dynamic_fields type - they handle their own data loading
      if (field.type === 'dynamic_fields') return false;

      // Check if field should load on mount
      if (field.loadOnMount === true && field.dynamic) {
        // Only load if we haven't loaded this node's fields yet
        // Don't check dynamicOptions or values here as it causes dependency issues
        const shouldLoad = !hasLoadedOnMount.current;

        console.log(`🔄 [ConfigForm] Field ${field.name} has loadOnMount, shouldLoad: ${shouldLoad}`);
        return shouldLoad;
      }
      return false;
    });

    if (fieldsToLoad.length > 0) {
      console.log('🚀 [ConfigForm] Loading fields on mount:', fieldsToLoad.map((f: any) => f.name));
      hasLoadedOnMount.current = true; // Mark that we've loaded

      // Load immediately for boardId if it has a saved value (no delay)
      const boardIdField = fieldsToLoad.find((f: any) => f.name === 'boardId');
      if (boardIdField && values.boardId) {
        console.log(`🚀 [ConfigForm] Loading boardId immediately since it has a saved value`);
        loadOptions('boardId', undefined, undefined, true); // Force refresh immediately
      }

      // Load immediately for Airtable baseId (no delay, use cache)
      const baseIdField = fieldsToLoad.find((f: any) => f.name === 'baseId');
      if (baseIdField && nodeInfo?.providerId === 'airtable') {
        console.log(`🚀 [ConfigForm] Loading Airtable baseId immediately with cache`);
        loadOptions('baseId', undefined, undefined, false); // Don't force refresh - use cache
      }

      // Load immediately for Google Calendar fields
      const calendarIdField = fieldsToLoad.find((f: any) => f.name === 'calendarId');
      if (calendarIdField && nodeInfo?.providerId === 'google-calendar') {
        console.log(`🚀 [ConfigForm] Loading Google Calendar calendarId immediately`);
        loadOptions('calendarId', undefined, undefined, false); // Use cache for better performance
      }

      const calendarsField = fieldsToLoad.find((f: any) => f.name === 'calendars');
      if (calendarsField && nodeInfo?.providerId === 'google-calendar') {
        console.log(`🚀 [ConfigForm] Loading Google Calendar calendars immediately`);
        loadOptions('calendars', undefined, undefined, false);
      }

      // Load immediately for Google Sheets spreadsheetId
      const spreadsheetIdField = fieldsToLoad.find((f: any) => f.name === 'spreadsheetId');
      if (spreadsheetIdField && nodeInfo?.providerId === 'google-sheets') {
        console.log(`🚀 [ConfigForm] Loading Google Sheets spreadsheetId immediately with cache`);
        loadOptions('spreadsheetId', undefined, undefined, false); // Use cache for better performance
      }

      // Add a small delay for other fields to ensure options are cleared first
      const timeoutId = setTimeout(() => {
        // Load each field marked with loadOnMount (except boardId and Airtable baseId if already loaded above)
        fieldsToLoad.forEach((field: any) => {
          if (field.name === 'boardId' && values.boardId) {
            // Already loaded above
            return;
          }
          if (field.name === 'baseId' && nodeInfo?.providerId === 'airtable') {
            // Already loaded above with cache
            return;
          }
          if (field.name === 'calendarId' && nodeInfo?.providerId === 'google-calendar') {
            // Already loaded above
            return;
          }
          if (field.name === 'calendars' && nodeInfo?.providerId === 'google-calendar') {
            // Already loaded above
            return;
          }
          if (field.name === 'spreadsheetId' && nodeInfo?.providerId === 'google-sheets') {
            // Already loaded above
            return;
          }
          console.log(`🔄 [ConfigForm] Auto-loading field: ${field.name}`);
          // Ensure Google Drive folders force-load on mount to avoid stale cache
          // BUT only if we don't have saved options for it already
          if (nodeInfo?.providerId === 'google-drive' && field.name === 'folderId') {
            // Check if we already have saved options for this field
            const hasSavedOptions = dynamicOptions['folderId'] && dynamicOptions['folderId'].length > 0;
            const savedValue = values['folderId'];

            // Check if saved value exists in current options
            let valueExistsInOptions = false;
            if (hasSavedOptions && savedValue) {
              valueExistsInOptions = dynamicOptions['folderId'].some((opt: any) =>
                (opt.value === savedValue) || (opt.id === savedValue)
              );
            }

            // Only force refresh if no saved options exist OR if saved value is not in options
            const shouldForceRefresh = !hasSavedOptions || (savedValue && !valueExistsInOptions);
            console.log(`🔍 [ConfigForm] Google Drive folderId check:`, {
              hasSavedOptions,
              savedValue,
              valueExistsInOptions,
              shouldForceRefresh
            });
            loadOptions('folderId', undefined, undefined, shouldForceRefresh);
            return;
          }
          // Only force refresh for specific fields that need it (like Trello boards)
          // Don't force refresh for Airtable bases as they don't change frequently
          // Explicitly prevent force refresh for Airtable baseId to avoid constant reloading
          const forceRefresh = field.name === 'boardId' && nodeInfo?.providerId !== 'airtable';

          // For Airtable baseId, use cached data if available
          if (field.name === 'baseId' && nodeInfo?.providerId === 'airtable') {
            console.log('🔄 [ConfigForm] Loading Airtable baseId with cache (no force refresh)');
            loadOptions('baseId', undefined, undefined, false);
          } else {
            loadOptions(field.name, undefined, undefined, forceRefresh);
          }
        });
      }, 150); // Slightly longer delay to ensure reset has completed

      return () => clearTimeout(timeoutId);
    }
  }, [nodeInfo?.id, nodeInfo?.type, currentNodeId, isInitialLoading, loadOptions]); // Track node identity changes - removed values.boardId to prevent re-runs

  // Load options for dynamic fields with saved values
  useEffect(() => {
    if (!nodeInfo?.configSchema || isInitialLoading) return;

    console.log('🔍 [ConfigForm] Checking for dynamic fields with saved values...', {
      nodeType: nodeInfo?.type,
      providerId: nodeInfo?.providerId,
      hasValues: Object.keys(values).length > 0
    });

    // Find dynamic fields that have saved values
    const fieldsWithValues = nodeInfo.configSchema.filter((field: any) => {
      // Check if it's a dynamic field
      if (!field.dynamic) return false;

      // Skip dynamic_fields type - they handle their own data loading
      if (field.type === 'dynamic_fields') return false;

      // Skip fields that have loadOnMount (they're handled by another useEffect)
      if (field.loadOnMount) return false;

      // Check if it has a saved value
      const savedValue = values[field.name];
      if (!savedValue) return false;

      // Skip if we've already loaded options for this field
      if (loadedFieldsWithValues.current.has(field.name)) {
        return false;
      }

      // Check if options are already loaded
      const fieldOptions = dynamicOptions[field.name];
      const hasOptions = fieldOptions && Array.isArray(fieldOptions) && fieldOptions.length > 0;

      // Special handling for Trello Move Card - always load cardId and listId if boardId is set
      if (nodeInfo?.type === 'trello_action_move_card' && values.boardId) {
        if (field.name === 'cardId' || field.name === 'listId') {
          // Always load these fields if we have a boardId and a saved value
          console.log(`🎯 [ConfigForm] Trello Move Card - field ${field.name} has saved value: ${savedValue}, hasOptions: ${hasOptions}`);
          // Load if no options or if saved value not in options
          if (!hasOptions) {
            return true;
          }
          // Check if saved value exists in options
          const valueExists = fieldOptions.some((opt: any) =>
            (opt.value === savedValue) || (opt.id === savedValue)
          );
          if (!valueExists) {
            console.log(`🎯 [ConfigForm] Saved value ${savedValue} not found in options for ${field.name}, need to reload`);
            return true;
          }
        }
      }

      // Special handling for Notion page field
      if (nodeInfo?.providerId === 'notion' && field.name === 'page' && values.workspace) {
        console.log(`🎯 [ConfigForm] Notion page field - saved value: ${savedValue}, hasOptions: ${hasOptions}`);
        // Always load pages if we have a workspace and a saved page value
        if (!hasOptions) {
          return true;
        }
        // Check if saved value exists in options
        const valueExists = fieldOptions.some((opt: any) =>
          (opt.value === savedValue) || (opt.id === savedValue)
        );
        if (!valueExists) {
          console.log(`🎯 [ConfigForm] Saved page ${savedValue} not found in options, need to reload`);
          return true;
        }
        return false; // Page is already in options
      }

      // Always load for dependent fields if parent has value, even if options exist
      // This ensures the saved value displays correctly
      if (field.dependsOn && values[field.dependsOn]) {
        // For dependent fields, check if the saved value exists in current options
        if (hasOptions) {
          // Handle multi-select fields (saved value is an array)
          if (Array.isArray(savedValue)) {
            // Check if all saved values exist in options
            const allValuesExist = savedValue.every(val =>
              fieldOptions.some((opt: any) =>
                (opt.value === val) || (opt.id === val) || (opt === val)
              )
            );
            // If any value doesn't exist in options, we need to reload
            return !allValuesExist;
          } else {
            // Single value field
            const valueExists = fieldOptions.some((opt: any) =>
              (opt.value === savedValue) || (opt.id === savedValue) || (opt === savedValue)
            );
            // If value doesn't exist in options, we need to reload
            return !valueExists;
          }
        }
        return true; // No options yet, need to load
      }

      // Only load if we have a value but no options yet
      return !hasOptions;
    });

    if (fieldsWithValues.length > 0) {
      console.log('🚀 [ConfigForm] Loading options for fields with saved values:',
        fieldsWithValues.map((f: any) => ({ name: f.name, value: values[f.name], dependsOn: f.dependsOn }))
      );

      // Load options for each field with a saved value
      fieldsWithValues.forEach(async (field: any) => {
        // Mark this field as loaded to prevent duplicate loads
        loadedFieldsWithValues.current.add(field.name);

        console.log(`🔄 [ConfigForm] Background loading options for field: ${field.name} (saved value: ${values[field.name]})`);

        try {
          // Check if field has dependencies
          if (field.dependsOn) {
            const dependsOnValue = values[field.dependsOn];
            if (dependsOnValue) {
              console.log(`  -> Loading with dependency: ${field.dependsOn} = ${dependsOnValue}`);
              await loadOptions(field.name, field.dependsOn, dependsOnValue);
            }
          } else {
            // No dependencies, just load the field
            await loadOptions(field.name);
          }
        } catch (error) {
          console.error(`❌ [ConfigForm] Error loading options for ${field.name}:`, error);
          // Make sure to clear loading state even on error
          setLoadingFields(prev => {
            const newSet = new Set(prev);
            newSet.delete(field.name);
            return newSet;
          });
        }
      });
    }
  }, [nodeInfo, isInitialLoading, values, dynamicOptions, loadOptions]);

  // Load dynamic fields when their dependencies are satisfied
  useEffect(() => {
    if (!nodeInfo?.configSchema || isInitialLoading) return;
    
    // Special handling for Facebook shareToGroups field
    if (nodeInfo.type === 'facebook_action_create_post' && values.pageId && !dynamicOptions.shareToGroups) {
      console.log('🔄 [ConfigForm] Loading Facebook groups for sharing...');
      loadOptions('shareToGroups');
    }
    
    // Find other dynamic fields that should load when visible
    const fieldsToLoad = nodeInfo.configSchema.filter((field: any) => {
      if (!field.dynamic) return false;
      
      // Check if field is now visible (its dependencies are satisfied)
      if (field.dependsOn) {
        const dependsOnValue = values[field.dependsOn];
        if (!dependsOnValue) return false; // Don't load if dependency not satisfied
        
        // Check if already loaded
        const fieldOptions = dynamicOptions[field.name];
        const hasOptions = fieldOptions && Array.isArray(fieldOptions) && fieldOptions.length > 0;
        
        // Load if visible and not yet loaded
        // Special case: prevent repeated reloads for Google Sheets sheetName when options exist
        if (nodeInfo?.providerId === 'google-sheets' && field.name === 'sheetName' && hasOptions) {
          return false;
        }
        return !hasOptions;
      }
      
      return false;
    });
    
    if (fieldsToLoad.length > 0) {
      fieldsToLoad.forEach((field: any) => {
        console.log(`🔄 [ConfigForm] Auto-loading field that became visible: ${field.name}`);

        // Check if the field has dependencies
        if (field.dependsOn) {
          const dependencyValue = values[field.dependsOn];
          if (dependencyValue) {
            // Load with the dependency value
            console.log(`📦 [ConfigForm] Loading ${field.name} with dependency ${field.dependsOn}: ${dependencyValue}`);
            // Avoid forcing reloads for dependent fields; prevents sheetName thrash
            loadOptions(field.name, field.dependsOn, dependencyValue, false);
          } else {
            console.log(`⚠️ [ConfigForm] Skipping auto-load for ${field.name} - missing dependency value for ${field.dependsOn}`);
          }
        } else {
          // No dependencies, load normally
          loadOptions(field.name);
        }
      });
    }
  }, [nodeInfo, isInitialLoading, values.pageId, loadOptions, dynamicOptions, values]);

  // Listen for integration reconnection events to refresh integration status
  useEffect(() => {
    const handleReconnection = (event: CustomEvent) => {
      console.log('🔄 [ConfigForm] Integration reconnection event received:', event.detail);
      
      // Refresh integrations list to get updated status
      if (event.detail?.provider) {
        console.log('✅ [ConfigForm] Refreshing integrations after reconnection...');
        fetchIntegrations(true); // Force refresh
      }
    };
    
    // Listen for the reconnection event
    window.addEventListener('integration-reconnected', handleReconnection as EventListener);
    
    return () => {
      window.removeEventListener('integration-reconnected', handleReconnection as EventListener);
    };
  }, []); // Empty dependency array - event listeners only need to be set up once

  // Handle form submission
  const handleSubmit = async (submissionValues: Record<string, any>) => {
    console.log('🎯 [ConfigForm] handleSubmit called with values:', {
      allValues: submissionValues,
      pageFieldsValue: submissionValues.pageFields,
      hasPageFields: 'pageFields' in submissionValues
    });
    setIsLoading(true);
    try {
      // OPTIMIZATION: Removed immediate Supabase save here.
      // Configuration is saved in the workflow builder's state and will be persisted
      // when the entire workflow is saved. This eliminates the delay caused by
      // multiple Supabase round-trips on every config save.
      // The saveNodeConfig function was causing:
      // 1. Get user call
      // 2. Fetch entire workflow call
      // 3. Update entire workflow call
      // This was taking several seconds and was unnecessary since the data
      // is already in React state and will be saved with the workflow.

      // Only save to localStorage as a quick cache/fallback (synchronous, no delay)
      if (workflowData?.id && currentNodeId && typeof window !== 'undefined') {
        const cacheKey = `workflow_${workflowData.id}_node_${currentNodeId}_config`;
        try {
          localStorage.setItem(cacheKey, JSON.stringify({
            config: submissionValues,
            dynamicOptions,
            timestamp: Date.now()
          }));
          console.log('💾 [ConfigForm] Configuration cached locally for node:', currentNodeId);
        } catch (e) {
          // localStorage might be full or disabled, ignore
          console.warn('Could not cache configuration locally:', e);
        }
      }
      
      // Include dynamicOptions with the saved values so they can be stored with the node
      await onSave({
        ...submissionValues,
        __dynamicOptions: dynamicOptions
      });
    } catch (error) {
      console.error('Error saving configuration:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle integration connection
  const handleConnectIntegration = async () => {
    if (!provider) return;
    try {
      await connectIntegration(provider);
      // After successful connection, reload options for dynamic fields
      if (nodeInfo?.configSchema) {
        for (const field of nodeInfo.configSchema) {
          if (field.dynamic) {
            loadOptions(field.name, undefined, undefined, true); // Force refresh
          }
        }
      }
    } catch (error) {
      console.error('Error connecting integration:', error);
    }
  };

  // Show loading screen during initial load
  if (isInitialLoading || isLoadingDynamicOptions) {
    return (
      <ConfigurationLoadingScreen 
        integrationName={integrationName}
      />
    );
  }

  // Common props for all provider components
  const commonProps = {
    nodeInfo,
    values,
    setValue,
    errors,
    onSubmit: handleSubmit,
    onCancel,
    onBack,
    isEditMode,
    workflowData,
    currentNodeId,
    dynamicOptions,
    loadingDynamic,
    loadingFields,
    loadOptions,
    integrationName,
    needsConnection,
    onConnectIntegration: handleConnectIntegration,
    aiFields,
    setAiFields,
    isConnectedToAIAgent,
    // Provider-specific state
    selectedRecord,
    setSelectedRecord,
    previewData,
    setPreviewData,
    showPreviewData,
    setShowPreviewData,
    tableSearchQuery,
    setTableSearchQuery,
    googleSheetsSortField,
    setGoogleSheetsSortField,
    googleSheetsSortDirection,
    setGoogleSheetsSortDirection,
    googleSheetsSelectedRows,
    setGoogleSheetsSelectedRows,
    airtableRecords,
    setAirtableRecords,
    airtableTableSchema,
    setAirtableTableSchema
  };

  // THIRD THING: Route to the correct provider component
  // Check for specific node types that need custom configuration
  if (nodeInfo?.type === 'schedule') {
    console.log('⏰ [ConfigForm] Routing to Schedule configuration');
    return <ScheduleConfiguration {...commonProps} />;
  }

  // Check for if/then condition node
  if (nodeInfo?.type === 'if_then_condition') {
    console.log('🔀 [ConfigForm] Routing to If/Then configuration');
    return <IfThenConfiguration {...commonProps} />;
  }

  if (provider === 'gmail' && nodeInfo?.type === 'gmail_action_search_email') {
    console.log('📧 [ConfigForm] Routing to Gmail Fetch configuration');
    return <GmailFetchConfiguration {...commonProps} />;
  }

  switch (provider) {
    // Communication
    case 'discord':
      console.log('📘 [ConfigForm] Routing to Discord configuration');
      // Pass the base setValue for Discord to avoid complex field change logic
      // Also pass loadingFields so Discord can check if fields are loading
      return <DiscordConfiguration {...commonProps} setValue={setValueBase} loadingFields={loadingFields} />;
    
    case 'slack':
      console.log('💬 [ConfigForm] Routing to Slack configuration');
      return <SlackConfiguration {...commonProps} />;
    
    case 'teams':
      console.log('👥 [ConfigForm] Routing to Teams configuration');
      return <TeamsConfiguration {...commonProps} />;
    
    // Email
    case 'gmail':
      console.log('📧 [ConfigForm] Routing to Gmail configuration');
      return <GmailConfiguration {...commonProps} />;
    
    case 'microsoft-outlook':
    case 'outlook':
      return <OutlookConfiguration {...commonProps} />;
    
    // Productivity
    case 'notion':
      // NOTION WORKSPACE DEBUG: Log when Notion configuration is loaded
      if (commonProps.dynamicOptions?.workspace) {
        console.log('🔍 [NOTION DEBUG] Notion workspace options:', {
          workspaceOptions: commonProps.dynamicOptions.workspace,
          currentValue: commonProps.values?.workspace
        });
      }
      return <NotionConfiguration {...commonProps} />;
    
    case 'trello':
      return <TrelloConfiguration {...commonProps} />;
    
    case 'airtable':
      return <AirtableConfiguration {...commonProps} />;
    
    // Google Services
    case 'google-sheets':
      return <GoogleSheetsConfiguration {...commonProps} />;
    
    case 'google-calendar':
      return <GoogleCalendarConfiguration {...commonProps} />;
    
    case 'google-drive':
      return <GoogleDriveConfiguration {...commonProps} />;
    
    case 'google-docs':
      return <GoogleDocsConfiguration {...commonProps} />;
    
    // Microsoft Services
    case 'onedrive':
      return <OneDriveConfiguration {...commonProps} />;
    
    case 'microsoft-onenote':
    case 'onenote':
      return <OneNoteConfiguration {...commonProps} />;
    
    // Business & E-commerce
    case 'hubspot':
      return <HubSpotConfiguration {...commonProps} />;
    
    case 'stripe':
      console.log('💳 [ConfigForm] Routing to Stripe configuration');
      return <StripeConfiguration {...commonProps} />;
    
    case 'shopify':
      console.log('🛍️ [ConfigForm] Routing to Shopify configuration');
      return <ShopifyConfiguration {...commonProps} />;
    
    case 'paypal':
      console.log('💰 [ConfigForm] Routing to PayPal configuration');
      return <PayPalConfiguration {...commonProps} />;
    
    // Social Media
    case 'twitter':
      console.log('🐦 [ConfigForm] Routing to Twitter configuration');
      return <TwitterConfiguration {...commonProps} />;
    
    case 'facebook':
      console.log('👤 [ConfigForm] Routing to Facebook configuration');
      return <FacebookConfiguration {...commonProps} />;
    
    case 'linkedin':
      console.log('💼 [ConfigForm] Routing to LinkedIn configuration');
      return <LinkedInConfiguration {...commonProps} />;
    
    case 'instagram':
      console.log('📸 [ConfigForm] Routing to Instagram configuration');
      return <InstagramConfiguration {...commonProps} />;
    
    case 'youtube':
      console.log('📺 [ConfigForm] Routing to YouTube configuration');
      return <YouTubeConfiguration {...commonProps} />;
    
    case 'youtube-studio':
      console.log('🎬 [ConfigForm] Routing to YouTube Studio configuration');
      return <YouTubeStudioConfiguration {...commonProps} />;
    
    case 'tiktok':
      console.log('🎵 [ConfigForm] Routing to TikTok configuration');
      return <TikTokConfiguration {...commonProps} />;
    
    // File Storage
    case 'dropbox':
      console.log('📦 [ConfigForm] Routing to Dropbox configuration');
      return <DropboxConfiguration {...commonProps} />;
    
    case 'box':
      console.log('📦 [ConfigForm] Routing to Box configuration');
      return <BoxConfiguration {...commonProps} />;
    
    // Development
    case 'github':
      console.log('🐙 [ConfigForm] Routing to GitHub configuration');
      return <GitHubConfiguration {...commonProps} />;
    
    default:
      console.log('📕 [ConfigForm] Routing to Generic configuration for provider:', provider);
      return <GenericConfiguration {...commonProps} />;
  }
}

export default ConfigurationForm;