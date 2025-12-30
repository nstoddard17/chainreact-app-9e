"use client"

import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronLeft, ChevronDown, ChevronUp, Mail, Loader2, Search, ExternalLink, FolderOpen, Paperclip } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FieldRenderer } from '../fields/FieldRenderer';
import { AIFieldWrapper } from '../fields/AIFieldWrapper';
import { GenericSelectField } from '../fields/shared/GenericSelectField';
import { ConfigurationContainer } from '../components/ConfigurationContainer';
import { FieldVisibilityEngine } from '@/lib/workflows/fields/visibility';
import { supabase } from '@/utils/supabaseClient';
import { getProviderDisplayName } from '@/lib/utils/provider-names';

import { logger } from '@/lib/utils/logger'
import { ServiceConnectionSelector } from '../ServiceConnectionSelector'
import { Integration } from '@/stores/integrationStore'

// Constants - defined outside component to prevent re-creation on every render
const PREVIEW_LIMIT_OPTIONS = [
  { value: '10', label: '10' },
  { value: '25', label: '25' },
  { value: '50', label: '50' },
  { value: '100', label: '100' }
]

const PREVIEW_LIMIT_FIELD = {
  name: 'previewLimit',
  label: '',
  type: 'select',
  required: false,
  hideClearButton: true,
  disableSearch: true
} as const

const GMAIL_PREVIEW_LIMIT_OPTIONS = [
  { value: '5', label: '5' },
  { value: '10', label: '10' },
  { value: '25', label: '25' },
  { value: '50', label: '50' }
]

interface GenericConfigurationProps {
  nodeInfo: any;
  values: Record<string, any>;
  setValue: (field: string, value: any) => void;
  errors: Record<string, string>;
  onSubmit: (values: Record<string, any>) => Promise<void>;
  onCancel: () => void;
  onBack?: () => void;
  isEditMode?: boolean;
  workflowData?: any;
  currentNodeId?: string;
  dynamicOptions: Record<string, any[]>;
  loadingDynamic: boolean;
  loadOptions: (fieldName: string, parentField?: string, parentValue?: any, forceReload?: boolean) => Promise<void>;
  integrationName?: string;
  integrationId?: string;
  needsConnection?: boolean;
  onConnectIntegration?: () => void;
  aiFields?: Record<string, boolean>;
  setAiFields?: (fields: Record<string, boolean>) => void;
  isConnectedToAIAgent?: boolean;
  loadingFields?: Set<string>;
  // Multi-account support
  showAccountSelector?: boolean;
  selectedIntegrationId?: string;
  connectedIntegrations?: Integration[];
  onSelectAccount?: (integrationId: string) => void;
}

export function GenericConfiguration({
  nodeInfo,
  values,
  setValue,
  errors,
  onSubmit,
  onCancel,
  onBack,
  isEditMode,
  workflowData,
  currentNodeId,
  dynamicOptions,
  loadingDynamic,
  loadOptions,
  integrationName,
  integrationId,
  needsConnection,
  onConnectIntegration,
  aiFields = {},
  setAiFields = () => {},
  isConnectedToAIAgent = false,
  loadingFields: loadingFieldsProp,
  // Multi-account support
  showAccountSelector = false,
  selectedIntegrationId,
  connectedIntegrations = [],
  onSelectAccount,
}: GenericConfigurationProps) {

  // Debug: Log dynamicOptions for HubSpot
  const hasTriedLoadRef = React.useRef(false);

  React.useEffect(() => {
    if (nodeInfo?.providerId === 'hubspot') {
      console.log('🔍 [GenericConfig] HubSpot dynamicOptions:', dynamicOptions);
      console.log('🔍 [GenericConfig] HubSpot listId options:', dynamicOptions.listId);

      // Auto-load if empty (only once)
      if (nodeInfo?.type === 'hubspot_action_add_contact_to_list' &&
          (!dynamicOptions.listId || dynamicOptions.listId.length === 0) &&
          !hasTriedLoadRef.current) {
        console.log('🔄 [GenericConfig] Auto-loading listId options');
        hasTriedLoadRef.current = true;
        loadOptions('listId', undefined, undefined, true);
      }
    }
  }, [dynamicOptions, nodeInfo?.providerId, nodeInfo?.type, loadOptions]);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [localLoadingFields, setLocalLoadingFields] = useState<Set<string>>(new Set());
  const [isFormValid, setIsFormValid] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewLimit, setPreviewLimit] = useState(10);
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());
  const previewQuery = typeof values?.query === 'string' ? values.query.trim() : '';

  // Use prop if provided, otherwise use local state
  const loadingFields = loadingFieldsProp || localLoadingFields;
  const setLoadingFields = loadingFieldsProp ? () => {} : setLocalLoadingFields;

  // Store current values in a ref to avoid re-creating callbacks
  const valuesRef = useRef(values);
  const autoLoadedFieldsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  // Handle dynamic field loading
  const handleDynamicLoad = useCallback(async (
    fieldName: string,
    dependsOn?: string,
    dependsOnValue?: any,
    forceReload?: boolean
  ) => {
    logger.debug('🔍 [GenericConfig] handleDynamicLoad called:', {
      fieldName,
      dependsOn,
      dependsOnValue,
      forceReload
    });

    const field = nodeInfo?.configSchema?.find((f: any) => f.name === fieldName);
    if (!field) {
      logger.warn('Field not found in schema:', fieldName);
      return;
    }

    // Add field to loading set
    setLoadingFields(prev => {
      const newSet = new Set(prev);
      newSet.add(fieldName);
      return newSet;
    });

    try {
      // If explicit dependencies are provided, use them
      if (dependsOn && dependsOnValue !== undefined) {
        logger.debug('🔄 [GenericConfig] Calling loadOptions with dependencies:', { fieldName, dependsOn, dependsOnValue, forceReload });
        await loadOptions(fieldName, dependsOn, dependsOnValue, forceReload);
      }
      // Otherwise check field's defined dependencies - get values from ref (avoids dependency on values prop)
      else if (field.dependsOn) {
        const parentValue = valuesRef.current[field.dependsOn];
        if (parentValue) {
          logger.debug('🔄 [GenericConfig] Calling loadOptions with field dependencies:', { fieldName, dependsOn: field.dependsOn, dependsOnValue: parentValue, forceReload });
          await loadOptions(fieldName, field.dependsOn, parentValue, forceReload);
        } else {
          // Field has dependency but no value yet - don't try to load
          logger.debug('⏸️ [GenericConfig] Skipping load - field has dependency but no parent value:', { fieldName, dependsOn: field.dependsOn });
          // Remove from loading set since we're not actually loading
          setLoadingFields(prev => {
            const newSet = new Set(prev);
            newSet.delete(fieldName);
            return newSet;
          });
          return;
        }
      }
      // No dependencies, just load the field
      else {
        logger.debug('🔄 [GenericConfig] Calling loadOptions without dependencies:', { fieldName, forceReload });
        await loadOptions(fieldName, undefined, undefined, forceReload);
      }
    } catch (error) {
      logger.error('❌ [GenericConfig] Error loading dynamic options:', error);
    } finally {
      // Remove field from loading set
      setLoadingFields(prev => {
        const newSet = new Set(prev);
        newSet.delete(fieldName);
        return newSet;
      });
    }
  }, [nodeInfo, loadOptions]);

  // Reset auto-loaded field tracking when node changes
  useEffect(() => {
    autoLoadedFieldsRef.current.clear();
  }, [nodeInfo?.type, nodeInfo?.providerId]);

  // Automatically load dynamic fields (without dependencies) when the modal opens
  useEffect(() => {
    // Debug logging for Gmail
    if (nodeInfo?.providerId === 'gmail') {
      console.log('🔵 [GenericConfig] Gmail useEffect for auto-load:', {
        hasConfigSchema: !!nodeInfo?.configSchema,
        needsConnection,
        nodeType: nodeInfo?.type,
        willReturn: !nodeInfo?.configSchema || needsConnection
      });
    }

    if (!nodeInfo?.configSchema || needsConnection) return;

    const fieldsNeedingLoad = nodeInfo.configSchema.filter((field: any) => {
      if (!field.dynamic) return false;
      if (field.dependsOn) return false; // Require parent value first
      if (field.loadOnMount) return false; // Already handled elsewhere
      if (autoLoadedFieldsRef.current.has(field.name)) return false;

      const existingOptions = dynamicOptions?.[field.name];
      const hasOptions = Array.isArray(existingOptions) && existingOptions.length > 0;

      // Mark as handled to avoid duplicate loads
      autoLoadedFieldsRef.current.add(field.name);
      return !hasOptions;
    });

    fieldsNeedingLoad.forEach((field: any) => {
      handleDynamicLoad(field.name);
    });
  }, [nodeInfo?.configSchema, needsConnection, dynamicOptions, handleDynamicLoad]);

  // Validate form whenever values or visible fields change
  useEffect(() => {
    const validateForm = () => {
      if (!nodeInfo?.configSchema) return;

      const baseFields = nodeInfo.configSchema.filter((f: any) => !f.advanced) || [];
      const advancedFields = nodeInfo.configSchema.filter((f: any) => f.advanced) || [];
      const allFields = [...baseFields, ...advancedFields];

      // Check if all required visible fields have values
      let isValid = true;
      for (const field of allFields) {
        // Only check if field is required AND visible
        if (field.required && shouldShowField(field)) {
          const fieldValue = values[field.name];
          if (!fieldValue && fieldValue !== 0 && fieldValue !== false) {
            isValid = false;
            break;
          }
        }
      }

      setIsFormValid(isValid);
    };

    validateForm();
  }, [values, nodeInfo]);

  // Track which default values have already been applied to prevent infinite loops
  const appliedDefaultsRef = useRef<Set<string>>(new Set());
  const lastNodeTypeRef = useRef<string | undefined>(undefined);

  // Reset applied defaults tracking when node type changes
  useEffect(() => {
    if (nodeInfo?.type && nodeInfo.type !== lastNodeTypeRef.current) {
      appliedDefaultsRef.current = new Set();
      lastNodeTypeRef.current = nodeInfo.type;
    }
  }, [nodeInfo?.type]);

  // Apply default values to fields when they become visible
  useEffect(() => {
    if (!nodeInfo?.configSchema) return;

    // Batch all default value applications to prevent multiple state updates
    const defaultsToApply: { fieldName: string; value: any }[] = [];

    nodeInfo.configSchema.forEach((field: any) => {
      // Check if field has a default value defined
      if (field.defaultValue !== undefined) {
        // Skip if we've already applied this default
        if (appliedDefaultsRef.current.has(field.name)) {
          return;
        }

        // Check if field is now visible
        const isVisible = FieldVisibilityEngine.isFieldVisible(field, values, nodeInfo);

        // Apply default if field is visible and doesn't have a value yet
        if (isVisible && (values[field.name] === undefined || values[field.name] === null)) {
          defaultsToApply.push({ fieldName: field.name, value: field.defaultValue });
          appliedDefaultsRef.current.add(field.name);
        }
      }
    });

    // Apply all defaults in a single batch
    if (defaultsToApply.length > 0) {
      defaultsToApply.forEach(({ fieldName, value }) => {
        logger.debug(`[GenericConfig] Applying default value to ${fieldName}:`, value);
        setValue(fieldName, value);
      });
    }
  }, [values, nodeInfo, setValue]);

  // Handle field value changes and trigger dependent field loading
  const handleFieldChange = useCallback(async (fieldName: string, value: any) => {
    // COMPREHENSIVE LOGGING for selectedProperties
    if (fieldName === 'selectedProperties') {
      console.log('💠💠💠 [GenericConfiguration] selectedProperties handleFieldChange called:', {
        fieldName,
        valueType: Array.isArray(value) ? 'array' : typeof value,
        valueLength: Array.isArray(value) ? value.length : undefined,
        nodeType: nodeInfo?.type,
        providerId: nodeInfo?.providerId,
        timestamp: new Date().toISOString(),
        stackTrace: new Error().stack?.split('\n').slice(0, 8).join('\n')
      });
    }

    // Update the field value
    setValue(fieldName, value);

    // Special handling for Trello board selection
    if (nodeInfo?.providerId === 'trello' && fieldName === 'boardId') {
      logger.debug('🔄 [GenericConfig] Board selected, handling dependent fields:', value);

      // Find all fields that depend on boardId
      const dependentFields = nodeInfo?.configSchema?.filter((f: any) => f.dependsOn === 'boardId' && f.dynamic) || [];

      // Clear values of dependent fields when board changes
      dependentFields.forEach((field: any) => {
        setValue(field.name, '');
      });

      if (value) {
        // For Move Card action, load both cardId and listId simultaneously
        if (nodeInfo?.type === 'trello_action_move_card') {
          logger.debug('🎯 [GenericConfig] Loading card and list fields for Move Card action');

          // Load all dependent fields in parallel for better performance
          const loadPromises = dependentFields.map(async (field: any) => {
            logger.debug(`  Loading ${field.name} with boardId: ${value}`);
            try {
              await loadOptions(field.name, 'boardId', value, true);
              logger.debug(`  ✅ Successfully loaded ${field.name}`);
            } catch (error) {
              logger.error(`  Failed to load ${field.name}:`, error);
            }
          });

          // Wait for all to complete
          await Promise.all(loadPromises);
          logger.debug('✅ All dependent fields loaded');
        } else {
          // For other actions, load sequentially as before
          for (const field of dependentFields) {
            logger.debug(`  Loading ${field.name} with boardId: ${value}`);
            try {
              await loadOptions(field.name, 'boardId', value, true);
              logger.debug(`  ✅ Successfully loaded ${field.name}`);
            } catch (error) {
              logger.error(`  Failed to load ${field.name}:`, error);
            }
          }
        }
      }
    }

    // Generic handling for dynamic fields that depend on the changed field
    if (!(nodeInfo?.providerId === 'trello' && fieldName === 'boardId')) {
      const dependentFields = nodeInfo?.configSchema?.filter(
        (field: any) => field.dynamic && field.dependsOn === fieldName
      ) || [];

      if (dependentFields.length > 0) {
        // Clear dependent field values so stale selections don't linger
        dependentFields.forEach((field: any) => {
          const resetValue = field.type === 'multiselect' ? [] : '';
          setValue(field.name, resetValue);
        });

        if (value) {
          for (const field of dependentFields) {
            try {
              await loadOptions(field.name, fieldName, value, true);
            } catch (error) {
              logger.error(`❌ [GenericConfig] Failed to load options for dependent field ${field.name}:`, error);
            }
          }
        }
      }
    }
  }, [nodeInfo, setValue, loadOptions]);

  // Background load options for dynamic fields with saved values
  useEffect(() => {
    if (!nodeInfo?.configSchema) return;

    // Find all dynamic fields that need loading
    const fieldsToLoad = nodeInfo.configSchema.filter((field: any) => {
      if (!field.dynamic) return false;
      
      // Skip fields with loadOnMount in GenericConfiguration
      // These are handled by ConfigurationForm's loadOnMount useEffect
      if (field.loadOnMount) return false;
      
      // In edit mode, only load if has saved value and not marked for loadOnMount
      if (!isEditMode) return false;
      
      const savedValue = values[field.name];
      if (!savedValue) return false;
      
      // Check if we already have options for this field
      const fieldOptions = dynamicOptions[field.name];
      const hasOptions = fieldOptions && Array.isArray(fieldOptions) && fieldOptions.length > 0;
      
      // If we have options, check if the saved value exists in them
      if (hasOptions) {
        const valueExists = fieldOptions.some((opt: any) => 
          (opt.value === savedValue) || (opt.id === savedValue)
        );
        // If value exists in options, no need to load
        if (valueExists) return false;
      }
      
      return true; // Need to load options
    });

    // Load options for each field
    fieldsToLoad.forEach((field: any) => {
      logger.debug('🔄 [GenericConfig] Background loading options for field:', field.name, 'with value:', values[field.name]);
      
      // Set a small delay to ensure UI renders first with the ID
      setTimeout(() => {
        if (field.dependsOn && values[field.dependsOn]) {
          loadOptions(field.name, field.dependsOn, values[field.dependsOn], false);
        } else {
          loadOptions(field.name, undefined, undefined, false);
        }
      }, 100);
    });
  }, [nodeInfo, isEditMode, values, dynamicOptions, loadOptions]);

  // Helper function to check if a field should be shown based on dependencies
  // Now delegates to centralized FieldVisibilityEngine
  const shouldShowField = (field: any) => {
    return FieldVisibilityEngine.isFieldVisible(field, values, nodeInfo);
  };

  // Check if any fields use the new uiTab property
  const hasTabBasedFields = nodeInfo?.configSchema?.some((field: any) => field.uiTab);

  // Separate fields based on either uiTab (new) or advanced (legacy)
  let baseFields: any[] = [];
  let advancedFields: any[] = [];
  let memoryFields: any[] = [];
  let tabFields: Record<string, any[]> = {};

  if (hasTabBasedFields) {
    // New tab-based grouping
    const visibleFields = nodeInfo?.configSchema?.filter((field: any) => shouldShowField(field)) || [];

    visibleFields.forEach((field: any) => {
      const tab = field.uiTab || 'basic'; // Default to 'basic' if no uiTab specified
      if (!tabFields[tab]) {
        tabFields[tab] = [];
      }
      tabFields[tab].push(field);
    });

    // Extract specific tabs for easier access
    baseFields = tabFields['basic'] || [];
    advancedFields = tabFields['advanced'] || [];
    memoryFields = tabFields['memory'] || [];
  } else {
    // Legacy advanced-based grouping
    baseFields = nodeInfo?.configSchema?.filter((field: any) => {
      const shouldShow = !field.advanced && shouldShowField(field);
      if (field.hidden !== undefined) {
        logger.debug(`🔍 [GenericConfig] Field ${field.name} - hidden: ${field.hidden}, shouldShow: ${shouldShow}`);
      }
      return shouldShow;
    }) || [];

    advancedFields = nodeInfo?.configSchema?.filter((field: any) =>
      field.advanced && shouldShowField(field)
    ) || [];
  }

  // Handle AI field toggle
  const handleAIToggle = useCallback((fieldName: string, enabled: boolean) => {
    setAiFields({
      ...aiFields,
      [fieldName]: enabled
    });
  }, [aiFields, setAiFields]);

  // Helper to check if a field should be excluded from AI mode
  const isFieldExcludedFromAI = useCallback((fieldName: string) => {
    // Fields that should NEVER use AI mode (user needs to select these)
    const selectorFields = new Set([
      // Airtable selectors
      'baseId', 'tableName', 'viewName',
      // Google Sheets selectors
      'spreadsheetId', 'sheetName',
      // Microsoft Excel selectors
      'workbookId', 'worksheetName',
      // Discord selectors
      'guildId', 'channelId',
      // Slack selectors
      'channel', 'workspace', 'asUser',
      // Notion selectors
      'databaseId', 'pageId', 'database',
      // Trello selectors
      'boardId', 'listId',
      // HubSpot selectors
      'objectType',
      // Generic selectors
      'recordId', 'id'
    ]);

    // Check if it's in the global selector fields list
    if (selectorFields.has(fieldName)) {
      return true;
    }

    // Explicit check for Slack send message fields
    const isSlackSendMessage = nodeInfo?.type === 'slack_action_send_message';
    if (isSlackSendMessage && (fieldName === 'channel' || fieldName === 'asUser')) {
      return true;
    }

    // Explicit check for Notion create page database fields
    const isNotionCreatePage = nodeInfo?.type === 'notion_action_create_page';
    if (isNotionCreatePage && (fieldName === 'database' || fieldName === 'databaseId')) {
      return true;
    }

    return false;
  }, [nodeInfo]);

  // Render fields helper
  const renderFields = (fields: any[]) => {
    return fields.flatMap((field, index) => {
      const elements = [];

      // Special handling for Google Drive preview field
      if (field.type === 'google_drive_preview') {
        // Lazy import to avoid circular dependencies
        const { GoogleDriveFilePreview } = require('@/components/workflows/configuration/components/google-drive/GoogleDriveFilePreview');
        elements.push(
          <GoogleDriveFilePreview
            key={`field-${field.name}-${index}`}
            fileId={values.fileId}
            showPreview={showPreview}
            onTogglePreview={() => setShowPreview(!showPreview)}
          />
        );
        return elements;
      }

      // Use AIFieldWrapper when connected to AI Agent, otherwise use FieldRenderer
      const shouldUseAIWrapper = isConnectedToAIAgent === true;

      // Determine if AI should be enabled for this field
      // If field is explicitly excluded, AI should never be enabled
      // Otherwise, check if field is individually set OR if _allFieldsAI is true
      const isExcluded = isFieldExcludedFromAI(field.name);
      const isAIEnabled = isExcluded ? false : (aiFields[field.name] || aiFields._allFieldsAI || false);

      logger.debug('🤖 [GenericConfig] Rendering field:', {
        fieldName: field.name,
        isConnectedToAIAgent,
        shouldUseAIWrapper,
        typeofIsConnected: typeof isConnectedToAIAgent,
        aiFields,
        isExcluded,
        isAIEnabled
      });
      const Component = shouldUseAIWrapper ? AIFieldWrapper : FieldRenderer;

      elements.push(
        <div key={`field-${field.name}-${index}`} data-config-field={field.name}>
          <Component
            field={field}
            value={values[field.name]}
            onChange={(value) => handleFieldChange(field.name, value)}
            error={errors[field.name] || validationErrors[field.name]}
            workflowData={workflowData}
            currentNodeId={currentNodeId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={loadingDynamic}
            loadingFields={loadingFields}
            nodeInfo={nodeInfo}
            onDynamicLoad={handleDynamicLoad}
            parentValues={values}
            setFieldValue={setValue}
            // Props specific to AIFieldWrapper
            isAIEnabled={isAIEnabled}
            onAIToggle={isConnectedToAIAgent ? handleAIToggle : undefined}
          />
        </div>
      );

      // Special handling: Show storage service connection banner after storageService field
      if (field.name === 'storageService' && values.storageService) {
        const { StorageServiceConnectionBanner } = require('@/components/workflows/configuration/fields/StorageServiceConnectionBanner');
        elements.push(
          <StorageServiceConnectionBanner
            key={`storage-banner-${index}`}
            storageService={values.storageService}
            onConnectionChange={(connectionId) => {
              logger.debug('[GenericConfig] Storage connection changed:', connectionId);
              // Optionally store the selected connection ID in form values
              setValue('storageConnectionId', connectionId);
            }}
          />
        );
      }

      return elements;
    });
  };

  // Handle email preview for Outlook and Gmail Get Email actions
  const handleEmailPreview = async () => {
    setPreviewLoading(true);
    setPreviewResult(null);

    const isGmail = nodeInfo?.type === 'gmail_action_search_email';
    const isOutlook = nodeInfo?.type === 'microsoft-outlook_action_fetch_emails';

    try {
      const endpoint = isGmail
        ? '/api/integrations/gmail/preview-email'
        : '/api/integrations/microsoft-outlook/preview-email';

      const body = isGmail
        ? {
            labels: values.labels,
            query: values.query,
            startDate: values.startDate,
            endDate: values.endDate,
            includeSpamTrash: values.includeSpamTrash || false,
          }
        : {
            folderId: values.folderId,
            query: values.query,
            startDate: values.startDate,
            endDate: values.endDate,
            includeDeleted: values.includeDeleted || false,
          };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        setPreviewResult({ error: error.message || 'Failed to fetch preview' });
      } else {
        const data = await response.json();
        setPreviewResult(data);
      }
      setShowPreview(true);
    } catch (error: any) {
      setPreviewResult({ error: error.message || 'Failed to fetch preview' });
      setShowPreview(true);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handle attachment preview for Outlook Download Attachments action
  const handleAttachmentPreview = async () => {
    setPreviewLoading(true);
    setPreviewResult(null);

    try {
      const response = await fetch('/api/integrations/microsoft-outlook/get-email-by-id', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          emailId: values.emailId,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        setPreviewResult({ error: error.message || 'Failed to fetch email preview' });
      } else {
        const data = await response.json();
        setPreviewResult(data);
      }
      setShowPreview(true);
    } catch (error: any) {
      setPreviewResult({ error: error.message || 'Failed to fetch email preview' });
      setShowPreview(true);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handle email-only preview for Outlook Forward/Delete Email actions
  const handleOutlookEmailByIdPreview = async () => {
    setPreviewLoading(true);
    setPreviewResult(null);

    try {
      const response = await fetch('/api/integrations/microsoft-outlook/get-email-by-id', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          emailId: values.emailId,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        setPreviewResult({ error: error.message || 'Failed to fetch email preview' });
      } else {
        const data = await response.json();
        // Mark this as email-only preview (no attachment section needed)
        setPreviewResult({ ...data, emailOnlyPreview: true });
      }
      setShowPreview(true);
    } catch (error: any) {
      setPreviewResult({ error: error.message || 'Failed to fetch email preview' });
      setShowPreview(true);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Build Google Drive search URL based on search configuration
  const buildGoogleDriveSearchUrl = useCallback(() => {
    const searchMode = values.searchMode;
    const parts: string[] = [];

    if (searchMode === 'simple') {
      if (values.fileName) {
        // For simple search, just use the file name
        parts.push(values.fileName);
      }
    } else if (searchMode === 'advanced') {
      // Build advanced search query
      if (values.fileName) {
        parts.push(values.fileName);
      }
      // Google Drive search doesn't support all filters in URL, so we'll just use the name
      // Users can refine further in Google Drive
    } else if (searchMode === 'query') {
      if (values.customQuery) {
        // Use the custom query directly
        parts.push(values.customQuery);
      }
    }

    const searchQuery = parts.join(' ');
    return `https://drive.google.com/drive/search?q=${encodeURIComponent(searchQuery)}`;
  }, [values.searchMode, values.fileName, values.customQuery]);

  // Handle Google Drive search preview
  const handleDriveSearchPreview = async () => {
    setPreviewLoading(true);
    setPreviewResult(null);
    setShowPreview(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setPreviewResult({ error: 'Please sign in to preview search results' });
        setShowPreview(true);
        return;
      }

      // Build search configuration - always fetch max (100) items
      const searchConfig = {
        searchMode: values.searchMode,
        folderId: values.folderId,
        fileName: values.fileName,
        exactMatch: values.exactMatch,
        fileType: values.fileType,
        modifiedTime: values.modifiedTime,
        owner: values.owner,
        customQuery: values.customQuery,
        previewLimit: 100, // Always fetch max, we'll limit display in UI
      };

      const response = await fetch(`/api/integrations/google-drive/data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          integrationId,
          dataType: 'search-preview',
          options: { searchConfig }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setPreviewResult({ error: errorData.error || response.statusText });
      } else {
        const result = await response.json();
        setPreviewResult(result.data);
      }
      setShowPreview(true);
    } catch (error: any) {
      logger.error('[GenericConfiguration] Error fetching Google Drive preview:', error);
      setPreviewResult({ error: error?.message || 'Failed to load preview' });
      setShowPreview(true);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handle Google Drive list files preview
  const handleDriveListFilesPreview = async () => {
    setPreviewLoading(true);
    setPreviewResult(null);
    setShowPreview(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setPreviewResult({ error: 'Please sign in to preview list results' });
        setShowPreview(true);
        return;
      }

      // Build list configuration - always fetch max (100) items
      const listConfig = {
        folderId: values.folderId,
        fileTypeFilter: values.fileTypeFilter,
        orderBy: values.orderBy,
        includeSubfolders: values.includeSubfolders,
        previewLimit: 100, // Always fetch max, we'll limit display in UI
      };

      const response = await fetch(`/api/integrations/google-drive/data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          integrationId,
          dataType: 'list-files-preview',
          options: listConfig
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setPreviewResult({ error: errorData.error || response.statusText });
      } else {
        const result = await response.json();
        setPreviewResult(result.data);
      }
      setShowPreview(true);
    } catch (error: any) {
      logger.error('[GenericConfiguration] Error fetching Google Drive list preview:', error);
      setPreviewResult({ error: error?.message || 'Failed to load preview' });
      setShowPreview(true);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handle Gmail search emails preview
  const handleGmailSearchEmailsPreview = async () => {
    setPreviewLoading(true);
    setPreviewResult(null);
    setShowPreview(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setPreviewResult({ error: 'Please sign in to preview search results' });
        setShowPreview(true);
        return;
      }

      // Build search configuration
      const searchConfig = {
        labels: values.labels,
        query: values.query,
        startDate: values.startDate,
        endDate: values.endDate,
        previewLimit,
      };

      const response = await fetch(`/api/integrations/gmail/data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          integrationId,
          dataType: 'search-emails-preview',
          options: { searchConfig }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setPreviewResult({ error: errorData.error || response.statusText });
      } else {
        const result = await response.json();
        setPreviewResult(result.data);
      }
      setShowPreview(true);
    } catch (error: any) {
      logger.error('[GenericConfiguration] Error fetching Gmail search preview:', error);
      setPreviewResult({ error: error?.message || 'Failed to load preview' });
      setShowPreview(true);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handle Gmail advanced search preview
  const handleGmailAdvancedSearchPreview = async () => {
    setPreviewLoading(true);
    setPreviewResult(null);
    setShowPreview(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setPreviewResult({ error: 'Please sign in to preview search results' });
        setShowPreview(true);
        return;
      }

      // Build advanced search configuration
      const advancedSearchConfig = {
        searchMode: values.searchMode,
        from: values.from,
        to: values.to,
        subject: values.subject,
        hasAttachment: values.hasAttachment,
        attachmentName: values.attachmentName,
        isRead: values.isRead,
        isStarred: values.isStarred,
        dateRange: values.dateRange,
        afterDate: values.afterDate,
        beforeDate: values.beforeDate,
        hasLabel: values.hasLabel,
        customQuery: values.customQuery,
        maxResults: values.maxResults,
        includeSpam: values.includeSpam,
        previewLimit,
      };

      const response = await fetch(`/api/integrations/gmail/data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          integrationId,
          dataType: 'advanced-search-preview',
          options: { advancedSearchConfig }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setPreviewResult({ error: errorData.error || response.statusText });
      } else {
        const result = await response.json();
        setPreviewResult(result.data);
      }
      setShowPreview(true);
    } catch (error: any) {
      logger.error('[GenericConfiguration] Error fetching Gmail advanced search preview:', error);
      setPreviewResult({ error: error?.message || 'Failed to load preview' });
      setShowPreview(true);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleGmailMarkAsReadPreview = async () => {
    setPreviewLoading(true);
    setPreviewResult(null);
    setShowPreview(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setPreviewResult({ error: 'Please sign in to preview search results' });
        setShowPreview(true);
        return;
      }

      // Build mark as read configuration
      const markAsReadConfig = {
        from: values.from,
        to: values.to,
        subjectKeywords: values.subjectKeywords,
        bodyKeywords: values.bodyKeywords,
        keywordMatchType: values.keywordMatchType,
        hasAttachment: values.hasAttachment,
        hasLabel: values.hasLabel,
        isUnread: values.isUnread,
        maxMessages: values.maxMessages,
        previewLimit,
      };

      const response = await fetch(`/api/integrations/gmail/data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          integrationId,
          dataType: 'mark-as-read-preview',
          options: { markAsReadConfig }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setPreviewResult({ error: errorData.error || response.statusText });
      } else {
        const result = await response.json();
        setPreviewResult(result.data);
      }
      setShowPreview(true);
    } catch (error: any) {
      logger.error('[GenericConfiguration] Error fetching Gmail mark as read preview:', error);
      setPreviewResult({ error: error?.message || 'Failed to load preview' });
      setShowPreview(true);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleGmailMarkAsUnreadPreview = async () => {
    setPreviewLoading(true);
    setPreviewResult(null);
    setShowPreview(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setPreviewResult({ error: 'Please sign in to preview search results' });
        setShowPreview(true);
        return;
      }

      // Build mark as unread configuration
      const markAsUnreadConfig = {
        from: values.from,
        to: values.to,
        subjectKeywords: values.subjectKeywords,
        bodyKeywords: values.bodyKeywords,
        keywordMatchType: values.keywordMatchType,
        hasAttachment: values.hasAttachment,
        hasLabel: values.hasLabel,
        isUnread: values.isUnread,
        maxMessages: values.maxMessages,
        previewLimit,
      };

      const response = await fetch(`/api/integrations/gmail/data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          integrationId,
          dataType: 'mark-as-unread-preview',
          options: { markAsUnreadConfig }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setPreviewResult({ error: errorData.error || response.statusText });
      } else {
        const result = await response.json();
        setPreviewResult(result.data);
      }
      setShowPreview(true);
    } catch (error: any) {
      logger.error('[GenericConfiguration] Error fetching Gmail mark as unread preview:', error);
      setPreviewResult({ error: error?.message || 'Failed to load preview' });
      setShowPreview(true);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    logger.debug('🚀 [GenericConfiguration] handleSubmit called for:', nodeInfo?.type);
    e.preventDefault();

    // Debug logging for HubSpot
    if (nodeInfo?.type === 'hubspot_action_create_contact') {
      logger.debug('🎯 [GenericConfiguration] HubSpot create contact submission:', {
        nodeType: nodeInfo.type,
        values,
        baseFields: baseFields.map(f => ({ name: f.name, required: f.required, visible: shouldShowField(f) })),
        advancedFields: advancedFields.map(f => ({ name: f.name, required: f.required, visible: shouldShowField(f) }))
      });
    }

    // Validate required fields (only for visible fields)
    const allFields = [...baseFields, ...advancedFields];

    // Debug log for Notion validation
    if (nodeInfo?.type?.includes('notion')) {
      logger.debug('🔍 [GenericConfig] Notion validation debug:', {
        nodeType: nodeInfo.type,
        operation: values.operation,
        allFieldsCount: allFields.length,
        visibleFields: allFields.filter(f => shouldShowField(f)).map(f => f.name),
        requiredVisibleFields: allFields.filter(f => f.required && shouldShowField(f)).map(f => f.name),
        currentValues: values
      });
    }

    // When there are multiple fields with the same name (e.g., title for pages vs databases),
    // only validate the visible one. Use a Map to track field names we've already validated.
    const validatedFieldNames = new Set<string>();
    const errors: Record<string, string> = {};

    logger.debug('📋 [GenericConfiguration] Validating fields:', {
      totalFields: allFields.length,
      visibleFields: allFields.filter(f => shouldShowField(f)).map(f => f.name),
      currentValues: values
    });

    allFields.forEach(field => {
      // Skip if we've already validated this field name
      if (validatedFieldNames.has(field.name)) {
        return;
      }

      // Only validate if field is required AND visible
      if (field.required && shouldShowField(field)) {
        if (!values[field.name] && values[field.name] !== 0 && values[field.name] !== false) {
          errors[field.name] = `${field.label || field.name} is required`;
        }
        validatedFieldNames.add(field.name);
      }
    });

    const hasErrors = Object.keys(errors).length > 0;
    logger.debug('🔍 [GenericConfiguration] Validation check:', {
      hasErrors,
      errorCount: Object.keys(errors).length,
      nodeType: nodeInfo?.type,
      errors: hasErrors ? errors : 'No errors'
    });

    // Allow submit even when required fields are missing; store errors for modal UI
    setValidationErrors(errors);

    // Log attachment-related fields for Gmail send email and OneDrive upload
    if (nodeInfo?.type === 'gmail_action_send_email' || nodeInfo?.type === 'onedrive_action_upload_file') {
      logger.debug(`📎 [GenericConfiguration] ${nodeInfo?.type} values being saved:`, {
        sourceType: values.sourceType,
        uploadedFiles: values.uploadedFiles,
        uploadedFilesType: typeof values.uploadedFiles,
        uploadedFilesIsArray: Array.isArray(values.uploadedFiles),
        uploadedFilesLength: Array.isArray(values.uploadedFiles) ? values.uploadedFiles.length : 'N/A',
        uploadedFilesContent: Array.isArray(values.uploadedFiles) && values.uploadedFiles.length > 0 ? 
          values.uploadedFiles[0] : 'N/A',
        fileUrl: values.fileUrl,
        fileFromNode: values.fileFromNode,
        attachments: values.attachments,
        allValues: JSON.stringify(values, null, 2)
      });
    }

    logger.debug('✅ [GenericConfiguration] Submitting values:', {
      nodeType: nodeInfo?.type,
      values,
      onSubmitAvailable: !!onSubmit
    });

    if (!onSubmit) {
      logger.error('❌ [GenericConfiguration] onSubmit is not defined!');
      return;
    }

    logger.debug('📤 [GenericConfiguration] Calling onSubmit...');
    await onSubmit(values);
    logger.debug('✅ [GenericConfiguration] onSubmit completed');
  };

  // ServiceConnectionSelector in SetupTab now handles connection UI
  // No need for duplicate connection warning here

  // Show connection required message if no account is connected
  if (needsConnection) {
    // Get properly capitalized provider name
    const providerId = nodeInfo?.providerId || integrationId;
    const displayName = providerId ? getProviderDisplayName(providerId) : (integrationName || 'Account');

    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
        <h3 className="text-lg font-semibold mb-2">
          {displayName} Connection Required
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Please connect your account to use this {nodeInfo?.isTrigger ? 'trigger' : 'action'}.
        </p>
      </div>
    );
  }

  return (
    <ConfigurationContainer
      onSubmit={handleSubmit}
      onCancel={onCancel}
      onBack={onBack}
      isEditMode={isEditMode}
      isFormValid={isFormValid}
    >
      {/* Multi-account selector - shown when user has multiple accounts for this provider */}
      {showAccountSelector && connectedIntegrations.length > 1 && onSelectAccount && (
        <div className="mb-4 pb-4 border-b border-slate-200 dark:border-slate-700">
          <ServiceConnectionSelector
            providerId={nodeInfo?.providerId || ''}
            providerName={integrationName || nodeInfo?.providerId || 'Service'}
            connections={connectedIntegrations.map(i => ({
              id: i.id,
              provider: i.provider,
              email: i.email,
              username: i.username,
              accountName: i.account_name,
              avatar_url: i.avatar_url,
              status: i.status as any,
              workspace_type: i.workspace_type,
              workspace_id: i.workspace_id,
            }))}
            selectedConnection={connectedIntegrations.find(i => i.id === selectedIntegrationId) ? {
              id: selectedIntegrationId!,
              provider: connectedIntegrations.find(i => i.id === selectedIntegrationId)?.provider || '',
              email: connectedIntegrations.find(i => i.id === selectedIntegrationId)?.email,
              status: 'connected',
            } : undefined}
            onSelectConnection={onSelectAccount}
            onConnect={onConnectIntegration}
            autoFetch={false}
          />
        </div>
      )}

      {hasTabBasedFields ? (
        // New tab-based rendering
        // Using forceMount to prevent content unmounting on tab switch, which preserves form state
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
            <TabsTrigger value="memory">Memory</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-3" forceMount>
            {baseFields.length > 0 ? (
              renderFields(baseFields)
            ) : (
              <div className="text-sm text-slate-500 py-4">No basic configuration fields</div>
            )}
          </TabsContent>

          <TabsContent value="advanced" className="space-y-3" forceMount>
            {advancedFields.length > 0 ? (
              renderFields(advancedFields)
            ) : (
              <div className="text-sm text-slate-500 py-4">No advanced configuration fields</div>
            )}
          </TabsContent>

          <TabsContent value="memory" className="space-y-3" forceMount>
            {memoryFields.length > 0 ? (
              renderFields(memoryFields)
            ) : (
              <div className="text-sm text-slate-500 py-4">No memory configuration fields</div>
            )}
          </TabsContent>
        </Tabs>
      ) : (
        // Legacy advanced-based rendering
        <>
          {/* Base fields */}
          {baseFields.length > 0 && (
            <div className="space-y-3">
              {renderFields(baseFields)}
            </div>
          )}

          {/* Advanced fields */}
          {advancedFields.length > 0 && (
            <>
              <div className="border-t border-slate-200 pt-4 mt-6">
                <h3 className="text-sm font-medium text-slate-700 mb-3">Advanced Settings</h3>
                <div className="space-y-3">
                  {renderFields(advancedFields)}
                </div>
              </div>
            </>
          )}
        </>
      )}
      {/* Email Preview Button - Only for Outlook and Gmail Get Email actions when required fields are filled */}
      {(nodeInfo?.type === 'microsoft-outlook_action_fetch_emails' ||
        nodeInfo?.type === 'gmail_action_search_email') &&
       ((nodeInfo?.type === 'microsoft-outlook_action_fetch_emails' && values.folderId && values.query && values.startDate) ||
        (nodeInfo?.type === 'gmail_action_search_email' && values.labels && values.query && values.startDate)) && (
        <div className="border-t border-slate-200 pt-4 mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={handleEmailPreview}
            disabled={previewLoading}
            className="w-full"
          >
            {previewLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading Preview...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Preview Email
              </>
            )}
          </Button>

          {/* Preview Result */}
          {showPreview && previewResult && (
            <div className="mt-4 p-4 border border-slate-200 rounded-lg bg-slate-50 dark:bg-slate-800">
              {previewResult.error ? (
                <div className="text-sm text-red-600 dark:text-red-400">
                  <AlertTriangle className="inline-block mr-2 h-4 w-4" />
                  {previewResult.error === 'No emails found matching criteria'
                    ? 'No email currently matches your criteria'
                    : previewResult.error}
                </div>
              ) : (() => {
                const previewEmails = Array.isArray(previewResult.emails)
                  ? previewResult.emails
                  : (previewResult.email ? [previewResult.email] : [])

                if (!previewEmails.length) {
                  return (
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      No email currently matches your criteria
                    </div>
                  )
                }

                const displayEmails = previewEmails.slice(0, 3)
                const searchApplied = previewResult.searchApplied !== false
                const fallbackReason = typeof previewResult.fallbackReason === 'string'
                  ? previewResult.fallbackReason
                  : null

                return (
                  <div className="space-y-3">
                    <div className="flex flex-col gap-1">
                      <h4 className="font-medium text-sm text-slate-700 dark:text-slate-300">
                        Preview Results
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {searchApplied
                          ? (
                            <>
                              Showing up to {displayEmails.length} result{displayEmails.length > 1 ? 's' : ''} for
                              <span className="mx-1 rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:bg-slate-700 dark:text-slate-100">
                                {previewResult.query || previewQuery || 'your search'}
                              </span>
                            </>
                          ) : (
                            <>
                              Unable to preview the search results directly. Displaying the most recent messages in
                              this folder instead.
                            </>
                          )}
                      </p>
                      {!searchApplied && fallbackReason && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">
                          Outlook search returned an error while previewing: {fallbackReason.slice(0, 140)}{fallbackReason.length > 140 ? '...' : ''}
                        </p>
                      )}
                    </div>

                    <div className="space-y-3">
                      {displayEmails.map((message: any, index: number) => (
                        <div
                          key={message.id || `${message.subject}-${index}`}
                          className="rounded border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                              {message.subject || '(No subject)'}
                            </div>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {message.receivedDateTime ? new Date(message.receivedDateTime).toLocaleString() : 'Unknown time'}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            From: {message.from || 'Unknown sender'}
                          </div>
                          {message.hasAttachments && (
                            <div className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                              Has attachments
                            </div>
                          )}
                          <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                            {message.bodyPreview || 'No preview available'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}
      {/* Attachment Preview Button - For Outlook Get Attachments action when email ID is provided */}
      {(nodeInfo?.type === 'microsoft-outlook_action_get_attachment' ||
        nodeInfo?.type === 'microsoft-outlook_action_download_attachment') &&
       values.emailId && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={handleAttachmentPreview}
            disabled={previewLoading}
            className="w-full"
          >
            {previewLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading Preview...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Preview Email & Attachments
              </>
            )}
          </Button>

          {/* Preview Result */}
          {showPreview && previewResult && (
            <div className="mt-4 p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800">
              {previewResult.error ? (
                <div className="text-sm text-red-600 dark:text-red-400">
                  <AlertTriangle className="inline-block mr-2 h-4 w-4" />
                  {previewResult.error}
                </div>
              ) : previewResult.email ? (
                <div className="space-y-4">
                  {/* Email Info */}
                  <div className="rounded border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        {previewResult.email.subject || '(No subject)'}
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {previewResult.email.receivedDateTime ? new Date(previewResult.email.receivedDateTime).toLocaleString() : 'Unknown time'}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      From: {previewResult.email.fromName ? `${previewResult.email.fromName} <${previewResult.email.from}>` : previewResult.email.from || 'Unknown sender'}
                    </div>
                    {previewResult.email.to && previewResult.email.to.length > 0 && (
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        To: {previewResult.email.to.join(', ')}
                      </div>
                    )}
                    <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                      {previewResult.email.bodyPreview || 'No preview available'}
                    </div>
                  </div>

                  {/* Attachments List */}
                  <div>
                    <h4 className="font-medium text-sm text-slate-700 dark:text-slate-300 mb-2">
                      Attachments ({previewResult.fileCount || 0} file{previewResult.fileCount !== 1 ? 's' : ''}{previewResult.inlineCount > 0 ? `, ${previewResult.inlineCount} inline` : ''})
                    </h4>
                    {previewResult.attachments && previewResult.attachments.length > 0 ? (
                      <div className="space-y-2">
                        {previewResult.attachments.map((att: any, index: number) => (
                          <div
                            key={att.id || index}
                            className={`flex items-center justify-between rounded border p-2 text-sm ${
                              att.isInline
                                ? 'border-slate-200 bg-slate-100 dark:border-slate-600 dark:bg-slate-700'
                                : 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/30'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Paperclip className="w-4 h-4 text-slate-400 flex-shrink-0" />
                              <span className="text-slate-600 dark:text-slate-300 truncate">{att.name}</span>
                              {att.isInline && (
                                <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">(inline)</span>
                              )}
                            </div>
                            <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0 ml-2">
                              {att.size ? `${(att.size / 1024).toFixed(1)} KB` : 'Unknown size'}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500 dark:text-slate-400">
                        No attachments found in this email
                      </div>
                    )}
                  </div>

                  {/* Download Mode Info */}
                  {values.downloadMode && values.downloadMode !== 'all' && previewResult.attachments && previewResult.attachments.length > 0 && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700 pt-3">
                      {values.downloadMode === 'by_extension' && values.fileExtensions && (
                        <span>
                          With your current filter ({values.fileExtensions}), {
                            previewResult.attachments.filter((att: any) => {
                              if (att.isInline && values.excludeInline !== false) return false;
                              const extensions = values.fileExtensions.split(',').map((ext: string) => ext.trim().toLowerCase().replace(/^\./, ''));
                              const fileExt = att.name?.split('.').pop()?.toLowerCase() || '';
                              return extensions.includes(fileExt);
                            }).length
                          } attachment(s) would be downloaded.
                        </span>
                      )}
                      {values.downloadMode === 'by_name' && values.fileNameFilter && (
                        <span>
                          With your current filter ("{values.fileNameFilter}"), {
                            previewResult.attachments.filter((att: any) => {
                              if (att.isInline && values.excludeInline !== false) return false;
                              return att.name?.toLowerCase().includes(values.fileNameFilter.toLowerCase());
                            }).length
                          } attachment(s) would be downloaded.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  No email data available
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {/* Email Preview Button - For Outlook Forward/Delete Email actions when email ID is provided */}
      {(nodeInfo?.type === 'microsoft-outlook_action_forward_email' ||
        nodeInfo?.type === 'microsoft-outlook_action_delete_email') &&
       values.emailId && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={handleOutlookEmailByIdPreview}
            disabled={previewLoading}
            className="w-full"
          >
            {previewLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading Preview...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Preview Email
              </>
            )}
          </Button>

          {/* Preview Result */}
          {showPreview && previewResult && (
            <div className="mt-4 p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800">
              {previewResult.error ? (
                <div className="text-sm text-red-600 dark:text-red-400">
                  <AlertTriangle className="inline-block mr-2 h-4 w-4" />
                  {previewResult.error}
                </div>
              ) : previewResult.email ? (
                <div className="space-y-4">
                  {/* Email Info */}
                  <div className="rounded border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        {previewResult.email.subject || '(No subject)'}
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {previewResult.email.receivedDateTime ? new Date(previewResult.email.receivedDateTime).toLocaleString() : 'Unknown time'}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      From: {previewResult.email.fromName ? `${previewResult.email.fromName} <${previewResult.email.from}>` : previewResult.email.from || 'Unknown sender'}
                    </div>
                    {previewResult.email.to && previewResult.email.to.length > 0 && (
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        To: {previewResult.email.to.join(', ')}
                      </div>
                    )}
                    {previewResult.email.cc && previewResult.email.cc.length > 0 && (
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        CC: {previewResult.email.cc.join(', ')}
                      </div>
                    )}
                    <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                      {previewResult.email.bodyPreview || 'No preview available'}
                    </div>
                    {previewResult.email.hasAttachments && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                        <Paperclip className="w-3 h-3" />
                        <span>Has attachments</span>
                      </div>
                    )}
                  </div>

                  {/* Action-specific info */}
                  {nodeInfo?.type === 'microsoft-outlook_action_delete_email' && (
                    <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-2">
                      <AlertTriangle className="inline-block mr-1 h-3 w-3" />
                      {values.permanentDelete ?
                        'This email will be permanently deleted and cannot be recovered.' :
                        'This email will be moved to the Deleted Items folder.'
                      }
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  No email data available
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {/* Google Drive Search Preview Button - Always available for search_files action */}
      {nodeInfo?.type === 'google-drive:search_files' &&
       values?.searchMode &&
       integrationId && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-6 space-y-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleDriveSearchPreview}
            disabled={previewLoading}
            className="w-full"
          >
            {previewLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading Preview...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Preview Results
              </>
            )}
          </Button>

          {/* Preview Results */}
          {showPreview && previewResult && (
            <div className="mt-4 p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800">
              {previewResult.error ? (
                <div className="text-sm text-red-600 dark:text-red-400">
                  <AlertTriangle className="inline-block mr-2 h-4 w-4" />
                  {previewResult.error}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <h4 className="font-medium text-sm text-slate-700 dark:text-slate-300">
                        Preview Results
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Found {previewResult.totalCount}{previewResult.hasMore ? '+' : ''} file{previewResult.totalCount === 1 ? '' : 's'}
                        {previewResult.files && previewResult.files.length > 0 && ` (showing ${Math.min(previewLimit, previewResult.files.length)} of ${previewResult.files.length})`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">Show:</span>
                        <div className="w-[100px]">
                          <GenericSelectField
                            field={PREVIEW_LIMIT_FIELD}
                            value={previewLimit.toString()}
                            onChange={(value) => setPreviewLimit(parseInt(value))}
                            options={PREVIEW_LIMIT_OPTIONS}
                            isLoading={false}
                          />
                        </div>
                      </div>
                      <a
                        href={buildGoogleDriveSearchUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 whitespace-nowrap"
                      >
                        View in Google Drive
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>

                  {previewResult.files && previewResult.files.length > 0 ? (
                    <div className="space-y-2">
                      {previewResult.files.slice(0, previewLimit).map((file: any, index: number) => (
                        <div
                          key={file.id || index}
                          className="rounded border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                              {file.name}
                            </div>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                            <div>
                              <span className="font-medium">Owner:</span> {file.owner}
                            </div>
                            <div>
                              <span className="font-medium">Size:</span>{' '}
                              {file.size ? `${(parseInt(file.size) / 1024).toFixed(1)} KB` : 'N/A'}
                            </div>
                            <div>
                              <span className="font-medium">Modified:</span>{' '}
                              {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : 'Unknown'}
                            </div>
                            <div>
                              <span className="font-medium">Created:</span>{' '}
                              {file.createdTime ? new Date(file.createdTime).toLocaleDateString() : 'Unknown'}
                            </div>
                          </div>
                          {file.mimeType && (
                            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                              Type: {file.mimeType.split('/').pop()?.replace('vnd.google-apps.', '')}
                            </div>
                          )}
                        </div>
                      ))}
                      {previewResult.hasMore && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                          ...and more results
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      No files found matching your criteria
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Google Drive List Files Preview Button - Only for list_files action with folder selected */}
      {nodeInfo?.type === 'google-drive:list_files' &&
       values?.folderId &&
       integrationId && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-6 space-y-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleDriveListFilesPreview}
            disabled={previewLoading}
            className="w-full"
          >
            {previewLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading Preview...
              </>
            ) : (
              <>
                <FolderOpen className="mr-2 h-4 w-4" />
                Preview Files in Folder
              </>
            )}
          </Button>

          {/* Preview Results */}
          {showPreview && previewResult && (
            <div className="mt-4 p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800">
              {previewResult.error ? (
                <div className="text-sm text-red-600 dark:text-red-400">
                  <AlertTriangle className="inline-block mr-2 h-4 w-4" />
                  {previewResult.error}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <h4 className="font-medium text-sm text-slate-700 dark:text-slate-300">
                        Preview Results
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Found {previewResult.totalCount}{previewResult.hasMore ? '+' : ''} item{previewResult.totalCount === 1 ? '' : 's'}
                        {previewResult.files && previewResult.files.length > 0 && ` (showing ${Math.min(previewLimit, previewResult.files.length)} of ${previewResult.files.length})`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">Show:</span>
                      <div className="w-[100px]">
                        <GenericSelectField
                          field={PREVIEW_LIMIT_FIELD}
                          value={previewLimit.toString()}
                          onChange={(value) => setPreviewLimit(parseInt(value))}
                          options={PREVIEW_LIMIT_OPTIONS}
                          isLoading={false}
                        />
                      </div>
                    </div>
                  </div>

                  {previewResult.files && previewResult.files.length > 0 ? (
                    <div className="space-y-2">
                      {previewResult.files.slice(0, previewLimit).map((file: any, index: number) => (
                        <div
                          key={file.id || index}
                          className="rounded border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                              {file.name}
                            </div>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                            <div>
                              <span className="font-medium">Owner:</span> {file.owner}
                            </div>
                            <div>
                              <span className="font-medium">Size:</span>{' '}
                              {file.size ? `${(parseInt(file.size) / 1024).toFixed(1)} KB` : 'N/A'}
                            </div>
                            <div>
                              <span className="font-medium">Modified:</span>{' '}
                              {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : 'Unknown'}
                            </div>
                            <div>
                              <span className="font-medium">Created:</span>{' '}
                              {file.createdTime ? new Date(file.createdTime).toLocaleDateString() : 'Unknown'}
                            </div>
                          </div>
                          {file.mimeType && (
                            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                              Type: {file.mimeType.split('/').pop()?.replace('vnd.google-apps.', '')}
                            </div>
                          )}
                        </div>
                      ))}
                      {previewResult.hasMore && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                          ...and more results
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      No files found in this folder
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Gmail Search Emails Preview Button - Only for search_email action with search criteria */}
      {nodeInfo?.type === 'gmail_action_search_email' &&
       values?.labels &&
       integrationId && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-6 space-y-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleGmailSearchEmailsPreview}
            disabled={previewLoading}
            className="w-full"
          >
            {previewLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading Preview...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Preview Matching Emails
              </>
            )}
          </Button>

          {/* Preview Results */}
          {showPreview && previewResult && (
            <div className="mt-4 p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800">
              {previewResult.error ? (
                <div className="text-sm text-red-600 dark:text-red-400">
                  <AlertTriangle className="inline-block mr-2 h-4 w-4" />
                  {previewResult.error}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <h4 className="font-medium text-sm text-slate-700 dark:text-slate-300">
                        Preview Results
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Found {previewResult.totalCount}{previewResult.hasMore ? '+' : ''} email{previewResult.totalCount === 1 ? '' : 's'}
                        {previewResult.emails && previewResult.emails.length > 0 && ` (showing ${previewResult.emails.length})`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">Show:</span>
                      <div className="min-w-[100px]">
                        <GenericSelectField
                          field={PREVIEW_LIMIT_FIELD}
                          value={previewLimit.toString()}
                          onChange={(value) => {
                            setPreviewLimit(parseInt(value))
                            // Auto-refresh preview when limit changes
                            setTimeout(() => handleGmailSearchEmailsPreview(), 100)
                          }}
                          options={GMAIL_PREVIEW_LIMIT_OPTIONS}
                          isLoading={false}
                        />
                      </div>
                    </div>
                  </div>

                  {previewResult.emails && previewResult.emails.length > 0 ? (
                    <div className="space-y-2">
                      {previewResult.emails.map((email: any, index: number) => {
                        const isExpanded = expandedEmails.has(email.id || index.toString());
                        return (
                          <div
                            key={email.id || index}
                            className="rounded border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            onClick={() => {
                              const emailKey = email.id || index.toString();
                              setExpandedEmails(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(emailKey)) {
                                  newSet.delete(emailKey);
                                } else {
                                  newSet.add(emailKey);
                                }
                                return newSet;
                              });
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 flex-1">
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                )}
                                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                  {email.subject}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {email.hasAttachment && (
                                  <span className="text-xs text-slate-500 dark:text-slate-400">📎</span>
                                )}
                                {email.isStarred && (
                                  <span className="text-xs text-yellow-500">⭐</span>
                                )}
                                {email.isUnread && (
                                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
                                )}
                              </div>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                              <div>
                                <span className="font-medium">From:</span> {email.from}
                              </div>
                              <div>
                                <span className="font-medium">Date:</span>{' '}
                                {email.date ? new Date(email.date).toLocaleDateString() : 'Unknown'}
                              </div>
                            </div>
                            {!isExpanded && email.snippet && (
                              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                                {email.snippet}
                              </div>
                            )}

                            {isExpanded && (
                              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                                {email.to && (
                                  <div className="mb-2 text-xs text-slate-600 dark:text-slate-400">
                                    <span className="font-medium">To:</span> {email.to}
                                  </div>
                                )}

                                <div className="mt-3 text-sm">
                                  {email.bodyHtml ? (
                                    <iframe
                                      srcDoc={email.bodyHtml}
                                      className="w-full min-h-[400px] border border-slate-200 dark:border-slate-700 rounded bg-white"
                                      sandbox="allow-same-origin"
                                      title={`Email: ${email.subject}`}
                                    />
                                  ) : email.bodyText ? (
                                    <pre className="whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-3 rounded border border-slate-200 dark:border-slate-700 max-h-[400px] overflow-y-auto">
                                      {email.bodyText}
                                    </pre>
                                  ) : (
                                    <p className="text-xs text-slate-500 dark:text-slate-400 italic">No email body available</p>
                                  )}
                                </div>

                                {email.attachments && email.attachments.length > 0 && (
                                  <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
                                    <h5 className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                                      Attachments ({email.attachments.length}):
                                    </h5>
                                    <div className="space-y-1">
                                      {email.attachments.map((att: any, attIndex: number) => (
                                        <div key={attIndex} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                                          <span>📎</span>
                                          <span className="font-medium">{att.filename}</span>
                                          <span className="text-slate-500">
                                            ({att.size ? `${(att.size / 1024).toFixed(1)} KB` : 'Unknown size'})
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {previewResult.hasMore && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                          ...and more results
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      No emails found matching your criteria
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Gmail Advanced Search Preview Button - Only for advanced_search action with search criteria */}
      {nodeInfo?.type === 'gmail_action_advanced_search' &&
       integrationId &&
       (
         (values.searchMode === 'filters' && (values.from || values.to || values.subject || values.hasLabel || values.dateRange !== 'any')) ||
         (values.searchMode === 'query' && values.customQuery)
       ) && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-6 space-y-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleGmailAdvancedSearchPreview}
            disabled={previewLoading}
            className="w-full"
          >
            {previewLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading Preview...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Preview Search Results
              </>
            )}
          </Button>

          {/* Preview Results */}
          {showPreview && previewResult && (
            <div className="mt-4 p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800">
              {previewResult.error ? (
                <div className="text-sm text-red-600 dark:text-red-400">
                  <AlertTriangle className="inline-block mr-2 h-4 w-4" />
                  {previewResult.error}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <h4 className="font-medium text-sm text-slate-700 dark:text-slate-300">
                        Preview Results
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Found {previewResult.totalCount}{previewResult.hasMore ? '+' : ''} email{previewResult.totalCount === 1 ? '' : 's'}
                        {previewResult.emails && previewResult.emails.length > 0 && ` (showing ${previewResult.emails.length})`}
                      </p>
                      {previewResult.query && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                          {previewResult.query}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">Show:</span>
                      <div className="min-w-[100px]">
                        <GenericSelectField
                          field={PREVIEW_LIMIT_FIELD}
                          value={previewLimit.toString()}
                          onChange={(value) => {
                            setPreviewLimit(parseInt(value))
                            // Auto-refresh preview when limit changes
                            setTimeout(() => handleGmailAdvancedSearchPreview(), 100)
                          }}
                          options={GMAIL_PREVIEW_LIMIT_OPTIONS}
                          isLoading={false}
                        />
                      </div>
                    </div>
                  </div>

                  {previewResult.emails && previewResult.emails.length > 0 ? (
                    <div className="space-y-2">
                      {previewResult.emails.map((email: any, index: number) => {
                        const isExpanded = expandedEmails.has(email.id || index.toString());
                        return (
                          <div
                            key={email.id || index}
                            className="rounded border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            onClick={() => {
                              const emailKey = email.id || index.toString();
                              setExpandedEmails(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(emailKey)) {
                                  newSet.delete(emailKey);
                                } else {
                                  newSet.add(emailKey);
                                }
                                return newSet;
                              });
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 flex-1">
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                )}
                                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                  {email.subject}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {email.hasAttachment && (
                                  <span className="text-xs text-slate-500 dark:text-slate-400">📎</span>
                                )}
                                {email.isStarred && (
                                  <span className="text-xs text-yellow-500">⭐</span>
                                )}
                                {email.isUnread && (
                                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
                                )}
                              </div>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                              <div>
                                <span className="font-medium">From:</span> {email.from}
                              </div>
                              <div>
                                <span className="font-medium">Date:</span>{' '}
                                {email.date ? new Date(email.date).toLocaleDateString() : 'Unknown'}
                              </div>
                            </div>
                            {!isExpanded && email.snippet && (
                              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                                {email.snippet}
                              </div>
                            )}

                            {isExpanded && (
                              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                                {email.to && (
                                  <div className="mb-2 text-xs text-slate-600 dark:text-slate-400">
                                    <span className="font-medium">To:</span> {email.to}
                                  </div>
                                )}

                                <div className="mt-3 text-sm">
                                  {email.bodyHtml ? (
                                    <iframe
                                      srcDoc={email.bodyHtml}
                                      className="w-full min-h-[400px] border border-slate-200 dark:border-slate-700 rounded bg-white"
                                      sandbox="allow-same-origin"
                                      title={`Email: ${email.subject}`}
                                    />
                                  ) : email.bodyText ? (
                                    <pre className="whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-3 rounded border border-slate-200 dark:border-slate-700 max-h-[400px] overflow-y-auto">
                                      {email.bodyText}
                                    </pre>
                                  ) : (
                                    <p className="text-xs text-slate-500 dark:text-slate-400 italic">No email body available</p>
                                  )}
                                </div>

                                {email.attachments && email.attachments.length > 0 && (
                                  <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
                                    <h5 className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                                      Attachments ({email.attachments.length}):
                                    </h5>
                                    <div className="space-y-1">
                                      {email.attachments.map((att: any, attIndex: number) => (
                                        <div key={attIndex} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                                          <span>📎</span>
                                          <span className="font-medium">{att.filename}</span>
                                          <span className="text-slate-500">
                                            ({att.size ? `${(att.size / 1024).toFixed(1)} KB` : 'Unknown size'})
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {previewResult.hasMore && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                          ...and more results
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      No emails found matching your criteria
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Gmail Mark as Read Preview Button - Only when search mode is active with criteria */}
      {nodeInfo?.type === 'gmail_action_mark_as_read' &&
       values?.messageSelection === 'search' &&
       integrationId &&
       (values.from || values.to || values.subjectKeywords?.length > 0 || values.bodyKeywords?.length > 0 || values.hasLabel || values.isUnread !== 'any') && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-6 space-y-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleGmailMarkAsReadPreview}
            disabled={previewLoading}
            className="w-full"
          >
            {previewLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading Preview...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Preview Emails to Mark as Read
              </>
            )}
          </Button>

          {/* Preview Results */}
          {showPreview && previewResult && (
            <div className="mt-4 p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800">
              {previewResult.error ? (
                <div className="text-sm text-red-600 dark:text-red-400">
                  <AlertTriangle className="inline-block mr-2 h-4 w-4" />
                  {previewResult.error}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <h4 className="font-medium text-sm text-slate-700 dark:text-slate-300">
                        Preview Results
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Found {previewResult.totalCount}{previewResult.hasMore ? '+' : ''} email{previewResult.totalCount === 1 ? '' : 's'} that will be marked as read
                        {previewResult.emails && previewResult.emails.length > 0 && ` (showing ${previewResult.emails.length})`}
                      </p>
                      {previewResult.query && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                          {previewResult.query}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">Show:</span>
                      <div className="min-w-[100px]">
                        <GenericSelectField
                          field={PREVIEW_LIMIT_FIELD}
                          value={previewLimit.toString()}
                          onChange={(value) => {
                            setPreviewLimit(parseInt(value))
                            setTimeout(() => handleGmailMarkAsReadPreview(), 100)
                          }}
                          options={GMAIL_PREVIEW_LIMIT_OPTIONS}
                          isLoading={false}
                        />
                      </div>
                    </div>
                  </div>

                  {previewResult.emails && previewResult.emails.length > 0 ? (
                    <div className="space-y-2">
                      {previewResult.emails.map((email: any, index: number) => {
                        const isExpanded = expandedEmails.has(email.id || index.toString());
                        return (
                          <div
                            key={email.id || index}
                            className="rounded border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            onClick={() => {
                              const emailKey = email.id || index.toString();
                              setExpandedEmails(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(emailKey)) {
                                  newSet.delete(emailKey);
                                } else {
                                  newSet.add(emailKey);
                                }
                                return newSet;
                              });
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 flex-1">
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                )}
                                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                  {email.subject}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {email.hasAttachment && (
                                  <span className="text-xs text-slate-500 dark:text-slate-400">📎</span>
                                )}
                                {email.isStarred && (
                                  <span className="text-xs text-yellow-500">⭐</span>
                                )}
                                {email.isUnread && (
                                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
                                )}
                              </div>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                              <div>
                                <span className="font-medium">From:</span> {email.from}
                              </div>
                              <div>
                                <span className="font-medium">Date:</span>{' '}
                                {email.date ? new Date(email.date).toLocaleDateString() : 'Unknown'}
                              </div>
                            </div>
                            {!isExpanded && email.snippet && (
                              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                                {email.snippet}
                              </div>
                            )}

                            {isExpanded && (
                              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                                {email.to && (
                                  <div className="mb-2 text-xs text-slate-600 dark:text-slate-400">
                                    <span className="font-medium">To:</span> {email.to}
                                  </div>
                                )}
                                {email.snippet && (
                                  <div className="mb-2 text-xs text-slate-600 dark:text-slate-400">
                                    <span className="font-medium">Preview:</span> {email.snippet}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {previewResult.hasMore && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                          ...and more results
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      No emails found matching your criteria
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Gmail Mark as Unread Preview Button - Only when search mode is active with criteria */}
      {nodeInfo?.type === 'gmail_action_mark_as_unread' &&
       values?.messageSelection === 'search' &&
       integrationId &&
       (values.from || values.to || values.subjectKeywords?.length > 0 || values.bodyKeywords?.length > 0 || values.hasLabel || values.isUnread !== 'any') && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-6 space-y-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleGmailMarkAsUnreadPreview}
            disabled={previewLoading}
            className="w-full"
          >
            {previewLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading Preview...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Preview Emails to Mark as Unread
              </>
            )}
          </Button>

          {/* Preview Results */}
          {showPreview && previewResult && (
            <div className="mt-4 p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800">
              {previewResult.error ? (
                <div className="text-sm text-red-600 dark:text-red-400">
                  <AlertTriangle className="inline-block mr-2 h-4 w-4" />
                  {previewResult.error}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <h4 className="font-medium text-sm text-slate-700 dark:text-slate-300">
                        Preview Results
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Found {previewResult.totalCount}{previewResult.hasMore ? '+' : ''} email{previewResult.totalCount === 1 ? '' : 's'} that will be marked as unread
                        {previewResult.emails && previewResult.emails.length > 0 && ` (showing ${previewResult.emails.length})`}
                      </p>
                      {previewResult.query && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                          {previewResult.query}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">Show:</span>
                      <div className="min-w-[100px]">
                        <GenericSelectField
                          field={PREVIEW_LIMIT_FIELD}
                          value={previewLimit.toString()}
                          onChange={(value) => {
                            setPreviewLimit(parseInt(value))
                            setTimeout(() => handleGmailMarkAsUnreadPreview(), 100)
                          }}
                          options={GMAIL_PREVIEW_LIMIT_OPTIONS}
                          isLoading={false}
                        />
                      </div>
                    </div>
                  </div>

                  {previewResult.emails && previewResult.emails.length > 0 ? (
                    <div className="space-y-2">
                      {previewResult.emails.map((email: any, index: number) => {
                        const isExpanded = expandedEmails.has(email.id || index.toString());
                        return (
                          <div
                            key={email.id || index}
                            className="rounded border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            onClick={() => {
                              const emailKey = email.id || index.toString();
                              setExpandedEmails(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(emailKey)) {
                                  newSet.delete(emailKey);
                                } else {
                                  newSet.add(emailKey);
                                }
                                return newSet;
                              });
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 flex-1">
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                )}
                                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                  {email.subject}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {email.hasAttachment && (
                                  <span className="text-xs text-slate-500 dark:text-slate-400">📎</span>
                                )}
                                {email.isStarred && (
                                  <span className="text-xs text-yellow-500">⭐</span>
                                )}
                                {email.isUnread && (
                                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
                                )}
                              </div>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                              <div>
                                <span className="font-medium">From:</span> {email.from}
                              </div>
                              <div>
                                <span className="font-medium">Date:</span>{' '}
                                {email.date ? new Date(email.date).toLocaleDateString() : 'Unknown'}
                              </div>
                            </div>
                            {!isExpanded && email.snippet && (
                              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                                {email.snippet}
                              </div>
                            )}

                            {isExpanded && (
                              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                                {email.to && (
                                  <div className="mb-2 text-xs text-slate-600 dark:text-slate-400">
                                    <span className="font-medium">To:</span> {email.to}
                                  </div>
                                )}
                                {email.snippet && (
                                  <div className="mb-2 text-xs text-slate-600 dark:text-slate-400">
                                    <span className="font-medium">Preview:</span> {email.snippet}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {previewResult.hasMore && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                          ...and more results
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      No emails found matching your criteria
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </ConfigurationContainer>
  );
}
