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
  const { nodeInfo, values, loadOptions, loadingFields = new Set(), dynamicOptions, setValue } = props;
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [databaseMetadata, setDatabaseMetadata] = useState<{ title: string; description: string } | null>(null);
  
  // Only apply special visibility handling for actions that have visibility conditions
  const hasVisibilityConditions = nodeInfo?.configSchema?.some((field: any) => 
    field.visibilityCondition !== undefined && field.visibilityCondition !== null
  );
  
  // Filter the config schema based on visibility conditions
  const modifiedNodeInfo = useMemo(() => {
    if (!nodeInfo?.configSchema) return nodeInfo;
    
    // If this action doesn't have visibility conditions, use legacy behavior
    if (!hasVisibilityConditions) {
      // Check if workspace has been selected
      const hasWorkspace = values.workspace && values.workspace !== '';
      
      // Legacy behavior for backward compatibility
      const filteredSchema = nodeInfo.configSchema.map((field: any) => {
        // Always show workspace field
        if (field.name === 'workspace') {
          return field;
        }
        
        // Hide fields that depend on workspace if workspace is not selected
        if (field.dependsOn === 'workspace' && !hasWorkspace) {
          return { ...field, hidden: true };
        }
        
        // Hide fields that indirectly depend on workspace
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
    }
    
    // New visibility condition logic for actions like Get Page Details
    console.log('🔍 [NotionConfig] Processing visibility conditions for:', nodeInfo.type);
    console.log('  Current values:', {
      workspace: values.workspace,
      operation: values.operation,
      page: values.page
    });
    
    // Helper function to check visibility conditions
    const isFieldVisible = (field: any): boolean => {
      // Always show fields with "always" condition
      if (field.visibilityCondition === 'always') {
        console.log(`  ✅ Field '${field.name}' - always visible`);
        return true;
      }
      
      // Fields without visibility conditions default to visible (for legacy compatibility)
      if (!field.visibilityCondition) {
        console.log(`  ✅ Field '${field.name}' - no visibility condition (legacy)`);
        return true;
      }
      
      // Handle object-based visibility conditions
      if (typeof field.visibilityCondition === 'object') {
        // Handle 'and' operator for multiple conditions
        if (field.visibilityCondition.and && Array.isArray(field.visibilityCondition.and)) {
          const allConditions = field.visibilityCondition.and.every((condition: any) => {
            const { field: condField, operator, value } = condition;
            const fieldValue = values[condField];

            switch (operator) {
              case 'isNotEmpty':
                return fieldValue !== undefined && fieldValue !== '' && fieldValue !== null;
              case 'isEmpty':
                return fieldValue === undefined || fieldValue === '' || fieldValue === null;
              case 'equals':
                if (!fieldValue && fieldValue !== 0 && fieldValue !== false) return false;
                return fieldValue === value;
              case 'notEquals':
                return fieldValue !== value;
              case 'in':
                if (!fieldValue && fieldValue !== 0 && fieldValue !== false) return false;
                return Array.isArray(value) && value.includes(fieldValue);
              default:
                console.warn(`  ⚠️ Unknown operator in 'and' condition: ${operator}`);
                return true;
            }
          });

          console.log(`  ${allConditions ? '✅' : '❌'} Field '${field.name}' visibility (AND):`, {
            conditions: field.visibilityCondition.and,
            values: field.visibilityCondition.and.map((c: any) => ({ [c.field]: values[c.field] })),
            visible: allConditions
          });

          return allConditions;
        }

        // Handle single condition
        const { field: condField, operator } = field.visibilityCondition;
        const fieldValue = values[condField];

        const result = (() => {
          switch (operator) {
            case 'isNotEmpty':
              return fieldValue !== undefined && fieldValue !== '' && fieldValue !== null;
            case 'isEmpty':
              return fieldValue === undefined || fieldValue === '' || fieldValue === null;
            case 'equals':
              // Only show if fieldValue exactly matches the expected value
              // If fieldValue is undefined/null/empty, hide the field
              if (!fieldValue && fieldValue !== 0 && fieldValue !== false) return false;
              return fieldValue === field.visibilityCondition.value;
            case 'notEquals':
              return fieldValue !== field.visibilityCondition.value;
            case 'in':
              // Check if fieldValue is in the array of values
              // If fieldValue is undefined/null/empty, hide the field
              if (!fieldValue && fieldValue !== 0 && fieldValue !== false) return false;
              return Array.isArray(field.visibilityCondition.value) &&
                     field.visibilityCondition.value.includes(fieldValue);
            default:
              console.warn(`  ⚠️ Unknown operator: ${operator}`);
              return true;
          }
        })();
        
        console.log(`  ${result ? '✅' : '❌'} Field '${field.name}' visibility:`, {
          condition: field.visibilityCondition,
          dependsOnValue: fieldValue,
          visible: result
        });
        
        return result;
      }
      
      console.log(`  ⚠️ Field '${field.name}' - unexpected visibility condition type:`, field.visibilityCondition);
      return true;
    };
    
    // Filter fields based on visibility
    const filteredSchema = nodeInfo.configSchema.map((field: any) => {
      const isVisible = isFieldVisible(field);
      return isVisible ? field : { ...field, hidden: true };
    });

    return {
      ...nodeInfo,
      configSchema: filteredSchema
    };
  }, [nodeInfo, values, hasVisibilityConditions]);

  
  // Load workspaces immediately when component mounts
  useEffect(() => {
    const loadWorkspaces = async () => {
      console.log('🔄 [NotionConfig] Loading workspaces for:', nodeInfo?.type);
      console.log('  Current dynamic options:', props.dynamicOptions);
      console.log('  Loading fields:', loadingFields);
      
      // Only load if not already loading and we don't have options yet
      if (!loadingFields.has('workspace') && !props.dynamicOptions['workspace']?.length) {
        console.log('  ✅ Loading workspaces...');
        setIsLoadingWorkspace(true);
        try {
          await loadOptions('workspace', undefined, undefined, true);
        } catch (error) {
          console.error('  ❌ Failed to load workspaces:', error);
        } finally {
          setIsLoadingWorkspace(false);
        }
      } else {
        console.log('  ⏭️ Skipping workspace load:', {
          isLoading: loadingFields.has('workspace'),
          hasOptions: props.dynamicOptions['workspace']?.length > 0
        });
      }
    };
    
    loadWorkspaces();
  }, []); // Only run once on mount
  
  // Auto-load pages when workspace is selected (but only if operation is also selected for unified actions)
  useEffect(() => {
    const loadPages = async () => {
      // Check if we have a workspace selected and the page field exists
      const hasPageField = nodeInfo?.configSchema?.some((field: any) => 
        field.name === 'page' && field.dependsOn === 'workspace'
      );
      
      if (!hasPageField || !values.workspace) {
        return;
      }
      
      // For unified actions (manage_page, manage_database, etc.), check if operation is selected
      const isUnifiedAction = nodeInfo?.type?.includes('_manage_');
      if (isUnifiedAction) {
        // Check if operation field exists and has a value
        const hasOperationField = nodeInfo?.configSchema?.some((field: any) => 
          field.name === 'operation'
        );
        
        if (hasOperationField && !values.operation) {
          console.log('🔄 [NotionConfig] Skipping page load - operation not selected yet');
          return; // Don't load pages until operation is selected
        }
      }
      
      console.log('🔄 [NotionConfig] Auto-loading pages for workspace:', values.workspace);
      
      // Check if we already have pages loaded for this workspace
      if (!props.dynamicOptions['page']?.length && !loadingFields.has('page')) {
        try {
          await loadOptions('page', 'workspace', values.workspace, true);
        } catch (error) {
          console.error('  ❌ Failed to auto-load pages:', error);
        }
      }
    };
    
    loadPages();
  }, [values.workspace, values.operation, nodeInfo, loadOptions, props.dynamicOptions, loadingFields]); // Load when workspace or operation changes
  
  // Auto-load databases when workspace is selected and operation requires it
  useEffect(() => {
    const loadDatabases = async () => {
      // Check if we have a workspace selected and the database field exists
      const hasDatabaseField = nodeInfo?.configSchema?.some((field: any) => 
        field.name === 'database' && field.dependsOn === 'workspace'
      );
      
      if (!hasDatabaseField || !values.workspace) {
        return;
      }
      
      // For unified actions, check if operation is selected and requires database
      const isUnifiedAction = nodeInfo?.type?.includes('_manage_');
      if (isUnifiedAction) {
        // Check if operation field exists and has a value that shows database field
        const hasOperationField = nodeInfo?.configSchema?.some((field: any) => 
          field.name === 'operation'
        );
        
        if (hasOperationField) {
          // Check if the selected operation shows the database field
          const databaseField = nodeInfo?.configSchema?.find((field: any) => field.name === 'database');
          if (databaseField?.visibilityCondition?.operator === 'in') {
            const operationsRequiringDatabase = databaseField.visibilityCondition.value;
            if (!operationsRequiringDatabase?.includes(values.operation)) {
              console.log('🔄 [NotionConfig] Skipping database load - operation does not require database');
              return;
            }
          } else if (!values.operation) {
            console.log('🔄 [NotionConfig] Skipping database load - operation not selected yet');
            return;
          }
        }
      }
      
      console.log('🔄 [NotionConfig] Auto-loading databases for workspace:', values.workspace);
      
      // Check if we already have databases loaded for this workspace
      if (!props.dynamicOptions['database']?.length && !loadingFields.has('database')) {
        try {
          await loadOptions('database', 'workspace', values.workspace, true);
        } catch (error) {
          console.error('  ❌ Failed to auto-load databases:', error);
        }
      }
    };
    
    loadDatabases();
  }, [values.workspace, values.operation, nodeInfo, loadOptions, props.dynamicOptions, loadingFields]); // Load when workspace or operation changes
  
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