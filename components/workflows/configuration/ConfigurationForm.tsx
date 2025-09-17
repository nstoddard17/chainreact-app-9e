"use client"

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Settings } from 'lucide-react';
import { useDynamicOptions } from './hooks/useDynamicOptions';
import { useFieldChangeHandler } from './hooks/useFieldChangeHandler';
import { useIntegrationStore } from '@/stores/integrationStore';
import { useWorkflowStore } from '@/stores/workflowStore';
import { ConfigurationLoadingScreen } from '@/components/ui/loading-screen';
import { saveNodeConfig } from '@/lib/workflows/configPersistence';

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

  // Extract saved dynamic options from initialData if present
  const savedDynamicOptions = initialData?.__dynamicOptions;

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
    onLoadingChange,
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
    selectedRecord
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

    // Reset the flag on mount
    hasLoadedOnMount.current = false;

    // Clear options for Dropbox path field on mount to ensure fresh load
    if (nodeInfo?.providerId === 'dropbox' && resetOptions) {
      console.log('🧹 [ConfigForm] Clearing Dropbox path options on mount');
      resetOptions('path');
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
    hasLoadedOnMount.current = false;
    console.log('🔄 [ConfigForm] Reset hasLoadedOnMount flag - modal opened/reopened');

    // Clear dynamic options for loadOnMount fields to force reload
    if (nodeInfo?.configSchema) {
      nodeInfo.configSchema.forEach((field: any) => {
        if (field.loadOnMount && field.dynamic) {
          console.log(`🔄 [ConfigForm] Resetting options for field: ${field.name}`);
          resetOptions(field.name);
        }
      });
    }
  }, [nodeInfo?.id, resetOptions]);

  // Load fields marked with loadOnMount immediately when form opens
  useEffect(() => {
    if (!nodeInfo?.configSchema || isInitialLoading || hasLoadedOnMount.current) return;

    console.log('🚀 [ConfigForm] Checking for loadOnMount fields...');

    // Find fields that should load on mount
    const fieldsToLoad = nodeInfo.configSchema.filter((field: any) => {
      // Check if field should load on mount
      if (field.loadOnMount === true && field.dynamic) {
        // Always reload loadOnMount fields when modal reopens
        console.log(`🔄 [ConfigForm] Field ${field.name} has loadOnMount, will load`);
        return true;
      }
      return false;
    });

    if (fieldsToLoad.length > 0) {
      console.log('🚀 [ConfigForm] Loading fields on mount:', fieldsToLoad.map((f: any) => f.name));
      hasLoadedOnMount.current = true; // Mark that we've loaded

      // Add a small delay to ensure options are cleared first for Dropbox
      const timeoutId = setTimeout(() => {
        // Load each field marked with loadOnMount
        fieldsToLoad.forEach((field: any) => {
          console.log(`🔄 [ConfigForm] Auto-loading field: ${field.name}`);
          loadOptions(field.name, undefined, undefined, true); // Force refresh
        });
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [nodeInfo, isInitialLoading, loadOptions]); // loadOptions is stable, won't cause loops

  // Load options for dynamic fields with saved values
  useEffect(() => {
    if (!nodeInfo?.configSchema || isInitialLoading) return;

    console.log('🔍 [ConfigForm] Checking for dynamic fields with saved values...');

    // Find dynamic fields that have saved values
    const fieldsWithValues = nodeInfo.configSchema.filter((field: any) => {
      // Check if it's a dynamic field
      if (!field.dynamic) return false;

      // Skip fields that have loadOnMount (they're handled by another useEffect)
      if (field.loadOnMount) return false;

      // Check if it has a saved value
      const savedValue = values[field.name];
      if (!savedValue) return false;

      // Check if options are already loaded
      const fieldOptions = dynamicOptions[field.name];
      const hasOptions = fieldOptions && Array.isArray(fieldOptions) && fieldOptions.length > 0;

      // Always load for dependent fields if parent has value, even if options exist
      // This ensures the saved value displays correctly
      if (field.dependsOn && values[field.dependsOn]) {
        // For dependent fields, check if the saved value exists in current options
        if (hasOptions) {
          const valueExists = fieldOptions.some((opt: any) =>
            (opt.value === savedValue) || (opt.id === savedValue) || (opt === savedValue)
          );
          // If value doesn't exist in options, we need to reload
          return !valueExists;
        }
        return true; // No options yet, need to load
      }

      // Only load if we have a value but no options yet
      return !hasOptions;
    });

    if (fieldsWithValues.length > 0) {
      console.log('🚀 [ConfigForm] Loading options for fields with saved values:',
        fieldsWithValues.map((f: any) => ({ name: f.name, value: values[f.name] }))
      );

      // Load options for each field with a saved value
      fieldsWithValues.forEach((field: any) => {
        console.log(`🔄 [ConfigForm] Background loading options for field: ${field.name} (saved value: ${values[field.name]})`);

        // Check if field has dependencies
        if (field.dependsOn) {
          const dependsOnValue = values[field.dependsOn];
          if (dependsOnValue) {
            loadOptions(field.name, field.dependsOn, dependsOnValue);
          }
        } else {
          // No dependencies, just load the field
          loadOptions(field.name);
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
      if (field.dynamic !== true) return false;
      
      // Check if field is now visible (its dependencies are satisfied)
      if (field.dependsOn) {
        const dependsOnValue = values[field.dependsOn];
        if (!dependsOnValue) return false; // Don't load if dependency not satisfied
        
        // Check if already loaded
        const fieldOptions = dynamicOptions[field.name];
        const hasOptions = fieldOptions && Array.isArray(fieldOptions) && fieldOptions.length > 0;
        
        // Load if visible and not yet loaded
        return !hasOptions;
      }
      
      return false;
    });
    
    if (fieldsToLoad.length > 0) {
      fieldsToLoad.forEach((field: any) => {
        console.log(`🔄 [ConfigForm] Auto-loading field that became visible: ${field.name}`);
        loadOptions(field.name);
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
    setIsLoading(true);
    try {
      // Save configuration to persistence layer if we have the necessary IDs
      if (workflowData?.id && currentNodeId) {
        console.log('📎 [ConfigForm] Saving to persistence:', {
          workflowId: workflowData.id,
          nodeId: currentNodeId,
          nodeType: nodeInfo?.type,
          uploadedFiles: submissionValues.uploadedFiles,
          sourceType: submissionValues.sourceType
        });
        
        try {
          await saveNodeConfig(
            workflowData.id,
            currentNodeId,
            nodeInfo?.type || 'unknown',
            submissionValues,
            dynamicOptions
          );
          console.log('✅ [ConfigForm] Configuration saved to persistence layer');
        } catch (persistenceError) {
          console.error('❌ [ConfigForm] Failed to save to persistence:', persistenceError);
          // Don't fail the overall save if persistence fails
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