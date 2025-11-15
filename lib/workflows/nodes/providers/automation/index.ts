/**
 * Automation Provider Index
 * Consolidates all automation-related workflow nodes
 */

import { webhookNodes } from './webhook'
import { hitlNodes } from './hitl'
import { waitForEventNodes } from './wait-for-event'

// Export all automation nodes as a single collection
export const automationNodes = [
  ...webhookNodes,
  ...hitlNodes,
  ...waitForEventNodes,
]

// Re-export individual providers for granular access if needed
export { webhookNodes } from './webhook'
export { hitlNodes } from './hitl'
export { waitForEventNodes } from './wait-for-event'