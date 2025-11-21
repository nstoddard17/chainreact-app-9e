/**
 * Microsoft Excel Options Loader
 * Handles loading dynamic options for Microsoft Excel-specific fields
 *
 * NOTE: Simplified implementation - removed debounce/pending promise mechanism
 * that was causing fields not to load when switching between Excel nodes.
 * The useDynamicOptions hook already handles deduplication and caching.
 */

import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types';

export class MicrosoftExcelOptionsLoader implements ProviderOptionsLoader {
  private supportedFields = [
    'workbookId',
    'worksheetName',
    'tableName',
    'filterColumn',
    'filterValue',
    'sortColumn',
    'updateColumn',
    'updateValue',
    'matchColumn',
    'deleteColumn',
    'deleteValue',
    'dateColumn',
    'folderPath',
    'columnMapping',
    'dataPreview',
    'tableColumn'
  ];

  canHandle(fieldName: string, providerId: string): boolean {
    return providerId === 'microsoft-excel' && this.supportedFields.includes(fieldName);
  }

  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, dependsOnValue, forceRefresh, signal, integrationId, extraOptions, formValues } = params;

    // Determine the correct data type for the API call
    let apiDataType: string;
    switch (fieldName) {
      case 'workbookId':
        apiDataType = 'workbooks';
        break;
      case 'worksheetName':
        apiDataType = 'worksheets';
        break;
      case 'tableName':
        apiDataType = 'tables';
        break;
      case 'filterColumn':
      case 'sortColumn':
      case 'updateColumn':
      case 'matchColumn':
      case 'deleteColumn':
      case 'dateColumn':
        apiDataType = 'columns';
        break;
      case 'tableColumn':
        apiDataType = 'table_columns';
        break;
      case 'filterValue':
      case 'updateValue':
      case 'deleteValue':
        apiDataType = 'column_values';
        break;
      case 'folderPath':
        apiDataType = 'folders';
        break;
      case 'dataPreview':
        apiDataType = 'data_preview';
        break;
      case 'columnMapping':
        apiDataType = 'columns';
        break;
      default:
        apiDataType = extraOptions?.dataType || fieldName;
    }

    try {
      const allValues = { ...formValues, ...extraOptions };
      return await this.loadFromAPI(apiDataType, integrationId, dependsOnValue, forceRefresh, allValues, signal);
    } catch {
      return [];
    }
  }

  private async loadFromAPI(
    dataType: string,
    integrationId?: string,
    dependsOnValue?: any,
    forceRefresh?: boolean,
    allValues?: Record<string, any>,
    signal?: AbortSignal
  ): Promise<FormattedOption[]> {
    try {
      const requestBody: any = {
        integrationId,
        dataType,
        options: {}
      };

      if (forceRefresh) {
        requestBody.options.force = true;
      }

      // Handle dependencies based on the data type
      if (dependsOnValue) {
        if ((dataType === 'worksheets' || dataType === 'tables') && dependsOnValue) {
          requestBody.options.workbookId = dependsOnValue;
        }
        else if ((dataType === 'columns' || dataType === 'column_values' || dataType === 'data_preview') && dependsOnValue) {
          if (typeof dependsOnValue === 'object') {
            if (dependsOnValue.workbookId) requestBody.options.workbookId = dependsOnValue.workbookId;
            if (dependsOnValue.worksheetName) requestBody.options.worksheetName = dependsOnValue.worksheetName;
          } else {
            requestBody.options.worksheetName = dependsOnValue;
            if (allValues?.workbookId) {
              requestBody.options.workbookId = allValues.workbookId;
            }
          }
        }
        else if (dataType === 'table_columns' && dependsOnValue) {
          if (typeof dependsOnValue === 'object') {
            if (dependsOnValue.workbookId) requestBody.options.workbookId = dependsOnValue.workbookId;
            if (dependsOnValue.tableName) requestBody.options.tableName = dependsOnValue.tableName;
          } else {
            requestBody.options.tableName = dependsOnValue;
            if (allValues?.workbookId) {
              requestBody.options.workbookId = allValues.workbookId;
            }
          }
        }
      }

      if (allValues?.workbookId && !requestBody.options.workbookId) {
        requestBody.options.workbookId = allValues.workbookId;
      }

      if (dataType === 'column_values' && allValues) {
        if (allValues.filterColumn) requestBody.options.columnName = allValues.filterColumn;
        if (allValues.updateColumn) requestBody.options.columnName = allValues.updateColumn;
        if (allValues.deleteColumn) requestBody.options.columnName = allValues.deleteColumn;
      }

      const response = await fetch('/api/integrations/microsoft-excel/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal
      });

      if (!response.ok) {
        throw new Error(`Failed to load data: ${response.statusText}`);
      }

      const data = await response.json();

      // Handle different response formats
      if (Array.isArray(data)) {
        return data.map((item: any) => ({
          value: item.value || item.id || item,
          label: item.label || item.name || item.title || item,
          description: item.description
        }));
      } else if (data.data && Array.isArray(data.data)) {
        return data.data.map((item: any) => ({
          value: item.value || item.id || item,
          label: item.label || item.name || item.title || item,
          description: item.description
        }));
      } else if (data.options && Array.isArray(data.options)) {
        return data.options;
      }

      return [];
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return [];
      }
      return [];
    }
  }

  reset(): void {
    // No-op - caching is handled by useDynamicOptions
  }
}
