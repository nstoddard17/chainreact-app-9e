/**
 * Automation Provider Index
 * Consolidates all automation-related workflow nodes
 */

import { manualNodes } from './manual'
import { schedulerNodes } from './scheduler'
import { webhookNodes } from './webhook'

// Export all automation nodes as a single collection
export const automationNodes = [
  ...manualNodes,
  ...schedulerNodes,
  ...webhookNodes,
]

// Re-export individual providers for granular access if needed
export { manualNodes } from './manual'
export { schedulerNodes } from './scheduler'
export { webhookNodes } from './webhook'