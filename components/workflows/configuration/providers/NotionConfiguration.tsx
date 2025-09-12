"use client"

import React, { useEffect, useState, useMemo } from 'react';
import { GenericConfiguration } from './GenericConfiguration';

interface NotionConfigurationProps {
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

export function NotionConfiguration(props: NotionConfigurationProps) {
  const { nodeInfo, values, loadOptions, loadingFields = new Set() } = props;
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  
  // Filter the config schema to only show workspace initially
  const modifiedNodeInfo = useMemo(() => {
    if (!nodeInfo?.configSchema) return nodeInfo;
    
    // Check if workspace has been selected
    const hasWorkspace = values.workspace && values.workspace !== '';
    
    // Filter fields based on workspace selection
    const filteredSchema = nodeInfo.configSchema.map((field: any) => {
      // Always show workspace field
      if (field.name === 'workspace') {
        return field;
      }
      
      // Hide fields that depend on workspace if workspace is not selected
      if (field.dependsOn === 'workspace' && !hasWorkspace) {
        return { ...field, hidden: true };
      }
      
      // Hide fields that indirectly depend on workspace (e.g., fields that depend on page_id)
      if (field.dependsOn && field.dependsOn !== 'workspace') {
        const parentField = nodeInfo.configSchema.find((f: any) => f.name === field.dependsOn);
        if (parentField?.dependsOn === 'workspace' && !hasWorkspace) {
          return { ...field, hidden: true };
        }
      }
      
      return field;
    });
    
    return {
      ...nodeInfo,
      configSchema: filteredSchema
    };
  }, [nodeInfo, values.workspace]);
  
  // Load workspaces immediately when component mounts
  useEffect(() => {
    const loadWorkspaces = async () => {
      // Only load if not already loading and we don't have options yet
      if (!loadingFields.has('workspace') && !props.dynamicOptions['workspace']?.length) {
        setIsLoadingWorkspace(true);
        try {
          await loadOptions('workspace', undefined, undefined, true);
        } catch (error) {
          // Failed to load workspaces
        } finally {
          setIsLoadingWorkspace(false);
        }
      }
    };
    
    loadWorkspaces();
  }, []); // Only run once on mount
  
  // Create modified loading fields to include workspace loading state
  const modifiedLoadingFields = useMemo(() => {
    const fields = new Set(loadingFields);
    if (isLoadingWorkspace) {
      fields.add('workspace');
    }
    return fields;
  }, [loadingFields, isLoadingWorkspace]);
  
  // Pass modified props to GenericConfiguration
  return (
    <GenericConfiguration 
      {...props}
      nodeInfo={modifiedNodeInfo}
      loadingFields={modifiedLoadingFields}
    />
  );
}