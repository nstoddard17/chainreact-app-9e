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
    console.log(`📍 [loadOptions] Called for field:`, { 
      fieldName, 
      nodeType, 
      providerId, 
      dependsOn, 
      dependsOnValue, 
      forceRefresh, 
      silent,
      hasNodeType: !!nodeType,
      hasProviderId: !!providerId
    });
    
    // Add specific logging for troubleshooting Discord fields
    if (fieldName === 'authorFilter' || fieldName === 'channelId') {
      console.log(`🔄 [loadOptions] ${fieldName} called:`, { fieldName, nodeType, providerId, dependsOn, dependsOnValue, forceRefresh, silent, timestamp: new Date().toISOString() });
    }
    
    if (!nodeType || !providerId) {
      console.warn('⚠️ [loadOptions] Missing nodeType or providerId, returning early');
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
      console.log('🚫 [loadOptions] Cancelling existing request for:', { 
        fieldName, 
        cacheKey, 
        oldRequestId: activeRequestIds.current.get(cacheKey), 
        newRequestId: requestId,
        dependsOn,
        dependsOnValue 
      });
      existingController.abort();
      abortControllers.current.delete(cacheKey);
    }
    
    // Track the current request ID for this cache key
    activeRequestIds.current.set(cacheKey, requestId);
    
    // Check if there's already an active request for this exact field/dependency combination
    const activeRequestKey = cacheKey;
    if (!forceRefresh && activeRequests.current.has(activeRequestKey)) {
      console.log('🔄 [loadOptions] Waiting for existing request:', { fieldName, cacheKey });
      try {
        await activeRequests.current.get(activeRequestKey);
        return; // Data should now be available
      } catch (error) {
        console.error('🔄 [loadOptions] Existing request failed:', error);
        // Continue with new request
      }
    }
    
    // Prevent duplicate calls for the same field (unless forcing refresh)
    if (!forceRefresh && loadingFields.current.has(cacheKey)) {
      // Only log for Discord fields to avoid spam
      if (fieldName === 'filterAuthor' || (fieldName === 'guildId' && providerId === 'discord')) {
        console.log('🚫 [loadOptions] Skipping Discord field - already loading:', { 
          fieldName, 
          cacheKey, 
          isLoading: loadingFields.current.has(cacheKey)
        });
      }
      return;
    }
    
    // For authorFilter (Discord), only skip if we have data for the specific channel
    if (!forceRefresh && fieldName === 'authorFilter' && dependsOn === 'channelId' && dependsOnValue) {
      const channelSpecificData = dynamicOptions[`${fieldName}_${dependsOnValue}`];
      if (channelSpecificData && channelSpecificData.length > 0) {
        console.log('🚫 [loadOptions] Skipping authorFilter - already have data for this channel:', { 
          fieldName, 
          channelId: dependsOnValue,
          dataCount: channelSpecificData.length
        });
        return;
      }
    }
    
    // For other fields, use simple data check (exclude authorFilter since it's channel-specific)
    if (!forceRefresh && fieldName !== 'authorFilter' && dynamicOptions[fieldName] && dynamicOptions[fieldName].length > 0) {
      console.log('🚫 [loadOptions] Skipping field - already has data:', { 
        fieldName, 
        dataCount: dynamicOptions[fieldName].length
      });
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
          console.log('🔄 [loadOptions] Setting channelId loading to TRUE:', { cacheKey, timestamp: new Date().toISOString() });
        }
        
        onLoadingChangeRef.current?.(fieldName, true);
      } else {
        // Silent mode - just log that we're loading silently
        if (fieldName === 'channelId') {
          console.log('🔕 [loadOptions] Loading channelId silently:', { cacheKey, timestamp: new Date().toISOString() });
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
          console.log('🔍 [Discord] Loading guilds, forceRefresh:', shouldForceRefresh);
          
          const guilds = await loadDiscordGuildsOnce(shouldForceRefresh);
          
          if (!guilds || guilds.length === 0) {
            // Check if we have a Discord integration - if not, this is expected
            const discordIntegration = getIntegrationByProvider('discord');
            
            if (!discordIntegration) {
              console.log('🔍 No Discord integration found - empty guild list expected');
            } else {
              console.warn('⚠️ Discord integration exists but no guilds returned - attempting force refresh');
              // Try one more time with force refresh
              const refreshedGuilds = await loadDiscordGuildsOnce(true);
              if (refreshedGuilds && refreshedGuilds.length > 0) {
                console.log('✅ Force refresh successful, got guilds:', refreshedGuilds.length);
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
          console.error('Error loading Discord guilds:', error);
          
          // If this is an authentication error, we might need to refresh integration state
          if (error.message?.includes('authentication') || error.message?.includes('expired')) {
            console.log('🔄 Discord authentication error detected, refreshing integration state');
            try {
              const { useIntegrationStore } = await import('@/stores/integrationStore');
              useIntegrationStore.getState().fetchIntegrations(true);
            } catch (refreshError) {
              console.warn('Failed to refresh integration state:', refreshError);
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
          console.log('🔍 Discord channels require guildId - no guild selected');
          setDynamicOptions(prev => ({
            ...prev,
            [fieldName]: []
          }));
          return;
        }

        console.log('🔍 [loadOptions] Loading Discord channels from cache for guild:', dependsOnValue);
        
        try {
          const channels = await loadDiscordChannelsOnce(dependsOnValue, forceRefresh || false);
          
          if (!channels || channels.length === 0) {
            console.warn('⚠️ No Discord channels found for guild:', dependsOnValue);
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
          
          console.log('✅ [loadOptions] Loaded', formattedOptions.length, 'Discord channels for guild', dependsOnValue);
          
          setDynamicOptions(prev => ({
            ...prev,
            [fieldName]: formattedOptions
          }));
        } catch (error: any) {
          console.error('❌ [loadOptions] Error loading Discord channels for guild', dependsOnValue, ':', error);
          
          // If this is an authentication error, we might need to refresh integration state
          if (error.message?.includes('authentication') || error.message?.includes('expired')) {
            console.log('🔄 Discord authentication error detected, refreshing integration state');
            try {
              const { useIntegrationStore } = await import('@/stores/integrationStore');
              useIntegrationStore.getState().fetchIntegrations(true);
            } catch (refreshError) {
              console.warn('Failed to refresh integration state:', refreshError);
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
      console.log(`🔍 [useDynamicOptions] Looking for integration:`, {
        providerId,
        fieldName,
        integrationFound: !!integration,
        integrationId: integration?.id,
        integrationStatus: integration?.status
      });
      
      if (!integration) {
        console.warn(`❌ No integration found for provider: ${providerId}`, {
          fieldName,
          resourceType,
          nodeType
        });
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
        console.log('🔍 [useDynamicOptions] Loading linked records for field:', fieldName);
        
        // Get the form values to find the base and linked table info
        const formValues = getFormValues?.() || {};
        const baseId = extraOptions?.baseId || formValues.baseId;
        
        if (!baseId) {
          console.log('🔍 [useDynamicOptions] No baseId available for linked record loading');
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
          console.log('🔍 [useDynamicOptions] No table fields found for linked record loading');
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
        
        console.log('🔍 [useDynamicOptions] Looking for field:', {
          fieldName,
          actualFieldName,
          availableFields: tableFields.map((f: any) => ({ name: f.name, type: f.type, id: f.id })),
          foundField: tableField
        });
        
        if (!tableField || (tableField.type !== 'multipleRecordLinks' && tableField.type !== 'singleRecordLink')) {
          console.log('🔍 [useDynamicOptions] Field is not a linked record field:', tableField?.type);
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
          console.log('🔍 [useDynamicOptions] No linked table ID found in field options, trying to guess from field name:', tableField.name);
          
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
            
            console.log('🔍 [useDynamicOptions] Guessed table name from field name:', tableField.name, '->', linkedTableName);
          }
          
          console.log('🔍 [useDynamicOptions] Will try linked table name:', linkedTableName);
        }
        
        console.log('🔍 [useDynamicOptions] Loading records from linked table:', linkedTableId);
        
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
              console.log('🔍 [useDynamicOptions] Linked table not found by ID:', linkedTableId);
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
              console.log('🔍 [useDynamicOptions] Found linked table by name:', linkedTableName);
            }
          }
          
          if (!linkedTable) {
            console.log('🔍 [useDynamicOptions] Linked table not found:', { linkedTableId, linkedTableName });
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
          
          console.log('🔍 [useDynamicOptions] Using linked table:', linkedTable.name || linkedTable.value);
          
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
                maxRecords: 100
              }
            }),
            signal: abortController.signal
          });

          if (!recordsResponse.ok) {
            throw new Error(`Failed to load linked records: ${recordsResponse.status}`);
          }

          const recordsResult = await recordsResponse.json();
          const records = recordsResult.data || [];
          
          console.log('🔍 [useDynamicOptions] Loaded', records.length, 'linked records');
          
          // Determine the best field to use for display
          let displayField: string | null = null;
          let sampleFields: string[] = [];
          
          if (records.length > 0) {
            sampleFields = Object.keys(records[0].fields || {});
            console.log(`🔍 [useDynamicOptions] Available fields in linked table:`, sampleFields);
            
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
            
            console.log(`🔍 [useDynamicOptions] Using field "${displayField}" as display field for linked records`);
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
          
          console.log('🟡 [LINKED RECORDS] Formatted options for linked field:', {
            fieldName,
            optionsCount: formattedOptions.length,
            firstThreeOptions: formattedOptions.slice(0, 3).map(opt => ({
              value: opt.value,
              label: opt.label,
              hasDoubleColon: opt.value.includes('::')
            }))
          });
          
          // Check if this is still the current request
          if (activeRequestIds.current.get(cacheKey) !== requestId) {
            console.log('🚫 [loadOptions] Linked record request superseded, not updating state for:', { fieldName, cacheKey, requestId });
            return;
          }
          
          setDynamicOptions(prev => ({
            ...prev,
            [fieldName]: formattedOptions
          }));
        } catch (error: any) {
          console.error('❌ [useDynamicOptions] Failed to load linked records:', {
            field: fieldName,
            baseId,
            linkedTableId,
            error: error?.message || String(error)
          });
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

      console.log(`🔍 [useDynamicOptions] Mapping debug:`, {
        fieldName,
        nodeType,
        resourceType,
        integration: integration.provider
      });
      
      // Check for provider-specific loader first (for providers like HubSpot)
      if (providerId === 'hubspot') {
        console.log('🔍 [useDynamicOptions] Using HubSpot provider loader for field:', fieldName);
        
        try {
          // Import provider registry
          const { providerRegistry } = await import('../providers/registry');
          const loader = providerRegistry.getLoader(providerId, fieldName);
          
          if (loader) {
            console.log('✅ [useDynamicOptions] Found HubSpot loader for field:', fieldName);
            
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
            
            console.log('✅ [useDynamicOptions] HubSpot loader returned', formattedOptions.length, 'options');
            
            // Check if this is still the current request
            if (activeRequestIds.current.get(cacheKey) !== requestId) {
              console.log('🚫 [loadOptions] Request superseded, not updating state');
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
          console.error('❌ [useDynamicOptions] Error using HubSpot provider loader:', error);
          // Fall through to use regular integration data loading
        }
      }
      
      if (!resourceType) {
        // Only warn for fields that are expected to have dynamic options but don't
        const expectedDynamicFields = ['guildId', 'channelId', 'roleId', 'userId', 'boardId', 'baseId', 'tableId', 'workspaceId'];
        if (expectedDynamicFields.includes(fieldName)) {
          console.warn(`No resource type found for field: ${fieldName} in node: ${nodeType}`);
        } else {
          console.log(`🔍 [useDynamicOptions] Field ${fieldName} does not require dynamic loading for node: ${nodeType}`);
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
      
      // For Google Sheets sheets, don't call API without spreadsheetId
      if (fieldName === 'sheetName' && resourceType === 'google-sheets_sheets' && !dependsOnValue) {
        console.log('🔍 [useDynamicOptions] Skipping sheets load - no spreadsheet selected');
        return;
      }
      
      // For Airtable fields, use records approach instead of schema API
      if (fieldName === 'filterField' && resourceType === 'airtable_fields') {
        if (!dependsOnValue) {
          console.log('🔍 [useDynamicOptions] Skipping airtable fields load - no table selected');
          return;
        }
        // Get baseId from extraOptions first (passed explicitly), then form values
        let baseId = extraOptions?.baseId;
        if (!baseId) {
          const formValues = getFormValues?.() || {};
          baseId = formValues.baseId;
        }
        if (!baseId) {
          console.log('🔍 [useDynamicOptions] Skipping airtable fields load - no baseId available');
          return;
        }
        
        console.log('🔍 [useDynamicOptions] Loading airtable fields from records with:', { baseId, tableName: dependsOnValue });
        
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
                maxRecords: 5 // Just need a few records to get field names
              }
            }),
            signal: abortController.signal,
          });

          if (!recordsResponse.ok) {
            const errorData = await recordsResponse.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to load records: ${recordsResponse.status}`);
          }

          const recordsResult = await recordsResponse.json();
          const records = recordsResult.data || [];
          
          console.log('🔍 [useDynamicOptions] Records loaded for field extraction:', records.length);
          
          // Extract field names from the first record
          const fieldNames = records.length > 0 ? Object.keys(records[0]?.fields || {}) : [];
          
          console.log('🔍 [useDynamicOptions] Extracted field names:', fieldNames);
          
          // Format as field options
          const fieldOptions = fieldNames.map(name => ({
            value: name,
            label: name,
            type: 'text', // We don't have type info from records, so default to text
            id: name
          }));
          
          console.log('✅ [useDynamicOptions] loadIntegrationData completed:', { fieldName, resultLength: fieldOptions.length });
          
          // Check if this is still the current request
          if (activeRequestIds.current.get(cacheKey) !== requestId) {
            console.log('🚫 [useDynamicOptions] Request superseded by newer request, not updating state for:', { fieldName, cacheKey, requestId, currentId: activeRequestIds.current.get(cacheKey) });
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
          console.error('❌ [useDynamicOptions] Failed to load fields from records:', error);
          throw error; // Re-throw to be caught by the outer catch block
        }
      }
      
      // For Airtable field values, use records approach to get unique field values
      if (fieldName === 'filterValue' && resourceType === 'airtable_field_values') {
        if (!dependsOnValue) {
          console.log('🔍 [useDynamicOptions] Skipping airtable field values load - no field selected');
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
          console.log('🔍 [useDynamicOptions] Skipping airtable field values load - missing baseId or tableName', {
            hasBaseId: !!baseId,
            hasTableName: !!tableName,
            extraOptions,
            formValues: getFormValues?.()
          });
          return;
        }
        
        console.log('🔍 [useDynamicOptions] Loading airtable field values from records with:', { 
          baseId, 
          tableName, 
          filterField: dependsOnValue 
        });
        
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
                maxRecords: 5 // Just check a few records
              }
            }),
            signal: abortController.signal,
          });

          if (recordsResponse.ok) {
            const recordsResult = await recordsResponse.json();
            const sampleRecords = recordsResult.data || [];
            
            // Check if this is still the current request
            if (activeRequestIds.current.get(cacheKey) !== requestId) {
              console.log('🚫 [useDynamicOptions] Request superseded during sample records fetch, not updating state');
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
            console.log('🔍 [useDynamicOptions] Detected linked record field based on data, will fetch from table:', linkedTableName);
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
                tableName,
                maxRecords: 100 // Get more records to capture more unique values
              }
            }),
            signal: abortController.signal,
          });

          if (!recordsResponse.ok) {
            const errorData = await recordsResponse.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to load records for field values: ${recordsResponse.status}`);
          }

          const recordsResult = await recordsResponse.json();
          const records = recordsResult.data || [];
          
          // Check if this is still the current request
          if (activeRequestIds.current.get(cacheKey) !== requestId) {
            console.log('🚫 [useDynamicOptions] Request superseded during records fetch, not updating state');
            return;
          }
          
          console.log('🔍 [useDynamicOptions] Records loaded for field values extraction:', records.length);
          
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
            console.log('🔍 [useDynamicOptions] Fetching names for linked records:', Array.from(recordIds));
            
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
                    maxRecords: 100
                  }
                })
              });
              
              if (linkedResponse.ok) {
                const linkedResult = await linkedResponse.json();
                const linkedRecords = linkedResult.data || [];
                
                // Check if this is still the current request
                if (activeRequestIds.current.get(cacheKey) !== requestId) {
                  console.log('🚫 [useDynamicOptions] Request superseded during linked records fetch, not updating state');
                  return;
                }
                
                console.log(`📊 Fetched ${linkedRecords.length} records from ${linkedTableName} table`);
                
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
                  
                  console.log(`🔍 Using field "${displayField}" for display names`);
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
              console.warn('⚠️ [useDynamicOptions] Could not fetch linked record names:', error);
              // Fall back to using record IDs
              recordIds.forEach(id => fieldValues.set(id, id));
            }
          }
          
          console.log('🔍 [useDynamicOptions] Extracted unique field values:', Array.from(fieldValues.entries()));
          
          // Format as field value options
          const valueOptions = Array.from(fieldValues.entries())
            .sort((a, b) => a[1].localeCompare(b[1])) // Sort by label alphabetically
            .map(([value, label]) => ({
              value: value,
              label: label
            }));
          
          console.log('✅ [useDynamicOptions] loadIntegrationData completed:', { fieldName, resultLength: valueOptions.length });
          
          // Check if this is still the current request
          if (activeRequestIds.current.get(cacheKey) !== requestId) {
            console.log('🚫 [useDynamicOptions] Request superseded by newer request, not updating state for:', { fieldName, cacheKey, requestId, currentId: activeRequestIds.current.get(cacheKey) });
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
          console.error('❌ [useDynamicOptions] Failed to load field values from records:', error);
          throw error; // Re-throw to be caught by the outer catch block
        }
      }
      console.log('🚀 [useDynamicOptions] Calling loadIntegrationData...', {
        fieldName,
        resourceType,
        integrationId: integration.id,
        options,
        forceRefresh
      });
      const result = await loadIntegrationData(resourceType, integration.id, options, forceRefresh);
      console.log('✅ [useDynamicOptions] loadIntegrationData completed:', { 
        fieldName, 
        resourceType,
        resultLength: result?.data?.length || result?.length || 'unknown', 
        result 
      });
      
      // Check if this is still the current request
      // This is crucial because loadIntegrationData might not support abort signals
      if (activeRequestIds.current.get(cacheKey) !== requestId) {
        // Special handling for authorFilter - always use the data if we got it
        if (fieldName === 'authorFilter') {
          console.log('⚠️ [loadOptions] authorFilter - Using data despite supersession, data is valid');
          // Continue to update state for authorFilter
        } else {
          console.log('🚫 [loadOptions] Request superseded during processing, not updating state for:', { 
            fieldName, 
            cacheKey, 
            requestId, 
            currentId: activeRequestIds.current.get(cacheKey),
            resourceType,
            dependsOn,
            dependsOnValue
          });
          return; // Don't update state if this request was superseded for other fields
        }
      }
      
      // Format the results - extract data array from response object if needed
      const dataArray = result.data || result;
      const formattedOptions = formatOptionsForField(fieldName, dataArray);
      
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
      
      setDynamicOptions(prev => ({
        ...prev,
        ...updateObject
      }));
      
      // Clear loading state on successful completion
      // For authorFilter, always clear the loading state when we have data
      if (fieldName === 'authorFilter') {
        console.log('✅ [loadOptions] Clearing loading state for authorFilter after successful load');
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
            console.log('✅ [loadOptions] Successfully loaded tableName, clearing loading state');
          }
          onLoadingChangeRef.current?.(fieldName, false);
        }
      } else {
        console.log('🚫 [loadOptions] Not clearing loading state for superseded request:', { fieldName, cacheKey, requestId, currentId: activeRequestIds.current.get(cacheKey) });
      }
      
    } catch (error: any) {
      // Check if the error was due to abort
      if (error.name === 'AbortError') {
        console.log('🚫 [loadOptions] Request aborted for:', { fieldName, cacheKey });
        // Don't update state or clear loading for aborted requests
        // The loading state should persist until the new request completes
        return;
      }
      
      // Get the integration if available for error logging
      const currentIntegration = getIntegrationByProvider(providerId);
      
      console.error(`❌ [useDynamicOptions] Failed to load options for ${fieldName}:`, {
        fieldName,
        resourceType,
        integrationId: currentIntegration?.id,
        providerId,
        options,
        error: error?.message || String(error),
        stack: error?.stack || 'No stack trace available'
      });
      setDynamicOptions(prev => ({
        ...prev,
        [fieldName]: []
      }));
      
      // Only clear loading state for non-abort errors
      // But only if this is still the current request
      if (activeRequestIds.current.get(cacheKey) === requestId) {
        loadingFields.current.delete(cacheKey);
        setLoading(false);
        
        // Clean up the abort controller and request ID on error
        abortControllers.current.delete(cacheKey);
        activeRequestIds.current.delete(cacheKey);
      }
      
      // Only clear loading states if not in silent mode
      if (!silent) {
        onLoadingChangeRef.current?.(fieldName, false);
      }
    } finally {
      // Only perform cleanup if not aborted
      // This is handled in the catch block now
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
  
  // Clear all options when node type changes
  useEffect(() => {
    console.log('🔄 [useDynamicOptions] Node type or provider changed, clearing all state', { nodeType, providerId });
    
    // Abort all active fetch requests EXCEPT Discord guilds (they're cached globally)
    abortControllers.current.forEach((controller, key) => {
      // Don't abort Discord guild requests as they're cached and reusable
      if (!key.startsWith('guildId')) {
        console.log('🚫 [useDynamicOptions] Aborting fetch request:', key);
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
        console.log('🚫 [useDynamicOptions] Cancelling active request:', key);
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
    const independentFields = ['baseId', 'guildId', 'workspaceId', 'boardId'];
    
    independentFields.forEach(fieldName => {
      // Check if this field exists for this node type
      const resourceType = getResourceTypeForField(fieldName, nodeType);
      if (resourceType) {
        loadOptions(fieldName);
      }
    });
    
    // Cleanup function when component unmounts
    return () => {
      console.log('🧹 [useDynamicOptions] Component unmounting, cleaning up...');
      
      // Abort all active fetch requests EXCEPT Discord guilds (they're cached globally)
      abortControllers.current.forEach((controller, key) => {
        // Don't abort Discord guild requests as they use global cache
        if (!key.startsWith('guildId')) {
          console.log('🚫 [useDynamicOptions] Aborting fetch on unmount:', key);
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
          console.log('🚫 [useDynamicOptions] Cancelling request on unmount:', key);
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
