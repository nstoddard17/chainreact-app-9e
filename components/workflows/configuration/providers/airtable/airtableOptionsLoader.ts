/**
 * Airtable Options Loader
 * Handles loading dynamic options for Airtable-specific fields including linked records
 */

import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types';
import { logger } from '@/lib/utils/logger';
import { useConfigCacheStore } from '@/stores/configCacheStore';
import { buildCacheKey, getFieldTTL } from '@/lib/workflows/configuration/cache-utils';

export class AirtableOptionsLoader implements ProviderOptionsLoader {
  private supportedFields = [
    'baseId',
    'tableName',
    'filterField',
    'filterValue',
    'searchValue',
    'draftName',
    'designer',
    'associatedProject',
    'feedback',
    'tasks',
    'selectedRecord',
    'attachmentField'
  ];

  canHandle(fieldName: string, providerId: string): boolean {
    // Handle regular Airtable fields
    if (providerId === 'airtable' && this.supportedFields.includes(fieldName)) {
      return true;
    }

    // Handle dynamic Airtable fields (including our dropdown fields)
    if (providerId === 'airtable' && fieldName.startsWith('airtable_field_')) {
      // Always handle any field with the airtable_field_ prefix
      logger.debug(`✅ [AirtableOptionsLoader] canHandle returning true for ${fieldName}`);
      return true;
    }

    return false;
  }

  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, integrationId, signal, extraOptions } = params;

    logger.debug(`🔍 [AirtableOptionsLoader] loadOptions called for field: ${fieldName}`, {
      hasExtraOptions: !!extraOptions,
      baseId: extraOptions?.baseId,
      tableName: extraOptions?.tableName
    });

    // Handle dynamic Airtable fields
    if (fieldName.startsWith('airtable_field_')) {
      // Check if it's one of our special dropdown fields
      const actualFieldName = fieldName.replace('airtable_field_', '').toLowerCase();
      logger.debug(`🔍 [AirtableOptionsLoader] Processing dynamic field, actualFieldName: ${actualFieldName}`);

      if (actualFieldName.includes('draft') && actualFieldName.includes('name')) {
        logger.debug(`🔍 [AirtableOptionsLoader] Loading draft names`);
        return this.loadDynamicFieldOptions(params, 'airtable_draft_names');
      } else if (actualFieldName.includes('designer')) {
        logger.debug(`🔍 [AirtableOptionsLoader] Loading designers`);
        return this.loadDynamicFieldOptions(params, 'airtable_designers');
      } else if (actualFieldName.includes('project')) {
        logger.debug(`🔍 [AirtableOptionsLoader] Loading projects`);
        return this.loadDynamicFieldOptions(params, 'airtable_projects');
      } else if (actualFieldName.includes('feedback')) {
        logger.debug(`🔍 [AirtableOptionsLoader] Loading feedback`);
        return this.loadDynamicFieldOptions(params, 'airtable_feedback');
      } else if (actualFieldName.includes('task')) {
        logger.debug(`🔍 [AirtableOptionsLoader] Loading tasks`);
        return this.loadDynamicFieldOptions(params, 'airtable_tasks');
      } 
        // Handle linked record fields
        logger.debug(`🔍 [AirtableOptionsLoader] Loading linked records`);
        return this.loadLinkedRecords(params);
      
    }

    switch (fieldName) {
      case 'baseId':
        return this.loadBases(params);

      case 'tableName':
        return this.loadTables(params);

      case 'filterField':
        return this.loadFields(params);

      case 'filterValue':
        return this.loadFieldValues(params);

      case 'searchValue':
        return this.loadSearchFieldValues(params);

      case 'draftName':
        return this.loadDynamicFieldOptions(params, 'airtable_draft_names');

      case 'designer':
        return this.loadDynamicFieldOptions(params, 'airtable_designers');

      case 'associatedProject':
        return this.loadDynamicFieldOptions(params, 'airtable_projects');

      case 'feedback':
        return this.loadDynamicFieldOptions(params, 'airtable_feedback');

      case 'tasks':
        return this.loadDynamicFieldOptions(params, 'airtable_tasks');

      case 'selectedRecord':
        return this.loadRecordsForSelection(params);

      case 'attachmentField':
        return this.loadAttachmentFields(params);

      default:
        return [];
    }
  }

  private async loadBases(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { integrationId, signal, forceRefresh } = params;

    if (!integrationId) {
      logger.debug('🔍 [Airtable] Cannot load bases without integrationId');
      return [];
    }

    // Build cache key
    const cacheKey = buildCacheKey('airtable', integrationId, 'baseId');
    const cacheStore = useConfigCacheStore.getState();

    // Force refresh handling
    if (forceRefresh) {
      logger.debug(`🔄 [Airtable] Force refresh - invalidating cache:`, cacheKey);
      cacheStore.invalidate(cacheKey);
    }

    // Try cache first
    if (!forceRefresh) {
      const cached = cacheStore.get(cacheKey);
      if (cached) {
        logger.debug(`💾 [Airtable] Cache HIT for baseId:`, { cacheKey, count: cached.length });
        return cached;
      }
      logger.debug(`❌ [Airtable] Cache MISS for baseId:`, { cacheKey });
    }

    try {
      const response = await fetch('/api/integrations/airtable/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: 'airtable_bases',
          options: {},
          forceRefresh
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(`Failed to load bases: ${response.status}`);
      }

      const result = await response.json();
      const bases = result.data || [];

      const formattedBases = bases.map((base: any) => ({
        value: base.id || base.value,
        label: base.name || base.label || base.id,
      }));

      // Store in cache
      const ttl = getFieldTTL('baseId');
      cacheStore.set(cacheKey, formattedBases, ttl);
      logger.debug(`💾 [Airtable] Cached ${formattedBases.length} options for baseId (TTL: ${ttl / 1000}s)`);

      return formattedBases;
    } catch (error) {
      logger.error('❌ [Airtable] Error loading bases:', error);
      return [];
    }
  }

  private async loadTables(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { dependsOnValue: baseId, integrationId, signal, forceRefresh } = params;

    if (!baseId || !integrationId) {
      logger.debug('🔍 [Airtable] Cannot load tables without baseId and integrationId');
      return [];
    }

    // Build cache key
    const cacheKey = buildCacheKey('airtable', integrationId, 'tableName', { baseId });
    const cacheStore = useConfigCacheStore.getState();

    // Force refresh handling
    if (forceRefresh) {
      logger.debug(`🔄 [Airtable] Force refresh - invalidating cache:`, cacheKey);
      cacheStore.invalidate(cacheKey);
    }

    // Try cache first
    if (!forceRefresh) {
      const cached = cacheStore.get(cacheKey);
      if (cached) {
        logger.debug(`💾 [Airtable] Cache HIT for tableName:`, { cacheKey, count: cached.length });
        return cached;
      }
      logger.debug(`❌ [Airtable] Cache MISS for tableName:`, { cacheKey });
    }

    try {
      const response = await fetch('/api/integrations/airtable/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: 'airtable_tables',
          options: { baseId },
          forceRefresh
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(`Failed to load tables: ${response.status}`);
      }

      const result = await response.json();
      const tables = result.data || [];

      const formattedTables = tables.map((table: any) => ({
        value: table.name || table.id || table.value,
        label: table.name || table.label || table.id,
        fields: table.fields,
        description: table.description
      }));

      // Store in cache
      const ttl = getFieldTTL('tableName');
      cacheStore.set(cacheKey, formattedTables, ttl);
      logger.debug(`💾 [Airtable] Cached ${formattedTables.length} options for tableName (TTL: ${ttl / 1000}s)`);

      return formattedTables;
    } catch (error) {
      logger.error('❌ [Airtable] Error loading tables:', error);
      return [];
    }
  }

  private async loadFields(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { dependsOnValue: tableName, extraOptions, integrationId, signal, forceRefresh } = params;

    if (!tableName || !integrationId) {
      logger.debug('🔍 [Airtable] Cannot load fields without tableName and integrationId');
      return [];
    }

    const baseId = extraOptions?.baseId;
    if (!baseId) {
      logger.debug('🔍 [Airtable] Cannot load fields without baseId');
      return [];
    }

    // Build cache key
    const cacheKey = buildCacheKey('airtable', integrationId, 'filterField', { baseId, tableName });
    const cacheStore = useConfigCacheStore.getState();

    // Force refresh handling
    if (forceRefresh) {
      logger.debug(`🔄 [Airtable] Force refresh - invalidating cache:`, cacheKey);
      cacheStore.invalidate(cacheKey);
    }

    // Try cache first
    if (!forceRefresh) {
      const cached = cacheStore.get(cacheKey);
      if (cached) {
        logger.debug(`💾 [Airtable] Cache HIT for filterField:`, { cacheKey, count: cached.length });
        return cached;
      }
      logger.debug(`❌ [Airtable] Cache MISS for filterField:`, { cacheKey });
    }

    try {
      // Load fields from table schema (includes type information and filters out read-only fields)
      const response = await fetch('/api/integrations/airtable/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: 'airtable_fields',
          options: {
            baseId,
            tableName,
            filterReadOnly: true // Filter out auto-generated, computed, locked, hidden, and AI fields
          },
          forceRefresh
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(`Failed to load fields: ${response.status}`);
      }

      const result = await response.json();
      const fields = result.data || [];

      logger.debug(`🔍 [loadFields] Received ${fields.length} fields from API:`, {
        firstField: fields[0],
        selectFields: fields.filter((f: any) => f.type === 'singleSelect' || f.type === 'multipleSelects').map((f: any) => ({
          label: f.label || f.value || f.name,
          type: f.type,
          optionsCount: f.options?.length || 0,
          hasOptions: !!f.options
        }))
      });

      // Fields are already formatted from the backend with proper type information
      const formattedFields = fields.map((field: any) => ({
        value: field.value || field.name,
        label: field.label || field.name,
        type: field.type || 'text',
        id: field.id || field.value || field.name,
        options: field.options // Preserve options for select fields
      }));

      logger.debug(`🔍 [loadFields] Formatted fields:`, {
        firstFormatted: formattedFields[0],
        selectFormatted: formattedFields.filter((f: any) => f.type === 'singleSelect' || f.type === 'multipleSelects').slice(0, 2)
      });

      // Store in cache
      const ttl = getFieldTTL('filterField');
      cacheStore.set(cacheKey, formattedFields, ttl);
      logger.debug(`💾 [Airtable] Cached ${formattedFields.length} editable fields for filterField (TTL: ${ttl / 1000}s)`);

      return formattedFields;
    } catch (error) {
      logger.error('❌ [Airtable] Error loading fields:', error);
      return [];
    }
  }

  private async loadDynamicFieldOptions(params: LoadOptionsParams, dataType: string): Promise<FormattedOption[]> {
    const { extraOptions, integrationId, signal, fieldName, forceRefresh } = params;

    logger.debug(`📊 [loadDynamicFieldOptions] Called with:`, {
      fieldName,
      dataType,
      integrationId,
      extraOptions
    });

    if (!integrationId) {
      logger.debug(`🔍 [Airtable] Cannot load ${dataType} without integrationId`);
      return [];
    }

    const baseId = extraOptions?.baseId;
    const tableName = extraOptions?.tableName;

    if (!baseId || !tableName) {
      logger.debug(`🔍 [Airtable] Cannot load ${dataType} without baseId and tableName`, {
        baseId,
        tableName,
        extraOptions
      });
      return [];
    }

    // Build cache key
    const cacheKey = buildCacheKey('airtable', integrationId, fieldName, { baseId, tableName, dataType });
    const cacheStore = useConfigCacheStore.getState();

    // Force refresh handling
    if (forceRefresh) {
      logger.debug(`🔄 [Airtable] Force refresh - invalidating cache:`, cacheKey);
      cacheStore.invalidate(cacheKey);
    }

    // Try cache first
    if (!forceRefresh) {
      const cached = cacheStore.get(cacheKey);
      if (cached) {
        logger.debug(`💾 [Airtable] Cache HIT for ${fieldName}:`, { cacheKey, count: cached.length });
        return cached;
      }
      logger.debug(`❌ [Airtable] Cache MISS for ${fieldName}:`, { cacheKey });
    }

    // For linked record fields, we need to fetch from the linked table
    if (dataType === 'airtable_projects' || dataType === 'airtable_feedback' || dataType === 'airtable_tasks') {
      // Map data types to linked table names
      const linkedTableMap: Record<string, string> = {
        'airtable_projects': 'Projects',
        'airtable_feedback': 'Feedback',
        'airtable_tasks': 'Tasks'
      };

      const linkedTableName = linkedTableMap[dataType];

      try {
        const response = await fetch('/api/integrations/airtable/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            integrationId,
            dataType: 'airtable_linked_records',
            options: {
              baseId,
              linkedTableName
            },
            forceRefresh
          }),
          signal
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          logger.error(`❌ [Airtable] Failed to load linked records from ${linkedTableName}:`, {
            status: response.status,
            error: errorData
          });

          // Return empty array instead of throwing - this allows the form to still work
          // The user can manually type values if needed
          return [];
        }

        const result = await response.json();
        const options = result.data || [];

        logger.debug(`📊 [loadDynamicFieldOptions] Linked table response for ${linkedTableName}:`, {
          status: response.status,
          dataCount: options.length,
          firstOption: options[0]
        });

        const formattedOptions = options.map((option: any) => ({
          value: option.value || option.id,
          label: option.label || option.name || option.value
        }));

        // Store in cache
        const ttl = getFieldTTL(fieldName);
        cacheStore.set(cacheKey, formattedOptions, ttl);
        logger.debug(`💾 [Airtable] Cached ${formattedOptions.length} options for ${fieldName} (TTL: ${ttl / 1000}s)`);

        return formattedOptions;
      } catch (error) {
        logger.error(`❌ [Airtable] Error loading linked records from ${linkedTableName}:`, error);
        // Return empty array so form still works - user can type values manually
        return [];
      }
    }

    // For regular fields, use the existing data handlers
    try {
      const response = await fetch('/api/integrations/airtable/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType,
          options: {
            baseId,
            tableName
          },
          forceRefresh
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(`Failed to load ${dataType}: ${response.status}`);
      }

      const result = await response.json();
      const options = result.data || [];

      logger.debug(`📊 [loadDynamicFieldOptions] Regular field response for ${dataType}:`, {
        status: response.status,
        dataCount: options.length,
        firstOption: options[0]
      });

      const formattedOptions = options.map((option: any) => ({
        value: option.value || option.id,
        label: option.label || option.name || option.value
      }));

      // Store in cache
      const ttl = getFieldTTL(fieldName);
      cacheStore.set(cacheKey, formattedOptions, ttl);
      logger.debug(`💾 [Airtable] Cached ${formattedOptions.length} options for ${fieldName} (TTL: ${ttl / 1000}s)`);

      return formattedOptions;
    } catch (error) {
      logger.error(`❌ [Airtable] Error loading ${dataType}:`, error);
      return [];
    }
  }

  private async loadFieldValues(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { dependsOnValue: filterField, extraOptions, integrationId, signal, forceRefresh } = params;

    if (!filterField || !integrationId) {
      logger.debug('🔍 [Airtable] Cannot load field values without filterField and integrationId');
      return [];
    }

    const baseId = extraOptions?.baseId;
    const tableName = extraOptions?.tableName;

    if (!baseId || !tableName) {
      logger.debug('🔍 [Airtable] Cannot load field values without baseId and tableName');
      return [];
    }

    // Build cache key
    const cacheKey = buildCacheKey('airtable', integrationId, 'filterValue', { baseId, tableName, filterField });
    const cacheStore = useConfigCacheStore.getState();

    // Force refresh handling
    if (forceRefresh) {
      logger.debug(`🔄 [Airtable] Force refresh - invalidating cache:`, cacheKey);
      cacheStore.invalidate(cacheKey);
    }

    // Try cache first
    if (!forceRefresh) {
      const cached = cacheStore.get(cacheKey);
      if (cached) {
        logger.debug(`💾 [Airtable] Cache HIT for filterValue:`, { cacheKey, count: cached.length });
        return cached;
      }
      logger.debug(`❌ [Airtable] Cache MISS for filterValue:`, { cacheKey });
    }

    try {
      // Load records to extract unique field values
      const response = await fetch('/api/integrations/airtable/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: 'airtable_records',
          options: {
            baseId,
            tableName,
            maxRecords: 100
          },
          forceRefresh
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(`Failed to load records for field values: ${response.status}`);
      }

      const result = await response.json();
      const records = result.data || [];

      // Extract unique values for the selected field
      const fieldValues = new Map<string, string>();

      records.forEach((record: any) => {
        const value = record.fields?.[filterField];
        if (value != null) {
          if (Array.isArray(value)) {
            value.forEach(item => {
              const strValue = typeof item === 'object' ? (item.name || String(item)) : String(item);
              fieldValues.set(strValue, strValue);
            });
          } else {
            const strValue = typeof value === 'object' ? (value.name || String(value)) : String(value);
            fieldValues.set(strValue, strValue);
          }
        }
      });

      const formattedValues = Array.from(fieldValues.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({
          value,
          label
        }));

      // Store in cache
      const ttl = getFieldTTL('filterValue');
      cacheStore.set(cacheKey, formattedValues, ttl);
      logger.debug(`💾 [Airtable] Cached ${formattedValues.length} options for filterValue (TTL: ${ttl / 1000}s)`);

      return formattedValues;
    } catch (error) {
      logger.error('❌ [Airtable] Error loading field values:', error);
      return [];
    }
  }

  /**
   * Load search field values for Find Record action
   * Returns field options for select fields, or empty array for text fields (allowing freeform input)
   */
  private async loadSearchFieldValues(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { dependsOnValue: searchField, extraOptions, integrationId, signal, forceRefresh } = params;

    if (!searchField || !integrationId) {
      logger.debug('🔍 [Airtable] Cannot load search field values without searchField and integrationId');
      return [];
    }

    const baseId = extraOptions?.baseId;
    const tableName = extraOptions?.tableName;

    if (!baseId || !tableName) {
      logger.debug('🔍 [Airtable] Cannot load search field values without baseId and tableName');
      return [];
    }

    // First, we need to get the field metadata to check if it's a select field
    // Build cache key for fields
    const fieldsCacheKey = buildCacheKey('airtable', integrationId, 'searchFieldMeta', { baseId, tableName });
    const cacheStore = useConfigCacheStore.getState();

    let fieldMetadata: any = null;

    try {
      // Try to get fields with metadata
      const response = await fetch('/api/integrations/airtable/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: 'airtable_fields',
          options: {
            baseId,
            tableName,
            filterReadOnly: true
          },
          forceRefresh
        }),
        signal
      });

      if (!response.ok) {
        logger.debug('🔍 [Airtable] Failed to load field metadata for searchValue');
        return [];
      }

      const result = await response.json();
      const fields = result.data || [];

      // Find the selected field
      fieldMetadata = fields.find((f: any) => f.value === searchField || f.label === searchField);

      if (!fieldMetadata) {
        logger.debug('🔍 [Airtable] Field not found in metadata:', searchField);
        return [];
      }

      // If field has options (singleSelect or multipleSelects), return them
      if (fieldMetadata.options && Array.isArray(fieldMetadata.options)) {
        logger.debug(`✅ [Airtable] Found ${fieldMetadata.options.length} options for select field "${searchField}"`);

        const formattedOptions = fieldMetadata.options.map((option: any) => ({
          value: option.name,
          label: option.name,
          color: option.color
        }));

        return formattedOptions;
      }

      // For non-select fields, return empty array (allows freeform tags input)
      logger.debug(`🔍 [Airtable] Field "${searchField}" is type "${fieldMetadata.type}" - allowing freeform input`);
      return [];

    } catch (error) {
      logger.error('❌ [Airtable] Error loading search field values:', error);
      return [];
    }
  }

  private async loadRecordsForSelection(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { extraOptions, integrationId, signal, forceRefresh } = params;

    if (!integrationId) {
      logger.debug('🔍 [Airtable] Cannot load records without integrationId');
      return [];
    }

    const baseId = extraOptions?.baseId;
    const tableName = extraOptions?.tableName;

    if (!baseId || !tableName) {
      logger.debug('🔍 [Airtable] Cannot load records without baseId and tableName');
      return [];
    }

    // Build cache key
    const cacheKey = buildCacheKey('airtable', integrationId, 'selectedRecord', { baseId, tableName });
    const cacheStore = useConfigCacheStore.getState();

    // Force refresh handling
    if (forceRefresh) {
      logger.debug(`🔄 [Airtable] Force refresh - invalidating cache:`, cacheKey);
      cacheStore.invalidate(cacheKey);
    }

    // Try cache first
    if (!forceRefresh) {
      const cached = cacheStore.get(cacheKey);
      if (cached) {
        logger.debug(`💾 [Airtable] Cache HIT for selectedRecord:`, { cacheKey, count: cached.length });
        return cached;
      }
      logger.debug(`❌ [Airtable] Cache MISS for selectedRecord:`, { cacheKey });
    }

    try {
      // Load records from the table
      const response = await fetch('/api/integrations/airtable/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: 'airtable_records',
          options: {
            baseId,
            tableName,
            maxRecords: 100 // Load up to 100 records for selection
          },
          forceRefresh
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(`Failed to load records: ${response.status}`);
      }

      const result = await response.json();
      const records = result.data || [];

      // Find the best display field (name, title, or first text field)
      const displayField = this.findDisplayField(records);

      const formattedRecords = records.map((record: any) => {
        let label = record.id; // Fallback to ID

        if (displayField && record.fields?.[displayField]) {
          const displayValue = record.fields[displayField];
          // Create human-readable label with the display field value
          label = `${displayValue}`;

          // Truncate if too long
          if (label.length > 60) {
            label = `${label.substring(0, 57)}...`;
          }
        }

        return {
          value: record.id,
          label: label,
        };
      });

      // Store in cache
      const ttl = getFieldTTL('selectedRecord');
      cacheStore.set(cacheKey, formattedRecords, ttl);
      logger.debug(`💾 [Airtable] Cached ${formattedRecords.length} options for selectedRecord (TTL: ${ttl / 1000}s)`);

      return formattedRecords;
    } catch (error) {
      logger.error('❌ [Airtable] Error loading records for selection:', error);
      return [];
    }
  }

  private async loadAttachmentFields(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { extraOptions, integrationId, signal, forceRefresh } = params;

    if (!integrationId) {
      logger.debug('🔍 [Airtable] Cannot load attachment fields without integrationId');
      return [];
    }

    const baseId = extraOptions?.baseId;
    const tableName = extraOptions?.tableName;

    if (!baseId || !tableName) {
      logger.debug('🔍 [Airtable] Cannot load attachment fields without baseId and tableName');
      return [];
    }

    // Build cache key
    const cacheKey = buildCacheKey('airtable', integrationId, 'attachmentField', { baseId, tableName });
    const cacheStore = useConfigCacheStore.getState();

    // Force refresh handling
    if (forceRefresh) {
      logger.debug(`🔄 [Airtable] Force refresh - invalidating cache:`, cacheKey);
      cacheStore.invalidate(cacheKey);
    }

    // Try cache first
    if (!forceRefresh) {
      const cached = cacheStore.get(cacheKey);
      if (cached) {
        logger.debug(`💾 [Airtable] Cache HIT for attachmentField:`, { cacheKey, count: cached.length });
        return cached;
      }
      logger.debug(`❌ [Airtable] Cache MISS for attachmentField:`, { cacheKey });
    }

    try {
      const response = await fetch('/api/integrations/airtable/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: 'airtable_attachment_fields',
          options: {
            baseId,
            tableName,
            filterReadOnly: true // Filter out non-editable attachment fields
          },
          forceRefresh
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(`Failed to load attachment fields: ${response.status}`);
      }

      const result = await response.json();
      const fields = result.data || [];

      const formattedFields = fields.map((field: any) => ({
        value: field.value || field.name || field.id,
        label: field.label || field.name || field.value,
      }));

      // Store in cache
      const ttl = getFieldTTL('attachmentField');
      cacheStore.set(cacheKey, formattedFields, ttl);
      logger.debug(`💾 [Airtable] Cached ${formattedFields.length} options for attachmentField (TTL: ${ttl / 1000}s)`);

      return formattedFields;
    } catch (error) {
      logger.error('❌ [Airtable] Error loading attachment fields:', error);
      return [];
    }
  }

  private async loadLinkedRecords(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, extraOptions, integrationId, signal, forceRefresh } = params;

    if (!integrationId) {
      logger.debug('🔍 [Airtable] Cannot load linked records without integrationId');
      return [];
    }

    const baseId = extraOptions?.baseId;
    const tableName = extraOptions?.tableName;
    const tableFields = extraOptions?.tableFields;

    if (!baseId || !tableName) {
      logger.debug('🔍 [Airtable] Cannot load linked records without baseId and tableName');
      return [];
    }

    // Extract field name from the prefixed field name (e.g., "airtable_field_Associated Project" -> "Associated Project")
    const actualFieldName = fieldName.replace('airtable_field_', '');

    logger.debug('🔍 [Airtable] Looking for linked field:', {
      fieldName,
      actualFieldName,
      availableFields: tableFields?.map((f: any) => ({ name: f.name, type: f.type, id: f.id }))
    });

    // Find the field configuration from table fields by name
    const tableField = tableFields?.find((f: any) => f.name === actualFieldName);

    if (!tableField || (tableField.type !== 'multipleRecordLinks' && tableField.type !== 'singleRecordLink')) {
      logger.debug('🔍 [Airtable] Field is not a linked record field:', {
        foundField: tableField,
        actualFieldName,
        fieldType: tableField?.type
      });
      return [];
    }

    // Determine the linked table
    const linkedTableId = tableField.options?.linkedTableId;
    const linkedTableName = this.guessLinkedTableName(tableField.name);

    if (!linkedTableId && !linkedTableName) {
      logger.debug('🔍 [Airtable] Cannot determine linked table');
      return [];
    }

    // Build cache key
    const cacheKey = buildCacheKey('airtable', integrationId, fieldName, { baseId, tableName, linkedTableId, linkedTableName });
    const cacheStore = useConfigCacheStore.getState();

    // Force refresh handling
    if (forceRefresh) {
      logger.debug(`🔄 [Airtable] Force refresh - invalidating cache:`, cacheKey);
      cacheStore.invalidate(cacheKey);
    }

    // Try cache first
    if (!forceRefresh) {
      const cached = cacheStore.get(cacheKey);
      if (cached) {
        logger.debug(`💾 [Airtable] Cache HIT for ${fieldName}:`, { cacheKey, count: cached.length });
        return cached;
      }
      logger.debug(`❌ [Airtable] Cache MISS for ${fieldName}:`, { cacheKey });
    }

    try {
      // First get all tables to find the linked table
      const tablesResponse = await fetch('/api/integrations/airtable/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: 'airtable_tables',
          options: { baseId },
          forceRefresh
        }),
        signal
      });

      if (!tablesResponse.ok) {
        throw new Error(`Failed to load tables: ${tablesResponse.status}`);
      }

      const tablesResult = await tablesResponse.json();
      const tables = tablesResult.data || [];
      
      // Find the linked table
      const linkedTable = linkedTableId 
        ? tables.find((t: any) => t.id === linkedTableId)
        : tables.find((t: any) => 
            t.name === linkedTableName || 
            t.name?.toLowerCase() === linkedTableName?.toLowerCase()
          );
      
      if (!linkedTable) {
        logger.debug('🔍 [Airtable] Linked table not found');
        return [];
      }

      // Load records from the linked table
      const recordsResponse = await fetch('/api/integrations/airtable/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: 'airtable_records',
          options: {
            baseId,
            tableName: linkedTable.name || linkedTable.value,
            maxRecords: 100
          },
          forceRefresh
        }),
        signal
      });

      if (!recordsResponse.ok) {
        throw new Error(`Failed to load linked records: ${recordsResponse.status}`);
      }

      const recordsResult = await recordsResponse.json();
      const records = recordsResult.data || [];

      // Find the best display field
      const displayField = this.findDisplayField(records);

      const formattedRecords = records.map((record: any) => {
        let label = record.id;
        let actualValue = record.id;

        if (displayField && record.fields?.[displayField]) {
          label = String(record.fields[displayField]);
          // Store both ID and name for filtering
          actualValue = `${record.id}::${label}`;

          if (label.length > 50) {
            label = `${label.substring(0, 47) }...`;
          }
        }

        return {
          value: actualValue,
          label: label,
          recordId: record.id
        };
      });

      // Store in cache
      const ttl = getFieldTTL(fieldName);
      cacheStore.set(cacheKey, formattedRecords, ttl);
      logger.debug(`💾 [Airtable] Cached ${formattedRecords.length} options for ${fieldName} (TTL: ${ttl / 1000}s)`);

      return formattedRecords;
    } catch (error) {
      logger.error('❌ [Airtable] Error loading linked records:', error);
      return [];
    }
  }

  private guessLinkedTableName(fieldName: string): string | null {
    const fieldNameLower = (fieldName || '').toLowerCase();
    
    if (fieldNameLower.includes('project')) return 'Projects';
    if (fieldNameLower.includes('task')) return 'Tasks';
    if (fieldNameLower.includes('feedback')) return 'Feedback';
    if (fieldNameLower.includes('user') || fieldNameLower.includes('assignee')) return 'Users';
    if (fieldNameLower.includes('customer') || fieldNameLower.includes('client')) return 'Customers';
    
    return null;
  }

  private findDisplayField(records: any[]): string | null {
    if (records.length === 0) return null;
    
    const sampleFields = Object.keys(records[0].fields || {});
    
    // Priority order for display fields
    return sampleFields.find(field => 
      field.toLowerCase().includes('name') || 
      field.toLowerCase().includes('title')
    ) || sampleFields.find(field => 
      field.toLowerCase().includes('id') && 
      !field.toLowerCase().includes('modified') && 
      !field.toLowerCase().includes('created')
    ) || sampleFields.find(field => {
      const value = records[0].fields[field];
      return value && (typeof value === 'string' || typeof value === 'number') && 
             !Array.isArray(value);
    });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    const cacheStore = useConfigCacheStore.getState();
    cacheStore.invalidateProvider('airtable');

    logger.debug('🧹 [Airtable] Cache cleared');
  }

  getFieldDependencies(fieldName: string): string[] {
    // Handle dynamic Airtable fields with prefix
    if (fieldName.startsWith('airtable_field_')) {
      const actualFieldName = fieldName.replace('airtable_field_', '').toLowerCase();

      // Check if it's one of our special dropdown fields
      if (actualFieldName.includes('draft name') ||
          actualFieldName.includes('designer') ||
          actualFieldName.includes('associated project') ||
          actualFieldName.includes('feedback') ||
          actualFieldName.includes('tasks')) {
        return ['tableName'];
      }

      // All other dynamic fields depend on tableName
      return ['tableName'];
    }

    switch (fieldName) {
      case 'tableName':
        return ['baseId'];

      case 'filterField':
        return ['tableName'];

      case 'filterValue':
        return ['filterField'];

      case 'draftName':
      case 'designer':
      case 'associatedProject':
      case 'feedback':
      case 'tasks':
      case 'selectedRecord':
      case 'attachmentField':
        return ['tableName'];

      default:
        return [];
    }
  }
}