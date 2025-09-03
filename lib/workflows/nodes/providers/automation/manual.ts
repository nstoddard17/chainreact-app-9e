/**
 * Manual Trigger Provider
 * Allows manual triggering of workflows
 */

import { Zap } from 'lucide-react'
import type { NodeComponent } from '../../types'

export const manualTrigger: NodeComponent = {
  type: "manual",
  title: "Manual",
  description: "Manually trigger a workflow",
  icon: Zap,
  category: "Triggers",
  isTrigger: true,
  producesOutput: true,
}

// Export all manual trigger nodes
export const manualNodes: NodeComponent[] = [
  manualTrigger,
]