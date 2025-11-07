import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Duplicate an Airtable record with optional field selection and overrides
 *
 * This action:
 * 1. Fetches the source record
 * 2. Copies selected fields (from duplicateConfig.fieldsToCopy)
 * 3. Applies field overrides (from duplicateConfig.fieldsToOverride)
 * 4. Creates a new record with the duplicated + overridden values
 */
export async function duplicateAirtableRecord(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    logger.debug("📋 [Airtable] Duplicating record...");

    // Validate config
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid configuration provided');
    }

    const accessToken = await getDecryptedAccessToken(userId, "airtable");

    const baseId = resolveValue(config.baseId, input);
    const tableName = resolveValue(config.tableName, input);
    const recordId = resolveValue(config.recordId, input);

    // Get duplication configuration
    const duplicateConfig = config.duplicateConfig || {
      fieldsToCopy: [], // If not set, copy no fields
      fieldsToOverride: {}
    };

    const { fieldsToCopy = [], fieldsToOverride = {} } = duplicateConfig;

    if (!baseId || !tableName || !recordId) {
      const missingFields = [];
      if (!baseId) missingFields.push("Base ID");
      if (!tableName) missingFields.push("Table Name");
      if (!recordId) missingFields.push("Record ID");

      const message = `Missing required fields for duplicating record: ${missingFields.join(", ")}`;
      logger.error(message);
      return { success: false, message };
    }

    logger.debug(`📋 [Airtable] Fetching source record ${recordId} from ${tableName}...`);

    // Step 1: Fetch the source record
    const fetchResponse = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${recordId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!fetchResponse.ok) {
      const errorText = await fetchResponse.text().catch(() => fetchResponse.statusText);
      logger.error(`❌ [Airtable] Failed to fetch source record: ${errorText}`);
      return {
        success: false,
        message: `Failed to fetch source record: ${fetchResponse.status} ${errorText}`
      };
    }

    const sourceRecord = await fetchResponse.json();
    const sourceFields = sourceRecord.fields || {};

    logger.debug(`📋 [Airtable] Source record fetched. Fields: ${Object.keys(sourceFields).join(', ')}`);

    // Step 2: Build new record fields
    const newFields: Record<string, any> = {};

    // Copy selected fields
    if (fieldsToCopy.length === 0) {
      logger.warn(`⚠️ [Airtable] No fields selected to copy. Duplicate will be empty.`);
    } else {
      fieldsToCopy.forEach((fieldName: string) => {
        if (sourceFields.hasOwnProperty(fieldName)) {
          newFields[fieldName] = sourceFields[fieldName];
          logger.debug(`✅ [Airtable] Copying field: ${fieldName}`);
        } else {
          logger.debug(`⚠️ [Airtable] Field not found in source record: ${fieldName}`);
        }
      });
    }

    // Apply overrides
    Object.entries(fieldsToOverride).forEach(([fieldName, overrideValue]) => {
      const resolved = resolveValue(overrideValue, input);
      newFields[fieldName] = resolved;
      logger.debug(`🔄 [Airtable] Overriding field: ${fieldName} = ${JSON.stringify(resolved)}`);
    });

    logger.debug(`📋 [Airtable] Creating duplicate with ${Object.keys(newFields).length} fields...`);

    // Step 3: Create the new record
    const createResponse = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields: newFields }),
      }
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text().catch(() => createResponse.statusText);
      logger.error(`❌ [Airtable] Failed to create duplicate record: ${errorText}`);
      return {
        success: false,
        message: `Failed to create duplicate record: ${createResponse.status} ${errorText}`
      };
    }

    const newRecord = await createResponse.json();

    logger.debug(`✅ [Airtable] Record duplicated successfully. New ID: ${newRecord.id}`);

    return {
      success: true,
      message: 'Record duplicated successfully',
      data: {
        newRecordId: newRecord.id,
        originalRecordId: recordId,
        fields: newRecord.fields,
        createdTime: newRecord.createdTime,
        copiedFieldCount: fieldsToCopy.length,
        overriddenFieldCount: Object.keys(fieldsToOverride).length
      }
    };

  } catch (error: any) {
    logger.error("❌ [Airtable] Error duplicating record:", error);
    return {
      success: false,
      message: error.message || 'Failed to duplicate record',
      error: error.message
    };
  }
}
