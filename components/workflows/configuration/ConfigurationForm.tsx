"use client"

import React, { useState, useEffect, useCallback } from 'react';
import { Settings } from 'lucide-react';
import { useDynamicOptions } from './hooks/useDynamicOptions';
import { useFieldChangeHandler } from './hooks/useFieldChangeHandler';
import { useIntegrationStore } from '@/stores/integrationStore';
import { useWorkflowStore } from '@/stores/workflowStore';
import { ConfigurationLoadingScreen } from '@/components/ui/loading-screen';

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
  const [values, setValues] = useState<Record<string, any>>({});
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
    getFormValues: () => values
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
  
  // Ensure integrations are loaded on mount
  useEffect(() => {
    const loadIntegrations = async () => {
      console.log('🔄 [ConfigForm] Loading integrations on mount');
      await fetchIntegrations(true); // Force refresh to ensure integrations are loaded
    };
    loadIntegrations();
  }, [fetchIntegrations]); // Include dependency but it should be stable

  // Load fields marked with loadOnMount immediately when form opens
  useEffect(() => {
    if (!nodeInfo?.configSchema || isInitialLoading) return;
    
    console.log('🚀 [ConfigForm] Checking for loadOnMount fields...');
    
    // Find fields that should load on mount
    const fieldsToLoad = nodeInfo.configSchema.filter((field: any) => 
      field.loadOnMount === true && field.dynamic === true
    );
    
    if (fieldsToLoad.length > 0) {
      console.log('🚀 [ConfigForm] Loading fields on mount:', fieldsToLoad.map((f: any) => f.name));
      
      // Load each field marked with loadOnMount
      fieldsToLoad.forEach((field: any) => {
        console.log(`🔄 [ConfigForm] Auto-loading field: ${field.name}`);
        loadOptions(field.name);
      });
    }
  }, [nodeInfo, isInitialLoading, loadOptions]);

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
  }, [fetchIntegrations]);

  // Handle form submission
  const handleSubmit = async (submissionValues: Record<string, any>) => {
    setIsLoading(true);
    try {
      await onSave(submissionValues);
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
      console.log('📮 [ConfigForm] Routing to Outlook configuration');
      return <OutlookConfiguration {...commonProps} />;
    
    // Productivity
    case 'notion':
      console.log('📝 [ConfigForm] Routing to Notion configuration');
      return <NotionConfiguration {...commonProps} />;
    
    case 'trello':
      console.log('📋 [ConfigForm] Routing to Trello configuration');
      return <TrelloConfiguration {...commonProps} />;
    
    case 'airtable':
      console.log('📗 [ConfigForm] Routing to Airtable configuration');
      return <AirtableConfiguration {...commonProps} />;
    
    // Google Services
    case 'google-sheets':
      console.log('📙 [ConfigForm] Routing to Google Sheets configuration');
      return <GoogleSheetsConfiguration {...commonProps} />;
    
    case 'google-calendar':
      console.log('📅 [ConfigForm] Routing to Google Calendar configuration');
      return <GoogleCalendarConfiguration {...commonProps} />;
    
    case 'google-drive':
      console.log('☁️ [ConfigForm] Routing to Google Drive configuration');
      return <GoogleDriveConfiguration {...commonProps} />;
    
    case 'google-docs':
      console.log('📄 [ConfigForm] Routing to Google Docs configuration');
      return <GoogleDocsConfiguration {...commonProps} />;
    
    // Microsoft Services
    case 'onedrive':
      console.log('☁️ [ConfigForm] Routing to OneDrive configuration');
      return <OneDriveConfiguration {...commonProps} />;
    
    case 'microsoft-onenote':
    case 'onenote':
      console.log('📓 [ConfigForm] Routing to OneNote configuration');
      return <OneNoteConfiguration {...commonProps} />;
    
    // Business & E-commerce
    case 'hubspot':
      console.log('🚀 [ConfigForm] Routing to HubSpot configuration');
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