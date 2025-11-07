"use client"

import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Database, RefreshCw, ChevronDown } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { FieldRenderer } from '../fields/FieldRenderer';
import { useIntegrationStore } from '@/stores/integrationStore';
import { useAirtableBubbleHandler } from '../hooks/useAirtableBubbleHandler';
import { useFieldValidation } from '../hooks/useFieldValidation';
import { AirtableRecordsTable } from '../AirtableRecordsTable';
import { FieldChecklistWithOverride } from '../FieldChecklistWithOverride';
import { getAirtableFieldTypeFromSchema, isEditableFieldType } from '../utils/airtableHelpers';
import { BubbleDisplay } from '../components/BubbleDisplay';

import { logger } from '@/lib/utils/logger'

interface AirtableConfigurationProps {
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
  loadingFields?: Set<string>;
  loadOptions: (fieldName: string, parentField?: string, parentValue?: any, forceReload?: boolean, silent?: boolean, extraOptions?: Record<string, any>) => Promise<void>;
  integrationName?: string;
  needsConnection?: boolean;
  onConnectIntegration?: () => void;
  aiFields?: Record<string, boolean>;
  setAiFields?: (fields: Record<string, boolean>) => void;
  // Optional provider-specific state (from parent)
  selectedRecord?: any;
  setSelectedRecord?: (record: any) => void;
  previewData?: any[];
  setPreviewData?: (data: any[]) => void;
  showPreviewData?: boolean;
  setShowPreviewData?: (show: boolean) => void;
  airtableRecords?: any[];
  setAirtableRecords?: (records: any[]) => void;
  airtableTableSchema?: any;
  setAirtableTableSchema?: (schema: any) => void;
  isTemplateEditing?: boolean;
  templateDefaults?: Record<string, any> | undefined;
  initialConfig?: Record<string, any>;
}

export function AirtableConfiguration({
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
  loadingFields: parentLoadingFields,
  loadOptions,
  integrationName,
  needsConnection,
  onConnectIntegration,
  aiFields = {},
  setAiFields = () => {},
  // Optional state from parent
  selectedRecord: parentSelectedRecord,
  setSelectedRecord: parentSetSelectedRecord,
  previewData: parentPreviewData,
  setPreviewData: parentSetPreviewData,
  showPreviewData: parentShowPreviewData,
  setShowPreviewData: parentSetShowPreviewData,
  airtableRecords: parentAirtableRecords,
  setAirtableRecords: parentSetAirtableRecords,
  airtableTableSchema: parentAirtableTableSchema,
  setAirtableTableSchema: parentSetAirtableTableSchema,
  isTemplateEditing = false,
  templateDefaults,
  initialConfig,
}: AirtableConfigurationProps) {
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Get integration store to check if Airtable integration is available
  const { integrations, getIntegrationByProvider } = useIntegrationStore();
  const airtableIntegration = getIntegrationByProvider('airtable');

  // Diagnostic logging on mount
  useEffect(() => {
    console.log('🔍 [AirtableConfig] Component mounted', {
      nodeType: nodeInfo?.type,
      isTrigger: nodeInfo?.isTrigger,
      providerId: nodeInfo?.providerId,
      baseId: values.baseId,
      watchedTables: values.watchedTables,
      totalIntegrations: integrations.length,
      allProviders: integrations.map(i => ({ provider: i.provider, status: i.status })),
      airtableIntegrationFound: !!airtableIntegration,
      airtableIntegrationStatus: airtableIntegration?.status
    });
  }, []);
  
  // Bubble state management
  const [fieldSuggestions, setFieldSuggestions] = useState<Record<string, any[]>>({});
  const [activeBubbles, setActiveBubbles] = useState<Record<string, number | number[]>>({});
  const [originalBubbleValues, setOriginalBubbleValues] = useState<Record<string, any>>({});
  
  // Field validation hook
  const { 
    isFieldVisible, 
    validateRequiredFields, 
    canSubmit 
  } = useFieldValidation({ nodeInfo, values });
  
  // Use parent state if provided, otherwise use local state
  const [localLoadingFields, setLocalLoadingFields] = useState<Set<string>>(new Set());
  const [searchFieldOptions, setSearchFieldOptions] = useState<Array<{ value: string; label: string }>>([]);

  // Combine all loading states for display
  const loadingFields = React.useMemo(() => {
    const combined = new Set<string>();

    // Add parent loading fields if provided
    if (parentLoadingFields) {
      parentLoadingFields.forEach(field => combined.add(field));
    }

    // Add local loading fields
    localLoadingFields.forEach(field => combined.add(field));

    return combined;
  }, [parentLoadingFields, localLoadingFields]);

  // Helper function to check if a field is currently loading
  const isFieldLoading = useCallback((fieldName: string) => {
    return loadingFields.has(fieldName);
  }, [loadingFields]);

  // Track which dropdown fields have been loaded to prevent reloading
  const [loadedDropdownFields, setLoadedDropdownFields] = useState<Set<string>>(new Set());

  // Debug: Log dynamicOptions changes for watchedTables
  React.useEffect(() => {
    if (dynamicOptions.watchedTables) {
      console.log('[AirtableConfig] 📊 dynamicOptions.watchedTables updated:', {
        count: dynamicOptions.watchedTables.length,
        options: dynamicOptions.watchedTables
      });
    }
  }, [dynamicOptions.watchedTables]);

  const [localAirtableRecords, setLocalAirtableRecords] = useState<any[]>([]);
  const airtableRecords = parentAirtableRecords ?? localAirtableRecords;
  const setAirtableRecords = parentSetAirtableRecords ?? setLocalAirtableRecords;
  
  const [loadingRecords, setLoadingRecords] = useState(false);
  
  const [localSelectedRecord, setLocalSelectedRecord] = useState<any>(null);
  const selectedRecord = parentSelectedRecord ?? localSelectedRecord;
  const setSelectedRecord = parentSetSelectedRecord ?? setLocalSelectedRecord;

  const [selectedMultipleRecords, setSelectedMultipleRecords] = useState<any[]>([]);

  // Duplicate record state
  const [selectedDuplicateRecord, setSelectedDuplicateRecord] = useState<any>(null);
  const [duplicateFieldChecklist, setDuplicateFieldChecklist] = useState<any[]>([]);

  const [localAirtableTableSchema, setLocalAirtableTableSchema] = useState<any>(null);
  const airtableTableSchema = parentAirtableTableSchema ?? localAirtableTableSchema;
  const setAirtableTableSchema = parentSetAirtableTableSchema ?? setLocalAirtableTableSchema;
  
  const [isLoadingTableSchema, setIsLoadingTableSchema] = useState(false);

  const [localShowPreviewData, setLocalShowPreviewData] = useState(false);
  const showPreviewData = parentShowPreviewData ?? localShowPreviewData;
  const setShowPreviewData = parentSetShowPreviewData ?? setLocalShowPreviewData;
  
  const [localPreviewData, setLocalPreviewData] = useState<any[]>([]);
  const previewData = parentPreviewData ?? localPreviewData;
  const setPreviewData = parentSetPreviewData ?? setLocalPreviewData;
  

  const templateFieldHints = useMemo(() => {
    if (!isTemplateEditing) {
      return {};
    }

    const hints: Record<string, string> = {};

    const collectHints = (obj: Record<string, any> | undefined | null) => {
      if (!obj || typeof obj !== 'object') return;
      Object.entries(obj).forEach(([rawKey, value]) => {
        if (typeof value !== 'string') return;
        if (!value.includes('{{')) return;
        const normalizedKey = rawKey.startsWith('airtable_field_')
          ? rawKey.replace('airtable_field_', '').trim()
          : rawKey.trim();
        if (!normalizedKey) return;
        if (!hints[normalizedKey]) {
          hints[normalizedKey] = value;
        }
      });
    };

    const addHintsFromSource = (source: Record<string, any> | undefined | null) => {
      if (!source || typeof source !== 'object') return;
      if (typeof source.fields === 'object' && source.fields !== null) {
        collectHints(source.fields as Record<string, any>);
      }
      collectHints(source as Record<string, any>);
    };

    if (templateDefaults && currentNodeId) {
      const nodeDefaults = (templateDefaults as Record<string, any>)[currentNodeId];
      if (nodeDefaults && typeof nodeDefaults === 'object') {
        addHintsFromSource(nodeDefaults);
      }
    }

    if (initialConfig && typeof initialConfig === 'object') {
      addHintsFromSource(initialConfig as Record<string, any>);
    }

    return hints;
  }, [isTemplateEditing, templateDefaults, currentNodeId, initialConfig]);
  const shouldShowTemplateHints = isTemplateEditing && Object.keys(templateFieldHints).length > 0;

  // Check node type
  const isUpdateRecord = nodeInfo?.type === 'airtable_action_update_record';
  const isUpdateMultipleRecords = nodeInfo?.type === 'airtable_action_update_multiple_records';
  const isCreateRecord = nodeInfo?.type === 'airtable_action_create_record';
  const isListRecord = nodeInfo?.type === 'airtable_action_list_records';
  const isFindRecord = nodeInfo?.type === 'airtable_action_find_record';
  const isDeleteRecord = nodeInfo?.type === 'airtable_action_delete_record';
  const isDuplicateRecord = nodeInfo?.type === 'airtable_action_duplicate_record';

  // Initialize bubble handler
  const airtableBubbleHandler = useAirtableBubbleHandler({
    fieldSuggestions,
    setFieldSuggestions,
    activeBubbles,
    setActiveBubbles,
    setValue,
    dynamicOptions,
    airtableTableSchema,
    isUpdateRecord,
    isCreateRecord
  });

  // Fetch Airtable table schema
  const fetchAirtableTableSchema = useCallback(async (baseId: string, tableName: string) => {
    if (!baseId || !tableName) {
      setIsLoadingTableSchema(false);
      return;
    }
    
    // Check if integration exists
    if (!airtableIntegration) {
      logger.error('Airtable integration not found');
      setIsLoadingTableSchema(false);
      return;
    }
    
    setIsLoadingTableSchema(true);
    
    try {
      // First try to fetch the actual table metadata from Airtable API
      const metaResponse = await fetch('/api/integrations/airtable/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId: airtableIntegration.id,
          baseId,
          tableName
        })
      });
      
      if (metaResponse.ok) {
        const metadata = await metaResponse.json();
        logger.debug('📋 Fetched Airtable table metadata:', metadata);
        
        // Log specific fields we care about
        const linkedFields = metadata.fields?.filter((f: any) => 
          f.type === 'multipleRecordLinks' || f.type === 'singleRecordLink'
        );
        logger.debug('🔗 Linked record fields found in metadata:', linkedFields);
        
        if (metadata.fields && metadata.fields.length > 0) {
          logger.debug('📋 Setting table schema with fields:', metadata.fields.map((f: any) => ({
            name: f.name,
            type: f.type,
            id: f.id
          })));

          const visibilityByFieldId: Record<string, string> = {};

          if (Array.isArray(metadata.views)) {
            metadata.views.forEach((view: any) => {
              const visibleFieldIdsFromOrder: string[] =
                view?.fieldOrder?.visibleFieldIds ||
                view?.fieldOrder?.visible_field_ids ||
                view?.visibleFieldIds ||
                view?.visible_field_ids ||
                [];

              const allFieldIdsFromOrder: string[] =
                view?.fieldOrder?.fieldIds ||
                view?.fieldOrder?.field_ids ||
                view?.fieldIds ||
                view?.field_ids ||
                [];

              const visibleFieldSet = new Set<string>();
              visibleFieldIdsFromOrder?.forEach((fieldId: string) => {
                if (fieldId) {
                  visibleFieldSet.add(fieldId);
                  if (!visibilityByFieldId[fieldId]) {
                    visibilityByFieldId[fieldId] = 'visible';
                  }
                }
              });

              if (Array.isArray(view?.fields)) {
                view.fields.forEach((viewField: any) => {
                  const viewFieldId = viewField?.fieldId || viewField?.id;
                  if (!viewFieldId || visibilityByFieldId[viewFieldId]) return;

                  let visibility: string | null = null;

                  if (typeof viewField.visibilityType === 'string') {
                    visibility = viewField.visibilityType;
                  } else if (typeof viewField.visibility === 'string') {
                    visibility = viewField.visibility;
                  } else if (typeof viewField.isHidden === 'boolean') {
                    visibility = viewField.isHidden ? 'hidden' : 'visible';
                  } else if (typeof viewField.hidden === 'boolean') {
                    visibility = viewField.hidden ? 'hidden' : 'visible';
                  }

                  if (!visibility) {
                    if (visibleFieldSet.has(viewFieldId)) {
                      visibility = 'visible';
                    } else if (
                      Array.isArray(allFieldIdsFromOrder) &&
                      allFieldIdsFromOrder.includes(viewFieldId)
                    ) {
                      visibility = 'hidden';
                    }
                  }

                  if (visibility) {
                    visibilityByFieldId[viewFieldId] = visibility;
                  }
                });
              }

              if (
                Array.isArray(allFieldIdsFromOrder) &&
                allFieldIdsFromOrder.length > 0
              ) {
                allFieldIdsFromOrder.forEach((fieldId: string) => {
                  if (!fieldId || visibilityByFieldId[fieldId]) return;
                  const isVisible = visibleFieldSet.has(fieldId);
                  visibilityByFieldId[fieldId] = isVisible ? 'visible' : 'hidden';
                });
              }
            });
          }

          setAirtableTableSchema({
            table: { name: tableName, id: metadata.id },
            fields: metadata.fields,
            views: metadata.views || [],
            visibilityByFieldId
          });
          return;
        }
      }
      
      // Fallback: Infer schema from records if metadata API fails
      logger.debug('⚠️ Metadata API failed or returned no fields, falling back to record inference');
      const response = await fetch('/api/integrations/airtable/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId: airtableIntegration.id,
          dataType: 'airtable_records',
          options: {
            baseId,
            tableName,
            maxRecords: 20
          }
        })
      });
      
      if (!response.ok) {
        logger.error('Failed to fetch table data');
        setAirtableTableSchema(null);
        return;
      }
      
      const result = await response.json();
      const records = result.data || [];
      
      if (records.length === 0) {
        setAirtableTableSchema(null);
        return;
      }
      
      // Infer schema from records with better type detection
      const fieldMap = new Map<string, any>();
      records.forEach((record: any) => {
        Object.entries(record.fields || {}).forEach(([fieldName, value]: [string, any]) => {
          if (!fieldMap.has(fieldName)) {
            // Try to infer the field type from the value
            let fieldType = 'singleLineText';
            
            if (Array.isArray(value) && value.length > 0) {
              if (value[0]?.url) {
                fieldType = 'multipleAttachments';
              } else if (typeof value[0] === 'string') {
                fieldType = 'multipleSelects';
              }
            } else if (typeof value === 'boolean') {
              fieldType = 'checkbox';
            } else if (typeof value === 'number') {
              fieldType = 'number';
            } else if (typeof value === 'string') {
              // Check for date patterns
              if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
                fieldType = 'date';
              } else if (value.includes('\n')) {
                fieldType = 'multilineText';
              }
            } else if (value?.url) {
              fieldType = 'attachment';
            }
            
            fieldMap.set(fieldName, {
              id: fieldName,
              name: fieldName,
              type: fieldType
            });
          }
        });
      });
      
      setAirtableTableSchema({
        table: { name: tableName },
        fields: Array.from(fieldMap.values()),
        views: [],
        visibilityByFieldId: {}
      });
    } catch (error) {
      logger.error('Error fetching table schema:', error);
      setAirtableTableSchema(null);
    } finally {
      setIsLoadingTableSchema(false);
    }
  }, [airtableIntegration]);

  // Load Airtable records
  const loadAirtableRecords = useCallback(async (baseId: string, tableName: string) => {
    if (!baseId || !tableName) return;
    
    // Check if integration exists
    if (!airtableIntegration) {
      logger.error('Airtable integration not found');
      setLoadingRecords(false);
      setAirtableRecords([]);
      return;
    }
    
    setLoadingRecords(true);
    
    try {
      // Ensure schema is loaded first
      if (!airtableTableSchema || airtableTableSchema.table?.name !== tableName) {
        await fetchAirtableTableSchema(baseId, tableName);
      }
      
      const response = await fetch('/api/integrations/airtable/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId: airtableIntegration.id,
          dataType: 'airtable_records',
          options: {
            baseId,
            tableName,
            maxRecords: 100
          }
        })
      });
      
      if (!response.ok) {
        logger.error('Failed to fetch records');
        setAirtableRecords([]);
        return;
      }
      
      const result = await response.json();
      setAirtableRecords(result.data || []);
    } catch (error) {
      logger.error('Error loading records:', error);
      setAirtableRecords([]);
    } finally {
      setLoadingRecords(false);
    }
  }, [airtableIntegration, airtableTableSchema, fetchAirtableTableSchema]);

  // Handle record selection for duplicate record
  const handleDuplicateRecordSelection = useCallback((record: any) => {
    logger.debug('[DuplicateRecord] Record selected:', record);

    setSelectedDuplicateRecord(record);
    setValue('recordId', record.id);

    // Build field checklist from record data and schema
    if (record.fields && airtableTableSchema?.fields) {
      const checklist = airtableTableSchema.fields.map((field: any) => ({
        name: field.name,
        label: field.name,
        value: record.fields[field.name] ?? null,
        type: field.type,
        enabled: true, // Auto-select all fields by default
        override: false, // Override disabled by default
        overrideValue: undefined
      }));

      logger.debug('[DuplicateRecord] Created field checklist:', checklist);
      setDuplicateFieldChecklist(checklist);

      // Store in duplicateConfig hidden field
      const config = {
        fieldsToCopy: checklist.filter(f => f.enabled).map(f => f.name),
        fieldsToOverride: {}
      };
      setValue('duplicateConfig', config);
    }
  }, [airtableTableSchema, setValue]);

  // Handle changes to duplicate field checklist
  const handleDuplicateFieldsChange = useCallback((updatedFields: any[]) => {
    logger.debug('[DuplicateRecord] Fields updated:', updatedFields);
    setDuplicateFieldChecklist(updatedFields);

    // Update duplicateConfig with new settings
    const fieldsToCopy = updatedFields.filter(f => f.enabled).map(f => f.name);
    const fieldsToOverride: Record<string, any> = {};

    updatedFields.forEach(field => {
      if (field.enabled && field.override && field.overrideValue !== undefined) {
        fieldsToOverride[field.name] = field.overrideValue;
      }
    });

    const config = {
      fieldsToCopy,
      fieldsToOverride
    };

    logger.debug('[DuplicateRecord] Updated config:', config);
    setValue('duplicateConfig', config);
  }, [setValue]);

  // Get dynamic fields from schema
  const getDynamicFields = () => {
    if (!airtableTableSchema?.fields) return [];

    const visibilityByFieldId: Record<string, string> = airtableTableSchema?.visibilityByFieldId || {};

    // Skip field types that we cannot meaningfully represent
    const unsupportedFieldTypes = new Set(['button']);

    return airtableTableSchema.fields
      .filter((field: any) => {
        if (!field) return false;
        if (unsupportedFieldTypes.has(field.type)) {
          logger.debug('🚫 [AirtableConfig] Excluding unsupported field:', field.name, field.type);
          return false;
        }

        // For CREATE record: filter out fields that can't be set during creation
        if (isCreateRecord) {
          // Always hide autoNumber fields - they're generated by Airtable on creation
          if (field.type === 'autoNumber') {
            logger.debug('🚫 [AirtableConfig] Excluding autoNumber field for create action:', field.name);
            return false;
          }

          // Also filter out fields explicitly hidden in Airtable views
          const visibilitySetting = visibilityByFieldId[field.id];
          if (visibilitySetting && typeof visibilitySetting === 'string') {
            const isHidden = visibilitySetting.toLowerCase() !== 'visible' &&
                           visibilitySetting.toLowerCase() !== 'shown';
            if (isHidden) {
              logger.debug('🚫 [AirtableConfig] Excluding hidden field for create action:', field.name, visibilitySetting);
              return false;
            }
          }
        }

        return true;
      })
      .map((field: any) => {
      // Check if this field should use dynamic dropdown data
      const fieldNameLower = field.name.toLowerCase();
      const shouldUseDynamicDropdown =
        fieldNameLower.includes('draft name') ||
        fieldNameLower.includes('designer') ||
        fieldNameLower.includes('associated project') ||
        fieldNameLower.includes('feedback') ||
        fieldNameLower.includes('tasks');

      // Check if this is an image field based on name
      const isImageField = fieldNameLower.includes('draft image') ||
                          fieldNameLower.includes('image') ||
                          fieldNameLower.includes('photo') ||
                          fieldNameLower.includes('picture');

      // Determine the dynamic data type based on field name
      let dynamicDataType = null;
      if (fieldNameLower.includes('draft name')) {
        dynamicDataType = 'airtable_draft_names';
      } else if (fieldNameLower.includes('designer')) {
        dynamicDataType = 'airtable_designers';
      } else if (fieldNameLower.includes('associated project')) {
        dynamicDataType = 'airtable_projects';
      } else if (fieldNameLower.includes('feedback')) {
        dynamicDataType = 'airtable_feedback';
      } else if (fieldNameLower.includes('tasks')) {
        dynamicDataType = 'airtable_tasks';
      }

      // Use the helper function to determine field type
      let fieldType = getAirtableFieldTypeFromSchema(field);
      const originalAirtableType = field.type;
      const isEditable = isEditableFieldType(originalAirtableType);
      const isComputedField = !isEditable;
      const visibilitySetting = visibilityByFieldId[field.id] || null;
      const isHiddenInView = visibilitySetting
        ? typeof visibilitySetting === 'string' &&
          visibilitySetting.toLowerCase() !== 'visible' &&
          visibilitySetting.toLowerCase() !== 'shown'
        : false;

      // Override field type for specific fields
      if (shouldUseDynamicDropdown) {
        fieldType = 'select';
      }

      // Override field type for image fields to ensure they use the image component
      if (isImageField && (field.type === 'multipleAttachments' || field.type === 'attachment' || fieldType === 'file')) {
        // Keep the original field type to trigger the image component
        fieldType = 'file';
      }

      // Extract options for select fields
      let fieldOptions = null;
      if (field.options?.choices) {
        fieldOptions = field.options.choices.map((choice: any) => ({
          value: choice.name || choice.id,
          label: choice.name || choice.id,
          color: choice.color
        }));
      }

      const readOnlyDescription = isComputedField
        ? (field.description
            ? `${field.description} (Read-only in Airtable)`
            : 'This field is calculated by Airtable and cannot be edited.')
        : field.description;

      const placeholder = isEditable
        ? shouldUseDynamicDropdown ? `Select ${field.name}` : `Enter value for ${field.name}`
        : `${field.name} is managed by Airtable`;

      return {
        name: `airtable_field_${field.name}`, // Use field name instead of ID for consistency
        label: field.name,
        type: fieldType,
        required: false,
        placeholder,
        dynamic: isEditable
          ? (shouldUseDynamicDropdown ? dynamicDataType : true)
          : false,
        airtableFieldType: originalAirtableType, // Use the original type before modifications
        airtableFieldId: field.id, // Store the ID separately if needed
        options: fieldOptions,
        dependsOn: shouldUseDynamicDropdown && isEditable ? 'tableName' : undefined,
        multiple: isEditable && (
                 fieldNameLower.includes('tasks') ||
                 fieldNameLower.includes('associated project') ||
                 fieldNameLower.includes('feedback') ||
                 field.type === 'multipleRecordLinks'), // Multiple selection for linked fields
        // Add metadata for special field types
        ...(originalAirtableType === 'multipleAttachments' && { multiple: true }),
        ...(field.type === 'rating' && { max: field.options?.max || 5 }),
        ...(field.type === 'percent' && { min: 0, max: 100 }),
        ...(field.type === 'currency' && { prefix: field.options?.symbol || '$' }),
        autoNumber: originalAirtableType === 'autoNumber',
        autoGenerated: originalAirtableType === 'autoNumber',
        readOnly: !isEditable,
        computed: isComputedField,
        formula: originalAirtableType === 'formula',
        hidden: isHiddenInView,
        visibilityType: visibilitySetting,
        description: originalAirtableType === 'autoNumber'
          ? 'Automatically generated by Airtable when the record is created.'
          : readOnlyDescription,
      };
    });
  };

  // Helper function to check if a field should be shown based on dependencies
  const shouldShowField = (field: any) => {
    // Debug logging for searchField and related fields
    const isSearchRelated = ['searchField', 'searchValue', 'matchType', 'caseSensitive'].includes(field.name);
    if (isSearchRelated) {
      console.log(`🔍 [shouldShowField] Checking ${field.name}:`, {
        fieldName: field.name,
        fieldType: field.type,
        hasVisibleWhen: !!field.visibleWhen,
        visibleWhen: field.visibleWhen,
        hasDependsOn: !!field.dependsOn,
        dependsOn: field.dependsOn,
        currentSearchMode: values.searchMode,
        currentTableName: values.tableName,
      });
    }

    // Never show fields with type: 'hidden'
    if (field.type === 'hidden') {
      if (isSearchRelated) console.log(`❌ [shouldShowField] ${field.name}: hidden type`);
      return false;
    }

    // If field has hidden: true and dependsOn, only show if dependency is satisfied
    if (field.hidden && field.dependsOn) {
      const dependencyValue = values[field.dependsOn];
      return !!dependencyValue; // Show only if dependency has a value
    }

    // If field has hidden: true but no dependsOn, don't show it
    if (field.hidden) return false;

    // Check dependsOn for all fields (not just hidden ones)
    if (field.dependsOn) {
      const dependencyValue = values[field.dependsOn];
      if (!dependencyValue) {
        return false; // Hide if dependency is not satisfied
      }
    }

    // Check visibleWhen condition (for conditional field visibility)
    if (field.visibleWhen) {
      const { field: conditionField, value: conditionValue } = field.visibleWhen;
      let currentValue = values[conditionField];

      if (isSearchRelated) {
        console.log(`🔍 [shouldShowField] ${field.name} visibleWhen check:`, {
          conditionField,
          conditionValue,
          currentValue,
          currentValueType: typeof currentValue,
        });
      }

      // If value is not set, check if the condition field has a defaultValue
      if (currentValue === undefined || currentValue === null || currentValue === '') {
        const conditionFieldDef = nodeInfo?.configSchema?.find((f: any) => f.name === conditionField);
        if (conditionFieldDef?.defaultValue !== undefined) {
          currentValue = conditionFieldDef.defaultValue;
          if (isSearchRelated) {
            console.log(`🔍 [shouldShowField] ${field.name}: Using default value:`, currentValue);
          }
        }
      }

      // Only show if the condition is met
      if (currentValue !== conditionValue) {
        if (isSearchRelated) {
          console.log(`❌ [shouldShowField] ${field.name}: visibleWhen failed - ${currentValue} !== ${conditionValue}`);
        }
        return false;
      }

      if (isSearchRelated) {
        console.log(`✅ [shouldShowField] ${field.name}: visibleWhen passed`);
      }
    }

    // Progressive disclosure for Find Record
    if (isFindRecord) {
      // Step 1: Only show baseId initially
      if (field.name !== 'baseId' && (!values.baseId || values.baseId === '')) {
        if (isSearchRelated) {
          console.log(`❌ [shouldShowField] ${field.name}: Progressive disclosure - no baseId (value: ${values.baseId})`);
        }
        return false;
      }

      // Step 2: After baseId selected, show tableName
      // Step 3: After tableName selected, show all other fields
      // IMPORTANT: Treat empty string as falsy - it means table hasn't been selected yet
      if (field.name !== 'baseId' && field.name !== 'tableName' && (!values.tableName || values.tableName === '')) {
        if (isSearchRelated) {
          console.log(`❌ [shouldShowField] ${field.name}: Progressive disclosure - no tableName (value: '${values.tableName}')`);
        }
        return false;
      }
    }

    // Progressive disclosure for Delete Record
    if (isDeleteRecord) {
      const isDeleteRelated = ['recordId', 'deleteMode', 'searchMode', 'searchField', 'searchValue', 'matchType', 'caseSensitive', 'filterFormula', 'maxRecords'].includes(field.name);

      if (isDeleteRelated) {
        console.log(`🗑️ [shouldShowField] Checking ${field.name}:`, {
          fieldName: field.name,
          baseId: values.baseId,
          tableName: values.tableName,
          deleteMode: values.deleteMode,
        });
      }

      // Step 1: Only show baseId initially
      if (field.name !== 'baseId' && (!values.baseId || values.baseId === '')) {
        if (isDeleteRelated) {
          console.log(`❌ [shouldShowField] ${field.name}: Progressive disclosure - no baseId`);
        }
        return false;
      }

      // Step 2: After baseId selected, show tableName
      if (field.name !== 'baseId' && field.name !== 'tableName' && (!values.tableName || values.tableName === '')) {
        if (isDeleteRelated) {
          console.log(`❌ [shouldShowField] ${field.name}: Progressive disclosure - no tableName`);
        }
        return false;
      }

      // Step 3: After tableName selected, show deleteMode and fields based on deleteMode value
      // CRITICAL: Don't use defaultValue here, only use actual form value
      if (field.name !== 'baseId' && field.name !== 'tableName' && field.name !== 'deleteMode') {
        const actualDeleteMode = values.deleteMode; // Don't fall back to defaultValue

        if (isDeleteRelated) {
          console.log(`🗑️ [shouldShowField] ${field.name}: Checking actual deleteMode:`, {
            actualDeleteMode,
            actualDeleteModeType: typeof actualDeleteMode,
            hasActualValue: !!actualDeleteMode
          });
        }

        // If deleteMode hasn't been set yet, hide all other fields
        if (!actualDeleteMode) {
          if (isDeleteRelated) {
            console.log(`❌ [shouldShowField] ${field.name}: Progressive disclosure - no deleteMode value yet`);
          }
          return false;
        }

        // If deleteMode is "single_record", only show recordId
        if (actualDeleteMode === 'single_record' && field.name !== 'recordId') {
          if (isDeleteRelated) {
            console.log(`❌ [shouldShowField] ${field.name}: deleteMode is single_record, hiding search fields`);
          }
          return false;
        }

        // If deleteMode is "matching_records", hide recordId
        if (actualDeleteMode === 'matching_records' && field.name === 'recordId') {
          if (isDeleteRelated) {
            console.log(`❌ [shouldShowField] ${field.name}: deleteMode is matching_records, hiding recordId`);
          }
          return false;
        }
      }

      if (isDeleteRelated) {
        console.log(`✅ [shouldShowField] ${field.name}: Delete Record progressive disclosure passed`);
      }
    }

    if (isSearchRelated) {
      console.log(`✅✅✅ [shouldShowField] ${field.name}: PASSED ALL CHECKS - SHOULD BE VISIBLE`);
    }

    // Otherwise show the field
    return true;
  };

  // Separate base, advanced, and dynamic fields
  const baseFields = nodeInfo?.configSchema?.filter((field: any) =>
    !field.advanced && !field.name?.startsWith('airtable_field_') && shouldShowField(field)
  ) || [];

  const advancedFields = nodeInfo?.configSchema?.filter((field: any) =>
    field.advanced && !field.name?.startsWith('airtable_field_') && shouldShowField(field)
  ) || [];

  const dynamicFields = getDynamicFields();

  // Track which loadOnMount fields have been loaded
  const loadedOnMountRef = React.useRef<Set<string>>(new Set());

  // Handle dynamic field loading (simplified to match Discord pattern)
  const handleDynamicLoad = useCallback(async (
    fieldName: string,
    dependsOn?: string,
    dependsOnValue?: any,
    forceReload?: boolean
  ) => {
    console.log('[AirtableConfig] handleDynamicLoad called:', {
      fieldName,
      dependsOn,
      dependsOnValue,
      forceReload,
      hasExistingOptions: !!(dynamicOptions[fieldName] && dynamicOptions[fieldName].length > 0),
      loadedOnMount: loadedOnMountRef.current.has(fieldName)
    });

    // Check if options are already loaded (unless forcing reload)
    if (!forceReload && dynamicOptions[fieldName] && dynamicOptions[fieldName].length > 0) {
      console.log('[AirtableConfig] ✅ Options already loaded, skipping:', fieldName, dynamicOptions[fieldName].length, 'options');
      return;
    }

    // Check if this field was loaded on mount - don't reload unless forced
    if (!forceReload && loadedOnMountRef.current.has(fieldName)) {
      console.log('[AirtableConfig] Field was loaded on mount, skipping:', fieldName);
      return;
    }

    try {
      // Prepare extraOptions with baseId and tableName for Airtable fields
      const extraOptions = {
        baseId: values.baseId,
        tableName: values.tableName
      };

      console.log('[AirtableConfig] Loading options for field:', {
        fieldName,
        baseId: values.baseId,
        tableName: values.tableName
      });

      // Check if it's a dynamic Airtable field (linked records, etc.)
      if (fieldName.startsWith('airtable_field_')) {
        const dynamicField = dynamicFields.find((f: any) => f.name === fieldName);
        if (dynamicField) {
          console.log('[AirtableConfig] Loading dynamic field:', fieldName, dynamicField.airtableFieldType);
          await loadOptions(fieldName, undefined, undefined, forceReload, false, extraOptions);
          return;
        }
      }

      // Check in the regular config schema
      const field = nodeInfo?.configSchema?.find((f: any) => f.name === fieldName);
      if (!field) {
        logger.warn('Field not found in schema:', fieldName);
        return;
      }

      // Load with dependencies if provided
      if (dependsOn && dependsOnValue !== undefined) {
        await loadOptions(fieldName, dependsOn, dependsOnValue, forceReload, false, extraOptions);
      } else if (field.dependsOn && values[field.dependsOn]) {
        await loadOptions(fieldName, field.dependsOn, values[field.dependsOn], forceReload, false, extraOptions);
      } else {
        await loadOptions(fieldName, undefined, undefined, forceReload, false, extraOptions);
      }
    } catch (error) {
      logger.error('Error loading dynamic options:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeInfo, values, dynamicFields]);

  // Load schema on initial mount if we have baseId and tableName
  useEffect(() => {
    // Check if we're reopening the modal with existing values
    if (values.baseId && values.tableName && !airtableTableSchema && !isLoadingTableSchema) {
      logger.debug('📂 [INITIAL LOAD] Modal opened with existing values, loading schema:', {
        baseId: values.baseId,
        tableName: values.tableName,
        isEditMode
      });

      // Load the table schema so fields are visible
      fetchAirtableTableSchema(values.baseId, values.tableName).then(() => {
        // For update record, also load the records
        if (isUpdateRecord) {
          loadAirtableRecords(values.baseId, values.tableName);
        }
      });
    }
  }, []); // Only run on mount

  // Track if we've already set AI fields for this schema to prevent duplicate processing
  const processedSchemaRef = React.useRef<string | null>(null);

  // Reset processed schema ref and clear aiFields when table changes so AI fields can be re-applied
  useEffect(() => {
    logger.debug('🔄 [AirtableConfig] Table changed, resetting processedSchemaRef and clearing aiFields');
    processedSchemaRef.current = null;
    // Clear aiFields so all fields in the new table can be set to AI mode
    setAiFields({});
    // Also clear the schema to ensure we don't apply AI fields with stale schema
    setAirtableTableSchema?.(null);
    logger.debug('✅ [AirtableConfig] Cleared schema to force reload for new table');
  }, [values.tableName, setAiFields, setAirtableTableSchema]);

  // Pre-load searchField options for Find Record nodes so the dropdown never appears empty
  useEffect(() => {
    if (!isFindRecord || !values.baseId || !values.tableName || !airtableIntegration?.id) {
      setSearchFieldOptions([]);
      setLocalLoadingFields(prev => {
        if (!prev.has('searchField')) return prev;
        const next = new Set(prev);
        next.delete('searchField');
        return next;
      });
      return;
    }

    let isCancelled = false;
    const abortController = new AbortController();

    setLocalLoadingFields(prev => {
      if (prev.has('searchField')) return prev;
      const next = new Set(prev);
      next.add('searchField');
      return next;
    });

    (async () => {
      try {
        const response = await fetch('/api/integrations/airtable/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            integrationId: airtableIntegration.id,
            dataType: 'airtable_fields',
            options: {
              baseId: values.baseId,
              tableName: values.tableName
            }
          }),
          signal: abortController.signal
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to load Airtable fields (${response.status})`);
        }

        const payload = await response.json();
        const fields = payload?.data || [];
        if (!isCancelled) {
          setSearchFieldOptions(
            fields.map((field: any) => ({
              value: field.value || field.name || field.id,
              label: field.label || field.name || field.id
            }))
          );
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          logger.error('❌ [AirtableConfig] Failed to load searchField options:', error);
          if (!isCancelled) {
            setSearchFieldOptions([]);
          }
        }
      } finally {
        if (!isCancelled) {
          setLocalLoadingFields(prev => {
            if (!prev.has('searchField')) return prev;
            const next = new Set(prev);
            next.delete('searchField');
            return next;
          });
        }
      }
    })();

    return () => {
      isCancelled = true;
      abortController.abort();
      setLocalLoadingFields(prev => {
        if (!prev.has('searchField')) return prev;
        const next = new Set(prev);
        next.delete('searchField');
        return next;
      });
    };
  }, [airtableIntegration?.id, isFindRecord, values.baseId, values.tableName]);

  // Log component mount and initial state
  useEffect(() => {
    logger.debug('🔍 [AirtableConfig] Component mounted/updated:', {
      nodeType: nodeInfo?.type,
      hasAllFieldsAI: !!values._allFieldsAI,
      allFieldsAIValue: values._allFieldsAI,
      hasSchema: !!airtableTableSchema,
      schemaFieldCount: airtableTableSchema?.fields?.length || 0,
      baseId: values.baseId,
      tableName: values.tableName,
      currentAiFieldsCount: Object.keys(aiFields).length,
      aiFields: aiFields,
      allValuesKeys: Object.keys(values),
      allValues: values
    });
  }, [values._allFieldsAI, airtableTableSchema]);

  // Auto-set AI mode for dynamically loaded fields
  useEffect(() => {
    logger.debug('🔍 [AirtableConfig] Auto-AI useEffect triggered:', {
      hasAllFieldsAI: !!values._allFieldsAI,
      allFieldsAIValue: values._allFieldsAI,
      hasSchema: !!airtableTableSchema,
      hasFields: !!airtableTableSchema?.fields,
      fieldCount: airtableTableSchema?.fields?.length || 0,
      baseId: values.baseId,
      tableName: values.tableName
    });

    // Check if _allFieldsAI flag is set and table schema has been loaded
    if (values._allFieldsAI && airtableTableSchema?.fields) {
      // Create a unique key for this schema
      const schemaKey = `${values.baseId}-${values.tableName}-${airtableTableSchema.fields.length}`;

      logger.debug('🔍 [AirtableConfig] Schema detected:', {
        schemaKey,
        previousSchemaKey: processedSchemaRef.current,
        alreadyProcessed: processedSchemaRef.current === schemaKey
      });

      // Skip if we've already processed this exact schema
      if (processedSchemaRef.current === schemaKey) {
        logger.debug('⏭️ [AirtableConfig] Skipping - already processed this schema');
        return;
      }

      logger.debug('🤖 [AirtableConfig] Auto-setting AI mode for dynamic fields');

      const dynamicFields = getDynamicFields();
      logger.debug('🔍 [AirtableConfig] Dynamic fields:', dynamicFields.map((f: any) => f.name));

      const newAiFields: Record<string, boolean> = { ...aiFields };
      let hasChanges = false;

      // Selector fields that should NOT be auto-set to AI mode
      const selectorFields = new Set(['baseId', 'tableName', 'viewName', 'recordId', 'id']);

      // Set all dynamic Airtable fields to AI mode
      dynamicFields.forEach((field: any) => {
        // field.name is already in format "airtable_field_Draft Name", don't add prefix again
        const fieldName = field.name;
        // Extract the raw field name (without prefix) for checking selectors
        const rawFieldName = fieldName.replace('airtable_field_', '');
        const isSelector = selectorFields.has(rawFieldName);
        const alreadySet = aiFields[fieldName];

        // Check if field is non-editable (computed, formula, auto-number, or read-only Airtable types)
        const readOnlyAirtableTypes = ['createdTime', 'lastModifiedTime', 'createdBy', 'lastModifiedBy',
                                        'autoNumber', 'rollup', 'count', 'lookup'];
        const isNonEditable = field.computed ||
                             field.autoNumber ||
                             field.formula ||
                             readOnlyAirtableTypes.includes(field.airtableFieldType);

        logger.debug('🔍 [AirtableConfig] Processing field:', {
          fieldName,
          rawFieldName,
          fieldType: field.type,
          airtableFieldType: field.airtableFieldType,
          isSelector,
          isNonEditable,
          alreadySet,
          willSet: !isSelector && !alreadySet && !isNonEditable
        });

        if (!isSelector && !alreadySet && !isNonEditable) {
          newAiFields[fieldName] = true;
          // Also set the value to the AI placeholder using the raw field name
          setValue(fieldName, `{{AI_FIELD:${rawFieldName}}}`);
          hasChanges = true;
          logger.debug('✅ [AirtableConfig] Set field to AI mode:', fieldName);
        }
      });

      // Update aiFields state only if there are changes
      if (hasChanges) {
        logger.debug('🤖 [AirtableConfig] Setting aiFields for', Object.keys(newAiFields).length, 'fields');
        logger.debug('🔍 [AirtableConfig] New aiFields:', newAiFields);
        setAiFields(newAiFields);
        processedSchemaRef.current = schemaKey;
      } else {
        logger.debug('⚠️ [AirtableConfig] No changes to make');
      }
    } else {
      logger.debug('⚠️ [AirtableConfig] Conditions not met:', {
        hasAllFieldsAI: !!values._allFieldsAI,
        hasSchema: !!airtableTableSchema?.fields
      });
    }
  }, [airtableTableSchema, values._allFieldsAI, values.baseId, values.tableName]);

  // Initialize default values for Find Record when table is selected
  useEffect(() => {
    console.log('🔍 [Find Record] searchMode check:', {
      isFindRecord,
      tableName: values.tableName,
      searchMode: values.searchMode,
      searchModeType: typeof values.searchMode,
      willSet: isFindRecord && values.tableName && !values.searchMode
    });

    if (isFindRecord && values.tableName && !values.searchMode) {
      console.log('🔍 [Find Record] Setting default searchMode to field_match');
      setValue('searchMode', 'field_match');
    }
  }, [isFindRecord, values.tableName, values.searchMode, setValue]);

  // Initialize default values for Delete Record when table is selected
  useEffect(() => {
    console.log('🗑️ [Delete Record] deleteMode check:', {
      isDeleteRecord,
      tableName: values.tableName,
      deleteMode: values.deleteMode,
      deleteModeType: typeof values.deleteMode,
      willSet: isDeleteRecord && values.tableName && !values.deleteMode
    });

    if (isDeleteRecord && values.tableName && !values.deleteMode) {
      console.log('🗑️ [Delete Record] Setting default deleteMode to single_record');
      setValue('deleteMode', 'single_record');
    }
  }, [isDeleteRecord, values.tableName, values.deleteMode, setValue]);

  // Log all values for Find Record debugging
  useEffect(() => {
    if (isFindRecord) {
      console.log('🔍 [Find Record] Current values:', {
        baseId: values.baseId,
        tableName: values.tableName,
        searchMode: values.searchMode,
        searchField: values.searchField,
        allKeys: Object.keys(values)
      });
    }
  }, [isFindRecord, values]);

  // Combine loading logic to prevent duplicate API calls
  // Use refs to track previous values and prevent infinite loops
  const prevTableName = React.useRef(values.tableName);
  const prevBaseId = React.useRef(values.baseId);

  useEffect(() => {
    // Only trigger if values actually changed
    const tableChanged = prevTableName.current !== values.tableName;
    const baseChanged = prevBaseId.current !== values.baseId;

    // Update refs
    prevTableName.current = values.tableName;
    prevBaseId.current = values.baseId;

    // Skip if base changed (table will be cleared and reselected)
    if (baseChanged && !values.tableName) {
      return;
    }

    // Only proceed if table actually changed and both values exist
    if (tableChanged && values.tableName && values.baseId) {
      // Clear loaded dropdown fields when table changes so they reload for new table
      setLoadedDropdownFields(new Set());

      // For update record, update multiple records, or duplicate record, load both schema and records
      if (isUpdateRecord || isUpdateMultipleRecords || isDuplicateRecord) {
        // Load schema first, then records (records loading checks for schema)
        fetchAirtableTableSchema(values.baseId, values.tableName).then(() => {
          loadAirtableRecords(values.baseId, values.tableName);
        });
      }
      // For create record, only load schema
      else if (isCreateRecord) {
        fetchAirtableTableSchema(values.baseId, values.tableName);
      }
      // For find record, load schema for field selection
      else if (isFindRecord) {
        fetchAirtableTableSchema(values.baseId, values.tableName);
      }
    }
  }, [isCreateRecord, isUpdateRecord, isUpdateMultipleRecords, isDuplicateRecord, isFindRecord, values.tableName, values.baseId, fetchAirtableTableSchema, loadAirtableRecords]);

  // Helper function to get a proper string label from any value
  const getLabelFromValue = useCallback((val: any): string => {
    // Handle attachment objects
    if (val && typeof val === 'object' && (val.url || val.filename)) {
      return val.filename || val.url || 'Attachment';
    }
    // Handle arrays
    if (Array.isArray(val)) {
      return val.map(v => getLabelFromValue(v)).join(', ');
    }
    // Handle null/undefined
    if (val === null || val === undefined) {
      return '';
    }
    // Convert to string
    return String(val);
  }, []);

  // Handle field changes with bubble creation
  const handleFieldChange = useCallback((fieldName: string, value: any, skipBubbleCreation = false) => {
    // First, set the actual field value
    setValue(fieldName, value);

    // For Airtable fields, handle bubble creation
    if (fieldName.startsWith('airtable_field_') && !skipBubbleCreation && value) {
      const field = dynamicFields.find(f => f.name === fieldName);
      if (!field) return;

      // Handle multi-select fields
      if (field.airtableFieldType === 'multipleSelects' || field.type === 'multi_select') {
        // For multi-select, value might be an array or a single value to add
        const valuesToAdd = Array.isArray(value) ? value : [value];

        valuesToAdd.forEach(val => {
          // Check if bubble already exists
          const exists = fieldSuggestions[fieldName]?.some(s => s.value === val);
          if (!exists) {
            const newBubble = {
              value: val,
              label: getLabelFromValue(val),
              fieldName: field.name
            };
            
            setFieldSuggestions(prev => ({
              ...prev,
              [fieldName]: [...(prev[fieldName] || []), newBubble]
            }));
            
            // Auto-activate new bubbles for multi-select
            setActiveBubbles(prev => {
              const current = Array.isArray(prev[fieldName]) ? prev[fieldName] as number[] : [];
              const newIndex = (fieldSuggestions[fieldName]?.length || 0);
              return {
                ...prev,
                [fieldName]: [...current, newIndex]
              };
            });
          }
        });
        
        // Clear the dropdown after selection
        setValue(fieldName, null);
        
      } else if (field.airtableFieldType === 'singleSelect') {
        // For single select, replace existing bubble
        const newBubble = {
          value: value,
          label: getLabelFromValue(value),
          fieldName: field.name
        };
        
        setFieldSuggestions(prev => ({
          ...prev,
          [fieldName]: [newBubble]
        }));
        
        // Auto-activate for single select
        setActiveBubbles(prev => ({
          ...prev,
          [fieldName]: 0
        }));
        
        // Clear the dropdown
        setValue(fieldName, null);
      } else if (field.airtableFieldType === 'multipleRecordLinks' || field.airtableFieldType === 'singleRecordLink') {
        // Handle linked record fields - parse the id::name format
        logger.debug('🔵 [BUBBLE CREATION] Linked record field detected:', {
          fieldName,
          fieldType: field.airtableFieldType,
          value,
          valueType: typeof value,
          isArray: Array.isArray(value)
        });
        
        const valuesToAdd = Array.isArray(value) ? value : [value];
        
        valuesToAdd.forEach(val => {
          logger.debug('🔵 [BUBBLE CREATION] Processing value:', {
            rawValue: val,
            hasDoubleColon: val?.includes('::'),
            valueLength: val?.length
          });
          
          // Parse the id::name format from the dropdown
          let recordId = val;
          let recordName = val;
          
          if (val && val.includes('::')) {
            const parts = val.split('::');
            recordId = parts[0]; // The actual record ID for the API
            recordName = parts[1]; // The human-readable name for display
            logger.debug('🔵 [BUBBLE CREATION] Parsed ID::Name format:', {
              recordId,
              recordName,
              partsCount: parts.length
            });
          } else {
            logger.debug('⚠️ [BUBBLE CREATION] No :: separator found, using raw value:', val);
          }
          
          // Check if bubble already exists (by ID)
          const exists = fieldSuggestions[fieldName]?.some(s => s.value === recordId);
          if (!exists) {
            const newBubble = {
              value: recordId, // Use ID as value (for API)
              label: recordName, // Use name as label (for display)
              fieldName: field.name
            };
            
            logger.debug('🔵 [BUBBLE CREATION] Creating new bubble:', newBubble);
            
            setFieldSuggestions(prev => ({
              ...prev,
              [fieldName]: [...(prev[fieldName] || []), newBubble]
            }));
            
            // Auto-activate new bubbles for multi-record links or fields marked as multiple
            if (field.airtableFieldType === 'multipleRecordLinks' || field.multiple) {
              setActiveBubbles(prev => {
                const current = Array.isArray(prev[fieldName]) ? prev[fieldName] as number[] : [];
                const newIndex = (fieldSuggestions[fieldName]?.length || 0);
                return {
                  ...prev,
                  [fieldName]: [...current, newIndex]
                };
              });
            } else {
              // Single record link - replace existing
              setActiveBubbles(prev => ({
                ...prev,
                [fieldName]: 0
              }));
            }
          }
        });
        
        // Clear the dropdown after selection
        setValue(fieldName, null);
      }
    }
  }, [dynamicFields, fieldSuggestions, setValue, getLabelFromValue]);
  
  // Track loaded linked fields to avoid reloading
  const [loadedLinkedFields, setLoadedLinkedFields] = useState<Set<string>>(new Set());

  // Track which fields we've already tried to auto-load
  const [autoLoadedFields, setAutoLoadedFields] = useState<Set<string>>(new Set());

  // Clear loaded fields when record changes
  useEffect(() => {
    setLoadedLinkedFields(new Set());
  }, [values.recordId]);

  // Auto-load all dynamic dropdown fields when they become visible
  useEffect(() => {
    // Only for create/update/find record actions
    if (!isCreateRecord && !isUpdateRecord && !isUpdateMultipleRecords && !isFindRecord) return;
    if (!values.tableName || !values.baseId) return;
    if (dynamicFields.length === 0) return;

    logger.debug('🚀 [AUTO-LOAD] Checking for fields to auto-load', {
      totalFields: dynamicFields.length,
      tableName: values.tableName,
      baseId: values.baseId
    });

    // Find all dropdown fields that haven't been auto-loaded yet
    const fieldsToAutoLoad = dynamicFields.filter(field => {
      // Skip if already auto-loaded
      if (autoLoadedFields.has(field.name)) {
        return false;
      }

      // Check if it's a dropdown field with dynamic data
      const hasDynamicData = typeof field.dynamic === 'string' &&
                             field.dynamic !== 'true' &&
                             field.dynamic !== true;

      // Skip if already has options loaded
      if (dynamicOptions[field.name]?.length > 0) {
        // Mark as auto-loaded so we don't try again
        setAutoLoadedFields(prev => new Set(prev).add(field.name));
        return false;
      }

      return hasDynamicData;
    });

    if (fieldsToAutoLoad.length > 0) {
      logger.debug('🚀 [AUTO-LOAD] Auto-loading fields:', fieldsToAutoLoad.map(f => ({
        name: f.name,
        label: f.label,
        dynamic: f.dynamic
      })));

      // Mark these fields as auto-loaded
      setAutoLoadedFields(prev => {
        const newSet = new Set(prev);
        fieldsToAutoLoad.forEach(field => newSet.add(field.name));
        return newSet;
      });

      // Load options for each field
      fieldsToAutoLoad.forEach(field => {
        // Set loading state for the field
        setLocalLoadingFields(prev => {
          const newSet = new Set(prev);
          newSet.add(field.name);
          return newSet;
        });

        // Prepare extra options for context
        const extraOptions = {
          baseId: values.baseId,
          tableName: values.tableName,
          tableFields: airtableTableSchema?.fields || []
        };

        logger.debug(`🔄 [AUTO-LOAD] Loading options for: ${field.label}`, {
          fieldName: field.name,
          dynamic: field.dynamic,
          dependsOn: field.dependsOn
        });

        // Load the options
        if (field.dependsOn === 'tableName') {
          loadOptions(field.name, 'tableName', values.tableName, true, false, extraOptions)
            .finally(() => {
              setLocalLoadingFields(prev => {
                const newSet = new Set(prev);
                newSet.delete(field.name);
                return newSet;
              });
            });
        } else {
          loadOptions(field.name, undefined, undefined, true, false, extraOptions)
            .finally(() => {
              setLocalLoadingFields(prev => {
                const newSet = new Set(prev);
                newSet.delete(field.name);
                return newSet;
              });
            });
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dynamicFields, values.tableName, values.baseId, isCreateRecord, isUpdateRecord, isUpdateMultipleRecords, isFindRecord,
      dynamicOptions, autoLoadedFields, airtableTableSchema]); // Don't include loadOptions

  // Clear auto-loaded fields when table changes
  useEffect(() => {
    setAutoLoadedFields(new Set());
  }, [values.tableName]);

  // Auto-load config schema fields with autoLoad: true when they become visible
  useEffect(() => {
    if (!isFindRecord) return;
    if (!values.tableName || !values.baseId) return;

    // Find config schema fields that should auto-load
    const autoLoadFields = nodeInfo?.configSchema?.filter((field: any) => {
      // Must have autoLoad: true
      if (!field.autoLoad) return false;

      // Must have dynamic data source
      if (!field.dynamic) return false;

      // Skip if already auto-loaded
      if (autoLoadedFields.has(field.name)) return false;

      // Skip if already has options
      if (dynamicOptions[field.name]?.length > 0) return false;

      // Check if field's dependencies are satisfied
      if (field.dependsOn) {
        const depValue = values[field.dependsOn];
        if (!depValue) return false;
      }

      // Check if field's visibleWhen condition is satisfied
      if (field.visibleWhen) {
        const { field: condField, value: condValue } = field.visibleWhen;
        const currentValue = values[condField];
        if (currentValue !== condValue) return false;
      }

      return true;
    }) || [];

    if (autoLoadFields.length > 0) {
      logger.debug('🚀 [AUTO-LOAD CONFIG] Auto-loading config schema fields:', autoLoadFields.map((f: any) => ({
        name: f.name,
        label: f.label,
        dynamic: f.dynamic
      })));

      // Mark as auto-loaded
      setAutoLoadedFields(prev => {
        const newSet = new Set(prev);
        autoLoadFields.forEach((field: any) => newSet.add(field.name));
        return newSet;
      });

      // Load each field
      autoLoadFields.forEach((field: any) => {
        setLocalLoadingFields(prev => {
          const newSet = new Set(prev);
          newSet.add(field.name);
          return newSet;
        });

        const extraOptions = {
          baseId: values.baseId,
          tableName: values.tableName,
          tableFields: airtableTableSchema?.fields || []
        };

        logger.debug(`🔄 [AUTO-LOAD CONFIG] Loading options for: ${field.label}`, {
          fieldName: field.name,
          dynamic: field.dynamic,
          dependsOn: field.dependsOn
        });

        if (field.dependsOn === 'tableName') {
          loadOptions(field.name, 'tableName', values.tableName, true, false, extraOptions)
            .finally(() => {
              setLocalLoadingFields(prev => {
                const newSet = new Set(prev);
                newSet.delete(field.name);
                return newSet;
              });
            });
        } else {
          loadOptions(field.name, undefined, undefined, true, false, extraOptions)
            .finally(() => {
              setLocalLoadingFields(prev => {
                const newSet = new Set(prev);
                newSet.delete(field.name);
                return newSet;
              });
            });
        }
      });
    }
  }, [isFindRecord, values.tableName, values.baseId, values.searchMode, nodeInfo?.configSchema,
      dynamicOptions, autoLoadedFields, airtableTableSchema, loadOptions]);

  // Auto-load fields with loadOnMount: true on initial component mount (for triggers)
  useEffect(() => {
    const isTrigger = nodeInfo?.isTrigger === true;
    if (!isTrigger) return;

    // Find fields that should load on mount
    const loadOnMountFields = nodeInfo?.configSchema?.filter((field: any) =>
      field.loadOnMount === true &&
      field.dynamic &&
      !loadedOnMountRef.current.has(field.name)
    ) || [];

    if (loadOnMountFields.length > 0) {
      logger.debug('🚀 [LOAD ON MOUNT] Loading fields on mount:', loadOnMountFields.map((f: any) => f.name));

      loadOnMountFields.forEach((field: any) => {
        // Mark as loaded immediately to prevent duplicate loads
        loadedOnMountRef.current.add(field.name);

        // Set loading state
        setLocalLoadingFields(prev => {
          const newSet = new Set(prev);
          newSet.add(field.name);
          return newSet;
        });

        logger.debug(`🔄 [LOAD ON MOUNT] Loading field: ${field.name}`);

        // Load the field options
        loadOptions(field.name, undefined, undefined, false, false)
          .finally(() => {
            setLocalLoadingFields(prev => {
              const newSet = new Set(prev);
              newSet.delete(field.name);
              return newSet;
            });
          });
      });
    }
  }, []); // Only run on mount

  // Load linked record options when a record is selected
  useEffect(() => {
    if (!values.recordId || !dynamicFields.length) return;

    logger.debug('🟢 [LINKED FIELDS] Record selected, checking for linked fields to load');

    // Find linked fields that haven't been loaded yet
    const linkedFieldsToLoad = dynamicFields.filter(field =>
      (field.airtableFieldType === 'multipleRecordLinks' || field.airtableFieldType === 'singleRecordLink') &&
      !loadedLinkedFields.has(field.name)
    );

    if (linkedFieldsToLoad.length > 0) {
      logger.debug('🟢 [LINKED FIELDS] Loading options for linked fields:', linkedFieldsToLoad.map(f => f.name));

      // Mark fields as loaded
      setLoadedLinkedFields(prev => {
        const newSet = new Set(prev);
        linkedFieldsToLoad.forEach(field => newSet.add(field.name));
        return newSet;
      });

      // Load options for each linked field with table schema context
      linkedFieldsToLoad.forEach(field => {
        // Pass the table schema as extra options so the loader can find the linked table
        const extraOptions = {
          baseId: values.baseId,
          tableName: values.tableName,
          tableFields: airtableTableSchema?.fields || []
        };

        logger.debug('🟢 [LINKED FIELDS] Loading with context:', {
          fieldName: field.name,
          fieldType: field.airtableFieldType,
          extraOptions
        });

        // The loadOptions expects these parameters: fieldName, dependsOn, dependsOnValue, forceRefresh, silent, extraOptions
        // We pass extraOptions at the end
        loadOptions(field.name, undefined, undefined, true, false, extraOptions);
      });
    }
  }, [values.recordId, values.baseId, values.tableName, dynamicFields.length, loadOptions, loadedLinkedFields, airtableTableSchema]); // Include all dependencies

  // Load dropdown options for dynamic fields only when user interacts with them
  // This prevents auto-expansion when table is loaded
  const loadDropdownOptionsForField = useCallback(async (fieldName: string) => {
    if (!dynamicFields.length || !values.tableName || !values.baseId) return;

    // Skip if already loaded
    if (loadedDropdownFields.has(fieldName)) return;

    // Also skip if options are already present in dynamicOptions
    if (dynamicOptions[fieldName] && dynamicOptions[fieldName].length > 0) {
      // Mark as loaded so we don't try again
      setLoadedDropdownFields(prev => new Set([...prev, fieldName]));
      return;
    }

    // Find the field
    const field = dynamicFields.find(f => f.name === fieldName);
    if (!field) return;

    // Check if it's a dropdown field with dynamic data
    if (typeof field.dynamic !== 'string') return;

    const dynamicType = field.dynamic;
    const isDropdownField = (
      dynamicType === 'airtable_draft_names' ||
      dynamicType === 'airtable_designers' ||
      dynamicType === 'airtable_projects' ||
      dynamicType === 'airtable_feedback' ||
      dynamicType === 'airtable_tasks'
    );

    if (!isDropdownField) return;

    logger.debug('🔄 [DROPDOWN FIELDS] Loading options for field:', fieldName);

    // Mark field as loaded first to prevent duplicate loads
    setLoadedDropdownFields(prev => new Set([...prev, fieldName]));

    try {
      const extraOptions = {
        baseId: values.baseId,
        tableName: values.tableName
      };

      logger.debug('🔄 [DROPDOWN FIELDS] Loading with context:', {
        fieldName,
        dynamicType: field.dynamic,
        extraOptions
      });

      // Load the options
      await loadOptions(fieldName, 'tableName', values.tableName, false, false, extraOptions);
      logger.debug('✅ [DROPDOWN FIELDS] Field loaded:', fieldName);
    } catch (error) {
      logger.error('❌ [DROPDOWN FIELDS] Error loading field:', fieldName, error);
    }
  }, [dynamicFields, values.tableName, values.baseId, loadOptions, loadedDropdownFields, dynamicOptions]);
  
  // Initialize bubbles from existing values (for editing existing workflows)
  useEffect(() => {
    if (!dynamicFields.length || !values) return;

    // Initialize bubbles for create record too (when reopening saved workflow)
    const shouldInitialize = isEditMode || values.recordId ||
      (Object.keys(values).some(key => key.startsWith('airtable_field_') && values[key]));

    if (!shouldInitialize) {
      logger.debug('🟢 [BUBBLE INIT] No existing values to initialize');
      return;
    }
    
    logger.debug('🟢 [BUBBLE INIT] Record selected, checking fields for existing values:', {
      recordId: values.recordId,
      dynamicFieldsCount: dynamicFields.length,
      valuesKeys: Object.keys(values)
    });
    
    // Initialize bubbles for fields that have existing values
    dynamicFields.forEach(field => {
      const fieldName = field.name;
      // Try both the field name (with ID) and alternative name (with label)
      const altFieldName = `airtable_field_${field.label}`;
      const existingValue = values[fieldName] || values[altFieldName];
      
      logger.debug('🟢 [BUBBLE INIT] Checking field:', {
        fieldName,
        altFieldName,
        fieldLabel: field.label,
        fieldType: field.airtableFieldType,
        hasValue: !!existingValue,
        existingValue,
        valueKeys: Object.keys(values).filter(k => k.includes(field.label))
      });
      
      // Use whichever field name has the value
      const actualFieldName = values[fieldName] ? fieldName : altFieldName;
      
      if (existingValue && !fieldSuggestions[actualFieldName]?.length) {
        logger.debug('🟢 [BUBBLE INIT] Found existing value for field:', {
          fieldName,
          fieldType: field.airtableFieldType,
          existingValue,
          isArray: Array.isArray(existingValue)
        });
        
        // Handle linked record fields and fields marked as multiple with dynamic data
        if (field.airtableFieldType === 'multipleRecordLinks' ||
            field.airtableFieldType === 'singleRecordLink' ||
            (field.multiple && field.dynamic && typeof field.dynamic === 'string')) {
          // Existing values for linked records are typically arrays of record IDs
          const recordIds = Array.isArray(existingValue) ? existingValue : [existingValue];
          
          // Look up names from dynamic options if available
          const options = dynamicOptions[fieldName] || [];
          logger.debug('🟢 [BUBBLE INIT] Looking up names in options:', {
            fieldName,
            recordIds,
            optionsCount: options.length,
            firstOption: options[0]
          });
          
          const bubbles = recordIds.map(recordId => {
            // Find the option that matches this record ID
            const option = options.find((opt: any) => {
              // Options might be in "id::name" format or just "id"
              if (opt.value?.includes('::')) {
                return opt.value.startsWith(`${recordId }::`);
              }
              return opt.value === recordId;
            });
            
            logger.debug('🟢 [BUBBLE INIT] Mapping record ID to bubble:', {
              recordId,
              foundOption: !!option,
              optionLabel: option?.label,
              optionValue: option?.value
            });
            
            return {
              value: recordId,
              label: option?.label || recordId, // Use label if found, otherwise fallback to ID
              fieldName: field.name
            };
          });
          
          if (bubbles.length > 0) {
            setFieldSuggestions(prev => ({
              ...prev,
              [actualFieldName]: bubbles
            }));
            
            // Auto-activate all existing bubbles
            if (field.airtableFieldType === 'multipleRecordLinks' || field.multiple) {
              setActiveBubbles(prev => ({
                ...prev,
                [actualFieldName]: bubbles.map((_, idx) => idx)
              }));
            } else {
              setActiveBubbles(prev => ({
                ...prev,
                [actualFieldName]: 0
              }));
            }
          }
        }
        // Handle multi-select fields
        else if (field.airtableFieldType === 'multipleSelects') {
          const selectValues = Array.isArray(existingValue) ? existingValue : [existingValue];
          const bubbles = selectValues.map(val => ({
            value: val,
            label: val,
            fieldName: field.name
          }));
          
          if (bubbles.length > 0) {
            setFieldSuggestions(prev => ({
              ...prev,
              [actualFieldName]: bubbles
            }));
            
            setActiveBubbles(prev => ({
              ...prev,
              [actualFieldName]: bubbles.map((_, idx) => idx)
            }));
          }
        }
        // Handle single select fields
        else if (field.airtableFieldType === 'singleSelect' && existingValue) {
          setFieldSuggestions(prev => ({
            ...prev,
            [actualFieldName]: [{
              value: existingValue,
              label: existingValue,
              fieldName: field.name
            }]
          }));
          
          setActiveBubbles(prev => ({
            ...prev,
            [actualFieldName]: 0
          }));
        }
      }
    });
  }, [dynamicFields, values.recordId]); // Run when record is selected - removed dynamicOptions to avoid re-running
  
  // Update bubble labels when linked record options load
  useEffect(() => {
    if (!dynamicFields.length || !values.recordId) return;
    
    logger.debug('🔄 [BUBBLE UPDATE] Checking if bubble labels need updating after options loaded');
    
    // Check each dynamic field to see if we need to update bubble labels
    dynamicFields.forEach(field => {
      if (field.airtableFieldType === 'multipleRecordLinks' || field.airtableFieldType === 'singleRecordLink') {
        const fieldName = field.name;
        const altFieldName = `airtable_field_${field.label}`;
        const actualFieldName = fieldSuggestions[fieldName] ? fieldName : altFieldName;
        
        const currentBubbles = fieldSuggestions[actualFieldName];
        const options = dynamicOptions[fieldName] || [];
        
        if (currentBubbles && options.length > 0) {
          logger.debug('🔄 [BUBBLE UPDATE] Updating labels for field:', {
            fieldName,
            bubblesCount: currentBubbles.length,
            optionsCount: options.length
          });
          
          // Update bubble labels with actual names from options
          const updatedBubbles = currentBubbles.map((bubble: any) => {
            // If bubble label is already not an ID (doesn't start with 'rec'), skip
            if (!bubble.label.startsWith('rec')) {
              return bubble;
            }
            
            // Find the option that matches this record ID
            const option = options.find((opt: any) => {
              if (opt.value?.includes('::')) {
                return opt.value.startsWith(`${bubble.value }::`);
              }
              return opt.value === bubble.value;
            });
            
            if (option) {
              logger.debug('🔄 [BUBBLE UPDATE] Updating bubble label:', {
                oldLabel: bubble.label,
                newLabel: option.label,
                value: bubble.value
              });
              
              return {
                ...bubble,
                label: option.label
              };
            }
            
            return bubble;
          });
          
          // Only update if labels actually changed
          const labelsChanged = updatedBubbles.some((updated: any, idx: number) => 
            updated.label !== currentBubbles[idx].label
          );
          
          if (labelsChanged) {
            setFieldSuggestions(prev => ({
              ...prev,
              [actualFieldName]: updatedBubbles
            }));
          }
        }
      }
    });
  }, [dynamicOptions, dynamicFields, values.recordId, fieldSuggestions]); // Run when options load
  
  // Render fields helper
  const renderFields = (fields: any[], isDynamic = false) => {
    // Filter out fields that aren't visible
    const visibleFields = fields.filter(field => {
      // For dynamic fields, respect Airtable visibility settings
      if (isDynamic) {
        if (field.hidden) {
          logger.debug('👁️‍🗨️ [AirtableConfig] Hiding field marked as hidden in Airtable view:', {
            fieldName: field.name,
            airtableFieldId: field.airtableFieldId,
            visibilityType: field.visibilityType
          });
          return false;
        }
        return true;
      }
      
      // Use the validation hook to determine visibility
      return isFieldVisible(field);
    });
    
    return visibleFields.map((field, index) => {
      logger.debug(`🎨 [RENDER] Rendering field ${field.name}:`, {
        fieldName: field.name,
        fieldType: field.type,
        dynamic: field.dynamic,
        hasOptions: !!dynamicOptions[field.name],
        optionCount: dynamicOptions[field.name]?.length || 0,
        firstOption: dynamicOptions[field.name]?.[0],
        autoGenerated: field.autoGenerated,
        autoNumber: field.autoNumber
      });

      // Get active bubble values for this field
      const altFieldName = `airtable_field_${field.label}`;
      const activeBubblesForField = activeBubbles[field.name] || activeBubbles[altFieldName];
      const suggestionsForField = fieldSuggestions[field.name] || fieldSuggestions[altFieldName];
      let selectedBubbleValues: string[] = [];

      if (suggestionsForField && activeBubblesForField !== undefined) {
        if (Array.isArray(activeBubblesForField)) {
          // Multiple selection
          selectedBubbleValues = activeBubblesForField.map(idx =>
            suggestionsForField[idx]?.value
          ).filter(v => v !== undefined);
        } else if (typeof activeBubblesForField === 'number') {
          // Single selection
          const value = suggestionsForField[activeBubblesForField]?.value;
          if (value) selectedBubbleValues = [value];
        }
      }

      let effectiveField = field;
      if (field.name === 'searchField' && searchFieldOptions.length > 0) {
        effectiveField = {
          ...effectiveField,
          options: searchFieldOptions
        };
      }
      if (shouldShowTemplateHints && field.name?.startsWith('airtable_field_')) {
        const rawKey = field.label || field.name.replace('airtable_field_', '');
        const normalizedKey = typeof rawKey === 'string' ? rawKey.trim() : rawKey;
        const fallbackKey = field.name.replace('airtable_field_', '').trim();
        const templateHint =
          (normalizedKey ? templateFieldHints[normalizedKey] : undefined) ||
          templateFieldHints[fallbackKey];

        if (templateHint) {
          const hintText = `Suggested variable: ${templateHint}`;
          const combinedTooltip = effectiveField.tooltip
            ? `${effectiveField.tooltip}\n\n${hintText}`
            : hintText;
          effectiveField = {
            ...effectiveField,
            tooltip: combinedTooltip,
          };
        }
      }

      // Debug loading state for watchedTables field
      // Check if this specific field is loading
      const fieldIsLoading = isFieldLoading(field.name);

      // Debug log for watchedTables field
      if (field.name === 'watchedTables') {
        console.log('[AirtableConfig] 🎯 Rendering watchedTables:', {
          isLoading: fieldIsLoading,
          hasOptions: !!dynamicOptions.watchedTables,
          optionsCount: dynamicOptions.watchedTables?.length || 0,
          loadingFieldsArray: Array.from(loadingFields)
        });
      }

      return (
      <React.Fragment key={`field-${field.name}-${index}`}>
        <FieldRenderer
          field={effectiveField}
          value={values[field.name]}
          onChange={(value) => handleFieldChange(field.name, value)}
          error={errors[field.name] || validationErrors[field.name]}
          workflowData={workflowData}
          currentNodeId={currentNodeId}
          dynamicOptions={dynamicOptions}
          loadingDynamic={fieldIsLoading}
          nodeInfo={nodeInfo}
          onDynamicLoad={handleDynamicLoad}
          parentValues={values}
          selectedValues={selectedBubbleValues}
          aiFields={aiFields}
          setAiFields={setAiFields}
        />
        
        {/* Bubble display for multi-select fields */}
        {field.name?.startsWith('airtable_field_') && (() => {
          // Check both possible field name formats
          const altFieldName = `airtable_field_${field.label}`;
          const suggestions = fieldSuggestions[field.name] || fieldSuggestions[altFieldName];
          const active = activeBubbles[field.name] || activeBubbles[altFieldName];
          const actualFieldName = fieldSuggestions[field.name] ? field.name : altFieldName;
          
          if (!suggestions) return null;
          
          return (
            <BubbleDisplay
              fieldName={actualFieldName}
              suggestions={suggestions}
              onBubbleRemove={(idx) => {
                // Get the value being removed
                const suggestionBeingRemoved = suggestions[idx];

                // Update the actual field value
                const currentFieldValue = values[actualFieldName];
                if (Array.isArray(currentFieldValue)) {
                  // Multi-select: remove the value from the array
                  const newFieldValue = currentFieldValue.filter(v => v !== suggestionBeingRemoved.value);
                  setValue(actualFieldName, newFieldValue);
                } else if (currentFieldValue === suggestionBeingRemoved.value) {
                  // Single-select: clear the value
                  setValue(actualFieldName, null);
                }

                // Update visual bubble list
                setFieldSuggestions(prev => ({
                  ...prev,
                  [actualFieldName]: prev[actualFieldName].filter((_: any, i: number) => i !== idx)
                }));
              }}
              onClearAll={() => {
                // Clear all bubbles for this field
                setFieldSuggestions(prev => {
                  const { [actualFieldName]: _, ...rest } = prev;
                  return rest;
                });

                // Clear the field value
                setValue(actualFieldName, null);
              }}
              originalValues={originalBubbleValues}
            />
          );
        })()}
      </React.Fragment>
    )});
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields (only visible ones)
    const { isValid, errors } = validateRequiredFields();
    
    if (!isValid) {
      setValidationErrors(errors);
      // Optionally show a toast or alert
      logger.error('Validation failed:', errors);
      return;
    }
    
    // Clear validation errors
    setValidationErrors({});
    
    // Process bubble values for submission
    const submissionValues = { ...values };

    // Aggregate bubble values for Airtable fields
    if (isCreateRecord || isUpdateRecord || isUpdateMultipleRecords) {
      Object.keys(fieldSuggestions).forEach(fieldName => {
        if (fieldName.startsWith('airtable_field_')) {
          const activeBubblesForField = activeBubbles[fieldName];
          const suggestions = fieldSuggestions[fieldName];
          
          if (activeBubblesForField !== undefined && suggestions) {
            let aggregatedValue;
            
            if (Array.isArray(activeBubblesForField)) {
              // Multi-value: collect all active bubble values
              aggregatedValue = activeBubblesForField.map(idx => 
                suggestions[idx]?.value
              ).filter(v => v !== undefined);
            } else if (typeof activeBubblesForField === 'number') {
              // Single-value: get the active bubble value
              aggregatedValue = suggestions[activeBubblesForField]?.value;
            }
            
            if (aggregatedValue !== undefined) {
              submissionValues[fieldName] = aggregatedValue;
            }
          }
        }
      });
    }
    
    await onSubmit(submissionValues);
  };

  // Show connection required state
  if (needsConnection) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
        <h3 className="text-lg font-semibold mb-2">Airtable Connection Required</h3>
        <p className="text-sm text-slate-600 mb-4">
          Please connect your Airtable account to use this action.
        </p>
        <Button onClick={onConnectIntegration} variant="default">
          Connect Airtable
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full overflow-y-auto overflow-x-hidden px-6 py-4">
          <div className="space-y-3 pb-4 pr-4">
            {/* Base fields */}
            {renderFields(baseFields)}

            {/* Advanced fields - Collapsible section (closed by default) */}
            {advancedFields.length > 0 && (
              <div className="border-t border-slate-200 pt-4 mt-6">
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="advanced-settings" className="border-none">
                    <AccordionTrigger className="py-2 hover:no-underline">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-700">
                          Advanced Settings
                        </span>
                        <span className="text-xs text-slate-500">(optional)</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3 pt-3">
                        {renderFields(advancedFields)}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            )}

            {/* Records table for update record */}
            {isUpdateRecord && values.tableName && values.baseId && (
              <div className="w-full overflow-hidden">
                <AirtableRecordsTable
                records={airtableRecords}
                loading={loadingRecords}
                selectedRecord={selectedRecord}
                tableName={values.tableName}
                onSelectRecord={(record) => {
                  setSelectedRecord(record);
                  setValue('recordId', record.id);
                  // Populate fields from record and create bubbles for select fields
                  if (record.fields) {
                    // Clear existing bubbles first
                    setFieldSuggestions({});
                    setActiveBubbles({});
                    
                    Object.entries(record.fields).forEach(([key, value]) => {
                      // Try to find field by name (key is the field name from Airtable)
                      const fieldName = `airtable_field_${key}`;
                      const field = dynamicFields.find(f =>
                        f.name === fieldName || f.airtableFieldId === key
                      );

                      if (field) {
                        // Use the field's actual name for consistency
                        const actualFieldName = field.name;

                        // Debug logging for all fields with attachment-like values
                        const hasAttachmentValue = value && (
                          (Array.isArray(value) && value[0]?.url) ||
                          (!Array.isArray(value) && value?.url)
                        );

                        if (hasAttachmentValue || field.airtableFieldType === 'multipleAttachments' || field.type === 'file') {
                          logger.debug('🔍 [RECORD SELECT] Checking attachment field:', {
                            key,
                            fieldName: actualFieldName,
                            fieldType: field.type,
                            airtableFieldType: field.airtableFieldType,
                            value: value,
                            hasUrl: hasAttachmentValue
                          });
                        }

                        // For linked record fields, we need to look up the names
                        if ((field.airtableFieldType === 'multipleRecordLinks' || field.airtableFieldType === 'singleRecordLink') && value) {
                          const recordIds = Array.isArray(value) ? value : [value];
                          
                          // Look up names from dynamic options if available
                          const options = dynamicOptions[actualFieldName] || [];
                          logger.debug('🟣 [RECORD SELECT] Looking up linked record names:', {
                            actualFieldName,
                            recordIds,
                            optionsAvailable: options.length > 0,
                            firstOption: options[0]
                          });
                          
                          const bubbles = recordIds.map(recordId => {
                            // Find the option that matches this record ID
                            const option = options.find((opt: any) => {
                              if (opt.value?.includes('::')) {
                                return opt.value.startsWith(`${recordId }::`);
                              }
                              return opt.value === recordId;
                            });
                            
                            const bubble = {
                              value: recordId,
                              label: option?.label || recordId, // Use name if found, otherwise ID
                              fieldName: field.name
                            };
                            
                            logger.debug('🟣 [RECORD SELECT] Created bubble for linked record:', bubble);
                            return bubble;
                          });
                          
                          if (bubbles.length > 0) {
                            setFieldSuggestions(prev => ({
                              ...prev,
                              [actualFieldName]: bubbles
                            }));
                            
                            // Set all bubbles as active
                            if (field.airtableFieldType === 'multipleRecordLinks') {
                              setActiveBubbles(prev => ({
                                ...prev,
                                [actualFieldName]: bubbles.map((_, idx) => idx)
                              }));
                            } else {
                              setActiveBubbles(prev => ({
                                ...prev,
                                [actualFieldName]: 0
                              }));
                            }
                          }
                          
                          // Set the actual value for form submission
                          setValue(actualFieldName, recordIds);
                          
                        } else if (field.airtableFieldType === 'multipleSelects' && Array.isArray(value)) {
                          // For multi-select fields, create bubbles
                          const bubbles = value.map(v => ({
                            value: v,
                            label: v,
                            fieldName: field.name
                          }));
                          
                          setFieldSuggestions(prev => ({
                            ...prev,
                            [actualFieldName]: bubbles
                          }));
                          
                          // Set all bubbles as active
                          setActiveBubbles(prev => ({
                            ...prev,
                            [actualFieldName]: bubbles.map((_, idx) => idx)
                          }));
                          
                          // Don't set the field value directly for multi-select
                          setValue(actualFieldName, null);
                          
                        } else if (field.airtableFieldType === 'singleSelect' && value) {
                          // For single select, create one bubble
                          setFieldSuggestions(prev => ({
                            ...prev,
                            [actualFieldName]: [{
                              value: value,
                              label: value,
                              fieldName: field.name
                            }]
                          }));
                          
                          setActiveBubbles(prev => ({
                            ...prev,
                            [actualFieldName]: 0
                          }));
                          
                          // Don't set the field value directly
                          setValue(actualFieldName, null);
                          
                        } else if ((field.airtableFieldType === 'multipleAttachments' || field.type === 'file' ||
                                   (Array.isArray(value) && value[0]?.url) || value?.url) && value) {
                          // For attachment/image fields, populate with the image URLs
                          logger.debug('🖼️ [RECORD SELECT] Populating image field:', {
                            fieldName: actualFieldName,
                            fieldType: field.airtableFieldType,
                            fieldActualType: field.type,
                            value: value,
                            isArray: Array.isArray(value),
                            hasUrl: Array.isArray(value) ? value[0]?.url : value?.url
                          });

                          if (Array.isArray(value) && value.length > 0 && value[0].url) {
                            // For multiple attachments
                            const attachments = value.map(attachment => ({
                              url: attachment.url || attachment.thumbnails?.large?.url || attachment.thumbnails?.small?.url,
                              filename: attachment.filename || 'Image',
                              type: attachment.type,
                              thumbnails: attachment.thumbnails,
                              id: attachment.id,
                              size: attachment.size
                            }));

                            // Set the value to the attachments array
                            setValue(actualFieldName, attachments);
                            logger.debug('🖼️ [RECORD SELECT] Set multiple attachments:', attachments);
                          } else if (!Array.isArray(value) && value.url) {
                            // Single attachment (convert to array for consistency with AirtableImageField)
                            const attachment = {
                              url: value.url || value.thumbnails?.large?.url || value.thumbnails?.small?.url,
                              filename: value.filename || 'Image',
                              type: value.type,
                              thumbnails: value.thumbnails,
                              id: value.id,
                              size: value.size
                            };
                            setValue(actualFieldName, [attachment]);
                            logger.debug('🖼️ [RECORD SELECT] Set single attachment as array:', attachment);
                          }
                        } else {
                          // For non-select fields, handle the value properly
                          let processedValue = value;

                          // Handle Airtable formula/rollup error states
                          if (typeof value === 'object' && value !== null) {
                            // Check if it's an error state object from formulas/rollups
                            if ('state' in value && value.state === 'error') {
                              // Don't set error objects as field values
                              processedValue = '';
                            } else if ('value' in value) {
                              // Extract the actual value from wrapped objects
                              processedValue = value.value;
                            }
                          }

                          // Convert objects/arrays to appropriate string representation (but not for attachments)
                          if (typeof processedValue === 'object' && processedValue !== null && !processedValue.url) {
                            if (Array.isArray(processedValue)) {
                              // Check if it's an array of attachments
                              if (processedValue.length > 0 && processedValue[0]?.url) {
                                // This is an attachment array - don't convert to string
                                setValue(actualFieldName, processedValue);
                                return;
                              } 
                                processedValue = processedValue.join(', ');
                              
                            } else {
                              // For other objects, try to extract meaningful data
                              processedValue = processedValue.name || processedValue.filename || '';
                            }
                          }

                          setValue(actualFieldName, processedValue);
                        }
                      }
                    });
                  }
                }}
                  onRefresh={() => loadAirtableRecords(values.baseId, values.tableName)}
                  onRecordSelected={() => {
                    // Wait for React to commit DOM changes and browser to paint
                    requestAnimationFrame(() => {
                      requestAnimationFrame(() => {
                        const fieldsSection = document.querySelector('[data-dynamic-fields]');
                        if (fieldsSection) {
                          fieldsSection.scrollIntoView({
                            behavior: 'smooth',
                            block: 'nearest' // Only scroll if not already visible
                          });
                        }
                      });
                    });
                  }}
                />
              </div>
            )}

            {/* Records table for update multiple records */}
            {isUpdateMultipleRecords && values.tableName && values.baseId && (
              <div className="w-full overflow-hidden">
                <div className="mb-3 text-sm text-gray-400">
                  Select up to 10 records to update (max limit for Airtable API)
                </div>
                <AirtableRecordsTable
                  records={airtableRecords}
                  loading={loadingRecords}
                  selectedRecords={selectedMultipleRecords}
                  multiSelect={true}
                  tableName={values.tableName}
                  onSelectRecords={(records) => {
                    setSelectedMultipleRecords(records);
                    // Store record IDs as comma-separated string
                    const recordIds = records.map(r => r.id).join(',');
                    setValue('recordIds', recordIds);
                  }}
                  onRefresh={() => loadAirtableRecords(values.baseId, values.tableName)}
                />
                {selectedMultipleRecords.length > 0 && (
                  <div className="mt-3 text-sm text-green-400">
                    {selectedMultipleRecords.length} record{selectedMultipleRecords.length !== 1 ? 's' : ''} selected
                  </div>
                )}
              </div>
            )}

            {/* Records table and field checklist for duplicate record */}
            {isDuplicateRecord && values.tableName && values.baseId && (
              <div className="w-full space-y-6">
                {/* Record selection table */}
                <div className="overflow-hidden">
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold text-slate-200 mb-1">
                      Select Record to Duplicate
                    </h3>
                    <p className="text-xs text-slate-500">
                      Click a row to select the record you want to duplicate, or paste a record ID above
                    </p>
                  </div>
                  <AirtableRecordsTable
                    records={airtableRecords}
                    loading={loadingRecords}
                    selectedRecord={selectedDuplicateRecord}
                    tableName={values.tableName}
                    onSelectRecord={handleDuplicateRecordSelection}
                    onRefresh={() => loadAirtableRecords(values.baseId, values.tableName)}
                  />
                </div>

                {/* Field checklist with override toggles */}
                {selectedDuplicateRecord && duplicateFieldChecklist.length > 0 && (
                  <div className="border border-slate-700 rounded-lg p-4 bg-slate-800/30">
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-slate-200 mb-1">
                        Select Fields to Duplicate
                      </h3>
                      <p className="text-xs text-slate-500">
                        Check fields to copy, and enable "Override" to change their values in the duplicate
                      </p>
                    </div>
                    <FieldChecklistWithOverride
                      fields={duplicateFieldChecklist}
                      onChange={handleDuplicateFieldsChange}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Dynamic fields for create/update */}
            {(isCreateRecord || (isUpdateRecord && selectedRecord) || (isUpdateMultipleRecords && selectedMultipleRecords.length > 0)) && dynamicFields.length > 0 && (
              <div className="space-y-3" data-dynamic-fields>
                <div className="mt-6 border-t border-slate-200 pt-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-1">Table Fields</h3>
                  <p className="text-xs text-slate-500 mb-4">Configure the values for each field in the {values.tableName} table</p>
                </div>
                <div className="space-y-3">
                  {renderFields(dynamicFields, true)}
                </div>
              </div>
            )}
            
          </div>
        </div>
      </div>

      <div className="border-t border-border px-6 py-4">
        <div className="flex justify-end items-center">
          <Button type="submit">
            {isEditMode ? 'Update' : 'Save'} Configuration
          </Button>
        </div>
      </div>
    </form>
  );
}
