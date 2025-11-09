"use client"

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { ConfigurationContainer } from '../components/ConfigurationContainer';
import { FieldRenderer } from '../fields/FieldRenderer';
import { GoogleDocsDocumentPreview } from '../components/google-docs/GoogleDocsDocumentPreview';

interface GoogleDocsConfigurationProps {
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

export function GoogleDocsConfiguration({
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
  aiFields = {},
  setAiFields = () => {},
  isConnectedToAIAgent = false,
  loadingFields,
}: GoogleDocsConfigurationProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Get visible fields based on conditions
  const getVisibleFields = () => {
    if (!nodeInfo?.configSchema) return [];
    
    return nodeInfo.configSchema.filter((field: any) => {
      // Skip hidden fields unless they have showIf
      if (field.hidden && !field.showIf) return false;
      
      // Check showIf condition
      if (field.showIf && typeof field.showIf === 'function') {
        return field.showIf(values);
      }
      
      // Skip fields with conditional that don't meet the condition
      if (field.conditional) {
        const conditionField = field.conditional.field;
        const conditionValue = field.conditional.value;
        if (values[conditionField] !== conditionValue) {
          return false;
        }
      }
      
      return true;
    });
  };

  const visibleFields = getVisibleFields();

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    const requiredFields = visibleFields.filter(f => f.required);
    const errors: Record<string, string> = {};
    
    requiredFields.forEach(field => {
      if (!values[field.name]) {
        errors[field.name] = `${field.label || field.name} is required`;
      }
    });
    
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    
    await onSubmit(values);
  };

  // Render fields
  const renderFields = (fields: any[]) => {
    return fields.map((field, index) => {
      // Special handling for Google Docs preview field
      if (field.type === 'google_docs_preview') {
        return (
          <GoogleDocsDocumentPreview
            key={`field-${field.name}-${index}`}
            documentId={values.documentId}
            showPreview={showPreview}
            onTogglePreview={() => setShowPreview(!showPreview)}
          />
        );
      }

      return (
        <FieldRenderer
          key={`field-${field.name}-${index}`}
          field={field}
          value={values[field.name]}
          onChange={(value) => setValue(field.name, value)}
          error={errors[field.name] || validationErrors[field.name]}
          workflowData={workflowData}
          currentNodeId={currentNodeId}
          dynamicOptions={dynamicOptions}
          loadingDynamic={field.dynamic ? (loadingFields?.has(field.name) || loadingDynamic) : false}
          nodeInfo={nodeInfo}
          onDynamicLoad={async (fieldName, dependsOn, dependsOnValue) => {
            await loadOptions(fieldName, dependsOn, dependsOnValue);
          }}
          parentValues={values}
          aiFields={aiFields}
          setAiFields={setAiFields}
          isConnectedToAIAgent={isConnectedToAIAgent}
        />
      );
    });
  };

  return (
    <ConfigurationContainer
      onSubmit={handleSubmit}
      onCancel={onCancel}
      onBack={onBack}
      isEditMode={isEditMode}
    >
      {renderFields(visibleFields)}
    </ConfigurationContainer>
  );
}