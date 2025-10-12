import { NextRequest, NextResponse } from 'next/server';
import { validateGoogleIntegration, makeGoogleApiRequest, getGoogleAccessToken } from '../../data/utils';

import { logger } from '@/lib/utils/logger'

interface BatchExecuteRequest {
  integrationId: string;
  spreadsheetId: string;
  sheetName: string;
  action: 'add_rows' | 'update_rows' | 'delete_rows';
  batchData: any[];
  columnMapping?: Record<string, string>;
  options?: {
    skipHeaders?: boolean;
    insertDataOption?: 'OVERWRITE' | 'INSERT_ROWS';
    valueInputOption?: 'RAW' | 'USER_ENTERED';
    includeValuesInResponse?: boolean;
    batchSize?: number;
    delayBetweenBatches?: number;
  };
}

/**
 * Execute batch Google Sheets operations with rate limiting
 */
export async function POST(request: NextRequest) {
  try {
    const body: BatchExecuteRequest = await request.json();
    const { integrationId, spreadsheetId, sheetName, action, batchData, columnMapping, options = {} } = body;

    if (!integrationId || !spreadsheetId || !sheetName || !action || !batchData || !Array.isArray(batchData)) {
      return NextResponse.json(
        { error: 'Missing required parameters or invalid batch data' },
        { status: 400 }
      );
    }

    if (batchData.length === 0) {
      return NextResponse.json(
        { error: 'Batch data cannot be empty' },
        { status: 400 }
      );
    }

    // Get integration data
    const { data: integration } = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/integrations?id=eq.${integrationId}`, {
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    }).then(res => res.json());

    if (!integration || integration.length === 0) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      );
    }

    validateGoogleIntegration(integration[0]);
    const accessToken = getGoogleAccessToken(integration[0]);

    const {
      batchSize = 100,
      delayBetweenBatches = 1000,
      valueInputOption = 'USER_ENTERED',
      insertDataOption = 'INSERT_ROWS'
    } = options;

    let result;
    switch (action) {
      case 'add_rows':
        result = await batchAddRows(spreadsheetId, sheetName, batchData, columnMapping, accessToken, {
          batchSize,
          delayBetweenBatches,
          valueInputOption,
          insertDataOption
        });
        break;
      case 'update_rows':
        result = await batchUpdateRows(spreadsheetId, sheetName, batchData, columnMapping, accessToken, {
          batchSize,
          delayBetweenBatches,
          valueInputOption
        });
        break;
      case 'delete_rows':
        result = await batchDeleteRows(spreadsheetId, sheetName, batchData, accessToken, {
          batchSize,
          delayBetweenBatches
        });
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid batch action' },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true, result });

  } catch (error: any) {
    logger.error('❌ [Google Sheets Batch] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to execute batch Google Sheets operation' },
      { status: 500 }
    );
  }
}

/**
 * Batch add rows with rate limiting
 */
async function batchAddRows(
  spreadsheetId: string,
  sheetName: string,
  batchData: any[],
  columnMapping: Record<string, string> | undefined,
  accessToken: string,
  options: any
): Promise<any> {
  const { batchSize, delayBetweenBatches, valueInputOption, insertDataOption } = options;
  
  // Get headers to determine column structure
  let headers: string[] = [];
  if (columnMapping) {
    const headersResponse = await makeGoogleApiRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`,
      accessToken
    );
    const headersData = await headersResponse.json();
    headers = headersData.values?.[0] || [];
  }

  // Process data in batches
  const results = [];
  const batches = chunkArray(batchData, batchSize);
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    
    // Prepare batch values
    const batchValues = batch.map(item => {
      if (columnMapping) {
        // Map data to column positions
        const rowData = new Array(headers.length).fill('');
        Object.entries(columnMapping).forEach(([fieldName, columnLetter]) => {
          const columnIndex = columnLetter.charCodeAt(0) - 65;
          if (columnIndex < rowData.length && item[fieldName] !== undefined) {
            rowData[columnIndex] = item[fieldName];
          }
        });
        return rowData;
      } 
        // Direct array data
        return Array.isArray(item) ? item : Object.values(item);
      
    });

    const requestBody = {
      values: batchValues,
      majorDimension: 'ROWS',
    };

    try {
      const response = await makeGoogleApiRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=${valueInputOption}&insertDataOption=${insertDataOption}`,
        accessToken,
        'POST',
        JSON.stringify(requestBody)
      );

      const batchResult = await response.json();
      results.push({
        batchIndex: i,
        batchSize: batch.length,
        result: batchResult
      });

      // Add delay between batches to respect rate limits
      if (i < batches.length - 1 && delayBetweenBatches > 0) {
        await sleep(delayBetweenBatches);
      }

    } catch (error: any) {
      results.push({
        batchIndex: i,
        batchSize: batch.length,
        error: error.message
      });
      
      // Continue with next batch even if one fails
      logger.error(`Batch ${i} failed:`, error);
    }
  }

  const successfulBatches = results.filter(r => !r.error);
  const failedBatches = results.filter(r => r.error);
  const totalRowsAdded = successfulBatches.reduce((sum, batch) => sum + batch.batchSize, 0);

  return {
    totalBatches: batches.length,
    successfulBatches: successfulBatches.length,
    failedBatches: failedBatches.length,
    totalRowsAdded,
    results
  };
}

/**
 * Batch update rows with rate limiting
 */
async function batchUpdateRows(
  spreadsheetId: string,
  sheetName: string,
  batchData: any[], // Each item should have conditions and data
  columnMapping: Record<string, string> | undefined,
  accessToken: string,
  options: any
): Promise<any> {
  const { batchSize, delayBetweenBatches, valueInputOption } = options;
  
  // Get all sheet data once for efficiency
  const dataResponse = await makeGoogleApiRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:Z`,
    accessToken
  );
  const sheetData = await dataResponse.json();
  const rows = sheetData.values || [];
  
  if (rows.length === 0) {
    throw new Error('Sheet is empty');
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);

  // Process data in batches
  const results = [];
  const batches = chunkArray(batchData, batchSize);
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const updateRequests = [];
    
    // Build update requests for this batch
    for (const item of batch) {
      const { conditions, data } = item;
      
      // Find matching rows
      const matchingRowIndices = findMatchingRows(dataRows, headers, conditions);
      
      for (const rowIndex of matchingRowIndices) {
        const actualRowIndex = rowIndex + 2; // +2 because we skip header and convert to 1-based
        
        if (columnMapping) {
          // Update specific columns
          for (const [fieldName, columnLetter] of Object.entries(columnMapping)) {
            if (data[fieldName] !== undefined) {
              updateRequests.push({
                range: `${sheetName}!${columnLetter}${actualRowIndex}`,
                values: [[data[fieldName]]],
                majorDimension: 'ROWS'
              });
            }
          }
        } else {
          // Update entire row
          const newRowData = new Array(headers.length).fill('');
          Object.entries(data).forEach(([key, value], index) => {
            if (index < newRowData.length) {
              newRowData[index] = value;
            }
          });
          
          updateRequests.push({
            range: `${sheetName}!A${actualRowIndex}:${String.fromCharCode(64 + headers.length)}${actualRowIndex}`,
            values: [newRowData],
            majorDimension: 'ROWS'
          });
        }
      }
    }

    if (updateRequests.length > 0) {
      try {
        const batchUpdateBody = {
          valueInputOption,
          data: updateRequests
        };

        const response = await makeGoogleApiRequest(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
          accessToken,
          'POST',
          JSON.stringify(batchUpdateBody)
        );

        const batchResult = await response.json();
        results.push({
          batchIndex: i,
          batchSize: batch.length,
          updatesApplied: updateRequests.length,
          result: batchResult
        });

      } catch (error: any) {
        results.push({
          batchIndex: i,
          batchSize: batch.length,
          error: error.message
        });
        logger.error(`Batch ${i} failed:`, error);
      }
    } else {
      results.push({
        batchIndex: i,
        batchSize: batch.length,
        updatesApplied: 0,
        message: 'No matching rows found for batch'
      });
    }

    // Add delay between batches
    if (i < batches.length - 1 && delayBetweenBatches > 0) {
      await sleep(delayBetweenBatches);
    }
  }

  const successfulBatches = results.filter(r => !r.error);
  const failedBatches = results.filter(r => r.error);
  const totalUpdates = successfulBatches.reduce((sum, batch) => sum + (batch.updatesApplied || 0), 0);

  return {
    totalBatches: batches.length,
    successfulBatches: successfulBatches.length,
    failedBatches: failedBatches.length,
    totalUpdates,
    results
  };
}

/**
 * Batch delete rows with rate limiting
 */
async function batchDeleteRows(
  spreadsheetId: string,
  sheetName: string,
  batchData: any[], // Each item should have conditions
  accessToken: string,
  options: any
): Promise<any> {
  const { batchSize, delayBetweenBatches } = options;
  
  // Get sheet metadata
  const metadataResponse = await makeGoogleApiRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
    accessToken
  );
  const metadata = await metadataResponse.json();
  const sheet = metadata.sheets?.find((s: any) => s.properties.title === sheetName);
  
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found`);
  }

  const sheetId = sheet.properties.sheetId;

  // Process data in batches
  const results = [];
  const batches = chunkArray(batchData, batchSize);
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    
    try {
      // Get fresh sheet data for each batch (since previous deletes change row indices)
      const dataResponse = await makeGoogleApiRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:Z`,
        accessToken
      );
      const sheetData = await dataResponse.json();
      const rows = sheetData.values || [];
      
      if (rows.length <= 1) {
        results.push({
          batchIndex: i,
          batchSize: batch.length,
          deletedRows: 0,
          message: 'No data rows to delete'
        });
        continue;
      }

      const headers = rows[0];
      const dataRows = rows.slice(1);
      
      // Collect all row indices to delete for this batch
      const allRowsToDelete = new Set<number>();
      
      for (const item of batch) {
        const { conditions } = item;
        const matchingRowIndices = findMatchingRows(dataRows, headers, conditions);
        matchingRowIndices.forEach(idx => allRowsToDelete.add(idx));
      }

      if (allRowsToDelete.size === 0) {
        results.push({
          batchIndex: i,
          batchSize: batch.length,
          deletedRows: 0,
          message: 'No matching rows found'
        });
        continue;
      }

      // Sort in descending order to delete from bottom up
      const sortedIndices = Array.from(allRowsToDelete).sort((a, b) => b - a);
      
      const deleteRequests = sortedIndices.map(rowIndex => ({
        deleteDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: rowIndex + 1, // +1 because we skip header
            endIndex: rowIndex + 2
          }
        }
      }));

      const batchUpdateBody = {
        requests: deleteRequests
      };

      const response = await makeGoogleApiRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        accessToken,
        'POST',
        JSON.stringify(batchUpdateBody)
      );

      const batchResult = await response.json();
      results.push({
        batchIndex: i,
        batchSize: batch.length,
        deletedRows: sortedIndices.length,
        result: batchResult
      });

    } catch (error: any) {
      results.push({
        batchIndex: i,
        batchSize: batch.length,
        error: error.message
      });
      logger.error(`Batch ${i} failed:`, error);
    }

    // Add delay between batches
    if (i < batches.length - 1 && delayBetweenBatches > 0) {
      await sleep(delayBetweenBatches);
    }
  }

  const successfulBatches = results.filter(r => !r.error);
  const failedBatches = results.filter(r => r.error);
  const totalRowsDeleted = successfulBatches.reduce((sum, batch) => sum + (batch.deletedRows || 0), 0);

  return {
    totalBatches: batches.length,
    successfulBatches: successfulBatches.length,
    failedBatches: failedBatches.length,
    totalRowsDeleted,
    results
  };
}

/**
 * Utility functions
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function findMatchingRows(dataRows: any[][], headers: string[], conditions: any[] | undefined): number[] {
  if (!conditions || conditions.length === 0) {
    return dataRows.map((_, index) => index);
  }

  return dataRows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      return conditions.every(condition => {
        const columnIndex = condition.column.charCodeAt(0) - 65;
        const cellValue = row[columnIndex];
        return evaluateCondition(cellValue, condition.operator, condition.value, condition.dataType);
      });
    })
    .map(({ index }) => index);
}

function evaluateCondition(cellValue: any, operator: string, conditionValue: string, dataType: string): boolean {
  const isEmpty = cellValue === undefined || cellValue === null || cellValue === '';
  
  if (operator === 'is_empty') return isEmpty;
  if (operator === 'is_not_empty') return !isEmpty;
  if (isEmpty) return false;
  
  const cellStr = String(cellValue).toLowerCase();
  const conditionStr = String(conditionValue).toLowerCase();
  
  switch (operator) {
    case 'equals':
      return dataType === 'number' ? parseFloat(cellValue) === parseFloat(conditionValue) : cellStr === conditionStr;
    case 'not_equals':
      return dataType === 'number' ? parseFloat(cellValue) !== parseFloat(conditionValue) : cellStr !== conditionStr;
    case 'contains':
      return cellStr.includes(conditionStr);
    case 'not_contains':
      return !cellStr.includes(conditionStr);
    case 'starts_with':
      return cellStr.startsWith(conditionStr);
    case 'ends_with':
      return cellStr.endsWith(conditionStr);
    case 'greater_than':
      return parseFloat(cellValue) > parseFloat(conditionValue);
    case 'greater_than_equal':
      return parseFloat(cellValue) >= parseFloat(conditionValue);
    case 'less_than':
      return parseFloat(cellValue) < parseFloat(conditionValue);
    case 'less_than_equal':
      return parseFloat(cellValue) <= parseFloat(conditionValue);
    case 'before':
      return new Date(cellValue) < new Date(conditionValue);
    case 'after':
      return new Date(cellValue) > new Date(conditionValue);
    default:
      return false;
  }
}