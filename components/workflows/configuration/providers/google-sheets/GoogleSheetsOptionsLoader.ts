/**
 * Google Sheets Options Loader
 * Handles loading dynamic options for Google Sheets-specific fields
 */

import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types';

import { logger } from '@/lib/utils/logger'

// Debounce map to prevent rapid consecutive calls
const debounceTimers = new Map<string, NodeJS.Timeout>();
const pendingPromises = new Map<string, Promise<FormattedOption[]>>();

export class GoogleSheetsOptionsLoader implements ProviderOptionsLoader {
  private supportedFields = [
    'spreadsheetId',
    'sheetName',
    'matchColumn',
    'filterColumn',
    'filterValue',
    'dateColumn',
    'requiredColumns'
  ];

  canHandle(fieldName: string, providerId: string): boolean {
    return providerId === 'google-sheets' && this.supportedFields.includes(fieldName);
  }

  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, dependsOnValue, forceRefresh, signal, integrationId, dataType, extraOptions } = params;

    // Create a unique key for this request
    const requestKey = `${fieldName}:${dependsOnValue || 'none'}:${forceRefresh}`;

    // If not forcing refresh, check if there's already a pending promise for this exact request
    if (!forceRefresh) {
      const pendingPromise = pendingPromises.get(requestKey);
      if (pendingPromise) {
        logger.debug(`🔄 [GoogleSheets] Reusing pending request for ${fieldName}`);
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
            case 'spreadsheetId':
              apiDataType = 'google-sheets_spreadsheets';
              break;
            case 'sheetName':
              apiDataType = 'google-sheets_sheets';
              break;
            case 'matchColumn':
            case 'filterColumn':
            case 'dateColumn':
            case 'requiredColumns':
              apiDataType = 'google-sheets_columns';
              break;
            case 'filterValue':
              apiDataType = 'google-sheets_column_values';
              break;
            default:
              apiDataType = dataType || fieldName;
          }

          // Load data through the API
          result = await this.loadFromAPI(apiDataType, integrationId, dependsOnValue, forceRefresh, extraOptions);

          resolve(result);
        } catch (error) {
          logger.error(`❌ [GoogleSheets] Error loading ${fieldName}:`, error);
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
    extraOptions?: Record<string, any>
  ): Promise<FormattedOption[]> {
    try {
      // Build the request body for POST
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
        // For sheets that depend on spreadsheetId
        if (dataType === 'google-sheets_sheets' && dependsOnValue) {
          requestBody.options.spreadsheetId = dependsOnValue;
        }
        // For columns that depend on both spreadsheetId and sheetName
        else if ((dataType === 'google-sheets_columns' || dataType === 'google-sheets_column_values') && dependsOnValue) {
          if (typeof dependsOnValue === 'object') {
            if (dependsOnValue.spreadsheetId) requestBody.options.spreadsheetId = dependsOnValue.spreadsheetId;
            if (dependsOnValue.sheetName) requestBody.options.sheetName = dependsOnValue.sheetName;
          } else {
            // dependsOnValue is just the sheet name, get spreadsheet ID from extraOptions
            requestBody.options.sheetName = dependsOnValue;
            if (extraOptions?.spreadsheetId) {
              requestBody.options.spreadsheetId = extraOptions.spreadsheetId;
            }
          }
        }
      }

      const response = await fetch('/api/integrations/fetch-user-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`Failed to load data: ${response.statusText}`);
      }

      const data = await response.json();

      // Handle different response formats
      if (Array.isArray(data)) {
        return data.map((item: any) => ({
          value: item.value || item.id || item,
          label: item.label || item.name || item.title || item
        }));
      } else if (data.data && Array.isArray(data.data)) {
        return data.data.map((item: any) => ({
          value: item.value || item.id || item,
          label: item.label || item.name || item.title || item
        }));
      } else if (data.options && Array.isArray(data.options)) {
        return data.options;
      }

      return [];
    } catch (error) {
      logger.error(`❌ [GoogleSheets] API error loading ${dataType}:`, error);
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