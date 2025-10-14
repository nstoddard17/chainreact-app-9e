import { getIntegrationCredentials } from "@/lib/integrations/getDecryptedAccessToken"
import { resolveValue } from "@/lib/integrations/resolveValue"

import { logger } from '@/lib/utils/logger'

/**
 * Action metadata for UI display and reference
 */
export const ACTION_METADATA = {
  key: "notion_action_create_database",
  name: "Create Notion Database",
  description: "Create a new database in Notion workspace with advanced configuration",
  icon: "database"
};

/**
 * Standard interface for action parameters
 */
export interface ActionParams {
  userId: string
  config: Record<string, any>
  input: Record<string, any>
}

/**
 * Standard interface for action results
 */
export interface ActionResult {
  success: boolean
  output?: Record<string, any>
  message?: string
  error?: string
}

/**
 * Creates a new Notion database with advanced configuration
 * 
 * @param params - Standard action parameters
 * @returns Action result with success/failure and any outputs
 */
export async function createNotionDatabase(params: ActionParams): Promise<ActionResult> {
  try {
    const { userId, config, input } = params
    
    // 1. Get Notion OAuth token
    const credentials = await getIntegrationCredentials(userId, "notion")
    
    // 2. Resolve any templated values in the config
    const resolvedConfig = resolveValue(config, {
      input,
    })
    
    // 3. Extract required parameters
    const { 
      workspace,
      databaseType,
      title,
      description,
      icon,
      cover,
      properties,
      views,
      template
    } = resolvedConfig
    
    // 4. Validate required parameters
    if (!title) {
      return {
        success: false,
        error: "Missing required parameter: title"
      }
    }
    
    if (!workspace) {
      return {
        success: false,
        error: "Missing required parameter: workspace"
      }
    }
    
    if (!properties || !Array.isArray(properties) || properties.length === 0) {
      return {
        success: false,
        error: "Missing required parameter: properties (must be an array with at least one property)"
      }
    }
    
    // 5. Apply template if specified
    let finalProperties = properties
    let finalViews = views || []
    
    if (template) {
      const templateConfig = getTemplateConfiguration(template)
      if (templateConfig) {
        finalProperties = templateConfig.properties
        finalViews = templateConfig.views
      }
    }
    
    // 6. Prepare the request payload
    const payload: any = {
      parent: {
        type: "workspace_id",
        workspace_id: true
      },
      title: [
        {
          type: "text",
          text: {
            content: title
          }
        }
      ],
      properties: buildPropertiesObject(finalProperties)
    }
    
    // Add description if provided
    if (description) {
      payload.description = [
        {
          type: "text",
          text: {
            content: description
          }
        }
      ]
    }
    
    // Add icon if provided
    if (icon && icon.value) {
      if (icon.mode === "upload" && icon.value.startsWith("http")) {
        payload.icon = {
          type: "external",
          external: {
            url: icon.value
          }
        }
      } else if (icon.mode === "url" && icon.value) {
        payload.icon = {
          type: "external",
          external: {
            url: icon.value
          }
        }
      }
    }
    
    // Add cover if provided
    if (cover && cover.value) {
      if (cover.mode === "upload" && cover.value.startsWith("http")) {
        payload.cover = {
          type: "external",
          external: {
            url: cover.value
          }
        }
      } else if (cover.mode === "url" && cover.value) {
        payload.cover = {
          type: "external",
          external: {
            url: cover.value
          }
        }
      }
    }
    
    // 7. Make the API call to create the database
    const response = await fetch("https://api.notion.com/v1/databases", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.access_token}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify(payload),
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      logger.error("Notion API error:", errorData)
      
      if (response.status === 401) {
        return {
          success: false,
          error: "Notion authentication expired. Please reconnect your account."
        }
      }
      
      return {
        success: false,
        error: `Failed to create database: ${response.status} - ${errorData.message || response.statusText}`
      }
    }
    
    const databaseData = await response.json()
    
    // 8. Create views if specified
    if (finalViews && finalViews.length > 0) {
      await createDatabaseViews(databaseData.id, finalViews, credentials.access_token)
    }
    
    // 9. Return success with database details
    return {
      success: true,
      output: {
        databaseId: databaseData.id,
        databaseTitle: databaseData.title?.[0]?.text?.content || title,
        databaseUrl: databaseData.url,
        createdTime: databaseData.created_time,
        lastEditedTime: databaseData.last_edited_time,
        properties: databaseData.properties,
        views: finalViews
      },
      message: `Successfully created database "${databaseData.title?.[0]?.text?.content || title}"`
    }
    
  } catch (error) {
    logger.error("Error creating Notion database:", error)
    return {
      success: false,
      error: `Failed to create database: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * Build properties object from the properties array
 */
function buildPropertiesObject(properties: any[]): Record<string, any> {
  const propertiesObj: Record<string, any> = {}
  
  for (const prop of properties) {
    if (!prop.name || !prop.type) continue
    
    const propertyConfig: any = {}
    
    switch (prop.type) {
      case "title":
        propertyConfig.title = {}
        break
        
      case "rich_text":
        propertyConfig.rich_text = {}
        break
        
      case "number":
        propertyConfig.number = {
          format: prop.config?.format || "number"
        }
        break
        
      case "select":
        propertyConfig.select = {
          options: prop.config?.options || []
        }
        break
        
      case "multi_select":
        propertyConfig.multi_select = {
          options: prop.config?.options || []
        }
        break
        
      case "date":
        propertyConfig.date = {}
        break
        
      case "people":
        propertyConfig.people = {}
        break
        
      case "files":
        propertyConfig.files = {}
        break
        
      case "checkbox":
        propertyConfig.checkbox = {}
        break
        
      case "url":
        propertyConfig.url = {}
        break
        
      case "email":
        propertyConfig.email = {}
        break
        
      case "phone_number":
        propertyConfig.phone_number = {}
        break
        
      case "formula":
        propertyConfig.formula = {
          expression: prop.config?.expression || ""
        }
        break
        
      case "relation":
        propertyConfig.relation = {
          database_id: prop.config?.databaseId || "",
          type: "single_property"
        }
        break
        
      default:
        // Default to rich_text for unknown types
        propertyConfig.rich_text = {}
    }
    
    propertiesObj[prop.name] = propertyConfig
  }
  
  return propertiesObj
}

/**
 * Create database views
 */
async function createDatabaseViews(databaseId: string, views: any[], accessToken: string): Promise<void> {
  for (const view of views) {
    if (!view.name || !view.viewType) continue
    
    const viewPayload: any = {
      name: view.name,
      type: view.viewType.toLowerCase()
    }
    
    // Add filters if specified
    if (view.filters && Array.isArray(view.filters)) {
      viewPayload.filter = {
        and: view.filters.map((filter: any) => ({
          property: filter.property,
          [filter.operator]: {
            equals: filter.value
          }
        }))
      }
    }
    
    // Add sorts if specified
    if (view.sorts && Array.isArray(view.sorts)) {
      viewPayload.sort = view.sorts.map((sort: any) => ({
        property: sort.property,
        direction: sort.direction
      }))
    }
    
    try {
      await fetch(`https://api.notion.com/v1/databases/${databaseId}/views`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify(viewPayload),
      })
    } catch (error) {
      logger.error("Error creating view:", error)
    }
  }
}

/**
 * Get template configuration
 */
function getTemplateConfiguration(template: string): any {
  const templates: Record<string, any> = {
    "Project Tracker": {
      properties: [
        { name: "Name", type: "title" },
        { name: "Status", type: "select", config: { options: [
          { name: "Not Started", color: "gray" },
          { name: "In Progress", color: "blue" },
          { name: "Review", color: "yellow" },
          { name: "Done", color: "green" }
        ]}},
        { name: "Priority", type: "select", config: { options: [
          { name: "Low", color: "green" },
          { name: "Medium", color: "yellow" },
          { name: "High", color: "red" }
        ]}},
        { name: "Assignee", type: "people" },
        { name: "Due Date", type: "date" },
        { name: "Progress", type: "number", config: { format: "percent" }},
        { name: "Tags", type: "multi_select", config: { options: [] }},
        { name: "Notes", type: "rich_text" }
      ],
      views: [
        {
          name: "All Projects",
          viewType: "Table"
        },
        {
          name: "By Status",
          viewType: "Board",
          sorts: [{ property: "Status", direction: "ascending" }]
        },
        {
          name: "Due Soon",
          viewType: "Table",
          filters: [{ property: "Due Date", operator: "<=", value: "7" }]
        }
      ]
    },
    "CRM": {
      properties: [
        { name: "Company", type: "title" },
        { name: "Contact Name", type: "rich_text" },
        { name: "Email", type: "email" },
        { name: "Phone", type: "phone_number" },
        { name: "Status", type: "select", config: { options: [
          { name: "Lead", color: "gray" },
          { name: "Prospect", color: "blue" },
          { name: "Customer", color: "green" },
          { name: "Lost", color: "red" }
        ]}},
        { name: "Value", type: "number", config: { format: "dollar" }},
        { name: "Source", type: "select", config: { options: [
          { name: "Website", color: "blue" },
          { name: "Referral", color: "green" },
          { name: "Cold Call", color: "yellow" },
          { name: "Social Media", color: "purple" }
        ]}},
        { name: "Last Contact", type: "date" },
        { name: "Notes", type: "rich_text" }
      ],
      views: [
        {
          name: "All Contacts",
          viewType: "Table"
        },
        {
          name: "By Status",
          viewType: "Board",
          sorts: [{ property: "Status", direction: "ascending" }]
        },
        {
          name: "High Value",
          viewType: "Table",
          filters: [{ property: "Value", operator: ">", value: "10000" }]
        }
      ]
    },
    "Content Calendar": {
      properties: [
        { name: "Title", type: "title" },
        { name: "Type", type: "select", config: { options: [
          { name: "Blog Post", color: "blue" },
          { name: "Video", color: "green" },
          { name: "Social Media", color: "purple" },
          { name: "Newsletter", color: "orange" }
        ]}},
        { name: "Status", type: "select", config: { options: [
          { name: "Ideation", color: "gray" },
          { name: "In Progress", color: "blue" },
          { name: "Review", color: "yellow" },
          { name: "Published", color: "green" }
        ]}},
        { name: "Author", type: "people" },
        { name: "Publish Date", type: "date" },
        { name: "Channel", type: "multi_select", config: { options: [
          { name: "Website", color: "blue" },
          { name: "YouTube", color: "red" },
          { name: "LinkedIn", color: "blue" },
          { name: "Twitter", color: "blue" }
        ]}},
        { name: "Keywords", type: "multi_select", config: { options: [] }},
        { name: "Notes", type: "rich_text" }
      ],
      views: [
        {
          name: "All Content",
          viewType: "Table"
        },
        {
          name: "Calendar",
          viewType: "Calendar",
          sorts: [{ property: "Publish Date", direction: "ascending" }]
        },
        {
          name: "By Type",
          viewType: "Board",
          sorts: [{ property: "Type", direction: "ascending" }]
        }
      ]
    },
    "Task Management": {
      properties: [
        { name: "Task", type: "title" },
        { name: "Status", type: "select", config: { options: [
          { name: "To Do", color: "gray" },
          { name: "In Progress", color: "blue" },
          { name: "Done", color: "green" }
        ]}},
        { name: "Priority", type: "select", config: { options: [
          { name: "Low", color: "green" },
          { name: "Medium", color: "yellow" },
          { name: "High", color: "red" }
        ]}},
        { name: "Assignee", type: "people" },
        { name: "Due Date", type: "date" },
        { name: "Category", type: "select", config: { options: [
          { name: "Development", color: "blue" },
          { name: "Design", color: "purple" },
          { name: "Marketing", color: "green" },
          { name: "Admin", color: "gray" }
        ]}},
        { name: "Description", type: "rich_text" }
      ],
      views: [
        {
          name: "All Tasks",
          viewType: "Table"
        },
        {
          name: "By Status",
          viewType: "Board",
          sorts: [{ property: "Status", direction: "ascending" }]
        },
        {
          name: "My Tasks",
          viewType: "Table",
          filters: [{ property: "Assignee", operator: "=", value: "me" }]
        }
      ]
    },
    "Bug Tracker": {
      properties: [
        { name: "Bug Title", type: "title" },
        { name: "Status", type: "select", config: { options: [
          { name: "Open", color: "red" },
          { name: "In Progress", color: "blue" },
          { name: "Testing", color: "yellow" },
          { name: "Resolved", color: "green" },
          { name: "Closed", color: "gray" }
        ]}},
        { name: "Severity", type: "select", config: { options: [
          { name: "Critical", color: "red" },
          { name: "High", color: "orange" },
          { name: "Medium", color: "yellow" },
          { name: "Low", color: "green" }
        ]}},
        { name: "Assignee", type: "people" },
        { name: "Reported By", type: "people" },
        { name: "Reported Date", type: "date" },
        { name: "Environment", type: "select", config: { options: [
          { name: "Production", color: "red" },
          { name: "Staging", color: "orange" },
          { name: "Development", color: "blue" }
        ]}},
        { name: "Description", type: "rich_text" },
        { name: "Steps to Reproduce", type: "rich_text" }
      ],
      views: [
        {
          name: "All Bugs",
          viewType: "Table"
        },
        {
          name: "By Status",
          viewType: "Board",
          sorts: [{ property: "Status", direction: "ascending" }]
        },
        {
          name: "Critical Bugs",
          viewType: "Table",
          filters: [{ property: "Severity", operator: "=", value: "Critical" }]
        }
      ]
    },
    "Customer Support": {
      properties: [
        { name: "Ticket", type: "title" },
        { name: "Status", type: "select", config: { options: [
          { name: "New", color: "gray" },
          { name: "Open", color: "blue" },
          { name: "Pending", color: "yellow" },
          { name: "Resolved", color: "green" },
          { name: "Closed", color: "gray" }
        ]}},
        { name: "Priority", type: "select", config: { options: [
          { name: "Low", color: "green" },
          { name: "Medium", color: "yellow" },
          { name: "High", color: "red" },
          { name: "Urgent", color: "red" }
        ]}},
        { name: "Customer", type: "rich_text" },
        { name: "Email", type: "email" },
        { name: "Assignee", type: "people" },
        { name: "Category", type: "select", config: { options: [
          { name: "Technical", color: "blue" },
          { name: "Billing", color: "purple" },
          { name: "Feature Request", color: "green" },
          { name: "General", color: "gray" }
        ]}},
        { name: "Created Date", type: "date" },
        { name: "Description", type: "rich_text" }
      ],
      views: [
        {
          name: "All Tickets",
          viewType: "Table"
        },
        {
          name: "By Status",
          viewType: "Board",
          sorts: [{ property: "Status", direction: "ascending" }]
        },
        {
          name: "Urgent Tickets",
          viewType: "Table",
          filters: [{ property: "Priority", operator: "=", value: "Urgent" }]
        }
      ]
    },
    "Sales Pipeline": {
      properties: [
        { name: "Deal", type: "title" },
        { name: "Stage", type: "select", config: { options: [
          { name: "Lead", color: "gray" },
          { name: "Qualified", color: "blue" },
          { name: "Proposal", color: "yellow" },
          { name: "Negotiation", color: "orange" },
          { name: "Closed Won", color: "green" },
          { name: "Closed Lost", color: "red" }
        ]}},
        { name: "Value", type: "number", config: { format: "dollar" }},
        { name: "Probability", type: "number", config: { format: "percent" }},
        { name: "Owner", type: "people" },
        { name: "Company", type: "rich_text" },
        { name: "Contact", type: "rich_text" },
        { name: "Expected Close", type: "date" },
        { name: "Notes", type: "rich_text" }
      ],
      views: [
        {
          name: "All Deals",
          viewType: "Table"
        },
        {
          name: "Pipeline",
          viewType: "Board",
          sorts: [{ property: "Stage", direction: "ascending" }]
        },
        {
          name: "High Value",
          viewType: "Table",
          filters: [{ property: "Value", operator: ">", value: "50000" }]
        }
      ]
    },
    "Marketing Campaigns": {
      properties: [
        { name: "Campaign", type: "title" },
        { name: "Status", type: "select", config: { options: [
          { name: "Planning", color: "gray" },
          { name: "Active", color: "green" },
          { name: "Paused", color: "yellow" },
          { name: "Completed", color: "blue" }
        ]}},
        { name: "Type", type: "select", config: { options: [
          { name: "Email", color: "blue" },
          { name: "Social Media", color: "purple" },
          { name: "PPC", color: "green" },
          { name: "Content", color: "orange" }
        ]}},
        { name: "Budget", type: "number", config: { format: "dollar" }},
        { name: "Manager", type: "people" },
        { name: "Start Date", type: "date" },
        { name: "End Date", type: "date" },
        { name: "Target Audience", type: "rich_text" },
        { name: "Goals", type: "rich_text" }
      ],
      views: [
        {
          name: "All Campaigns",
          viewType: "Table"
        },
        {
          name: "By Status",
          viewType: "Board",
          sorts: [{ property: "Status", direction: "ascending" }]
        },
        {
          name: "Active Campaigns",
          viewType: "Table",
          filters: [{ property: "Status", operator: "=", value: "Active" }]
        }
      ]
    },
    "Event Planning": {
      properties: [
        { name: "Event", type: "title" },
        { name: "Status", type: "select", config: { options: [
          { name: "Planning", color: "gray" },
          { name: "Confirmed", color: "blue" },
          { name: "In Progress", color: "green" },
          { name: "Completed", color: "green" },
          { name: "Cancelled", color: "red" }
        ]}},
        { name: "Type", type: "select", config: { options: [
          { name: "Conference", color: "blue" },
          { name: "Workshop", color: "green" },
          { name: "Webinar", color: "purple" },
          { name: "Meeting", color: "orange" }
        ]}},
        { name: "Date", type: "date" },
        { name: "Location", type: "rich_text" },
        { name: "Organizer", type: "people" },
        { name: "Attendees", type: "number" },
        { name: "Budget", type: "number", config: { format: "dollar" }},
        { name: "Description", type: "rich_text" }
      ],
      views: [
        {
          name: "All Events",
          viewType: "Table"
        },
        {
          name: "Calendar",
          viewType: "Calendar",
          sorts: [{ property: "Date", direction: "ascending" }]
        },
        {
          name: "Upcoming Events",
          viewType: "Table",
          filters: [{ property: "Date", operator: ">=", value: "today" }]
        }
      ]
    },
    "Team Directory": {
      properties: [
        { name: "Name", type: "title" },
        { name: "Role", type: "select", config: { options: [
          { name: "Developer", color: "blue" },
          { name: "Designer", color: "purple" },
          { name: "Manager", color: "green" },
          { name: "Marketing", color: "orange" },
          { name: "Sales", color: "red" }
        ]}},
        { name: "Department", type: "select", config: { options: [
          { name: "Engineering", color: "blue" },
          { name: "Design", color: "purple" },
          { name: "Product", color: "green" },
          { name: "Marketing", color: "orange" },
          { name: "Sales", color: "red" }
        ]}},
        { name: "Email", type: "email" },
        { name: "Phone", type: "phone_number" },
        { name: "Start Date", type: "date" },
        { name: "Manager", type: "people" },
        { name: "Skills", type: "multi_select", config: { options: [] }},
        { name: "Bio", type: "rich_text" }
      ],
      views: [
        {
          name: "All Team",
          viewType: "Table"
        },
        {
          name: "By Department",
          viewType: "Board",
          sorts: [{ property: "Department", direction: "ascending" }]
        },
        {
          name: "By Role",
          viewType: "Board",
          sorts: [{ property: "Role", direction: "ascending" }]
        }
      ]
    },
    "Knowledge Base": {
      properties: [
        { name: "Article", type: "title" },
        { name: "Category", type: "select", config: { options: [
          { name: "Getting Started", color: "green" },
          { name: "How-to Guides", color: "blue" },
          { name: "Troubleshooting", color: "red" },
          { name: "API Documentation", color: "purple" },
          { name: "FAQs", color: "orange" }
        ]}},
        { name: "Status", type: "select", config: { options: [
          { name: "Draft", color: "gray" },
          { name: "In Review", color: "yellow" },
          { name: "Published", color: "green" },
          { name: "Archived", color: "gray" }
        ]}},
        { name: "Author", type: "people" },
        { name: "Last Updated", type: "date" },
        { name: "Tags", type: "multi_select", config: { options: [] }},
        { name: "Content", type: "rich_text" }
      ],
      views: [
        {
          name: "All Articles",
          viewType: "Table"
        },
        {
          name: "By Category",
          viewType: "Board",
          sorts: [{ property: "Category", direction: "ascending" }]
        },
        {
          name: "Published",
          viewType: "Table",
          filters: [{ property: "Status", operator: "=", value: "Published" }]
        }
      ]
    }
  }
  
  return templates[template]
} 