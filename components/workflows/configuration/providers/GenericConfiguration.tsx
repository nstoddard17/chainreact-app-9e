"use client"

import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronLeft, Mail, Loader2, Search, ExternalLink } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FieldRenderer } from '../fields/FieldRenderer';
import { AIFieldWrapper } from '../fields/AIFieldWrapper';
import { ConfigurationContainer } from '../components/ConfigurationContainer';
import { FieldVisibilityEngine } from '@/lib/workflows/fields/visibility';
import { supabase } from '@/utils/supabaseClient';

import { logger } from '@/lib/utils/logger'

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
}: GenericConfigurationProps) {
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [localLoadingFields, setLocalLoadingFields] = useState<Set<string>>(new Set());
  const [isFormValid, setIsFormValid] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const previewQuery = typeof values?.query === 'string' ? values.query.trim() : '';

  // Use prop if provided, otherwise use local state
  const loadingFields = loadingFieldsProp || localLoadingFields;
  const setLoadingFields = loadingFieldsProp ? () => {} : setLocalLoadingFields;

  // Store current values in a ref to avoid re-creating callbacks
  const valuesRef = useRef(values);
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

    // Don't set loading state here - useDynamicOptions handles it

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
        }
      }
      // No dependencies, just load the field
      else {
        logger.debug('🔄 [GenericConfig] Calling loadOptions without dependencies:', { fieldName, forceReload });
        await loadOptions(fieldName, undefined, undefined, forceReload);
      }
    } catch (error) {
      logger.error('❌ [GenericConfig] Error loading dynamic options:', error);
    }
  }, [nodeInfo, loadOptions]);

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

  // Apply default values to fields when they become visible
  useEffect(() => {
    if (!nodeInfo?.configSchema) return;

    nodeInfo.configSchema.forEach((field: any) => {
      // Check if field has a default value defined
      if (field.defaultValue !== undefined) {
        // Check if field is now visible
        const isVisible = FieldVisibilityEngine.isFieldVisible(field, values, nodeInfo);

        // Apply default if field is visible and doesn't have a value yet
        if (isVisible && (values[field.name] === undefined || values[field.name] === '')) {
          logger.debug(`[GenericConfig] Applying default value to ${field.name}:`, field.defaultValue);
          setValue(field.name, field.defaultValue);
        }
      }
    });
  }, [values, nodeInfo, setValue]);

  // Handle field value changes and trigger dependent field loading
  const handleFieldChange = useCallback(async (fieldName: string, value: any) => {
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
    return fields.map((field, index) => {
      // Special handling for Google Drive preview field
      if (field.type === 'google_drive_preview') {
        // Lazy import to avoid circular dependencies
        const { GoogleDriveFilePreview } = require('@/components/workflows/configuration/components/google-drive/GoogleDriveFilePreview');
        return (
          <GoogleDriveFilePreview
            key={`field-${field.name}-${index}`}
            fileId={values.fileId}
            showPreview={showPreview}
            onTogglePreview={() => setShowPreview(!showPreview)}
          />
        );
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

      return (
        <div key={`field-${field.name}-${index}`} data-config-field={field.name}>
          <Component
            field={field}
            value={values[field.name]}
            onChange={(value) => handleFieldChange(field.name, value)}
            error={errors[field.name] || validationErrors[field.name]}
            workflowData={workflowData}
            currentNodeId={currentNodeId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={(() => {
              const isLoading = loadingFields.has(field.name);
              if (field.name === 'cardId' || field.name === 'listId') {
                logger.debug(`🔍 [GenericConfig] Loading state for ${field.name}:`, {
                  fieldName: field.name,
                  hasInLoadingFields: loadingFields.has(field.name),
                  finalIsLoading: isLoading,
                  loadingFieldsSize: loadingFields.size,
                  loadingFieldsContent: Array.from(loadingFields)
                });
              }
              return isLoading;
            })()}
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

      // Build search configuration
      const searchConfig = {
        searchMode: values.searchMode,
        fileName: values.fileName,
        exactMatch: values.exactMatch,
        fileType: values.fileType,
        modifiedTime: values.modifiedTime,
        owner: values.owner,
        customQuery: values.customQuery,
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

  return (
    <ConfigurationContainer
      onSubmit={handleSubmit}
      onCancel={onCancel}
      onBack={onBack}
      isEditMode={isEditMode}
      isFormValid={isFormValid}
    >
      {hasTabBasedFields ? (
        // New tab-based rendering
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
            <TabsTrigger value="memory">Memory</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-3">
            {baseFields.length > 0 ? (
              renderFields(baseFields)
            ) : (
              <div className="text-sm text-slate-500 py-4">No basic configuration fields</div>
            )}
          </TabsContent>

          <TabsContent value="advanced" className="space-y-3">
            {advancedFields.length > 0 ? (
              renderFields(advancedFields)
            ) : (
              <div className="text-sm text-slate-500 py-4">No advanced configuration fields</div>
            )}
          </TabsContent>

          <TabsContent value="memory" className="space-y-3">
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
      {/* Google Drive Search Preview Button - Only for search_files action with search criteria */}
      {nodeInfo?.type === 'google-drive:search_files' &&
       values?.searchMode &&
       integrationId &&
       (
         (values.searchMode === 'simple' && values.fileName) ||
         (values.searchMode === 'advanced' && (values.fileType || values.modifiedTime || values.owner)) ||
         (values.searchMode === 'query' && values.customQuery)
       ) && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-6">
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
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <h4 className="font-medium text-sm text-slate-700 dark:text-slate-300">
                        Preview Results
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Found {previewResult.totalCount}{previewResult.hasMore ? '+' : ''} file{previewResult.totalCount === 1 ? '' : 's'}
                        {previewResult.files && previewResult.files.length > 0 && ` (showing ${previewResult.files.length})`}
                      </p>
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

                  {previewResult.files && previewResult.files.length > 0 ? (
                    <div className="space-y-2">
                      {previewResult.files.map((file: any, index: number) => (
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
    </ConfigurationContainer>
  );
}
