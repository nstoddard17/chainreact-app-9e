"use client"

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { GenericConfiguration } from './GenericConfiguration';

import { logger } from '@/lib/utils/logger'

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

  // Use refs to stabilize callback and track loaded workspaces to prevent infinite loops
  const loadOptionsRef = useRef(loadOptions);
  loadOptionsRef.current = loadOptions;

  // Track which workspaces we've already loaded pages for
  const loadedPagesForWorkspaceRef = useRef<string | null>(null);
  
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
    logger.info('🔍 [NotionConfig] Processing visibility conditions for:', nodeInfo.type);
    logger.info('  Current values:', {
      workspace: values.workspace,
      operation: values.operation,
      page: values.page
    });
    
    // Helper function to check visibility conditions
    const isFieldVisible = (field: any): boolean => {
      // Always show fields with "always" condition
      if (field.visibilityCondition === 'always') {
        logger.info(`  ✅ Field '${field.name}' - always visible`);
        return true;
      }
      
      // Fields without visibility conditions default to visible (for legacy compatibility)
      if (!field.visibilityCondition) {
        logger.info(`  ✅ Field '${field.name}' - no visibility condition (legacy)`);
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
                logger.warn(`  ⚠️ Unknown operator in 'and' condition: ${operator}`);
                return true;
            }
          });

          logger.info(`  ${allConditions ? '✅' : '❌'} Field '${field.name}' visibility (AND):`, {
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
              logger.warn(`  ⚠️ Unknown operator: ${operator}`);
              return true;
          }
        })();
        
        logger.info(`  ${result ? '✅' : '❌'} Field '${field.name}' visibility:`, {
          condition: field.visibilityCondition,
          dependsOnValue: fieldValue,
          visible: result
        });
        
        return result;
      }
      
      logger.info(`  ⚠️ Field '${field.name}' - unexpected visibility condition type:`, field.visibilityCondition);
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

  
  // Track if we've already loaded workspaces to prevent double-load
  const hasLoadedWorkspacesRef = useRef(false);

  // Load workspaces immediately when component mounts
  useEffect(() => {
    // Prevent double-loading on remount/strict mode
    if (hasLoadedWorkspacesRef.current) {
      return;
    }

    const loadWorkspaces = async () => {
      logger.info('🔄 [NotionConfig] Loading workspaces for:', nodeInfo?.type);

      hasLoadedWorkspacesRef.current = true;
      setIsLoadingWorkspace(true);
      try {
        // Use ref to get stable loadOptions function
        await loadOptionsRef.current('workspace', undefined, undefined, false);
      } catch (error) {
        logger.error('  ❌ Failed to load workspaces:', error);
        // Reset on error so retry is possible
        hasLoadedWorkspacesRef.current = false;
      } finally {
        setIsLoadingWorkspace(false);
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
          logger.info('🔄 [NotionConfig] Skipping page load - operation not selected yet');
          return; // Don't load pages until operation is selected
        }
      }

      // CRITICAL: Track which workspace we've loaded to prevent infinite loops
      // Only load if workspace changed from what we've already loaded
      if (loadedPagesForWorkspaceRef.current === values.workspace) {
        logger.info('🔄 [NotionConfig] Already loaded pages for workspace:', values.workspace);
        return;
      }

      logger.info('🔄 [NotionConfig] Auto-loading pages for workspace:', values.workspace);

      // Mark this workspace as being loaded BEFORE the async call
      loadedPagesForWorkspaceRef.current = values.workspace;

      try {
        // Use ref to get stable loadOptions function
        await loadOptionsRef.current('page', 'workspace', values.workspace, true);
      } catch (error) {
        logger.error('  ❌ Failed to auto-load pages:', error);
        // Reset on error so retry is possible
        loadedPagesForWorkspaceRef.current = null;
      }
    };

    loadPages();
  }, [values.workspace, values.operation, nodeInfo?.type]); // Minimal stable dependencies
  
  // Remove auto-loading - let fields load when they're opened/focused
  // This prevents the infinite reload loop when there are no options
  
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