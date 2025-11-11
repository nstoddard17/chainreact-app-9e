import { ActionResult } from '../core/executeWait';
import { resolveValue } from '../core/resolveValue';
import { logger } from '@/lib/utils/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import * as XLSX from 'xlsx';
import pdf from 'pdf-parse';

/**
 * Execute File Upload and Processing
 *
 * Production implementation using:
 * - Supabase Storage for file storage
 * - Native parsing for CSV, JSON, TXT
 * - Cheerio for basic file processing
 *
 * For production Excel/PDF parsing, consider adding:
 * - xlsx package for Excel files
 * - pdf-parse for PDF text extraction
 */
export async function executeFileUpload(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  const startTime = Date.now();

  try {
    const resolvedConfig = resolveValue(config, { input });

    const {
      source = 'upload',
      file,
      fileUrl,
      fileField,
      maxFileSize = 10, // MB
      autoDetectFormat = true,
      csvDelimiter = ',',
      hasHeaders = true,
      sheetName
    } = resolvedConfig;

    // Validate source-specific requirements
    if (source === 'upload' && !file) {
      return {
        success: false,
        output: {},
        message: 'No file provided for upload'
      };
    }

    if (source === 'url' && !fileUrl) {
      return {
        success: false,
        output: {},
        message: 'File URL is required'
      };
    }

    if (source === 'previous_step' && !fileField) {
      return {
        success: false,
        output: {},
        message: 'File field from previous step is required'
      };
    }

    logger.info('[FileUpload] Processing file', {
      source,
      maxFileSize,
      userId
    });

    let fileContent: Buffer;
    let fileName: string;
    let fileType: string;

    // Get file content based on source
    if (source === 'url' || source === 'previous_step') {
      const url = source === 'url' ? fileUrl : fileField;

      logger.info('[FileUpload] Downloading file from URL', { url });

      const response = await fetch(url);
      if (!response.ok) {
        return {
          success: false,
          output: {},
          message: `Failed to download file: ${response.status} ${response.statusText}`
        };
      }

      fileContent = Buffer.from(await response.arrayBuffer());
      fileName = url.split('/').pop() || 'downloaded-file';
      fileType = response.headers.get('content-type') || 'application/octet-stream';
    } else {
      // Direct upload - file should be a Buffer or have a buffer property
      if (!file.buffer && !Buffer.isBuffer(file)) {
        return {
          success: false,
          output: {},
          message: 'Invalid file format. File must be a Buffer or contain a buffer property.'
        };
      }

      fileContent = Buffer.isBuffer(file) ? file : file.buffer;
      fileName = file.name || `upload-${Date.now()}`;
      fileType = file.type || file.mimetype || 'application/octet-stream';
    }

    // Check file size
    const fileSizeMB = fileContent.length / (1024 * 1024);
    if (fileSizeMB > maxFileSize) {
      return {
        success: false,
        output: {},
        message: `File size (${fileSizeMB.toFixed(2)}MB) exceeds maximum allowed size (${maxFileSize}MB)`
      };
    }

    logger.info('[FileUpload] File received', {
      fileName,
      fileType,
      fileSizeMB: fileSizeMB.toFixed(2)
    });

    // Upload to Supabase Storage
    const supabase = createAdminClient();
    const storagePath = `${userId}/${Date.now()}-${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('workflow-files')
      .upload(storagePath, fileContent, {
        contentType: fileType,
        upsert: false
      });

    if (uploadError) {
      logger.error('[FileUpload] Supabase storage error:', uploadError);
      return {
        success: false,
        output: {},
        message: `Failed to upload file: ${uploadError.message}`
      };
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('workflow-files')
      .getPublicUrl(storagePath);

    logger.info('[FileUpload] File uploaded to Supabase', {
      storagePath,
      publicUrl
    });

    // Parse file content based on type
    let parsedData: any = null;
    let rowCount = 0;

    try {
      const fileExtension = fileName.split('.').pop()?.toLowerCase();

      if (fileExtension === 'csv' || fileType.includes('csv')) {
        const parseResult = parseCSV(fileContent.toString('utf-8'), csvDelimiter, hasHeaders);
        parsedData = parseResult.data;
        rowCount = parseResult.rowCount;
      } else if (fileExtension === 'json' || fileType.includes('json')) {
        parsedData = JSON.parse(fileContent.toString('utf-8'));
        rowCount = Array.isArray(parsedData) ? parsedData.length : 1;
      } else if (fileExtension === 'txt' || fileType.includes('text')) {
        parsedData = { text: fileContent.toString('utf-8') };
        rowCount = 1;
      } else if (fileExtension === 'xlsx' || fileExtension === 'xls' || fileType.includes('spreadsheet')) {
        // Parse Excel files using xlsx package
        logger.info('[FileUpload] Parsing Excel file');
        const workbook = XLSX.read(fileContent, { type: 'buffer' });

        // Use specified sheet or first sheet
        const sheetName = (resolvedConfig.excelSheet || workbook.SheetNames[0]) as string;
        const worksheet = workbook.Sheets[sheetName];

        if (!worksheet) {
          throw new Error(`Sheet "${sheetName}" not found. Available sheets: ${workbook.SheetNames.join(', ')}`);
        }

        // Convert to JSON (header row: 1 means first row is headers)
        parsedData = XLSX.utils.sheet_to_json(worksheet, {
          header: hasHeaders ? undefined : 1, // undefined uses first row as headers
          defval: '' // Default value for empty cells
        });
        rowCount = parsedData.length;

        logger.info('[FileUpload] Excel parsed successfully', {
          sheetName,
          rowCount,
          availableSheets: workbook.SheetNames
        });
      } else if (fileExtension === 'pdf' || fileType.includes('pdf')) {
        // Parse PDF files using pdf-parse package
        logger.info('[FileUpload] Extracting text from PDF');
        const pdfData = await pdf(fileContent);

        parsedData = {
          text: pdfData.text,
          numPages: pdfData.numpages,
          info: pdfData.info,
          metadata: pdfData.metadata
        };
        rowCount = pdfData.numpages;

        logger.info('[FileUpload] PDF parsed successfully', {
          numPages: pdfData.numpages,
          textLength: pdfData.text.length
        });
      }
    } catch (parseError: any) {
      logger.error('[FileUpload] File parsing error:', parseError);
      // Don't fail the whole operation, just note that parsing failed
      parsedData = {
        parseError: parseError.message,
        note: 'File uploaded successfully but parsing failed. File is available at the URL.'
      };
    }

    const executionTime = Date.now() - startTime;

    return {
      success: true,
      output: {
        fileUrl: publicUrl,
        fileName,
        fileSize: fileContent.length,
        fileSizeMB: fileSizeMB.toFixed(2),
        fileType,
        data: parsedData,
        rowCount,
        parsedAt: new Date().toISOString(),
        storagePath,
        parseOptions: {
          delimiter: csvDelimiter,
          hasHeaders,
          sheetName
        }
      },
      message: `File processed successfully in ${executionTime}ms`
    };

  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    logger.error('[FileUpload] Processing error:', error);

    return {
      success: false,
      output: {
        error: error.message,
        executionTime
      },
      message: `File processing failed: ${error.message}`
    };
  }
}

/**
 * Parse CSV content
 */
function parseCSV(content: string, delimiter: string = ',', hasHeaders: boolean = true): { data: any[], rowCount: number } {
  const lines = content.split('\n').filter(line => line.trim());

  if (lines.length === 0) {
    return { data: [], rowCount: 0 };
  }

  const headers = hasHeaders ? lines[0].split(delimiter).map(h => h.trim()) : null;
  const dataLines = hasHeaders ? lines.slice(1) : lines;

  const data = dataLines.map(line => {
    const values = line.split(delimiter).map(v => v.trim());

    if (headers) {
      // Return as object with headers as keys
      return headers.reduce((obj: any, header, index) => {
        obj[header] = values[index] || '';
        return obj;
      }, {});
    } else {
      // Return as array
      return values;
    }
  });

  return { data, rowCount: data.length };
}
