/**
 * Webhook Provider Nodes
 * Handles HTTP webhook triggers for workflows
 */

import type { NodeComponent } from '../../types'

export const webhookTrigger: NodeComponent = {
  type: "webhook",
  title: "Webhook",
  description: "Receive HTTP requests",
  category: "Triggers",
  isTrigger: true,
  producesOutput: true,
  comingSoon: true,
  configSchema: [
    { 
      name: "path", 
      label: "Path", 
      type: "text", 
      placeholder: "/webhook-path", 
      description: "The URL path for your webhook endpoint (e.g., /webhook-path)" 
    },
    { 
      name: "method", 
      label: "HTTP Method", 
      type: "select", 
      options: ["POST", "GET", "PUT"], 
      description: "The HTTP method that will trigger this webhook" 
    },
  ],
}

// Export all webhook nodes
export const webhookNodes: NodeComponent[] = [
  webhookTrigger,
]