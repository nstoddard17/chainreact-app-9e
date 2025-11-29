"use client"

import React, { useCallback, useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { FieldRenderer } from '../../fields/FieldRenderer';
import { ConfigurationContainer } from '../../components/ConfigurationContainer';
import { FieldVisibilityEngine } from '@/lib/workflows/fields/visibility';
import { logger } from '@/lib/utils/logger';
import { Integration } from '@/stores/integrationStore';

interface MondayConfigurationProps {
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
  integrationId?: string;
  needsConnection?: boolean;
  onConnectIntegration?: () => void;
  aiFields?: Record<string, boolean>;
  setAiFields?: (fields: Record<string, boolean>) => void;
  loadingFields?: Set<string>;
}

export function MondayConfiguration({
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
  integrationId,
  needsConnection,
  onConnectIntegration,
  aiFields = {},
  setAiFields = () => {},
  loadingFields: loadingFieldsProp,
}: MondayConfigurationProps) {
  const [loadingFields, setLoadingFields] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [boardColumns, setBoardColumns] = useState<any[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);

  // Combine loading fields from parent and local state
  const allLoadingFields = React.useMemo(() => {
    const combined = new Set<string>();
    if (loadingFieldsProp) {
      loadingFieldsProp.forEach(field => combined.add(field));
    }
    loadingFields.forEach(field => combined.add(field));
    return combined;
  }, [loadingFieldsProp, loadingFields]);

  // Load columns when board is selected
  useEffect(() => {
    const boardId = values.boardId;
    const groupId = values.groupId;
    const itemId = values.itemId;

    // Load columns for create item when board and group are selected
    if (nodeInfo.type === 'monday_action_create_item' && boardId && groupId) {
      loadColumnsForBoard(boardId);
    }

    // Load columns for update item when board and itemId are selected
    if (nodeInfo.type === 'monday_action_update_item' && boardId && itemId) {
      loadColumnsForBoard(boardId);
    }
  }, [values.boardId, values.groupId, values.itemId, nodeInfo.type]);

  const loadColumnsForBoard = async (boardId: string) => {
    if (!boardId || !integrationId) return;

    try {
      setLoadingColumns(true);
      logger.debug('[MondayConfig] Loading columns for board:', boardId);

      const response = await fetch('/api/integrations/monday/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: 'monday_columns',
          options: { boardId }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to load columns');
      }

      const data = await response.json();
      const columns = data.data || [];

      logger.debug('[MondayConfig] Loaded columns:', columns.length);
      setBoardColumns(columns);

      // Initialize column values if not already set
      if (!values.columnValues) {
        setValue('columnValues', {});
      }

    } catch (error: any) {
      logger.error('[MondayConfig] Error loading columns:', error);
      setBoardColumns([]);
    } finally {
      setLoadingColumns(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (submitting) return;

    try {
      setSubmitting(true);
      await onSubmit(values);
    } catch (error: any) {
      logger.error('[MondayConfig] Submit error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleColumnValueChange = (columnId: string, value: any) => {
    const currentColumnValues = values.columnValues || {};
    setValue('columnValues', {
      ...currentColumnValues,
      [columnId]: value
    });
  };

  // Render standard config fields (board, group, itemName)
  const renderStandardFields = () => {
    return nodeInfo.configSchema.map((field: any) => {
      // Use the static method from FieldVisibilityEngine
      if (!FieldVisibilityEngine.isFieldVisible(field, values, nodeInfo)) {
        return null;
      }

      return (
        <div key={field.name} className="space-y-2">
          <FieldRenderer
            field={field}
            value={values[field.name]}
            onChange={(value) => setValue(field.name, value)}
            error={errors[field.name]}
            workflowData={workflowData}
            currentNodeId={currentNodeId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={loadingDynamic}
            loadOptions={loadOptions}
            integrationName={integrationName}
            providerId={nodeInfo.providerId}
            nodeType={nodeInfo.type}
            isLoading={allLoadingFields.has(field.name)}
            allValues={values}
            aiEnabled={aiFields[field.name] || false}
            onToggleAI={(enabled) => setAiFields({ ...aiFields, [field.name]: enabled })}
          />
        </div>
      );
    });
  };

  // Render dynamic column fields
  const renderColumnFields = () => {
    // Only show columns for create/update item actions
    const isCreateItem = nodeInfo.type === 'monday_action_create_item';
    const isUpdateItem = nodeInfo.type === 'monday_action_update_item';

    if (!isCreateItem && !isUpdateItem) {
      return null;
    }

    // For create item: require board and group
    // For update item: require board and itemId
    const shouldShowColumns = isCreateItem
      ? (values.boardId && values.groupId)
      : (values.boardId && values.itemId);

    if (!shouldShowColumns) {
      return null;
    }

    if (loadingColumns) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading columns...</span>
        </div>
      );
    }

    if (boardColumns.length === 0) {
      return null;
    }

    return (
      <div className="space-y-4">
        <div className="text-sm font-medium">Board Columns</div>
        {boardColumns.map((column: any) => {
          // Skip read-only columns like auto-number, formula, etc.
          const readOnlyTypes = ['auto_number', 'formula', 'mirror', 'dependency'];
          if (readOnlyTypes.includes(column.type)) {
            return null;
          }

          const columnValue = values.columnValues?.[column.id] || '';

          return (
            <div key={column.id} className="space-y-2">
              <FieldRenderer
                field={{
                  name: `column_${column.id}`,
                  label: column.title,
                  type: 'text',
                  required: false,
                  placeholder: `Enter ${column.title.toLowerCase()}...`,
                  description: `Column type: ${column.type}`,
                  supportsAI: true
                }}
                value={columnValue}
                onChange={(value) => handleColumnValueChange(column.id, value)}
                error={undefined}
                workflowData={workflowData}
                currentNodeId={currentNodeId}
                dynamicOptions={{}}
                loadingDynamic={false}
                loadOptions={async () => {}}
                integrationName={integrationName}
                providerId={nodeInfo.providerId}
                nodeType={nodeInfo.type}
                isLoading={false}
                allValues={values}
                aiEnabled={aiFields[`column_${column.id}`] || false}
                onToggleAI={(enabled) => setAiFields({ ...aiFields, [`column_${column.id}`]: enabled })}
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <ConfigurationContainer
      onSubmit={handleSubmit}
      onCancel={onCancel}
      onBack={onBack}
      isEditMode={isEditMode}
      showFooter={true}
    >
      <div className="space-y-6">
        {renderStandardFields()}
        {renderColumnFields()}
      </div>
    </ConfigurationContainer>
  );
}
