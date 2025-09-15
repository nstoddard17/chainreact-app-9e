/**
 * Refactored availableNodes.ts
 * This file now re-exports from the modular node structure
 * Maintains full backward compatibility with existing imports
 */

// Re-export everything from the new modular structure
export { ALL_NODE_COMPONENTS } from "./nodes"

// Re-export types for backward compatibility
export type {
  ConfigField,
  NodeField,
  NodeOutputField as OutputField,
  NodeComponent
} from "./nodes/types"

// Note: The original 8,923 line file has been refactored into:
// - /lib/workflows/nodes/types.ts - Shared type definitions
// - /lib/workflows/nodes/index.ts - Main aggregation file
// - /lib/workflows/nodes/providers/[provider]/index.ts - Provider-specific exports
// - /lib/workflows/nodes/providers/[provider]/actions/*.schema.ts - Individual action schemas
// - /lib/workflows/nodes/providers/[provider]/triggers/*.schema.ts - Individual trigger schemas
//
// Benefits of this refactoring:
// 1. Better code organization and maintainability
// 2. Easier to find and modify specific node definitions
// 3. Reduced file size for better IDE performance
// 4. Clear separation of concerns by provider
// 5. Easier collaboration with less merge conflicts