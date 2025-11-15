/**
 * Wait for Event Node
 * Pauses workflow execution until a specific event occurs
 */

import type { NodeComponent } from '../../types'
import { Clock } from 'lucide-react'

export const waitForEventAction: NodeComponent = {
  type: "wait_for_event",
  title: "Wait for Event",
  description: "Pause workflow until a specific event occurs",
  category: "Flow Control",
  isTrigger: false,
  producesOutput: true,
  providerId: "automation",
  icon: Clock,
  configSchema: [
    {
      name: "eventType",
      label: "Event Type",
      type: "select",
      required: true,
      options: [
        "webhook",
        "custom_event",
        "integration_event"
      ],
      description: "The type of event to wait for"
    },
    {
      name: "webhookPath",
      label: "Webhook Path",
      type: "text",
      placeholder: "/resume-workflow",
      description: "Custom webhook path to trigger continuation",
      dependsOn: "eventType",
      hidden: {
        $deps: ["eventType"],
        $condition: { eventType: { $ne: "webhook" } }
      }
    },
    {
      name: "eventName",
      label: "Event Name",
      type: "text",
      placeholder: "user.created",
      description: "The name of the custom event to listen for",
      dependsOn: "eventType",
      hidden: {
        $deps: ["eventType"],
        $condition: { eventType: { $ne: "custom_event" } }
      }
    },
    {
      name: "provider",
      label: "Integration",
      type: "select",
      options: [
        "stripe",
        "slack",
        "gmail",
        "google-calendar",
        "shopify",
        "hubspot",
        "mailchimp"
      ],
      description: "Which integration to listen for events from",
      dependsOn: "eventType",
      hidden: {
        $deps: ["eventType"],
        $condition: { eventType: { $ne: "integration_event" } }
      }
    },
    {
      name: "integrationEvent",
      label: "Event",
      type: "select",
      options: [],
      dynamicOptions: {
        dependsOn: "provider",
        endpoint: "/api/integrations/{provider}/events"
      },
      description: "The specific event from the integration",
      dependsOn: "provider",
      hidden: {
        $deps: ["eventType", "provider"],
        $condition: {
          $or: [
            { eventType: { $ne: "integration_event" } },
            { provider: { $exists: false } }
          ]
        }
      }
    },
    {
      name: "matchCondition",
      label: "Match Condition",
      type: "text",
      placeholder: '{"email": "{{trigger.email}}"}',
      description: "JSON condition to match the incoming event (optional)",
      advanced: true
    },
    {
      name: "timeout",
      label: "Timeout (hours)",
      type: "number",
      placeholder: "24",
      min: 1,
      max: 720, // 30 days max
      description: "Maximum time to wait before timing out (leave empty for no timeout)",
      advanced: true
    },
    {
      name: "timeoutAction",
      label: "On Timeout",
      type: "select",
      options: [
        "fail",
        "continue",
        "skip"
      ],
      description: "What to do if the timeout is reached",
      dependsOn: "timeout",
      hidden: {
        $deps: ["timeout"],
        $condition: { timeout: { $exists: false } }
      },
      advanced: true
    }
  ],
  outputSchema: [
    {
      name: "event",
      label: "Event Data",
      type: "object",
      description: "The data from the event that resumed the workflow"
    },
    {
      name: "timestamp",
      label: "Event Timestamp",
      type: "string",
      description: "When the event was received (ISO 8601 format)"
    },
    {
      name: "waitDuration",
      label: "Wait Duration (ms)",
      type: "number",
      description: "How long the workflow was paused (in milliseconds)"
    },
    {
      name: "timedOut",
      label: "Timed Out",
      type: "boolean",
      description: "Whether the workflow resumed due to a timeout"
    }
  ]
}

// Export all wait-for-event nodes
export const waitForEventNodes: NodeComponent[] = [
  waitForEventAction,
]
