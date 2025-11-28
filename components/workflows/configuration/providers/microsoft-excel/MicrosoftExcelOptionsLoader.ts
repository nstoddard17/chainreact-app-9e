/**
 * Microsoft Excel Options Loader
 * Handles loading dynamic options for Microsoft Excel-specific fields
 *
 * NOTE: Simplified implementation - removed debounce/pending promise mechanism
 * that was causing fields not to load when switching between Excel nodes.
 * The useDynamicOptions hook already handles deduplication and caching.
 */

import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types';
import { logger } from '@/lib/utils/logger';

// Cache to prevent duplicate requests
const requestCache = new Map<string, { data: FormattedOption[]; timestamp: number }>();
const pendingRequests = new Map<string, Promise<FormattedOption[]>>();
const CACHE_TTL = 30000; // 30 seconds

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
    'tableColumn',
    'searchColumn'  // For Find or Create Row action
  ];

  canHandle(fieldName: string, providerId: string): boolean {
    return providerId === 'microsoft-excel' && this.supportedFields.includes(fieldName);
  }

  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, dependsOnValue, forceRefresh, signal, integrationId, extraOptions, formValues } = params;

    logger.debug(`[ExcelOptionsLoader] loadOptions called:`, {
      fieldName,
      dependsOnValue,
      formValues,
      extraOptions,
      integrationId
    });

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
      case 'searchColumn':
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
    // Create a cache key based on request parameters
    const cacheKey = JSON.stringify({
      dataType,
      integrationId,
      dependsOnValue,
      workbookId: allValues?.workbookId,
      worksheetName: allValues?.worksheetName
    });

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = requestCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        logger.debug(`[ExcelOptionsLoader] Using cached data for ${dataType}`);
        return cached.data;
      }

      // Check if there's already a pending request for this exact data
      const pending = pendingRequests.get(cacheKey);
      if (pending) {
        logger.debug(`[ExcelOptionsLoader] Reusing pending request for ${dataType}`);
        return pending;
      }
    }

    // Create the request promise
    const requestPromise = this.executeRequest(dataType, integrationId, dependsOnValue, forceRefresh, allValues, signal, cacheKey);

    // Store as pending
    pendingRequests.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Clean up pending request
      pendingRequests.delete(cacheKey);
    }
  }

  private async executeRequest(
    dataType: string,
    integrationId?: string,
    dependsOnValue?: any,
    forceRefresh?: boolean,
    allValues?: Record<string, any>,
    signal?: AbortSignal,
    cacheKey?: string
  ): Promise<FormattedOption[]> {
    try {
      const requestBody: any = {
        integrationId,
        dataType,
        options: {}
      };

      logger.debug(`[ExcelOptionsLoader] executeRequest:`, {
        dataType,
        dependsOnValue,
        allValues,
        integrationId
      });

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

      logger.debug(`[ExcelOptionsLoader] Final request body:`, {
        dataType,
        requestBody,
        allValuesProvided: allValues
      });

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
      let result: FormattedOption[] = [];

      if (Array.isArray(data)) {
        result = data.map((item: any) => ({
          value: item.value || item.id || item,
          label: item.label || item.name || item.title || item,
          description: item.description
        }));
      } else if (data.data && Array.isArray(data.data)) {
        result = data.data.map((item: any) => ({
          value: item.value || item.id || item,
          label: item.label || item.name || item.title || item,
          description: item.description
        }));
      } else if (data.options && Array.isArray(data.options)) {
        result = data.options;
      }


      // Cache successful results
      if (cacheKey && result.length > 0) {
        requestCache.set(cacheKey, { data: result, timestamp: Date.now() });
        logger.debug(`[ExcelOptionsLoader] Cached ${result.length} items for ${dataType}`);
      }

      return result;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return [];
      }
      return [];
    }
  }

  reset(): void {
    // Clear the cache when reset is called
    requestCache.clear();
    pendingRequests.clear();
    logger.debug('[ExcelOptionsLoader] Cache cleared');
  }
}
