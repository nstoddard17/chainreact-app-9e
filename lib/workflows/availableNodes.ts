/**
 * Available Nodes - Legacy Export
 * This file now re-exports from the new modular structure
 * Maintains backward compatibility while using the new organization
 */

// Re-export everything from the new modular structure
export { ALL_NODE_COMPONENTS as availableNodes } from './nodes'
export type { NodeComponent, ConfigField, NodeField, NodeOutputField } from './nodes/types'

// For any code that directly imports availableNodes
export { ALL_NODE_COMPONENTS as default } from './nodes'