"use client"

import { WorkflowNode } from "@/stores/workflowStore"
import { createClient } from "@/utils/supabase/client"

import { logger } from '@/lib/utils/logger'
import { safeLocalStorageSet } from '@/lib/utils/storage-cleanup'

/**
 * Configuration persistence utility for workflow node configurations
 * Allows saving and retrieving node configuration data between sessions
 * Now uses Supabase for persistent storage instead of localStorage
 */


/**
 * Save node configuration to localStorage
 * @param workflowId The ID of the workflow
 * @param nodeId The ID of the node
 * @param nodeType The type of the node
 * @param config The configuration data to save
 * @param dynamicOptions Optional dynamic options to save alongside configuration
 */
export const saveNodeConfig = async (
  workflowId: string,
  nodeId: string,
  nodeType: string,
  config: Record<string, any>,
  dynamicOptions?: Record<string, any[]>
): Promise<void> => {
  if (typeof window === "undefined") return

  logger.debug(`🔄 [ConfigPersistence] Saving config for node ${nodeId} in workflow ${workflowId}`);

  try {
    const supabase = createClient()
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      logger.error(`❌ [ConfigPersistence] User not authenticated, cannot save config for node ${nodeId}`);
      throw new Error('User not authenticated');
    }

    // Get the current workflow with updated_at for optimistic locking
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('nodes, updated_at')
      .eq('id', workflowId)
      .eq('user_id', user.id)
      .single()

    if (workflowError || !workflow) {
      logger.error(`❌ [ConfigPersistence] Workflow not found for node ${nodeId}:`, workflowError);
      throw new Error('Workflow not found');
    }

    // Store the original updated_at timestamp for optimistic locking
    const originalUpdatedAt = workflow.updated_at

    // Update the specific node's data with saved configuration
    const nodes = workflow.nodes || []
    const nodeIndex = nodes.findIndex((n: any) => n.id === nodeId)

    if (nodeIndex === -1) {
      logger.warn(`⚠️ [ConfigPersistence] Node ${nodeId} not found in workflow ${workflowId} - it may be pending save`);
      // Don't throw an error - the node might be pending save
      // Store in localStorage as fallback
      const fallbackKey = `workflow_${workflowId}_node_${nodeId}_config`;
      const stored = safeLocalStorageSet(fallbackKey, { config, dynamicOptions, timestamp: Date.now() });
      if (stored) {
        logger.debug(`💾 [ConfigPersistence] Stored config in localStorage as fallback for node ${nodeId}`);
      }
      return;
    }

    // Prepare the saved config data
    const savedConfigData = {
      config,
      dynamicOptions,
      timestamp: Date.now()
    }

    // Update the node's data - store both in config and savedConfig
    nodes[nodeIndex] = {
      ...nodes[nodeIndex],
      data: {
        ...nodes[nodeIndex].data,
        config: config, // Store the actual config for immediate use
        savedConfig: savedConfigData // Store the full data with timestamp
      }
    }

    // Save back to Supabase with optimistic locking
    // Only update if updated_at matches the original value
    const { error: updateError } = await supabase
      .from('workflows')
      .update({ nodes })
      .eq('id', workflowId)
      .eq('user_id', user.id)
      .eq('updated_at', originalUpdatedAt) // Optimistic lock - only update if unchanged

    if (updateError) {
      // Check if this is a concurrent modification error (updated_at changed)
      if (updateError.code === '0' || updateError.message?.includes('0 rows')) {
        logger.warn(`⚠️ [ConfigPersistence] Concurrent modification detected for workflow ${workflowId}, retrying...`);
        // Retry the save operation once
        return saveNodeConfig(workflowId, nodeId, nodeType, config, dynamicOptions);
      }
      logger.error(`❌ [ConfigPersistence] Failed to update workflow for node ${nodeId}:`, updateError);
      throw updateError;
    }

    logger.debug(`✅ [ConfigPersistence] Successfully saved configuration for node ${nodeId} to Supabase`);
  } catch (error) {
    logger.error(`❌ [ConfigPersistence] Failed to save configuration for node ${nodeId}:`, error);
    throw error;
  }
}


/**
 * Interface for the saved node configuration data
 */
export interface SavedNodeConfig {
  config: Record<string, any>;
  dynamicOptions?: Record<string, any[]>;
  timestamp: number;
}

/**
 * Clear node configuration from Supabase
 * @param workflowId The ID of the workflow
 * @param nodeId The ID of the node
 * @param nodeType The type of the node
 */
export const clearNodeConfig = async (
  workflowId: string,
  nodeId: string,
  nodeType: string
): Promise<void> => {
  if (typeof window === "undefined") return

  logger.debug(`🗑️ [ConfigPersistence] Clearing saved configuration for node ${nodeId}`);
  
  // Clear any localStorage fallback data
  const fallbackKey = `workflow_${workflowId}_node_${nodeId}_config`;
  localStorage.removeItem(fallbackKey);

  try {
    const supabase = createClient()
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      logger.error(`❌ [ConfigPersistence] User not authenticated, cannot clear config for node ${nodeId}`);
      return;
    }

    // Get the current workflow
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('nodes')
      .eq('id', workflowId)
      .eq('user_id', user.id)
      .single()

    if (workflowError || !workflow) {
      logger.debug(`🔍 [ConfigPersistence] Workflow not found when clearing config for node ${nodeId}`);
      return;
    }

    // Update the specific node's data to remove saved configuration
    const nodes = workflow.nodes || []
    const nodeIndex = nodes.findIndex((n: any) => n.id === nodeId)
    
    if (nodeIndex === -1) {
      logger.debug(`🔍 [ConfigPersistence] Node ${nodeId} not found when clearing config`);
      return;
    }

    // Remove the savedConfig from the node's data
    if (nodes[nodeIndex].data && nodes[nodeIndex].data.savedConfig) {
      const { savedConfig, ...restData } = nodes[nodeIndex].data;
      nodes[nodeIndex] = {
        ...nodes[nodeIndex],
        data: restData
      };

      // Save back to Supabase
      const { error: updateError } = await supabase
        .from('workflows')
        .update({ nodes })
        .eq('id', workflowId)
        .eq('user_id', user.id)

      if (updateError) {
        logger.error(`❌ [ConfigPersistence] Failed to clear config for node ${nodeId}:`, updateError);
        return;
      }

      logger.debug(`✅ [ConfigPersistence] Successfully cleared configuration for node ${nodeId}`);
    } else {
      logger.debug(`🔍 [ConfigPersistence] No saved configuration found to clear for node ${nodeId}`);
    }
  } catch (error) {
    logger.error(`❌ [ConfigPersistence] Failed to clear configuration for node ${nodeId}:`, error);
  }
}

/**
 * Load node configuration from Supabase (with localStorage fallback)
 * @param workflowId The ID of the workflow
 * @param nodeId The ID of the node
 * @param nodeType The type of the node
 * @returns The saved configuration data, or null if not found
 */
export const loadNodeConfig = async (
  workflowId: string,
  nodeId: string,
  nodeType: string
): Promise<SavedNodeConfig | null> => {
  if (typeof window === "undefined") return null

  logger.debug(`🔍 [ConfigPersistence] Loading config for node ${nodeId} in workflow ${workflowId}`);

  try {
    const supabase = createClient()
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      logger.debug(`🔍 [ConfigPersistence] User not authenticated, cannot load config for node ${nodeId}`);
      return null;
    }

    // Get the workflow with nodes
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('nodes')
      .eq('id', workflowId)
      .eq('user_id', user.id)
      .single()

    if (workflowError || !workflow) {
      logger.debug(`🔍 [ConfigPersistence] Workflow not found for node ${nodeId}:`, workflowError);
      return null;
    }

    // Find the specific node
    const nodes = workflow.nodes || []
    const node = nodes.find((n: any) => n.id === nodeId)
    
    if (node && node.data) {
      // Check for savedConfig first (has timestamp and dynamic options)
      if (node.data.savedConfig) {
        logger.debug(`✅ [ConfigPersistence] Successfully loaded savedConfig from Supabase for node ${nodeId}`);
        return node.data.savedConfig as SavedNodeConfig
      }
      // Fall back to config field if savedConfig doesn't exist
      else if (node.data.config) {
        logger.debug(`✅ [ConfigPersistence] Successfully loaded config from Supabase for node ${nodeId} (no savedConfig, using config field)`);
        return {
          config: node.data.config,
          timestamp: Date.now()
        } as SavedNodeConfig
      }
    }
    
    // Check localStorage fallback for nodes that are pending save
    const fallbackKey = `workflow_${workflowId}_node_${nodeId}_config`;
    const fallbackData = localStorage.getItem(fallbackKey);
    if (fallbackData) {
      try {
        const parsed = JSON.parse(fallbackData);
        logger.debug(`💾 [ConfigPersistence] Loaded config from localStorage fallback for node ${nodeId}`);
        // Clean up the fallback data after loading
        localStorage.removeItem(fallbackKey);
        return parsed as SavedNodeConfig;
      } catch (e) {
        logger.error(`❌ [ConfigPersistence] Failed to parse fallback config for node ${nodeId}:`, e);
      }
    }
    
    logger.debug(`🔍 [ConfigPersistence] No saved configuration found for node ${nodeId}`);
    return null
  } catch (error) {
    logger.error(`❌ [ConfigPersistence] Failed to load configuration for node ${nodeId}:`, error)
    return null
  }
}





/**
 * Clear all saved configurations for a workflow from Supabase
 * @param workflowId The ID of the workflow
 */
export const clearWorkflowConfigs = async (workflowId: string): Promise<void> => {
  if (typeof window === "undefined") return

  logger.debug(`🗑️ [ConfigPersistence] Clearing all configurations for workflow ${workflowId}`);

  try {
    const supabase = createClient()
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      logger.error(`❌ [ConfigPersistence] User not authenticated, cannot clear workflow configs`);
      return;
    }

    // Get the current workflow
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('nodes')
      .eq('id', workflowId)
      .eq('user_id', user.id)
      .single()

    if (workflowError || !workflow) {
      logger.debug(`🔍 [ConfigPersistence] Workflow not found when clearing all configs`);
      return;
    }

    // Remove savedConfig from all nodes
    const nodes = workflow.nodes || []
    const cleanedNodes = nodes.map((node: any) => {
      if (node.data && node.data.savedConfig) {
        const { savedConfig, ...restData } = node.data;
        return {
          ...node,
          data: restData
        };
      }
      return node;
    });

    // Save back to Supabase
    const { error: updateError } = await supabase
      .from('workflows')
      .update({ nodes: cleanedNodes })
      .eq('id', workflowId)
      .eq('user_id', user.id)

    if (updateError) {
      logger.error(`❌ [ConfigPersistence] Failed to clear workflow configurations:`, updateError);
      return;
    }

    logger.debug(`✅ [ConfigPersistence] Successfully cleared all configurations for workflow ${workflowId}`);
  } catch (error) {
    logger.error(`❌ [ConfigPersistence] Failed to clear workflow configurations:`, error);
  }
}

/**
 * Get all saved configurations for a workflow from Supabase
 * @param workflowId The ID of the workflow
 * @returns An object mapping node IDs to their saved configurations
 */
export const getAllWorkflowConfigs = async (workflowId: string): Promise<Record<string, SavedNodeConfig>> => {
  if (typeof window === "undefined") return {}

  logger.debug(`🔍 [ConfigPersistence] Getting all configurations for workflow ${workflowId}`);

  try {
    const supabase = createClient()
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      logger.debug(`🔍 [ConfigPersistence] User not authenticated, cannot get workflow configs`);
      return {};
    }

    // Get the workflow with nodes
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('nodes')
      .eq('id', workflowId)
      .eq('user_id', user.id)
      .single()

    if (workflowError || !workflow) {
      logger.debug(`🔍 [ConfigPersistence] Workflow not found when getting all configs`);
      return {};
    }

    // Extract saved configurations from all nodes
    const configs: Record<string, SavedNodeConfig> = {}
    const nodes = workflow.nodes || []
    
    nodes.forEach((node: any) => {
      if (node.id && node.data && node.data.savedConfig) {
        configs[node.id] = node.data.savedConfig;
      }
    });
    
    logger.debug(`✅ [ConfigPersistence] Found ${Object.keys(configs).length} saved configurations for workflow ${workflowId}`);
    return configs;
  } catch (error) {
    logger.error(`❌ [ConfigPersistence] Failed to get workflow configurations:`, error);
    return {};
  }
}

/**
 * Check if a node has a saved configuration in Supabase
 * @param workflowId The ID of the workflow
 * @param nodeId The ID of the node
 * @returns True if the node has a saved configuration, false otherwise
 */
export const hasNodeConfig = async (workflowId: string, nodeId: string): Promise<boolean> => {
  if (typeof window === "undefined") return false

  logger.debug(`🔍 [ConfigPersistence] Checking if node ${nodeId} has saved config`);

  try {
    const savedConfig = await loadNodeConfig(workflowId, nodeId, '');
    const hasConfig = !!savedConfig;
    logger.debug(`🔍 [ConfigPersistence] Node ${nodeId} has saved config: ${hasConfig}`);
    return hasConfig;
  } catch (error) {
    logger.error(`❌ [ConfigPersistence] Failed to check for node configuration:`, error);
    return false;
  }
}
