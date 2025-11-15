/**
 * Field Configuration Cache
 *
 * Caches field labels and options for instant display when reopening config modals.
 * This ensures users see their saved configuration immediately without waiting for API calls.
 *
 * Phase 1: Stale-while-revalidate pattern for instant loading
 * Phase 2: Database-backed cache (coming soon)
 */

export interface CachedFieldData {
  label: string;
  value: any;
  timestamp: number;
}

export interface CachedFieldSchema {
  name: string;
  label: string;
  type: string;
  options?: Array<{ value: any; label: string }>;
  required?: boolean;
  placeholder?: string;
  description?: string;
  dynamic?: string;
  dependsOn?: string;
  [key: string]: any; // Allow other field properties
}

export interface CachedNodeConfig {
  nodeId: string;
  workflowId: string;
  fields: Record<string, CachedFieldData>;
  fieldSchemas?: CachedFieldSchema[]; // Complete field definitions for instant display
  lastUpdated: number;
}

// Provider-level cache for bases/tables (shared across workflows)
export interface ProviderCache {
  providerId: string;
  userId: string;
  dataType: 'bases' | 'tables' | 'fields';
  parentId?: string; // e.g., baseId for tables, tableId for fields
  data: any[];
  timestamp: number;
}

const CACHE_KEY_PREFIX = 'workflow_field_cache_';
const PROVIDER_CACHE_PREFIX = 'provider_data_cache_';
const CACHE_VERSION = 1;
const CACHE_EXPIRY_DAYS = 30; // Keep field cache for 30 days
const BASES_CACHE_EXPIRY_DAYS = 7; // Bases rarely change, cache for 7 days

/**
 * Generate a cache key for a specific node in a workflow
 */
function getCacheKey(workflowId: string, nodeId: string): string {
  return `${CACHE_KEY_PREFIX}v${CACHE_VERSION}_${workflowId}_${nodeId}`;
}

/**
 * Check if cached data is still valid
 */
function isCacheValid(timestamp: number): boolean {
  const expiryMs = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - timestamp < expiryMs;
}

/**
 * Save field configuration to cache
 */
export function cacheNodeConfig(
  workflowId: string,
  nodeId: string,
  fieldName: string,
  value: any,
  label: string
): void {
  try {
    const cacheKey = getCacheKey(workflowId, nodeId);

    // Get existing cache or create new
    let cached: CachedNodeConfig;
    const existing = localStorage.getItem(cacheKey);

    if (existing) {
      cached = JSON.parse(existing);
    } else {
      cached = {
        nodeId,
        workflowId,
        fields: {},
        lastUpdated: Date.now()
      };
    }

    // Update the specific field
    cached.fields[fieldName] = {
      label,
      value,
      timestamp: Date.now()
    };

    cached.lastUpdated = Date.now();

    // Save to localStorage
    localStorage.setItem(cacheKey, JSON.stringify(cached));
  } catch (error) {
    // Silently fail if localStorage is not available or full
    console.warn('Failed to cache field config:', error);
  }
}

/**
 * Get cached field configuration for a specific field
 */
export function getCachedFieldData(
  workflowId: string,
  nodeId: string,
  fieldName: string
): CachedFieldData | null {
  try {
    const cacheKey = getCacheKey(workflowId, nodeId);
    const cached = localStorage.getItem(cacheKey);

    if (!cached) return null;

    const config: CachedNodeConfig = JSON.parse(cached);

    // Check if cache is expired
    if (!isCacheValid(config.lastUpdated)) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    const fieldData = config.fields[fieldName];
    if (!fieldData) return null;

    // Check if field data is expired
    if (!isCacheValid(fieldData.timestamp)) {
      return null;
    }

    return fieldData;
  } catch (error) {
    console.warn('Failed to get cached field config:', error);
    return null;
  }
}

/**
 * Get all cached fields for a node
 */
export function getCachedNodeConfig(
  workflowId: string,
  nodeId: string
): Record<string, CachedFieldData> | null {
  try {
    const cacheKey = getCacheKey(workflowId, nodeId);
    const cached = localStorage.getItem(cacheKey);

    if (!cached) return null;

    const config: CachedNodeConfig = JSON.parse(cached);

    // Check if cache is expired
    if (!isCacheValid(config.lastUpdated)) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    return config.fields;
  } catch (error) {
    console.warn('Failed to get cached node config:', error);
    return null;
  }
}

/**
 * Save all field configurations at once (called when saving config modal)
 */
export function cacheAllNodeFields(
  workflowId: string,
  nodeId: string,
  fields: Record<string, { value: any; label: string }>
): void {
  try {
    const cacheKey = getCacheKey(workflowId, nodeId);
    const timestamp = Date.now();

    const cached: CachedNodeConfig = {
      nodeId,
      workflowId,
      fields: {},
      lastUpdated: timestamp
    };

    // Convert all fields to cached format
    Object.entries(fields).forEach(([fieldName, data]) => {
      cached.fields[fieldName] = {
        label: data.label,
        value: data.value,
        timestamp
      };
    });

    localStorage.setItem(cacheKey, JSON.stringify(cached));
  } catch (error) {
    console.warn('Failed to cache all node fields:', error);
  }
}

/**
 * Clear cache for a specific node
 */
export function clearNodeCache(workflowId: string, nodeId: string): void {
  try {
    const cacheKey = getCacheKey(workflowId, nodeId);
    localStorage.removeItem(cacheKey);
  } catch (error) {
    console.warn('Failed to clear node cache:', error);
  }
}

/**
 * Save field schemas for instant display on modal reopen
 */
export function cacheFieldSchemas(
  workflowId: string,
  nodeId: string,
  schemas: CachedFieldSchema[]
): void {
  try {
    const cacheKey = getCacheKey(workflowId, nodeId);
    const existing = localStorage.getItem(cacheKey);

    let cached: CachedNodeConfig;
    if (existing) {
      cached = JSON.parse(existing);
    } else {
      cached = {
        nodeId,
        workflowId,
        fields: {},
        lastUpdated: Date.now()
      };
    }

    cached.fieldSchemas = schemas;
    cached.lastUpdated = Date.now();

    localStorage.setItem(cacheKey, JSON.stringify(cached));
  } catch (error) {
    console.warn('Failed to cache field schemas:', error);
  }
}

/**
 * Get cached field schemas for instant display
 */
export function getCachedFieldSchemas(
  workflowId: string,
  nodeId: string
): CachedFieldSchema[] | null {
  try {
    const cacheKey = getCacheKey(workflowId, nodeId);
    const cached = localStorage.getItem(cacheKey);

    if (!cached) return null;

    const config: CachedNodeConfig = JSON.parse(cached);

    // Check if cache is expired
    if (!isCacheValid(config.lastUpdated)) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    return config.fieldSchemas || null;
  } catch (error) {
    console.warn('Failed to get cached field schemas:', error);
    return null;
  }
}

/**
 * Clear all expired caches (cleanup utility)
 */
export function clearExpiredCaches(): void {
  try {
    const keys = Object.keys(localStorage);
    const now = Date.now();
    const expiryMs = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    keys.forEach(key => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        try {
          const cached = localStorage.getItem(key);
          if (cached) {
            const config: CachedNodeConfig = JSON.parse(cached);
            if (now - config.lastUpdated > expiryMs) {
              localStorage.removeItem(key);
            }
          }
        } catch {
          // Invalid data, remove it
          localStorage.removeItem(key);
        }
      }
    });
  } catch (error) {
    console.warn('Failed to clear expired caches:', error);
  }
}

// ============================================================================
// PROVIDER-LEVEL CACHING (Phase 1)
// Shared cache for bases/tables across all workflows
// ============================================================================

/**
 * Generate cache key for provider data (bases, tables, fields)
 */
function getProviderCacheKey(
  providerId: string,
  userId: string,
  dataType: 'bases' | 'tables' | 'fields',
  parentId?: string
): string {
  const base = `${PROVIDER_CACHE_PREFIX}v${CACHE_VERSION}_${providerId}_${userId}_${dataType}`;
  return parentId ? `${base}_${parentId}` : base;
}

/**
 * Check if provider cache is still valid (stale-while-revalidate)
 * Returns true even for old data (we show stale data while refreshing)
 */
function isProviderCacheUsable(timestamp: number, dataType: 'bases' | 'tables' | 'fields'): boolean {
  const expiryMs = dataType === 'bases'
    ? BASES_CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    : CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

  // For stale-while-revalidate, we accept data up to 2x the expiry time
  // This ensures we ALWAYS show something instantly, even if old
  return Date.now() - timestamp < (expiryMs * 2);
}

/**
 * Check if provider cache needs refresh (but still usable)
 */
export function shouldRefreshProviderCache(
  providerId: string,
  userId: string,
  dataType: 'bases' | 'tables' | 'fields',
  parentId?: string
): boolean {
  try {
    const key = getProviderCacheKey(providerId, userId, dataType, parentId);
    const cached = localStorage.getItem(key);

    if (!cached) return true;

    const cache: ProviderCache = JSON.parse(cached);
    const expiryMs = dataType === 'bases'
      ? BASES_CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
      : CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    // Needs refresh if older than expiry time
    return Date.now() - cache.timestamp > expiryMs;
  } catch {
    return true;
  }
}

/**
 * Cache provider data (bases, tables, fields)
 * Phase 1: localStorage
 * Phase 2: Will be database-backed
 */
export function cacheProviderData(
  providerId: string,
  userId: string,
  dataType: 'bases' | 'tables' | 'fields',
  data: any[],
  parentId?: string
): void {
  try {
    const key = getProviderCacheKey(providerId, userId, dataType, parentId);
    const cache: ProviderCache = {
      providerId,
      userId,
      dataType,
      parentId,
      data,
      timestamp: Date.now()
    };

    localStorage.setItem(key, JSON.stringify(cache));
  } catch (error) {
    console.warn('Failed to cache provider data:', error);
  }
}

/**
 * Get cached provider data (bases, tables, fields)
 * Returns null if not found or expired beyond usable limit
 */
export function getCachedProviderData(
  providerId: string,
  userId: string,
  dataType: 'bases' | 'tables' | 'fields',
  parentId?: string
): any[] | null {
  try {
    const key = getProviderCacheKey(providerId, userId, dataType, parentId);
    const cached = localStorage.getItem(key);

    if (!cached) return null;

    const cache: ProviderCache = JSON.parse(cached);

    // Check if still usable (stale-while-revalidate allows old data)
    if (!isProviderCacheUsable(cache.timestamp, dataType)) {
      localStorage.removeItem(key);
      return null;
    }

    return cache.data;
  } catch (error) {
    console.warn('Failed to get cached provider data:', error);
    return null;
  }
}

/**
 * Clear provider cache for a specific data type
 */
export function clearProviderCache(
  providerId: string,
  userId: string,
  dataType?: 'bases' | 'tables' | 'fields',
  parentId?: string
): void {
  try {
    if (dataType) {
      // Clear specific cache
      const key = getProviderCacheKey(providerId, userId, dataType, parentId);
      localStorage.removeItem(key);
    } else {
      // Clear all caches for this provider
      const keys = Object.keys(localStorage);
      const prefix = `${PROVIDER_CACHE_PREFIX}v${CACHE_VERSION}_${providerId}_${userId}`;
      keys.forEach(key => {
        if (key.startsWith(prefix)) {
          localStorage.removeItem(key);
        }
      });
    }
  } catch (error) {
    console.warn('Failed to clear provider cache:', error);
  }
}

// ============================================================================
// INSTANT REOPEN CACHE (Complete Node Snapshot)
// Stores EVERYTHING needed to instantly restore a saved config
// ============================================================================

export interface InstantReopenSnapshot {
  workflowId: string;
  nodeId: string;
  providerId: string;
  nodeType: string;

  // All form values
  values: Record<string, any>;

  // Display labels for all fields (especially for linked records)
  displayLabels: Record<string, Record<string, string>>; // fieldName -> { value -> label }

  // Bubble suggestions (for multi-select fields)
  bubbles: Record<string, Array<{ value: any; label: string; fieldName?: string }>>;

  // Active bubbles (which bubbles are currently selected)
  activeBubbles: Record<string, number | number[]>;

  // Dynamic options that were loaded
  dynamicOptions: Record<string, Array<{ value: any; label: string }>>;

  // Selected records (for update/delete operations)
  selectedRecord?: any;
  selectedRecords?: any[];

  // Table schema (if loaded)
  tableSchema?: any;

  // Records (if loaded)
  records?: any[];

  timestamp: number;
}

const INSTANT_REOPEN_PREFIX = 'instant_reopen_snapshot_';
const INSTANT_REOPEN_VERSION = 1;

/**
 * Generate cache key for instant reopen snapshot
 */
function getInstantReopenKey(workflowId: string, nodeId: string): string {
  return `${INSTANT_REOPEN_PREFIX}v${INSTANT_REOPEN_VERSION}_${workflowId}_${nodeId}`;
}

/**
 * Save complete snapshot for instant reopen
 * Call this when user saves/closes config modal
 */
export function saveInstantReopenSnapshot(snapshot: InstantReopenSnapshot): void {
  try {
    const key = getInstantReopenKey(snapshot.workflowId, snapshot.nodeId);
    const data = {
      ...snapshot,
      timestamp: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(data));
    console.log('💾 [INSTANT REOPEN] Saved snapshot:', {
      workflowId: snapshot.workflowId,
      nodeId: snapshot.nodeId,
      valuesCount: Object.keys(snapshot.values).length,
      bubblesCount: Object.keys(snapshot.bubbles).length
    });
  } catch (error) {
    console.warn('[INSTANT REOPEN] Failed to save snapshot:', error);
  }
}

/**
 * Load complete snapshot for instant reopen
 * Call this when opening config modal
 */
export function loadInstantReopenSnapshot(
  workflowId: string,
  nodeId: string
): InstantReopenSnapshot | null {
  try {
    const key = getInstantReopenKey(workflowId, nodeId);
    const cached = localStorage.getItem(key);

    if (!cached) return null;

    const snapshot: InstantReopenSnapshot = JSON.parse(cached);

    // Check if cache is still valid (30 days)
    const expiryMs = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - snapshot.timestamp > expiryMs) {
      localStorage.removeItem(key);
      return null;
    }

    console.log('⚡ [INSTANT REOPEN] Loaded snapshot:', {
      workflowId,
      nodeId,
      valuesCount: Object.keys(snapshot.values).length,
      bubblesCount: Object.keys(snapshot.bubbles).length,
      age: Math.round((Date.now() - snapshot.timestamp) / 1000 / 60) + ' minutes'
    });

    return snapshot;
  } catch (error) {
    console.warn('[INSTANT REOPEN] Failed to load snapshot:', error);
    return null;
  }
}

/**
 * Clear snapshot for a specific node
 */
export function clearInstantReopenSnapshot(workflowId: string, nodeId: string): void {
  try {
    const key = getInstantReopenKey(workflowId, nodeId);
    localStorage.removeItem(key);
  } catch (error) {
    console.warn('[INSTANT REOPEN] Failed to clear snapshot:', error);
  }
}
