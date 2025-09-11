import { useCallback } from 'react';

interface BubbleSuggestion {
  value: any;
  label: string;
  fieldName?: string;
  recordId?: string;
  hasChanged?: boolean;
}

interface UseAirtableBubbleHandlerProps {
  fieldSuggestions: Record<string, BubbleSuggestion[]>;
  setFieldSuggestions: (setter: any) => void;
  activeBubbles: Record<string, number | number[]>;
  setActiveBubbles: (setter: any) => void;
  setValue: (fieldName: string, value: any) => void;
  dynamicOptions: Record<string, any[]>;
  setDynamicOptions?: (setter: any) => void;
  airtableTableSchema?: any;
  isUpdateRecord: boolean;
  isCreateRecord: boolean;
}

export function useAirtableBubbleHandler({
  fieldSuggestions,
  setFieldSuggestions,
  activeBubbles,
  setActiveBubbles,
  setValue,
  dynamicOptions,
  setDynamicOptions,
  airtableTableSchema,
  isUpdateRecord,
  isCreateRecord
}: UseAirtableBubbleHandlerProps) {

  /**
   * Check if a field is a linked record field
   */
  const isLinkedField = useCallback((tableField: any): boolean => {
    return tableField?.type === 'multipleRecordLinks' || 
           tableField?.type === 'singleRecordLink' || 
           tableField?.isLinkedRecord === true;
  }, []);

  /**
   * Check if a field is a select field
   */
  const isSelectField = useCallback((tableField: any): boolean => {
    return tableField?.type === 'multipleSelects' || 
           tableField?.type === 'singleSelect';
  }, []);

  /**
   * Check if a field is multi-value
   */
  const isMultiValueField = useCallback((tableField: any): boolean => {
    return tableField && 
           tableField.type !== 'date' && (
             tableField.type === 'multipleSelects' || 
             tableField.type === 'multipleRecordLinks' || 
             tableField.type === 'multipleAttachments' ||
             tableField.type === 'multipleCollaborators'
           );
  }, []);

  /**
   * Get field choices from schema
   */
  const getFieldChoices = useCallback((fieldId: string, tableField: any): any[] | null => {
    if (!airtableTableSchema?.fields) return null;

    // Try to find by the actual field ID first
    let schemaField = airtableTableSchema.fields.find((f: any) => f.id === fieldId);
    
    // If not found, try by field name (the schema sometimes uses field names as IDs)
    if (!schemaField && tableField?.name) {
      schemaField = airtableTableSchema.fields.find((f: any) => 
        f.id === tableField.name.replace(/[^a-zA-Z0-9]/g, '_') || 
        f.name === tableField.name
      );
    }
    
    return schemaField?.choices || null;
  }, [airtableTableSchema]);

  /**
   * Create a bubble suggestion object
   */
  const createBubbleSuggestion = useCallback((
    value: any,
    label: string,
    tableField: any,
    recordId?: string
  ): BubbleSuggestion => {
    return {
      value,
      label,
      fieldName: tableField?.name,
      recordId,
      hasChanged: false
    };
  }, []);

  /**
   * Check if a bubble already exists
   */
  const bubbleExists = useCallback((fieldName: string, value: any): boolean => {
    const existingSuggestions = fieldSuggestions[fieldName] || [];
    return existingSuggestions.some((s: any) => s.value === value);
  }, [fieldSuggestions]);

  /**
   * Check if there's an active bubble
   */
  const hasActiveBubble = useCallback((fieldName: string): boolean => {
    const activeBubbleIndices = activeBubbles[fieldName];
    return Array.isArray(activeBubbleIndices) 
      ? activeBubbleIndices.length > 0 
      : activeBubbleIndices !== undefined && activeBubbleIndices !== null;
  }, [activeBubbles]);

  /**
   * Handle bubble creation for UPDATE RECORD
   */
  const handleUpdateRecordBubble = useCallback((
    fieldName: string,
    value: any,
    skipBubbleCreation: boolean = false
  ): boolean => {
    if (skipBubbleCreation || !isUpdateRecord || !fieldName.startsWith('airtable_field_')) {
      return false;
    }

    if (!value || value === '') {
      return false;
    }

    // Get field info from table schema
    const fieldId = fieldName.replace('airtable_field_', '');
    const tableField = airtableTableSchema?.fields?.find((f: any) => f.id === fieldId);
    
    if (!tableField) {
      return false;
    }

    // Only handle select and linked fields
    if (!isLinkedField(tableField) && !isSelectField(tableField)) {
      console.log(`[Update] Skipping bubble creation for non-select/linked field: ${tableField.name} (${tableField.type})`);
      return false;
    }

    const isMultiValue = isMultiValueField(tableField);
    
    // Handle empty arrays
    if (Array.isArray(value) && (value.length === 0 || value.every(v => v === ''))) {
      setValue(fieldName, '');
      return true;
    }

    // Determine the label
    let label: string;
    const actualValue = value;
    
    if (isLinkedField(tableField)) {
      // For linked fields, get the display name from options
      const currentOptions = dynamicOptions?.[fieldName] || [];
      const selectedOption = currentOptions.find((opt: any) => opt.value === value);
      
      if (!selectedOption) {
        console.warn(`Could not find label for value ${value} in field ${tableField.name}`);
        setValue(fieldName, '');
        return true;
      }
      
      label = selectedOption.label;
    } else {
      // For non-linked fields, try to find the label from options
      const currentOptions = dynamicOptions?.[fieldName] || [];
      const selectedOption = currentOptions.find((opt: any) => opt.value === value);
      label = selectedOption ? selectedOption.label : String(value);
    }
    
    const newSuggestion = createBubbleSuggestion(actualValue, label, tableField);
    
    // Check if value already exists
    if (bubbleExists(fieldName, actualValue)) {
      console.log(`[Update] Value ${label} already exists as a bubble`);
      setTimeout(() => setValue(fieldName, ''), 50);
      return true;
    }
    
    // Handle bubble creation based on field type
    if (!isMultiValue) {
      // Single-value field - replace existing
      setFieldSuggestions(prev => ({
        ...prev,
        [fieldName]: [newSuggestion]
      }));
      
      setActiveBubbles(prev => ({
        ...prev,
        [fieldName]: 0
      }));
      
      console.log(`[Update] Replaced bubble for single-value field ${tableField.name}`);
    } else if (hasActiveBubble(fieldName)) {
      // Multi-value field with active bubble - replace active
      const activeBubbleIndices = activeBubbles[fieldName];
      
      setFieldSuggestions(prev => {
        const existing = [...(prev[fieldName] || [])];
        
        if (Array.isArray(activeBubbleIndices)) {
          const firstActiveIndex = activeBubbleIndices[0];
          if (firstActiveIndex !== undefined && existing[firstActiveIndex]) {
            existing[firstActiveIndex] = newSuggestion;
          }
        } else if (typeof activeBubbleIndices === 'number' && existing[activeBubbleIndices]) {
          existing[activeBubbleIndices] = newSuggestion;
        }
        
        return {
          ...prev,
          [fieldName]: existing
        };
      });
      
      console.log(`[Update] Replaced active bubble with ${label}`);
    } else {
      // Multi-value field with no active bubble - add new
      setFieldSuggestions(prev => ({
        ...prev,
        [fieldName]: [...(prev[fieldName] || []), newSuggestion]
      }));
      
      console.log(`[Update] Added new bubble for ${label}`);
    }
    
    // Clear the dropdown selection
    setTimeout(() => setValue(fieldName, ''), 50);
    return true;
  }, [
    isUpdateRecord,
    airtableTableSchema,
    isLinkedField,
    isSelectField,
    isMultiValueField,
    dynamicOptions,
    createBubbleSuggestion,
    bubbleExists,
    hasActiveBubble,
    setValue,
    setFieldSuggestions,
    setActiveBubbles,
    activeBubbles
  ]);

  /**
   * Handle bubble creation for CREATE RECORD
   */
  const handleCreateRecordBubble = useCallback((
    fieldName: string,
    value: any,
    skipBubbleCreation: boolean = false
  ): boolean => {
    if (skipBubbleCreation || !isCreateRecord || !fieldName.startsWith('airtable_field_')) {
      return false;
    }

    if (!value || value === '') {
      return false;
    }

    // Get field info from table schema
    const fieldId = fieldName.replace('airtable_field_', '');
    const tableField = airtableTableSchema?.fields?.find((f: any) => f.id === fieldId);
    
    if (!tableField) {
      return false;
    }

    // Handle empty arrays
    if (Array.isArray(value) && (value.length === 0 || value.every(v => v === ''))) {
      setValue(fieldName, '');
      return true;
    }
    
    const isMultiValue = isMultiValueField(tableField);
    const fieldChoices = getFieldChoices(fieldId, tableField);
    const isLinked = isLinkedField(tableField);
    
    let newSuggestion;
    
    if (isLinked) {
      // Handle linked fields
      const currentOptions = dynamicOptions?.[fieldName] || fieldChoices || [];
      const actualValue = Array.isArray(value) ? value[0] : value;
      
      const option = currentOptions.find((opt: any) => opt.value === actualValue);
      const suggestionLabel = option ? option.label : actualValue;
      
      newSuggestion = createBubbleSuggestion(actualValue, suggestionLabel, tableField);
      
      console.log(`[Create] Created suggestion for linked field ${tableField.name}: value="${actualValue}", label="${suggestionLabel}"`);
      
      // Set dynamic options if needed
      if (!dynamicOptions?.[fieldName] && fieldChoices && setDynamicOptions) {
        setDynamicOptions((prev: any) => ({
          ...prev,
          [fieldName]: fieldChoices
        }));
      }
    } else {
      // Non-linked field
      const currentOptions = dynamicOptions?.[fieldName] || fieldChoices || [];
      const selectedOption = currentOptions.find((opt: any) => opt.value === value);
      
      newSuggestion = createBubbleSuggestion(
        value,
        selectedOption?.label || String(value),
        tableField
      );
    }
    
    // Check if value already exists
    const valueToCompare = isLinked && Array.isArray(value) ? value[0] : value;
    if (bubbleExists(fieldName, valueToCompare)) {
      console.log(`[Create] Value already exists as a bubble`);
      setTimeout(() => setValue(fieldName, ''), 50);
      return true;
    }
    
    // Handle bubble creation based on field type
    if (!isMultiValue) {
      // Single-value field
      setFieldSuggestions(prev => ({
        ...prev,
        [fieldName]: [newSuggestion]
      }));
      
      setActiveBubbles(prev => ({
        ...prev,
        [fieldName]: 0
      }));
      
      console.log(`[Create] Created bubble for single-value field ${tableField.name}`);
    } else if (hasActiveBubble(fieldName)) {
      // Multi-value with active bubble - replace
      const activeBubbleIndices = activeBubbles[fieldName];
      
      setFieldSuggestions(prev => {
        const existing = [...(prev[fieldName] || [])];
        
        if (Array.isArray(activeBubbleIndices)) {
          const firstActiveIndex = activeBubbleIndices[0];
          if (firstActiveIndex !== undefined && existing[firstActiveIndex]) {
            existing[firstActiveIndex] = newSuggestion;
          }
        } else if (typeof activeBubbleIndices === 'number' && existing[activeBubbleIndices]) {
          existing[activeBubbleIndices] = newSuggestion;
        }
        
        return {
          ...prev,
          [fieldName]: existing
        };
      });
      
      console.log(`[Create] Replaced active bubble`);
    } else {
      // Multi-value with no active bubble - add new
      setFieldSuggestions(prev => ({
        ...prev,
        [fieldName]: [...(prev[fieldName] || []), newSuggestion]
      }));
      
      console.log(`[Create] Added new bubble`);
    }
    
    // Clear the dropdown selection
    setTimeout(() => setValue(fieldName, ''), 50);
    return true;
  }, [
    isCreateRecord,
    airtableTableSchema,
    isLinkedField,
    isMultiValueField,
    getFieldChoices,
    dynamicOptions,
    setDynamicOptions,
    createBubbleSuggestion,
    bubbleExists,
    hasActiveBubble,
    setValue,
    setFieldSuggestions,
    setActiveBubbles,
    activeBubbles
  ]);

  /**
   * Main handler for Airtable bubble creation
   */
  const handleAirtableBubble = useCallback((
    fieldName: string,
    value: any,
    skipBubbleCreation: boolean = false
  ): boolean => {
    if (isUpdateRecord) {
      return handleUpdateRecordBubble(fieldName, value, skipBubbleCreation);
    } else if (isCreateRecord) {
      return handleCreateRecordBubble(fieldName, value, skipBubbleCreation);
    }
    return false;
  }, [isUpdateRecord, isCreateRecord, handleUpdateRecordBubble, handleCreateRecordBubble]);

  return {
    isLinkedField,
    isSelectField,
    isMultiValueField,
    getFieldChoices,
    createBubbleSuggestion,
    bubbleExists,
    hasActiveBubble,
    handleAirtableBubble,
    handleUpdateRecordBubble,
    handleCreateRecordBubble
  };
}