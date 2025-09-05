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
import { GenericConfiguration } from './providers/GenericConfiguration';

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

  // Use the consolidated handler as setValue
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
  switch (provider) {
    case 'discord':
      console.log('📘 [ConfigForm] Routing to Discord configuration');
      return <DiscordConfiguration {...commonProps} />;
    
    case 'airtable':
      console.log('📗 [ConfigForm] Routing to Airtable configuration');
      return <AirtableConfiguration {...commonProps} />;
    
    case 'google-sheets':
      console.log('📙 [ConfigForm] Routing to Google Sheets configuration');
      return <GoogleSheetsConfiguration {...commonProps} />;
    
    default:
      console.log('📕 [ConfigForm] Routing to Generic configuration for provider:', provider);
      return <GenericConfiguration {...commonProps} />;
  }
}

export default ConfigurationForm;