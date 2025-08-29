import { Zap } from "lucide-react"
import { NodeComponent } from "../../types"

export const genericTriggers: NodeComponent[] = [
  {
    type: "webhook",
    title: "Webhook",
    description: "Receive HTTP requests",
    category: "Triggers",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      { name: "path", label: "Path", type: "text", placeholder: "/webhook-path", description: "The URL path for your webhook endpoint (e.g., /webhook-path)" },
      { name: "method", label: "HTTP Method", type: "select", options: ["POST", "GET", "PUT"], description: "The HTTP method that will trigger this webhook" },
    ],
  },
  {
    type: "schedule",
    title: "Schedule",
    description: "Trigger workflow on a time-based schedule",
    category: "Triggers",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      { name: "cron", label: "Cron Expression", type: "text", placeholder: "0 * * * *", description: "Cron expression for scheduling (minute hour day month weekday)" },
      { name: "timezone", label: "Timezone", type: "text", placeholder: "UTC", description: "Timezone for the schedule (e.g., UTC, America/New_York)" },
    ],
  },
  {
    type: "manual",
    title: "Manual",
    description: "Manually trigger a workflow",
    icon: Zap,
    category: "Triggers",
    isTrigger: true,
    producesOutput: true,
  },
]