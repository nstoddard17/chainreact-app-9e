"use client"

import { WorkflowNode } from "@/stores/workflowStore"
import { createClient } from "@/utils/supabase/client"

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

  console.log(`🔄 [ConfigPersistence] Saving config for node ${nodeId} in workflow ${workflowId}`);

  try {
    const supabase = createClient()
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      console.error(`❌ [ConfigPersistence] User not authenticated, cannot save config for node ${nodeId}`);
      throw new Error('User not authenticated');
    }

    // Get the current workflow
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('nodes')
      .eq('id', workflowId)
      .eq('user_id', user.id)
      .single()

    if (workflowError || !workflow) {
      console.error(`❌ [ConfigPersistence] Workflow not found for node ${nodeId}:`, workflowError);
      throw new Error('Workflow not found');
    }

    // Update the specific node's data with saved configuration
    const nodes = workflow.nodes || []
    const nodeIndex = nodes.findIndex((n: any) => n.id === nodeId)
    
    if (nodeIndex === -1) {
      console.error(`❌ [ConfigPersistence] Node ${nodeId} not found in workflow ${workflowId}`);
      throw new Error('Node not found in workflow');
    }

    // Prepare the saved config data
    const savedConfigData = {
      config,
      dynamicOptions,
      timestamp: Date.now()
    }

    // Update the node's data
    nodes[nodeIndex] = {
      ...nodes[nodeIndex],
      data: {
        ...nodes[nodeIndex].data,
        savedConfig: savedConfigData
      }
    }

    // Save back to Supabase
    const { error: updateError } = await supabase
      .from('workflows')
      .update({ nodes })
      .eq('id', workflowId)
      .eq('user_id', user.id)

    if (updateError) {
      console.error(`❌ [ConfigPersistence] Failed to update workflow for node ${nodeId}:`, updateError);
      throw updateError;
    }

    console.log(`✅ [ConfigPersistence] Successfully saved configuration for node ${nodeId} to Supabase`);
  } catch (error) {
    console.error(`❌ [ConfigPersistence] Failed to save configuration for node ${nodeId}:`, error);
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

  console.log(`🗑️ [ConfigPersistence] Clearing saved configuration for node ${nodeId}`);

  try {
    const supabase = createClient()
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      console.error(`❌ [ConfigPersistence] User not authenticated, cannot clear config for node ${nodeId}`);
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
      console.log(`🔍 [ConfigPersistence] Workflow not found when clearing config for node ${nodeId}`);
      return;
    }

    // Update the specific node's data to remove saved configuration
    const nodes = workflow.nodes || []
    const nodeIndex = nodes.findIndex((n: any) => n.id === nodeId)
    
    if (nodeIndex === -1) {
      console.log(`🔍 [ConfigPersistence] Node ${nodeId} not found when clearing config`);
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
        console.error(`❌ [ConfigPersistence] Failed to clear config for node ${nodeId}:`, updateError);
        return;
      }

      console.log(`✅ [ConfigPersistence] Successfully cleared configuration for node ${nodeId}`);
    } else {
      console.log(`🔍 [ConfigPersistence] No saved configuration found to clear for node ${nodeId}`);
    }
  } catch (error) {
    console.error(`❌ [ConfigPersistence] Failed to clear configuration for node ${nodeId}:`, error);
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

  console.log(`🔍 [ConfigPersistence] Loading config for node ${nodeId} in workflow ${workflowId}`);

  try {
    const supabase = createClient()
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      console.log(`🔍 [ConfigPersistence] User not authenticated, cannot load config for node ${nodeId}`);
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
      console.log(`🔍 [ConfigPersistence] Workflow not found for node ${nodeId}:`, workflowError);
      return null;
    }

    // Find the specific node
    const nodes = workflow.nodes || []
    const node = nodes.find((n: any) => n.id === nodeId)
    
    if (node && node.data && node.data.savedConfig) {
      console.log(`✅ [ConfigPersistence] Successfully loaded configuration from Supabase for node ${nodeId}`);
      return node.data.savedConfig as SavedNodeConfig
    }
    
    console.log(`🔍 [ConfigPersistence] No saved configuration found for node ${nodeId}`);
    return null
  } catch (error) {
    console.error(`❌ [ConfigPersistence] Failed to load configuration for node ${nodeId}:`, error)
    return null
  }
}





/**
 * Clear all saved configurations for a workflow from Supabase
 * @param workflowId The ID of the workflow
 */
export const clearWorkflowConfigs = async (workflowId: string): Promise<void> => {
  if (typeof window === "undefined") return

  console.log(`🗑️ [ConfigPersistence] Clearing all configurations for workflow ${workflowId}`);

  try {
    const supabase = createClient()
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      console.error(`❌ [ConfigPersistence] User not authenticated, cannot clear workflow configs`);
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
      console.log(`🔍 [ConfigPersistence] Workflow not found when clearing all configs`);
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
      console.error(`❌ [ConfigPersistence] Failed to clear workflow configurations:`, updateError);
      return;
    }

    console.log(`✅ [ConfigPersistence] Successfully cleared all configurations for workflow ${workflowId}`);
  } catch (error) {
    console.error(`❌ [ConfigPersistence] Failed to clear workflow configurations:`, error);
  }
}

/**
 * Get all saved configurations for a workflow from Supabase
 * @param workflowId The ID of the workflow
 * @returns An object mapping node IDs to their saved configurations
 */
export const getAllWorkflowConfigs = async (workflowId: string): Promise<Record<string, SavedNodeConfig>> => {
  if (typeof window === "undefined") return {}

  console.log(`🔍 [ConfigPersistence] Getting all configurations for workflow ${workflowId}`);

  try {
    const supabase = createClient()
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      console.log(`🔍 [ConfigPersistence] User not authenticated, cannot get workflow configs`);
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
      console.log(`🔍 [ConfigPersistence] Workflow not found when getting all configs`);
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
    
    console.log(`✅ [ConfigPersistence] Found ${Object.keys(configs).length} saved configurations for workflow ${workflowId}`);
    return configs;
  } catch (error) {
    console.error(`❌ [ConfigPersistence] Failed to get workflow configurations:`, error);
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

  console.log(`🔍 [ConfigPersistence] Checking if node ${nodeId} has saved config`);

  try {
    const savedConfig = await loadNodeConfig(workflowId, nodeId, '');
    const hasConfig = !!savedConfig;
    console.log(`🔍 [ConfigPersistence] Node ${nodeId} has saved config: ${hasConfig}`);
    return hasConfig;
  } catch (error) {
    console.error(`❌ [ConfigPersistence] Failed to check for node configuration:`, error);
    return false;
  }
}
