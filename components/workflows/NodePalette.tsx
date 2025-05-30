"use client"

import type React from "react"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Webhook,
  Clock,
  MessageSquare,
  Calendar,
  FileSpreadsheet,
  Mail,
  Filter,
  Timer,
  GitBranch,
  Code,
  Database,
  FileText,
  Repeat,
  AlertTriangle,
  Settings,
  Zap,
  Upload,
  MailOpen,
} from "lucide-react"

const NODE_CATEGORIES = [
  {
    title: "Triggers",
    color: "green",
    nodes: [
      {
        type: "webhook",
        title: "Webhook",
        description: "Receive HTTP requests",
        icon: Webhook,
      },
      {
        type: "schedule",
        title: "Schedule",
        description: "Cron-based scheduling",
        icon: Clock,
      },
      {
        type: "email_trigger",
        title: "Email Trigger",
        description: "Parse incoming emails",
        icon: MailOpen,
      },
      {
        type: "file_upload",
        title: "File Upload",
        description: "Watch folder changes",
        icon: Upload,
      },
    ],
  },
  {
    title: "Actions",
    color: "blue",
    nodes: [
      {
        type: "slack_message",
        title: "Slack Message",
        description: "Send to Slack",
        icon: MessageSquare,
      },
      {
        type: "calendar_event",
        title: "Calendar Event",
        description: "Create calendar event",
        icon: Calendar,
      },
      {
        type: "sheets_append",
        title: "Sheets Append",
        description: "Add row to spreadsheet",
        icon: FileSpreadsheet,
      },
      {
        type: "send_email",
        title: "Send Email",
        description: "Send email message",
        icon: Mail,
      },
      {
        type: "webhook_call",
        title: "HTTP Request",
        description: "Make API calls",
        icon: Zap,
      },
    ],
  },
  {
    title: "Logic & Control",
    color: "yellow",
    nodes: [
      {
        type: "if_condition",
        title: "IF Condition",
        description: "IF/ELSE logic",
        icon: GitBranch,
      },
      {
        type: "switch_case",
        title: "Switch Case",
        description: "Multiple conditions",
        icon: Settings,
      },
      {
        type: "filter",
        title: "Filter",
        description: "Filter data",
        icon: Filter,
      },
      {
        type: "delay",
        title: "Delay",
        description: "Wait for time",
        icon: Timer,
      },
      {
        type: "loop",
        title: "Loop",
        description: "Iterate over data",
        icon: Repeat,
      },
    ],
  },
  {
    title: "Data Operations",
    color: "purple",
    nodes: [
      {
        type: "data_transform",
        title: "Transform Data",
        description: "JSON/XML parsing",
        icon: Database,
      },
      {
        type: "template",
        title: "Template",
        description: "Dynamic content",
        icon: FileText,
      },
      {
        type: "javascript",
        title: "JavaScript",
        description: "Custom code execution",
        icon: Code,
      },
      {
        type: "variable_set",
        title: "Set Variable",
        description: "Store data",
        icon: Database,
      },
      {
        type: "variable_get",
        title: "Get Variable",
        description: "Retrieve data",
        icon: Database,
      },
    ],
  },
  {
    title: "Error Handling",
    color: "red",
    nodes: [
      {
        type: "try_catch",
        title: "Try/Catch",
        description: "Error handling",
        icon: AlertTriangle,
      },
      {
        type: "retry",
        title: "Retry",
        description: "Retry on failure",
        icon: Repeat,
      },
    ],
  },
]

export default function NodePalette() {
  const onDragStart = (event: React.DragEvent, nodeType: string, nodeData: any) => {
    event.dataTransfer.setData("application/reactflow", nodeType)
    event.dataTransfer.setData("application/nodedata", JSON.stringify(nodeData))
    event.dataTransfer.effectAllowed = "move"
  }

  return (
    <div className="w-64 bg-white border-r border-slate-200 p-4 overflow-y-auto">
      <h3 className="font-semibold text-slate-900 mb-4">Components</h3>

      <div className="space-y-6">
        {NODE_CATEGORIES.map((category) => (
          <div key={category.title}>
            <div className="flex items-center space-x-2 mb-3">
              <h4 className="text-sm font-medium text-slate-700">{category.title}</h4>
              <Badge
                variant="secondary"
                className={`text-xs ${
                  category.color === "green"
                    ? "bg-green-100 text-green-700"
                    : category.color === "blue"
                      ? "bg-blue-100 text-blue-700"
                      : category.color === "yellow"
                        ? "bg-yellow-100 text-yellow-700"
                        : category.color === "purple"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-red-100 text-red-700"
                }`}
              >
                {category.nodes.length}
              </Badge>
            </div>
            <div className="space-y-2">
              {category.nodes.map((node) => (
                <Card
                  key={node.type}
                  className="p-3 cursor-grab hover:bg-slate-50 transition-colors border-slate-200"
                  draggable
                  onDragStart={(e) => onDragStart(e, node.type, node)}
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        category.color === "green"
                          ? "bg-green-100"
                          : category.color === "blue"
                            ? "bg-blue-100"
                            : category.color === "yellow"
                              ? "bg-yellow-100"
                              : category.color === "purple"
                                ? "bg-purple-100"
                                : "bg-red-100"
                      }`}
                    >
                      <node.icon
                        className={`w-4 h-4 ${
                          category.color === "green"
                            ? "text-green-600"
                            : category.color === "blue"
                              ? "text-blue-600"
                              : category.color === "yellow"
                                ? "text-yellow-600"
                                : category.color === "purple"
                                  ? "text-purple-600"
                                  : "text-red-600"
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900">{node.title}</div>
                      <div className="text-xs text-slate-500 truncate">{node.description}</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
