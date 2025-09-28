/**
 * Microsoft Excel Options Loader
 * Handles loading dynamic options for Microsoft Excel-specific fields
 */

import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types';

// Debounce map to prevent rapid consecutive calls
const debounceTimers = new Map<string, NodeJS.Timeout>();
const pendingPromises = new Map<string, Promise<FormattedOption[]>>();

export class MicrosoftExcelOptionsLoader implements ProviderOptionsLoader {
  private supportedFields = [
    'workbookId',
    'worksheetName',
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
    'dataPreview'
  ];

  canHandle(fieldName: string, providerId: string): boolean {
    return providerId === 'microsoft-excel' && this.supportedFields.includes(fieldName);
  }

  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, dependsOnValue, forceRefresh, signal, integrationId, dataType } = params;

    // Create a unique key for this request
    const requestKey = `${fieldName}:${dependsOnValue || 'none'}:${forceRefresh}`;

    // If not forcing refresh, check if there's already a pending promise for this exact request
    if (!forceRefresh) {
      const pendingPromise = pendingPromises.get(requestKey);
      if (pendingPromise) {
        console.log(`🔄 [MicrosoftExcel] Reusing pending request for ${fieldName}`);
        return pendingPromise;
      }
    }

    // Clear any existing debounce timer for this field
    const existingTimer = debounceTimers.get(fieldName);
    if (existingTimer) {
      clearTimeout(existingTimer);
      debounceTimers.delete(fieldName);
    }

    // Create a new promise for this request
    const loadPromise = new Promise<FormattedOption[]>((resolve) => {
      // Add a small debounce delay to batch rapid consecutive calls
      const timer = setTimeout(async () => {
        debounceTimers.delete(fieldName);

        try {
          let result: FormattedOption[] = [];

          // Determine the correct data type for the API call
          let apiDataType: string;
          switch (fieldName) {
            case 'workbookId':
              apiDataType = 'workbooks';
              break;
            case 'worksheetName':
              apiDataType = 'worksheets';
              break;
            case 'filterColumn':
            case 'sortColumn':
            case 'updateColumn':
            case 'matchColumn':
            case 'deleteColumn':
            case 'dateColumn':
              apiDataType = 'columns';
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
              apiDataType = 'columns'; // Column mapping needs columns
              break;
            default:
              apiDataType = dataType || fieldName;
          }

          // Load data through the API
          result = await this.loadFromAPI(apiDataType, integrationId, dependsOnValue, forceRefresh, params.values);

          resolve(result);
        } catch (error) {
          console.error(`❌ [MicrosoftExcel] Error loading ${fieldName}:`, error);
          resolve([]);
        } finally {
          // Clean up the pending promise
          pendingPromises.delete(requestKey);
        }
      }, 50); // 50ms debounce delay

      debounceTimers.set(fieldName, timer);
    });

    // Store the pending promise
    pendingPromises.set(requestKey, loadPromise);

    return loadPromise;
  }

  private async loadFromAPI(
    dataType: string,
    integrationId?: string,
    dependsOnValue?: any,
    forceRefresh?: boolean,
    allValues?: Record<string, any>
  ): Promise<FormattedOption[]> {
    try {
      // Build the request body for Microsoft Excel data endpoint
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
        // For worksheets that depend on workbookId
        if (dataType === 'worksheets' && dependsOnValue) {
          requestBody.options.workbookId = dependsOnValue;
        }
        // For columns that depend on both workbookId and worksheetName
        else if ((dataType === 'columns' || dataType === 'column_values' || dataType === 'data_preview') && dependsOnValue) {
          if (typeof dependsOnValue === 'object') {
            if (dependsOnValue.workbookId) requestBody.options.workbookId = dependsOnValue.workbookId;
            if (dependsOnValue.worksheetName) requestBody.options.worksheetName = dependsOnValue.worksheetName;
          } else {
            // If we only have a single value, we need the workbookId from allValues
            requestBody.options.worksheetName = dependsOnValue;
            if (allValues?.workbookId) {
              requestBody.options.workbookId = allValues.workbookId;
            }
          }
        }
      }

      // Also check allValues for workbookId if not set
      if (allValues?.workbookId && !requestBody.options.workbookId) {
        requestBody.options.workbookId = allValues.workbookId;
      }

      // For column values, we might need to specify the column
      if (dataType === 'column_values' && allValues) {
        if (allValues.filterColumn) requestBody.options.columnName = allValues.filterColumn;
        if (allValues.updateColumn) requestBody.options.columnName = allValues.updateColumn;
        if (allValues.deleteColumn) requestBody.options.columnName = allValues.deleteColumn;
      }

      console.log(`📊 [MicrosoftExcel] Loading ${dataType}:`, requestBody);

      const response = await fetch('/api/integrations/microsoft-excel/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [MicrosoftExcel] API error:`, errorText);
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
    } catch (error) {
      console.error(`❌ [MicrosoftExcel] API error loading ${dataType}:`, error);
      return [];
    }
  }

  /**
   * Reset cached data for specific fields or all fields
   */
  reset(fieldName?: string): void {
    if (fieldName) {
      // Clear specific field timer
      const timer = debounceTimers.get(fieldName);
      if (timer) {
        clearTimeout(timer);
        debounceTimers.delete(fieldName);
      }

      // Clear pending promises for this field
      for (const [key] of pendingPromises) {
        if (key.startsWith(`${fieldName}:`)) {
          pendingPromises.delete(key);
        }
      }
    } else {
      // Clear all timers
      for (const timer of debounceTimers.values()) {
        clearTimeout(timer);
      }
      debounceTimers.clear();

      // Clear all pending promises
      pendingPromises.clear();
    }
  }
}