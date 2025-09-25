"use client"

import React, { useCallback, useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronLeft } from "lucide-react";
import { FieldRenderer } from '../fields/FieldRenderer';
import { AIFieldWrapper } from '../fields/AIFieldWrapper';
import { ConfigurationContainer } from '../components/ConfigurationContainer';

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
  needsConnection,
  onConnectIntegration,
  aiFields = {},
  setAiFields = () => {},
  isConnectedToAIAgent = false,
  loadingFields: loadingFieldsProp,
}: GenericConfigurationProps) {
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [localLoadingFields, setLocalLoadingFields] = useState<Set<string>>(new Set());
  
  // Use prop if provided, otherwise use local state
  const loadingFields = loadingFieldsProp || localLoadingFields;
  const setLoadingFields = loadingFieldsProp ? () => {} : setLocalLoadingFields;

  // Handle dynamic field loading
  const handleDynamicLoad = useCallback(async (
    fieldName: string,
    dependsOn?: string,
    dependsOnValue?: any,
    forceReload?: boolean
  ) => {
    console.log('🔍 [GenericConfig] handleDynamicLoad called:', { 
      fieldName, 
      dependsOn, 
      dependsOnValue,
      forceReload 
    });
    
    const field = nodeInfo?.configSchema?.find((f: any) => f.name === fieldName);
    if (!field) {
      console.warn('Field not found in schema:', fieldName);
      return;
    }

    // Don't set loading state here - useDynamicOptions handles it
    
    try {
      // If explicit dependencies are provided, use them
      if (dependsOn && dependsOnValue !== undefined) {
        console.log('🔄 [GenericConfig] Calling loadOptions with dependencies:', { fieldName, dependsOn, dependsOnValue, forceReload });
        await loadOptions(fieldName, dependsOn, dependsOnValue, forceReload);
      } 
      // Otherwise check field's defined dependencies
      else if (field.dependsOn && values[field.dependsOn]) {
        console.log('🔄 [GenericConfig] Calling loadOptions with field dependencies:', { fieldName, dependsOn: field.dependsOn, dependsOnValue: values[field.dependsOn], forceReload });
        await loadOptions(fieldName, field.dependsOn, values[field.dependsOn], forceReload);
      } 
      // No dependencies, just load the field
      else if (!field.dependsOn) {
        console.log('🔄 [GenericConfig] Calling loadOptions without dependencies:', { fieldName, forceReload });
        await loadOptions(fieldName, undefined, undefined, forceReload);
      } else {
        // Field has dependency but no value yet - don't try to load
        console.log('⏸️ [GenericConfig] Skipping load - field has dependency but no parent value:', { fieldName, dependsOn: field.dependsOn });
      }
    } catch (error) {
      console.error('❌ [GenericConfig] Error loading dynamic options:', error);
    }
  }, [nodeInfo, values, loadOptions]);
  
  // Handle field value changes and trigger dependent field loading
  const handleFieldChange = useCallback(async (fieldName: string, value: any) => {
    // Update the field value
    setValue(fieldName, value);

    // Special handling for Trello board selection
    if (nodeInfo?.providerId === 'trello' && fieldName === 'boardId') {
      console.log('🔄 [GenericConfig] Board selected, handling dependent fields:', value);

      // Find all fields that depend on boardId
      const dependentFields = nodeInfo?.configSchema?.filter((f: any) => f.dependsOn === 'boardId' && f.dynamic) || [];

      // Clear values of dependent fields when board changes
      dependentFields.forEach((field: any) => {
        setValue(field.name, '');
      });

      if (value) {
        // For Move Card action, load both cardId and listId simultaneously
        if (nodeInfo?.type === 'trello_action_move_card') {
          console.log('🎯 [GenericConfig] Loading card and list fields for Move Card action');

          // Load all dependent fields in parallel for better performance
          const loadPromises = dependentFields.map(async (field: any) => {
            console.log(`  Loading ${field.name} with boardId: ${value}`);
            try {
              await loadOptions(field.name, 'boardId', value, true);
              console.log(`  ✅ Successfully loaded ${field.name}`);
            } catch (error) {
              console.error(`  Failed to load ${field.name}:`, error);
            }
          });

          // Wait for all to complete
          await Promise.all(loadPromises);
          console.log('✅ All dependent fields loaded');
        } else {
          // For other actions, load sequentially as before
          for (const field of dependentFields) {
            console.log(`  Loading ${field.name} with boardId: ${value}`);
            try {
              await loadOptions(field.name, 'boardId', value, true);
              console.log(`  ✅ Successfully loaded ${field.name}`);
            } catch (error) {
              console.error(`  Failed to load ${field.name}:`, error);
            }
          }
        }
      }
    }
  }, [nodeInfo, setValue, values, loadOptions]);

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
      console.log('🔄 [GenericConfig] Background loading options for field:', field.name, 'with value:', values[field.name]);
      
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
  const shouldShowField = (field: any) => {
    // Never show fields with type: 'hidden'
    if (field.type === 'hidden') return false;
    
    // Check conditional property (used in Google Drive and other nodes)
    if (field.conditional) {
      const { field: dependentField, value: expectedValue } = field.conditional;
      const actualValue = values[dependentField];
      
      // Check if the condition is met
      if (actualValue !== expectedValue) {
        return false;
      }
    }
    
    // Check visibleWhen condition (used by HubSpot nodes)
    if (field.visibleWhen) {
      const { field: dependentField, equals: expectedValue } = field.visibleWhen;
      const actualValue = values[dependentField];
      if (actualValue !== expectedValue) {
        return false;
      }
    }

    // Check showWhen condition (preferred format)
    if (field.showWhen) {
      // Support MongoDB-style operators
      for (const [dependentField, condition] of Object.entries(field.showWhen)) {
        const actualValue = values[dependentField];
        
        // Handle different condition types
        if (typeof condition === 'object' && condition !== null) {
          // MongoDB-style operators
          for (const [operator, expectedValue] of Object.entries(condition)) {
            switch (operator) {
              case '$ne': // not equal
                if (actualValue === expectedValue) return false;
                break;
              case '$eq': // equal
                if (actualValue !== expectedValue) return false;
                break;
              case '$exists': // field exists/has value
                if (expectedValue && (!actualValue || actualValue === '')) return false;
                if (!expectedValue && actualValue && actualValue !== '') return false;
                break;
              case '$gt': // greater than
                if (!(actualValue > expectedValue)) return false;
                break;
              case '$lt': // less than
                if (!(actualValue < expectedValue)) return false;
                break;
              default:
                // Unknown operator, treat as equality check
                if (actualValue !== expectedValue) return false;
            }
          }
        } else {
          // Handle special string conditions
          if (condition === "!empty") {
            // Check if field has a value (not empty, null, or undefined)
            if (!actualValue || (typeof actualValue === 'string' && actualValue.trim() === '')) {
              return false;
            }
          } else if (condition === "empty") {
            // Check if field is empty
            if (actualValue && (typeof actualValue !== 'string' || actualValue.trim() !== '')) {
              return false;
            }
          } else {
            // Simple equality check (legacy format)
            if (actualValue !== condition) return false;
          }
        }
      }
    }
    
    // Check conditionalVisibility (legacy format)
    if (field.conditionalVisibility) {
      const { field: dependentField, value: expectedValue } = field.conditionalVisibility;
      const actualValue = values[dependentField];
      
      // Special handling for boolean true - check for any truthy value
      if (expectedValue === true && typeof expectedValue === 'boolean') {
        // Hide if actualValue is empty, null, undefined, or empty string
        if (!actualValue || (typeof actualValue === 'string' && actualValue.trim() === '')) {
          return false;
        }
      }
      // Special handling for boolean false - check for falsy value
      else if (expectedValue === false && typeof expectedValue === 'boolean') {
        // Hide if actualValue is truthy
        if (actualValue && !(typeof actualValue === 'string' && actualValue.trim() === '')) {
          return false;
        }
      }
      // For other values, check exact match
      else if (actualValue !== expectedValue) {
        return false;
      }
    }
    
    // Check hidden property with MongoDB-style operators (used by Trello)
    if (field.hidden && typeof field.hidden === 'object' && field.hidden.$condition) {
      const condition = field.hidden.$condition;
      
      // Evaluate each condition in the $condition object
      for (const [dependentField, conditionValue] of Object.entries(condition)) {
        const actualValue = values[dependentField];
        
        // Handle MongoDB-style operators
        if (typeof conditionValue === 'object' && conditionValue !== null) {
          for (const [operator, expectedValue] of Object.entries(conditionValue)) {
            switch (operator) {
              case '$exists':
                // $exists: false means "hide when field doesn't exist (no value)"
                // $exists: true means "hide when field exists (has value)"
                if (expectedValue === false) {
                  // Hide when field doesn't exist
                  if (!actualValue || actualValue === '') {
                    return false; // Field should be hidden
                  }
                } else if (expectedValue === true) {
                  // Hide when field exists
                  if (actualValue && actualValue !== '') {
                    return false; // Field should be hidden
                  }
                }
                break;
              case '$eq':
                if (actualValue === expectedValue) return false;
                break;
              case '$ne':
                if (actualValue !== expectedValue) return false;
                break;
              default:
                // For unknown operators, treat as equality
                if (actualValue === expectedValue) return false;
            }
          }
        } else {
          // Simple value check - hide if values match
          if (actualValue === conditionValue) return false;
        }
      }
    }
    // If field has hidden: true (simple boolean), don't show it
    else if (field.hidden === true) {
      return false;
    }
    
    // Otherwise show the field
    return true;
  };

  // Separate fields
  const baseFields = nodeInfo?.configSchema?.filter((field: any) => {
    const shouldShow = !field.advanced && shouldShowField(field);
    if (field.hidden !== undefined) {
      console.log(`🔍 [GenericConfig] Field ${field.name} - hidden: ${field.hidden}, shouldShow: ${shouldShow}`);
    }
    return shouldShow;
  }) || [];
  
  const advancedFields = nodeInfo?.configSchema?.filter((field: any) => 
    field.advanced && shouldShowField(field)
  ) || [];

  // Handle AI field toggle
  const handleAIToggle = useCallback((fieldName: string, enabled: boolean) => {
    setAiFields({
      ...aiFields,
      [fieldName]: enabled
    });
  }, [aiFields, setAiFields]);

  // Render fields helper
  const renderFields = (fields: any[]) => {
    return fields.map((field, index) => {
      // Use AIFieldWrapper when connected to AI Agent, otherwise use FieldRenderer
      const shouldUseAIWrapper = isConnectedToAIAgent === true;
      console.log('🤖 [GenericConfig] Rendering field:', {
        fieldName: field.name,
        isConnectedToAIAgent,
        shouldUseAIWrapper,
        typeofIsConnected: typeof isConnectedToAIAgent,
        aiFields,
        isAIEnabled: aiFields[field.name] || aiFields._allFieldsAI || false
      });
      const Component = shouldUseAIWrapper ? AIFieldWrapper : FieldRenderer;
      
      return (
        <React.Fragment key={`field-${field.name}-${index}`}>
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
                console.log(`🔍 [GenericConfig] Loading state for ${field.name}:`, {
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
            isAIEnabled={aiFields[field.name] || aiFields._allFieldsAI || false}
            onAIToggle={isConnectedToAIAgent ? handleAIToggle : undefined}
          />
        </React.Fragment>
      );
    });
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    console.log('🚀 [GenericConfiguration] handleSubmit called for:', nodeInfo?.type);
    e.preventDefault();

    // Debug logging for HubSpot
    if (nodeInfo?.type === 'hubspot_action_create_contact') {
      console.log('🎯 [GenericConfiguration] HubSpot create contact submission:', {
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
      console.log('🔍 [GenericConfig] Notion validation debug:', {
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

    console.log('📋 [GenericConfiguration] Validating fields:', {
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
    console.log('🔍 [GenericConfiguration] Validation check:', {
      hasErrors,
      errorCount: Object.keys(errors).length,
      nodeType: nodeInfo?.type,
      errors: hasErrors ? errors : 'No errors'
    });

    if (hasErrors) {
      console.error('❌ [GenericConfiguration] Validation failed - Errors found:',
        JSON.stringify(errors, null, 2)
      );
      setValidationErrors(errors);
      // Focus on first error field
      const firstErrorField = Object.keys(errors)[0];
      const element = document.querySelector(`[name="${firstErrorField}"]`) as HTMLElement;
      element?.focus();
      return;
    }
    
    // Log attachment-related fields for Gmail send email and OneDrive upload
    if (nodeInfo?.type === 'gmail_action_send_email' || nodeInfo?.type === 'onedrive_action_upload_file') {
      console.log(`📎 [GenericConfiguration] ${nodeInfo?.type} values being saved:`, {
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

    console.log('✅ [GenericConfiguration] Submitting values:', {
      nodeType: nodeInfo?.type,
      values,
      onSubmitAvailable: !!onSubmit
    });

    if (!onSubmit) {
      console.error('❌ [GenericConfiguration] onSubmit is not defined!');
      return;
    }

    console.log('📤 [GenericConfiguration] Calling onSubmit...');
    await onSubmit(values);
    console.log('✅ [GenericConfiguration] onSubmit completed');
  };

  // Show connection required state
  if (needsConnection) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
        <h3 className="text-lg font-semibold mb-2">Connection Required</h3>
        <p className="text-sm text-slate-600 mb-4">
          Please connect your {integrationName || 'integration'} account to use this action.
        </p>
        <Button onClick={onConnectIntegration} variant="default">
          Connect {integrationName || 'Integration'}
        </Button>
      </div>
    );
  }

  return (
    <ConfigurationContainer
      onSubmit={handleSubmit}
      onCancel={onCancel}
      onBack={onBack}
      isEditMode={isEditMode}
    >
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
    </ConfigurationContainer>
  );
}