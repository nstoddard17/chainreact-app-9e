"use client"

import React, { useCallback, useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, ChevronLeft } from "lucide-react";
import { FieldRenderer } from '../fields/FieldRenderer';
import { AIFieldWrapper } from '../fields/AIFieldWrapper';

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
      else {
        console.log('🔄 [GenericConfig] Calling loadOptions without dependencies:', { fieldName, forceReload });
        await loadOptions(fieldName, undefined, undefined, forceReload);
      }
    } catch (error) {
      console.error('❌ [GenericConfig] Error loading dynamic options:', error);
    }
  }, [nodeInfo, values, loadOptions]);

  // Background load options for dynamic fields with saved values
  useEffect(() => {
    if (!nodeInfo?.configSchema || !isEditMode) return;

    // Find all dynamic fields with saved values that need background loading
    const fieldsToLoad = nodeInfo.configSchema.filter((field: any) => {
      if (!field.dynamic) return false;
      if (!field.loadOnMount) return false; // Only load fields marked with loadOnMount
      
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
    
    // Check showWhen condition (preferred format)
    if (field.showWhen) {
      const { field: dependentField, value: expectedValue } = field.showWhen;
      const actualValue = values[dependentField];
      
      // Check if the condition is met
      if (actualValue !== expectedValue) {
        return false;
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
    
    // If field has hidden: true, don't show it
    // This must be checked AFTER all visibility conditions
    // because NotionConfiguration sets hidden: true for fields that should be hidden
    if (field.hidden) return false;
    
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
            onChange={(value) => setValue(field.name, value)}
            error={errors[field.name] || validationErrors[field.name]}
            workflowData={workflowData}
            currentNodeId={currentNodeId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={loadingFields.has(field.name) || (loadingDynamic && field.dynamic)}
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
    e.preventDefault();
    
    // Validate required fields (only for visible fields)
    const allFields = [...baseFields, ...advancedFields];
    const requiredFields = allFields.filter(f => f.required && shouldShowField(f));
    const errors: Record<string, string> = {};
    
    requiredFields.forEach(field => {
      if (!values[field.name] && values[field.name] !== 0 && values[field.name] !== false) {
        errors[field.name] = `${field.label || field.name} is required`;
      }
    });
    
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      // Focus on first error field
      const firstErrorField = Object.keys(errors)[0];
      const element = document.querySelector(`[name="${firstErrorField}"]`) as HTMLElement;
      element?.focus();
      return;
    }
    
    // Log attachment-related fields for Gmail send email
    if (nodeInfo?.type === 'gmail_action_send_email') {
      console.log('📎 [GenericConfiguration] Gmail send email values being saved:', {
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
    
    await onSubmit(values);
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
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      <div className="flex-1 px-6 py-4">
        <ScrollArea className="h-[calc(90vh-180px)] pr-4">
          <div className="space-y-4">
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