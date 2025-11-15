"use client"

import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Database, RefreshCw, ChevronDown } from "lucide-react";
import { FieldRenderer } from '../fields/FieldRenderer';
import { useIntegrationStore } from '@/stores/integrationStore';
import { useAirtableBubbleHandler } from '../hooks/useAirtableBubbleHandler';
import { useFieldValidation } from '../hooks/useFieldValidation';
import { AirtableRecordsTable } from '../AirtableRecordsTable';
import { FieldChecklistWithOverride } from '../FieldChecklistWithOverride';
import { getAirtableFieldTypeFromSchema, isEditableFieldType } from '../utils/airtableHelpers';
import { BubbleDisplay } from '../components/BubbleDisplay';
import { ConfigurationSectionHeader } from '../components/ConfigurationSectionHeader';
import { getProviderDisplayName } from '@/lib/utils/provider-names';
import { saveInstantReopenSnapshot, loadInstantReopenSnapshot } from '@/lib/utils/field-cache';

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
  workflowId?: string;
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
  workflowId,
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
  const [batchLoadedOptions, setBatchLoadedOptions] = useState<Record<string, any[]>>({});
  const [isBatchLoading, setIsBatchLoading] = useState(false);

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

  // Merge parent dynamicOptions with batch-loaded options
  // Only use batch-loaded if they have data, don't overwrite existing parent data
  const mergedDynamicOptions = React.useMemo(() => {
    const merged = { ...dynamicOptions };

    // Add batch-loaded options, but only if they have data OR parent doesn't have them
    Object.entries(batchLoadedOptions).forEach(([key, value]) => {
      const hasData = Array.isArray(value) && value.length > 0;
      const parentHasData = Array.isArray(merged[key]) && merged[key].length > 0;

      // Only overwrite if batch has data OR parent doesn't have data
      if (hasData || !parentHasData) {
        merged[key] = value;
      } else {
        console.log(`[AirtableConfig] Skipping batch option "${key}" - batch has no data (${value?.length || 0}) and parent has data (${merged[key]?.length || 0})`);
      }
    });

    console.log('[AirtableConfig] 🔍 Merged dynamic options:', {
      parentOptionsKeys: Object.keys(dynamicOptions),
      batchOptionsKeys: Object.keys(batchLoadedOptions),
      mergedKeys: Object.keys(merged),
      mergedOptionsSample: Object.entries(merged).map(([key, val]) => ({
        key,
        count: Array.isArray(val) ? val.length : 'not array',
        sample: Array.isArray(val) ? val.slice(0, 2) : val
      }))
    });
    return merged;
  }, [dynamicOptions, batchLoadedOptions]);

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
  const isCreateMultipleRecords = nodeInfo?.type === 'airtable_action_create_multiple_records';
  const isListRecord = nodeInfo?.type === 'airtable_action_list_records';
  const isFindRecord = nodeInfo?.type === 'airtable_action_find_record';
  const isDeleteRecord = nodeInfo?.type === 'airtable_action_delete_record';
  const isDuplicateRecord = nodeInfo?.type === 'airtable_action_duplicate_record';

  // Restore selectedRecord from saved recordId for instant display on modal reopen
  React.useEffect(() => {
    // Only run for update record mode
    if (!isUpdateRecord) return;

    // If we have a saved recordId but no selectedRecord yet, create a minimal record object
    if (values.recordId && !selectedRecord && airtableRecords.length === 0) {
      // Create a minimal record object with just the ID
      // The full record data will be populated when records load
      const minimalRecord = {
        id: values.recordId,
        fields: {} // Empty for now, will be populated when actual records load
      };
      setSelectedRecord(minimalRecord);
      logger.debug('🔄 [INSTANT REOPEN] Restored selectedRecord from saved recordId:', values.recordId);
    }

    // Once records are loaded, find and set the full record object
    if (values.recordId && airtableRecords.length > 0) {
      const fullRecord = airtableRecords.find(r => r.id === values.recordId);
      if (fullRecord && (!selectedRecord || selectedRecord.id === values.recordId && Object.keys(selectedRecord.fields || {}).length === 0)) {
        setSelectedRecord(fullRecord);
        logger.debug('✅ [INSTANT REOPEN] Updated selectedRecord with full data');
      }
    }
  }, [values.recordId, airtableRecords, selectedRecord, isUpdateRecord, setSelectedRecord]);

  // INSTANT REOPEN: Restore complete snapshot if available
  // This provides ZERO latency when reopening saved configs
  const [isRestoringSnapshot, setIsRestoringSnapshot] = React.useState(false);
  const hasRestoredSnapshot = React.useRef(false);

  React.useEffect(() => {
    // Only run once on mount
    if (hasRestoredSnapshot.current || !workflowId || !currentNodeId) return;

    // Try to load saved snapshot
    const snapshot = loadInstantReopenSnapshot(workflowId, currentNodeId);

    if (snapshot) {
      hasRestoredSnapshot.current = true;
      setIsRestoringSnapshot(true);

      logger.debug('⚡ [INSTANT REOPEN] Restoring complete snapshot...');

      // Restore ALL state instantly
      try {
        // 1. Restore field suggestions (bubbles)
        if (snapshot.bubbles && Object.keys(snapshot.bubbles).length > 0) {
          setFieldSuggestions(snapshot.bubbles);
          logger.debug('✅ [INSTANT REOPEN] Restored bubbles:', Object.keys(snapshot.bubbles).length);
        }

        // 2. Restore active bubbles
        if (snapshot.activeBubbles && Object.keys(snapshot.activeBubbles).length > 0) {
          setActiveBubbles(snapshot.activeBubbles);
          logger.debug('✅ [INSTANT REOPEN] Restored active bubbles');
        }

        // 3. Restore dynamic options
        if (snapshot.dynamicOptions && Object.keys(snapshot.dynamicOptions).length > 0) {
          setDynamicOptions(snapshot.dynamicOptions);
          logger.debug('✅ [INSTANT REOPEN] Restored dynamic options:', Object.keys(snapshot.dynamicOptions).length);
        }

        // 4. Restore selected record
        if (snapshot.selectedRecord) {
          setSelectedRecord(snapshot.selectedRecord);
          logger.debug('✅ [INSTANT REOPEN] Restored selected record');
        }

        // 5. Restore selected records (for multi-select)
        if (snapshot.selectedRecords && snapshot.selectedRecords.length > 0) {
          setSelectedMultipleRecords(snapshot.selectedRecords);
          logger.debug('✅ [INSTANT REOPEN] Restored selected records');
        }

        // 6. Restore table schema
        if (snapshot.tableSchema) {
          setAirtableTableSchema(snapshot.tableSchema);
          logger.debug('✅ [INSTANT REOPEN] Restored table schema');
        }

        // 7. Restore records
        if (snapshot.records && snapshot.records.length > 0) {
          setAirtableRecords(snapshot.records);
          logger.debug('✅ [INSTANT REOPEN] Restored records:', snapshot.records.length);
        }

        logger.debug('🎉 [INSTANT REOPEN] Snapshot restoration complete - ZERO LATENCY!');
      } catch (error) {
        logger.error('[INSTANT REOPEN] Failed to restore snapshot:', error);
      } finally {
        setIsRestoringSnapshot(false);
      }
    }
  }, []); // Run only once on mount

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

  // Batch load field values for all dynamic fields
  const batchLoadFieldValues = useCallback(async (baseId: string, tableName: string, schema: any) => {
    if (!baseId || !tableName || !schema?.fields || !airtableIntegration) {
      return;
    }

    logger.debug('🔄 [Batch Load] Starting batch field value loading...', {
      baseId,
      tableName,
      fieldCount: schema.fields.length
    });

    setIsBatchLoading(true);

    try {
      // Separate fields into different categories
      const linkedRecordFields = schema.fields.filter((field: any) =>
        field.type === 'multipleRecordLinks' || field.type === 'singleRecordLink'
      );

      // Select fields with predefined choices (get from schema)
      const selectFields = schema.fields.filter((field: any) =>
        (field.type === 'singleSelect' || field.type === 'multipleSelects') && field.options?.choices
      );

      // Other dynamic fields (collaborators - fetch from records)
      const collaboratorFields = schema.fields.filter((field: any) => {
        const needsRecordData = ['multipleCollaborators', 'singleCollaborator'];
        return needsRecordData.includes(field.type);
      });

      if (linkedRecordFields.length === 0 && selectFields.length === 0 && collaboratorFields.length === 0) {
        logger.debug('✅ [Batch Load] No fields require dynamic loading');
        setIsBatchLoading(false);
        return;
      }

      logger.debug(`🔄 [Batch Load] Loading values in parallel:`, {
        linkedRecordCount: linkedRecordFields.length,
        selectFieldCount: selectFields.length,
        collaboratorFieldCount: collaboratorFields.length
      });

      // Build array of promises to fetch in parallel
      const fetchPromises: Promise<any>[] = [];

      // 1. Fetch collaborator field values from current table (if any)
      if (collaboratorFields.length > 0) {
        fetchPromises.push(
          fetch('/api/integrations/airtable/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              integrationId: airtableIntegration.id,
              dataType: 'airtable_batch_field_values',
              options: {
                baseId,
                tableName,
                fields: collaboratorFields.map((f: any) => ({ name: f.name, type: f.type }))
              }
            })
          }).then(r => r.json())
        );
      }

      // 2. Fetch ALL records from each linked table in parallel
      linkedRecordFields.forEach((field: any) => {
        // Get linked table name from field options
        const linkedTableId = field.options?.linkedTableId;
        if (!linkedTableId) return;

        fetchPromises.push(
          fetch('/api/integrations/airtable/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              integrationId: airtableIntegration.id,
              dataType: 'airtable_linked_records',
              options: {
                baseId,
                linkedTableName: linkedTableId
              }
            })
          }).then(r => r.json()).then(result => ({
            fieldName: field.name,
            linkedRecords: result.data || []
          }))
        );
      });

      // Execute all fetches in parallel
      const results = await Promise.all(fetchPromises);

      // Process results
      const newOptions: Record<string, any[]> = {};

      // 1. Extract select field choices from schema (no API call needed!)
      selectFields.forEach((field: any) => {
        const fieldName = `airtable_field_${field.name}`;
        const choices = field.options?.choices || [];
        newOptions[fieldName] = choices.map((choice: any) => ({
          value: choice.name || choice.id,
          label: choice.name || choice.id,
          color: choice.color
        }));
        logger.debug(`  ✓ Loaded ${choices.length} choices from schema for ${fieldName}`);
      });

      // 2. Process API results
      results.forEach((result: any) => {
        if (result.data && Array.isArray(result.data)) {
          // This is batch field values result (collaborators)
          result.data.forEach((fieldData: any) => {
            const fieldName = `airtable_field_${fieldData.fieldName}`;
            newOptions[fieldName] = fieldData.values;
            logger.debug(`  ✓ Loaded ${fieldData.values.length} values for ${fieldName}`);
          });
        } else if (result.linkedRecords) {
          // This is linked records result
          const fieldName = `airtable_field_${result.fieldName}`;

          logger.debug(`🔍 [Linked Records] Processing ${result.linkedRecords.length} records for ${fieldName}:`, {
            sampleRecord: result.linkedRecords[0],
            recordKeys: result.linkedRecords[0] ? Object.keys(result.linkedRecords[0]) : []
          });

          // API already returns options in the correct {value, label} format - just use them directly!
          newOptions[fieldName] = result.linkedRecords;
          logger.debug(`  ✓ Loaded ${result.linkedRecords.length} linked records for ${fieldName}`);
        }
      });

      // Store batch-loaded options in local state
      setBatchLoadedOptions(newOptions);

      logger.debug('✅ [Batch Load] Parallel loading complete!', {
        totalFields: Object.keys(newOptions).length,
        totalValues: Object.values(newOptions).reduce((sum, arr) => sum + arr.length, 0),
        fieldDetails: Object.entries(newOptions).map(([key, values]) => ({
          field: key,
          count: values.length,
          sample: values.slice(0, 2)
        }))
      });

    } catch (error) {
      logger.error('❌ [Batch Load] Error batch loading field values:', error);
    } finally {
      setIsBatchLoading(false);
    }
  }, [airtableIntegration]);

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
      // PERFORMANCE: Fetch metadata AND field values in PARALLEL for faster loading
      const shouldBatchLoadValues = isCreateMultipleRecords || isCreateRecord || isUpdateRecord || isUpdateMultipleRecords;

      // Start metadata fetch
      const metadataPromise = fetch('/api/integrations/airtable/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId: airtableIntegration.id,
          baseId,
          tableName
        })
      });

      // Wait for metadata to get field list for batch loading
      const metaResponse = await metadataPromise;

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

          const newSchema = {
            table: { name: tableName, id: metadata.id },
            fields: metadata.fields,
            views: metadata.views || [],
            visibilityByFieldId
          };

          // CRITICAL: Batch load field values BEFORE setting schema
          // This prevents auto-load effects from firing individual requests
          if (shouldBatchLoadValues) {
            logger.debug('🔄 [Schema Load] Batch loading field values before setting schema...');
            await batchLoadFieldValues(baseId, tableName, newSchema);
            logger.debug('✅ [Schema Load] Batch loading complete, now setting schema');
          }

          // Set schema AFTER batch loading completes
          // This ensures auto-load effects see the batch-loaded options
          setAirtableTableSchema(newSchema);

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
      
      const fallbackSchema = {
        table: { name: tableName },
        fields: Array.from(fieldMap.values()),
        views: [],
        visibilityByFieldId: {}
      };

      // CRITICAL: Batch load field values BEFORE setting schema (same as above)
      if (isCreateMultipleRecords || isCreateRecord || isUpdateRecord || isUpdateMultipleRecords) {
        logger.debug('🔄 [Fallback Schema] Batch loading field values before setting schema...');
        await batchLoadFieldValues(baseId, tableName, fallbackSchema);
        logger.debug('✅ [Fallback Schema] Batch loading complete, now setting schema');
      }

      // Set schema AFTER batch loading completes
      setAirtableTableSchema(fallbackSchema);
    } catch (error) {
      logger.error('Error fetching table schema:', error);
      setAirtableTableSchema(null);
    } finally {
      setIsLoadingTableSchema(false);
    }
  }, [airtableIntegration, isCreateMultipleRecords, isCreateRecord, isUpdateRecord, isUpdateMultipleRecords, batchLoadFieldValues]);

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
      const fetchedRecords = result.data || [];
      setAirtableRecords(fetchedRecords);

      // Cache records for instant display on reopen (Zapier-like UX)
      // Store in form values with special key
      if (fetchedRecords.length > 0) {
        setValue('_cached_records', fetchedRecords);
        logger.debug('[AirtableConfig] Cached records for instant display:', {
          count: fetchedRecords.length,
          baseId,
          tableName
        });
      }
    } catch (error) {
      logger.error('Error loading records:', error);
      setAirtableRecords([]);
    } finally {
      setLoadingRecords(false);
    }
  }, [airtableIntegration, airtableTableSchema, fetchAirtableTableSchema, setValue]);

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

        // For CREATE record or CREATE MULTIPLE records: filter out fields that can't be set during creation
        if (isCreateRecord || isCreateMultipleRecords) {
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
        ? shouldUseDynamicDropdown ? `Select ${field.name}` : `Enter value`
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
      const fieldHasSavedValue = values[field.name] !== undefined && values[field.name] !== null && values[field.name] !== '';

      // Show field if:
      // 1. Dependency is satisfied, OR
      // 2. Field already has a saved value (from reopening a saved config)
      if (!dependencyValue && !fieldHasSavedValue) {
        return false; // Hide if dependency is not satisfied AND no saved value
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
      const fieldHasSavedValue = values[field.name] !== undefined && values[field.name] !== null && values[field.name] !== '';

      // Step 1: Only show baseId initially (unless field has saved value)
      if (field.name !== 'baseId' && (!values.baseId || values.baseId === '') && !fieldHasSavedValue) {
        if (isSearchRelated) {
          console.log(`❌ [shouldShowField] ${field.name}: Progressive disclosure - no baseId (value: ${values.baseId})`);
        }
        return false;
      }

      // Step 2: After baseId selected, show tableName
      // Step 3: After tableName selected, show all other fields
      // IMPORTANT: Treat empty string as falsy - it means table hasn't been selected yet
      // BUT: Show field if it already has a saved value (for reopening saved configs)
      if (field.name !== 'baseId' && field.name !== 'tableName' && (!values.tableName || values.tableName === '') && !fieldHasSavedValue) {
        if (isSearchRelated) {
          console.log(`❌ [shouldShowField] ${field.name}: Progressive disclosure - no tableName (value: '${values.tableName}')`);
        }
        return false;
      }
    }

    // Progressive disclosure for Delete Record
    if (isDeleteRecord) {
      const isDeleteRelated = ['recordId', 'deleteMode', 'searchMode', 'searchField', 'searchValue', 'matchType', 'caseSensitive', 'filterFormula', 'maxRecords'].includes(field.name);
      const fieldHasSavedValue = values[field.name] !== undefined && values[field.name] !== null && values[field.name] !== '';

      if (isDeleteRelated) {
        console.log(`🗑️ [shouldShowField] Checking ${field.name}:`, {
          fieldName: field.name,
          baseId: values.baseId,
          tableName: values.tableName,
          deleteMode: values.deleteMode,
          hasSavedValue: fieldHasSavedValue
        });
      }

      // Step 1: Only show baseId initially (unless field has saved value)
      if (field.name !== 'baseId' && (!values.baseId || values.baseId === '') && !fieldHasSavedValue) {
        if (isDeleteRelated) {
          console.log(`❌ [shouldShowField] ${field.name}: Progressive disclosure - no baseId`);
        }
        return false;
      }

      // Step 2: After baseId selected, show tableName (unless field has saved value)
      if (field.name !== 'baseId' && field.name !== 'tableName' && (!values.tableName || values.tableName === '') && !fieldHasSavedValue) {
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

  // For Update Record nodes: Add any saved airtable_field_* values that aren't in the schema yet
  // This ensures previously configured fields are visible when reopening the modal
  // For most cases, just use dynamicFields directly
  // We don't need to add saved fields that aren't in the schema - the schema loading will handle that
  const allDynamicFields = dynamicFields;

  // Create a stable flag for whether to show the dynamic fields section
  // This prevents flashing as fields load/unload
  const shouldShowDynamicFieldsSection = useMemo(() => {
    const hasTableSelected = !!values.tableName;
    if (isCreateRecord) return hasTableSelected;
    if (isUpdateRecord) return hasTableSelected && (!!selectedRecord || !!values.recordId);
    if (isUpdateMultipleRecords) return selectedMultipleRecords.length > 0;
    return false;
  }, [isCreateRecord, isUpdateRecord, isUpdateMultipleRecords, values.tableName, values.recordId, selectedRecord, selectedMultipleRecords.length]);

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
        const dynamicField = allDynamicFields.find((f: any) => f.name === fieldName);
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

    // Skip loading if we just restored from snapshot (everything is already loaded)
    if (hasRestoredSnapshot.current && !tableChanged) {
      logger.debug('⚡ [INSTANT REOPEN] Skipping initial load - snapshot restored');
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
      // For create record or create multiple records, only load schema
      else if (isCreateRecord || isCreateMultipleRecords) {
        fetchAirtableTableSchema(values.baseId, values.tableName);
      }
      // For find record, load schema for field selection
      else if (isFindRecord) {
        fetchAirtableTableSchema(values.baseId, values.tableName);
      }
    }
  }, [isCreateRecord, isCreateMultipleRecords, isUpdateRecord, isUpdateMultipleRecords, isDuplicateRecord, isFindRecord, values.tableName, values.baseId, fetchAirtableTableSchema, loadAirtableRecords]);

  // Helper function to get a proper string label from any value
  const getLabelFromValue = useCallback((val: any, fieldName?: string): string => {
    // Handle attachment objects
    if (val && typeof val === 'object' && (val.url || val.filename)) {
      return val.filename || val.url || 'Attachment';
    }
    // Handle arrays
    if (Array.isArray(val)) {
      return val.map(v => getLabelFromValue(v, fieldName)).join(', ');
    }
    // Handle null/undefined
    if (val === null || val === undefined) {
      return '';
    }

    const findLabelInOptions = (options?: any[]) => {
      if (!options || !Array.isArray(options)) return undefined;
      const option = options.find((opt: any) => {
        if (opt.value?.includes?.('::')) {
          return opt.value.split('::')[0] === val;
        }
        return opt.value === val;
      });
      if (!option) return undefined;
      if (option.label) return option.label;
      if (option.name) return option.name;
      if (typeof option.value === 'string' && option.value.includes('::')) {
        return option.value.split('::').slice(1).join('::') || option.value.split('::')[0];
      }
      return undefined;
    };

    // Try to find friendly label from dynamic options if fieldName is provided
    if (fieldName) {
      const directLabel = findLabelInOptions(dynamicOptions[fieldName]);
      if (directLabel) return directLabel;

      if (fieldName.startsWith('airtable_field_')) {
        const rawName = fieldName.replace('airtable_field_', '');
        const altLabel = findLabelInOptions(dynamicOptions[rawName]) ||
                         findLabelInOptions(dynamicOptions[`airtable_field_${rawName}`]);
        if (altLabel) return altLabel;
      }
    }

    // Check for saved label metadata
    if (fieldName) {
      const labelMetadataKey = `${fieldName}_labels`;
      const savedLabels = values[labelMetadataKey] as Record<string, string> | undefined;
      const savedLabel = savedLabels?.[val];
      if (savedLabel) {
        return savedLabel;
      }
    }

    // Convert to string
    return String(val);
  }, [dynamicOptions, values]);

  const getOptionLabelForValue = useCallback((fieldName: string, val: any, fieldLabel?: string): string | undefined => {
    if (!fieldName) return undefined;
    const lookupKeys = [fieldName];
    if (fieldLabel) {
      const normalized = typeof fieldLabel === 'string' ? fieldLabel : '';
      if (normalized) {
        lookupKeys.push(`airtable_field_${normalized}`);
      }
    }

    for (const key of lookupKeys) {
      const options = mergedDynamicOptions[key] || [];
      const option = options.find((opt: any) => {
        if (typeof opt.value === 'string' && opt.value.includes('::')) {
          return opt.value.split('::')[0] === val;
        }
        return opt.value === val;
      });

      if (option) {
        if (typeof option.label === 'string' && option.label.trim().length > 0) {
          return option.label;
        }
        if (typeof option.name === 'string' && option.name.trim().length > 0) {
          return option.name;
        }
        if (typeof option.value === 'string' && option.value.includes('::')) {
          const parts = option.value.split('::');
          return parts.slice(1).join('::') || parts[0];
        }
        if (option.value) {
          return String(option.value);
        }
      }
    }
    return undefined;
  }, [mergedDynamicOptions]);

  // Handle field changes with bubble creation
  const handleFieldChange = useCallback((fieldName: string, value: any, skipBubbleCreation = false) => {
    // First, set the actual field value
    setValue(fieldName, value);

    // For Airtable fields, handle bubble creation
    if (fieldName.startsWith('airtable_field_') && !skipBubbleCreation && value) {
      const field = allDynamicFields.find(f => f.name === fieldName);
      if (!field) return;

      // Handle multi-select fields
      if (field.airtableFieldType === 'multipleSelects' || field.type === 'multi_select') {
        const normalizedValues = Array.isArray(value)
          ? value.filter(Boolean)
          : value
            ? [value]
            : [];

        const uniqueValues = Array.from(new Set(normalizedValues));

        if (uniqueValues.length === 0) {
          setFieldSuggestions(prev => {
            if (!prev[fieldName]) return prev;
            const { [fieldName]: _, ...rest } = prev;
            return rest;
          });
          setActiveBubbles(prev => {
            if (prev[fieldName] === undefined) return prev;
            const { [fieldName]: _, ...rest } = prev;
            return rest;
          });
          return;
        }

        const existingBubbles = fieldSuggestions[fieldName] || [];
        const bubbleMap = new Map(existingBubbles.map(bubble => [bubble.value, bubble]));
        const labelMetadata: Record<string, string> = {};

        const updatedBubbles = uniqueValues.map(val => {
          if (bubbleMap.has(val)) {
            const existing = bubbleMap.get(val)!;
            if (existing.label) {
              labelMetadata[val] = existing.label;
            }
            return existing;
          }
          const friendlyLabel =
            getOptionLabelForValue(fieldName, val, field.label) ||
            getLabelFromValue(val, fieldName) ||
            String(val);
          labelMetadata[val] = friendlyLabel;
          return {
            value: val,
            label: friendlyLabel,
            fieldName: field.name
          };
        });

        setFieldSuggestions(prev => ({
          ...prev,
          [fieldName]: updatedBubbles
        }));

        setValue(`${fieldName}_labels`, labelMetadata);

        setActiveBubbles(prev => ({
          ...prev,
          [fieldName]: updatedBubbles.map((_, idx) => idx)
        }));

      } else if (field.airtableFieldType === 'singleSelect') {
        // For single select, replace existing bubble
        const newBubble = {
          value: value,
          label: getLabelFromValue(value, fieldName),
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
      } else if (field.airtableFieldType === 'multipleAttachments' || field.type === 'file') {
        // Handle image/attachment fields
        // Note: AirtableImageField already converts Files to base64 before calling onChange
        logger.debug('🖼️ [BUBBLE CREATION] Image/attachment field detected:', {
          fieldName,
          value,
          valueType: typeof value,
          isArray: Array.isArray(value),
          hasUrl: value?.url,
          filename: value?.filename
        });

        const attachments = Array.isArray(value) ? value : [value];

        // Create bubbles for each attachment
        const newBubbles = attachments.filter(Boolean).map((attachment: any) => {
          // AirtableImageField provides base64 in the url field
          if (attachment?.url) {
            return {
              value: attachment.url,
              label: attachment.filename || 'Image',
              fieldName: field.name,
              isImage: true,
              thumbnailUrl: attachment.url, // Use base64 URL for thumbnail
              fullUrl: attachment.url,
              filename: attachment.filename,
              size: attachment.size,
              type: attachment.type,
              isNewUpload: attachment.isLocal || false
            };
          }
          // Handle base64 strings directly
          else if (typeof attachment === 'string' && attachment.startsWith('data:')) {
            return {
              value: attachment,
              label: 'Image',
              fieldName: field.name,
              isImage: true,
              thumbnailUrl: attachment,
              fullUrl: attachment,
              filename: 'Image',
              isNewUpload: true
            };
          }
          return null;
        }).filter(Boolean);

        if (newBubbles.length > 0) {
          setFieldSuggestions(prev => ({
            ...prev,
            [fieldName]: [...(prev[fieldName] || []), ...newBubbles]
          }));

          // Auto-activate all image bubbles
          setActiveBubbles(prev => {
            const currentCount = Array.isArray(prev[fieldName]) ? (prev[fieldName] as number[]).length : 0;
            const newIndices = newBubbles.map((_, idx) => currentCount + idx);
            return {
              ...prev,
              [fieldName]: [...(Array.isArray(prev[fieldName]) ? prev[fieldName] as number[] : []), ...newIndices]
            };
          });

          logger.debug('🖼️ [BUBBLE CREATION] Created image bubbles:', newBubbles);
        }

        // Don't clear the value for attachments as they might be used directly
      } else if (field.airtableFieldType === 'multipleRecordLinks' || field.airtableFieldType === 'singleRecordLink') {
        logger.debug('🔵 [BUBBLE CREATION] Linked record field detected:', {
          fieldName,
          fieldType: field.airtableFieldType,
          value,
          valueType: typeof value,
          isArray: Array.isArray(value)
        });

        const rawValues = Array.isArray(value)
          ? value.filter(Boolean)
          : value
            ? [value]
            : [];

        const parsedValues = rawValues
          .map(val => {
            if (typeof val === 'string' && val.includes('::')) {
              const [recordId, ...nameParts] = val.split('::');
              return {
                recordId,
                recordName: nameParts.join('::') || undefined
              };
            }
            return {
              recordId: val,
              recordName: undefined
            };
          })
          .filter(item => !!item.recordId);

        const uniqueRecords = Array.from(
          new Map(parsedValues.map(item => [String(item.recordId), item])).values()
        );

        if (uniqueRecords.length === 0) {
          setFieldSuggestions(prev => {
            if (!prev[fieldName]) return prev;
            const { [fieldName]: _, ...rest } = prev;
            return rest;
          });
          setActiveBubbles(prev => {
            if (prev[fieldName] === undefined) return prev;
            const { [fieldName]: _, ...rest } = prev;
            return rest;
          });
          return;
        }

        const existingBubbles = fieldSuggestions[fieldName] || [];
        const bubbleMap = new Map(existingBubbles.map(bubble => [bubble.value, bubble]));
        const labelMetadata: Record<string, string> = {};

        const updatedBubbles = uniqueRecords.map(({ recordId, recordName }) => {
          if (bubbleMap.has(recordId)) {
            const existing = bubbleMap.get(recordId)!;
            if (existing.label) {
              labelMetadata[recordId] = existing.label;
            }
            return existing;
          }

          const friendlyLabel =
            recordName ||
            getOptionLabelForValue(fieldName, recordId, field.label) ||
            getLabelFromValue(recordId, fieldName) ||
            String(recordId);

          labelMetadata[recordId] = friendlyLabel;

          return {
            value: recordId,
            label: friendlyLabel,
            fieldName: field.name
          };
        });

        setFieldSuggestions(prev => ({
          ...prev,
          [fieldName]: updatedBubbles
        }));

        setValue(`${fieldName}_labels`, labelMetadata);

        if (field.airtableFieldType === 'multipleRecordLinks' || field.multiple) {
          setActiveBubbles(prev => ({
            ...prev,
            [fieldName]: updatedBubbles.map((_, idx) => idx)
          }));
        } else {
          setActiveBubbles(prev => ({
            ...prev,
            [fieldName]: updatedBubbles.length > 0 ? 0 : prev[fieldName]
          }));
        }
      }
    }
  }, [allDynamicFields, fieldSuggestions, setValue, getLabelFromValue, getOptionLabelForValue]);
  
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
    if (allDynamicFields.length === 0) return;

    logger.debug('🚀 [AUTO-LOAD] Checking for fields to auto-load', {
      totalFields: allDynamicFields.length,
      tableName: values.tableName,
      baseId: values.baseId
    });

    // Find all dropdown fields that haven't been auto-loaded yet
    const fieldsToAutoLoad = allDynamicFields.filter(field => {
      // Skip if already auto-loaded
      if (autoLoadedFields.has(field.name)) {
        return false;
      }

      // Check if it's a dropdown field with dynamic data
      const hasDynamicData = typeof field.dynamic === 'string' &&
                             field.dynamic !== 'true' &&
                             field.dynamic !== true;

      // Skip if already has options loaded OR if batch loading was attempted
      // CRITICAL: Batch load stores with "airtable_field_" prefix, so check both
      const fieldNameWithPrefix = `airtable_field_${field.name}`;
      const wasBatchLoaded = (field.name in batchLoadedOptions) || (fieldNameWithPrefix in batchLoadedOptions);
      const hasOptionsInDynamic = dynamicOptions[field.name]?.length > 0;

      if (wasBatchLoaded || hasOptionsInDynamic) {
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

        // Load the options silently in background (use cache, don't force refresh, silent mode)
        // This allows fields with cached labels to show instantly while options refresh
        if (field.dependsOn === 'tableName') {
          loadOptions(field.name, 'tableName', values.tableName, false, true, extraOptions)
            .finally(() => {
              setLocalLoadingFields(prev => {
                const newSet = new Set(prev);
                newSet.delete(field.name);
                return newSet;
              });
            });
        } else {
          loadOptions(field.name, undefined, undefined, false, true, extraOptions)
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
  }, [allDynamicFields, values.tableName, values.baseId, isCreateRecord, isUpdateRecord, isUpdateMultipleRecords, isFindRecord,
      dynamicOptions, batchLoadedOptions, autoLoadedFields, airtableTableSchema]); // Don't include loadOptions

  // Clear auto-loaded fields and invalidate dynamic field cache when table changes
  useEffect(() => {
    setAutoLoadedFields(new Set());

    // Invalidate cached options for dynamic fields when table changes
    // This ensures fresh data is loaded when switching to a different table
    if (values.tableName) {
      const { useConfigCacheStore } = require('@/stores/configCacheStore');
      const cacheStore = useConfigCacheStore.getState();

      // Invalidate only airtable_field_* options, keep baseId and tableName cache
      Object.keys(cacheStore.cache).forEach(key => {
        if (key.includes('airtable_field_')) {
          cacheStore.invalidate(key);
        }
      });
    }
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

      // Skip if already has options OR if batch loading was attempted (even if empty)
      // CRITICAL: Batch load stores with "airtable_field_" prefix, so check both
      const fieldNameWithPrefix = `airtable_field_${field.name}`;
      const wasBatchLoaded = (field.name in batchLoadedOptions) || (fieldNameWithPrefix in batchLoadedOptions);
      const hasOptionsInDynamic = dynamicOptions[field.name]?.length > 0;
      if (wasBatchLoaded || hasOptionsInDynamic) return false;

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

        // Load silently in background to allow cached labels to show instantly
        if (field.dependsOn === 'tableName') {
          loadOptions(field.name, 'tableName', values.tableName, false, true, extraOptions)
            .finally(() => {
              setLocalLoadingFields(prev => {
                const newSet = new Set(prev);
                newSet.delete(field.name);
                return newSet;
              });
            });
        } else {
          loadOptions(field.name, undefined, undefined, false, true, extraOptions)
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
      dynamicOptions, batchLoadedOptions, autoLoadedFields, airtableTableSchema, loadOptions]);

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

        // Load the field options silently to allow cached labels to show instantly
        loadOptions(field.name, undefined, undefined, false, true)
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

  // INSTANT PARALLEL LOADING: Load base, table, and all field options immediately on mount
  // This ensures reopened modals show all data instantly without waiting for sequential loads
  const hasTriggeredParallelLoad = useRef(false);
  useEffect(() => {
    // Only run once
    if (hasTriggeredParallelLoad.current) return;

    // Only run if we have saved base and table values (reopening saved config)
    if (!values.baseId || !values.tableName) return;
    if (!isEditMode && !Object.keys(values).some(k => k.startsWith('airtable_field_'))) return;

    hasTriggeredParallelLoad.current = true;

    logger.debug('🚀 [PARALLEL LOAD] Triggering instant parallel load for saved config', {
      baseId: values.baseId,
      tableName: values.tableName,
      savedFieldCount: Object.keys(values).filter(k => k.startsWith('airtable_field_')).length
    });

    // Load base options (silent, in background)
    loadOptions('baseId', undefined, undefined, false, true).catch(err => {
      logger.error('Failed to load base options:', err);
    });

    // Load table options (silent, in background)
    loadOptions('tableName', 'baseId', values.baseId, false, true).catch(err => {
      logger.error('Failed to load table options:', err);
    });

    // The auto-load effects will handle loading field options once they detect the table
  }, [values.baseId, values.tableName, isEditMode, loadOptions]); // Dependencies for checking conditions

  // Load linked record options when a record is selected
  useEffect(() => {
    if (!values.recordId || !allDynamicFields.length) return;

    logger.debug('🟢 [LINKED FIELDS] Record selected, checking for linked fields to load');

    // Find linked fields that haven't been loaded yet
    const linkedFieldsToLoad = allDynamicFields.filter(field =>
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
  }, [values.recordId, values.baseId, values.tableName, allDynamicFields.length, loadOptions, loadedLinkedFields, airtableTableSchema]); // Include all dependencies

  // Load dropdown options for dynamic fields only when user interacts with them
  // This prevents auto-expansion when table is loaded
  const loadDropdownOptionsForField = useCallback(async (fieldName: string) => {
    if (!allDynamicFields.length || !values.tableName || !values.baseId) return;

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
          
          // Check for saved bubble metadata first (includes all bubble data like images)
          const bubbleMetadataKey = `${actualFieldName}_bubbles`;
          const savedBubbles = values[bubbleMetadataKey] as any[] | undefined;

          const bubbles = recordIds.map((recordId, idx) => {
            // First check if we have saved bubble metadata for this value
            const savedBubble = savedBubbles?.find(b => b.value === recordId);

            // If we have saved bubble data, use it (preserves images and other rich data)
            if (savedBubble) {
              logger.debug('🟢 [BUBBLE INIT] Using saved bubble metadata:', savedBubble);
              return savedBubble;
            }

            // Check for saved label metadata FIRST (instant, no API call needed)
            const labelMetadataKey = `${actualFieldName}_labels`;
            const savedLabels = values[labelMetadataKey] as Record<string, string> | undefined;
            const savedLabel = savedLabels?.[recordId];

            // Then try to find the option in loaded options (if they've loaded)
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
              savedLabel,
              optionValue: option?.value
            });

            return {
              value: recordId,
              label: savedLabel || option?.label || recordId, // PRIORITIZE saved label (instant), then option label, then ID
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
            label: getLabelFromValue(val, actualFieldName),
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
              label: getLabelFromValue(existingValue, actualFieldName),
              fieldName: field.name
            }]
          }));

          setActiveBubbles(prev => ({
            ...prev,
            [actualFieldName]: 0
          }));
        }
        // Handle image/attachment fields
        else if ((field.airtableFieldType === 'multipleAttachments' || field.type === 'file') && existingValue) {
          // Check for saved bubble metadata first (includes image data)
          const bubbleMetadataKey = `${actualFieldName}_bubbles`;
          const savedBubbles = values[bubbleMetadataKey] as any[] | undefined;

          if (savedBubbles && savedBubbles.length > 0) {
            logger.debug('🖼️ [BUBBLE INIT] Restoring image bubbles from saved metadata:', savedBubbles);
            setFieldSuggestions(prev => ({
              ...prev,
              [actualFieldName]: savedBubbles
            }));

            setActiveBubbles(prev => ({
              ...prev,
              [actualFieldName]: savedBubbles.map((_, idx) => idx)
            }));
          } else {
            // Fallback: create bubbles from the field value itself
            const attachments = Array.isArray(existingValue) ? existingValue : [existingValue];
            const imageBubbles = attachments.filter(Boolean).map((attachment: any) => ({
              value: attachment.url || attachment,
              label: attachment.filename || 'Image',
              fieldName: field.name,
              isImage: true,
              thumbnailUrl: attachment.url,
              fullUrl: attachment.url,
              filename: attachment.filename,
              size: attachment.size
            }));

            if (imageBubbles.length > 0) {
              setFieldSuggestions(prev => ({
                ...prev,
                [actualFieldName]: imageBubbles
              }));

              setActiveBubbles(prev => ({
                ...prev,
                [actualFieldName]: imageBubbles.map((_, idx) => idx)
              }));
            }
          }
        }
      }
    });
  }, [dynamicFields, values.recordId, values]); // Added values to detect changes in saved bubble metadata
  
  // Update bubble labels when linked record options load
  useEffect(() => {
    if (!dynamicFields.length) return;
    
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

            const labelMetadata = updatedBubbles.reduce((acc: Record<string, string>, bubble: any) => {
              if (bubble?.value && bubble?.label) {
                acc[bubble.value] = bubble.label;
              }
              return acc;
            }, {});
            setValue(`${actualFieldName}_labels`, labelMetadata);
          }
        }
      }
    });
  }, [dynamicOptions, dynamicFields, fieldSuggestions, setValue]); // Run when options load
  
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

      const actualFieldName = suggestionsForField ? (fieldSuggestions[field.name] ? field.name : altFieldName) : undefined;
      const labelMetadataForField = actualFieldName
        ? (values[`${actualFieldName}_labels`] as Record<string, string> | undefined)
        : undefined;

      const displaySuggestions = suggestionsForField
        ? suggestionsForField.map((suggestion: any) => {
            const savedLabel = labelMetadataForField?.[suggestion.value];
            if (savedLabel && savedLabel !== suggestion.label) {
              return { ...suggestion, label: savedLabel };
            }
            if (typeof suggestion.label === 'string' && suggestion.label.startsWith('rec')) {
              const friendlyLabel = getOptionLabelForValue(actualFieldName || field.name, suggestion.value, field.label);
              if (friendlyLabel && friendlyLabel !== suggestion.label) {
                return { ...suggestion, label: friendlyLabel };
              }
            }
            return suggestion;
          })
        : undefined;
      const isMultiValueField = field.airtableFieldType === 'multipleRecordLinks' ||
        field.airtableFieldType === 'multipleSelects' ||
        field.airtableFieldType === 'multipleAttachments' ||
        field.multiple;

      const handleBubbleRemove = (idx: number, suggestionOverride?: any) => {
        if (!suggestionsForField || !actualFieldName) return;
        const suggestionBeingRemoved = suggestionOverride ?? suggestionsForField[idx];
        if (!suggestionBeingRemoved) return;

        const currentFieldValue = values[actualFieldName];
        if (Array.isArray(currentFieldValue)) {
          const newFieldValue = currentFieldValue.filter(v => v !== suggestionBeingRemoved.value);
          setValue(actualFieldName, newFieldValue.length > 0 ? newFieldValue : null);
        } else if (currentFieldValue === suggestionBeingRemoved.value) {
          setValue(actualFieldName, null);
        }

        const updatedSuggestions = suggestionsForField.filter((_: any, i: number) => i !== idx);

        setFieldSuggestions(prev => ({
          ...prev,
          [actualFieldName]: updatedSuggestions
        }));

        setActiveBubbles(prev => {
          if (isMultiValueField) {
            if (updatedSuggestions.length === 0) {
              const { [actualFieldName]: _, ...rest } = prev;
              return rest;
            }
            return {
              ...prev,
              [actualFieldName]: updatedSuggestions.map((_, optionIdx) => optionIdx)
            };
          }
          if (updatedSuggestions.length === 0) {
            const { [actualFieldName]: _, ...rest } = prev;
            return rest;
          }
          return {
            ...prev,
            [actualFieldName]: 0
          };
        });

        const labelMetadata = updatedSuggestions.reduce((acc: Record<string, string>, suggestion: any) => {
          if (suggestion?.value && suggestion?.label) {
            acc[suggestion.value] = suggestion.label;
          }
          return acc;
        }, {});

        setValue(`${actualFieldName}_bubbles`, updatedSuggestions);
        setValue(`${actualFieldName}_labels`, labelMetadata);
      };

      const handleClearAllBubbles = () => {
        if (!actualFieldName) return;
        setFieldSuggestions(prev => {
          const { [actualFieldName]: _, ...rest } = prev;
          return rest;
        });
        setActiveBubbles(prev => {
          const { [actualFieldName]: _, ...rest } = prev;
          return rest;
        });
        setValue(actualFieldName, null);
        setValue(`${actualFieldName}_labels`, {});
        setValue(`${actualFieldName}_bubbles`, []);
      };

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

      // For linked record fields, enhance options to ensure proper display
      let enhancedDynamicOptions = mergedDynamicOptions;
      if (field.airtableFieldType === 'multipleRecordLinks' || field.airtableFieldType === 'singleRecordLink') {
        const fieldValue = values[field.name];
        const labelMetadataKey = `${field.name}_labels`;
        const savedLabels = values[labelMetadataKey] as Record<string, string> | undefined;
        const existingOptions = mergedDynamicOptions[field.name] || [];

        // If we have options in "id::name" format, normalize them to show properly
        if (existingOptions.length > 0 && existingOptions[0]?.value?.includes('::')) {
          const normalizedOptions = existingOptions.map((opt: any) => {
            // Extract ID from "id::name" format
            const parts = opt.value.split('::');
            const id = parts[0];
            const name = parts[1] || opt.label;
            return {
              value: id, // Store just the ID as the value
              label: name || opt.label, // Use the name as the label
              recordId: id
            };
          });
          enhancedDynamicOptions = {
            ...mergedDynamicOptions,
            [field.name]: normalizedOptions
          };
        }
        // If we have saved labels but no loaded options, create temporary options from saved labels
        else if (savedLabels && existingOptions.length === 0) {
          const tempOptions = Object.entries(savedLabels).map(([id, label]) => ({
            value: id,
            label: label
          }));
          enhancedDynamicOptions = {
            ...mergedDynamicOptions,
            [field.name]: tempOptions
          };
        }
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
          dynamicOptions={enhancedDynamicOptions}
          loadingDynamic={fieldIsLoading}
          loadingFields={loadingFields}
          nodeInfo={nodeInfo}
          onDynamicLoad={handleDynamicLoad}
          parentValues={values}
          selectedValues={selectedBubbleValues}
          aiFields={aiFields}
          setAiFields={setAiFields}
          airtableTableSchema={airtableTableSchema}
          airtableBubbleSuggestions={displaySuggestions || suggestionsForField}
          onAirtableBubbleRemove={handleBubbleRemove}
        />
        
        {/* Bubble display for multi-select fields */}
        {field.name?.startsWith('airtable_field_') && (() => {
          // Check both possible field name formats
          const altFieldName = `airtable_field_${field.label}`;
          const suggestions = displaySuggestions || fieldSuggestions[field.name] || fieldSuggestions[altFieldName];
          const actualFieldNameForDisplay = fieldSuggestions[field.name] ? field.name : altFieldName;

          if (!suggestions) return null;

          // Check if this field has image bubbles (they need to always be shown for preview)
          const hasImages = suggestions.some((s: any) => s.isImage);
          const isAttachmentField = field.airtableFieldType === 'multipleAttachments' || field.type === 'file';

          // Don't show pills for single-select fields (they're already shown inline in the field)
          // For fields with only 1 selection, hide pills (show inline instead)
          // Exception: Always show image bubbles regardless of count (they provide the preview)
          const isSingleSelect = field.airtableFieldType === 'singleSelect' || field.airtableFieldType === 'singleRecordLink';
          const hasOnlyOne = suggestions.length === 1;

          if (isAttachmentField) {
            return null;
          }

          if (!hasImages && (isSingleSelect || hasOnlyOne)) {
            return null;
          }

          return (
            <BubbleDisplay
              fieldName={actualFieldNameForDisplay}
              suggestions={suggestions}
              onBubbleRemove={handleBubbleRemove}
              onClearAll={handleClearAllBubbles}
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
            let labelMetadata: Record<string, string> = {};
            let bubbleMetadata: any[] = [];

            if (Array.isArray(activeBubblesForField)) {
              // Multi-value: collect all active bubble values
              aggregatedValue = activeBubblesForField.map(idx =>
                suggestions[idx]?.value
              ).filter(v => v !== undefined);

              // Store labels and full bubble data for each value
              activeBubblesForField.forEach(idx => {
                const suggestion = suggestions[idx];
                if (suggestion?.value && suggestion?.label) {
                  labelMetadata[suggestion.value] = suggestion.label;
                }
                // Store full bubble data (includes image info)
                if (suggestion) {
                  bubbleMetadata.push(suggestion);
                }
              });
            } else if (typeof activeBubblesForField === 'number') {
              // Single-value: get the active bubble value
              aggregatedValue = suggestions[activeBubblesForField]?.value;

              // Store label for single value
              const suggestion = suggestions[activeBubblesForField];
              if (suggestion?.value && suggestion?.label) {
                labelMetadata[suggestion.value] = suggestion.label;
              }
              // Store full bubble data
              if (suggestion) {
                bubbleMetadata.push(suggestion);
              }
            }

            if (aggregatedValue !== undefined) {
              submissionValues[fieldName] = aggregatedValue;
              // Store label metadata with a special key
              submissionValues[`${fieldName}_labels`] = labelMetadata;
              // Store full bubble metadata (for images and other rich data)
              submissionValues[`${fieldName}_bubbles`] = bubbleMetadata;
            }
          }
        }
      });
    }

    // Save instant reopen snapshot for zero-latency modal reopening
    if (workflowId && currentNodeId) {
      try {
        // Collect ALL display labels from _labels metadata fields
        const displayLabels: Record<string, Record<string, string>> = {};
        Object.keys(submissionValues).forEach(key => {
          if (key.endsWith('_labels')) {
            const fieldName = key.replace('_labels', '');
            displayLabels[fieldName] = submissionValues[key] || {};
          }
        });

        saveInstantReopenSnapshot({
          workflowId,
          nodeId: currentNodeId,
          providerId: nodeInfo?.providerId || 'airtable',
          nodeType: nodeInfo?.type || 'unknown',
          values: submissionValues,
          displayLabels,
          bubbles: fieldSuggestions,
          activeBubbles,
          dynamicOptions,
          selectedRecord,
          selectedRecords: selectedMultipleRecords,
          tableSchema: airtableTableSchema,
          records: airtableRecords,
          timestamp: Date.now()
        });

        logger.debug('💾 [INSTANT REOPEN] Snapshot saved on form submit');
      } catch (error) {
        logger.warn('[INSTANT REOPEN] Failed to save snapshot:', error);
      }
    }

    await onSubmit(submissionValues);
  };

  // Handle keydown to prevent Enter from submitting form on input fields
  // IMPORTANT: This hook must be defined BEFORE any early returns to avoid hook order issues
  const handleFormKeyDown = useCallback((e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
      e.preventDefault();
      // Prevent form submission when Enter is pressed on input fields
      // RecordId field is meant for variables (e.g., {{trigger.recordId}}) or direct paste
    }
  }, []);

  // Show connection required state
  if (needsConnection) {
    // Get properly capitalized provider name
    const displayName = getProviderDisplayName(nodeInfo?.providerId || 'airtable');

    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
        <h3 className="text-lg font-semibold mb-2">{displayName} Connection Required</h3>
        <p className="text-sm text-slate-600">
          Please connect your {displayName} account to use this action.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full overflow-y-auto overflow-x-hidden px-6 py-4">
          <div className="space-y-3 pb-4 pr-4">
            {/* Base fields */}
            {renderFields(baseFields)}

            {/* Advanced fields - Always visible section */}
            {advancedFields.length > 0 && (
              <div className="border-t border-slate-200 pt-4 mt-6">
                <div className="space-y-1 mb-4">
                  <ConfigurationSectionHeader label="Advanced Settings" />
                  <p className="text-xs text-slate-500">
                    Optional configuration for batch processing
                  </p>
                </div>
                <div className="space-y-3">
                  {renderFields(advancedFields)}
                </div>
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
                cachedRecords={initialConfig?._cached_records}
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
                          
                          // Check for saved bubble metadata first (includes all bubble data like images)
                          const bubbleMetadataKey = `${actualFieldName}_bubbles`;
                          const savedBubbles = values[bubbleMetadataKey] as any[] | undefined;

                          const bubbles = recordIds.map(recordId => {
                            // First check if we have saved bubble metadata for this value
                            const savedBubble = savedBubbles?.find(b => b.value === recordId);

                            // If we have saved bubble data, use it (preserves images and other rich data)
                            if (savedBubble) {
                              logger.debug('🟣 [RECORD SELECT] Using saved bubble metadata:', savedBubble);
                              return savedBubble;
                            }

                            // Otherwise, create new bubble from options or saved labels
                            const option = options.find((opt: any) => {
                              if (opt.value?.includes('::')) {
                                return opt.value.startsWith(`${recordId }::`);
                              }
                              return opt.value === recordId;
                            });

                            // Check for saved label metadata FIRST (instant, no API call needed)
                            const labelMetadataKey = `${actualFieldName}_labels`;
                            const savedLabels = values[labelMetadataKey] as Record<string, string> | undefined;
                            const savedLabel = savedLabels?.[recordId];

                            const bubble = {
                              value: recordId,
                              label: savedLabel || option?.label || recordId, // PRIORITIZE saved label (instant), then option label, then ID
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
                            label: getLabelFromValue(v, actualFieldName),
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
                              label: getLabelFromValue(value, actualFieldName),
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

                            // Create bubbles for the images
                            const imageBubbles = attachments.map(attachment => ({
                              value: attachment.url,
                              label: attachment.filename || 'Image',
                              fieldName: field.name,
                              isImage: true,
                              thumbnailUrl: attachment.thumbnails?.small?.url || attachment.thumbnails?.large?.url || attachment.url,
                              fullUrl: attachment.url,
                              filename: attachment.filename,
                              size: attachment.size
                            }));

                            setFieldSuggestions(prev => ({
                              ...prev,
                              [actualFieldName]: imageBubbles
                            }));

                            setActiveBubbles(prev => ({
                              ...prev,
                              [actualFieldName]: imageBubbles.map((_, idx) => idx)
                            }));

                            logger.debug('🖼️ [RECORD SELECT] Set multiple attachments and created bubbles:', { attachments, imageBubbles });
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

                            // Create bubble for the image
                            const imageBubble = {
                              value: attachment.url,
                              label: attachment.filename || 'Image',
                              fieldName: field.name,
                              isImage: true,
                              thumbnailUrl: attachment.thumbnails?.small?.url || attachment.thumbnails?.large?.url || attachment.url,
                              fullUrl: attachment.url,
                              filename: attachment.filename,
                              size: attachment.size
                            };

                            setFieldSuggestions(prev => ({
                              ...prev,
                              [actualFieldName]: [imageBubble]
                            }));

                            setActiveBubbles(prev => ({
                              ...prev,
                              [actualFieldName]: 0
                            }));

                            logger.debug('🖼️ [RECORD SELECT] Set single attachment as array and created bubble:', { attachment, imageBubble });
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
                  cachedRecords={initialConfig?._cached_records}
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
                  <div className="mb-3 space-y-1">
                    <ConfigurationSectionHeader
                      label="Select Record to Duplicate"
                      className="border-none pb-0"
                    />
                    <p className="text-xs text-gray-600">
                      Click a row to select the record you want to duplicate, or paste a record ID above
                    </p>
                  </div>
                  <AirtableRecordsTable
                    records={airtableRecords}
                    loading={loadingRecords}
                    selectedRecord={selectedDuplicateRecord}
                    tableName={values.tableName}
                    cachedRecords={initialConfig?._cached_records}
                    onSelectRecord={handleDuplicateRecordSelection}
                    onRefresh={() => loadAirtableRecords(values.baseId, values.tableName)}
                  />
                </div>

                {/* Field checklist with override toggles */}
                {selectedDuplicateRecord && duplicateFieldChecklist.length > 0 && (
                  <div className="border border-gray-300 rounded-lg p-4 bg-white">
                    <div className="mb-4 space-y-1">
                      <ConfigurationSectionHeader
                        label="Select Fields to Duplicate"
                        className="border-none pb-0"
                      />
                      <p className="text-xs text-gray-600">
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
            {shouldShowDynamicFieldsSection && (
              <div className="space-y-3" data-dynamic-fields>
                <div className="mt-6 border-t border-slate-200 pt-4">
                  <div className="space-y-1 mb-4">
                    <ConfigurationSectionHeader label="Table Fields" />
                    <p className="text-xs text-slate-500">
                      Configure the values for each field in the {values.tableName} table
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  {renderFields(allDynamicFields, true)}
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
