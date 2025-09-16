"use client"

import React, { useCallback, useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Eye, RefreshCw, ChevronLeft } from "lucide-react";
import { FieldRenderer } from '../fields/FieldRenderer';
import { useIntegrationStore } from '@/stores/integrationStore';
import { useAirtableBubbleHandler } from '../hooks/useAirtableBubbleHandler';
import { useFieldValidation } from '../hooks/useFieldValidation';
import { AirtableRecordsTable } from '../AirtableRecordsTable';
import { getAirtableFieldTypeFromSchema } from '../utils/airtableHelpers';
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
          
          setAirtableTableSchema({
            table: { name: tableName, id: metadata.id },
            fields: metadata.fields
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
        fields: Array.from(fieldMap.values())
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

    return airtableTableSchema.fields.map((field: any) => {
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

      return {
        name: `airtable_field_${field.name}`,  // Use field name instead of ID for consistency
        label: field.name,
        type: fieldType,
        required: false,
        placeholder: shouldUseDynamicDropdown ? `Select ${field.name}` : `Enter value for ${field.name}`,
        dynamic: shouldUseDynamicDropdown ? dynamicDataType : true,
        airtableFieldType: field.type,
        airtableFieldId: field.id,  // Store the ID separately if needed
        options: fieldOptions,
        dependsOn: shouldUseDynamicDropdown ? 'tableName' : undefined,
        multiple: fieldNameLower.includes('tasks') ||
                 fieldNameLower.includes('associated project') ||
                 fieldNameLower.includes('feedback') ||
                 field.type === 'multipleRecordLinks', // Multiple selection for linked fields
        // Add metadata for special field types
        ...(field.type === 'multipleAttachments' && { multiple: true }),
        ...(field.type === 'rating' && { max: field.options?.max || 5 }),
        ...(field.type === 'percent' && { min: 0, max: 100 }),
        ...(field.type === 'currency' && { prefix: field.options?.symbol || '$' }),
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

  // Separate base and dynamic fields
  const baseFields = nodeInfo?.configSchema?.filter((field: any) => 
    !field.advanced && !field.name?.startsWith('airtable_field_') && shouldShowField(field)
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
              value: recordId,  // Use ID as value (for API)
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
  
  // Clear loaded fields when record changes
  useEffect(() => {
    setLoadedLinkedFields(new Set());
  }, [values.recordId]);
  
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

  // Load dropdown options for dynamic fields when they become visible
  useEffect(() => {
    if (!dynamicFields.length || !values.tableName || !values.baseId) return;

    console.log('🔄 [DROPDOWN FIELDS] Checking for dropdown fields to load');

    // Find dropdown fields that need loading (and haven't been loaded yet)
    const dropdownFieldsToLoad = dynamicFields.filter(field => {
      // Skip if already loaded
      if (loadedDropdownFields.has(field.name)) return false;

      // Also skip if options are already present in dynamicOptions
      if (dynamicOptions[field.name] && dynamicOptions[field.name].length > 0) {
        // Mark as loaded so we don't try again
        setLoadedDropdownFields(prev => new Set([...prev, field.name]));
        return false;
      }

      // Check if it's a dropdown field with dynamic data
      if (typeof field.dynamic !== 'string') return false;

      const dynamicType = field.dynamic;
      return (
        dynamicType === 'airtable_draft_names' ||
        dynamicType === 'airtable_designers' ||
        dynamicType === 'airtable_projects' ||
        dynamicType === 'airtable_feedback' ||
        dynamicType === 'airtable_tasks'
      );
    });

    if (dropdownFieldsToLoad.length > 0) {
      console.log('🔄 [DROPDOWN FIELDS] Loading options for dropdown fields:', dropdownFieldsToLoad.map(f => f.name));

      // Mark all fields as loaded first to prevent duplicate loads
      setLoadedDropdownFields(prev => {
        const newSet = new Set(prev);
        dropdownFieldsToLoad.forEach(field => newSet.add(field.name));
        return newSet;
      });

      // Load options for all dropdown fields in parallel
      const loadPromises = dropdownFieldsToLoad.map(field => {
        const extraOptions = {
          baseId: values.baseId,
          tableName: values.tableName
        };

        console.log('🔄 [DROPDOWN FIELDS] Loading with context:', {
          fieldName: field.name,
          dynamicType: field.dynamic,
          extraOptions
        });

        // Load the options (returns a promise)
        return loadOptions(field.name, 'tableName', values.tableName, false, false, extraOptions);
      });

      // Wait for all to complete in parallel
      Promise.all(loadPromises).then(() => {
        console.log('✅ [DROPDOWN FIELDS] All dropdown fields loaded');
      }).catch(error => {
        console.error('❌ [DROPDOWN FIELDS] Error loading dropdown fields:', error);
      });
    }
  }, [dynamicFields.length, values.tableName, values.baseId, loadOptions, loadedDropdownFields, dynamicOptions]);
  
  // Initialize bubbles from existing values (for editing existing records)
  useEffect(() => {
    if (!dynamicFields.length || !values) return;
    
    // Only initialize if we have a selected record (recordId exists)
    if (!values.recordId) {
      console.log('🟢 [BUBBLE INIT] No record selected yet, skipping initialization');
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
        
        // Handle linked record fields
        if (field.airtableFieldType === 'multipleRecordLinks' || field.airtableFieldType === 'singleRecordLink') {
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
                return opt.value.startsWith(recordId + '::');
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
                return opt.value.startsWith(bubble.value + '::');
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
      // For dynamic fields, always show them if we're in the right context
      if (isDynamic) return true;
      
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
        firstOption: dynamicOptions[field.name]?.[0]
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
          loadingDynamic={loadingFields.has(field.name) || loadingDynamic}
          nodeInfo={nodeInfo}
          onDynamicLoad={handleDynamicLoad}
          parentValues={values}
          selectedValues={selectedBubbleValues}
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
                    } else {
                      return {
                        ...prev,
                        [actualFieldName]: [...current, idx]
                      };
                    }
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
    let submissionValues = { ...values };
    
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
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      <div className="flex-1 px-6 py-4">
        <ScrollArea className="h-[calc(90vh-180px)] pr-4">
          <div className="space-y-3">
            {/* Base fields */}
            {renderFields(baseFields)}
            
            {/* Records table for update record */}
            {isUpdateRecord && values.tableName && values.baseId && (
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
                                return opt.value.startsWith(recordId + '::');
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
                          
                        } else {
                          // For non-select fields, just set the value normally
                          setValue(actualFieldName, value);
                        }
                      }
                    });
                  }
                }}
                onRefresh={() => loadAirtableRecords(values.baseId, values.tableName)}
              />
            )}
            
            {/* Dynamic fields for create/update */}
            {(isCreateRecord || (isUpdateRecord && selectedRecord)) && dynamicFields.length > 0 && (
              <div className="mt-6 space-y-3">
                {renderFields(dynamicFields, true)}
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
        </ScrollArea>
      </div>
      
      <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4 bg-white dark:bg-slate-900">
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onBack || onCancel}>
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <Button type="submit">
            {isEditMode ? 'Update' : 'Save'} Configuration
          </Button>
        </div>
      </div>
    </form>
  );
}