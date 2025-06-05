"use client"

import type React from "react"
import { useMemo, useState, useEffect } from "react"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useIntegrationStore } from "@/stores/integrationStore"
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
  Upload,
  MailOpen,
  Plus,
  ExternalLink,
  Loader2,
} from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { isComponentAvailable } from "@/lib/integrations/integrationScopes"

interface NodeComponent {
  type: string
  title: string
  description: string
  icon: any
  providerId?: string
  requiredScopes?: string[]
  category: string
}

const ALL_NODE_COMPONENTS: NodeComponent[] = [
  // Generic Triggers (no provider required)
  {
    type: "webhook",
    title: "Webhook",
    description: "Receive HTTP requests",
    icon: Webhook,
    category: "Triggers",
  },
  {
    type: "schedule",
    title: "Schedule",
    description: "Cron-based scheduling",
    icon: Clock,
    category: "Triggers",
  },
  {
    type: "file_upload",
    title: "File Upload",
    description: "Watch folder changes",
    icon: Upload,
    category: "Triggers",
  },

  // Slack Actions
  {
    type: "slack_message",
    title: "Send Slack Message",
    description: "Send messages to Slack channels",
    icon: MessageSquare,
    providerId: "slack",
    requiredScopes: ["chat:write"],
    category: "Communication",
  },
  {
    type: "slack_channel_create",
    title: "Create Slack Channel",
    description: "Create new Slack channels",
    icon: Plus,
    providerId: "slack",
    requiredScopes: ["channels:write"],
    category: "Communication",
  },

  // Discord Actions
  {
    type: "discord_message",
    title: "Send Discord Message",
    description: "Send messages to Discord channels",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
  },

  // Teams Actions
  {
    type: "teams_message",
    title: "Send Teams Message",
    description: "Send messages in Microsoft Teams",
    icon: MessageSquare,
    providerId: "teams",
    requiredScopes: ["Chat.ReadWrite"],
    category: "Communication",
  },
  {
    type: "teams_meeting",
    title: "Create Teams Meeting",
    description: "Schedule Microsoft Teams meetings",
    icon: Calendar,
    providerId: "teams",
    requiredScopes: ["OnlineMeetings.ReadWrite"],
    category: "Communication",
  },

  // Google Calendar Actions
  {
    type: "google_calendar_create",
    title: "Create Calendar Event",
    description: "Create new calendar events",
    icon: Calendar,
    providerId: "google-calendar",
    requiredScopes: ["https://www.googleapis.com/auth/calendar"],
    category: "Productivity",
  },
  {
    type: "google_calendar_list",
    title: "List Calendar Events",
    description: "Retrieve calendar events",
    icon: Calendar,
    providerId: "google-calendar",
    requiredScopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    category: "Productivity",
  },

  // Google Sheets Actions
  {
    type: "google_sheets_append",
    title: "Append to Sheet",
    description: "Add rows to Google Sheets",
    icon: FileSpreadsheet,
    providerId: "google-sheets",
    requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
    category: "Productivity",
  },
  {
    type: "google_sheets_read",
    title: "Read Sheet Data",
    description: "Read data from Google Sheets",
    icon: FileSpreadsheet,
    providerId: "google-sheets",
    requiredScopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    category: "Productivity",
  },

  // Google Docs Actions
  {
    type: "google_docs_create",
    title: "Create Document",
    description: "Create new Google Docs",
    icon: FileText,
    providerId: "google-docs",
    requiredScopes: ["https://www.googleapis.com/auth/documents"],
    category: "Productivity",
  },

  // Gmail Actions
  {
    type: "gmail_send",
    title: "Send Email",
    description: "Send emails via Gmail",
    icon: Mail,
    providerId: "gmail",
    requiredScopes: ["https://www.googleapis.com/auth/gmail.send"],
    category: "Email",
  },
  {
    type: "gmail_read",
    title: "Read Emails",
    description: "Read Gmail messages",
    icon: MailOpen,
    providerId: "gmail",
    requiredScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    category: "Email",
  },

  // GitHub Actions
  {
    type: "github_create_issue",
    title: "Create GitHub Issue",
    description: "Create issues in repositories",
    icon: ExternalLink,
    providerId: "github",
    requiredScopes: ["repo"],
    category: "Development",
  },
  {
    type: "github_create_pr",
    title: "Create Pull Request",
    description: "Create pull requests",
    icon: GitBranch,
    providerId: "github",
    requiredScopes: ["repo"],
    category: "Development",
  },

  // Notion Actions
  {
    type: "notion_create_page",
    title: "Create Notion Page",
    description: "Create new pages in Notion",
    icon: FileText,
    providerId: "notion",
    requiredScopes: ["insert"],
    category: "Productivity",
  },
  {
    type: "notion_update_database",
    title: "Update Notion Database",
    description: "Update database records",
    icon: Database,
    providerId: "notion",
    requiredScopes: ["update"],
    category: "Productivity",
  },

  // Airtable Actions
  {
    type: "airtable_create_record",
    title: "Create Airtable Record",
    description: "Add records to Airtable bases",
    icon: Database,
    providerId: "airtable",
    requiredScopes: ["data.records:write"],
    category: "Productivity",
  },
  {
    type: "airtable_read_records",
    title: "Read Airtable Records",
    description: "Retrieve records from bases",
    icon: Database,
    providerId: "airtable",
    requiredScopes: ["data.records:read"],
    category: "Productivity",
  },

  // Trello Actions
  {
    type: "trello_create_card",
    title: "Create Trello Card",
    description: "Create cards on Trello boards",
    icon: FileText,
    providerId: "trello",
    requiredScopes: ["write"],
    category: "Productivity",
  },

  // Dropbox Actions
  {
    type: "dropbox_upload",
    title: "Upload to Dropbox",
    description: "Upload files to Dropbox",
    icon: Upload,
    providerId: "dropbox",
    requiredScopes: ["files.content.write"],
    category: "Cloud Storage",
  },
  {
    type: "dropbox_download",
    title: "Download from Dropbox",
    description: "Download files from Dropbox",
    icon: Upload,
    providerId: "dropbox",
    requiredScopes: ["files.content.read"],
    category: "Cloud Storage",
  },

  // Generic Logic Components (no provider required)
  {
    type: "if_condition",
    title: "IF Condition",
    description: "IF/ELSE logic",
    icon: GitBranch,
    category: "Logic & Control",
  },
  {
    type: "switch_case",
    title: "Switch Case",
    description: "Multiple conditions",
    icon: Settings,
    category: "Logic & Control",
  },
  {
    type: "filter",
    title: "Filter",
    description: "Filter data",
    icon: Filter,
    category: "Logic & Control",
  },
  {
    type: "delay",
    title: "Delay",
    description: "Wait for time",
    icon: Timer,
    category: "Logic & Control",
  },
  {
    type: "loop",
    title: "Loop",
    description: "Iterate over data",
    icon: Repeat,
    category: "Logic & Control",
  },

  // Data Operations (no provider required)
  {
    type: "data_transform",
    title: "Transform Data",
    description: "JSON/XML parsing",
    icon: Database,
    category: "Data Operations",
  },
  {
    type: "template",
    title: "Template",
    description: "Dynamic content",
    icon: FileText,
    category: "Data Operations",
  },
  {
    type: "javascript",
    title: "JavaScript",
    description: "Custom code execution",
    icon: Code,
    category: "Data Operations",
  },
  {
    type: "variable_set",
    title: "Set Variable",
    description: "Store data",
    icon: Database,
    category: "Data Operations",
  },
  {
    type: "variable_get",
    title: "Get Variable",
    description: "Retrieve data",
    icon: Database,
    category: "Data Operations",
  },

  // Error Handling (no provider required)
  {
    type: "try_catch",
    title: "Try/Catch",
    description: "Error handling",
    icon: AlertTriangle,
    category: "Error Handling",
  },
  {
    type: "retry",
    title: "Retry",
    description: "Retry on failure",
    icon: Repeat,
    category: "Error Handling",
  },
]

export default function NodePalette() {
  const { integrations, verifyIntegrationScopes, verifyingScopes } = useIntegrationStore()
  const [isLoading, setIsLoading] = useState(true)

  // Verify integration scopes when component mounts
  useEffect(() => {
    const verifyScopes = async () => {
      setIsLoading(true)
      try {
        await verifyIntegrationScopes()
      } catch (error) {
        console.error("Failed to verify integration scopes:", error)
      } finally {
        setIsLoading(false)
      }
    }

    verifyScopes()
  }, [verifyIntegrationScopes])

  // Filter components based on available integrations and their scopes
  const availableComponents = useMemo(() => {
    return ALL_NODE_COMPONENTS.map((component) => {
      // Components without a provider are always available
      if (!component.providerId) {
        return { ...component, available: true, reason: null }
      }

      // Find the connected integration for this provider
      const integration = integrations.find((i) => i.provider === component.providerId && i.status === "connected")

      if (!integration) {
        return {
          ...component,
          available: false,
          reason: "Integration not connected",
        }
      }

      // Check if the integration has the required scopes
      const grantedScopes = integration.scopes || []
      const available = isComponentAvailable(component.providerId, component.type, grantedScopes)

      return {
        ...component,
        available,
        reason: available ? null : "Missing required permissions",
      }
    })
  }, [integrations])

  // Group components by category
  const componentsByCategory = useMemo(() => {
    const categories: Record<string, typeof availableComponents> = {}

    availableComponents.forEach((component) => {
      if (!categories[component.category]) {
        categories[component.category] = []
      }
      categories[component.category].push(component)
    })

    return categories
  }, [availableComponents])

  const handleDragStart = (e: React.DragEvent, nodeType: string, available: boolean) => {
    if (!available) {
      e.preventDefault()
      return
    }

    e.dataTransfer.setData("application/reactflow", nodeType)
    e.dataTransfer.effectAllowed = "move"
  }

  if (isLoading || verifyingScopes) {
    return (
      <div className="w-80 bg-white border-r border-gray-200 p-4 overflow-y-auto">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Components</h3>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            Verifying permissions...
          </div>
        </div>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-16 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="w-80 bg-white border-r border-gray-200 p-4 overflow-y-auto">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Components</h3>
          <p className="text-sm text-gray-600">Drag components to the canvas</p>
        </div>

        <div className="space-y-6">
          {Object.entries(componentsByCategory).map(([category, components]) => (
            <div key={category}>
              <h4 className="text-sm font-medium text-gray-700 mb-3 uppercase tracking-wide">{category}</h4>
              <div className="space-y-2">
                {components.map((component) => {
                  const IconComponent = component.icon
                  const isAvailable = component.available
                  const reason = component.reason

                  return (
                    <Tooltip key={component.type}>
                      <TooltipTrigger asChild>
                        <Card
                          className={`p-3 cursor-pointer transition-all duration-200 ${
                            isAvailable
                              ? "hover:shadow-md hover:border-blue-300 border-gray-200"
                              : "opacity-50 cursor-not-allowed border-gray-100 bg-gray-50"
                          }`}
                          draggable={isAvailable}
                          onDragStart={(e) => handleDragStart(e, component.type, isAvailable)}
                        >
                          <div className="flex items-start space-x-3">
                            <div className={`p-2 rounded-lg ${isAvailable ? "bg-blue-100" : "bg-gray-100"}`}>
                              <IconComponent className={`w-4 h-4 ${isAvailable ? "text-blue-600" : "text-gray-400"}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h5
                                  className={`text-sm font-medium ${isAvailable ? "text-gray-900" : "text-gray-500"}`}
                                >
                                  {component.title}
                                </h5>
                                {!isAvailable && <AlertTriangle className="w-3 h-3 text-yellow-500" />}
                              </div>
                              <p className={`text-xs ${isAvailable ? "text-gray-600" : "text-gray-400"}`}>
                                {component.description}
                              </p>
                              {component.providerId && (
                                <Badge
                                  variant="outline"
                                  className={`mt-1 text-xs ${isAvailable ? "" : "border-gray-200 text-gray-400"}`}
                                >
                                  {component.providerId}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </Card>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {isAvailable ? (
                          <p>Drag to add to workflow</p>
                        ) : (
                          <div>
                            <p className="font-medium">Component unavailable</p>
                            <p className="text-xs">{reason}</p>
                            {component.providerId && (
                              <p className="text-xs mt-1">
                                Connect {component.providerId} integration to use this component
                              </p>
                            )}
                          </div>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </TooltipProvider>
  )
}
