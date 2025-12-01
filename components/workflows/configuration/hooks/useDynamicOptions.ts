"use client"
// Force recompile
import { useState, useCallback, useRef, useEffect, startTransition } from 'react';
import { useIntegrationStore } from "@/stores/integrationStore"
import { DynamicOptionsState } from '../utils/types';
import { getResourceTypeForField } from '../config/fieldMappings';
import { formatOptionsForField } from '../utils/fieldFormatters';
import { useConfigCacheStore } from "@/stores/configCacheStore"
import { buildCacheKey, getFieldTTL, shouldCacheField } from "@/lib/workflows/configuration/cache-utils"
import { getCachedProviderData, cacheProviderData, shouldRefreshProviderCache } from "@/lib/utils/field-cache"
import { useAuthStore } from "@/stores/authStore"

import { logger } from '@/lib/utils/logger'

interface UseDynamicOptionsProps {
  nodeType?: string;
  providerId?: string;
  workflowId?: string | null;
  onLoadingChange?: (fieldName: string, isLoading: boolean) => void;
  onOptionsUpdated?: (updatedOptions: DynamicOptionsState) => void;
  getFormValues?: () => Record<string, any>;
  initialOptions?: DynamicOptionsState;
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

// Cache TTL: 5 minutes (in milliseconds) - Fresh data for better UX
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Get cached options from localStorage
 */
function getCachedOptions(providerId: string, nodeType: string): DynamicOptionsState | null {
  if (typeof window === 'undefined') return null;

  try {
    const cacheKey = `dynamicOptions_${providerId}_${nodeType}`;
    const cached = localStorage.getItem(cacheKey);

    if (!cached) return null;

    const { options, timestamp } = JSON.parse(cached);

    // Check if cache is still valid (within TTL)
    if (Date.now() - timestamp > CACHE_TTL) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    return options;
  } catch (error) {
    logger.error('Error reading from localStorage cache:', error);
    return null;
  }
}

/**
 * Save options to localStorage cache
 */
function setCachedOptions(providerId: string, nodeType: string, options: DynamicOptionsState): void {
  if (typeof window === 'undefined') return;

  try {
    const cacheKey = `dynamicOptions_${providerId}_${nodeType}`;
    const cacheData = {
      options,
      timestamp: Date.now()
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    logger.debug(`💾 [useDynamicOptions] Saved to localStorage cache:`, cacheKey);
  } catch (error) {
    logger.error('Error writing to localStorage cache:', error);
  }
}

export const useDynamicOptions = ({ nodeType, providerId, workflowId, onLoadingChange, onOptionsUpdated, getFormValues, initialOptions }: UseDynamicOptionsProps) => {
  // Get user ID for provider-level caching
  const { user } = useAuthStore()
  const userId = user?.id

  // Cache store for field-level caching
  const { get: getCache, set: setCache } = useConfigCacheStore()

  // Store callbacks in refs to avoid dependency issues
  const onLoadingChangeRef = useRef(onLoadingChange);
  onLoadingChangeRef.current = onLoadingChange;
  const onOptionsUpdatedRef = useRef(onOptionsUpdated);
  onOptionsUpdatedRef.current = onOptionsUpdated;

  // Don't use localStorage cache - always fetch fresh from Airtable
  const [dynamicOptions, setDynamicOptions] = useState<DynamicOptionsState>(() => {
    return initialOptions || {};
  });

  // Store dynamicOptions in ref to avoid dependency issues in loadOptions useCallback
  const dynamicOptionsRef = useRef(dynamicOptions);
  dynamicOptionsRef.current = dynamicOptions;
  const [loading, setLoading] = useState<boolean>(false);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(false);

  // Track previous nodeType to detect changes
  const prevNodeTypeRef = useRef(nodeType);

  // Integration store methods
  const { getIntegrationByProvider, loadIntegrationData, fetchIntegrations } = useIntegrationStore();

  const syncLinkedOptions = useCallback((optionsState: DynamicOptionsState): DynamicOptionsState => {
    if (nodeType !== 'hubspot_action_get_tickets') {
      return optionsState;
    }

    const filterOptions = optionsState.filterProperty;
    const propertyOptions = optionsState.properties;

    if (filterOptions && filterOptions.length > 0 && (!propertyOptions || propertyOptions.length === 0)) {
      return {
        ...optionsState,
        properties: filterOptions
      };
    }

    if (propertyOptions && propertyOptions.length > 0 && (!filterOptions || filterOptions.length === 0)) {
      return {
        ...optionsState,
        filterProperty: propertyOptions
      };
    }

    return optionsState;
  }, [nodeType]);

  useEffect(() => {
    setDynamicOptions(prev => {
      const synced = syncLinkedOptions(prev);
      return synced === prev ? prev : synced;
    });
  }, [syncLinkedOptions]);

  // Notify parent when options are updated AND save to localStorage cache
  useEffect(() => {
    if (Object.keys(dynamicOptions).length > 0) {
      // Save to parent (for node config persistence)
      if (onOptionsUpdatedRef.current) {
        onOptionsUpdatedRef.current(dynamicOptions);
      }

      // Don't save to localStorage - always fetch fresh from Airtable
    }
  }, [dynamicOptions]);
  
  // Enhanced loading prevention with request deduplication
  const loadingFields = useRef<Set<string>>(new Set());
  const loadingStartTimes = useRef<Map<string, number>>(new Map()); // Track when each field started loading
  const activeRequests = useRef<Map<string, Promise<void>>>(new Map());
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const staleTimers = useRef<Map<string, any>>(new Map());
  // Track request IDs to handle concurrent requests for the same field
  const requestCounter = useRef(0);
  const activeRequestIds = useRef<Map<string, number>>(new Map());
  // Throttle map to avoid rapid reloading for the same dependency key
  const lastLoadedAt = useRef<Map<string, number>>(new Map());
  // Track provider fetch attempts to avoid spamming integration fetches
  const integrationFetchAttempts = useRef<Map<string, number>>(new Map());

  // Reset dynamic options when nodeType changes (switching between different nodes)
  // This prevents stale options from being shown when switching between nodes of the same provider
  useEffect(() => {
    if (prevNodeTypeRef.current !== nodeType) {
      logger.debug(`🔄 [useDynamicOptions] nodeType changed from ${prevNodeTypeRef.current} to ${nodeType}, resetting options`);
      prevNodeTypeRef.current = nodeType;

      // Reset to initialOptions or empty object
      const newOptions = initialOptions || {};
      setDynamicOptions(newOptions);

      // CRITICAL: Also update the ref immediately so that loadOptions doesn't see stale data
      // The ref won't be updated automatically until the next render, but loadOptions checks the ref
      dynamicOptionsRef.current = newOptions;

      // Clear loading tracking refs
      loadingFields.current.clear();
      loadingStartTimes.current.clear();
      activeRequests.current.clear();
      lastLoadedAt.current.clear();
      activeRequestIds.current.clear();
      integrationFetchAttempts.current.clear();

      // Abort any in-flight requests
      abortControllers.current.forEach((controller) => {
        controller.abort();
      });
      abortControllers.current.clear();

      // Clear stale timers
      staleTimers.current.forEach((timer) => {
        clearTimeout(timer);
      });
      staleTimers.current.clear();

      // Clear the global request deduplication cache for this provider/node
      // This ensures fresh data is fetched when switching nodes
      try {
        const { requestDeduplicationManager } = require('@/lib/utils/requestDeduplication');
        requestDeduplicationManager.clearAll();
        logger.debug('🧹 [useDynamicOptions] Cleared request deduplication cache');
      } catch (e) {
        // Ignore if module not available
      }
    }
  }, [nodeType, initialOptions]);

  // Reset options for a field
  const resetOptions = useCallback((fieldName: string) => {
    setDynamicOptions(prev => {
      // Remove the base field entry and any dependency-specific caches
      let changed = false;
      const updated = { ...prev };
      Object.keys(updated).forEach((key) => {
        if (key === fieldName || key.startsWith(`${fieldName}_`)) {
          delete updated[key];
          changed = true;
        }
      });
      return changed ? updated : prev;
    });
  }, []);

  // Load options for a dynamic field with request deduplication
  const loadOptions = useCallback(async (fieldName: string, dependsOn?: string, dependsOnValue?: any, forceRefresh?: boolean, silent?: boolean, extraOptions?: Record<string, any>) => {

    logger.debug(`🔵 [useDynamicOptions] loadOptions called`, {
      fieldName,
      nodeType,
      providerId,
      dependsOn,
      dependsOnValue,
      forceRefresh,
      silent,
      currentLoadingFields: Array.from(loadingFields.current)
    });

    if (!nodeType || !providerId) {
      logger.warn(`⚠️ [useDynamicOptions] Missing nodeType or providerId`, {
        fieldName,
        nodeType,
        providerId
      });
      return;
    }
    
    // Auto-detect dependencies for certain fields
    if (fieldName === 'messageId' && !dependsOn) {
      dependsOn = 'channelId';
      // Note: dependsOnValue will be handled below by looking at current form values
    }
    
    // CRITICAL: Check if integration exists BEFORE starting any loading state
    // This prevents "Loading..." from showing when integration isn't connected yet
    const integrationExists = getIntegrationByProvider(providerId);
    if (!integrationExists && !silent) {
      logger.debug(`⚠️ [useDynamicOptions] No integration found for ${providerId}, skipping load for ${fieldName}`);
      setDynamicOptions(prev => ({
        ...prev,
        [fieldName]: []
      }));
      return; // Don't show loading if integration doesn't exist
    }

    // Build cache key for field-level caching
    const cacheKey = buildCacheKey(
      providerId,
      providerId, // Use providerId as integrationId for cache key (will be same for all nodes of this provider)
      fieldName,
      dependsOnValue ? { [dependsOn || 'parent']: dependsOnValue } : undefined
    )

    // Check new cache store first (if not forcing refresh and field should be cached)
    if (!forceRefresh && shouldCacheField(fieldName)) {
      const cached = getCache(cacheKey)
      if (cached && Array.isArray(cached) && cached.length > 0) {
        logger.debug(`💾 [useDynamicOptions] Cache HIT for ${fieldName}:`, {
          cacheKey,
          optionsCount: cached.length,
          fieldName,
          dependsOn,
          dependsOnValue
        })

        // Update dynamic options with cached data
        setDynamicOptions(prev => ({
          ...prev,
          [fieldName]: cached,
          ...(dependsOn && dependsOnValue ? { [`${fieldName}_${dependsOnValue}`]: cached } : {})
        }))

        // Clear loading state
        setLoading(false)
        if (!silent) {
          onLoadingChangeRef.current?.(fieldName, false)
        }

        return // Early return - no need to fetch from API
      }
      logger.debug(`❌ [useDynamicOptions] Cache MISS for ${fieldName}:`, { cacheKey })
    }

    // Create a key that includes dependencies
    const requestKey = `${fieldName}-${dependsOn || 'none'}-${dependsOnValue || 'none'}`;
    
    // Check if there's already an active request for this exact field/dependency combination
    const activeRequestKey = requestKey;
    const existingPromise = activeRequests.current.get(activeRequestKey);

    if (existingPromise && !forceRefresh) {
      logger.debug(`⏳ [useDynamicOptions] Waiting for existing request: ${activeRequestKey}`);
      let shouldReturn = true;
      try {
        await existingPromise;
      } catch (error) {
        logger.debug(`⚠️ [useDynamicOptions] Previous request failed, continuing with new request`);
        shouldReturn = false;
      }
      if (shouldReturn) {
        return; // Data should now be available
      }
    }

    if (existingPromise && forceRefresh) {
      logger.debug(`🔁 [useDynamicOptions] Force refresh requested, aborting existing request: ${activeRequestKey}`);
      const inFlightController = abortControllers.current.get(requestKey);
      if (inFlightController) {
        inFlightController.abort();
        abortControllers.current.delete(requestKey);
      }
      activeRequests.current.delete(activeRequestKey);
      const existingTimer = staleTimers.current.get(requestKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
        staleTimers.current.delete(requestKey);
      }
    }
    
    // Generate a unique request ID (after deduplication)
    const requestId = ++requestCounter.current;
    
    // Cancel any existing request controller before starting a new one (should only be leftovers)
    const existingController = abortControllers.current.get(requestKey);
    if (existingController) {
      existingController.abort();
      abortControllers.current.delete(requestKey);
    }
    
    // Track the current request ID for this cache key
    activeRequestIds.current.set(requestKey, requestId);

    // Throttle: Skip if same field was loaded recently (within 2 seconds)
    const THROTTLE_MS = 2000;
    const lastLoaded = lastLoadedAt.current.get(requestKey);
    if (!forceRefresh && lastLoaded && Date.now() - lastLoaded < THROTTLE_MS) {
      logger.debug(`⏱️ [useDynamicOptions] Throttling ${fieldName} - loaded ${Date.now() - lastLoaded}ms ago`);
      return;
    }

    // Check if field is currently loading
    if (!forceRefresh && loadingFields.current.has(requestKey)) {
      const loadStartTime = loadingStartTimes.current.get(requestKey);
      const loadDuration = loadStartTime ? Date.now() - loadStartTime : 0;

      logger.warn(`🔄 [useDynamicOptions] Field appears to be loading: ${requestKey}`, {
        fieldName,
        dependsOn,
        dependsOnValue,
        loadDuration,
        loadingFields: Array.from(loadingFields.current)
      });

      // If it's been loading for more than 5 seconds, it's likely stuck - clear it
      // Otherwise, this is probably a legitimate duplicate request - skip it
      if (loadDuration > 5000 || !loadStartTime) {
        logger.warn(`🧹 [useDynamicOptions] Clearing stuck loading state (${loadDuration}ms) for ${requestKey}`);
        loadingFields.current.delete(requestKey);
        loadingStartTimes.current.delete(requestKey);
        setLoading(false);
        // Continue with the load
      } else {
        logger.debug(`⏳ [useDynamicOptions] Skipping duplicate request (${loadDuration}ms old)`);
        return;
      }
    }

    // NOTE: Removed early return caching logic that was preventing fields from reloading
    // when switching between nodes. Provider loaders like OneNote, Teams, Excel should
    // always fetch fresh data when the config modal opens.

    // Determine data to load based on field name (moved outside try block for error handling)
    const resourceType = getResourceTypeForField(fieldName, nodeType);

    // PHASE 1: Stale-While-Revalidate for ALL dynamic fields
    // Show cached data instantly, refresh in background
    const isProviderLevelField = resourceType === 'airtable_bases' || resourceType === 'airtable_tables' || resourceType === 'airtable_fields';

    if (isProviderLevelField && userId && !forceRefresh) {
      let dataType: 'bases' | 'tables' | 'fields';
      let parentId: string | undefined;

      if (resourceType === 'airtable_bases') {
        dataType = 'bases';
        parentId = undefined;
      } else if (resourceType === 'airtable_tables') {
        dataType = 'tables';
        parentId = dependsOnValue; // baseId
      } else {
        dataType = 'fields';
        parentId = dependsOnValue; // tableId or tableName
      }

      // Try to get cached provider data
      const cachedData = getCachedProviderData(providerId, userId, dataType, parentId);

      if (cachedData && cachedData.length > 0) {
        logger.debug(`⚡ [STALE-WHILE-REVALIDATE] Showing cached ${dataType} instantly`, {
          fieldName,
          count: cachedData.length,
          parentId
        });

        // Format and show cached data IMMEDIATELY
        const formattedOptions = formatOptionsForField(fieldName, cachedData, providerId);
        setDynamicOptions(prev => ({
          ...prev,
          [fieldName]: formattedOptions,
          ...(dependsOn && dependsOnValue ? { [`${fieldName}_${dependsOnValue}`]: formattedOptions } : {})
        }));

        // Clear loading state
        setLoading(false);
        if (!silent) {
          onLoadingChangeRef.current?.(fieldName, false);
        }

        // Check if we need to refresh in background
        const needsRefresh = shouldRefreshProviderCache(providerId, userId, dataType, parentId);

        if (!needsRefresh) {
          logger.debug(`✅ [STALE-WHILE-REVALIDATE] Cache is fresh, no refresh needed`);
          return; // Data is fresh enough, don't refresh
        }

        // Continue to fetch fresh data in background (silent mode)
        logger.debug(`🔄 [STALE-WHILE-REVALIDATE] Refreshing ${dataType} in background`);
        silent = true; // Make the refresh silent
      }
    }

    // Debug logging for Gmail "from" field
    if (fieldName === 'from' && providerId === 'gmail') {
      logger.debug('🔍 [useDynamicOptions] Loading Gmail from field:', {
        fieldName,
        nodeType,
        providerId,
        resourceType,
        expectedNodeType: 'gmail_action_send_email'
      });
    }

    // Debug logging for searchField specifically
    if (fieldName === 'searchField') {
    }

    // Debug logging for watchedTables / airtable_tables
    if (fieldName === 'watchedTables' || resourceType === 'airtable_tables') {
    }

    // Debug logging for Gmail fields
    if (fieldName === 'labelIds' || fieldName === 'from') {
      logger.debug(`🔍 [useDynamicOptions] Loading Gmail field ${fieldName}:`, {
        fieldName,
        nodeType,
        providerId,
        resourceType,
        forceRefresh,
        silent
      });
    }

    // Debug logging for Trello template field
    if (fieldName === 'template' && providerId === 'trello') {
      logger.debug('[useDynamicOptions] Loading Trello template field:', {
        fieldName,
        nodeType,
        providerId,
        resourceType,
        forceRefresh,
        silent
      });
    }

    // Set loading state IMMEDIATELY (synchronously) so UI updates before async work starts
    if (!silent) {
      loadingFields.current.add(requestKey);
      loadingStartTimes.current.set(requestKey, Date.now()); // Track when loading started
      setLoading(true);

      // Enhanced logging for critical fields
      if (fieldName === 'channelId' || fieldName === 'cardId' || fieldName === 'listId' || fieldName === 'spreadsheetId') {
        logger.debug(`🔄 [useDynamicOptions] Setting loading state for ${fieldName}`);
      }

      onLoadingChangeRef.current?.(fieldName, true);
    } else {
      // Silent mode - just log that we're loading silently
      if (fieldName === 'channelId' || fieldName === 'cardId' || fieldName === 'listId') {
        logger.debug(`🔇 [useDynamicOptions] Loading ${fieldName} in silent mode`);
      }
    }

    // Create AbortController for this request
    const abortController = new AbortController();
    abortControllers.current.set(requestKey, abortController);
    // Start a stale timer to force-clear loading if request hangs (10s)
    const staleTimer = setTimeout(() => {
      if (activeRequestIds.current.get(requestKey) === requestId) {
        loadingFields.current.delete(requestKey);
        setLoading(false);
        if (!silent) onLoadingChangeRef.current?.(fieldName, false);
        abortControllers.current.delete(requestKey);
      }
    }, resourceType === 'google-sheets_sheets' ? 15000 : 10000);
    staleTimers.current.set(requestKey, staleTimer);

    // Create and store the loading promise to prevent duplicate requests
    const loadingPromise = (async () => {
      // Loading state already set above synchronously

      // Define variables at the beginning of the async function scope
      let integration: any;
      let options: any = {};
      
      try {
      // Special handling for Discord guilds
      // Support both 'guildId' (standard Discord actions) and 'discordGuildId' (HITL)
      if ((fieldName === 'guildId' || fieldName === 'discordGuildId') && providerId === 'discord') {
        const isHitlNode = nodeType === 'hitl_conversation'
        const hasAdminPrivileges = (guild: any) => {
          if (!guild) return false
          if (guild.owner) return true
          const permissionValue = guild.permissions ?? guild.permission ?? guild.userPermissions ?? guild.user_permissions
          if (!permissionValue) return false
          try {
            const permissionBigInt = typeof permissionValue === 'string' || typeof permissionValue === 'number'
              ? BigInt(permissionValue)
              : BigInt(permissionValue?.toString?.() || 0)
            const ADMIN_PERMISSION = 8n
            return (permissionBigInt & ADMIN_PERMISSION) === ADMIN_PERMISSION
          } catch (error) {
            logger.warn('⚠️ [DynamicOptions] Failed to parse Discord permissions for guild:', {
              guildId: guild.id,
              error
            })
            return false
          }
        }

        try {
          // Check if we have a Discord integration first to avoid unnecessary API calls
          let discordIntegration = getIntegrationByProvider('discord');

          // DEBUG: Show what's in the integration store
          const allIntegrations = useIntegrationStore.getState().integrations;
          logger.debug('🐛 [DynamicOptions] Discord guildId field - checking integration:', {
            fieldName,
            providerId,
            integrationFound: !!discordIntegration,
            integrationId: discordIntegration?.id,
            integrationStatus: discordIntegration?.status,
            totalIntegrations: allIntegrations.length,
            allProviderIds: allIntegrations.map(i => i.provider),
            discordIntegrations: allIntegrations.filter(i => i.provider?.toLowerCase().includes('discord')),
            storeState: {
              loading: useIntegrationStore.getState().loading,
              lastFetchTime: useIntegrationStore.getState().lastFetchTime
            }
          });

          // If integration not found, try fetching fresh integrations
          if (!discordIntegration) {
            logger.debug('⚠️ [DynamicOptions] Discord integration not found, fetching integrations...');
            await fetchIntegrations(true); // Force refresh
            discordIntegration = getIntegrationByProvider('discord');

            // DEBUG: Show what's in store after fetch
            const allIntegrationsAfter = useIntegrationStore.getState().integrations;
            logger.debug('🔁 [DynamicOptions] Discord integration after fetch:', {
              integrationFound: !!discordIntegration,
              integrationId: discordIntegration?.id,
              totalIntegrations: allIntegrationsAfter.length,
              allProviderIds: allIntegrationsAfter.map(i => i.provider)
            });
          }

          // Be lenient with status - only reject explicitly bad statuses
          if (!discordIntegration) {
            logger.warn('⚠️ [DynamicOptions] Discord integration STILL not found after fetch', {
              fieldName,
              providerId
            });
            setDynamicOptions(prev => ({
              ...prev,
              [fieldName]: []
            }));
            return;
          }

          // Only reject if explicitly disconnected or in error state
          if (discordIntegration.status === 'disconnected' || discordIntegration.status === 'error') {
            logger.warn('⚠️ [DynamicOptions] Discord not connected', {
              status: discordIntegration?.status,
              fieldName,
              providerId
            });
            setDynamicOptions(prev => ({
              ...prev,
              [fieldName]: []
            }));
            return;
          }

          // Log warning for non-standard statuses but continue
          if (discordIntegration.status !== 'connected' && discordIntegration.status !== 'active') {
            logger.warn('⚠️ [DynamicOptions] Non-standard Discord status, continuing anyway:', {
              status: discordIntegration.status,
              fieldName
            });
          }

          logger.debug('✅ [DynamicOptions] Loading Discord guilds', {
            integrationId: discordIntegration.id,
            fieldName,
            forceRefresh
          });

          // Load Discord guilds from API
          const response = await loadIntegrationData(
            'discord_guilds',
            discordIntegration.id,
            {
              requireBotAccess: !isHitlNode,
              checkBotStatus: isHitlNode
            },
            forceRefresh
          );

          let guilds = response?.data || response || [];

          if (isHitlNode) {
            const adminGuilds = guilds.filter((guild: any) => hasAdminPrivileges(guild));
            if (adminGuilds.length === 0) {
              logger.warn('⚠️ [DynamicOptions] No admin-level Discord servers found for HITL node; showing full list as fallback');
            } else {
              logger.debug(`✅ [DynamicOptions] HITL node showing ${adminGuilds.length}/${guilds.length} admin Discord servers`);
              guilds = adminGuilds;
            }
          }

          if (!guilds || guilds.length === 0) {
            setDynamicOptions(prev => ({
              ...prev,
              [fieldName]: []
            }));
            return;
          }

          const formattedOptions = guilds.map((guild: any) => ({
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
            logger.error('🚨 [useDynamicOptions] AUTH ERROR DETECTED', {
              fieldName,
              error: error.message,
              retryCount: authErrorRetryCount,
              maxRetries: MAX_AUTH_RETRIES,
              timestamp: new Date().toISOString()
            });
            
            // Only retry once to prevent infinite loops
            if (authErrorRetryCount < MAX_AUTH_RETRIES) {
              authErrorRetryCount++;
              logger.debug('🔄 [useDynamicOptions] Attempting to refresh integrations...');
              try {
                const { useIntegrationStore } = await import('@/stores/integrationStore');
                useIntegrationStore.getState().fetchIntegrations(true);
              } catch (refreshError) {
                logger.error('🚨 [useDynamicOptions] Failed to refresh integrations', refreshError);
              }
            } else {
              logger.warn('⚠️ [useDynamicOptions] Max auth retries reached, not refreshing integrations');
            }
          }
          
          setDynamicOptions(prev => ({
            ...prev,
            [fieldName]: []
          }));
        } finally {
          // Only clear loading if this is still the current request
          if (activeRequestIds.current.get(requestKey) === requestId) {
            loadingFields.current.delete(requestKey);
            setLoading(false);
          }
        }
        return;
      }

      // Special handling for Discord channels using cache store
      // Support both 'channelId' (standard Discord actions) and 'discordChannelId' (HITL)
      if ((fieldName === 'channelId' || fieldName === 'discordChannelId') && providerId === 'discord') {
        if (!dependsOnValue) {
          setDynamicOptions(prev => ({
            ...prev,
            [fieldName]: []
          }));
          return;
        }


        try {
          // Load Discord channels from API
          const discordIntegration = getIntegrationByProvider('discord');
          if (!discordIntegration) {
            setDynamicOptions(prev => ({
              ...prev,
              [fieldName]: []
            }));
            return;
          }

          const response = await loadIntegrationData(
            'discord_channels',
            discordIntegration.id,
            { guildId: dependsOnValue },
            forceRefresh || false
          );

          const channels = response?.data || response || [];

          if (!channels || channels.length === 0) {
            setDynamicOptions(prev => ({
              ...prev,
              [fieldName]: []
            }));
            return;
          }

          const formattedOptions = channels
            .filter((channel: any) => channel && channel.id)
            .sort((a: any, b: any) => {
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
            logger.error('🚨 [useDynamicOptions] AUTH ERROR DETECTED', {
              fieldName,
              error: error.message,
              retryCount: authErrorRetryCount,
              maxRetries: MAX_AUTH_RETRIES,
              timestamp: new Date().toISOString()
            });
            
            // Only retry once to prevent infinite loops
            if (authErrorRetryCount < MAX_AUTH_RETRIES) {
              authErrorRetryCount++;
              logger.debug('🔄 [useDynamicOptions] Attempting to refresh integrations...');
              try {
                const { useIntegrationStore } = await import('@/stores/integrationStore');
                useIntegrationStore.getState().fetchIntegrations(true);
              } catch (refreshError) {
                logger.error('🚨 [useDynamicOptions] Failed to refresh integrations', refreshError);
              }
            } else {
              logger.warn('⚠️ [useDynamicOptions] Max auth retries reached, not refreshing integrations');
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
      // Handle Google services which might use different provider IDs
      let lookupProviderId = providerId;

      const resolveIntegration = () => {
        let resolved: any = null;
        let resolvedLookup = providerId;

        // If requesting google-drive-folders, prefer the Drive integration
        if (resourceType === 'google-drive-folders' && providerId !== 'google-drive') {
          resolvedLookup = 'google-drive';
        }

        if (providerId === 'google-calendar') {
          resolved = getIntegrationByProvider('google-calendar') ||
                     getIntegrationByProvider('google_calendar') ||
                     getIntegrationByProvider('google');
          logger.debug('🔍 [useDynamicOptions] Google Calendar integration lookup:', {
            providerId,
            integrationFound: !!resolved,
            integrationProvider: resolved?.provider,
            integrationId: resolved?.id,
            integrationStatus: resolved?.status
          });
        } else if (providerId === 'google-sheets') {
          resolved = getIntegrationByProvider('google-sheets') ||
                     getIntegrationByProvider('google_sheets') ||
                     getIntegrationByProvider('google');
        } else if (resolvedLookup === 'google-drive') {
          resolved = getIntegrationByProvider('google-drive') ||
                     getIntegrationByProvider('google_drive') ||
                     getIntegrationByProvider('google');
        } else if (providerId === 'google-docs') {
          resolved = getIntegrationByProvider('google-docs') ||
                     getIntegrationByProvider('google_docs') ||
                     getIntegrationByProvider('google');
        } else if (providerId === 'microsoft-excel') {
          resolved = getIntegrationByProvider('microsoft-excel');
          logger.debug('🔍 [useDynamicOptions] Microsoft Excel integration lookup:', {
            providerId,
            integrationFound: !!resolved,
            integrationProvider: resolved?.provider,
            integrationId: resolved?.id,
            integrationStatus: resolved?.status
          });
        } else {
          resolved = getIntegrationByProvider(providerId);
        }

        return { resolvedIntegration: resolved, resolvedLookupProviderId: resolvedLookup };
      };

      const resolveResult = resolveIntegration();
      integration = resolveResult.resolvedIntegration;
      lookupProviderId = resolveResult.resolvedLookupProviderId;

      // Special logging for Discord commands field
      if ((fieldName === 'command' && providerId === 'discord') || (providerId === 'discord' && !integration)) {
        // Get all integrations from store to debug
        const allIntegrations = useIntegrationStore.getState().integrations;
        logger.debug('🐛 [useDynamicOptions] Discord integration debug:', {
          fieldName,
          providerId,
          resourceType,
          integrationFound: !!integration,
          totalIntegrations: allIntegrations.length,
          allProviderIds: allIntegrations.map(i => i.provider),
          discordIntegrations: allIntegrations.filter(i => i.provider?.toLowerCase().includes('discord')),
          lookupProviderId,
          integrationStore: {
            loading: useIntegrationStore.getState().loading,
            lastFetchTime: useIntegrationStore.getState().lastFetchTime
          }
        });
      }

      // Special logging for Trello template field
      if (fieldName === 'template' && providerId === 'trello') {
        logger.debug('🎯 [useDynamicOptions] Trello template field integration check:', {
          providerId,
          fieldName,
          integrationFound: !!integration,
          integrationId: integration?.id,
          integrationStatus: integration?.status,
          resourceType
        });
      }

      // Debug: Check what integrations we have
      const allIntegrations = useIntegrationStore.getState().integrations;

      // Logging removed - field working correctly

      logger.debug('🔍 [useDynamicOptions] Looking for integration:', {
        providerId,
        fieldName,
        integrationFound: !!integration,
        integrationId: integration?.id,
        totalIntegrations: allIntegrations.length,
        allProviders: allIntegrations.map(i => i.provider),
        stripeIntegrations: allIntegrations.filter(i => i.provider?.toLowerCase().includes('stripe'))
      });

      if (!integration) {
        logger.debug('⚠️ [useDynamicOptions] No integration found for provider:', providerId);
        logger.debug('🔍 [useDynamicOptions] Total integrations in store:', allIntegrations.length);
        logger.debug('🔍 [useDynamicOptions] All provider IDs:', allIntegrations.map(i => i.provider));
        logger.debug('🔍 [useDynamicOptions] Stripe integrations:', allIntegrations.filter(i => i.provider?.toLowerCase().includes('stripe')));

        const providerKey = lookupProviderId || providerId;
        const lastAttempt = integrationFetchAttempts.current.get(providerKey);

        if (!silent && (!lastAttempt || Date.now() - lastAttempt > 5000)) {
          integrationFetchAttempts.current.set(providerKey, Date.now());
          try {
            logger.debug('🔁 [useDynamicOptions] Fetching integrations for provider:', providerKey);
            await fetchIntegrations(true);
          } catch (fetchError: any) {
            logger.error('❌ [useDynamicOptions] Failed to fetch integrations for provider:', providerKey, fetchError);
          }

          const retryResult = resolveIntegration();
          integration = retryResult.resolvedIntegration;
          lookupProviderId = retryResult.resolvedLookupProviderId;

          // Log retry result for Discord
          if (providerId === 'discord') {
            const allIntegrations = useIntegrationStore.getState().integrations;
            logger.debug('🔁 [useDynamicOptions] Discord integration after retry:', {
              fieldName,
              integrationFound: !!integration,
              integrationId: integration?.id,
              totalIntegrations: allIntegrations.length,
              allProviderIds: allIntegrations.map(i => i.provider)
            });
          }
        }

        if (!integration) {
          // Special handling for Trello board templates - they don't require integration
          if (resourceType === 'trello_board_templates') {
            logger.debug('📋 [useDynamicOptions] Loading Trello templates without integration');
            // Create a fake integration object for the templates
            integration = {
              id: 'trello-templates-fake',
              provider: 'trello',
              status: 'connected'
            };
          } else {
            // Clear the field data
            setDynamicOptions(prev => ({
              ...prev,
              [fieldName]: []
            }));
            // Only clear loading if this is still the current request
            if (activeRequestIds.current.get(requestKey) === requestId) {
              loadingFields.current.delete(requestKey);
              setLoading(false);
              activeRequestIds.current.delete(requestKey);
              // Clear loading state via callback
              if (!silent) {
                onLoadingChangeRef.current?.(fieldName, false);
              }
            }
            return;
          }
        }
      }

      // Special handling for dynamic Airtable fields (linked records)
      if (fieldName.startsWith('airtable_field_') && providerId === 'airtable') {

        // First, check if this is one of our special dropdown fields
        // Extract the actual field name (without the prefix)
        const actualFieldName = fieldName.replace('airtable_field_', '');
        const actualFieldNameLower = actualFieldName.toLowerCase().replace(/\s+/g, ' ');
        const isDropdownField =
          actualFieldNameLower.includes('draft name') ||
          actualFieldNameLower.includes('designer') ||
          actualFieldNameLower.includes('associated project') ||
          actualFieldNameLower.includes('feedback') ||
          actualFieldNameLower.includes('task');

        // If it's a dropdown field, skip all the linked record handling and go to custom loader
        if (isDropdownField) {
          logger.debug(`🔍 [useDynamicOptions] Detected dropdown field ${fieldName}, skipping linked record handling to use custom loader`);
          // Don't return here - let it fall through to the custom loader section below
        } else {
          // It's not a dropdown field, do the normal linked record handling

          // Get the form values to find the base and linked table info
          const formValues = getFormValues?.() || {};
          const baseId = extraOptions?.baseId || formValues.baseId;

          if (!baseId) {
            setDynamicOptions(prev => ({
              ...prev,
              [fieldName]: []
            }));
            // Only clear loading if this is still the current request
            if (activeRequestIds.current.get(requestKey) === requestId) {
              loadingFields.current.delete(requestKey);
              setLoading(false);
              activeRequestIds.current.delete(requestKey);
            }
            return;
          }

          // Use tableFields from extraOptions if provided, otherwise try to get from cache
          let tableFields = extraOptions?.tableFields;

          if (!tableFields) {
            // Fallback to trying to get from current state
            const selectedTable = dynamicOptions?.tableName?.find((table: any) =>
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
            if (activeRequestIds.current.get(requestKey) === requestId) {
              loadingFields.current.delete(requestKey);
              setLoading(false);
              activeRequestIds.current.delete(requestKey);
            }
            return;
          }

        // Find the field configuration by name (not ID)
        // The field name is "airtable_field_Associated Project" so we extract "Associated Project"
        // actualFieldName is already declared above
        const tableField = tableFields.find((f: any) => f.name === actualFieldName);

        // We've already checked if it's a dropdown field above, so this should always be a linked record field
        logger.debug(`🔍 [useDynamicOptions] Field ${fieldName} is NOT a dropdown field, checking for linked record`);
        // Only do linked record handling for actual linked record fields
          if (!tableField || (tableField.type !== 'multipleRecordLinks' && tableField.type !== 'singleRecordLink')) {
            // Only clear loading and return for non-dropdown fields that aren't linked records
            // Only clear loading if this is still the current request
            if (activeRequestIds.current.get(requestKey) === requestId) {
              loadingFields.current.delete(requestKey);
              setLoading(false);
              activeRequestIds.current.delete(requestKey);
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
            const baseName = tableField.name
              .replace(/^Associated\s*/i, '') // Remove "Associated" prefix
              .replace(/\s*Links?$/i, '') // Remove "Link" or "Links" suffix
              .replace(/\s*Records?$/i, ''); // Remove "Record" or "Records" suffix
            
            // Make it plural if not already
            if (!baseName.match(/s$/i)) {
              linkedTableName = `${baseName }s`;
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
            if (activeRequestIds.current.get(requestKey) === requestId) {
              loadingFields.current.delete(requestKey);
              setLoading(false);
              activeRequestIds.current.delete(requestKey);
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
                  label = `${label.substring(0, 47) }...`;
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
          if (activeRequestIds.current.get(requestKey) !== requestId) {
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
          if (activeRequestIds.current.get(requestKey) === requestId) {
            loadingFields.current.delete(requestKey);
            setLoading(false);
          }
        }
        return;
        } // End of else block for linked record handling
      }


      // Check for provider-specific loader first (for all providers that have custom loaders)

      try {
        // Import provider registry
        const { providerRegistry } = await import('../providers/registry');
        const loader = providerRegistry.getLoader(providerId, fieldName);


        if (loader) {
          // NOTE: Removed early return caching check - always fetch fresh data from provider loaders

          logger.debug(`🔧 [useDynamicOptions] Using custom loader for ${providerId}/${fieldName}`);

          // For Airtable fields that depend on tableName, ensure baseId and tableName are in extraOptions
          const enhancedExtraOptions = extraOptions || {};
          if (providerId === 'airtable') {
            const formValues = getFormValues?.() || {};
            if (!enhancedExtraOptions.baseId && formValues.baseId) {
              enhancedExtraOptions.baseId = formValues.baseId;
            }
            if (!enhancedExtraOptions.tableName && formValues.tableName) {
              enhancedExtraOptions.tableName = formValues.tableName;
            }
          }

          // For Google Sheets fields that depend on sheetName, ensure spreadsheetId is in extraOptions
          if (providerId === 'google-sheets') {
            const formValues = getFormValues?.() || {};
            if (!enhancedExtraOptions.spreadsheetId && formValues.spreadsheetId) {
              enhancedExtraOptions.spreadsheetId = formValues.spreadsheetId;
            }
            if (!enhancedExtraOptions.sheetName && formValues.sheetName) {
              enhancedExtraOptions.sheetName = formValues.sheetName;
            }
          }

          // For Microsoft Excel fields that depend on worksheetName, ensure workbookId is in extraOptions
          if (providerId === 'microsoft-excel') {
            const formValues = getFormValues?.() || {};
            if (!enhancedExtraOptions.workbookId && formValues.workbookId) {
              enhancedExtraOptions.workbookId = formValues.workbookId;
            }
            if (!enhancedExtraOptions.worksheetName && formValues.worksheetName) {
              enhancedExtraOptions.worksheetName = formValues.worksheetName;
            }
          }

          // Always use the integration ID from the integration record
          // For workspace-dependent fields, the workspace ID is passed via options
          const actualIntegrationId = integration.id;


          let formattedOptions;

          try {
            formattedOptions = await loader.loadOptions({
              fieldName,
              nodeType,
              providerId,
              integrationId: actualIntegrationId,
              dependsOn,
              dependsOnValue,
              forceRefresh,
              formValues: getFormValues?.(),
              extraOptions: {
                ...enhancedExtraOptions,
                ...(workflowId && { workflowId })
              }
            });

          } catch (loaderError) {
            logger.error('❌ [useDynamicOptions] ERROR calling loader.loadOptions:', {
              error: loaderError,
              message: loaderError instanceof Error ? loaderError.message : String(loaderError),
              stack: loaderError instanceof Error ? loaderError.stack : undefined,
              fieldName,
              providerId
            });
            throw loaderError; // Re-throw to be caught by outer catch
          }

          logger.debug(`📊 [useDynamicOptions] Loader returned options for ${fieldName}:`, {
            optionsCount: formattedOptions?.length || 0,
            firstOption: formattedOptions?.[0],
            requestId,
            currentRequestId: activeRequestIds.current.get(requestKey),
            isCurrentRequest: activeRequestIds.current.get(requestKey) === requestId
          });

          // Check if this is still the current request
          // Exception: If we have no options yet and this request has data, use it anyway
          const currentOptions = dynamicOptionsRef.current[fieldName];
          const hasNoOptions = !currentOptions || currentOptions.length === 0;
          const hasNewData = formattedOptions && formattedOptions.length > 0;

          let isAcceptingStaleData = false;
          if (activeRequestIds.current.get(requestKey) !== requestId) {
            // If we have no options but this request has data, accept it
            if (hasNoOptions && hasNewData) {
              logger.debug(`✅ [useDynamicOptions] Request ${requestId} is not current but accepting data for ${fieldName} since we have no options`);
              isAcceptingStaleData = true;
            } else {
              logger.debug(`⚠️ [useDynamicOptions] Request ${requestId} is no longer current for ${fieldName}, skipping state update`);
              return;
            }
          }

          logger.debug(`✅ [useDynamicOptions] Setting dynamic options for ${fieldName} with ${formattedOptions?.length || 0} options`);

          // Save to cache store if field should be cached
          if (shouldCacheField(fieldName) && formattedOptions && formattedOptions.length > 0) {
            const cacheKey = buildCacheKey(providerId, providerId, fieldName, dependsOnValue ? { [dependsOn || 'parent']: dependsOnValue } : undefined)
            const ttl = getFieldTTL(fieldName)
            setCache(cacheKey, formattedOptions, ttl)
            logger.debug(`💾 [useDynamicOptions] Cached ${formattedOptions.length} options for ${fieldName}:`, { cacheKey, ttl })
          }

          // Track performance for searchField
          const setOptionsStartTime = performance.now();

          setDynamicOptions(prev => {
            // Check if the options are actually different before updating
            const currentFieldOptions = prev[fieldName];
            const areOptionsSame =
              currentFieldOptions &&
              formattedOptions &&
              currentFieldOptions.length === formattedOptions.length &&
              JSON.stringify(currentFieldOptions) === JSON.stringify(formattedOptions);

            if (areOptionsSame) {
              logger.debug(`🔄 [useDynamicOptions] Options for ${fieldName} are identical, skipping state update`);
              return prev;
            }

            if (providerId === 'trello' && integration && integration.status !== 'connected') {
              try {
                fetchIntegrations(true);
              } catch (refreshError) {
                logger.warn('⚠️ [useDynamicOptions] Failed to refresh integrations after Trello data load:', refreshError);
              }
            }

            const newState = {
              ...prev,
              [fieldName]: formattedOptions
            };
            logger.debug(`📝 [useDynamicOptions] State update for ${fieldName}:`, {
              previousValue: prev[fieldName],
              newValue: formattedOptions,
              fullNewState: newState
            });
            return syncLinkedOptions(newState);
          });

          // Log how long setState took for searchField
          if (fieldName === 'searchField') {
            const setOptionsDuration = performance.now() - setOptionsStartTime;

            // Use requestAnimationFrame to check when React has painted
            requestAnimationFrame(() => {
              const totalDuration = performance.now() - setOptionsStartTime;
            });
          }

          // Record last loaded time for throttle
          lastLoadedAt.current.set(requestKey, Date.now());

          // Clear loading state - also clear when accepting stale data to prevent stuck loading
          if (activeRequestIds.current.get(requestKey) === requestId || isAcceptingStaleData) {
            loadingFields.current.delete(requestKey);
            setLoading(false);

            // Only clean up request tracking if this is the current request
            if (activeRequestIds.current.get(requestKey) === requestId) {
              activeRequestIds.current.delete(requestKey);
            }

            if (!silent) {
              onLoadingChangeRef.current?.(fieldName, false);
            }
          }
          
          return;
        }
      } catch (error) {
        logger.debug(`⚠️ [useDynamicOptions] Error using custom loader for ${providerId}, falling back to default: ${error}`);
        // Fall through to use regular integration data loading
      }
      
      if (!resourceType) {
        // Only warn for fields that are expected to have dynamic options but don't
        const expectedDynamicFields = ['guildId', 'channelId', 'roleId', 'userId', 'boardId', 'baseId', 'tableId', 'workspaceId'];
        if (expectedDynamicFields.includes(fieldName)) {
        } else {
        }
        // Only clear loading if this is still the current request
        if (activeRequestIds.current.get(requestKey) === requestId) {
          loadingFields.current.delete(requestKey);
          setLoading(false);
          activeRequestIds.current.delete(requestKey);
        }
        return;
      }

      // Load integration data with proper options
      options = dependsOn && dependsOnValue ? { [dependsOn]: dependsOnValue } : {};

      // Merge in extraOptions if provided (e.g., baseId for Airtable tables)
      if (extraOptions) {
        options = { ...options, ...extraOptions };
        logger.debug(`🔧 [useDynamicOptions] Merged extraOptions into request options:`, {
          fieldName,
          options,
          extraOptions
        });
      }

      // Check if this field depends on another field and the dependency value is missing
      if (dependsOn && !dependsOnValue) {
        logger.debug(`⚠️ [useDynamicOptions] Skipping load for ${fieldName} - missing dependency value for ${dependsOn}`);
        setDynamicOptions(prev => ({
          ...prev,
          [fieldName]: []
        }));
        // Clear loading state
        if (activeRequestIds.current.get(requestKey) === requestId) {
          loadingFields.current.delete(requestKey);
          setLoading(false);
          activeRequestIds.current.delete(requestKey);
        }
        return;
      }

      // Special handling for Notion page blocks - API expects pageId instead of page
      if (resourceType === 'notion_page_blocks' && dependsOn === 'page') {
        const formValues = getFormValues?.() || {};
        options = {
          pageId: dependsOnValue,
          workspace: formValues.workspace // Include workspace for proper token selection
        };
      }

      // Special handling for Trello cards - API expects boardId and optionally listId
      if (resourceType === 'trello_cards') {
        const formValues = getFormValues?.() || {};

        // If cardId depends on listId, use listId as the primary filter and get boardId from form
        if (dependsOn === 'listId') {
          const boardId = formValues.boardId;

          if (!boardId) {
            // Don't proceed without boardId
            return;
          }

          options = { boardId, listId: dependsOnValue };
        }
        // If cardId depends on boardId, check if listId is available for filtering
        else if (dependsOn === 'boardId') {
          const listId = formValues.listId;
          options = listId
            ? { boardId: dependsOnValue, listId }
            : { boardId: dependsOnValue };
        }
      }

      // For Google Sheets sheets, don't call API without spreadsheetId
      if (fieldName === 'sheetName' && resourceType === 'google-sheets_sheets' && !dependsOnValue) {
        return;
      }

      // Special handling for Microsoft Excel columns - requires both workbookId and worksheetName
      if (resourceType === 'microsoft-excel_columns' || resourceType?.startsWith('microsoft-excel_column')) {
        const formValues = getFormValues?.() || {};
        const workbookId = extraOptions?.workbookId || formValues.workbookId;
        const worksheetName = dependsOnValue || extraOptions?.worksheetName || formValues.worksheetName;

        if (!workbookId || !worksheetName) {
          logger.debug(`⚠️ [useDynamicOptions] Skipping Microsoft Excel columns - missing workbookId or worksheetName:`, {
            workbookId,
            worksheetName,
            fieldName
          });
          return;
        }

        options = {
          ...options,
          workbookId,
          worksheetName
        };
        logger.debug(`🔧 [useDynamicOptions] Microsoft Excel columns options:`, options);
      }
      
      // For Airtable fields used by filterField, use records approach to infer fields quickly
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
          if (activeRequestIds.current.get(requestKey) !== requestId) {
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

      // For Airtable fields in general (e.g., watchedFieldIds, searchField), ensure baseId + tableName are passed
      if (resourceType === 'airtable_fields' && fieldName !== 'filterField') {
        logger.debug(`🔍 [useDynamicOptions] Loading airtable_fields for ${fieldName}:`, {
          dependsOn,
          dependsOnValue,
          hasExtraOptions: !!extraOptions,
          extraOptionsBaseId: extraOptions?.baseId,
        });

        // Require the dependent table value
        if (dependsOn === 'tableName' && !dependsOnValue) {
          logger.warn(`⚠️ [useDynamicOptions] Missing tableName for ${fieldName}, returning early`);
          return;
        }
        const formValues = getFormValues?.() || {};
        const baseId = extraOptions?.baseId || formValues.baseId;
        const tableName = dependsOnValue || formValues.tableName;

        logger.debug(`🔍 [useDynamicOptions] Resolved values for ${fieldName}:`, {
          baseId,
          tableName,
          fromExtraOptions: !!extraOptions?.baseId,
          fromFormValues: !!formValues.baseId,
        });

        if (!baseId || !tableName) {
          logger.warn(`⚠️ [useDynamicOptions] Missing baseId or tableName for ${fieldName}:`, {
            baseId,
            tableName,
            formValues,
            extraOptions
          });
          return;
        }
        options = { baseId, tableName };
        logger.debug(`✅ [useDynamicOptions] Will fetch ${fieldName} with options:`, options);
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
            if (activeRequestIds.current.get(requestKey) !== requestId) {
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
          if (activeRequestIds.current.get(requestKey) !== requestId) {
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
                if (activeRequestIds.current.get(requestKey) !== requestId) {
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
          if (activeRequestIds.current.get(requestKey) !== requestId) {
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
      // Fetch from API
      let formattedOptions: any[] = [];
      try {

          logger.debug('📡 [useDynamicOptions] Calling loadIntegrationData:', {
            fieldName,
            resourceType,
            integrationId: integration.id,
            options,
            dependsOn,
            dependsOnValue
          });
          const result = await loadIntegrationData(resourceType, integration.id, options, forceRefresh);


          // Check if this is still the current request
          // This is crucial because loadIntegrationData might not support abort signals
          if (activeRequestIds.current.get(requestKey) !== requestId) {
            // Special handling for fields that should always use fresh data when available
            // Include Slack channels, Trello boards, Trello lists, and Airtable tables since they're critical for actions/triggers
            if (fieldName === 'authorFilter' ||
                fieldName === 'channel' ||
                resourceType === 'slack_channels' ||
                fieldName === 'boardId' ||
                resourceType === 'trello_boards' ||
                resourceType === 'trello_board_templates' ||
                fieldName === 'listId' ||
                resourceType === 'trello_lists' ||
                fieldName === 'cardId' ||
                resourceType === 'trello_cards' ||
                fieldName === 'watchedTables' ||
                resourceType === 'airtable_tables') {
              logger.debug(`✅ [useDynamicOptions] Using fresh data for ${fieldName} despite superseded request`);
              // Continue to update state for these critical fields
            } else {
              logger.debug(`⏭️ [useDynamicOptions] Request ${requestId} superseded for ${fieldName}, skipping state update`);
              // Clear loading state for superseded request to prevent stuck loading
              if (loadingFields.current.has(requestKey)) {
                loadingFields.current.delete(requestKey);
                setLoading(false);
                // Also notify per-field UI to stop showing the loading placeholder
                if (!silent) {
                  onLoadingChangeRef.current?.(fieldName, false);
                }
                logger.debug(`🧹 [useDynamicOptions] Cleared loading state for superseded ${fieldName}`);
              }
              return; // Don't update state if this request was superseded for other fields
            }
          }

          // Format the results - extract data array from response object if needed
          const dataArray = result.data || result;

          formattedOptions = formatOptionsForField(fieldName, dataArray);

          // PHASE 1: Cache provider-level data (bases/tables/fields) for instant reuse
          if (isProviderLevelField && userId && dataArray && dataArray.length > 0) {
            const dataType = resourceType === 'airtable_bases' ? 'bases' :
                           resourceType === 'airtable_tables' ? 'tables' : 'fields';
            const parentId = dataType === 'tables' ? dependsOnValue :
                           dataType === 'fields' ? dependsOnValue : undefined;

            logger.debug(`💾 [PROVIDER CACHE] Caching ${dataType}`, {
              fieldName,
              count: dataArray.length,
              parentId
            });

            cacheProviderData(providerId, userId, dataType, dataArray, parentId);

            // PHASE 3: Predictive prefetching - when bases/tables load, prefetch next level
            if (dataType === 'bases' && dataArray.length > 0 && getFormValues) {
              const currentFormValues = getFormValues();
              const selectedBaseId = currentFormValues?.baseId;

              // If a base is already selected, prefetch its tables
              if (selectedBaseId) {
                logger.debug(`🔮 [PREDICTIVE PREFETCH] Base is selected, prefetching tables`, {
                  baseId: selectedBaseId
                });

                // Prefetch tables silently in background
                setTimeout(() => {
                  loadOptions('tableName', 'baseId', selectedBaseId, false, true).catch(err => {
                    logger.debug(`[PREDICTIVE PREFETCH] Tables prefetch failed (silent):`, err);
                  });
                }, 100); // Small delay to not block UI
              }
            } else if (dataType === 'tables' && dataArray.length > 0 && getFormValues) {
              const currentFormValues = getFormValues();
              const selectedTableName = currentFormValues?.tableName;

              // If a table is already selected, prefetch its fields
              if (selectedTableName) {
                logger.debug(`🔮 [PREDICTIVE PREFETCH] Table is selected, prefetching fields`, {
                  tableName: selectedTableName
                });

                // Prefetch fields silently in background
                setTimeout(() => {
                  // Check which field types need fields (like fieldName, statusFieldName, etc.)
                  const fieldsToPreload = ['fieldName', 'statusFieldName', 'assigneeFieldName', 'dueDateFieldName'];
                  fieldsToPreload.forEach(fieldToLoad => {
                    loadOptions(fieldToLoad, 'tableName', selectedTableName, false, true).catch(err => {
                      logger.debug(`[PREDICTIVE PREFETCH] Fields prefetch failed for ${fieldToLoad} (silent):`, err);
                    });
                  });
                }, 100); // Small delay to not block UI
              }
            }
          }

          // Log for watchedTables / airtable_tables
          if (fieldName === 'watchedTables' || resourceType === 'airtable_tables') {
          }
        } catch (apiError: any) {
          logger.error(`❌ [useDynamicOptions] Failed to load ${resourceType}:`, apiError);

          // For Trello board templates, use hardcoded fallback if API fails
          if (resourceType === 'trello_board_templates') {
            logger.debug('🔄 [useDynamicOptions] Using fallback Trello templates');
            formattedOptions = [
              { value: 'basic', label: 'Basic Board' },
              { value: 'kanban', label: 'Kanban Board' },
              { value: 'project-management', label: 'Project Management' },
              { value: 'agile-board', label: 'Agile Board' },
              { value: 'simple-project-board', label: 'Simple Project Board' },
              { value: 'weekly-planner', label: 'Weekly Planner' }
            ];
          } else {
            throw apiError; // Re-throw for other fields
          }
        }

      // Log successful data formatting for critical fields
      if (fieldName === 'channel' || resourceType === 'slack_channels') {
        logger.debug(`📊 [useDynamicOptions] Formatted ${fieldName} options:`, {
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

      // Save to cache store if field should be cached
      if (shouldCacheField(fieldName) && formattedOptions && formattedOptions.length > 0) {
        const cacheKey = buildCacheKey(providerId, providerId, fieldName, dependsOnValue ? { [dependsOn || 'parent']: dependsOnValue } : undefined)
        const ttl = getFieldTTL(fieldName)
        setCache(cacheKey, formattedOptions, ttl)
        logger.debug(`💾 [useDynamicOptions] Cached ${formattedOptions.length} options for ${fieldName} after loadIntegrationData:`, { cacheKey, ttl })
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

        // Log state update for ALL fields including watchedTables
        if (fieldName === 'watchedTables' || fieldName === 'channel' || resourceType === 'slack_channels' || resourceType === 'airtable_tables') {
        }

        return syncLinkedOptions(updated);
      });
      // Record last loaded time for throttle
      lastLoadedAt.current.set(requestKey, Date.now());
      
      // Clear loading state on successful completion
      // For critical fields (authorFilter, Trello cards/lists, watchedTables), always clear the loading state when we have data
      if (fieldName === 'authorFilter' ||
          fieldName === 'cardId' ||
          fieldName === 'listId' ||
          fieldName === 'watchedTables' ||
          resourceType === 'trello_cards' ||
          resourceType === 'trello_lists' ||
          resourceType === 'airtable_tables') {
        logger.debug(`🧹 [useDynamicOptions] Clearing loading state for ${fieldName} (critical field)`);
        loadingFields.current.delete(requestKey);
        setLoading(false);

        // Clean up the abort controller and request ID
        abortControllers.current.delete(requestKey);
        activeRequestIds.current.delete(requestKey);

        // Clear loading state via callback
        if (!silent) {
          onLoadingChangeRef.current?.(fieldName, false);
          logger.debug(`✅ [useDynamicOptions] Called onLoadingChange(${fieldName}, false)`);
        }
      } else if (activeRequestIds.current.get(requestKey) === requestId) {
        // For other fields, only clear if this is still the current request
        loadingFields.current.delete(requestKey);
        setLoading(false);

        // Clean up the abort controller and request ID since we're done
        abortControllers.current.delete(requestKey);
        activeRequestIds.current.delete(requestKey);

        // Only clear loading states if not in silent mode
        if (!silent) {
          if (fieldName === 'tableName') {
          }
          onLoadingChangeRef.current?.(fieldName, false);
        }
      } else {
        logger.debug(`⚠️ [useDynamicOptions] Not clearing loading for ${fieldName} - request superseded`);
      }
      
    } catch (error: any) {
      // Check if the error was due to abort
      if (error.name === 'AbortError') {
        // Don't update state or clear loading for aborted requests
        // The loading state should persist until the new request completes
        return;
      }

      // CRITICAL: Log the actual error that caused failure
      logger.error(`🚨 [useDynamicOptions] ERROR loading ${fieldName}:`, {
        fieldName,
        resourceType: getResourceTypeForField(fieldName, nodeType),
        error: error.message,
        stack: error.stack,
        requestKey
      });

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
      if (activeRequestIds.current.get(requestKey) === requestId) {
        // Only clear if this is still the current request
        loadingFields.current.delete(requestKey);
        setLoading(false);
        
        // Clean up tracking
        abortControllers.current.delete(requestKey);
        activeRequestIds.current.delete(requestKey);
        
        // Clear loading state via callback if not in silent mode
        if (!silent) {
          onLoadingChangeRef.current?.(fieldName, false);
        }
      } else {
        // If superseded, ensure per-field UI is not stuck in loading
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
      // Unified cleanup to avoid stuck loading states
      if (activeRequestIds.current.get(requestKey) === requestId) {
        loadingFields.current.delete(requestKey);
        setLoading(false);
        if (!silent) onLoadingChangeRef.current?.(fieldName, false);
        activeRequestIds.current.delete(requestKey);
      }
      abortControllers.current.delete(requestKey);
      const t = staleTimers.current.get(requestKey);
      if (t) {
        clearTimeout(t);
        staleTimers.current.delete(requestKey);
      }
      activeRequests.current.delete(activeRequestKey);
    }
  }, [nodeType, providerId, getIntegrationByProvider, loadIntegrationData, getFormValues]); // Removed dynamicOptions and onLoadingChange from dependencies to prevent infinite loops - using refs instead

  // Track previous values to avoid unnecessary clears (uses prevNodeTypeRef declared earlier)
  const prevProviderIdRef = useRef(providerId);

  // Clear all options when node type changes
  // NOTE: This effect is SEPARATE from the reset effect above (lines 178-208) which handles
  // resetting dynamicOptions state. This effect handles aborting requests and clearing tracking refs.
  useEffect(() => {
    // Only clear if values actually changed
    if (prevNodeTypeRef.current === nodeType && prevProviderIdRef.current === providerId) {
      return;
    }

    // Update refs (prevNodeTypeRef is also updated in the earlier reset effect)
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
    const guildControllers = new Map<string, AbortController>();
    abortControllers.current.forEach((controller, key) => {
      if (key.startsWith('guildId')) {
        guildControllers.set(key, controller);
      }
    });
    abortControllers.current = guildControllers;

    // Clear request IDs except for Discord guilds
    const guildRequestIds = new Map<string, number>();
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
    
  }, [nodeType, providerId]);

  // Preload independent fields when modal opens
  useEffect(() => {
    if (!nodeType || !providerId) return;

    // Preload fields that don't depend on other fields
    // Note: Exclude email fields (like 'email') since they should load on-demand only
    // Also exclude dependent fields like messageId (depends on channelId), channelId (depends on guildId), etc.
    // Also exclude fields with loadOnMount: true as they are handled by ConfigurationForm
    const independentFields = ['baseId', 'guildId', 'workspace', 'workspaceId'];

    // Load all independent fields in parallel for faster initial load
    const fieldsToLoad = independentFields.filter(fieldName => {
      const resourceType = getResourceTypeForField(fieldName, nodeType);
      return !!resourceType;
    });

    if (fieldsToLoad.length > 0) {
      logger.debug('🚀 [useDynamicOptions] Loading independent fields in parallel:', fieldsToLoad);
      Promise.all(fieldsToLoad.map(fieldName => loadOptions(fieldName))).catch(err => {
        logger.error('❌ [useDynamicOptions] Error loading independent fields:', err);
      });
    }
    
    // Cleanup function when component unmounts
    return () => {
      logger.debug('🧹 [useDynamicOptions] Cleanup triggered', { nodeType, providerId });

      // Abort ALL active fetch requests (including Discord guilds on unmount)
      abortControllers.current.forEach((controller, key) => {
        logger.debug(`🛑 [useDynamicOptions] Aborting request: ${key}`);
        controller.abort();
      });

      // Clear all controllers
      abortControllers.current.clear();

      // Clear all request IDs
      activeRequestIds.current.clear();

      // Cancel all active requests
      activeRequests.current.forEach((promise, key) => {
        logger.debug(`❌ [useDynamicOptions] Clearing active request: ${key}`);
      });

      // Clear all state
      loadingFields.current.clear();
      activeRequests.current.clear();
      setLoading(false);
      setIsInitialLoading(false);

      // Reset auth retry count
      authErrorRetryCount = 0;

      // Don't clear dynamic options here - they might be needed for saved values
      // The options will be updated when new data loads
      // setDynamicOptions({}); // REMOVED - this was clearing saved options

      logger.debug('✅ [useDynamicOptions] Cleanup complete');
    };
  }, [nodeType, providerId]); // Removed loadOptions from dependencies to prevent loops

  // Clear cache when workflow changes for fresh data
  useEffect(() => {
    if (!workflowId) return;

    logger.debug('🔄 [useDynamicOptions] Workflow changed, clearing expired cache...', { workflowId });

    // Clear all expired cache entries
    if (typeof window !== 'undefined') {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('dynamicOptions_')) {
          try {
            const cached = localStorage.getItem(key);
            if (cached) {
              const { timestamp } = JSON.parse(cached);
              if (Date.now() - timestamp > CACHE_TTL) {
                keysToRemove.push(key);
              }
            }
          } catch (error) {
            // Invalid cache entry, remove it
            keysToRemove.push(key);
          }
        }
      }

      keysToRemove.forEach(key => {
        logger.debug(`🗑️ [useDynamicOptions] Removing expired cache: ${key}`);
        localStorage.removeItem(key);
      });
    }
  }, [workflowId]);

  // Log when initialOptions are provided
  useEffect(() => {
    if (initialOptions && Object.keys(initialOptions).length > 0) {
      logger.debug('📥 [useDynamicOptions] Hook initialized with saved options:', {
        fields: Object.keys(initialOptions),
        counts: Object.entries(initialOptions).map(([key, value]) =>
          ({ field: key, count: Array.isArray(value) ? value.length : 0 })
        )
      });
    }
  }, []); // Only log on mount

  // Debug logging for current state
  useEffect(() => {
    const airtableFields = Object.keys(dynamicOptions).filter(key =>
      key.startsWith('airtable_field_')
    );
    if (airtableFields.length > 0) {
      logger.debug(`🔍 [useDynamicOptions] Current Airtable field options:`,
        airtableFields.reduce((acc, key) => {
          acc[key] = {
            hasOptions: !!dynamicOptions[key],
            optionCount: dynamicOptions[key]?.length || 0,
            firstOption: dynamicOptions[key]?.[0]
          };
          return acc;
        }, {} as Record<string, any>)
      );
    }
  }, [dynamicOptions]);

  /**
   * Load multiple fields in parallel
   * Used for instant loading optimization
   * NOTE: No deduplication here - each modal open should fetch fresh data
   */
  const loadOptionsParallel = useCallback(async (
    fields: Array<{ fieldName: string; dependsOn?: string; dependsOnValue?: any }>
  ): Promise<void> => {
    logger.debug(`🚀 [useDynamicOptions] Parallel load started for ${fields.length} fields`)

    // Load all fields in parallel using Promise.allSettled
    // Force refresh to ensure fresh data on every modal open
    const results = await Promise.allSettled(
      fields.map(({ fieldName, dependsOn, dependsOnValue }) =>
        loadOptions(fieldName, dependsOn, dependsOnValue, true, true)
      )
    )

    // Log results
    const succeeded = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    logger.debug(`✅ [useDynamicOptions] Parallel load completed: ${succeeded} succeeded, ${failed} failed`)

    if (failed > 0) {
      const errors = results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map(r => r.reason)
      logger.warn('⚠️ [useDynamicOptions] Some parallel loads failed:', errors)
    }
  }, [loadOptions])

  return {
    dynamicOptions,
    loading,
    isInitialLoading,
    loadOptions,
    loadOptionsParallel,
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
