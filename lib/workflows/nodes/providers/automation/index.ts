/**
 * Automation Provider Index
 * Consolidates all automation-related workflow nodes
 */

import { webhookNodes } from './webhook'
import { hitlNodes } from './hitl'
import { waitForEventNodes } from './wait-for-event'
import { manualTriggerNodes } from './manual-trigger'

// Export all automation nodes as a single collection
export const automationNodes = [
  ...webhookNodes,
  ...hitlNodes,
  ...waitForEventNodes,
  ...manualTriggerNodes,
]

// Re-export individual providers for granular access if needed
export { webhookNodes } from './webhook'
export { hitlNodes } from './hitl'
export { waitForEventNodes } from './wait-for-event'
export { manualTriggerNodes } from './manual-trigger'