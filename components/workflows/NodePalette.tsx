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
        // Continue with available integrations even if verification fails
      } finally {
        setIsLoading(false)
      }
    }

    verifyScopes()
  }, [verifyIntegrationScopes])

  // Filter components based on connected integrations and their verified scopes
  const availableComponents = useMemo(() => {
    const connectedIntegrations = integrations.filter((integration) => integration.status === "connected")

    return ALL_NODE_COMPONENTS.filter((component) => {
      // If component doesn't require a provider, it's always available
      if (!component.providerId) {
        return true
      }

      // Find the matching connected integration
      const matchingIntegration = connectedIntegrations.find(
        (integration) => integration.provider === component.providerId,
      )

      if (!matchingIntegration) {
        return false
      }

      // If component doesn't specify required scopes, it's available if integration is connected
      if (!component.requiredScopes || component.requiredScopes.length === 0) {
        return true
      }

      // Use verified scopes if available, otherwise fall back to stored scopes
      const integrationScopes = matchingIntegration.verifiedScopes || matchingIntegration.metadata?.scopes || []

      // For demo integrations, show all components
      if (matchingIntegration.metadata?.demo) {
        return true
      }

      // Check if all required scopes are available in the integration
      return component.requiredScopes.every((requiredScope) => {
        // For Google scopes, handle both exact matches and readonly vs full access
        if (requiredScope.includes("googleapis.com/auth/")) {
          // If the component requires readonly scope, it's satisfied by either readonly or full access
          if (requiredScope.includes(".readonly")) {
            const fullAccessScope = requiredScope.replace(".readonly", "")
            return integrationScopes.includes(requiredScope) || integrationScopes.includes(fullAccessScope)
          }

          // If component requires full access, only full access scope will work
          return integrationScopes.includes(requiredScope)
        }

        return integrationScopes.includes(requiredScope)
      })
    })
  }, [integrations])

  // Group components by category
  const componentsByCategory = useMemo(() => {
    const categories: Record<string, NodeComponent[]> = {}

    availableComponents.forEach((component) => {
      if (!categories[component.category]) {
        categories[component.category] = []
      }
      categories[component.category].push(component)
    })

    return categories
  }, [availableComponents])

  const onDragStart = (event: React.DragEvent, nodeType: string, nodeData: any) => {
    event.dataTransfer.setData("application/reactflow", nodeType)
    event.dataTransfer.setData("application/nodedata", JSON.stringify(nodeData))
    event.dataTransfer.effectAllowed = "move"
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "Triggers":
        return "green"
      case "Communication":
        return "blue"
      case "Productivity":
        return "purple"
      case "Development":
        return "orange"
      case "Email":
        return "red"
      case "Cloud Storage":
        return "indigo"
      case "Logic & Control":
        return "yellow"
      case "Data Operations":
        return "gray"
      case "Error Handling":
        return "red"
      default:
        return "gray"
    }
  }

  const getColorClasses = (color: string) => {
    const colorMap = {
      green: {
        bg: "bg-green-100",
        text: "text-green-600",
        badge: "bg-green-100 text-green-700",
      },
      blue: {
        bg: "bg-blue-100",
        text: "text-blue-600",
        badge: "bg-blue-100 text-blue-700",
      },
      purple: {
        bg: "bg-purple-100",
        text: "text-purple-600",
        badge: "bg-purple-100 text-purple-700",
      },
      orange: {
        bg: "bg-orange-100",
        text: "text-orange-600",
        badge: "bg-orange-100 text-orange-700",
      },
      red: {
        bg: "bg-red-100",
        text: "text-red-600",
        badge: "bg-red-100 text-red-700",
      },
      indigo: {
        bg: "bg-indigo-100",
        text: "text-indigo-600",
        badge: "bg-indigo-100 text-indigo-700",
      },
      yellow: {
        bg: "bg-yellow-100",
        text: "text-yellow-600",
        badge: "bg-yellow-100 text-yellow-700",
      },
      gray: {
        bg: "bg-gray-100",
        text: "text-gray-600",
        badge: "bg-gray-100 text-gray-700",
      },
    }
    return colorMap[color as keyof typeof colorMap] || colorMap.gray
  }

  if (isLoading || verifyingScopes) {
    return (
      <div className="w-80 bg-white border-r border-gray-200 p-4 overflow-y-auto">
        <div className="flex items-center gap-2 mb-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <h3 className="text-lg font-semibold">Verifying Components...</h3>
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="w-80 bg-white border-r border-gray-200 p-4 overflow-y-auto">
      <h3 className="text-lg font-semibold mb-4 text-gray-900">Components</h3>

      {Object.keys(componentsByCategory).length === 0 ? (
        <div className="text-center py-8">
          <div className="text-gray-500 mb-2">No components available</div>
          <div className="text-sm text-gray-400">Connect integrations to see more components</div>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(componentsByCategory).map(([category, components]) => {
            const color = getCategoryColor(category)
            const colorClasses = getColorClasses(color)

            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="secondary" className={`${colorClasses.badge} text-xs font-medium`}>
                    {category}
                  </Badge>
                  <span className="text-xs text-gray-500">({components.length})</span>
                </div>
                <div className="space-y-2">
                  {components.map((component) => {
                    const Icon = component.icon
                    return (
                      <Card
                        key={component.type}
                        className="p-3 cursor-move border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 hover:shadow-md transition-all duration-200 transform hover:scale-[1.02] group"
                        draggable
                        onDragStart={(e) =>
                          onDragStart(e, component.type, {
                            title: component.title,
                            description: component.description,
                            providerId: component.providerId,
                            requiredScopes: component.requiredScopes,
                          })
                        }
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`p-2 rounded-lg ${colorClasses.bg} group-hover:scale-110 transition-transform duration-200`}
                          >
                            <Icon className={`h-4 w-4 ${colorClasses.text}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-gray-900 group-hover:text-gray-700 transition-colors">
                              {component.title}
                            </h4>
                            <p className="text-xs text-gray-600 mt-1 leading-relaxed">{component.description}</p>
                            {component.providerId && (
                              <div className="mt-2">
                                <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600 border-gray-200">
                                  {component.providerId}
                                </Badge>
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
