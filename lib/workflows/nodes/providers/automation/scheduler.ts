/**
 * Scheduler Provider Nodes
 * Handles time-based triggers for workflows
 */

import type { NodeComponent } from '../../types'

export const scheduleTrigger: NodeComponent = {
  type: "schedule",
  title: "Schedule",
  description: "Trigger workflow on a time-based schedule",
  category: "Triggers",
  isTrigger: true,
  producesOutput: true,
  configSchema: [
    { 
      name: "cron", 
      label: "Cron Expression", 
      type: "text", 
      placeholder: "0 * * * *", 
      description: "Cron expression for scheduling (minute hour day month weekday)" 
    },
    { 
      name: "timezone", 
      label: "Timezone", 
      type: "text", 
      placeholder: "UTC", 
      description: "Timezone for the schedule (e.g., UTC, America/New_York)" 
    },
  ],
}

// Export all scheduler nodes
export const schedulerNodes: NodeComponent[] = [
  scheduleTrigger,
]