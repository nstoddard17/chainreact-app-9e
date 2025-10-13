import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response';
import { validateGoogleIntegration, makeGoogleApiRequest, getGoogleAccessToken } from '../../data/utils';

import { logger } from '@/lib/utils/logger'

interface ExecuteRequest {
  integrationId: string;
  spreadsheetId: string;
  sheetName: string;
  action: 'add_row' | 'update_rows' | 'delete_rows' | 'clear_rows';
  data?: any;
  conditions?: Array<{
    column: string;
    operator: string;
    value: string;
    dataType: string;
  }>;
  columnMapping?: Record<string, string>;
  batchData?: any[];
  options?: {
    skipHeaders?: boolean;
    insertDataOption?: 'OVERWRITE' | 'INSERT_ROWS';
    valueInputOption?: 'RAW' | 'USER_ENTERED';
    includeValuesInResponse?: boolean;
  };
}

interface SheetMetadata {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
}

/**
 * Execute Google Sheets operations
 */
export async function POST(request: NextRequest) {
  try {
    const body: ExecuteRequest = await request.json();
    const { integrationId, spreadsheetId, sheetName, action, data, conditions, columnMapping, batchData, options = {} } = body;

    if (!integrationId || !spreadsheetId || !sheetName || !action) {
      return errorResponse('Missing required parameters' , 400);
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
      return errorResponse('Integration not found' , 404);
    }

    validateGoogleIntegration(integration[0]);
    const accessToken = getGoogleAccessToken(integration[0]);

    // Get sheet metadata
    const sheetMetadata = await getSheetMetadata(spreadsheetId, sheetName, accessToken);
    
    let result;
    switch (action) {
      case 'add_row':
        result = await addRow(spreadsheetId, sheetName, data, columnMapping, accessToken, options);
        break;
      case 'update_rows':
        result = await updateRows(spreadsheetId, sheetName, sheetMetadata, data, conditions, columnMapping, accessToken, options);
        break;
      case 'delete_rows':
        result = await deleteRows(spreadsheetId, sheetMetadata, conditions, accessToken);
        break;
      case 'clear_rows':
        result = await clearRows(spreadsheetId, sheetName, sheetMetadata, conditions, accessToken);
        break;
      default:
        return errorResponse('Invalid action' , 400);
    }

    return jsonResponse({ success: true, result });

  } catch (error: any) {
    logger.error('❌ [Google Sheets Execute] Error:', error);
    return errorResponse(error.message || 'Failed to execute Google Sheets operation' , 500);
  }
}

/**
 * Get sheet metadata including sheet ID
 */
async function getSheetMetadata(spreadsheetId: string, sheetName: string, accessToken: string): Promise<SheetMetadata> {
  const response = await makeGoogleApiRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title,gridProperties))`,
    accessToken
  );

  const data = await response.json();
  const sheet = data.sheets?.find((s: any) => s.properties.title === sheetName);
  
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found`);
  }

  return {
    sheetId: sheet.properties.sheetId,
    title: sheet.properties.title,
    rowCount: sheet.properties.gridProperties?.rowCount || 1000,
    columnCount: sheet.properties.gridProperties?.columnCount || 26
  };
}

/**
 * Add a single row to the sheet
 */
async function addRow(
  spreadsheetId: string, 
  sheetName: string, 
  data: Record<string, any>, 
  columnMapping: Record<string, string> | undefined,
  accessToken: string,
  options: any
): Promise<any> {
  // If columnMapping is provided, map the data to column letters
  let values: any[] = [];
  
  if (columnMapping) {
    // Get headers to determine column order
    const headersResponse = await makeGoogleApiRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`,
      accessToken
    );
    const headersData = await headersjsonResponse();
    const headers = headersData.values?.[0] || [];
    
    // Create row data based on column mapping
    values = new Array(headers.length).fill('');
    Object.entries(columnMapping).forEach(([fieldName, columnLetter]) => {
      const columnIndex = columnLetter.charCodeAt(0) - 65; // Convert A=0, B=1, etc.
      if (columnIndex < values.length && data[fieldName] !== undefined) {
        values[columnIndex] = data[fieldName];
      }
    });
  } else {
    // Direct data array
    values = Object.values(data);
  }

  const requestBody = {
    values: [values],
    majorDimension: 'ROWS',
  };

  const response = await makeGoogleApiRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=${options.valueInputOption || 'USER_ENTERED'}&insertDataOption=${options.insertDataOption || 'INSERT_ROWS'}`,
    accessToken,
    'POST',
    JSON.stringify(requestBody)
  );

  return await response.json();
}

/**
 * Update rows based on conditions
 */
async function updateRows(
  spreadsheetId: string,
  sheetName: string,
  sheetMetadata: SheetMetadata,
  data: Record<string, any>,
  conditions: any[] | undefined,
  columnMapping: Record<string, string> | undefined,
  accessToken: string,
  options: any
): Promise<any> {
  // Get all data from sheet to find matching rows
  const dataResponse = await makeGoogleApiRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:Z`,
    accessToken
  );
  const sheetData = await datajsonResponse();
  const rows = sheetData.values || [];
  
  if (rows.length === 0) {
    throw new Error('Sheet is empty');
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);
  
  // Find rows that match conditions
  const matchingRowIndices = findMatchingRows(dataRows, headers, conditions);
  
  if (matchingRowIndices.length === 0) {
    return { message: 'No rows matched the conditions', updatedRows: 0 };
  }

  // Prepare update requests
  const updateRequests = [];
  
  for (const rowIndex of matchingRowIndices) {
    const actualRowIndex = rowIndex + 2; // +2 because we skip header and convert to 1-based
    
    if (columnMapping) {
      // Update specific columns based on mapping
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

  // Execute batch update
  const batchUpdateBody = {
    valueInputOption: options.valueInputOption || 'USER_ENTERED',
    data: updateRequests
  };

  const response = await makeGoogleApiRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    accessToken,
    'POST',
    JSON.stringify(batchUpdateBody)
  );

  const result = await response.json();
  return { ...result, updatedRows: matchingRowIndices.length };
}

/**
 * Delete rows based on conditions
 */
async function deleteRows(
  spreadsheetId: string,
  sheetMetadata: SheetMetadata,
  conditions: any[] | undefined,
  accessToken: string
): Promise<any> {
  // Get all data to find matching rows
  const dataResponse = await makeGoogleApiRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetMetadata.title)}!A:Z`,
    accessToken
  );
  const sheetData = await datajsonResponse();
  const rows = sheetData.values || [];
  
  if (rows.length <= 1) {
    return { message: 'No data rows to delete', deletedRows: 0 };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);
  
  // Find rows that match conditions
  const matchingRowIndices = findMatchingRows(dataRows, headers, conditions);
  
  if (matchingRowIndices.length === 0) {
    return { message: 'No rows matched the conditions', deletedRows: 0 };
  }

  // Sort row indices in descending order to delete from bottom to top
  // This prevents index shifting issues
  const sortedIndices = matchingRowIndices.sort((a, b) => b - a);
  
  const deleteRequests = sortedIndices.map(rowIndex => ({
    deleteDimension: {
      range: {
        sheetId: sheetMetadata.sheetId,
        dimension: 'ROWS',
        startIndex: rowIndex + 1, // +1 because we skip header row
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

  const result = await response.json();
  return { ...result, deletedRows: matchingRowIndices.length };
}

/**
 * Clear rows based on conditions (set values to empty but keep rows)
 */
async function clearRows(
  spreadsheetId: string,
  sheetName: string,
  sheetMetadata: SheetMetadata,
  conditions: any[] | undefined,
  accessToken: string
): Promise<any> {
  // Get all data to find matching rows
  const dataResponse = await makeGoogleApiRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:Z`,
    accessToken
  );
  const sheetData = await datajsonResponse();
  const rows = sheetData.values || [];
  
  if (rows.length <= 1) {
    return { message: 'No data rows to clear', clearedRows: 0 };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);
  
  // Find rows that match conditions
  const matchingRowIndices = findMatchingRows(dataRows, headers, conditions);
  
  if (matchingRowIndices.length === 0) {
    return { message: 'No rows matched the conditions', clearedRows: 0 };
  }

  // Prepare clear requests
  const clearRequests = matchingRowIndices.map(rowIndex => {
    const actualRowIndex = rowIndex + 2; // +2 because we skip header and convert to 1-based
    return `${sheetName}!A${actualRowIndex}:${String.fromCharCode(64 + headers.length)}${actualRowIndex}`;
  });

  const batchClearBody = {
    ranges: clearRequests
  };

  const response = await makeGoogleApiRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`,
    accessToken,
    'POST',
    JSON.stringify(batchClearBody)
  );

  const result = await response.json();
  return { ...result, clearedRows: matchingRowIndices.length };
}

/**
 * Find rows that match the given conditions
 */
function findMatchingRows(dataRows: any[][], headers: string[], conditions: any[] | undefined): number[] {
  if (!conditions || conditions.length === 0) {
    // No conditions means all rows match
    return dataRows.map((_, index) => index);
  }

  return dataRows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      return conditions.every(condition => {
        const columnIndex = condition.column.charCodeAt(0) - 65; // Convert A=0, B=1, etc.
        const cellValue = row[columnIndex];
        
        return evaluateCondition(cellValue, condition.operator, condition.value, condition.dataType);
      });
    })
    .map(({ index }) => index);
}

/**
 * Evaluate a single condition
 */
function evaluateCondition(cellValue: any, operator: string, conditionValue: string, dataType: string): boolean {
  // Handle empty/null values
  const isEmpty = cellValue === undefined || cellValue === null || cellValue === '';
  
  if (operator === 'is_empty') return isEmpty;
  if (operator === 'is_not_empty') return !isEmpty;
  
  if (isEmpty) return false; // For other operators, empty cells don't match
  
  const cellStr = String(cellValue).toLowerCase();
  const conditionStr = String(conditionValue).toLowerCase();
  
  switch (operator) {
    case 'equals':
      if (dataType === 'number') {
        return parseFloat(cellValue) === parseFloat(conditionValue);
      }
      return cellStr === conditionStr;
      
    case 'not_equals':
      if (dataType === 'number') {
        return parseFloat(cellValue) !== parseFloat(conditionValue);
      }
      return cellStr !== conditionStr;
      
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