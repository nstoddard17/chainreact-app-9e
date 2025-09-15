"use client"

import { useState, useCallback, useRef, useEffect } from 'react';
import { useIntegrationStore } from "@/stores/integrationStore";
import { loadDiscordGuildsOnce } from '@/stores/discordGuildsCacheStore'
import { loadDiscordChannelsOnce } from '@/stores/discordChannelsCacheStore'
import { DynamicOptionsState } from '../utils/types';
import { getResourceTypeForField } from '../config/fieldMappings';
import { formatOptionsForField } from '../utils/fieldFormatters';

interface UseDynamicOptionsProps {
  nodeType?: string;
  providerId?: string;
  onLoadingChange?: (fieldName: string, isLoading: boolean) => void;
  getFormValues?: () => Record<string, any>;
}

interface DynamicOption {
  value: string
  label: string
  fields?: any[]
  isExisting?: boolean
}

/**
 * Custom hook for managing dynamic field options
 */
// Track auth error retry attempts to prevent infinite loops
let authErrorRetryCount = 0;
const MAX_AUTH_RETRIES = 1;

export const useDynamicOptions = ({ nodeType, providerId, onLoadingChange, getFormValues }: UseDynamicOptionsProps) => {
  // Store callback in ref to avoid dependency issues
  const onLoadingChangeRef = useRef(onLoadingChange);
  onLoadingChangeRef.current = onLoadingChange;
  // State
  const [dynamicOptions, setDynamicOptions] = useState<DynamicOptionsState>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(false);
  
  // Integration store methods
  const { getIntegrationByProvider, loadIntegrationData } = useIntegrationStore();
  
  // Enhanced loading prevention with request deduplication
  const loadingFields = useRef<Set<string>>(new Set());
  const activeRequests = useRef<Map<string, Promise<void>>>(new Map());
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const optionsCache = useRef<Record<string, any>>({});
  // Track request IDs to handle concurrent requests for the same field
  const requestCounter = useRef(0);
  const activeRequestIds = useRef<Map<string, number>>(new Map());
  
  // Cache key generator
  const generateCacheKey = useCallback((fieldName: string, dependentValues?: Record<string, any>) => {
    const dependentStr = dependentValues ? JSON.stringify(dependentValues) : '';
    return `${nodeType}-${fieldName}-${dependentStr}`;
  }, [nodeType]);

  // Reset options for a field
  const resetOptions = useCallback((fieldName: string) => {
    setDynamicOptions(prev => ({
      ...prev,
      [fieldName]: []
    }));
  }, []);
  
  // Load options for a dynamic field with request deduplication
  const loadOptions = useCallback(async (fieldName: string, dependsOn?: string, dependsOnValue?: any, forceRefresh?: boolean, silent?: boolean, extraOptions?: Record<string, any>) => {
    
    if (!nodeType || !providerId) {
      return;
    }
    
    // Auto-detect dependencies for certain fields
    if (fieldName === 'messageId' && !dependsOn) {
      dependsOn = 'channelId';
      // Note: dependsOnValue will be handled below by looking at current form values
    }
    
    // Create a cache key that includes dependencies
    const cacheKey = `${fieldName}-${dependsOn || 'none'}-${dependsOnValue || 'none'}`;
    
    // Generate a unique request ID
    const requestId = ++requestCounter.current;
    
    // Cancel any existing request for this field before starting a new one
    const existingController = abortControllers.current.get(cacheKey);
    if (existingController) {
      existingController.abort();
      abortControllers.current.delete(cacheKey);
    }
    
    // Track the current request ID for this cache key
    activeRequestIds.current.set(cacheKey, requestId);
    
    // Check if there's already an active request for this exact field/dependency combination
    const activeRequestKey = cacheKey;
    if (!forceRefresh && activeRequests.current.has(activeRequestKey)) {
      console.log(`⏳ [useDynamicOptions] Waiting for existing request: ${activeRequestKey}`);
      try {
        await activeRequests.current.get(activeRequestKey);
        // Check if this request is still the most recent one
        if (activeRequestIds.current.get(cacheKey) !== requestId) {
          console.log(`⏭️ [useDynamicOptions] Request ${requestId} superseded, skipping`);
          return;
        }
        return; // Data should now be available
      } catch (error) {
        console.log(`⚠️ [useDynamicOptions] Previous request failed, continuing with new request`);
        // Continue with new request
      }
    }
    
    // Prevent duplicate calls for the same field (unless forcing refresh)
    // But allow if it's been more than 1 second since the field started loading
    const isStaleLoading = loadingFields.current.has(cacheKey) && 
      Date.now() - (loadingFields.current as any).getTime?.(cacheKey) > 1000;
    
    if (!forceRefresh && loadingFields.current.has(cacheKey) && !isStaleLoading) {
      console.log(`🚫 [useDynamicOptions] Skipping duplicate call for ${cacheKey}`);
      return;
    }
    
    // For authorFilter (Discord), only skip if we have data for the specific channel
    if (!forceRefresh && fieldName === 'authorFilter' && dependsOn === 'channelId' && dependsOnValue) {
      const channelSpecificData = dynamicOptions[`${fieldName}_${dependsOnValue}`];
      if (channelSpecificData && channelSpecificData.length > 0) {
        return;
      }
    }
    
    // For other fields, use simple data check (exclude authorFilter since it's channel-specific)
    if (!forceRefresh && fieldName !== 'authorFilter' && dynamicOptions[fieldName] && dynamicOptions[fieldName].length > 0) {
      return;
    }
    // Determine data to load based on field name (moved outside try block for error handling)
    const resourceType = getResourceTypeForField(fieldName, nodeType);
    
    // Create AbortController for this request
    const abortController = new AbortController();
    abortControllers.current.set(cacheKey, abortController);
    
    // Create and store the loading promise to prevent duplicate requests
    const loadingPromise = (async () => {
      // Only set loading states if not in silent mode
      if (!silent) {
        loadingFields.current.add(cacheKey);
        setLoading(true);
        
        // Enhanced logging for channelId loading state
        if (fieldName === 'channelId') {
        }
        
        onLoadingChangeRef.current?.(fieldName, true);
      } else {
        // Silent mode - just log that we're loading silently
        if (fieldName === 'channelId') {
        }
      }

      // Define variables at the beginning of the async function scope
      let integration: any;
      let options: any = {};
      
      try {
      // Special handling for Discord guilds
      if (fieldName === 'guildId' && providerId === 'discord') {
        try {
          // Always force refresh if we're explicitly asked to or if we detect an issue
          const shouldForceRefresh = forceRefresh || false;
          
          const guilds = await loadDiscordGuildsOnce(shouldForceRefresh);
          
          if (!guilds || guilds.length === 0) {
            // Check if we have a Discord integration - if not, this is expected
            const discordIntegration = getIntegrationByProvider('discord');
            
            if (!discordIntegration) {
            } else {
              // Try one more time with force refresh
              const refreshedGuilds = await loadDiscordGuildsOnce(true);
              if (refreshedGuilds && refreshedGuilds.length > 0) {
                const formattedOptions = refreshedGuilds.map(guild => ({
                  value: guild.id,
                  label: guild.name,
                }));
                
                setDynamicOptions(prev => ({
                  ...prev,
                  [fieldName]: formattedOptions
                }));
                return;
              }
            }
            
            setDynamicOptions(prev => ({
              ...prev,
              [fieldName]: []
            }));
            return;
          }
          
          const formattedOptions = guilds.map(guild => ({
            value: guild.id,
            label: guild.name,
          }));
          
          setDynamicOptions(prev => ({
            ...prev,
            [fieldName]: formattedOptions
          }));
        } catch (error: any) {
          
          // If this is an authentication error, we might need to refresh integration state
          if (error.message?.includes('authentication') || error.message?.includes('expired')) {
            console.error('🚨 [useDynamicOptions] AUTH ERROR DETECTED', {
              fieldName,
              error: error.message,
              retryCount: authErrorRetryCount,
              maxRetries: MAX_AUTH_RETRIES,
              timestamp: new Date().toISOString()
            });
            
            // Only retry once to prevent infinite loops
            if (authErrorRetryCount < MAX_AUTH_RETRIES) {
              authErrorRetryCount++;
              console.log('🔄 [useDynamicOptions] Attempting to refresh integrations...');
              try {
                const { useIntegrationStore } = await import('@/stores/integrationStore');
                useIntegrationStore.getState().fetchIntegrations(true);
              } catch (refreshError) {
                console.error('🚨 [useDynamicOptions] Failed to refresh integrations', refreshError);
              }
            } else {
              console.warn('⚠️ [useDynamicOptions] Max auth retries reached, not refreshing integrations');
            }
          }
          
          setDynamicOptions(prev => ({
            ...prev,
            [fieldName]: []
          }));
        } finally {
          // Only clear loading if this is still the current request
          if (activeRequestIds.current.get(cacheKey) === requestId) {
            loadingFields.current.delete(cacheKey);
            setLoading(false);
          }
        }
        return;
      }

      // Special handling for Discord channels using cache store
      if (fieldName === 'channelId' && providerId === 'discord') {
        if (!dependsOnValue) {
          setDynamicOptions(prev => ({
            ...prev,
            [fieldName]: []
          }));
          return;
        }

        
        try {
          const channels = await loadDiscordChannelsOnce(dependsOnValue, forceRefresh || false);
          
          if (!channels || channels.length === 0) {
            setDynamicOptions(prev => ({
              ...prev,
              [fieldName]: []
            }));
            return;
          }
          
          const formattedOptions = channels
            .filter(channel => channel && (channel.id))
            .sort((a, b) => {
              // Sort by position first
              if (a.position !== undefined && b.position !== undefined) {
                return a.position - b.position;
              }
              
              // Default to alphabetical
              const aName = a.name || a.id;
              const bName = b.name || b.id;
              return aName.localeCompare(bName);
            })
            .map(channel => ({
              value: channel.id,
              label: channel.name,
              type: channel.type,
              position: channel.position,
            }));
          
          
          setDynamicOptions(prev => ({
            ...prev,
            [fieldName]: formattedOptions
          }));
        } catch (error: any) {
          
          // If this is an authentication error, we might need to refresh integration state
          if (error.message?.includes('authentication') || error.message?.includes('expired')) {
            console.error('🚨 [useDynamicOptions] AUTH ERROR DETECTED', {
              fieldName,
              error: error.message,
              retryCount: authErrorRetryCount,
              maxRetries: MAX_AUTH_RETRIES,
              timestamp: new Date().toISOString()
            });
            
            // Only retry once to prevent infinite loops
            if (authErrorRetryCount < MAX_AUTH_RETRIES) {
              authErrorRetryCount++;
              console.log('🔄 [useDynamicOptions] Attempting to refresh integrations...');
              try {
                const { useIntegrationStore } = await import('@/stores/integrationStore');
                useIntegrationStore.getState().fetchIntegrations(true);
              } catch (refreshError) {
                console.error('🚨 [useDynamicOptions] Failed to refresh integrations', refreshError);
              }
            } else {
              console.warn('⚠️ [useDynamicOptions] Max auth retries reached, not refreshing integrations');
            }
          }
          
          setDynamicOptions(prev => ({
            ...prev,
            [fieldName]: []
          }));
        }
        return;
      }

      // Get integration for other providers
      integration = getIntegrationByProvider(providerId);
      
      console.log('🔍 [useDynamicOptions] Looking for integration:', {
        providerId,
        fieldName,
        integrationFound: !!integration,
        integrationId: integration?.id
      });
      
      if (!integration) {
        console.warn('⚠️ [useDynamicOptions] No integration found for provider:', providerId);
        // Clear the field data
        setDynamicOptions(prev => ({
          ...prev,
          [fieldName]: []
        }));
        // Only clear loading if this is still the current request
        if (activeRequestIds.current.get(cacheKey) === requestId) {
          loadingFields.current.delete(cacheKey);
          setLoading(false);
          activeRequestIds.current.delete(cacheKey);
          // Clear loading state via callback
          if (!silent) {
            onLoadingChangeRef.current?.(fieldName, false);
          }
        }
        return;
      }

      // Special handling for dynamic Airtable fields (linked records)
      if (fieldName.startsWith('airtable_field_') && providerId === 'airtable') {
        
        // Get the form values to find the base and linked table info
        const formValues = getFormValues?.() || {};
        const baseId = extraOptions?.baseId || formValues.baseId;
        
        if (!baseId) {
          setDynamicOptions(prev => ({
            ...prev,
            [fieldName]: []
          }));
          // Only clear loading if this is still the current request
          if (activeRequestIds.current.get(cacheKey) === requestId) {
            loadingFields.current.delete(cacheKey);
            setLoading(false);
            activeRequestIds.current.delete(cacheKey);
          }
          return;
        }
        
        // Use tableFields from extraOptions if provided, otherwise try to get from cache
        let tableFields = extraOptions?.tableFields;
        
        if (!tableFields) {
          // Fallback to trying to get from cache
          const selectedTable = optionsCache.current.tableName?.find((table: any) => 
            table.value === formValues.tableName
          ) || dynamicOptions?.tableName?.find((table: any) => 
            table.value === formValues.tableName
          );
          
          tableFields = selectedTable?.fields;
        }
        
        if (!tableFields) {
          setDynamicOptions(prev => ({
            ...prev,
            [fieldName]: []
          }));
          // Only clear loading if this is still the current request
          if (activeRequestIds.current.get(cacheKey) === requestId) {
            loadingFields.current.delete(cacheKey);
            setLoading(false);
            activeRequestIds.current.delete(cacheKey);
          }
          return;
        }
        
        // Find the field configuration by name (not ID)
        // The field name is "airtable_field_Associated Project" so we extract "Associated Project"
        const actualFieldName = fieldName.replace('airtable_field_', '');
        const tableField = tableFields.find((f: any) => f.name === actualFieldName);
        
        
        if (!tableField || (tableField.type !== 'multipleRecordLinks' && tableField.type !== 'singleRecordLink')) {
          // Only clear loading if this is still the current request
          if (activeRequestIds.current.get(cacheKey) === requestId) {
            loadingFields.current.delete(cacheKey);
            setLoading(false);
            activeRequestIds.current.delete(cacheKey);
          }
          return;
        }
        
        // Get the linked table ID from field options
        const linkedTableId = tableField.options?.linkedTableId;
        let linkedTableName: string | null = null;
        
        // If no linkedTableId, try to guess the table name from the field name
        if (!linkedTableId) {
          
          // Try to guess the linked table name from the field name
          const fieldNameLower = (tableField.name || '').toLowerCase();
          
          // Check for common patterns
          if (fieldNameLower.includes('project')) {
            linkedTableName = 'Projects';
          } else if (fieldNameLower.includes('task')) {
            linkedTableName = 'Tasks';
          } else if (fieldNameLower.includes('feedback')) {
            linkedTableName = 'Feedback';
          } else if (fieldNameLower.includes('user') || fieldNameLower.includes('assignee')) {
            linkedTableName = 'Users';
          } else if (fieldNameLower.includes('customer') || fieldNameLower.includes('client')) {
            linkedTableName = 'Customers';
          } else if (fieldNameLower.includes('team')) {
            linkedTableName = 'Teams';
          } else if (fieldNameLower.includes('company') || fieldNameLower.includes('organization')) {
            linkedTableName = 'Companies';
          } else {
            // Default fallback: Try to make it plural
            // Remove common suffixes and add 's'
            let baseName = tableField.name
              .replace(/^Associated\s*/i, '')  // Remove "Associated" prefix
              .replace(/\s*Links?$/i, '')      // Remove "Link" or "Links" suffix
              .replace(/\s*Records?$/i, '');   // Remove "Record" or "Records" suffix
            
            // Make it plural if not already
            if (!baseName.match(/s$/i)) {
              linkedTableName = baseName + 's';
            } else {
              linkedTableName = baseName;
            }
            
          }
          
        }
        
        
        try {
          // We need to find the table name from the linked table ID
          // First, get all tables for this base
          const tablesResponse = await fetch('/api/integrations/airtable/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              integrationId: integration.id,
              dataType: 'airtable_tables',
              options: { baseId }
            }),
            signal: abortController.signal
          });
          
          if (!tablesResponse.ok) {
            throw new Error(`Failed to load tables: ${tablesResponse.status}`);
          }
          
          const tablesResult = await tablesResponse.json();
          const tables = tablesResult.data || [];
          
          // Find the linked table by ID or name
          let linkedTable: any = null;
          
          if (linkedTableId) {
            linkedTable = tables.find((table: any) => table.id === linkedTableId);
            if (!linkedTable) {
            }
          }
          
          // If not found by ID, try by name (from guessing)
          if (!linkedTable && linkedTableName) {
            linkedTable = tables.find((table: any) => 
              table.name === linkedTableName || 
              table.value === linkedTableName ||
              table.name?.toLowerCase() === linkedTableName.toLowerCase()
            );
            if (linkedTable) {
            }
          }
          
          if (!linkedTable) {
            setDynamicOptions(prev => ({
              ...prev,
              [fieldName]: []
            }));
            // Only clear loading if this is still the current request
            if (activeRequestIds.current.get(cacheKey) === requestId) {
              loadingFields.current.delete(cacheKey);
              setLoading(false);
              activeRequestIds.current.delete(cacheKey);
            }
            return;
          }
          
          
          // Load records from the linked table using its name
          const recordsResponse = await fetch('/api/integrations/airtable/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              integrationId: integration.id,
              dataType: 'airtable_records',
              options: {
                baseId,
                tableName: linkedTable.name || linkedTable.value,
                limit: 100
              }
            }),
            signal: abortController.signal
          });

          if (!recordsResponse.ok) {
            throw new Error(`Failed to load linked records: ${recordsResponse.status}`);
          }

          const recordsResult = await recordsResponse.json();
          const records = recordsResult.data || [];
          
          
          // Determine the best field to use for display
          let displayField: string | null = null;
          let sampleFields: string[] = [];
          
          if (records.length > 0) {
            sampleFields = Object.keys(records[0].fields || {});
            
            // Priority order for finding display field (same logic as ConfigurationForm.tsx):
            // 1. Fields containing 'name' or 'title'
            // 2. Fields containing 'id' (but not created/modified timestamps)
            // 3. First string/number field found
            displayField = sampleFields.find(field => 
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
            }) || null;
            
          }
          
          // Format records as options
          const formattedOptions = records.map((record: any) => {
            let label = record.id; // Default to ID if no better field found
            let actualValue = record.id; // Default to using record ID
            
            if (displayField && record.fields?.[displayField]) {
              const fieldValue = record.fields[displayField];
              // Only use the field if it's not just an ID field (unless it's the only option)
              if (displayField.toLowerCase() !== 'id' || !sampleFields.some(f => 
                f.toLowerCase().includes('name') || f.toLowerCase().includes('title')
              )) {
                label = String(fieldValue);
                // For linked fields, we'll use the name as the value for filtering
                // Store both ID and name - use name for filtering
                actualValue = `${record.id}::${label}`; // Store both with separator
                
                // Truncate label if too long
                if (label.length > 50) {
                  label = label.substring(0, 47) + '...';
                }
              }
            }
            
            return {
              value: record.id, // Use the actual record ID as the value
              label: label,
              recordId: record.id, // Keep the actual record ID separately for reference
              searchValue: label // Add searchable text for better filtering
            };
          });
          
          
          // Check if this is still the current request
          if (activeRequestIds.current.get(cacheKey) !== requestId) {
            return;
          }
          
          setDynamicOptions(prev => ({
            ...prev,
            [fieldName]: formattedOptions
          }));
        } catch (error: any) {
          setDynamicOptions(prev => ({
            ...prev,
            [fieldName]: []
          }));
        } finally {
          // Only clear loading if this is still the current request
          if (activeRequestIds.current.get(cacheKey) === requestId) {
            loadingFields.current.delete(cacheKey);
            setLoading(false);
          }
        }
        return;
      }

      
      // Check for provider-specific loader first (for providers like HubSpot)
      if (providerId === 'hubspot') {
        
        try {
          // Import provider registry
          const { providerRegistry } = await import('../providers/registry');
          const loader = providerRegistry.getLoader(providerId, fieldName);
          
          if (loader) {
            
            const formattedOptions = await loader.loadOptions({
              fieldName,
              nodeType,
              providerId,
              integrationId: integration.id,
              dependsOn,
              dependsOnValue,
              forceRefresh,
              extraOptions
            });
            
            // Check if this is still the current request
            if (activeRequestIds.current.get(cacheKey) !== requestId) {
              return;
            }
            
            setDynamicOptions(prev => ({
              ...prev,
              [fieldName]: formattedOptions
            }));
            
            // Clear loading state
            if (activeRequestIds.current.get(cacheKey) === requestId) {
              loadingFields.current.delete(cacheKey);
              setLoading(false);
              activeRequestIds.current.delete(cacheKey);
              if (!silent) {
                onLoadingChangeRef.current?.(fieldName, false);
              }
            }
            
            return;
          }
        } catch (error) {
          // Fall through to use regular integration data loading
        }
      }
      
      if (!resourceType) {
        // Only warn for fields that are expected to have dynamic options but don't
        const expectedDynamicFields = ['guildId', 'channelId', 'roleId', 'userId', 'boardId', 'baseId', 'tableId', 'workspaceId'];
        if (expectedDynamicFields.includes(fieldName)) {
        } else {
        }
        // Only clear loading if this is still the current request
        if (activeRequestIds.current.get(cacheKey) === requestId) {
          loadingFields.current.delete(cacheKey);
          setLoading(false);
          activeRequestIds.current.delete(cacheKey);
        }
        return;
      }

      // Load integration data with proper options
      options = dependsOn && dependsOnValue ? { [dependsOn]: dependsOnValue } : {};
      
      // Special handling for Notion page blocks - API expects pageId instead of page
      if (resourceType === 'notion_page_blocks' && dependsOn === 'page') {
        const formValues = getFormValues?.() || {};
        options = { 
          pageId: dependsOnValue,
          workspace: formValues.workspace // Include workspace for proper token selection
        };
      }
      
      // For Google Sheets sheets, don't call API without spreadsheetId
      if (fieldName === 'sheetName' && resourceType === 'google-sheets_sheets' && !dependsOnValue) {
        return;
      }
      
      // For Airtable fields, use records approach instead of schema API
      if (fieldName === 'filterField' && resourceType === 'airtable_fields') {
        if (!dependsOnValue) {
          return;
        }
        // Get baseId from extraOptions first (passed explicitly), then form values
        let baseId = extraOptions?.baseId;
        if (!baseId) {
          const formValues = getFormValues?.() || {};
          baseId = formValues.baseId;
        }
        if (!baseId) {
          return;
        }
        
        
        // Use the same approach as preview records to get field names
        try {
          const recordsResponse = await fetch('/api/integrations/airtable/data', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              integrationId: integration.id,
              dataType: 'airtable_records',
              options: {
                baseId,
                tableName: dependsOnValue,
                limit: 5
              }
            }),
            signal: abortController.signal
          });

          if (!recordsResponse.ok) {
            const errorData = await recordsResponse.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to load records: ${recordsResponse.status}`);
          }

          const recordsResult = await recordsResponse.json();
          const records = recordsResult.data || [];
          
          
          // Extract field names from the first record
          const fieldNames = records.length > 0 ? Object.keys(records[0]?.fields || {}) : [];
          
          
          // Format as field options
          const fieldOptions = fieldNames.map(name => ({
            value: name,
            label: name,
            type: 'text', // We don't have type info from records, so default to text
            id: name
          }));
          
          
          // Check if this is still the current request
          if (activeRequestIds.current.get(cacheKey) !== requestId) {
            return;
          }
          
          const formattedOptions = formatOptionsForField(fieldName, fieldOptions);
          const updateObject = { [fieldName]: formattedOptions };
          
          setDynamicOptions(prev => ({
            ...prev,
            ...updateObject
          }));
          
          return; // Skip the normal loadIntegrationData call
        } catch (error: any) {
          throw error; // Re-throw to be caught by the outer catch block
        }
      }
      
      // For Airtable field values, use records approach to get unique field values
      if (fieldName === 'filterValue' && resourceType === 'airtable_field_values') {
        if (!dependsOnValue) {
          return;
        }
        
        // Get baseId and tableName from extraOptions first (passed explicitly), then form values
        let baseId = extraOptions?.baseId;
        let tableName = extraOptions?.tableName;
        
        if (!baseId || !tableName) {
          const formValues = getFormValues?.() || {};
          baseId = baseId || formValues.baseId;
          tableName = tableName || formValues.tableName;
        }
        
        if (!baseId || !tableName) {
          return;
        }
        
        
        // Check if this is a linked record field based on field name patterns
        // Since the API is failing, we'll detect based on common naming patterns
        let isLinkedRecordField = false;
        let linkedTableName = '';
        
        // Common patterns for linked record fields
        const linkedFieldPatterns = [
          'associated', 'linked', 'related', 'project', 'task', 'feedback', 
          'user', 'assignee', 'customer', 'client', 'owner', 'created by'
        ];
        
        const fieldNameLower = dependsOnValue.toLowerCase();
        const mightBeLinkedField = linkedFieldPatterns.some(pattern => fieldNameLower.includes(pattern));
        
        if (mightBeLinkedField) {
          // First, do a quick check on the actual data to see if it contains record IDs
          const recordsResponse = await fetch('/api/integrations/airtable/data', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              integrationId: integration.id,
              dataType: 'airtable_records',
              options: {
                baseId,
                tableName,
                limit: 3
              }
            })
          });

          if (recordsResponse.ok) {
            const recordsResult = await recordsResponse.json();
            const sampleRecords = recordsResult.data || [];
            
            // Check if this is still the current request
            if (activeRequestIds.current.get(cacheKey) !== requestId) {
              return;
            }
            
            // Check if the field contains record IDs (starting with 'rec')
            if (sampleRecords.length > 0) {
              const sampleValue = sampleRecords[0].fields?.[dependsOnValue];
              if (sampleValue) {
                const isRecordId = (val: any) => typeof val === 'string' && val.startsWith('rec');
                
                if (Array.isArray(sampleValue)) {
                  isLinkedRecordField = sampleValue.some(isRecordId);
                } else {
                  isLinkedRecordField = isRecordId(sampleValue);
                }
              }
            }
          }
          
          if (isLinkedRecordField) {
            // Try to guess the linked table name
            if (fieldNameLower.includes('project')) {
              linkedTableName = 'Projects';
            } else if (fieldNameLower.includes('task')) {
              linkedTableName = 'Tasks';
            } else if (fieldNameLower.includes('feedback')) {
              linkedTableName = 'Feedback';
            } else if (fieldNameLower.includes('user') || fieldNameLower.includes('assignee')) {
              linkedTableName = 'Users';
            } else if (fieldNameLower.includes('customer') || fieldNameLower.includes('client')) {
              linkedTableName = 'Customers';
            } else {
              // Default: try plural form of the field name
              const baseName = dependsOnValue.replace(/^(associated|linked|related)\s*/i, '');
              linkedTableName = baseName.replace(/s?$/, 's');
            }
          }
        }
        
        // Use the same approach as preview records to get field values
        try {
          const recordsResponse = await fetch('/api/integrations/airtable/data', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              integrationId: integration.id,
              dataType: 'airtable_records',
              options: {
                baseId,
                tableName: dependsOnValue,
                limit: 5
              }
            }),
            signal: abortController.signal
          });

          if (!recordsResponse.ok) {
            const errorData = await recordsResponse.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to load records for field values: ${recordsResponse.status}`);
          }

          const recordsResult = await recordsResponse.json();
          const records = recordsResult.data || [];
          
          // Check if this is still the current request
          if (activeRequestIds.current.get(cacheKey) !== requestId) {
            return;
          }
          
          
          // Extract unique values from the selected field
          const fieldValues = new Map<string, string>(); // Use Map to store value -> label
          const recordIds = new Set<string>(); // Track unique record IDs for linked fields
          
          records.forEach((record: any) => {
            const value = record.fields?.[dependsOnValue];
            if (value != null) {
              // Handle different field types
              if (Array.isArray(value)) {
                // Multi-select or linked records - add each item
                value.forEach(item => {
                  if (typeof item === 'string') {
                    if (isLinkedRecordField && item.startsWith('rec')) {
                      // This is a linked record ID
                      recordIds.add(item);
                    } else {
                      fieldValues.set(item, item);
                    }
                  } else if (typeof item === 'object' && item.name) {
                    fieldValues.set(item.id || item.name, item.name);
                  } else {
                    const strValue = String(item);
                    fieldValues.set(strValue, strValue);
                  }
                });
              } else if (typeof value === 'object' && value.name) {
                // Single linked record
                fieldValues.set(value.id || value.name, value.name);
              } else {
                // Simple field types (text, number, etc.)
                const strValue = String(value);
                if (isLinkedRecordField && strValue.startsWith('rec')) {
                  // This is a linked record ID
                  recordIds.add(strValue);
                } else {
                  fieldValues.set(strValue, strValue);
                }
              }
            }
          });
          
          // If we have linked record IDs, fetch their names
          if (isLinkedRecordField && recordIds.size > 0 && linkedTableName) {
            
            try {
              const linkedResponse = await fetch('/api/integrations/airtable/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  integrationId: integration.id,
                  dataType: 'airtable_records',
                  options: {
                    baseId,
                    tableName: linkedTableName,
                    limit: 100
                  }
                })
              });
              
              if (linkedResponse.ok) {
                const linkedResult = await linkedResponse.json();
                const linkedRecords = linkedResult.data || [];
                
                // Check if this is still the current request
                if (activeRequestIds.current.get(cacheKey) !== requestId) {
                  return;
                }
                
                
                // Find the best field to use for display
                let displayField: string | null = null;
                if (linkedRecords.length > 0) {
                  const sampleFields = Object.keys(linkedRecords[0].fields || {});
                  
                  // Priority order for finding display field
                  displayField = sampleFields.find(field => 
                    field.toLowerCase().includes('name') || 
                    field.toLowerCase().includes('title')
                  ) || sampleFields.find(field => 
                    field.toLowerCase().includes('id') && 
                    !field.toLowerCase().includes('created') && 
                    !field.toLowerCase().includes('modified')
                  ) || sampleFields[0];
                  
                }
                
                // Map record IDs to their display names
                linkedRecords.forEach((record: any) => {
                  if (recordIds.has(record.id) && displayField) {
                    const displayValue = record.fields[displayField];
                    if (displayValue) {
                      // For filtering, use the record ID as the value and name as the label
                      const nameValue = String(displayValue);
                      fieldValues.set(record.id, nameValue);
                    }
                  }
                });
              }
            } catch (error) {
              // Fall back to using record IDs
              recordIds.forEach(id => fieldValues.set(id, id));
            }
          }
          
          
          // Format as field value options
          const valueOptions = Array.from(fieldValues.entries())
            .sort((a, b) => a[1].localeCompare(b[1])) // Sort by label alphabetically
            .map(([value, label]) => ({
              value: value,
              label: label
            }));
          
          
          // Check if this is still the current request
          if (activeRequestIds.current.get(cacheKey) !== requestId) {
            return;
          }
          
          const formattedOptions = formatOptionsForField(fieldName, valueOptions);
          const updateObject = { [fieldName]: formattedOptions };
          
          setDynamicOptions(prev => ({
            ...prev,
            ...updateObject
          }));
          
          return; // Skip the normal loadIntegrationData call
        } catch (error: any) {
          throw error; // Re-throw to be caught by the outer catch block
        }
      }
      // Check session storage for cached templates (for fields that support caching)
      let formattedOptions: any[] = [];
      let dataFetched = false;
      
      if (resourceType === 'trello_board_templates' && !forceRefresh) {
        // Try to get from session storage
        const sessionCacheKey = `chainreact_cache_${resourceType}`;
        try {
          const cached = sessionStorage.getItem(sessionCacheKey);
          if (cached) {
            const parsedCache = JSON.parse(cached);
            // Check if cache is less than 1 hour old
            if (parsedCache.timestamp && Date.now() - parsedCache.timestamp < 3600000) {
              console.log('📦 [useDynamicOptions] Using cached board templates');
              formattedOptions = parsedCache.data;
              dataFetched = true;
            }
          }
        } catch (e) {
          console.warn('Failed to read from session storage:', e);
        }
      }
      
      // If not cached or cache disabled, fetch from API
      if (!dataFetched) {
        const result = await loadIntegrationData(resourceType, integration.id, options, forceRefresh);
        
        // Check if this is still the current request
        // This is crucial because loadIntegrationData might not support abort signals
        if (activeRequestIds.current.get(cacheKey) !== requestId) {
          // Special handling for fields that should always use fresh data when available
          // Include Slack channels and Trello boards since they're critical for actions
          if (fieldName === 'authorFilter' || 
              fieldName === 'channel' || 
              resourceType === 'slack_channels' ||
              fieldName === 'boardId' ||
              resourceType === 'trello_boards') {
            console.log(`✅ [useDynamicOptions] Using fresh data for ${fieldName} despite superseded request`);
            // Continue to update state for these critical fields
          } else {
            console.log(`⏭️ [useDynamicOptions] Request ${requestId} superseded for ${fieldName}, skipping state update`);
            return; // Don't update state if this request was superseded for other fields
          }
        }
        
        // Format the results - extract data array from response object if needed
        const dataArray = result.data || result;
        formattedOptions = formatOptionsForField(fieldName, dataArray);
        
        // Cache board templates in session storage
        if (resourceType === 'trello_board_templates' && formattedOptions.length > 0) {
          const sessionCacheKey = `chainreact_cache_${resourceType}`;
          try {
            sessionStorage.setItem(sessionCacheKey, JSON.stringify({
              data: formattedOptions,
              timestamp: Date.now()
            }));
            console.log('💾 [useDynamicOptions] Cached board templates to session storage');
          } catch (e) {
            console.warn('Failed to write to session storage:', e);
          }
        }
      }
      
      // Log successful data formatting for critical fields
      if (fieldName === 'channel' || resourceType === 'slack_channels') {
        console.log(`📊 [useDynamicOptions] Formatted ${fieldName} options:`, {
          fieldName,
          resourceType,
          optionsCount: formattedOptions.length,
          sampleOptions: formattedOptions.slice(0, 3).map((opt: any) => opt.label)
        });
      }
      
      // Special handling for Discord channels - if empty and we have a guildId, it likely means bot is not in server
      if (fieldName === 'channelId' && resourceType === 'discord_channels' && 
          formattedOptions.length === 0 && dependsOnValue) {
        throw new Error('Bot not added to server - no channels available');
      }
      
      // Update dynamic options - store both general and dependency-specific data
      const updateObject: any = { [fieldName]: formattedOptions };
      
      // For dependent fields, also store with dependency-specific key for better caching
      if (dependsOn && dependsOnValue) {
        updateObject[`${fieldName}_${dependsOnValue}`] = formattedOptions;
      }
      
      setDynamicOptions(prev => {
        const updated = {
          ...prev,
          ...updateObject
        };
        
        // Log state update for critical fields
        if (fieldName === 'channel' || resourceType === 'slack_channels') {
          console.log(`✅ [useDynamicOptions] Updated state for ${fieldName}:`, {
            fieldName,
            hadPrevious: !!prev[fieldName],
            previousCount: prev[fieldName]?.length || 0,
            newCount: formattedOptions.length
          });
        }
        
        return updated;
      });
      
      // Clear loading state on successful completion
      // For authorFilter, always clear the loading state when we have data
      if (fieldName === 'authorFilter') {
        loadingFields.current.delete(cacheKey);
        setLoading(false);
        
        // Clean up the abort controller and request ID
        abortControllers.current.delete(cacheKey);
        activeRequestIds.current.delete(cacheKey);
        
        // Clear loading state via callback
        if (!silent) {
          onLoadingChangeRef.current?.(fieldName, false);
        }
      } else if (activeRequestIds.current.get(cacheKey) === requestId) {
        // For other fields, only clear if this is still the current request
        loadingFields.current.delete(cacheKey);
        setLoading(false);
        
        // Clean up the abort controller and request ID since we're done
        abortControllers.current.delete(cacheKey);
        activeRequestIds.current.delete(cacheKey);
        
        // Only clear loading states if not in silent mode
        if (!silent) {
          if (fieldName === 'tableName') {
          }
          onLoadingChangeRef.current?.(fieldName, false);
        }
      } else {
      }
      
    } catch (error: any) {
      // Check if the error was due to abort
      if (error.name === 'AbortError') {
        // Don't update state or clear loading for aborted requests
        // The loading state should persist until the new request completes
        return;
      }
      
      // Get the integration if available for error logging
      const currentIntegration = getIntegrationByProvider(providerId);
      
      setDynamicOptions(prev => ({
        ...prev,
        [fieldName]: []
      }));
      
      // Don't clear loading state here - it's handled in the finally block
      // This prevents duplicate cleanup and ensures consistency
    } finally {
      // Always clean up loading state and request tracking
      // This ensures loading state doesn't get stuck even if there's an error
      if (activeRequestIds.current.get(cacheKey) === requestId) {
        // Only clear if this is still the current request
        loadingFields.current.delete(cacheKey);
        setLoading(false);
        
        // Clean up tracking
        abortControllers.current.delete(cacheKey);
        activeRequestIds.current.delete(cacheKey);
        
        // Clear loading state via callback if not in silent mode
        if (!silent) {
          onLoadingChangeRef.current?.(fieldName, false);
        }
      }
    }
    })();
    
    // Store the promise to prevent duplicate requests
    activeRequests.current.set(activeRequestKey, loadingPromise);
    
    try {
      await loadingPromise;
    } finally {
      // Clean up the request tracking
      activeRequests.current.delete(activeRequestKey);
    }
  }, [nodeType, providerId, getIntegrationByProvider, loadIntegrationData]);
  
  // Track previous values to avoid unnecessary clears
  const prevNodeTypeRef = useRef(nodeType);
  const prevProviderIdRef = useRef(providerId);

  // Clear all options when node type changes
  useEffect(() => {
    // Only clear if values actually changed
    if (prevNodeTypeRef.current === nodeType && prevProviderIdRef.current === providerId) {
      return;
    }
    
    
    // Update refs
    prevNodeTypeRef.current = nodeType;
    prevProviderIdRef.current = providerId;
    
    // Abort all active fetch requests EXCEPT Discord guilds (they're cached globally)
    abortControllers.current.forEach((controller, key) => {
      // Don't abort Discord guild requests as they're cached and reusable
      if (!key.startsWith('guildId')) {
        controller.abort();
      }
    });
    
    // Clear abort controllers except for Discord guilds
    const guildControllers = new Map();
    abortControllers.current.forEach((controller, key) => {
      if (key.startsWith('guildId')) {
        guildControllers.set(key, controller);
      }
    });
    abortControllers.current = guildControllers;
    
    // Clear request IDs except for Discord guilds
    const guildRequestIds = new Map();
    activeRequestIds.current.forEach((id, key) => {
      if (key.startsWith('guildId')) {
        guildRequestIds.set(key, id);
      }
    });
    activeRequestIds.current = guildRequestIds;
    
    // Cancel all active requests except Discord guilds
    const guildRequests = new Map();
    activeRequests.current.forEach((promise, key) => {
      if (key.startsWith('guildId')) {
        guildRequests.set(key, promise);
      } else {
      }
    });
    activeRequests.current = guildRequests;
    
    // Preserve Discord guild data if provider is still Discord
    const preservedOptions: any = {};
    if (providerId === 'discord' && dynamicOptions.guildId) {
      preservedOptions.guildId = dynamicOptions.guildId;
    }
    
    // Clear everything except preserved options
    setDynamicOptions(preservedOptions);
    
    // Clear loading fields except Discord guilds
    const newLoadingFields = new Set<string>();
    loadingFields.current.forEach(field => {
      if (field.startsWith('guildId')) {
        newLoadingFields.add(field);
      }
    });
    loadingFields.current = newLoadingFields;
    
    setLoading(false);
    setIsInitialLoading(false);
    
    // Clear cached options except Discord guilds
    const newCache: any = {};
    Object.keys(optionsCache.current).forEach(key => {
      if (key.startsWith('guildId')) {
        newCache[key] = optionsCache.current[key];
      }
    });
    optionsCache.current = newCache;
  }, [nodeType, providerId]);

  // Preload independent fields when modal opens
  useEffect(() => {
    if (!nodeType || !providerId) return;

    // Preload fields that don't depend on other fields
    // Note: Exclude email fields (like 'email') since they should load on-demand only
    // Also exclude dependent fields like messageId (depends on channelId), channelId (depends on guildId), etc.
    // Also exclude fields with loadOnMount: true as they are handled by ConfigurationForm
    const independentFields = ['baseId', 'guildId', 'workspaceId'];
    
    independentFields.forEach(fieldName => {
      // Check if this field exists for this node type
      const resourceType = getResourceTypeForField(fieldName, nodeType);
      if (resourceType) {
        loadOptions(fieldName);
      }
    });
    
    // Cleanup function when component unmounts
    return () => {
      
      // Abort all active fetch requests EXCEPT Discord guilds (they're cached globally)
      abortControllers.current.forEach((controller, key) => {
        // Don't abort Discord guild requests as they use global cache
        if (!key.startsWith('guildId')) {
          controller.abort();
        }
      });
      
      // Clear controllers except Discord guilds
      const guildControllers = new Map();
      abortControllers.current.forEach((controller, key) => {
        if (key.startsWith('guildId')) {
          guildControllers.set(key, controller);
        }
      });
      abortControllers.current.clear();
      
      // Clear request IDs except Discord guilds
      const guildRequestIds = new Map();
      activeRequestIds.current.forEach((id, key) => {
        if (key.startsWith('guildId')) {
          guildRequestIds.set(key, id);
        }
      });
      activeRequestIds.current.clear();
      
      // Cancel all active requests except Discord guilds
      activeRequests.current.forEach((promise, key) => {
        if (!key.startsWith('guildId')) {
        }
      });
      
      // Clear all state
      loadingFields.current.clear();
      activeRequests.current.clear();
      optionsCache.current = {};
      setLoading(false);
      setIsInitialLoading(false);
    };
  }, [nodeType, providerId]); // Removed loadOptions from dependencies to prevent loops
  
  return {
    dynamicOptions,
    loading,
    isInitialLoading,
    loadOptions,
    resetOptions,
    setDynamicOptions
  };
};

// Removed getResourceTypeForField - now imported from fieldMappings
// Removed formatOptionsForField - now imported from fieldFormatters

/**
 * Helper to truncate long messages
 */
function truncateMessage(message: string, maxLength = 30): string {
  if (!message) return "";
  return message.length > maxLength
    ? `${message.substring(0, maxLength)}...`
    : message;
}
