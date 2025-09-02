"use client"

import React from "react";
import { FieldRenderer } from "../fields/FieldRenderer";
import { AIFieldWrapper } from "../fields/AIFieldWrapper";
import { GoogleSheetsDataPreview } from "./google-sheets/GoogleSheetsDataPreview";
import { AirtableRecordSelector } from "./airtable/AirtableRecordSelector";
import { useAirtableState } from "../hooks/useAirtableState";
import { useGoogleSheetsState } from "../hooks/useGoogleSheetsState";

interface FieldsWithTableProps {
  fields: any[];
  isDynamic?: boolean;
  nodeInfo: any;
  values: Record<string, any>;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  aiFields: Set<string>;
  workflowData?: any;
  currentNodeId?: string;
  dynamicOptions: Record<string, any[]>;
  loadingFields: Set<string>;
  onFieldChange: (fieldName: string, value: any) => void;
  onDynamicLoad: (fieldName: string) => void;
  setValue: (fieldName: string, value: any) => void;
}

export function FieldsWithTable({
  fields,
  isDynamic = false,
  nodeInfo,
  values,
  errors,
  touched,
  aiFields,
  workflowData,
  currentNodeId,
  dynamicOptions,
  loadingFields,
  onFieldChange,
  onDynamicLoad,
  setValue
}: FieldsWithTableProps) {
  // Airtable state management
  const airtableState = useAirtableState({ nodeInfo, values });
  
  // Google Sheets state management
  const googleSheetsState = useGoogleSheetsState({ nodeInfo, values });
  
  // Check action types
  const isListRecord = nodeInfo?.providerId === 'airtable' && nodeInfo?.type === 'airtable_action_list_records';
  const showRecordsTable = airtableState.isUpdateRecord && !isDynamic && values.tableName && values.baseId;
  const showDynamicFields = (airtableState.isUpdateRecord && isDynamic && values.tableName) || 
                           (airtableState.isCreateRecord && values.tableName);
  
  return (
    <>
      {/* Render fields */}
      {fields.map((field, index) => {
        const fieldKey = `${isDynamic ? 'dynamic' : 'basic'}-field-${(field as any).uniqueId || field.name}-${field.type}-${index}-${nodeInfo?.type || 'unknown'}`;
        const shouldUseAIWrapper = airtableState.isUpdateRecord && (field.name === 'recordId' || isDynamic);
        const shouldShowBubbles = airtableState.isAirtableRecordAction && isDynamic;
        
        // Skip rendering if it's a dynamic section but we shouldn't show dynamic fields
        if (isDynamic && !showDynamicFields) return null;
        
        // Special handling for Google Sheets data preview field
        if (field.type === 'google_sheets_data_preview' && nodeInfo?.providerId === 'google-sheets') {
          // Show for update action, or delete action when column_value is selected
          if (values.action === 'update') {
            // Show for update
          } else if (values.action === 'delete' && values.deleteRowBy === 'column_value') {
            // Show for delete by column value
          } else {
            return null;
          }
          
          return (
            <GoogleSheetsDataPreview
              key={fieldKey}
              fieldKey={fieldKey}
              values={values}
              previewData={googleSheetsState.previewData}
              showPreviewData={googleSheetsState.showPreviewData}
              loadingPreview={googleSheetsState.loadingPreview}
              tableSearchQuery={googleSheetsState.tableSearchQuery}
              tableDisplayCount={googleSheetsState.tableDisplayCount}
              googleSheetsSortField={googleSheetsState.googleSheetsSortField}
              googleSheetsSortDirection={googleSheetsState.googleSheetsSortDirection}
              googleSheetsSelectedRows={googleSheetsState.googleSheetsSelectedRows}
              googleSheetsHasHeaders={googleSheetsState.googleSheetsHasHeaders}
              onTogglePreview={googleSheetsState.togglePreviewData}
              onLoadPreviewData={googleSheetsState.loadGoogleSheetsPreviewData}
              onSearchChange={googleSheetsState.setTableSearchQuery}
              onDisplayCountChange={googleSheetsState.setTableDisplayCount}
              onSortFieldChange={googleSheetsState.setGoogleSheetsSortField}
              onSortDirectionChange={googleSheetsState.setGoogleSheetsSortDirection}
              onRowSelect={googleSheetsState.handleRowToggle}
              onSelectAll={(selected) => googleSheetsState.handleSelectAll(selected, googleSheetsState.previewData)}
              onHasHeadersChange={googleSheetsState.handleHasHeadersChange}
              onRowClick={googleSheetsState.handleRowSelect}
            />
          );
        }
        
        // Handle special Airtable record selection
        if (field.name === 'recordId' && airtableState.isUpdateRecord && !isDynamic) {
          return (
            <div key={fieldKey}>
              {shouldUseAIWrapper ? (
                <AIFieldWrapper
                  fieldName={field.name}
                  fieldLabel={field.label || field.name}
                  isAIEnabled={aiFields.has(field.name)}
                  onToggleAI={(enabled: boolean) => {
                    // Handle AI toggle
                    if (enabled) {
                      setValue(field.name, `{{AI_FIELD:${field.name}}}`);
                    } else {
                      setValue(field.name, '');
                    }
                  }}
                >
                  <FieldRenderer
                    field={field}
                    value={values[field.name]}
                    onChange={(value) => onFieldChange(field.name, value)}
                    error={errors[field.name]}
                    workflowData={workflowData}
                    currentNodeId={currentNodeId}
                    dynamicOptions={dynamicOptions}
                    loadingDynamic={loadingFields.has(field.name)}
                    nodeInfo={nodeInfo}
                    onDynamicLoad={onDynamicLoad}
                  />
                </AIFieldWrapper>
              ) : (
                <FieldRenderer
                  field={field}
                  value={values[field.name]}
                  onChange={(value) => onFieldChange(field.name, value)}
                  error={errors[field.name]}
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  dynamicOptions={dynamicOptions}
                  loadingDynamic={loadingFields.has(field.name)}
                  nodeInfo={nodeInfo}
                  onDynamicLoad={onDynamicLoad}
                />
              )}
              
              {/* Show Airtable record selector */}
              {showRecordsTable && (
                <AirtableRecordSelector
                  records={airtableState.airtableRecords}
                  selectedRecord={airtableState.selectedRecord}
                  loadingRecords={airtableState.loadingRecords}
                  searchQuery={airtableState.tableSearchQuery}
                  displayCount={airtableState.tableDisplayCount}
                  showTable={airtableState.showRecordsTable}
                  tableName={values.tableName}
                  onLoadRecords={() => airtableState.loadAirtableRecords(values.baseId, values.tableName)}
                  onSelectRecord={(record) => {
                    airtableState.handleRecordSelect(record);
                    setValue('recordId', record.id);
                  }}
                  onSearchChange={airtableState.setTableSearchQuery}
                  onDisplayCountChange={airtableState.setTableDisplayCount}
                  onToggleTable={airtableState.handleToggleTable}
                />
              )}
            </div>
          );
        }
        
        // Default field rendering with AI wrapper for dynamic Airtable fields
        if (shouldUseAIWrapper) {
          return (
            <AIFieldWrapper
              key={fieldKey}
              fieldName={field.name}
              fieldLabel={field.label || field.name}
              isAIEnabled={aiFields.has(field.name)}
              onToggleAI={(enabled) => {
                if (enabled) {
                  setValue(field.name, `{{AI_FIELD:${field.name}}}`);
                } else {
                  setValue(field.name, '');
                }
              }}
              showBubbles={shouldShowBubbles}
            >
              <FieldRenderer
                field={field}
                value={values[field.name]}
                onChange={(value) => onFieldChange(field.name, value)}
                error={errors[field.name]}
                workflowData={workflowData}
                currentNodeId={currentNodeId}
                dynamicOptions={dynamicOptions}
                loadingDynamic={loadingFields.has(field.name)}
                nodeInfo={nodeInfo}
                onDynamicLoad={onDynamicLoad}
              />
            </AIFieldWrapper>
          );
        }
        
        // Default field rendering
        return (
          <FieldRenderer
            key={fieldKey}
            field={field}
            value={values[field.name]}
            onChange={(value) => onFieldChange(field.name, value)}
            error={errors[field.name]}
            workflowData={workflowData}
            currentNodeId={currentNodeId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={loadingFields.has(field.name)}
            nodeInfo={nodeInfo}
            onDynamicLoad={onDynamicLoad}
          />
        );
      })}
    </>
  );
}