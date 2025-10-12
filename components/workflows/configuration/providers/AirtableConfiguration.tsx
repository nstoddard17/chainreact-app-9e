"use client"

import React, { useCallback, useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Database, Eye, RefreshCw, ChevronLeft } from "lucide-react";
import { FieldRenderer } from '../fields/FieldRenderer';
import { useIntegrationStore } from '@/stores/integrationStore';
import { useAirtableBubbleHandler } from '../hooks/useAirtableBubbleHandler';
import { useFieldValidation } from '../hooks/useFieldValidation';
import { AirtableRecordsTable } from '../AirtableRecordsTable';
import { getAirtableFieldTypeFromSchema, isEditableFieldType } from '../utils/airtableHelpers';
import { BubbleDisplay } from '../components/BubbleDisplay';

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
  loadOptions: (fieldName: string, parentField?: string, parentValue?: any, forceReload?: boolean) => Promise<void>;
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
}: AirtableConfigurationProps) {
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  
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
  const loadingFields = parentLoadingFields ?? localLoadingFields;
  const setLoadingFields = parentLoadingFields ? () => {} : setLocalLoadingFields;

  // Track which dropdown fields have been loaded to prevent reloading
  const [loadedDropdownFields, setLoadedDropdownFields] = useState<Set<string>>(new Set());

  const [localAirtableRecords, setLocalAirtableRecords] = useState<any[]>([]);
  const airtableRecords = parentAirtableRecords ?? localAirtableRecords;
  const setAirtableRecords = parentSetAirtableRecords ?? setLocalAirtableRecords;
  
  const [loadingRecords, setLoadingRecords] = useState(false);
  
  const [localSelectedRecord, setLocalSelectedRecord] = useState<any>(null);
  const selectedRecord = parentSelectedRecord ?? localSelectedRecord;
  const setSelectedRecord = parentSetSelectedRecord ?? setLocalSelectedRecord;
  
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
  
  const [loadingPreview, setLoadingPreview] = useState(false);

  const { getIntegrationByProvider } = useIntegrationStore();
  const airtableIntegration = getIntegrationByProvider('airtable');

  // Check node type
  const isUpdateRecord = nodeInfo?.type === 'airtable_action_update_record';
  const isCreateRecord = nodeInfo?.type === 'airtable_action_create_record';
  const isListRecord = nodeInfo?.type === 'airtable_action_list_records';

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
      console.error('Airtable integration not found');
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
        console.log('📋 Fetched Airtable table metadata:', metadata);
        
        // Log specific fields we care about
        const linkedFields = metadata.fields?.filter((f: any) => 
          f.type === 'multipleRecordLinks' || f.type === 'singleRecordLink'
        );
        console.log('🔗 Linked record fields found in metadata:', linkedFields);
        
        if (metadata.fields && metadata.fields.length > 0) {
          console.log('📋 Setting table schema with fields:', metadata.fields.map((f: any) => ({
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
      console.log('⚠️ Metadata API failed or returned no fields, falling back to record inference');
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
        console.error('Failed to fetch table data');
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
      console.error('Error fetching table schema:', error);
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
      console.error('Airtable integration not found');
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
        console.error('Failed to fetch records');
        setAirtableRecords([]);
        return;
      }
      
      const result = await response.json();
      setAirtableRecords(result.data || []);
    } catch (error) {
      console.error('Error loading records:', error);
      setAirtableRecords([]);
    } finally {
      setLoadingRecords(false);
    }
  }, [airtableIntegration, airtableTableSchema, fetchAirtableTableSchema]);

  // Load preview data for list records
  const loadPreviewData = useCallback(async (baseId: string, tableName: string) => {
    if (!baseId || !tableName) return;
    
    // Check if integration exists
    if (!airtableIntegration) {
      console.error('Airtable integration not found');
      setPreviewData([]);
      return;
    }
    
    setLoadingPreview(true);
    setShowPreviewData(true);
    
    try {
      await fetchAirtableTableSchema(baseId, tableName);
      
      const response = await fetch('/api/integrations/airtable/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId: airtableIntegration.id,
          dataType: 'airtable_records',
          options: {
            baseId,
            tableName,
            maxRecords: 20,
            filterByFormula: values.filterField && values.filterValue 
              ? `{${values.filterField}} = "${values.filterValue}"`
              : undefined
          }
        })
      });
      
      if (!response.ok) {
        console.error('Failed to fetch preview data');
        setPreviewData([]);
        return;
      }
      
      const result = await response.json();
      setPreviewData(result.data || []);
    } catch (error) {
      console.error('Error loading preview:', error);
      setPreviewData([]);
    } finally {
      setLoadingPreview(false);
    }
  }, [airtableIntegration, values, fetchAirtableTableSchema]);

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
          console.log('🚫 [AirtableConfig] Excluding unsupported field:', field.name, field.type);
          return false;
        }

        // For CREATE record: filter out fields that can't be set during creation
        if (isCreateRecord) {
          // Always hide autoNumber fields - they're generated by Airtable on creation
          if (field.type === 'autoNumber') {
            console.log('🚫 [AirtableConfig] Excluding autoNumber field for create action:', field.name);
            return false;
          }

          // Also filter out fields explicitly hidden in Airtable views
          const visibilitySetting = visibilityByFieldId[field.id];
          if (visibilitySetting && typeof visibilitySetting === 'string') {
            const isHidden = visibilitySetting.toLowerCase() !== 'visible' &&
                           visibilitySetting.toLowerCase() !== 'shown';
            if (isHidden) {
              console.log('🚫 [AirtableConfig] Excluding hidden field for create action:', field.name, visibilitySetting);
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
    // Never show fields with type: 'hidden'
    if (field.type === 'hidden') return false;
    
    // If field has hidden: true and dependsOn, only show if dependency is satisfied
    if (field.hidden && field.dependsOn) {
      const dependencyValue = values[field.dependsOn];
      return !!dependencyValue; // Show only if dependency has a value
    }
    
    // If field has hidden: true but no dependsOn, don't show it
    if (field.hidden) return false;
    
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

  // Handle dynamic field loading
  const handleDynamicLoad = useCallback(async (
    fieldName: string,
    dependsOn?: string,
    dependsOnValue?: any,
    forceReload?: boolean
  ) => {
    console.log('🔍 [AirtableConfig] handleDynamicLoad called:', {
      fieldName,
      dependsOn,
      dependsOnValue,
      forceReload,
      hasExistingOptions: !!(dynamicOptions[fieldName] && dynamicOptions[fieldName].length > 0)
    });

    // Check if options are already loaded (don't reload on every dropdown open)
    if (!forceReload && dynamicOptions[fieldName] && dynamicOptions[fieldName].length > 0) {
      console.log('✅ [AirtableConfig] Options already loaded for field:', fieldName);
      return;
    }

    // Prepare extraOptions with baseId and tableName for Airtable fields
    const extraOptions = {
      baseId: values.baseId,
      tableName: values.tableName
    };

    console.log('🔍 [AirtableConfig] Loading options for dynamic field:', {
      fieldName,
      baseId: values.baseId,
      tableName: values.tableName,
      extraOptions
    });

    // First check if it's a dynamic Airtable field (linked records, etc.)
    if (fieldName.startsWith('airtable_field_')) {
      // This is a dynamic field from the table schema
      const dynamicField = dynamicFields.find((f: any) => f.name === fieldName);

      if (dynamicField) {
        console.log('🔍 [AirtableConfig] Loading options for dynamic field:', {
          fieldName,
          fieldType: dynamicField.airtableFieldType,
          isLinkedRecord: dynamicField.airtableFieldType === 'multipleRecordLinks' ||
                         dynamicField.airtableFieldType === 'singleRecordLink'
        });

        // For linked record fields, always load the linked records
        if (dynamicField.airtableFieldType === 'multipleRecordLinks' ||
            dynamicField.airtableFieldType === 'singleRecordLink') {
          // Load linked records - loadOptions will handle this specially
          await loadOptions(fieldName, undefined, undefined, forceReload, false, extraOptions);
        }
        // For other dynamic dropdown fields, also load with extraOptions
        else {
          // Load with extraOptions for dropdown fields
          await loadOptions(fieldName, undefined, undefined, forceReload, false, extraOptions);
        }
        return;
      }
    }

    // Check in the regular config schema
    const field = nodeInfo?.configSchema?.find((f: any) => f.name === fieldName);
    if (!field) {
      console.warn('Field not found in schema:', fieldName);
      return;
    }

    try {
      // If explicit dependencies are provided, use them
      if (dependsOn && dependsOnValue !== undefined) {
        await loadOptions(fieldName, dependsOn, dependsOnValue, forceReload, false, extraOptions);
      }
      // Otherwise check field's defined dependencies
      else if (field.dependsOn && values[field.dependsOn]) {
        await loadOptions(fieldName, field.dependsOn, values[field.dependsOn], forceReload, false, extraOptions);
      }
      // No dependencies, just load the field
      else {
        await loadOptions(fieldName, undefined, undefined, forceReload, false, extraOptions);
      }
    } catch (error) {
      console.error('Error loading dynamic options:', error);
    }
  }, [nodeInfo, values, loadOptions, dynamicFields, dynamicOptions]);

  // Load schema on initial mount if we have baseId and tableName
  useEffect(() => {
    // Check if we're reopening the modal with existing values
    if (values.baseId && values.tableName && !airtableTableSchema && !isLoadingTableSchema) {
      console.log('📂 [INITIAL LOAD] Modal opened with existing values, loading schema:', {
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
    console.log('🔄 [AirtableConfig] Table changed, resetting processedSchemaRef and clearing aiFields');
    processedSchemaRef.current = null;
    // Clear aiFields so all fields in the new table can be set to AI mode
    setAiFields({});
    // Also clear the schema to ensure we don't apply AI fields with stale schema
    setAirtableTableSchema?.(null);
    console.log('✅ [AirtableConfig] Cleared schema to force reload for new table');
  }, [values.tableName, setAiFields, setAirtableTableSchema]);

  // Log component mount and initial state
  useEffect(() => {
    console.log('🔍 [AirtableConfig] Component mounted/updated:', {
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
    console.log('🔍 [AirtableConfig] Auto-AI useEffect triggered:', {
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

      console.log('🔍 [AirtableConfig] Schema detected:', {
        schemaKey,
        previousSchemaKey: processedSchemaRef.current,
        alreadyProcessed: processedSchemaRef.current === schemaKey
      });

      // Skip if we've already processed this exact schema
      if (processedSchemaRef.current === schemaKey) {
        console.log('⏭️ [AirtableConfig] Skipping - already processed this schema');
        return;
      }

      console.log('🤖 [AirtableConfig] Auto-setting AI mode for dynamic fields');

      const dynamicFields = getDynamicFields();
      console.log('🔍 [AirtableConfig] Dynamic fields:', dynamicFields.map((f: any) => f.name));

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

        console.log('🔍 [AirtableConfig] Processing field:', {
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
          console.log('✅ [AirtableConfig] Set field to AI mode:', fieldName);
        }
      });

      // Update aiFields state only if there are changes
      if (hasChanges) {
        console.log('🤖 [AirtableConfig] Setting aiFields for', Object.keys(newAiFields).length, 'fields');
        console.log('🔍 [AirtableConfig] New aiFields:', newAiFields);
        setAiFields(newAiFields);
        processedSchemaRef.current = schemaKey;
      } else {
        console.log('⚠️ [AirtableConfig] No changes to make');
      }
    } else {
      console.log('⚠️ [AirtableConfig] Conditions not met:', {
        hasAllFieldsAI: !!values._allFieldsAI,
        hasSchema: !!airtableTableSchema?.fields
      });
    }
  }, [airtableTableSchema, values._allFieldsAI, values.baseId, values.tableName]);

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

      // For update record, load both schema and records
      if (isUpdateRecord) {
        // Load schema first, then records (records loading checks for schema)
        fetchAirtableTableSchema(values.baseId, values.tableName).then(() => {
          loadAirtableRecords(values.baseId, values.tableName);
        });
      }
      // For create record, only load schema
      else if (isCreateRecord) {
        fetchAirtableTableSchema(values.baseId, values.tableName);
      }
    }
  }, [isCreateRecord, isUpdateRecord, values.tableName, values.baseId, fetchAirtableTableSchema, loadAirtableRecords]);

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
              label: val,
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
          label: value,
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
        console.log('🔵 [BUBBLE CREATION] Linked record field detected:', {
          fieldName,
          fieldType: field.airtableFieldType,
          value,
          valueType: typeof value,
          isArray: Array.isArray(value)
        });
        
        const valuesToAdd = Array.isArray(value) ? value : [value];
        
        valuesToAdd.forEach(val => {
          console.log('🔵 [BUBBLE CREATION] Processing value:', {
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
            console.log('🔵 [BUBBLE CREATION] Parsed ID::Name format:', {
              recordId,
              recordName,
              partsCount: parts.length
            });
          } else {
            console.log('⚠️ [BUBBLE CREATION] No :: separator found, using raw value:', val);
          }
          
          // Check if bubble already exists (by ID)
          const exists = fieldSuggestions[fieldName]?.some(s => s.value === recordId);
          if (!exists) {
            const newBubble = {
              value: recordId, // Use ID as value (for API)
              label: recordName, // Use name as label (for display)
              fieldName: field.name
            };
            
            console.log('🔵 [BUBBLE CREATION] Creating new bubble:', newBubble);
            
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
  }, [dynamicFields, fieldSuggestions, setValue]);
  
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
    // Only for create/update record actions
    if (!isCreateRecord && !isUpdateRecord) return;
    if (!values.tableName || !values.baseId) return;
    if (dynamicFields.length === 0) return;

    console.log('🚀 [AUTO-LOAD] Checking for fields to auto-load', {
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
      console.log('🚀 [AUTO-LOAD] Auto-loading fields:', fieldsToAutoLoad.map(f => ({
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
        setLoadingFields(prev => new Set(prev).add(field.name));

        // Prepare extra options for context
        const extraOptions = {
          baseId: values.baseId,
          tableName: values.tableName,
          tableFields: airtableTableSchema?.fields || []
        };

        console.log(`🔄 [AUTO-LOAD] Loading options for: ${field.label}`, {
          fieldName: field.name,
          dynamic: field.dynamic,
          dependsOn: field.dependsOn
        });

        // Load the options
        if (field.dependsOn === 'tableName') {
          loadOptions(field.name, 'tableName', values.tableName, true, false, extraOptions)
            .finally(() => {
              setLoadingFields(prev => {
                const newSet = new Set(prev);
                newSet.delete(field.name);
                return newSet;
              });
            });
        } else {
          loadOptions(field.name, undefined, undefined, true, false, extraOptions)
            .finally(() => {
              setLoadingFields(prev => {
                const newSet = new Set(prev);
                newSet.delete(field.name);
                return newSet;
              });
            });
        }
      });
    }
  }, [dynamicFields, values.tableName, values.baseId, isCreateRecord, isUpdateRecord,
      dynamicOptions, autoLoadedFields, airtableTableSchema, loadOptions]);

  // Clear auto-loaded fields when table changes
  useEffect(() => {
    setAutoLoadedFields(new Set());
  }, [values.tableName]);
  
  // Load linked record options when a record is selected
  useEffect(() => {
    if (!values.recordId || !dynamicFields.length) return;

    console.log('🟢 [LINKED FIELDS] Record selected, checking for linked fields to load');

    // Find linked fields that haven't been loaded yet
    const linkedFieldsToLoad = dynamicFields.filter(field =>
      (field.airtableFieldType === 'multipleRecordLinks' || field.airtableFieldType === 'singleRecordLink') &&
      !loadedLinkedFields.has(field.name)
    );

    if (linkedFieldsToLoad.length > 0) {
      console.log('🟢 [LINKED FIELDS] Loading options for linked fields:', linkedFieldsToLoad.map(f => f.name));

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

        console.log('🟢 [LINKED FIELDS] Loading with context:', {
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

    console.log('🔄 [DROPDOWN FIELDS] Loading options for field:', fieldName);

    // Mark field as loaded first to prevent duplicate loads
    setLoadedDropdownFields(prev => new Set([...prev, fieldName]));

    try {
      const extraOptions = {
        baseId: values.baseId,
        tableName: values.tableName
      };

      console.log('🔄 [DROPDOWN FIELDS] Loading with context:', {
        fieldName,
        dynamicType: field.dynamic,
        extraOptions
      });

      // Load the options
      await loadOptions(fieldName, 'tableName', values.tableName, false, false, extraOptions);
      console.log('✅ [DROPDOWN FIELDS] Field loaded:', fieldName);
    } catch (error) {
      console.error('❌ [DROPDOWN FIELDS] Error loading field:', fieldName, error);
    }
  }, [dynamicFields, values.tableName, values.baseId, loadOptions, loadedDropdownFields, dynamicOptions]);
  
  // Initialize bubbles from existing values (for editing existing workflows)
  useEffect(() => {
    if (!dynamicFields.length || !values) return;

    // Initialize bubbles for create record too (when reopening saved workflow)
    const shouldInitialize = isEditMode || values.recordId ||
      (Object.keys(values).some(key => key.startsWith('airtable_field_') && values[key]));

    if (!shouldInitialize) {
      console.log('🟢 [BUBBLE INIT] No existing values to initialize');
      return;
    }
    
    console.log('🟢 [BUBBLE INIT] Record selected, checking fields for existing values:', {
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
      
      console.log('🟢 [BUBBLE INIT] Checking field:', {
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
        console.log('🟢 [BUBBLE INIT] Found existing value for field:', {
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
          console.log('🟢 [BUBBLE INIT] Looking up names in options:', {
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
            
            console.log('🟢 [BUBBLE INIT] Mapping record ID to bubble:', {
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
    
    console.log('🔄 [BUBBLE UPDATE] Checking if bubble labels need updating after options loaded');
    
    // Check each dynamic field to see if we need to update bubble labels
    dynamicFields.forEach(field => {
      if (field.airtableFieldType === 'multipleRecordLinks' || field.airtableFieldType === 'singleRecordLink') {
        const fieldName = field.name;
        const altFieldName = `airtable_field_${field.label}`;
        const actualFieldName = fieldSuggestions[fieldName] ? fieldName : altFieldName;
        
        const currentBubbles = fieldSuggestions[actualFieldName];
        const options = dynamicOptions[fieldName] || [];
        
        if (currentBubbles && options.length > 0) {
          console.log('🔄 [BUBBLE UPDATE] Updating labels for field:', {
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
              console.log('🔄 [BUBBLE UPDATE] Updating bubble label:', {
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
          console.log('👁️‍🗨️ [AirtableConfig] Hiding field marked as hidden in Airtable view:', {
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
      console.log(`🎨 [RENDER] Rendering field ${field.name}:`, {
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

      return (
      <React.Fragment key={`field-${field.name}-${index}`}>
        <FieldRenderer
          field={field}
          value={values[field.name]}
          onChange={(value) => handleFieldChange(field.name, value)}
          error={errors[field.name] || validationErrors[field.name]}
          workflowData={workflowData}
          currentNodeId={currentNodeId}
          dynamicOptions={dynamicOptions}
          loadingDynamic={(loadingFields.has(field.name) || loadingDynamic) && !values[field.name]}
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
              activeBubbles={active}
            isMultiple={field.airtableFieldType === 'multipleSelects' || field.type === 'multi_select' || field.multiple}
              onBubbleClick={(idx, suggestion) => {
                // Toggle active state
                if (field.airtableFieldType === 'multipleSelects' || field.type === 'multi_select' || field.multiple) {
                  setActiveBubbles(prev => {
                    const current = Array.isArray(prev[actualFieldName]) ? prev[actualFieldName] as number[] : [];
                    if (current.includes(idx)) {
                      return {
                        ...prev,
                        [actualFieldName]: current.filter(i => i !== idx)
                      };
                    } 
                      return {
                        ...prev,
                        [actualFieldName]: [...current, idx]
                      };
                    
                  });
                } else {
                  setActiveBubbles(prev => ({
                    ...prev,
                    [actualFieldName]: prev[actualFieldName] === idx ? undefined : idx
                  }));
                }
              }}
              onBubbleRemove={(idx) => {
                setFieldSuggestions(prev => ({
                  ...prev,
                  [actualFieldName]: prev[actualFieldName].filter((_: any, i: number) => i !== idx)
                }));
              
                // Clear active bubble if this was it
                if (Array.isArray(active)) {
                  setActiveBubbles(prev => ({
                    ...prev,
                    [actualFieldName]: (prev[actualFieldName] as number[]).filter(i => i !== idx)
                  }));
                } else if (active === idx) {
                  setActiveBubbles(prev => {
                    const newBubbles = { ...prev };
                    delete newBubbles[actualFieldName];
                    return newBubbles;
                  });
                }
              }}
              originalValues={originalBubbleValues}
              values={values}
              handleFieldChange={(fieldName, value) => setValue(fieldName, value)}
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
      console.error('Validation failed:', errors);
      return;
    }
    
    // Clear validation errors
    setValidationErrors({});
    
    // Process bubble values for submission
    const submissionValues = { ...values };
    
    // Aggregate bubble values for Airtable fields
    if (isCreateRecord || isUpdateRecord) {
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

            {/* Advanced fields */}
            {advancedFields.length > 0 && (
              <div className="border-t border-slate-200 pt-4 mt-6">
                <h3 className="text-sm font-medium text-slate-700 mb-3">Advanced Settings</h3>
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
                          console.log('🔍 [RECORD SELECT] Checking attachment field:', {
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
                          console.log('🟣 [RECORD SELECT] Looking up linked record names:', {
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
                            
                            console.log('🟣 [RECORD SELECT] Created bubble for linked record:', bubble);
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
                          console.log('🖼️ [RECORD SELECT] Populating image field:', {
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
                            console.log('🖼️ [RECORD SELECT] Set multiple attachments:', attachments);
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
                            console.log('🖼️ [RECORD SELECT] Set single attachment as array:', attachment);
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
                />
              </div>
            )}
            
            {/* Dynamic fields for create/update */}
            {(isCreateRecord || (isUpdateRecord && selectedRecord)) && dynamicFields.length > 0 && (
              <div className="space-y-3">
                <div className="mt-6 border-t border-slate-200 pt-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-1">Table Fields</h3>
                  <p className="text-xs text-slate-500 mb-4">Configure the values for each field in the {values.tableName} table</p>
                </div>
                <div className="space-y-3">
                  {renderFields(dynamicFields, true)}
                </div>
              </div>
            )}
            
            {/* Preview for list records */}
            {isListRecord && values.tableName && values.baseId && (
              <div className="mt-6 space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <p className="text-sm text-slate-600 mb-3">
                    Preview the data that will be retrieved from the selected table.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (showPreviewData) {
                        setShowPreviewData(false);
                        setPreviewData([]);
                      } else {
                        loadPreviewData(values.baseId, values.tableName);
                      }
                    }}
                    disabled={loadingPreview}
                    className="flex items-center gap-2"
                  >
                    {loadingPreview ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                    {loadingPreview ? 'Loading...' : showPreviewData ? 'Hide Preview' : 'Preview Records'}
                  </Button>
                </div>
                
                {showPreviewData && previewData.length > 0 && (
                  <AirtableRecordsTable
                    records={previewData}
                    loading={loadingPreview}
                    tableName={values.tableName}
                    isPreview={true}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="border-t border-border px-6 py-4">
        <div className="flex justify-between items-center">
          <div>
            <Button type="button" variant="outline" onClick={onBack || onCancel}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </div>
          <Button type="submit">
            {isEditMode ? 'Update' : 'Save'} Configuration
          </Button>
        </div>
      </div>
    </form>
  );
}
