/**
 * Manual Trigger Node
 * A simple trigger that allows workflows to be started manually
 * No configuration needed - just a placeholder that passes through to the next node
 */

import { Play } from 'lucide-react'
import type { NodeComponent } from '../../types'

export const manualTrigger: NodeComponent = {
  type: "manual_trigger",
  title: "Manual Trigger",
  description: "Start this workflow manually via the Test button or API",
  icon: Play,
  category: "Logic & Flow Control",
  providerId: "automation",
  isTrigger: true,
  producesOutput: true,
  // No config needed - empty schema
  configSchema: [],
  outputSchema: [
    {
      name: "triggeredAt",
      label: "Triggered At",
      type: "string",
      description: "ISO timestamp when the workflow was triggered"
    },
    {
      name: "triggeredBy",
      label: "Triggered By",
      type: "string",
      description: "How the workflow was triggered (manual, api, test)"
    },
    {
      name: "workflowId",
      label: "Workflow ID",
      type: "string",
      description: "The ID of this workflow"
    }
  ]
}

// Export all manual trigger nodes
export const manualTriggerNodes: NodeComponent[] = [
  manualTrigger,
]
