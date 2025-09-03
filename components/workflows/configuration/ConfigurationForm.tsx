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
  getFormValues
}: ConfigurationFormProps) {
  // FIRST: All hooks must be called before any conditional returns
  
  // Common state and hooks
  const [values, setValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [aiFields, setAiFields] = useState<Record<string, boolean>>({});
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
  
  const { getIntegrationByProvider, connectIntegration } = useIntegrationStore();
  const { currentWorkflow } = useWorkflowStore();

  // Extract provider and node type (safe even if nodeInfo is null)
  const provider = nodeInfo?.providerId;
  const nodeType = nodeInfo?.type;
  
  // Check integration connection
  const integration = provider ? getIntegrationByProvider(provider) : null;
  const needsConnection = provider && provider !== 'logic' && provider !== 'ai' && !integration;
  const integrationName = nodeInfo?.label?.split(' ')[0] || provider;

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
    
    const initialValues: Record<string, any> = {};
    
    // Set initial data first
    if (initialData && Object.keys(initialData).length > 0) {
      Object.entries(initialData).forEach(([key, value]) => {
        if (value !== undefined) {
          initialValues[key] = value;
        }
      });
    }
    
    // Set defaults for missing fields
    nodeInfo.configSchema.forEach((field: any) => {
      if (field.defaultValue !== undefined && initialValues[field.name] === undefined) {
        initialValues[field.name] = field.defaultValue;
      }
    });
    
    setValues(initialValues);
    setIsInitialLoading(false);
  }, [nodeInfo, initialData]);

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