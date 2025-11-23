/**
 * Webhook Provider Nodes
 * Handles HTTP webhook triggers for workflows
 */

import { Webhook } from 'lucide-react'
import type { NodeComponent } from '../../types'

export const webhookTrigger: NodeComponent = {
  type: "webhook",
  title: "Webhook",
  description: "Receive HTTP requests",
  category: "Triggers",
  isTrigger: true,
  producesOutput: true,
  providerId: "webhook",
  icon: Webhook,
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
  outputSchema: [
    {
      name: "body",
      label: "Request Body",
      type: "object",
      description: "Parsed JSON body or raw body from the webhook request"
    },
    {
      name: "headers",
      label: "HTTP Headers",
      type: "object",
      description: "HTTP request headers received from the webhook caller"
    },
    {
      name: "method",
      label: "HTTP Method",
      type: "string",
      description: "The HTTP method used (GET, POST, PUT, etc.)"
    },
    {
      name: "query",
      label: "Query Parameters",
      type: "object",
      description: "URL query parameters from the request"
    },
    {
      name: "path",
      label: "Request Path",
      type: "string",
      description: "The webhook path that was called"
    },
    {
      name: "timestamp",
      label: "Timestamp",
      type: "string",
      description: "When the webhook was triggered (ISO 8601 format)"
    },
    {
      name: "ip",
      label: "Client IP",
      type: "string",
      description: "IP address of the webhook caller"
    },
    {
      name: "userAgent",
      label: "User Agent",
      type: "string",
      description: "User agent string from the request"
    }
  ]
}

// Export all webhook nodes
export const webhookNodes: NodeComponent[] = [
  webhookTrigger,
]