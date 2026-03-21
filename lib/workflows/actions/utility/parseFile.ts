import { ActionResult } from '../core/executeWait';
import { resolveValue } from '../core/resolveValue';
import { logger } from '@/lib/utils/logger';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import pdf from 'pdf-parse';

/**
 * Execute Parse File Action
 *
 * Supports parsing:
 * - CSV files (using PapaParse)
 * - Excel files (.xlsx, .xls) (using xlsx)
 * - PDF files (using pdf-parse)
 * - JSON files (native parsing)
 *
 * Input methods:
 * - URL: Downloads file from URL
 * - File path: Reads file from local path (for uploaded files)
 * - Base64: Parses base64-encoded file data
 */
export async function executeParseFile(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  const startTime = Date.now();

  try {
    const resolvedConfig = resolveValue(config, input);

    const {
      fileUrl,
      filePath,
      fileBase64,
      fileType,
      csvDelimiter = ',',
      csvHasHeaders = true,
      excelSheetName,
      excelSheetIndex = 0,
      pdfExtractImages = false,
      outputFormat = 'structured' // 'structured' or 'raw'
    } = resolvedConfig;

    // Validate input
    if (!fileUrl && !filePath && !fileBase64) {
      return {
        success: false,
        output: {},
        message: 'File URL, file path, or base64 data is required'
      };
    }

    logger.info('[ParseFile] Starting file parsing', {
      hasUrl: !!fileUrl,
      hasPath: !!filePath,
      hasBase64: !!fileBase64,
      fileType,
      userId
    });

    // Get file buffer
    let fileBuffer: Buffer;
    let detectedType = fileType;

    if (fileUrl) {
      // Download file from URL
      const response = await fetch(fileUrl);
      if (!response.ok) {
        return {
          success: false,
          output: {},
          message: `Failed to download file: ${response.status} ${response.statusText}`
        };
      }
      const arrayBuffer = await response.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);

      // Detect type from URL if not specified
      if (!detectedType) {
        detectedType = detectFileTypeFromUrl(fileUrl);
      }

      // Fallback: detect from Content-Type header
      if (!detectedType) {
        detectedType = detectFileTypeFromContentType(response.headers.get('content-type'));
      }
    } else if (fileBase64) {
      // Parse base64 data
      const base64Data = fileBase64.includes(',')
        ? fileBase64.split(',')[1]
        : fileBase64;
      fileBuffer = Buffer.from(base64Data, 'base64');
    } else {
      // Read from file path (for uploaded files)
      const fs = await import('fs');
      fileBuffer = fs.readFileSync(filePath);

      // Detect type from file extension if not specified
      if (!detectedType) {
        detectedType = detectFileTypeFromPath(filePath);
      }
    }

    // Last resort: try to detect from buffer content
    if (!detectedType) {
      detectedType = detectFileTypeFromContent(fileBuffer);
    }

    // Validate file type
    if (!detectedType) {
      return {
        success: false,
        output: {},
        message: 'Could not detect file type. Please specify fileType parameter (csv, excel, pdf, json, txt)'
      };
    }

    logger.info('[ParseFile] File loaded', {
      size: fileBuffer.length,
      type: detectedType
    });

    let parsedData: any;

    // Parse based on file type
    switch (detectedType.toLowerCase()) {
      case 'csv':
        parsedData = await parseCSV(fileBuffer, csvDelimiter, csvHasHeaders);
        break;

      case 'excel':
      case 'xlsx':
      case 'xls':
        parsedData = await parseExcel(fileBuffer, excelSheetName, excelSheetIndex);
        break;

      case 'pdf':
        parsedData = await parsePDF(fileBuffer, pdfExtractImages);
        break;

      case 'json':
        parsedData = await parseJSON(fileBuffer);
        break;

      case 'txt':
      case 'text':
        parsedData = {
          text: fileBuffer.toString('utf-8'),
          lineCount: fileBuffer.toString('utf-8').split('\n').length,
          charCount: fileBuffer.toString('utf-8').length,
        };
        break;

      default:
        return {
          success: false,
          output: {},
          message: `Unsupported file type: ${detectedType}. Supported types: csv, excel, pdf, json, txt`
        };
    }

    const executionTime = Date.now() - startTime;

    logger.info('[ParseFile] File parsed successfully', {
      fileType: detectedType,
      executionTime
    });

    return {
      success: true,
      output: {
        ...parsedData,
        fileType: detectedType,
        executionTime
      },
      message: `Successfully parsed ${detectedType.toUpperCase()} file in ${executionTime}ms`
    };

  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    logger.error('[ParseFile] Parse error:', error);

    return {
      success: false,
      output: {
        error: error.message,
        executionTime
      },
      message: `Failed to parse file: ${error.message}`
    };
  }
}

/**
 * Parse CSV file
 */
async function parseCSV(
  buffer: Buffer,
  delimiter: string,
  hasHeaders: boolean
): Promise<any> {
  const csvText = buffer.toString('utf-8');

  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      delimiter,
      header: hasHeaders,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        const output: any = {
          rows: results.data,
          rowCount: results.data.length
        };

        if (hasHeaders && results.meta.fields) {
          output.headers = results.meta.fields;
          output.columnCount = results.meta.fields.length;
        }

        if (results.errors.length > 0) {
          output.warnings = results.errors.map((err: any) => ({
            row: err.row,
            message: err.message
          }));
        }

        resolve(output);
      },
      error: (error) => {
        reject(new Error(`CSV parsing failed: ${error.message}`));
      }
    });
  });
}

/**
 * Parse Excel file
 */
async function parseExcel(
  buffer: Buffer,
  sheetName?: string,
  sheetIndex: number = 0
): Promise<any> {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // Get target sheet
    let sheet: XLSX.WorkSheet;
    let actualSheetName: string;

    if (sheetName && workbook.Sheets[sheetName]) {
      sheet = workbook.Sheets[sheetName];
      actualSheetName = sheetName;
    } else {
      actualSheetName = workbook.SheetNames[sheetIndex] || workbook.SheetNames[0];
      sheet = workbook.Sheets[actualSheetName];
    }

    if (!sheet) {
      throw new Error(`Sheet not found: ${sheetName || `index ${sheetIndex}`}`);
    }

    // Convert sheet to JSON
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    const headers = Object.keys(rows[0] || {});

    return {
      rows,
      headers,
      rowCount: rows.length,
      columnCount: headers.length,
      sheetName: actualSheetName,
      availableSheets: workbook.SheetNames
    };

  } catch (error: any) {
    throw new Error(`Excel parsing failed: ${error.message}`);
  }
}

/**
 * Parse PDF file
 */
async function parsePDF(
  buffer: Buffer,
  extractImages: boolean = false
): Promise<any> {
  try {
    const data = await pdf(buffer);

    const output: any = {
      text: data.text,
      pageCount: data.numpages,
      info: {
        title: data.info?.Title || null,
        author: data.info?.Author || null,
        subject: data.info?.Subject || null,
        creator: data.info?.Creator || null,
        producer: data.info?.Producer || null,
        creationDate: data.info?.CreationDate || null
      }
    };

    // Split text by pages if available
    if (data.text) {
      // Simple page splitting (PDFs don't always have clear page markers)
      output.pages = data.text.split('\n\n\n').filter(p => p.trim());
    }

    return output;

  } catch (error: any) {
    throw new Error(`PDF parsing failed: ${error.message}`);
  }
}

/**
 * Parse JSON file
 */
async function parseJSON(buffer: Buffer): Promise<any> {
  try {
    const jsonText = buffer.toString('utf-8');
    const data = JSON.parse(jsonText);

    // If it's an array, treat like rows
    if (Array.isArray(data)) {
      return {
        rows: data,
        rowCount: data.length,
        json: data
      };
    }

    // If it's an object, return as-is
    return {
      json: data,
      keys: Object.keys(data)
    };

  } catch (error: any) {
    throw new Error(`JSON parsing failed: ${error.message}`);
  }
}

/**
 * Detect file type from URL
 */
function detectFileTypeFromUrl(url: string): string | null {
  const extension = url.split('.').pop()?.split('?')[0].toLowerCase();

  if (extension === 'csv') return 'csv';
  if (extension === 'xlsx' || extension === 'xls') return 'excel';
  if (extension === 'pdf') return 'pdf';
  if (extension === 'json') return 'json';
  if (extension === 'txt') return 'txt';

  return null;
}

/**
 * Detect file type from file path
 */
function detectFileTypeFromPath(path: string): string | null {
  const extension = path.split('.').pop()?.toLowerCase();

  if (extension === 'csv') return 'csv';
  if (extension === 'xlsx' || extension === 'xls') return 'excel';
  if (extension === 'pdf') return 'pdf';
  if (extension === 'json') return 'json';
  if (extension === 'txt') return 'txt';

  return null;
}

/**
 * Detect file type from Content-Type header
 */
function detectFileTypeFromContentType(contentType: string | null): string | null {
  if (!contentType) return null;
  const ct = contentType.toLowerCase();

  if (ct.includes('text/csv')) return 'csv';
  if (ct.includes('spreadsheetml') || ct.includes('ms-excel')) return 'excel';
  if (ct.includes('application/pdf')) return 'pdf';
  if (ct.includes('application/json')) return 'json';
  if (ct.includes('text/plain')) return 'txt';

  return null;
}

/**
 * Detect file type from buffer content (magic bytes / heuristics)
 */
function detectFileTypeFromContent(buffer: Buffer): string | null {
  if (buffer.length < 4) return 'txt';

  // PDF magic bytes: %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'pdf';
  }

  // XLSX/ZIP magic bytes: PK (0x504B)
  if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
    return 'excel';
  }

  // Try to detect JSON
  const start = buffer.toString('utf-8', 0, Math.min(100, buffer.length)).trim();
  if (start.startsWith('{') || start.startsWith('[')) {
    return 'json';
  }

  // If it's valid UTF-8 text, treat as txt
  try {
    const text = buffer.toString('utf-8');
    if (text && !text.includes('\ufffd')) {
      return 'txt';
    }
  } catch {
    // Not valid UTF-8
  }

  return null;
}
