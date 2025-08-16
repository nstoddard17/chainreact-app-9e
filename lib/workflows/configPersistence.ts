"use client"

import { WorkflowNode } from "@/stores/workflowStore"

/**
 * Configuration persistence utility for workflow node configurations
 * Allows saving and retrieving node configuration data between sessions
 */

// Keys for local storage
const WORKFLOW_CONFIG_PREFIX = "chainreact-workflow-config-"
const WORKFLOW_CONFIG_INDEX = "chainreact-workflow-config-index"

/**
 * Generate a unique key for a node configuration
 * @param workflowId The ID of the workflow
 * @param nodeId The ID of the node
 * @param nodeType The type of the node
 * @returns A unique storage key
 */
export const getConfigKey = (workflowId: string, nodeId: string, nodeType: string): string => {
  return `${WORKFLOW_CONFIG_PREFIX}${workflowId}-${nodeId}-${nodeType}`
}

/**
 * Save node configuration to local storage
 * @param workflowId The ID of the workflow
 * @param nodeId The ID of the node
 * @param nodeType The type of the node
 * @param config The configuration data to save
 * @param dynamicOptions Optional dynamic options to save alongside configuration
 */
export const saveNodeConfig = (
  workflowId: string,
  nodeId: string,
  nodeType: string,
  config: Record<string, any>,
  dynamicOptions?: Record<string, any[]>
): void => {
  if (typeof window === "undefined") return

  try {
    // Generate a unique key for this node configuration
    const key = getConfigKey(workflowId, nodeId, nodeType)
    
    // Prepare the data to save
    const dataToSave = {
      config,
      dynamicOptions,
      timestamp: Date.now()
    }
    
    // Save the configuration data
    localStorage.setItem(key, JSON.stringify(dataToSave))
    
    // Update the index of saved configurations
    updateConfigIndex(workflowId, nodeId, nodeType)
    
    console.log(`✅ Saved configuration for node ${nodeId} in workflow ${workflowId}`)
  } catch (error) {
    console.error("Failed to save node configuration:", error)
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
 * Clear node configuration from local storage
 * @param workflowId The ID of the workflow
 * @param nodeId The ID of the node
 * @param nodeType The type of the node
 */
export const clearNodeConfig = (
  workflowId: string,
  nodeId: string,
  nodeType: string
): void => {
  if (typeof window === "undefined") return

  try {
    const key = getConfigKey(workflowId, nodeId, nodeType)
    window.localStorage.removeItem(key)
    console.log(`🗑️ Cleared saved configuration for node: ${nodeId}`)
  } catch (error) {
    console.error("Failed to clear node configuration:", error)
  }
}

/**
 * Load node configuration from local storage
 * @param workflowId The ID of the workflow
 * @param nodeId The ID of the node
 * @param nodeType The type of the node
 * @returns The saved configuration data, or null if not found
 */
export const loadNodeConfig = (
  workflowId: string,
  nodeId: string,
  nodeType: string
): SavedNodeConfig | null => {
  if (typeof window === "undefined") return null

  try {
    // Generate the key for this node configuration
    const key = getConfigKey(workflowId, nodeId, nodeType)
    
    // Get the saved configuration data
    const savedData = localStorage.getItem(key)
    
    if (!savedData) return null
    
    // Parse the saved data
    const parsedData = JSON.parse(savedData)
    
    // Handle legacy format (direct config object without wrapper)
    if (!parsedData.config && !parsedData.timestamp) {
      // Convert to new format
      const legacyConfig: SavedNodeConfig = {
        config: parsedData,
        timestamp: Date.now()
      }
      console.log(`✅ Loaded legacy configuration for node ${nodeId} in workflow ${workflowId}`)
      return legacyConfig
    }
    
    console.log(`✅ Loaded saved configuration for node ${nodeId} in workflow ${workflowId}`)
    return parsedData as SavedNodeConfig
  } catch (error) {
    console.error("Failed to load node configuration:", error)
    return null
  }
}

/**
 * Update the index of saved configurations
 * @param workflowId The ID of the workflow
 * @param nodeId The ID of the node
 * @param nodeType The type of the node
 */
const updateConfigIndex = (workflowId: string, nodeId: string, nodeType: string): void => {
  try {
    // Get the current index
    const indexJson = localStorage.getItem(WORKFLOW_CONFIG_INDEX) || "{}"
    const index = JSON.parse(indexJson)
    
    // Add this configuration to the index
    if (!index[workflowId]) {
      index[workflowId] = {}
    }
    
    index[workflowId][nodeId] = {
      nodeType,
      timestamp: Date.now()
    }
    
    // Save the updated index
    localStorage.setItem(WORKFLOW_CONFIG_INDEX, JSON.stringify(index))
  } catch (error) {
    console.error("Failed to update configuration index:", error)
  }
}

/**
 * Clear saved configurations for a workflow
 * @param workflowId The ID of the workflow
 */
export const clearWorkflowConfigs = (workflowId: string): void => {
  if (typeof window === "undefined") return

  try {
    // Get the index
    const indexJson = localStorage.getItem(WORKFLOW_CONFIG_INDEX) || "{}"
    const index = JSON.parse(indexJson)
    
    // If this workflow has saved configurations
    if (index[workflowId]) {
      // Delete each saved configuration
      Object.entries(index[workflowId]).forEach(([nodeId, info]: [string, any]) => {
        const key = getConfigKey(workflowId, nodeId, info.nodeType)
        localStorage.removeItem(key)
      })
      
      // Remove this workflow from the index
      delete index[workflowId]
      localStorage.setItem(WORKFLOW_CONFIG_INDEX, JSON.stringify(index))
      
      console.log(`✅ Cleared all saved configurations for workflow ${workflowId}`)
    }
  } catch (error) {
    console.error("Failed to clear workflow configurations:", error)
  }
}

/**
 * Get all saved configurations for a workflow
 * @param workflowId The ID of the workflow
 * @returns An object mapping node IDs to their saved configurations
 */
export const getAllWorkflowConfigs = (workflowId: string): Record<string, SavedNodeConfig> => {
  if (typeof window === "undefined") return {}

  try {
    // Get the index
    const indexJson = localStorage.getItem(WORKFLOW_CONFIG_INDEX) || "{}"
    const index = JSON.parse(indexJson)
    
    // If this workflow has saved configurations
    if (index[workflowId]) {
      const configs: Record<string, SavedNodeConfig> = {}
      
      // Load each saved configuration
      Object.entries(index[workflowId]).forEach(([nodeId, info]: [string, any]) => {
        const key = getConfigKey(workflowId, nodeId, info.nodeType)
        const savedData = localStorage.getItem(key)
        
        if (savedData) {
          const parsedData = JSON.parse(savedData)
          
          // Handle legacy format
          if (!parsedData.config && !parsedData.timestamp) {
            configs[nodeId] = {
              config: parsedData,
              timestamp: info.timestamp || Date.now()
            }
          } else {
            configs[nodeId] = parsedData
          }
        }
      })
      
      return configs
    }
    
    return {}
  } catch (error) {
    console.error("Failed to get all workflow configurations:", error)
    return {}
  }
}

/**
 * Check if a node has a saved configuration
 * @param workflowId The ID of the workflow
 * @param nodeId The ID of the node
 * @returns True if the node has a saved configuration, false otherwise
 */
export const hasNodeConfig = (workflowId: string, nodeId: string): boolean => {
  if (typeof window === "undefined") return false

  try {
    // Get the index
    const indexJson = localStorage.getItem(WORKFLOW_CONFIG_INDEX) || "{}"
    const index = JSON.parse(indexJson)
    
    // Check if this node has a saved configuration
    return !!(index[workflowId] && index[workflowId][nodeId])
  } catch (error) {
    console.error("Failed to check for node configuration:", error)
    return false
  }
}
