"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
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
  Plus,
} from "lucide-react"

const NODE_ICONS = {
  webhook: Webhook,
  schedule: Clock,
  email_trigger: MailOpen,
  file_upload: Upload,
  slack_message: MessageSquare,
  calendar_event: Calendar,
  sheets_append: FileSpreadsheet,
  send_email: Mail,
  webhook_call: Zap,
  if_condition: GitBranch,
  switch_case: Settings,
  filter: Filter,
  delay: Timer,
  loop: Repeat,
  data_transform: Database,
  template: FileText,
  javascript: Code,
  variable_set: Database,
  variable_get: Database,
  try_catch: AlertTriangle,
  retry: Repeat,
}

const NODE_COLORS = {
  // Triggers
  webhook: "green",
  schedule: "green",
  email_trigger: "green",
  file_upload: "green",
  // Actions
  slack_message: "blue",
  calendar_event: "blue",
  sheets_append: "blue",
  send_email: "blue",
  webhook_call: "blue",
  // Logic
  if_condition: "yellow",
  switch_case: "yellow",
  filter: "yellow",
  delay: "yellow",
  loop: "yellow",
  // Data
  data_transform: "purple",
  template: "purple",
  javascript: "purple",
  variable_set: "purple",
  variable_get: "purple",
  // Error handling
  try_catch: "red",
  retry: "red",
}

function CustomNode({ data, selected }: NodeProps) {
  const Icon = NODE_ICONS[data.type as keyof typeof NODE_ICONS] || Webhook
  const color = NODE_COLORS[data.type as keyof typeof NODE_COLORS] || "blue"

  const isTrigger = data.isTrigger || ["webhook", "schedule", "email_trigger", "file_upload"].includes(data.type)
  const isAction = ["slack_message", "calendar_event", "sheets_append", "send_email", "webhook_call"].includes(
    data.type,
  )
  const hasMultipleOutputs = ["if_condition", "switch_case", "try_catch"].includes(data.type)

  return (
    <Card
      className={`min-w-[200px] ${
        selected ? "ring-2 ring-blue-500 ring-offset-2" : ""
      } hover:shadow-lg transition-all duration-200`}
    >
      <div className="p-4">
        <div className="flex items-center space-x-3 mb-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              color === "green"
                ? "bg-gradient-to-br from-green-400 to-green-600"
                : color === "blue"
                  ? "bg-gradient-to-br from-blue-400 to-blue-600"
                  : color === "yellow"
                    ? "bg-gradient-to-br from-yellow-400 to-yellow-600"
                    : color === "purple"
                      ? "bg-gradient-to-br from-purple-400 to-purple-600"
                      : "bg-gradient-to-br from-red-400 to-red-600"
            }`}
          >
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <div className="font-medium text-slate-900">{data.title}</div>
            <div className="text-xs text-slate-500">{data.description}</div>
          </div>
        </div>

        {data.status && (
          <div className="mb-2">
            <Badge
              variant={data.status === "connected" ? "default" : "secondary"}
              className={`text-xs ${
                data.status === "connected" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
              }`}
            >
              {data.status}
            </Badge>
          </div>
        )}

        {data.config && Object.keys(data.config).length > 0 && (
          <div className="text-xs text-slate-600 bg-slate-50 rounded p-2">
            <div className="font-medium mb-1">Configuration:</div>
            {Object.entries(data.config)
              .slice(0, 2)
              .map(([key, value]) => (
                <div key={key} className="truncate">
                  {key}: {String(value)}
                </div>
              ))}
            {Object.keys(data.config).length > 2 && (
              <div className="text-slate-400">+{Object.keys(data.config).length - 2} more...</div>
            )}
          </div>
        )}

      </div>

      {/* Input Handle - not for triggers */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          className="w-3 h-3 bg-slate-400 border-2 border-white"
        />
      )}

      {/* Output Handles */}
      {hasMultipleOutputs ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            className="w-3 h-3 bg-green-500 border-2 border-white"
            style={{ left: "25%" }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className="w-3 h-3 bg-red-500 border-2 border-white"
            style={{ left: "75%" }}
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className="w-3 h-3 bg-green-500 border-2 border-white"
        />
      )}
    </Card>
  )
}

export default memo(CustomNode)
