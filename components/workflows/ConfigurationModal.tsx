"use client"

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { loadNodeConfig, saveNodeConfig } from "@/lib/workflows/configPersistence"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { NodeComponent, NodeField, ConfigField } from "@/lib/workflows/availableNodes"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useWorkflowTestStore } from "@/stores/workflowTestStore"
import { Combobox, MultiCombobox, HierarchicalCombobox } from "@/components/ui/combobox"
import { EmailAutocomplete } from "@/components/ui/email-autocomplete"
import { LocationAutocomplete } from "@/components/ui/location-autocomplete"
import { GmailLabelsInput } from "@/components/ui/gmail-labels-input"
import { ConfigurationLoadingScreen } from "@/components/ui/loading-screen"
import { FileUpload } from "@/components/ui/file-upload"
import { DatePicker } from "@/components/ui/date-picker"
import { TimePicker } from "@/components/ui/time-picker"
import { Play, X, Loader2, TestTube, Clock, HelpCircle, AlertCircle, Video, ChevronLeft, ChevronRight, Database, Calendar, Upload, Eye, RefreshCw, Package, FileText, Filter, Mail, Variable } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { EnhancedTooltip } from "@/components/ui/enhanced-tooltip"
import { ScrollArea } from "@/components/ui/scroll-area"
import GoogleMeetCard from "@/components/ui/google-meet-card"
import VariablePicker from "./VariablePicker"
import { NotionDatabaseConfig } from "./NotionDatabaseConfig"
import SlackTemplatePreview from "../ui/slack-template-preview"
import { SlackEmailInviteMultiCombobox } from "@/components/ui/SlackEmailInviteMultiCombobox"
import { DiscordUserSelector } from "./DiscordUserSelector"
import { DiscordMessagesPreview } from "./DiscordMessagesPreview"
import { GmailEmailsPreview } from "./GmailEmailsPreview"
import { NotionRecordsPreview } from "./NotionRecordsPreview"
import { DiscordEmojiPicker } from "@/components/discord/DiscordEmojiPicker"
import { Smile } from "lucide-react"


import { getUser } from "@/lib/supabase-client";

// Import template configuration function
const getTemplateConfiguration = (template: string): any => {
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
    "Feature Requests": {
      properties: [
        { name: "Feature", type: "title" },
        { name: "Status", type: "select", config: { options: [
          { name: "Requested", color: "gray" },
          { name: "Under Review", color: "blue" },
          { name: "Approved", color: "green" },
          { name: "In Development", color: "yellow" },
          { name: "Completed", color: "green" },
          { name: "Rejected", color: "red" }
        ]}},
        { name: "Priority", type: "select", config: { options: [
          { name: "Low", color: "green" },
          { name: "Medium", color: "yellow" },
          { name: "High", color: "red" }
        ]}},
        { name: "Requested By", type: "people" },
        { name: "Assigned To", type: "people" },
        { name: "Target Release", type: "date" },
        { name: "Category", type: "select", config: { options: [
          { name: "UI/UX", color: "purple" },
          { name: "Backend", color: "blue" },
          { name: "Frontend", color: "green" },
          { name: "Mobile", color: "orange" }
        ]}},
        { name: "Description", type: "rich_text" },
        { name: "Business Value", type: "rich_text" }
      ],
      views: [
        {
          name: "All Features",
          viewType: "Table"
        },
        {
          name: "By Status",
          viewType: "Board",
          sorts: [{ property: "Status", direction: "ascending" }]
        },
        {
          name: "High Priority",
          viewType: "Table",
          filters: [{ property: "Priority", operator: "=", value: "High" }]
        }
      ]
    },
    "Customer Support": {
      properties: [
        { name: "Ticket", type: "title" },
        { name: "Status", type: "select", config: { options: [
          { name: "Open", color: "red" },
          { name: "In Progress", color: "blue" },
          { name: "Waiting for Customer", color: "yellow" },
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
        { name: "Assigned To", type: "people" },
        { name: "Created Date", type: "date" },
        { name: "Category", type: "select", config: { options: [
          { name: "Technical", color: "blue" },
          { name: "Billing", color: "purple" },
          { name: "Feature Request", color: "green" },
          { name: "Bug Report", color: "red" }
        ]}},
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
          name: "My Tickets",
          viewType: "Table",
          filters: [{ property: "Assigned To", operator: "=", value: "me" }]
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
        { name: "Company", type: "rich_text" },
        { name: "Contact", type: "rich_text" },
        { name: "Owner", type: "people" },
        { name: "Close Date", type: "date" },
        { name: "Source", type: "select", config: { options: [
          { name: "Website", color: "blue" },
          { name: "Referral", color: "green" },
          { name: "Cold Call", color: "yellow" },
          { name: "Trade Show", color: "purple" }
        ]}},
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
        { name: "Start Date", type: "date" },
        { name: "End Date", type: "date" },
        { name: "Owner", type: "people" },
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
          { name: "In Progress", color: "yellow" },
          { name: "Completed", color: "green" },
          { name: "Cancelled", color: "red" }
        ]}},
        { name: "Date", type: "date" },
        { name: "Location", type: "rich_text" },
        { name: "Organizer", type: "people" },
        { name: "Type", type: "select", config: { options: [
          { name: "Conference", color: "blue" },
          { name: "Workshop", color: "green" },
          { name: "Meeting", color: "purple" },
          { name: "Webinar", color: "orange" }
        ]}},
        { name: "Capacity", type: "number" },
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
          name: "By Status",
          viewType: "Board",
          sorts: [{ property: "Status", direction: "ascending" }]
        }
      ]
    },
    "Product Roadmap": {
      properties: [
        { name: "Feature", type: "title" },
        { name: "Status", type: "select", config: { options: [
          { name: "Backlog", color: "gray" },
          { name: "In Progress", color: "blue" },
          { name: "Testing", color: "yellow" },
          { name: "Ready for Release", color: "green" },
          { name: "Released", color: "blue" }
        ]}},
        { name: "Priority", type: "select", config: { options: [
          { name: "Low", color: "green" },
          { name: "Medium", color: "yellow" },
          { name: "High", color: "red" }
        ]}},
        { name: "Owner", type: "people" },
        { name: "Target Release", type: "date" },
        { name: "Category", type: "select", config: { options: [
          { name: "Core Feature", color: "blue" },
          { name: "Enhancement", color: "green" },
          { name: "Bug Fix", color: "red" }
        ]}},
        { name: "Description", type: "rich_text" },
        { name: "Acceptance Criteria", type: "rich_text" }
      ],
      views: [
        {
          name: "All Features",
          viewType: "Table"
        },
        {
          name: "Roadmap",
          viewType: "Board",
          sorts: [{ property: "Status", direction: "ascending" }]
        },
        {
          name: "High Priority",
          viewType: "Table",
          filters: [{ property: "Priority", operator: "=", value: "High" }]
        }
      ]
    },
    "Team Directory": {
      properties: [
        { name: "Name", type: "title" },
        { name: "Role", type: "rich_text" },
        { name: "Department", type: "select", config: { options: [
          { name: "Engineering", color: "blue" },
          { name: "Design", color: "purple" },
          { name: "Marketing", color: "green" },
          { name: "Sales", color: "orange" },
          { name: "HR", color: "pink" }
        ]}},
        { name: "Email", type: "email" },
        { name: "Phone", type: "phone_number" },
        { name: "Location", type: "rich_text" },
        { name: "Start Date", type: "date" },
        { name: "Manager", type: "people" },
        { name: "Skills", type: "multi_select", config: { options: [] }},
        { name: "Bio", type: "rich_text" }
      ],
      views: [
        {
          name: "All Team Members",
          viewType: "Table"
        },
        {
          name: "By Department",
          viewType: "Board",
          sorts: [{ property: "Department", direction: "ascending" }]
        },
        {
          name: "Gallery",
          viewType: "Gallery"
        }
      ]
    },
    "Knowledge Base": {
      properties: [
        { name: "Article", type: "title" },
        { name: "Category", type: "select", config: { options: [
          { name: "Getting Started", color: "blue" },
          { name: "How-to Guides", color: "green" },
          { name: "Troubleshooting", color: "red" },
          { name: "API Documentation", color: "purple" }
        ]}},
        { name: "Author", type: "people" },
        { name: "Status", type: "select", config: { options: [
          { name: "Draft", color: "gray" },
          { name: "In Review", color: "yellow" },
          { name: "Published", color: "green" },
          { name: "Archived", color: "red" }
        ]}},
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
    },
    "Inventory Management": {
      properties: [
        { name: "Item", type: "title" },
        { name: "Category", type: "select", config: { options: [
          { name: "Electronics", color: "blue" },
          { name: "Office Supplies", color: "green" },
          { name: "Furniture", color: "purple" },
          { name: "Software", color: "orange" }
        ]}},
        { name: "SKU", type: "rich_text" },
        { name: "Quantity", type: "number" },
        { name: "Price", type: "number", config: { format: "dollar" }},
        { name: "Supplier", type: "rich_text" },
        { name: "Last Updated", type: "date" },
        { name: "Location", type: "rich_text" },
        { name: "Notes", type: "rich_text" }
      ],
      views: [
        {
          name: "All Items",
          viewType: "Table"
        },
        {
          name: "By Category",
          viewType: "Board",
          sorts: [{ property: "Category", direction: "ascending" }]
        },
        {
          name: "Low Stock",
          viewType: "Table",
          filters: [{ property: "Quantity", operator: "<", value: "10" }]
        }
      ]
    },
    "Expense Tracker": {
      properties: [
        { name: "Expense", type: "title" },
        { name: "Category", type: "select", config: { options: [
          { name: "Travel", color: "blue" },
          { name: "Meals", color: "green" },
          { name: "Office Supplies", color: "purple" },
          { name: "Software", color: "orange" }
        ]}},
        { name: "Amount", type: "number", config: { format: "dollar" }},
        { name: "Date", type: "date" },
        { name: "Submitted By", type: "people" },
        { name: "Status", type: "select", config: { options: [
          { name: "Pending", color: "gray" },
          { name: "Approved", color: "green" },
          { name: "Rejected", color: "red" }
        ]}},
        { name: "Receipt", type: "files" },
        { name: "Notes", type: "rich_text" }
      ],
      views: [
        {
          name: "All Expenses",
          viewType: "Table"
        },
        {
          name: "By Category",
          viewType: "Board",
          sorts: [{ property: "Category", direction: "ascending" }]
        },
        {
          name: "Pending Approval",
          viewType: "Table",
          filters: [{ property: "Status", operator: "=", value: "Pending" }]
        }
      ]
    },
    "Time Tracking": {
      properties: [
        { name: "Task", type: "title" },
        { name: "Project", type: "rich_text" },
        { name: "Person", type: "people" },
        { name: "Date", type: "date" },
        { name: "Hours", type: "number" },
        { name: "Status", type: "select", config: { options: [
          { name: "In Progress", color: "blue" },
          { name: "Completed", color: "green" },
          { name: "Approved", color: "green" }
        ]}},
        { name: "Description", type: "rich_text" }
      ],
      views: [
        {
          name: "All Time Entries",
          viewType: "Table"
        },
        {
          name: "By Person",
          viewType: "Board",
          sorts: [{ property: "Person", direction: "ascending" }]
        },
        {
          name: "This Week",
          viewType: "Table",
          filters: [{ property: "Date", operator: ">=", value: "7" }]
        }
      ]
    },
    "Meeting Notes": {
      properties: [
        { name: "Meeting", type: "title" },
        { name: "Date", type: "date" },
        { name: "Attendees", type: "people" },
        { name: "Type", type: "select", config: { options: [
          { name: "Team Standup", color: "blue" },
          { name: "Client Meeting", color: "green" },
          { name: "Planning", color: "purple" },
          { name: "Review", color: "orange" }
        ]}},
        { name: "Duration", type: "number" },
        { name: "Agenda", type: "rich_text" },
        { name: "Notes", type: "rich_text" },
        { name: "Action Items", type: "rich_text" }
      ],
      views: [
        {
          name: "All Meetings",
          viewType: "Table"
        },
        {
          name: "Calendar",
          viewType: "Calendar",
          sorts: [{ property: "Date", direction: "ascending" }]
        },
        {
          name: "By Type",
          viewType: "Board",
          sorts: [{ property: "Type", direction: "ascending" }]
        }
      ]
    },
    "Research Database": {
      properties: [
        { name: "Research Topic", type: "title" },
        { name: "Category", type: "select", config: { options: [
          { name: "Market Research", color: "blue" },
          { name: "Competitor Analysis", color: "green" },
          { name: "User Research", color: "purple" },
          { name: "Technical Research", color: "orange" }
        ]}},
        { name: "Status", type: "select", config: { options: [
          { name: "Planning", color: "gray" },
          { name: "In Progress", color: "blue" },
          { name: "Completed", color: "green" }
        ]}},
        { name: "Researcher", type: "people" },
        { name: "Start Date", type: "date" },
        { name: "End Date", type: "date" },
        { name: "Findings", type: "rich_text" },
        { name: "Sources", type: "rich_text" }
      ],
      views: [
        {
          name: "All Research",
          viewType: "Table"
        },
        {
          name: "By Category",
          viewType: "Board",
          sorts: [{ property: "Category", direction: "ascending" }]
        },
        {
          name: "Active Research",
          viewType: "Table",
          filters: [{ property: "Status", operator: "=", value: "In Progress" }]
        }
      ]
    },
    "Learning Management": {
      properties: [
        { name: "Course", type: "title" },
        { name: "Category", type: "select", config: { options: [
          { name: "Technical Skills", color: "blue" },
          { name: "Soft Skills", color: "green" },
          { name: "Leadership", color: "purple" },
          { name: "Industry Knowledge", color: "orange" }
        ]}},
        { name: "Instructor", type: "people" },
        { name: "Status", type: "select", config: { options: [
          { name: "Not Started", color: "gray" },
          { name: "In Progress", color: "blue" },
          { name: "Completed", color: "green" }
        ]}},
        { name: "Start Date", type: "date" },
        { name: "Duration", type: "number" },
        { name: "Description", type: "rich_text" },
        { name: "Materials", type: "files" }
      ],
      views: [
        {
          name: "All Courses",
          viewType: "Table"
        },
        {
          name: "By Category",
          viewType: "Board",
          sorts: [{ property: "Category", direction: "ascending" }]
        },
        {
          name: "In Progress",
          viewType: "Table",
          filters: [{ property: "Status", operator: "=", value: "In Progress" }]
        }
      ]
    }
  }
  
  return templates[template] || null
}



// Enhanced File Input Component for Icon/Cover Images
interface EnhancedFileInputProps {
  fieldDef: NodeField
  fieldValue: any
  onValueChange: (value: any) => void
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
}

const EnhancedFileInput = ({ fieldDef, fieldValue, onValueChange, workflowData, currentNodeId }: EnhancedFileInputProps) => {
  const [activeTab, setActiveTab] = useState("upload")
  const [urlInput, setUrlInput] = useState("")
  const [emojiInput, setEmojiInput] = useState("")
  
  // Common emojis for quick selection
  const commonEmojis = ["🎯", "📝", "📊", "📈", "📉", "✅", "❌", "⚠️", "💡", "🔥", "⭐", "💎", "🚀", "🎉", "🎨", "📱", "💻", "🌐", "📧", "📞", "📍", "📅", "⏰", "💰", "🎁", "🏆", "🎪", "🎭", "🎨", "🎵", "🎬", "📚", "🎓", "💼", "🏢", "🏠", "🚗", "✈️", "🚢", "🎮", "⚽", "🏀", "🎾", "🏈", "⚾", "🎯", "🎳", "🎲", "🃏", "🎴", "🀄", "🎰", "🎪", "🎭", "🎨", "🎵", "🎬", "📚", "🎓", "💼", "🏢", "🏠", "🚗", "✈️", "🚢", "🎮", "⚽", "🏀", "🎾", "🏈", "⚾"]

  const handleFileUpload = (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    if (fileArray.length > 0) {
      const file = fileArray[0]
      // Create a file object with URL for preview
      const fileObj = {
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        url: URL.createObjectURL(file)
      }
      onValueChange(fileObj)
    }
  }

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      onValueChange(urlInput.trim())
      setUrlInput("")
    }
  }

  const handleEmojiSelect = (emoji: string) => {
    onValueChange(emoji)
    setEmojiInput("")
  }

  const getDisplayValue = () => {
    if (!fieldValue) return "No file selected"
    
    if (typeof fieldValue === 'string') {
      if (fieldValue.length <= 2) return `Emoji: ${fieldValue}`
      if (fieldValue.startsWith('http')) return `URL: ${fieldValue}`
      return fieldValue
    }
    
    if (fieldValue && typeof fieldValue === 'object') {
      if (fieldValue.name) return `File: ${fieldValue.name}`
      if (fieldValue.url) return `URL: ${fieldValue.url}`
    }
    
    return "File selected"
  }

  return (
    <div className="space-y-3">
      {/* Removed DEBUG label */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-2">
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="url">URL</TabsTrigger>
          <TabsTrigger value="emoji">Emoji</TabsTrigger>
        </TabsList>
        
        <TabsContent value="upload" className="space-y-2">
          <input
            type="file"
            id={`file-${fieldDef.name}`}
            accept={fieldDef.accept || "image/*"}
            onChange={(e) => handleFileUpload(e.target.files || [])}
            className="hidden"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => document.getElementById(`file-${fieldDef.name}`)?.click()}
              className="flex-1"
            >
              Choose File
            </Button>
            <VariablePicker
              workflowData={workflowData}
              currentNodeId={currentNodeId}
              onVariableSelect={(variable) => onValueChange(variable)}
              fieldType="file"
              trigger={
                <Button size="sm" className="flex-shrink-0 px-3 h-10 bg-gradient-to-r from-purple-400 to-purple-600 hover:from-purple-500 hover:to-purple-700 text-white border-0 shadow-sm" title="Insert variable">
                  <span className="text-sm font-mono">{`{}`}</span>
                </Button>
              }
            />
          </div>
        </TabsContent>
        
        <TabsContent value="url" className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Enter image URL (e.g., https://example.com/image.jpg)"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
              className="flex-1"
            />
            <Button 
              onClick={handleUrlSubmit} 
              size="sm" 
              disabled={!urlInput.trim()}
              className="px-4"
            >
              Add
            </Button>
          </div>
          {urlInput && (
            <div className="text-xs text-muted-foreground">
              Press Enter or click Add to use this URL
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="emoji" className="space-y-2">
          <div className="grid grid-cols-8 gap-2 max-h-32 overflow-y-auto">
            {commonEmojis.map((emoji, index) => (
              <Button
                key={`emoji-${index}-${emoji}`}
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 text-lg"
                onClick={() => handleEmojiSelect(emoji)}
              >
                {emoji}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Paste custom emoji"
              value={emojiInput}
              onChange={(e) => setEmojiInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && emojiInput && handleEmojiSelect(emojiInput)}
            />
            <Button 
              onClick={() => emojiInput && handleEmojiSelect(emojiInput)} 
              size="sm"
              disabled={!emojiInput}
              className="px-4"
            >
              Add
            </Button>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Tip: On Mac, press <b>Control + Command + Space</b>. On Windows, press <b>Windows + . (period)</b>. Or copy an emoji from another site.
          </div>
        </TabsContent>
      </Tabs>
      
      {/* Current Value Display */}
      {fieldValue && (
        <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
          {getDisplayValue()}
        </div>
      )}
    </div>
  )
}

interface ConfigurationModalProps {
  isOpen: boolean
  onClose: (wasSaved?: boolean) => void
  onSave: (config: Record<string, any>) => void
  nodeInfo: NodeComponent | null
  integrationName: string
  initialData?: Record<string, any>
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
}

// Add at the top, after imports
const ProLabel = () => (
  <span style={{
    background: '#b983d9',
    color: '#19171c',
    fontWeight: 700,
    fontSize: 12,
    borderRadius: 6,
    padding: '2px 8px',
    marginLeft: 8,
    display: 'inline-block',
    verticalAlign: 'middle',
    letterSpacing: 1,
  }}>PRO</span>
);
const FreeLabel = () => (
  <span style={{
    background: '#e6f4ea',
    color: '#1a7f37',
    fontWeight: 700,
    fontSize: 12,
    borderRadius: 6,
    padding: '2px 8px',
    marginLeft: 8,
    display: 'inline-block',
    verticalAlign: 'middle',
    letterSpacing: 1,
  }}>✅ Free</span>
);

export default function ConfigurationModal({
  isOpen,
  onClose,
  onSave,
  nodeInfo,
  integrationName,
  initialData = {},
  workflowData,
  currentNodeId,
}: ConfigurationModalProps) {
  // Debug: Log the full nodeInfo object for Gmail
  if (nodeInfo?.type === 'gmail_action_send_email') {
    console.log('🔍 Gmail nodeInfo debug:', {
      nodeInfo,
      hasProviderId: 'providerId' in nodeInfo,
      providerIdValue: nodeInfo.providerId,
      allKeys: Object.keys(nodeInfo)
    });
  }
  
  // Ensure nodeInfo has providerId set correctly for Gmail
  if (nodeInfo && nodeInfo.type === 'gmail_action_send_email' && !nodeInfo.providerId) {
    console.log('🔧 Fixing missing providerId for Gmail action');
    nodeInfo.providerId = 'gmail';
  }
  
  console.log("🔍 ConfigurationModal rendered:", { 
    isOpen, 
    nodeType: nodeInfo?.type, 
    integrationName,
    providerId: nodeInfo?.providerId,
    nodeInfoKeys: nodeInfo ? Object.keys(nodeInfo) : []
  });
  
  // ADD DEBUG LOG FOR TRELLO
  if (nodeInfo?.type === "trello_action_create_card" || nodeInfo?.type === "trello_action_move_card") {
    console.log("🔍 TRELLO CONFIG MODAL DEBUG:", {
      nodeType: nodeInfo.type,
      providerId: nodeInfo.providerId,
      configSchema: nodeInfo.configSchema,
      configSchemaLength: nodeInfo.configSchema?.length || 0,
      configSchemaFields: nodeInfo.configSchema?.map(f => ({ name: f.name, dependsOn: f.dependsOn, dynamic: f.dynamic })),
      isModalOpen: isOpen
    });
  }
  
  // State to control tooltip visibility
  const [tooltipsEnabled, setTooltipsEnabled] = useState(false)
  
  // Get workflow ID from the URL or context
  const getWorkflowId = useCallback(() => {
    if (typeof window === "undefined") return ""
    
    // Extract workflow ID from URL (e.g., /workflows/builder/[id])
    const pathParts = window.location.pathname.split('/')
    const builderIndex = pathParts.indexOf('builder')
    
    if (builderIndex !== -1 && pathParts.length > builderIndex + 1) {
      return pathParts[builderIndex + 1]
    }
    
    return ""
  }, [])
  
  // Initialize state for dynamic options
  const [dynamicOptions, setDynamicOptions] = useState<
    Record<string, { value: string; label: string; fields?: any[]; isExisting?: boolean }[]>
  >({})
  
  // Track errors for dynamic fields
  const [dynamicErrors, setDynamicErrors] = useState<Record<string, string>>({})
  
  // Gmail enhanced recipients loading
  useEffect(() => {
    const loadGmailRecipients = async () => {
      console.log('🔍 Gmail loading effect triggered:', { 
        isOpen, 
        nodeType: nodeInfo?.type, 
        expectedType: 'gmail_action_send_email',
        matches: nodeInfo?.type === 'gmail_action_send_email'
      });
      
      // Only proceed if modal is open and it's a Gmail send email node
      if (!isOpen || nodeInfo?.type !== 'gmail_action_send_email') {
        console.log('❌ Gmail loading skipped due to conditions not met');
        return;
      }
      
      console.log('🚀 Loading Gmail enhanced recipients...');
      
      const integration = getIntegrationByProvider('gmail');
      console.log('🔍 Gmail integration lookup result:', integration ? {
        id: integration.id,
        provider: integration.provider,
        status: integration.status
      } : 'null');
      
      if (!integration) {
        console.error('❌ No Gmail integration found');
        setDynamicErrors(prev => ({
          ...prev,
          'gmail-enhanced-recipients': 'Gmail integration not found. Please connect your Gmail account.'
        }));
        return;
      }
      
      try {
        console.log('📡 Calling loadIntegrationData for gmail-enhanced-recipients with integration ID:', integration.id);
        const data = await loadIntegrationData('gmail-enhanced-recipients', integration.id);
        console.log('📦 loadIntegrationData returned:', { 
          isArray: Array.isArray(data), 
          length: Array.isArray(data) ? data.length : 'not array',
          type: typeof data,
          data: data 
        });
        
        if (data && Array.isArray(data)) {
          console.log('✅ Gmail recipients loaded:', data.length, 'items');
          console.log('📧 Sample recipients:', data.slice(0, 3));
          
          // Update dynamic options with the data
          setDynamicOptions(prev => ({
            ...prev,
            'gmail-enhanced-recipients': data
          }));
          
          // Clear any errors
          setDynamicErrors(prev => ({
            ...prev,
            'gmail-enhanced-recipients': undefined
          }));
        } else {
          console.warn('⚠️ No Gmail recipients data returned or not an array');
          setDynamicOptions(prev => ({
            ...prev,
            'gmail-enhanced-recipients': []
          }));
          setDynamicErrors(prev => ({
            ...prev,
            'gmail-enhanced-recipients': 'No email suggestions available. Make sure your Gmail account has sent or received emails.'
          }));
        }
      } catch (error) {
        console.error('❌ Error loading Gmail recipients:', error);
        setDynamicErrors(prev => ({
          ...prev,
          'gmail-enhanced-recipients': 'Unable to load email suggestions. Please check your Gmail integration.'
        }));
      }
    };
    
    loadGmailRecipients();
    
  }, [isOpen, nodeInfo?.type, getIntegrationByProvider, loadIntegrationData]);

  // Debug dynamic options state
  useEffect(() => {
    console.log('🔍 Dynamic options updated:', Object.keys(dynamicOptions))
    if (dynamicOptions['gmail-enhanced-recipients']) {
      console.log('📧 Gmail enhanced recipients in dynamic options:', dynamicOptions['gmail-enhanced-recipients'].length, 'items')
    }
  }, [dynamicOptions])
  
  // Initialize config with persisted data or initialData
  const [config, setConfig] = useState<Record<string, any>>(() => {
    // Only try to load saved config if we have a valid node ID (not a pending node)
    if (currentNodeId && currentNodeId !== 'pending-action' && currentNodeId !== 'pending-trigger' && nodeInfo?.type) {
      const workflowId = getWorkflowId()
      if (workflowId) {
        const savedNodeData = loadNodeConfig(workflowId, currentNodeId, nodeInfo.type)
        if (savedNodeData) {
          console.log('📋 Loaded saved configuration for node:', currentNodeId)
          
          // If we have saved dynamic options, restore them
          if (savedNodeData.dynamicOptions) {
            console.log('📋 Restoring saved dynamic options')
            // Use setTimeout to ensure this happens after initial render
            setTimeout(() => {
              setDynamicOptions(prev => ({
                ...prev,
                ...savedNodeData.dynamicOptions
              }))
            }, 0)
          }
          
          return { ...initialData, ...savedNodeData.config }
        }
      }
    }
    return initialData
  })
  
  // Enable tooltips after modal opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        setTooltipsEnabled(true)
      }, 2000) // 2 second delay
      
      return () => {
        clearTimeout(timer)
        setTooltipsEnabled(false)
      }
    }
  }, [isOpen])

  // Reset Slack plan state when modal opens
  useEffect(() => {
    if (isOpen && nodeInfo?.type === "slack_action_create_channel") {
      setSlackPlanError(null);
      setSlackPlanLoading(false);
    }
  }, [isOpen, nodeInfo?.type])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { loadIntegrationData, getIntegrationByProvider, checkIntegrationScopes, integrationData } = useIntegrationStore()
  const [loadingDynamic, setLoadingDynamic] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [createNewTables, setCreateNewTables] = useState<Record<string, boolean>>({})
  const [dynamicTableFields, setDynamicTableFields] = useState<Record<string, any[]>>({})
  const [showRowSelected, setShowRowSelected] = useState(false)
  const [meetDraft, setMeetDraft] = useState<{ eventId: string; meetUrl: string } | null>(null)
  const [meetLoading, setMeetLoading] = useState(false)
  const meetDraftRef = useRef<string | null>(null)
  const previousDependentValues = useRef<Record<string, any>>({})
  const hasInitializedTimezone = useRef<boolean>(false)
  const hasInitializedDefaults = useRef<boolean>(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  
  // State for Basic/Advanced tabs
  const [activeTab, setActiveTab] = useState("basic")
  
  // Add refs to prevent duplicate calls and enable request deduplication
  const fetchingDynamicData = useRef(false)
  const fetchingDependentData = useRef<Set<string>>(new Set())
  const requestCache = useRef<Map<string, Promise<any>>>(new Map())
  
  // Loading state management to prevent flashing and double loading
  const loadingStartTimeRef = useRef<number | null>(null)
  const minLoadingTimeRef = useRef<number>(1000) // Increased to 1000ms to prevent double loading
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const loadingStateRef = useRef<boolean>(false) // Track actual loading state
  const [hasShownLoading, setHasShownLoading] = useState(false) // Track if we've shown loading to prevent double loading
  const activeLoadingTasksRef = useRef<Set<string>>(new Set()) // Track active loading tasks
  
  // Debounced loading state setter with double loading prevention
  const setLoadingDynamicDebounced = useCallback((loading: boolean, taskId?: string) => {
    if (taskId) {
      if (loading) {
        activeLoadingTasksRef.current.add(taskId)
      } else {
        activeLoadingTasksRef.current.delete(taskId)
      }
    }
    
    // Check if we have any active loading tasks
    const hasActiveTasks = activeLoadingTasksRef.current.size > 0
    
    // Prevent rapid state changes that cause flickering
    if (hasActiveTasks === loadingStateRef.current) {
      return
    }
    
    if (hasActiveTasks) {
      // Start loading
      loadingStartTimeRef.current = Date.now()
      loadingStateRef.current = true
      setLoadingDynamic(true)
      setHasShownLoading(true) // Mark that we've shown loading
    } else {
      // For Discord actions, clear loading immediately to prevent stuck state
      if (nodeInfo && nodeInfo.type === "discord_action_send_message") {
        console.log('🔄 Discord action: Clearing loading state immediately')
        loadingStateRef.current = false
        setLoadingDynamic(false)
        setHasShownLoading(false)
        loadingStartTimeRef.current = null
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current)
          loadingTimeoutRef.current = null
        }
      } else {
        // Check if minimum loading time has passed for other integrations
        const elapsed = Date.now() - (loadingStartTimeRef.current || 0)
        const remainingTime = Math.max(0, minLoadingTimeRef.current - elapsed)
        
        if (remainingTime > 0) {
          // Set a timeout to hide loading after minimum time
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current)
          }
          loadingTimeoutRef.current = setTimeout(() => {
            loadingStateRef.current = false
            setLoadingDynamic(false)
            setHasShownLoading(false) // Reset loading shown state
            loadingStartTimeRef.current = null
            loadingTimeoutRef.current = null
          }, remainingTime)
        } else {
          // Hide loading immediately
          loadingStateRef.current = false
          setLoadingDynamic(false)
          setHasShownLoading(false) // Reset loading shown state
          loadingStartTimeRef.current = null
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current)
            loadingTimeoutRef.current = null
          }
        }
      }
    }
  }, [])
  
  // Create Spreadsheet specific state
  const [spreadsheetRows, setSpreadsheetRows] = useState<Record<string, string>[]>([{}])
  const [columnNames, setColumnNames] = useState<string[]>([])
  
  // Sheet data preview state  
  const [sheetData, setSheetData] = useState<any>(null)
  const [sheetPreview, setSheetPreview] = useState<any>(null)
  
  // Range selection state for Google Sheets
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ row: number; col: number } | null>(null)
  const [dragEnd, setDragEnd] = useState<{ row: number; col: number } | null>(null)
  const [selectedRange, setSelectedRange] = useState<{ start: { row: number; col: number }; end: { row: number; col: number } } | null>(null)
  
  // Test functionality state
  const [testResult, setTestResult] = useState<any>(null)
  const [isTestLoading, setIsTestLoading] = useState(false)
  const [showTestOutput, setShowTestOutput] = useState(false)
  
  // Enhanced workflow segment testing state
  const [segmentTestResult, setSegmentTestResult] = useState<any>(null)
  const [isSegmentTestLoading, setIsSegmentTestLoading] = useState(false)
  const [showDataFlowPanels, setShowDataFlowPanels] = useState(false)
  
  // Discord bot detection state
  const [botStatus, setBotStatus] = useState<Record<string, boolean>>({})
  const [checkingBot, setCheckingBot] = useState(false)
  
  // Discord specific loading states
  const [loadingDiscordChannels, setLoadingDiscordChannels] = useState(false)
  const [loadingDiscordMessages, setLoadingDiscordMessages] = useState(false)
  
  // Function to fetch message data and reactions for Discord add reaction
  const fetchMessageDataAndReactions = useCallback(async (messageId: string, channelId: string) => {
    if (!messageId || !channelId) {
      setSelectedMessageData(null);
      setMessageReactions([]);
      return;
    }
    
    const integration = getIntegrationByProvider("discord");
    if (!integration) return;
    
    try {
      setLoadingMessageReactions(true);
      
      // Fetch the full message data directly from Discord API
      const messageData = await loadIntegrationData("discord_messages", integration.id, { channelId });
      const selectedMessage = messageData?.find((msg: any) => msg.id === messageId);
      
      if (selectedMessage) {
        setSelectedMessageData(selectedMessage);
      } else {
        // Fallback to dynamic options if direct fetch fails
        const messageOptions = dynamicOptions.messageId || [];
        const fallbackMessage = messageOptions.find((msg: any) => msg.value === messageId);
        if (fallbackMessage) {
          setSelectedMessageData(fallbackMessage);
        }
      }
      
      // Fetch reactions for the message
      const reactionsData = await loadIntegrationData("discord_reactions", integration.id, { 
        channelId, 
        messageId 
      });
      
      if (reactionsData && Array.isArray(reactionsData)) {
        setMessageReactions(reactionsData);
      } else {
        setMessageReactions([]);
      }
    } catch (error) {
      console.error('Error fetching message reactions:', error);
      setMessageReactions([]);
    } finally {
      setLoadingMessageReactions(false);
    }
  }, [dynamicOptions.messageId, getIntegrationByProvider, loadIntegrationData]);
  
  // Global test store
  const { 
    setTestResults, 
    getNodeInputOutput, 
    isNodeInExecutionPath, 
    hasTestResults,
    getNodeTestResult,
    testTimestamp
  } = useWorkflowTestStore()

  // File attachment state for rich text editors
  const [attachments, setAttachments] = useState<Record<string, File[]>>({})

  // Slack plan fetching state
  const [slackPlanError, setSlackPlanError] = useState<string | null>(null)
  const [slackPlanLoading, setSlackPlanLoading] = useState(false)
  
  // Discord reaction state (moved from renderField to top level)
  const [discordReactions, setDiscordReactions] = useState([
    { emoji: "👍", count: 12, reacted: false },
    { emoji: "😂", count: 4, reacted: false },
    { emoji: "🪱", count: 3, reacted: false },
  ]);
  const [discordPickerOpen, setDiscordPickerOpen] = useState(false);
  
  // Discord message and reactions state
  const [selectedMessageData, setSelectedMessageData] = useState<any>(null);
  const [messageReactions, setMessageReactions] = useState<any[]>([]);
  const [loadingMessageReactions, setLoadingMessageReactions] = useState(false);
  
  // Cache for Discord reactions to persist data between modal opens
  const [discordReactionsCache, setDiscordReactionsCache] = useState<Record<string, any[]>>({});
  


  // Preview functionality state
  const [previewData, setPreviewData] = useState<any>(null)
  

  

  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // Preview functionality
  const handlePreview = async () => {
    if (!nodeInfo || !config) return

    setPreviewLoading(true)
    setPreviewError(null)
    setPreviewData(null)

    try {
      // Get user ID from integration store instead of calling getUser directly
      const currentUserId = useIntegrationStore.getState().currentUserId
      if (!currentUserId) {
        throw new Error("User not authenticated. Please log in again.")
      }

      let endpoint = ""
      let requestBody: any = { userId: currentUserId, config }

      // Determine the correct preview endpoint based on node type
      if (nodeInfo.type === "discord_action_fetch_messages") {
        endpoint = "/api/workflows/discord/fetch-messages-preview"
      } else if (nodeInfo.type === "gmail_action_search_emails" || nodeInfo.type === "gmail_action_search_email") {
        endpoint = "/api/workflows/gmail/search-emails-preview"
      } else if (nodeInfo.type === "notion_action_search_pages") {
        endpoint = "/api/workflows/notion/search-pages-preview"
      } else {
        throw new Error("Preview not available for this action type")
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to load preview")
      }

      setPreviewData(data.data)
    } catch (error: any) {
      console.error("Preview error:", error)
      setPreviewError(error.message || "Failed to load preview")
    } finally {
      setPreviewLoading(false)
    }
  }

  // Helper functions for range selection
  const getCellCoordinate = (rowIndex: number, colIndex: number): string => {
    const colLetter = String.fromCharCode(65 + colIndex) // A, B, C, etc.
    const rowNumber = rowIndex + 1 // Convert to 1-based indexing
    return `${colLetter}${rowNumber}`
  }

  const getRangeString = (start: { row: number; col: number }, end: { row: number; col: number }): string => {
    const startCoord = getCellCoordinate(start.row, start.col)
    const endCoord = getCellCoordinate(end.row, end.col)
    return `${startCoord}:${endCoord}`
  }

  const isCellInRange = (rowIndex: number, colIndex: number, range: { start: { row: number; col: number }; end: { row: number; col: number } }): boolean => {
    const minRow = Math.min(range.start.row, range.end.row)
    const maxRow = Math.max(range.start.row, range.end.row)
    const minCol = Math.min(range.start.col, range.end.col)
    const maxCol = Math.max(range.start.col, range.end.col)
    
    return rowIndex >= minRow && rowIndex <= maxRow && colIndex >= minCol && colIndex <= maxCol
  }

  const isCellSelected = (rowIndex: number, colIndex: number): boolean => {
    if (!config.selectedCells || !Array.isArray(config.selectedCells)) return false
    return config.selectedCells.some((cell: any) => cell.rowIndex === rowIndex && cell.colIndex === colIndex)
  }

  // Mouse event handlers for range selection
  const handleMouseDown = (rowIndex: number, colIndex: number) => {
    if (nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "range") {
      // Prevent text selection during drag
      document.body.style.userSelect = 'none'
      ;(document.body.style as any).webkitUserSelect = 'none'
      ;(document.body.style as any).mozUserSelect = 'none'
      ;(document.body.style as any).msUserSelect = 'none'
      
      setIsDragging(true)
      setDragStart({ row: rowIndex, col: colIndex })
      setDragEnd({ row: rowIndex, col: colIndex })
      setSelectedRange({ start: { row: rowIndex, col: colIndex }, end: { row: rowIndex, col: colIndex } })
    }
  }

  const handleMouseEnter = (rowIndex: number, colIndex: number) => {
    if (isDragging && nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "range") {
      setDragEnd({ row: rowIndex, col: colIndex })
      setSelectedRange({ start: dragStart!, end: { row: rowIndex, col: colIndex } })
    }
  }

  const handleMouseUp = () => {
    if (isDragging && nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "range") {
      setIsDragging(false)
      if (selectedRange) {
        const rangeString = getRangeString(selectedRange.start, selectedRange.end)
        setConfig(prev => ({
          ...prev,
          range: rangeString
        }))
      }
    }
    
    // Restore text selection
    document.body.style.userSelect = ''
    ;(document.body.style as any).webkitUserSelect = ''
    ;(document.body.style as any).mozUserSelect = ''
    ;(document.body.style as any).msUserSelect = ''
  }

  const handleCellClick = (rowIndex: number, colIndex: number) => {
    if (nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "cells") {
      const currentSelectedCells = config.selectedCells || []
      const cellKey = `${rowIndex}-${colIndex}`
      const isSelected = currentSelectedCells.some((cell: any) => cell.rowIndex === rowIndex && cell.colIndex === colIndex)
      
      const newSelectedCells = isSelected
        ? currentSelectedCells.filter((cell: any) => !(cell.rowIndex === rowIndex && cell.colIndex === colIndex))
        : [...currentSelectedCells, { rowIndex, colIndex, coordinate: getCellCoordinate(rowIndex, colIndex) }]
      
      setConfig(prev => ({
        ...prev,
        selectedCells: newSelectedCells
      }))
    }
  }

  useEffect(() => {
    setConfig(initialData)
    // Initialize attachments from initialData if they exist
    if (initialData.attachments) {
      setAttachments(initialData.attachments)
    }
    // Reset the initialization flag when initialData changes
    hasInitializedDefaults.current = false
  }, [initialData])

  // Cleanup effect to abort in-flight requests when modal closes or node changes
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [isOpen, currentNodeId])

  // Global mouse up handler for range selection
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        handleMouseUp()
      }
    }

    document.addEventListener('mouseup', handleGlobalMouseUp)
    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [isDragging, selectedRange])

  // Reset range selection when readMode changes
  useEffect(() => {
    if (nodeInfo?.type === "google_sheets_action_read_data" && config.readMode !== "range") {
      setIsDragging(false)
      setDragStart(null)
      setDragEnd(null)
      setSelectedRange(null)
    }
  }, [config.readMode, nodeInfo?.type])

  // Clear preview data when config changes
  useEffect(() => {
    if (previewData) {
      setPreviewData(null)
      setPreviewError(null)
    }
  }, [config])

  // Reset loading state when modal closes
  useEffect(() => {
    if (!isOpen) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      setLoadingDynamicDebounced(false)
      setRetryCount(0)
      // Reset loading tracking state
      setHasShownLoading(false)
      // Clear all active loading tasks
      activeLoadingTasksRef.current.clear()
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
        loadingTimeoutRef.current = null
      }
      loadingStateRef.current = false
      loadingStartTimeRef.current = null
      // Reset previous dependent values when modal closes
      previousDependentValues.current = {}
      hasInitializedTimezone.current = false
      hasInitializedDefaults.current = false
      hasHandledInitialDiscordGuild.current = false
      // Clear errors when modal closes
      setErrors({})
      // Clear preview data when modal closes
      setPreviewData(null)
      setPreviewError(null)
      setPreviewLoading(false)
      // Reset range selection state
      setIsDragging(false)
      setDragStart(null)
      setDragEnd(null)
      setSelectedRange(null)
      // Clear Discord reactions cache when modal closes
      setDiscordReactionsCache({})
      setSelectedMessageData(null)
      setMessageReactions([])
    }
  }, [isOpen])

  // Clear integration error when integration status changes
  useEffect(() => {
    if (nodeInfo?.providerId) {
      const integration = getIntegrationByProvider(nodeInfo.providerId)
      if (integration && integration.status === 'connected' && errors.integrationError) {
        // Clear the error if the integration is now connected
        setErrors(prev => {
          const newErrors = { ...prev }
          delete newErrors.integrationError
          return newErrors
        })
      }
    }
  }, [nodeInfo?.providerId, getIntegrationByProvider, errors.integrationError])

  // Check Discord bot status when guild is selected
  const checkBotInGuild = async (guildId: string) => {
    if (!guildId || checkingBot) return
    
    const taskId = `bot-check-${guildId}`
    setCheckingBot(true)
    setLoadingDynamicDebounced(true, taskId)
    
    try {
      const response = await fetch('/api/integrations/discord/check-bot-in-guild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId })
      })
      
      if (response.ok) {
        const data = await response.json()
        const isBotPresent = data.present
        setBotStatus(prev => ({ ...prev, [guildId]: isBotPresent }))
        
        if (isBotPresent) {
          console.log('✅ Bot is connected to guild:', guildId, '- channels will be fetched by fetchDependentFields')
        } else {
          console.log('❌ Bot is not connected to guild:', guildId)
          // Clear any existing channels when bot is not connected
          setDynamicOptions(prev => ({
            ...prev,
            "channelId": [],
          }))
        }
      } else {
        console.error('Failed to check bot status')
        setBotStatus(prev => ({ ...prev, [guildId]: false }))
      }
    } catch (error) {
      console.error('Error checking bot status:', error)
      setBotStatus(prev => ({ ...prev, [guildId]: false }))
    } finally {
      setCheckingBot(false)
      setLoadingDynamicDebounced(false, taskId)
    }
  }

  // Initialize default values from schema
  useEffect(() => {
    if (!nodeInfo || hasInitializedDefaults.current) return

    const defaultValues: Record<string, any> = {}
    
    // Apply default values from configSchema
    nodeInfo.configSchema?.forEach((field: any) => {
      if (field.defaultValue !== undefined && (config[field.name] === undefined || config[field.name] === '')) {
        defaultValues[field.name] = field.defaultValue
      }
    })

    // Initialize Google Calendar defaults
    if (nodeInfo?.type === "google_calendar_action_create_event") {
      const now = new Date()
      const nextHour = new Date(now)
      nextHour.setHours(now.getHours() + 1, 0, 0, 0) // Round to next hour
      const endTime = new Date(nextHour)
      endTime.setHours(endTime.getHours() + 1) // 1 hour duration
      
      // Set default dates and times if not already set
      if (config.startDate === undefined) {
        defaultValues.startDate = formatDate(now)
      }
      if (config.startTime === undefined) {
        defaultValues.startTime = formatTime(nextHour)
      }
      if (config.endDate === undefined) {
        defaultValues.endDate = formatDate(now)
      }
      if (config.endTime === undefined) {
        defaultValues.endTime = formatTime(endTime)
      }
      if (config.timeZone === undefined || config.timeZone === "user-timezone") {
        defaultValues.timeZone = getUserTimezone()
      }
    }

    // Initialize Google Sheets create spreadsheet defaults
    if (nodeInfo?.type === "google_sheets_action_create_spreadsheet") {
      // Set default timezone to user's current timezone if not specified
      if (config.timeZone === undefined) {
        defaultValues.timeZone = getUserTimezone()
      }
    }

    // Initialize Outlook calendar event defaults
    if (nodeInfo?.type === "microsoft-outlook_action_create_calendar_event") {
      // Set default timezone to user's current timezone if not specified
      if (config.timeZone === undefined || config.timeZone === "user-timezone") {
        defaultValues.timeZone = getUserTimezone()
      }
    }

    // Auto-populate Gmail action fields from Gmail trigger
    if (nodeInfo.providerId === 'gmail' && nodeInfo.type?.includes('action') && workflowData) {
      // Find the Gmail trigger node
      const gmailTrigger = workflowData.nodes?.find(node => {
        const isGmailTrigger = (
          node.data?.isTrigger === true && node.data?.providerId === 'gmail'
        ) || (
          node.data?.type?.startsWith('gmail_trigger')
        )
        
        if (isGmailTrigger) {
          
        }
        
        return isGmailTrigger
      })
      
      if (gmailTrigger) {
        const messageIdField = nodeInfo.configSchema?.find(field => field.name === 'messageId')
        if (messageIdField && config[messageIdField.name] === undefined) {
          let fromEmail = ''
          
          // METHOD 1: Try to get email from trigger's EXECUTION OUTPUT (if it has been tested/run)
          const triggerTestData = getNodeInputOutput(gmailTrigger.id)
          if (triggerTestData?.output) {
            fromEmail = triggerTestData.output.from || triggerTestData.output.sender || ''
          }
          
          // METHOD 2: Fallback to trigger's CONFIGURATION (static filter)
          if (!fromEmail) {
            const triggerConfig = gmailTrigger.data?.config || {}
            fromEmail = triggerConfig.from || ''
          }
          
          // METHOD 3: If no email found anywhere, try trigger output for other email fields
          if (!fromEmail && triggerTestData?.output) {
            fromEmail = triggerTestData.output.fromEmail || triggerTestData.output.email || ''
          }
          
          if (fromEmail && fromEmail.trim() !== '') {
            defaultValues[messageIdField.name] = fromEmail

          } else {
            defaultValues[messageIdField.name] = ''
            console.log('ℹ️ No email found in trigger config OR execution output')
          }
        }
      } else {

      }
    }

    if (Object.keys(defaultValues).length > 0) {
      setConfig(prev => ({ ...defaultValues, ...prev }))
      hasInitializedDefaults.current = true
    }
  }, [nodeInfo, workflowData])

  // Check if this node has test data available
  const nodeTestData = currentNodeId ? getNodeInputOutput(currentNodeId) : null
  const isInExecutionPath = currentNodeId ? isNodeInExecutionPath(currentNodeId) : false
  const nodeTestResult = currentNodeId ? getNodeTestResult(currentNodeId) : null
  
  // Auto-show panels if this node has test data
  useEffect(() => {
    if (nodeTestData && isInExecutionPath) {
      setShowDataFlowPanels(true)
    }
  }, [nodeTestData, isInExecutionPath])

  // Function to get user's timezone
  const getUserTimezone = () => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch (error) {
      // Fallback to UTC if timezone detection fails
      return "UTC"
    }
  }

  // Function to round time to nearest 5 minutes
  const roundToNearest5Minutes = (date: Date): Date => {
    const minutes = date.getMinutes()
    const roundedMinutes = Math.round(minutes / 5) * 5
    const newDate = new Date(date)
    newDate.setMinutes(roundedMinutes, 0, 0)
    return newDate
  }

  // Function to format time as HH:MM
  const formatTime = (date: Date): string => {
    return date.toTimeString().slice(0, 5)
  }

  // Function to format date as YYYY-MM-DD
  const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0]
  }

  // Function to fetch dynamic table fields from database
  const fetchTableFields = useCallback(async (tableName: string) => {
    if (!nodeInfo || !nodeInfo.providerId) return

    const integration = getIntegrationByProvider(nodeInfo.providerId)
    if (!integration) return

    const taskId = `table-fields-${tableName}`
    
    // For now, use the existing table fields from dynamicOptions since the API doesn't support dynamic field fetching
    // In the future, this could be enhanced to make actual API calls when the backend supports it
    try {
      setLoadingDynamicDebounced(true, taskId)
      
      // Look for table fields in the existing dynamicOptions
      const selectedTable = dynamicOptions["tableName"]?.find((table: any) => table.value === tableName)
      if (selectedTable?.fields && Array.isArray(selectedTable.fields)) {
        setDynamicTableFields(prev => ({
          ...prev,
          [tableName]: selectedTable.fields as any[]
        }))
        
        // Fetch records for linked table fields
        for (const fieldDef of selectedTable.fields) {
          const isLinkedField = fieldDef.type === "linkedRecord" || 
                               fieldDef.type === "link" || 
                               fieldDef.type === "multipleRecordLinks" ||
                               fieldDef.type === "recordLink" ||
                               fieldDef.type === "lookup" ||
                               fieldDef.linkedTableName ||
                               fieldDef.foreignTable
          
          if (isLinkedField && fieldDef.linkedTableName) {
            try {

              
              // Determine the appropriate data type for priority linked fields
              let dataType = "airtable_records"
              if (fieldDef.name.toLowerCase().includes('project')) {
                dataType = "airtable_project_records"
              } else if (fieldDef.name.toLowerCase().includes('task')) {
                dataType = "airtable_task_records"
              } else if (fieldDef.name.toLowerCase().includes('feedback')) {
                dataType = "airtable_feedback_records"
              }
              
              const linkedTableData = await loadIntegrationData(
                dataType,
                integration.id,
                { baseId: config.baseId, tableName: fieldDef.linkedTableName }
              )
              

              
              if (linkedTableData) {
                // The API already returns data with value, label, description, and fields properties
                // So we don't need to remap it, just use it directly
                const mappedRecords = linkedTableData.map((record: any) => ({
                  value: record.value || record.id,
                  label: record.label || record.name || 'Untitled',
                  description: record.description || '',
                  fields: record.fields || {}
                }))
                

                
                setDynamicOptions(prev => {
                  const newOptions = {
                    ...prev,
                    [`${fieldDef.name}_records`]: mappedRecords
                  }
                  
                  // Also store with generic priority keys for consistency
                  if (fieldDef.name.toLowerCase().includes('project')) {
                    newOptions["project_records"] = mappedRecords
                  } else if (fieldDef.name.toLowerCase().includes('task')) {
                    newOptions["task_records"] = mappedRecords
                  } else if (fieldDef.name.toLowerCase().includes('feedback')) {
                    newOptions["feedback_records"] = mappedRecords
                  }
                  
                  return newOptions
                })
              } else {
                console.warn(`⚠️ No linked records found for ${fieldDef.name}`)
              }
            } catch (error) {
              console.error(`❌ Error fetching records for linked table ${fieldDef.linkedTableName}:`, error)
            }
          }
        }
      } else {
        // If no fields found for the specific table, try to find any table with the same name
        // or use a generic field structure
        console.warn(`No fields found for table ${tableName}, using generic field structure`)
        setDynamicTableFields(prev => ({
          ...prev,
          [tableName]: [
            { name: 'Name', type: 'singleLineText', required: true },
            { name: 'Notes', type: 'multilineText', required: false },
            { name: 'Status', type: 'singleSelect', required: false, options: { choices: [{ name: 'Active' }, { name: 'Inactive' }] } },
            { name: 'Created Date', type: 'date', required: false }
          ]
        }))
      }
    } catch (error) {
      console.error(`Error setting up fields for table ${tableName}:`, error)
    } finally {
      setLoadingDynamicDebounced(false, taskId)
    }
  }, [nodeInfo?.providerId, getIntegrationByProvider, dynamicOptions, config.baseId])

  // Function to toggle create new mode for a table
  const toggleCreateNew = useCallback(async (tableName: string) => {
    const isCurrentlyCreating = createNewTables[tableName]
    
    setCreateNewTables(prev => ({
      ...prev,
      [tableName]: !isCurrentlyCreating
    }))

    // Clear the fields when switching modes
    if (isCurrentlyCreating) {
      setConfig(prev => {
        const newConfig = { ...prev }
        delete newConfig[`${tableName}_newFields`]
        return newConfig
      })
    } else {
      setConfig(prev => ({
        ...prev,
        [`${tableName}_newFields`]: {}
      }))
    }

    // Fetch fresh table fields when entering create mode
    if (!isCurrentlyCreating) {
      await fetchTableFields(tableName)
    }
  }, [createNewTables, fetchTableFields])

  // Function to check if a field should be shown based on dependencies
  const shouldShowField = (field: ConfigField | NodeField): boolean => {
    // Don't show hidden fields
    if (field.hidden) {
      return false
    }
    
    // Handle fields with uiTab property
    if ('uiTab' in field) {
      // Show field only if it's in the current active tab
      if (field.uiTab && field.uiTab !== activeTab) {
        return false
      }
    }
    
    // Special logic for Gmail search emails action for backward compatibility
    if (nodeInfo?.type === "gmail_action_search_email" && !('uiTab' in field)) {
      // Basic tab only shows emailAddress and quantity fields
      if (activeTab === "basic") {
        return field.name === "emailAddress" || field.name === "quantity";
      } 
      // Advanced tab shows query field and additional fields
      else if (activeTab === "advanced") {
        return field.name === "query" || 
               field.name === "includeBody" || 
               field.name === "includeAttachments" || 
               field.name === "labelIds";
      }
    }
    
    // Special logic for Discord actions that use channels
    if (nodeInfo?.type && nodeInfo.type.startsWith("discord_action_")) {
      // Always show guildId (server selection)
      if (field.name === "guildId") {
        return true
      }
      
      // Show channel field if guild is selected
      if (field.name === "channelId" && config.guildId) {
        return true
      }
      
      // Show message field if channel is selected
      if (field.name === "messageId" && config.channelId) {
        return true
      }
      
      // Show emoji field if message is selected (for reaction actions)
      if (field.name === "emoji" && config.messageId) {
        return true
      }
      
      // Show all other fields if guild is selected (don't require bot status)
      if (config.guildId) {
        return true
      }
      
      return false
    }

    // Special logic for Discord fetch messages action
    if (nodeInfo?.type === "discord_action_fetch_messages") {
      // Always show basic fields
      if (field.name === "guildId" || field.name === "channelId" || field.name === "limit" || field.name === "filterType") {
        return true
      }
      
      // Show filter-specific fields based on filterType
      const filterType = config.filterType || "none"
      
      if (field.name === "filterAuthor") {
        return filterType === "author"
      }
      
      if (field.name === "filterContent") {
        return filterType === "content"
      }
      
      if (field.name === "caseSensitive") {
        return filterType === "content"
      }
      
      return true
    }
    
    // Special logic for read data action (applies to all fields, including those with dependencies)
    if (nodeInfo?.type === "google_sheets_action_read_data") {
      // Hide range field entirely since users can select visually
      if (field.name === "range") {
        return false
      }
      // Only show selectedRows field when readMode is "rows"
      if (field.name === "selectedRows" && config.readMode !== "rows") {
        return false
      }
      // Only show selectedCells field when readMode is "cells"
      if (field.name === "selectedCells" && config.readMode !== "cells") {
        return false
      }
      // Only show maxRows field when readMode is "all"
      if (field.name === "maxRows" && config.readMode !== "all") {
        return false
      }
    }

    // Special logic for Outlook calendar event - hide time fields when all day is selected
    if (nodeInfo?.type === "microsoft-outlook_action_create_calendar_event") {
      // Hide start and end time fields when isAllDay is true
      if ((field.name === "startTime" || field.name === "endTime") && config.isAllDay === true) {
        return false
      }
    }

    if (!field.dependsOn) {
      // Special logic for unified Google Sheets action
      if (nodeInfo?.type === "google_sheets_unified_action") {
        // Only show selectedRow field for update/delete actions
        if (field.name === "selectedRow" && config.action === "add") {
          return false
        }
      }
      // Special logic for Airtable create record action
      if (nodeInfo?.type === "airtable_action_create_record") {
        // Hide status field until table is selected
        if (field.name === "status" && !config.tableName) {
          return false
        }
      }
      return true
    }
    
    const dependentValue = config[field.dependsOn]
    return !!dependentValue
  }

  // Function to fetch dynamic data for dependent fields with deduplication
  const fetchDependentData = useCallback(async (field: ConfigField | NodeField, dependentValue: any) => {
    const requestKey = `${field.name}-${field.dynamic}-${dependentValue}`
    
    // Check if this exact request is already in progress
    if (fetchingDependentData.current.has(requestKey)) {
      console.log('🔍 fetchDependentData already in progress, skipping duplicate:', requestKey)
      return
    }

    // Check if we have a cached promise for this request
    if (requestCache.current.has(requestKey)) {
      console.log('📋 Returning cached promise for:', requestKey)
      return requestCache.current.get(requestKey)
    }

    console.log('🔄 fetchDependentData called:', {
      fieldName: field.name,
      dynamic: field.dynamic,
      dependsOn: field.dependsOn,
      dependentValue,
      requestKey,
      isDiscordChannelFetch: field.name === "channelId" && field.dependsOn === "guildId" && nodeInfo?.type === "discord_action_send_message"
    })
    
    if (!field.dynamic || !field.dependsOn) return

    const integration = getIntegrationByProvider(nodeInfo?.providerId || "")
    if (!integration) return

    // Mark this request as in progress
    fetchingDependentData.current.add(requestKey)

    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Create new AbortController for this request
    const controller = new AbortController()
    abortControllerRef.current = controller

    const taskId = `dependent-data-${field.name}-${dependentValue}`
    
    // Create a promise for this request and cache it
    const requestPromise = (async () => {
      try {
        setLoadingDynamicDebounced(true, taskId)
      let data
      // Special handling for Trello lists: pass boardId as param
      if (field.dynamic === "trello_lists" && field.dependsOn === "boardId") {
        data = await loadIntegrationData(
          field.dynamic as string,
          integration.id,
          { boardId: dependentValue }
        )
      } else if (field.dynamic === "trello_cards" && field.dependsOn === "boardId") {
        data = await loadIntegrationData(
          field.dynamic as string,
          integration.id,
          { boardId: dependentValue }
        )
      } else if (field.dynamic === "trello-list-templates" && field.dependsOn === "listId") {
        data = await loadIntegrationData(
          field.dynamic as string,
          integration.id,
          { listId: dependentValue }
        )
      } else if (field.dynamic === "trello-card-templates" && field.dependsOn === "listId") {
        data = await loadIntegrationData(
          field.dynamic as string,
          integration.id,
          { listId: dependentValue }
        )
      } else if (field.dynamic === "trello-card-templates" && field.dependsOn === "boardId") {
        data = await loadIntegrationData(
          field.dynamic as string,
          integration.id,
          { boardId: dependentValue }
        )
      } else if (field.dynamic === "discord_channels" && field.dependsOn === "guildId") {
        console.log('🔄 Discord channels: Starting fetch for guildId:', dependentValue)
        setLoadingDiscordChannels(true)
        try {
          data = await loadIntegrationData(
            field.dynamic as string,
            integration.id,
            { guildId: dependentValue }
          )
          console.log('🔄 Discord channels: Fetch completed, data:', data)
        } finally {
          setLoadingDiscordChannels(false)
        }
      } else if (field.dynamic === "discord_messages" && field.dependsOn === "channelId") {
        console.log('🔄 Discord messages: Starting fetch for channelId:', dependentValue)
        setLoadingDiscordMessages(true)
        try {
          data = await loadIntegrationData(
            field.dynamic as string,
            integration.id,
            { channelId: dependentValue }
          )
          console.log('🔄 Discord messages: Fetch completed, data:', data)
        } finally {
          setLoadingDiscordMessages(false)
        }
      } else if ((field.name === "authorFilter" || field.name === "filterAuthor") && field.dependsOn === "guildId") {
        console.log('🔄 Discord author filter: Starting fetch for guildId:', dependentValue)
        setLoadingDiscordMembers(true)
        try {
          data = await loadIntegrationData(
            "discord_members",
            integration.id,
            { guildId: dependentValue }
          )
          console.log('🔄 Discord author filter: Fetch completed, data:', data?.length || 0, 'members')
          
          // Also save to discord_members for reuse
          if (data && data.length > 0) {
            const mappedMembers = data.map((member: any) => ({
              value: member.value || member.id,
              label: member.label || member.name || member.username
            }))
            
            // Update both specific field and general discord_members
            setDynamicOptions(prev => ({
              ...prev,
              'discord_members': mappedMembers,
              [field.name]: mappedMembers
            }))
          }
        } finally {
          setLoadingDiscordMembers(false)
        }
      } else {
        data = await loadIntegrationData(
          field.dynamic as string,
          integration.id,
          { [field.dependsOn]: dependentValue }
        )
      }
      
      // Only update state if the request wasn't aborted
      if (!controller.signal.aborted && data) {
        console.log(`🔍 Raw data received for ${field.name} (${field.dynamic}):`, data)
        let mappedData
        
        // OneNote-specific mapping
        if (field.dynamic === "onenote_sections") {
          mappedData = data.map((section: any) => ({
            value: section.id,
            label: section.name,
            description: section.description,
          }))
        } else if (field.dynamic === "onenote_pages") {
          mappedData = data.map((page: any) => ({
            value: page.id,
            label: page.name,
            description: page.description,
          }))
        } else if (field.dynamic === "trello_lists") {
          // Trello lists specific mapping
          mappedData = data.map((list: any) => ({
            value: list.value || list.id,
            label: list.label || list.name,
            description: list.description || list.name,
          }))
        } else if (field.dynamic === "trello_cards") {
          // Trello cards specific mapping
          mappedData = data.map((card: any) => ({
            value: card.value || card.id,
            label: card.label || card.name,
            description: card.description || card.name,
          }))
        } else if (field.dynamic === "trello-card-templates") {
          // Trello card templates specific mapping
          mappedData = data.map((template: any) => ({
            value: template.value || template.id,
            label: template.name,
            description: template.description || template.originalCardName,
          }))
        } else if (field.dynamic === "discord_channels") {
          // Discord channels specific mapping
          console.log('🔄 Discord channels: Mapping data:', data)
          mappedData = data.map((channel: any) => ({
            value: channel.value || channel.id,
            label: channel.name || channel.label,
            description: channel.description,
          }))
          console.log('🔄 Discord channels: Mapped data:', mappedData)
        } else {
          // Default mapping for other integrations
          mappedData = data.map((item: any) => ({
            value: item.value || item.id || item.name,
            label: item.name || item.label || item.title,
            description: item.description,
            fields: item.fields || [],
            ...item
          }))
        }

        console.log(`🔍 Mapped data for ${field.name}:`, mappedData)
        console.log(`🔍 Field details:`, { name: field.name, dynamic: field.dynamic, dependsOn: field.dependsOn })
        
        setDynamicOptions(prev => {
          // Enhanced debugging for Discord dependent fields
          if (nodeInfo?.type === "discord_action_send_message" && field.name === "channelId") {
            console.log(`🔄 DISCORD DEPENDENT DATA MAPPED for "${field.name}":`, {
              fieldName: field.name,
              fieldDynamic: field.dynamic,
              fieldDependsOn: field.dependsOn,
              dependentValue: dependentValue,
              mappedDataCount: mappedData.length,
              mappedData: mappedData,
              previousDynamicOptions: prev
            })
          }
          
          const newOptions = {
            ...prev,
            [field.name]: mappedData
          }
          
          // Also store under the dynamic key for compatibility
          if (typeof field.dynamic === 'string') {
            newOptions[field.dynamic] = mappedData
          }
          console.log(`🔍 Updated dynamicOptions for ${field.name}:`, newOptions[field.name])
          console.log(`🔍 All dynamicOptions keys:`, Object.keys(newOptions))
          
          // Enhanced debugging for Discord
          if (nodeInfo?.type === "discord_action_send_message" && field.name === "channelId") {
            console.log(`🔄 DISCORD dynamicOptions UPDATED:`, {
              fieldName: field.name,
              fieldDynamic: field.dynamic,
              newOptionsForField: newOptions[field.name],
              newOptionsForDynamic: typeof field.dynamic === 'string' ? newOptions[field.dynamic] : undefined,
              allKeys: Object.keys(newOptions),
              fullNewOptions: newOptions,
              mappedDataCount: mappedData.length,
              mappedData: mappedData
            })
          }
          
          return newOptions
        })
      } else if (!controller.signal.aborted) {
        console.log(`⚠️ No data received for ${field.name}`)
      }
    } catch (error) {
      // Don't log errors for aborted requests
      if (!controller.signal.aborted) {
        console.error(`Error fetching dependent data for ${field.name}:`, error)
        
        // Handle authentication errors specifically
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (errorMessage.includes('authentication expired') || errorMessage.includes('401')) {
          setErrors(prev => ({
            ...prev,
            integrationError: `Your ${nodeInfo?.providerId || 'integration'} connection has expired. Please reconnect your account to continue.`
          }))
        } else if (errorMessage.includes('not found') || errorMessage.includes('not connected')) {
          setErrors(prev => ({
            ...prev,
            integrationError: `Please connect your ${nodeInfo?.providerId || 'integration'} account first to load available options. You can connect it in the integrations page.`
          }))
        } else {
          setErrors(prev => ({
            ...prev,
            integrationError: `Failed to load ${field.label || field.name} data. Please try again.`
          }))
        }
      }
      } finally {
        // Only update loading state if the request wasn't aborted
        if (!controller.signal.aborted) {
          setLoadingDynamicDebounced(false, taskId)
        }
        // Clean up tracking
        fetchingDependentData.current.delete(requestKey)
        requestCache.current.delete(requestKey)
      }
    })()

    // Cache the promise
    requestCache.current.set(requestKey, requestPromise)
    
    return requestPromise
  }, [config, nodeInfo?.providerId, getIntegrationByProvider, loadIntegrationData])

  // Automatically check Discord bot status when a server is selected
  useEffect(() => {
    if (
      nodeInfo?.type?.startsWith("discord_action_") &&
      config.guildId &&
      botStatus[config.guildId] === undefined &&
      !checkingBot
    ) {
      checkBotInGuild(config.guildId)
    }
    // Only run when guildId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.guildId])

  const fetchDynamicData = useCallback(async () => {
    // Prevent duplicate calls
    if (fetchingDynamicData.current) {
      console.log('🔍 fetchDynamicData already in progress, skipping duplicate call')
      return
    }

    console.log('🔍 fetchDynamicData called with:', { 
      nodeInfo: nodeInfo ? { type: nodeInfo.type, providerId: nodeInfo.providerId } : null,
      hasConfigSchema: !!(nodeInfo?.configSchema),
      configSchemaLength: nodeInfo?.configSchema?.length || 0
    })
    
    // Special debug for Trello
    if (nodeInfo?.type === "trello_action_create_card" || nodeInfo?.type === "trello_action_move_card") {
      console.log("🔍 TRELLO fetchDynamicData:", {
        nodeType: nodeInfo.type,
        providerId: nodeInfo.providerId,
        configSchema: nodeInfo.configSchema?.map(field => ({ 
          name: field.name, 
          dynamic: field.dynamic, 
          dependsOn: field.dependsOn 
        }))
      });
    }
    
    if (!nodeInfo || !nodeInfo.providerId) {
      fetchingDynamicData.current = false
      return
    }

    fetchingDynamicData.current = true

    const integration = getIntegrationByProvider(nodeInfo.providerId)
    console.log('🔍 Integration found:', integration ? { 
      id: integration.id, 
      provider: integration.provider, 
      status: integration.status 
    } : null)
    
    if (!integration) {
      console.warn('⚠️ No integration found for provider:', nodeInfo.providerId)
      fetchingDynamicData.current = false
      return
    }

    // Check if integration needs reconnection due to missing scopes
    const scopeCheck = checkIntegrationScopes(nodeInfo.providerId)
    if (scopeCheck.needsReconnection) {
      console.warn(`Integration needs reconnection: ${scopeCheck.reason}`)
      setErrors({ integrationError: `This integration needs to be reconnected to access the required permissions. Please reconnect your ${nodeInfo.providerId} integration.` })
      fetchingDynamicData.current = false
      return
    }

    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Create new AbortController for this request
    const controller = new AbortController()
    abortControllerRef.current = controller

    const taskId = `dynamic-data-${nodeInfo?.type || 'unknown'}`
    setLoadingDynamicDebounced(true, taskId)
    let hasData = false
    const newOptions: Record<string, any[]> = {}

    // Collect all dynamic fields (excluding dependent fields), regardless of visibility
    const dynamicFields = (nodeInfo.configSchema || []).filter(field => field.dynamic && !field.dependsOn)
    
    // Debug: Always log node info to see what we're working with
    console.log('🔍 Node info for Gmail check:', { 
      providerId: nodeInfo?.providerId, 
      type: nodeInfo?.type,
      isGmailProvider: nodeInfo?.providerId === 'gmail',
      isGmailSendEmail: nodeInfo?.type === 'gmail_action_send_email',
      conditionMet: nodeInfo?.providerId === 'gmail' && nodeInfo?.type === 'gmail_action_send_email',
      nodeInfoExists: !!nodeInfo,
      nodeInfoType: typeof nodeInfo
    })
    
    // Special handling for Gmail - preload enhanced recipients
    if (nodeInfo.providerId === 'gmail' && nodeInfo.type === 'gmail_action_send_email') {
      console.log('🔄 [CLIENT] Gmail condition met - starting preload')
    } else {
      console.log('❌ [CLIENT] Gmail condition NOT met:', { 
        providerId: nodeInfo?.providerId, 
        type: nodeInfo?.type,
        expectedProviderId: 'gmail',
        expectedType: 'gmail_action_send_email'
      })
    }
    
    // Gmail enhanced recipients will be loaded by the dedicated useEffect above
    
    // Special handling for Discord - preload members for author filter
    if (nodeInfo.providerId === 'discord' && config.guildId) {
      // Check if we need to preload discord_members for author filtering
      const hasAuthorFilterField = (nodeInfo.configSchema || []).some(
        field => field.name === 'authorFilter' || field.name === 'filterAuthor'
      )
      
      if (hasAuthorFilterField && !dynamicOptions['discord_members']) {
        console.log('🔄 Preloading Discord members for author filtering')
        // Add a task to preload discord_members
        const preloadMembersTask = async () => {
          try {
            const memberData = await loadIntegrationData('discord_members', integration.id, { guildId: config.guildId })
            if (memberData && memberData.length > 0) {
              const mappedMembers = memberData.map((member: any) => ({
                value: member.value || member.id,
                label: member.label || member.name || member.username
              }))
              setDynamicOptions(prev => ({
                ...prev,
                'discord_members': mappedMembers,
                'authorFilter': mappedMembers,
                'filterAuthor': mappedMembers
              }))
              console.log('✅ Preloaded Discord members:', mappedMembers.length)
            }
          } catch (error) {
            console.error('❌ Error preloading Discord members:', error)
          }
        }
        
        // Execute the preload task
        preloadMembersTask()
      }
    }

    // Add signature fetches for email providers
    const signatureFetches: Array<{ name: string, dynamic: string }> = []
    if (nodeInfo?.providerId === 'microsoft-outlook' && !dynamicOptions['outlook_signatures']) {
      signatureFetches.push({ name: 'outlook_signatures', dynamic: 'outlook_signatures' })
    }
    if (nodeInfo?.providerId === 'gmail' && !dynamicOptions['gmail_signatures']) {
      signatureFetches.push({ name: 'gmail_signatures', dynamic: 'gmail_signatures' })
    }

    // Check cache first and only fetch missing data
    const cachedData: Record<string, any> = {}
    const fieldsToFetch = []
    
    // Check cache for dynamic fields
    for (const field of dynamicFields) {
      const cacheKey = field.dynamic as string
      if (integrationData[cacheKey]) {
        console.log(`📋 Using cached data for ${cacheKey}`)
        cachedData[cacheKey] = { field, data: integrationData[cacheKey], error: null }
      } else {
        fieldsToFetch.push(field)
      }
    }
    
    // Check cache for signature fetches
    const signaturesNotCached = []
    for (const sig of signatureFetches) {
      if (integrationData[sig.dynamic]) {
        console.log(`📋 Using cached data for ${sig.dynamic}`)
        cachedData[sig.dynamic] = { field: { name: sig.name, dynamic: sig.dynamic }, data: integrationData[sig.dynamic], error: null }
      } else {
        signaturesNotCached.push(sig)
      }
    }

    // Log performance improvement
    const totalFields = dynamicFields.length + signatureFetches.length
    const cachedFields = Object.keys(cachedData).length
    const fieldsToFetchCount = fieldsToFetch.length + signaturesNotCached.length
    
    if (totalFields > 0) {
      console.log(`⚡ Performance optimization: Using ${cachedFields}/${totalFields} cached fields, fetching only ${fieldsToFetchCount} new fields`)
    }

    // Build fetch promises only for missing data
    console.log('🔍 Building fetch promises for:', {
      fieldsToFetch: fieldsToFetch.map(f => ({ name: f.name, dynamic: f.dynamic })),
      signaturesNotCached: signaturesNotCached.map(s => ({ name: s.name, dynamic: s.dynamic }))
    })
    
    // Optimize: If we have cached data, show it immediately while fetching new data
    if (Object.keys(cachedData).length > 0) {
      console.log('⚡ Fast-loading cached data while fetching fresh data')
      // Process cached data immediately for faster UX
      const cachedResults = Object.values(cachedData)
      for (const result of cachedResults) {
        const { field, data } = result
        if (data) {
          let processedData: any[] = []
          
          // Process Discord guilds data
          if (field.dynamic === "discord_guilds") {
            processedData = data.map((guild: any) => ({ value: guild.id, label: guild.name }))
          } else if (field.dynamic === "discord_channels") {
            processedData = data.map((channel: any) => ({ value: channel.id, label: channel.name }))
          } else {
            processedData = data.map((item: any) => ({ value: item.value || item.id || item.name, label: item.name || item.label || item.title }))
          }
          
          // Update options immediately with cached data
          setDynamicOptions(prev => ({
            ...prev,
            [field.name]: processedData,
            ...(typeof field.dynamic === 'string' && { [field.dynamic]: processedData })
          }))
        }
      }
    }
    
    const fetchPromises = [
      ...fieldsToFetch.map(field => {
        console.log(`🔍 Fetching data for field: ${field.name} (${field.dynamic})`)
        return loadIntegrationData(field.dynamic as string, integration.id)
          .then(data => {
            console.log(`✅ Successfully loaded data for ${field.dynamic}:`, data ? data.length : 0, 'items')
            return { field, data, error: null }
          })
          .catch(error => {
            console.error(`❌ Failed to load data for ${field.dynamic}:`, error)
            return { field, data: null, error }
          })
      }),
      ...signaturesNotCached.map(sig => {
        console.log(`🔍 Fetching signature data for: ${sig.dynamic}`)
        return loadIntegrationData(sig.dynamic, integration.id)
          .then(data => ({ field: { name: sig.name, dynamic: sig.dynamic }, data, error: null }))
          .catch(error => ({ field: { name: sig.name, dynamic: sig.dynamic }, data: null, error }))
      })
    ]

    const fetchedResults = await Promise.all(fetchPromises)
    
    // Combine cached and fetched results
    const allResults = [...Object.values(cachedData), ...fetchedResults]

    // Only update state if the request wasn't aborted
    if (!controller.signal.aborted) {
      for (const result of allResults) {
        const { field, data, error } = result
        if (error) {
          // Only log errors for non-signature fields
          if (field.name !== 'outlook_signatures' && field.name !== 'gmail_signatures') {
            console.error(`❌ Error loading dynamic data for ${field.dynamic}:`, error)
            const errorMessage = error instanceof Error ? error.message : String(error)
            const label = (field as any).label || field.name
            if (errorMessage.includes('Teams integration not connected')) {
              setErrors(prev => ({
                ...prev,
                integrationError: `Teams integration not connected. Please connect your Teams account in the Integrations page.`
              }))
              break
            } else if (errorMessage.includes('authentication expired') || errorMessage.includes('401')) {
              setErrors(prev => ({
                ...prev,
                integrationError: `Your ${nodeInfo?.providerId || 'integration'} connection has expired. Please reconnect your account to continue.`
              }))
              break
            } else if (errorMessage.includes('Teams access denied') || (errorMessage.includes('403') && errorMessage.includes('Teams'))) {
              setErrors(prev => ({
                ...prev,
                integrationError: `Teams access denied. This may be due to missing permissions. Please reconnect your Teams account to grant the necessary access.`
              }))
              break
            } else if (errorMessage.includes('trello integration not found') || errorMessage.includes('trello integration not connected')) {
              setErrors(prev => ({
                ...prev,
                integrationError: `Please connect your Trello account first to load available boards. You can connect it in the integrations page.`
              }))
              break
            } else if (errorMessage.includes('not found') || errorMessage.includes('not connected') || errorMessage.includes('404')) {
              setErrors(prev => ({
                ...prev,
                integrationError: `Please connect your ${nodeInfo?.providerId || 'integration'} account first to load available options. You can connect it in the integrations page.`
              }))
              break
            } else if (errorMessage.includes('{}') || errorMessage.includes('empty response')) {
              setErrors(prev => ({
                ...prev,
                integrationError: `Unable to load ${label} data. Please check if your ${nodeInfo?.providerId || 'integration'} account is connected and try again.`
              }))
            } else {
              setErrors(prev => ({
                ...prev,
                integrationError: `Failed to load ${label} data. Please try again.`
              }))
            }
          }
          continue
        }
                  if (data) {
            hasData = true
            // Process the data based on dynamic type
            let processedData: any[] = []
            
            if (field.dynamic === "slack-channels") {
              processedData = data.map((channel: any) => ({ value: channel.id, label: channel.name }))
            } else if (field.dynamic === "google-calendars") {
              processedData = data.map((calendar: any) => ({ value: calendar.id, label: calendar.name }))
            } else if (field.dynamic === "google-drives") {
              processedData = data.map((drive: any) => ({ value: drive.id, label: drive.name }))
            } else if (field.dynamic === "gmail-labels") {
              processedData = data.map((label: any) => ({ value: label.id, label: label.name, isExisting: true }))
            } else if (field.dynamic === "gmail-recent-recipients") {
              processedData = data.map((recipient: any) => ({
                value: recipient.email || recipient.value,
                label: recipient.label || (recipient.name ? recipient.name + " <" + recipient.email + ">" : recipient.email),
                email: recipient.email || recipient.value,
                name: recipient.name,
                type: recipient.type || "contact"
              }))
            } else if (field.dynamic === "gmail-enhanced-recipients") {
              if (Array.isArray(data) && data.length > 0) {
                processedData = data.map((recipient: any) => ({
                  value: recipient.email || recipient.value,
                  label: recipient.label || (recipient.name ? recipient.name + " <" + recipient.email + ">" : recipient.email),
                  email: recipient.email || recipient.value,
                  name: recipient.name,
                  type: recipient.type,
                  isGroup: recipient.isGroup,
                  groupId: recipient.groupId,
                  members: recipient.members
                }))
              } else {
                processedData = []
              }
            } else if (field.dynamic === "spreadsheets") {
              processedData = data.map((spreadsheet: any) => ({ value: spreadsheet.id, label: spreadsheet.properties.title, url: spreadsheet.url }))
            } else if (field.dynamic === "airtable_tables") {
              processedData = data.map((table: any) => ({ value: table.value, label: table.label, description: table.description, fields: table.fields || [] }))
            } else if (field.dynamic === "airtable_bases") {
              processedData = data.map((base: any) => ({ value: base.value, label: base.label, description: base.description }))
            } else if (field.dynamic === "airtable_records") {
              processedData = data.map((record: any) => ({ value: record.value, label: record.label, description: record.description, fields: record.fields || {} }))
            } else if (field.dynamic === "airtable_project_records") {
              processedData = data.map((record: any) => ({ value: record.value, label: record.label, description: record.description, fields: record.fields || {} }))
            } else if (field.dynamic === "airtable_task_records") {
              processedData = data.map((record: any) => ({ value: record.value, label: record.label, description: record.description, fields: record.fields || {} }))
            } else if (field.dynamic === "airtable_feedback_records") {
              processedData = data.map((record: any) => ({ value: record.value, label: record.label, description: record.description, fields: record.fields || {} }))
            } else if (field.dynamic === "trello-boards") {
              processedData = data.map((board: any) => ({ value: board.id, label: board.name }))
            } else if (field.dynamic === "trello_lists") {
              processedData = data.map((list: any) => ({ value: list.value || list.id, label: list.label || list.name, description: list.description }))
            } else if (field.dynamic === "trello-card-templates") {
              processedData = data.map((template: any) => ({ value: template.value || template.id, label: template.name, description: template.description }))
            } else if (field.dynamic === "notion-databases") {
              processedData = data.map((database: any) => ({ value: database.id, label: database.title[0]?.plain_text || "Untitled Database" }))
            } else if (field.dynamic === "youtube-channels") {
              processedData = data.map((channel: any) => ({ value: channel.id, label: channel.snippet.title }))
            } else if (field.dynamic === "github-repos") {
              processedData = data.map((repo: any) => ({ value: repo.full_name, label: repo.name }))
            } else if (field.dynamic === "discord_guilds") {
              processedData = data.map((guild: any) => ({ value: guild.id, label: guild.name }))
            } else if (field.dynamic === "discord_channels") {
              processedData = data.map((channel: any) => ({ value: channel.id, label: channel.name }))
            } else if (field.dynamic === "facebook_pages") {
              processedData = data.map((page: any) => ({ value: page.id, label: page.name }))
            } else if (field.dynamic === "onenote_notebooks") {
              processedData = data.map((notebook: any) => ({ value: notebook.id, label: notebook.name, description: notebook.is_default ? "Default notebook" : undefined }))
            } else if (field.dynamic === "onenote_sections") {
              processedData = data.map((section: any) => ({ value: section.id, label: section.name }))
            } else if (field.dynamic === "onenote_pages") {
              processedData = data.map((page: any) => ({ value: page.id, label: page.name }))
            } else if (field.dynamic === "outlook_folders") {
              processedData = data.map((folder: any) => ({ value: folder.id, label: folder.name, description: folder.unreadItemCount ? `${folder.unreadItemCount} unread` : undefined }))
            } else if (field.dynamic === "outlook_messages") {
              processedData = data.map((message: any) => ({ value: message.id, label: message.name, description: `${message.fromName} (${message.from})`, email: message.from, fromName: message.fromName, receivedDateTime: message.receivedDateTime, isRead: message.isRead, hasAttachments: message.hasAttachments }))
            } else if (field.dynamic === "outlook_contacts") {
              processedData = data.map((contact: any) => ({ value: contact.id, label: contact.name, description: contact.email ? contact.email : contact.company ? contact.company : undefined, email: contact.email, businessPhone: contact.businessPhone, mobilePhone: contact.mobilePhone, company: contact.company, jobTitle: contact.jobTitle }))
            } else if (field.dynamic === "outlook-enhanced-recipients") {
              processedData = data.map((recipient: any) => ({ value: recipient.value, label: recipient.label, description: recipient.description, type: recipient.type }))
            } else if (field.dynamic === "outlook_calendars") {
              processedData = data.map((calendar: any) => ({ value: calendar.id, label: calendar.name, description: calendar.isDefaultCalendar ? "Default calendar" : undefined }))
            } else if (field.dynamic === "outlook_events") {
              processedData = data.map((event: any) => ({ value: event.id, label: event.name, description: event.start ? new Date(event.start).toLocaleString() : undefined, start: event.start, end: event.end, isAllDay: event.isAllDay, location: event.location, attendees: event.attendees }))
            } else if (field.dynamic === "teams_channels") {
              processedData = data.map((channel: any) => ({ value: channel.value, label: channel.label }))
            } else if (field.dynamic === "teams_teams") {
              processedData = data.map((team: any) => ({ value: team.value, label: team.label }))
            } else if (field.dynamic === "teams_chats") {
              processedData = data.map((chat: any) => ({ value: chat.value, label: chat.label }))
            } else if (field.dynamic === "youtube_videos") {
              processedData = data.map((video: any) => ({ 
                value: video.value || video.id, 
                label: video.name || video.title,
                description: video.description,
                publishedAt: video.publishedAt,
                thumbnail: video.thumbnail
              }))
            } else if (field.name === 'outlook_signatures' || field.name === 'gmail_signatures') {
              processedData = data
            } else {
              processedData = data.map((item: any) => ({ value: item.value || item.id || item.name, label: item.name || item.label || item.title }))
            }
            
            // Store data under both field name and dynamic key for compatibility
            newOptions[field.name] = processedData
            if (typeof field.dynamic === 'string') {
              newOptions[field.dynamic] = processedData
            }
            
            // For Trello, also store under the dynamic key to ensure compatibility
            if ((nodeInfo?.type === "trello_action_create_card" || nodeInfo?.type === "trello_action_move_card") && typeof field.dynamic === 'string') {
              newOptions[field.dynamic] = processedData
              console.log(`🎯 TRELLO: Stored data under both "${field.name}" and "${field.dynamic}"`)
            }
            
            // Enhanced debugging for Trello initial data
            if (nodeInfo?.type === "trello_action_create_card" || nodeInfo?.type === "trello_action_move_card") {
              console.log(`🎯 TRELLO INITIAL DATA STORED for "${field.name}":`, {
                fieldName: field.name,
                fieldDynamic: field.dynamic,
                processedDataCount: processedData.length,
                processedData: processedData,
                storedUnderFieldName: newOptions[field.name],
                storedUnderDynamicKey: typeof field.dynamic === 'string' ? newOptions[field.dynamic] : undefined
              })
            }
          }
      }
      if (hasData) {
        console.log('💾 Updating dynamic options:', {
          optionKeys: Object.keys(newOptions),
          sampleData: Object.entries(newOptions).map(([key, value]) => ({
            field: key,
            count: value.length,
            sample: value[0]
          })),
          fullNewOptions: newOptions
        })
        
        // Enhanced debugging for Trello state update
        if (nodeInfo?.type === "trello_action_create_card" || nodeInfo?.type === "trello_action_move_card") {
          console.log(`🎯 TRELLO STATE UPDATE:`, {
            currentDynamicOptions: dynamicOptions,
            newOptions: newOptions,
            willUpdateWith: Object.keys(newOptions),
            updateTimestamp: new Date().toISOString()
          })
        }
        
        setDynamicOptions(newOptions)
      }
      setLoadingDynamicDebounced(false, taskId)
    }
    
    // Reset the flag when function completes
    fetchingDynamicData.current = false
  }, [nodeInfo, getIntegrationByProvider, checkIntegrationScopes, loadIntegrationData, integrationData, setLoadingDynamicDebounced])

  const lastFetchedRef = useRef<{ nodeId?: string; providerId?: string }>({})

  // Preload all dependent fields data
  const preloadAllDependentFields = useCallback(async () => {
    if (!nodeInfo?.configSchema || !isOpen) return
    
    console.log('🔄 Preloading all dependent field data')
    
    // Get all fields with dependencies
    const fieldsWithDependencies = nodeInfo.configSchema.filter(field => field.dependsOn)
    
    // Group fields by their dependency
    const fieldsByDependency: Record<string, ConfigField[]> = {}
    fieldsWithDependencies.forEach(field => {
      const dependsOn = field.dependsOn as string
      if (!fieldsByDependency[dependsOn]) {
        fieldsByDependency[dependsOn] = []
      }
      fieldsByDependency[dependsOn].push(field as ConfigField)
    })
    
    // For each dependency that has a value in config, load all dependent fields
    Object.entries(fieldsByDependency).forEach(([dependsOn, fields]) => {
      const dependentValue = config[dependsOn]
      if (dependentValue) {
        console.log(`🔄 Found value for dependency ${dependsOn}: ${dependentValue}, preloading ${fields.length} dependent fields`)
        fields.forEach(field => {
          // Only preload if the field has dynamic options
          if (field.dynamic) {
            console.log(`🔄 Preloading data for field ${field.name} with dependency on ${dependsOn}`)
            fetchDependentData(field, dependentValue)
          }
        })
      }
    })
  }, [nodeInfo?.configSchema, isOpen, config, fetchDependentData])

  useEffect(() => {
    // Only fetch if modal is open and nodeInfo is present
    if (isOpen && nodeInfo?.providerId) {
      // Only fetch if nodeId or providerId changed
      if (
        lastFetchedRef.current.nodeId !== currentNodeId ||
        lastFetchedRef.current.providerId !== nodeInfo.providerId
      ) {
        fetchDynamicData()
        lastFetchedRef.current = {
          nodeId: currentNodeId,
          providerId: nodeInfo.providerId,
        }
        
        // After a short delay, preload all dependent fields
        setTimeout(() => {
          preloadAllDependentFields()
        }, 500)
      }
    } else if (!isOpen) {
      // Reset all flags and clear cache when modal closes
      fetchingDynamicData.current = false
      fetchingDependentData.current.clear()
      requestCache.current.clear()
      hasHandledInitialDiscordGuild.current = false
      lastFetchedRef.current = {}
    }
  }, [isOpen, currentNodeId, nodeInfo?.providerId, fetchDynamicData, preloadAllDependentFields])

  // Initialize Discord bot when Discord nodes are opened
  useEffect(() => {
    if (isOpen && nodeInfo?.type && nodeInfo.type.startsWith("discord_")) {
      const initializeDiscordBot = async () => {
        try {
          console.log('🤖 Initializing Discord bot for Discord node:', nodeInfo.type)
          const response = await fetch('/api/discord/initialize-presence', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            }
          })
          
          if (response.ok) {
            const data = await response.json()
            console.log('✅ Discord bot initialized successfully:', data.status)
          } else {
            console.log('⚠️ Discord bot not configured or initialization failed')
          }
        } catch (error) {
          console.log('⚠️ Discord bot initialization error:', error)
        }
      }
      
      initializeDiscordBot()
    }
  }, [isOpen, nodeInfo?.type])

  // Eager loading optimization: Start fetching Discord data as soon as modal opens
  useEffect(() => {
    if (isOpen && nodeInfo?.type === "discord_action_send_message") {
      const integration = getIntegrationByProvider("discord")
      if (integration && !integrationData["discord_guilds"] && !fetchingDynamicData.current) {
        console.log('🚀 Eager loading Discord guilds for faster UX')
        
        // Track this loading task
        const taskId = "eager_discord_guilds_load"
        activeLoadingTasksRef.current.add(taskId)
        setLoadingDynamic(true)
        
        // Pre-load Discord guilds immediately without waiting for form render
        loadIntegrationData("discord_guilds", integration.id)
          .then(data => {
            if (data) {
              console.log('✅ Pre-loaded Discord guilds:', data.length, 'guilds')
              
              // Update dynamic options with the guilds
              if (data.length > 0) {
                const mappedGuilds = data.map((guild: any) => ({
                  value: guild.value || guild.id,
                  label: guild.label || guild.name
                }))
                setDynamicOptions(prev => ({
                  ...prev,
                  "guildId": mappedGuilds
                }))
              }
            }
          })
          .catch(error => {
            console.warn('⚠️ Pre-loading Discord guilds failed:', error)
          })
          .finally(() => {
            // Remove this task from active tasks
            activeLoadingTasksRef.current.delete(taskId)
            
            // If no more active tasks, clear loading state
            if (activeLoadingTasksRef.current.size === 0) {
              setLoadingDynamic(false)
              setHasShownLoading(false)
              loadingStateRef.current = false
            }
          })
      }
    }
  }, [isOpen, nodeInfo?.type])

  // Handle Discord actions that already have a guild selected when modal opens
  // Only run this when the modal first opens, not when the guild changes
  const hasHandledInitialDiscordGuild = useRef(false)
  
  useEffect(() => {
    if (isOpen && nodeInfo?.type === "discord_action_send_message" && config.guildId && !hasHandledInitialDiscordGuild.current) {
      console.log('🔄 Discord action with existing guild selected on modal open:', config.guildId)
      hasHandledInitialDiscordGuild.current = true
      
      // Just check bot status - channels will be handled by fetchDependentFields useEffect
      checkBotInGuild(config.guildId)
    }
  }, [isOpen, nodeInfo?.type, config.guildId])

  // Load dependent data when modal opens with existing configuration
  useEffect(() => {
    if (!isOpen || !nodeInfo) return

    // Load dependent data for Discord message actions
    if (nodeInfo && (nodeInfo.type === "discord_action_edit_message" || nodeInfo.type === "discord_action_delete_message" || nodeInfo.type === "discord_action_send_message" || nodeInfo.type === "discord_action_fetch_messages" || nodeInfo.type === "discord_action_add_reaction" || nodeInfo.type === "discord_action_remove_reaction" || nodeInfo.type === "discord_action_fetch_reactions" || nodeInfo.type === "discord_action_update_channel" || nodeInfo.type === "discord_action_delete_channel")) {
      const loadDependentData = async () => {
        console.log('🔄 Loading dependent data for Discord message action with config:', config)
        
        const integration = getIntegrationByProvider("discord")
        if (!integration) return

        // Create unique task IDs for tracking
        const guildsTaskId = "load_discord_guilds"
        const channelsTaskId = "load_discord_channels"
        const messagesTaskId = "load_discord_messages"

        // Always load guilds first when modal opens (even if no guild is selected)
        if (!dynamicOptions.guildId || dynamicOptions.guildId.length === 0) {
          console.log('🔄 Loading guilds for initial dropdown population')
          
          // Track this loading task
          activeLoadingTasksRef.current.add(guildsTaskId)
          setLoadingDynamic(true)
          
          try {
            const guildData = await loadIntegrationData("discord_guilds", integration.id)
            if (guildData && guildData.length > 0) {
              const mappedGuilds = guildData.map((guild: any) => ({
                value: guild.value || guild.id,
                label: guild.label || guild.name
              }))
              setDynamicOptions(prev => ({
                ...prev,
                "guildId": mappedGuilds
              }))
              console.log('✅ Loaded guilds:', mappedGuilds.length)
            }
          } catch (error) {
            console.error('❌ Error loading guilds:', error)
          } finally {
            // Remove this task
            activeLoadingTasksRef.current.delete(guildsTaskId)
            
            // If no more active tasks, clear loading state
            if (activeLoadingTasksRef.current.size === 0) {
              setLoadingDynamic(false)
              setHasShownLoading(false)
              loadingStateRef.current = false
            }
          }
        }
        
        // If guildId is set, load channels
        if (config.guildId) {
          console.log('🔄 Loading channels for guildId:', config.guildId)
          
          // Track this loading task
          activeLoadingTasksRef.current.add(channelsTaskId)
          setLoadingDynamic(true)
          setLoadingDiscordChannels(true)
          
          try {
            const channelData = await loadIntegrationData("discord_channels", integration.id, { guildId: config.guildId })
            if (channelData && channelData.length > 0) {
              const mappedChannels = channelData.map((channel: any) => ({
                value: channel.value || channel.id,
                label: channel.label || channel.name
              }))
              setDynamicOptions(prev => ({
                ...prev,
                "channelId": mappedChannels,
                // Store all channels for reference
                "allDiscordChannels": mappedChannels
              }))
              console.log('✅ Loaded channels:', mappedChannels.length)
            }
          } catch (error) {
            console.error('❌ Error loading channels:', error)
          } finally {
            // Remove this task
            activeLoadingTasksRef.current.delete(channelsTaskId)
            setLoadingDiscordChannels(false)
            
            // If no more active tasks, clear loading state
            if (activeLoadingTasksRef.current.size === 0) {
              setLoadingDynamic(false)
              setHasShownLoading(false)
              loadingStateRef.current = false
            }
          }
        }

        // If channelId is set, load messages
        if (config.channelId) {
          console.log('🔄 Loading messages for channelId:', config.channelId)
          
          // Track this loading task
          activeLoadingTasksRef.current.add(messagesTaskId)
          setLoadingDynamic(true)
          setLoadingDiscordMessages(true)
          
          try {
            const messageData = await loadIntegrationData("discord_messages", integration.id, { channelId: config.channelId })
            if (messageData && messageData.length > 0) {
              const mappedMessages = messageData.map((message: any) => ({
                value: message.value || message.id,
                label: message.label || message.content || message.name
              }))
              setDynamicOptions(prev => ({
                ...prev,
                "messageId": mappedMessages
              }))
              console.log('✅ Loaded messages:', mappedMessages.length)
            }
          } catch (error) {
            console.error('❌ Error loading messages:', error)
          } finally {
            // Remove this task
            activeLoadingTasksRef.current.delete(messagesTaskId)
            setLoadingDiscordMessages(false)
            
            // If no more active tasks, clear loading state
            if (activeLoadingTasksRef.current.size === 0) {
              setLoadingDynamic(false)
              setHasShownLoading(false)
              loadingStateRef.current = false
            }
          }
        }
      }

      // Add a small delay to ensure the modal is fully opened and config is set before loading data
      const timer = setTimeout(() => {
        loadDependentData()
      }, 200) // Increased delay to ensure config is properly set

      return () => clearTimeout(timer)
    }
  }, [isOpen, nodeInfo, config.guildId, config.channelId]) // Only depend on specific config values, not entire config object

  // Debug dynamicOptions state changes
  useEffect(() => {
    if (nodeInfo?.type === "trello_action_create_card" || nodeInfo?.type === "trello_action_move_card") {
      console.log(`🎯 TRELLO DYNAMIC OPTIONS CHANGED:`, {
        dynamicOptionsKeys: Object.keys(dynamicOptions),
        dynamicOptions: dynamicOptions,
        boardIdData: dynamicOptions.boardId,
        trelloBoardsData: dynamicOptions['trello-boards'],
        changeTimestamp: new Date().toISOString()
      })
    }
  }, [dynamicOptions, nodeInfo?.type])
  
  // Fetch message data and reactions when messageId changes for Discord add/remove reaction
  useEffect(() => {
    if ((nodeInfo?.type === "discord_action_add_reaction" || nodeInfo?.type === "discord_action_remove_reaction") && config.messageId && config.channelId) {
      fetchMessageDataAndReactions(config.messageId, config.channelId);
    }
  }, [nodeInfo?.type, config.messageId, config.channelId, fetchMessageDataAndReactions]);

  // Debug config state changes for Trello
  useEffect(() => {
    if (nodeInfo?.type === "trello_action_create_card" || nodeInfo?.type === "trello_action_move_card") {
      console.log(`🎯 TRELLO CONFIG CHANGED:`, {
        config: config,
        boardId: config.boardId,
        changeTimestamp: new Date().toISOString()
      })
      

    }
  }, [config, nodeInfo?.type, dynamicOptions])

  // Handle dependent field updates when their dependencies change
  useEffect(() => {
    return // DISABLED to fix infinite loop - dependent fields now handled in handleSelectChange
  }, [isOpen, nodeInfo, botStatus])

  // Auto-fetch table fields when table is selected (for Airtable)
  useEffect(() => {
    if (!isOpen || !nodeInfo || nodeInfo.type !== "airtable_action_create_record") return
    

    
    if (config.tableName && config.baseId) {

      fetchTableFields(config.tableName)
      
      // Also ensure project/task/feedback records are loaded for this base
      const integration = getIntegrationByProvider(nodeInfo.providerId || "")
      if (integration) {
        // Load project, task, and feedback records if not already loaded
        const loadPriorityRecords = async () => {
          try {
            if (!dynamicOptions["project_records"] || dynamicOptions["project_records"].length === 0) {
              const projectData = await loadIntegrationData("airtable_project_records", integration.id, { baseId: config.baseId })
              if (projectData && projectData.length > 0) {
                setDynamicOptions(prev => ({
                  ...prev,
                  "project_records": projectData
                }))
              }
            }
            
            if (!dynamicOptions["task_records"] || dynamicOptions["task_records"].length === 0) {
              const taskData = await loadIntegrationData("airtable_task_records", integration.id, { baseId: config.baseId })
              if (taskData && taskData.length > 0) {
                setDynamicOptions(prev => ({
                  ...prev,
                  "task_records": taskData
                }))
              }
            }
            
            if (!dynamicOptions["feedback_records"] || dynamicOptions["feedback_records"].length === 0) {
              const feedbackData = await loadIntegrationData("airtable_feedback_records", integration.id, { baseId: config.baseId })
              if (feedbackData && feedbackData.length > 0) {
                setDynamicOptions(prev => ({
                  ...prev,
                  "feedback_records": feedbackData
                }))
              }
            }
          } catch (error) {
            console.error("Error loading priority records:", error)
          }
        }
        
        loadPriorityRecords()
      }
    }
  }, [isOpen, nodeInfo, config.tableName, config.baseId, fetchTableFields, getIntegrationByProvider, loadIntegrationData, dynamicOptions])

  // Retry mechanism for stuck loading states - only retry after 10 seconds and max 2 retries
  useEffect(() => {
    if (!loadingDynamic) {
      setRetryCount(0)
      return
    }
    
    // Only retry if we've been loading for more than 10 seconds and haven't exceeded max retries
    const retryTimeout = setTimeout(() => {
      if (loadingDynamic && isOpen && nodeInfo?.providerId && retryCount < 2) {
        console.log(`🔄 Retrying dynamic data fetch (attempt ${retryCount + 1}/2)`)
        setRetryCount((c) => c + 1)
        fetchDynamicData()
      }
    }, 10000) // Increased from 5 to 10 seconds
    
    return () => clearTimeout(retryTimeout)
  }, [loadingDynamic, isOpen, nodeInfo?.providerId, fetchDynamicData, retryCount])

  // Emergency fallback to clear stuck loading state for Discord actions
  useEffect(() => {
    if (nodeInfo?.type === "discord_action_send_message" && loadingDynamic) {
      const emergencyTimeout = setTimeout(() => {
        if (loadingDynamic) {
          console.log('🚨 Emergency clearing stuck loading state for Discord action')
          setLoadingDynamic(false)
          setHasShownLoading(false)
          activeLoadingTasksRef.current.clear()
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current)
            loadingTimeoutRef.current = null
          }
          loadingStateRef.current = false
          loadingStartTimeRef.current = null
        }
      }, 15000) // 15 seconds emergency timeout
      
      return () => clearTimeout(emergencyTimeout)
    }
  }, [nodeInfo?.type, loadingDynamic])

  // Auto-load sheet data when spreadsheet and sheet are selected
  useEffect(() => {
    if (!isOpen || !nodeInfo) return

    // For unified action, only load after action is selected (any action)
    if (nodeInfo.type === "google_sheets_unified_action") {
      if (!config.action) return
      if (!config.spreadsheetId || !config.sheetName) return
    } else if (nodeInfo.type === "google_sheets_action_read_data") {
      // For read data action, load after readMode is selected
      if (!config.readMode) return
      if (!config.spreadsheetId || !config.sheetName) return
    } else if (nodeInfo.providerId === "google-sheets") {
      // For all other Google Sheets actions, load as soon as spreadsheet and sheet are selected
      if (!config.spreadsheetId || !config.sheetName) return
    } else {
      return
    }

    const loadSheetData = async () => {
      // Abort any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      const controller = new AbortController()
      abortControllerRef.current = controller
      
      const taskId = `sheet-data-${config.spreadsheetId}-${config.sheetName}`
      
      try {
        setLoadingDynamicDebounced(true, taskId)
        const integration = getIntegrationByProvider(nodeInfo?.providerId || "")
        if (!integration) return
        const data = await loadIntegrationData(
          "google-sheets_sheet-data",
          integration.id,
          { spreadsheetId: config.spreadsheetId, sheetName: config.sheetName }
        )
        if (!controller.signal.aborted && data && data.length > 0) {
          setSheetData(data[0])
          setDynamicOptions(prev => ({
            ...prev,
            sheetData: data[0]
          }))
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Error auto-loading sheet data:", error)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingDynamicDebounced(false, taskId)
        }
      }
    }
    loadSheetData()
  }, [isOpen, nodeInfo, config.action, config.readMode, config.spreadsheetId, config.sheetName, getIntegrationByProvider, loadIntegrationData])

  // Fetch sheet preview when both spreadsheet and sheet are selected (for Google Sheets actions)
  useEffect(() => {
    if (!isOpen || !nodeInfo || !["google_sheets_action_append_row", "google_sheets_unified_action", "google_sheets_action_read_data"].includes(nodeInfo.type)) return
    
    const fetchSheetPreview = async () => {
      if (config.spreadsheetId && config.sheetName) {
        const integration = getIntegrationByProvider("google-sheets")
        if (!integration) return

        // Abort any existing request
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
        }

        // Create new AbortController for this request
        const controller = new AbortController()
        abortControllerRef.current = controller

        const taskId = `sheet-data-${config.spreadsheetId}-${config.sheetName}`
        
        try {
          setLoadingDynamicDebounced(true, taskId)
          const previewData = await loadIntegrationData(
            "google-sheets_sheet-preview",
            integration.id,
            { spreadsheetId: config.spreadsheetId, sheetName: config.sheetName }
          )
          
          // Only update state if the request wasn't aborted
          if (!controller.signal.aborted && previewData && previewData.length > 0) {
            const preview = previewData[0]
            setSheetPreview(preview)
            setDynamicOptions(prev => ({
              ...prev,
              sheetPreview: preview,
              // Also populate search column options for the unified action
              ...(nodeInfo.type === "google_sheets_unified_action" && {
                searchColumn: preview.headers.map((header: any) => ({
                  value: header.column,
                  label: `${header.column} - ${header.name}`
                }))
              })
            }))
          }
        } catch (error) {
          // Don't log errors for aborted requests
          if (!controller.signal.aborted) {
            console.error("Error fetching sheet preview:", error)
          }
        } finally {
          // Only update loading state if the request wasn't aborted
          if (!controller.signal.aborted) {
            setLoadingDynamicDebounced(false, taskId)
          }
        }
      } else {
        // Clear preview when dependencies are not met
        setSheetPreview(null)
        setDynamicOptions(prev => {
          const newOptions = { ...prev }
          delete newOptions.sheetPreview
          return newOptions
        })
      }
    }

    fetchSheetPreview()
  }, [isOpen, nodeInfo, config.spreadsheetId, config.sheetName, getIntegrationByProvider, loadIntegrationData])

  // Enhanced workflow segment testing
  const handleTestWorkflowSegment = async () => {
    if (!nodeInfo?.testable || !workflowData || !currentNodeId) {
      console.warn('Test requirements not met:', { 
        testable: nodeInfo?.testable, 
        hasWorkflowData: !!workflowData, 
        currentNodeId 
      })
      return
    }
    
    // Prevent testing pending nodes
    if (currentNodeId.startsWith('pending-')) {
      console.warn('Cannot test pending node:', currentNodeId)
      return
    }
    
    // Validate that the target node exists in the workflow
    if (!workflowData.nodes?.find(n => n.id === currentNodeId)) {
      console.error('Target node not found in workflow:', currentNodeId)
      setSegmentTestResult({
        success: false,
        error: `Target node "${currentNodeId}" not found in workflow`
      })
      setShowDataFlowPanels(true)
      return
    }
    
    console.log('Starting workflow segment test:', { 
      workflowData, 
      targetNodeId: currentNodeId,
      nodeType: nodeInfo.type,
      availableNodeIds: workflowData.nodes?.map(n => n.id) || []
    })
    
    setIsSegmentTestLoading(true)
    setSegmentTestResult(null)
    
    try {
      const response = await fetch('/api/workflows/test-workflow-segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowData,
          targetNodeId: currentNodeId,
          triggerData: {
            // Sample trigger data
            name: "John Doe",
            email: "john@example.com",
            status: "active",
            amount: 100,
            date: new Date().toISOString(),
            id: "test-123"
          }
        })
      })
      
      const result = await response.json()
      console.log('Test response:', result)
      
      if (result.success) {
        setSegmentTestResult(result)
        setShowDataFlowPanels(true)
        
        // Store test results globally
        setTestResults(
          result.executionResults,
          result.executionPath,
          result.dataFlow.triggerOutput,
          currentNodeId
        )
      } else {
        console.error('Test failed with error:', result.error)
        setSegmentTestResult({
          success: false,
          error: result.error || "Test failed"
        })
        setShowDataFlowPanels(true)
      }
    } catch (error: any) {
      console.error('Test request failed:', error)
      setSegmentTestResult({
        success: false,
        error: `Test failed with error: "${error.message}"`
      })
      setShowDataFlowPanels(true)
    } finally {
      setIsSegmentTestLoading(false)
    }
  }

  const validateRequiredFields = (): boolean => {
    const newErrors: Record<string, string> = {}
    let isValid = true
    
    nodeInfo?.configSchema?.forEach(field => {
      if (field.required && !config[field.name]) {
        newErrors[field.name] = `${field.label} is required`
        isValid = false
      }
    })
    
    setErrors(newErrors)
    return isValid
  }

  const handleSave = () => {
    if (validateRequiredFields()) {
      // Include attachments in the saved configuration
      const configWithAttachments = {
        ...config,
        attachments
      }
      
      // Save configuration to persistent storage if we have a valid node ID
      if (currentNodeId && currentNodeId !== 'pending-action' && currentNodeId !== 'pending-trigger' && nodeInfo?.type) {
        const workflowId = getWorkflowId()
        if (workflowId) {
          console.log('📋 Saving configuration for node:', currentNodeId)
          // Save both config and dynamicOptions
          saveNodeConfig(workflowId, currentNodeId, nodeInfo.type, configWithAttachments, dynamicOptions)
        }
      }
      
      onSave(configWithAttachments)
      onClose(true) // Pass true to indicate the configuration was saved
    }
  }

  const renderField = (field: ConfigField | NodeField) => {
    // Hide all fields except guildId if bot is not in the server for Discord actions
    if (
      nodeInfo?.type?.startsWith("discord_action_") &&
      field.name !== "guildId" &&
      config.guildId &&
      botStatus[config.guildId] === false
    ) {
      return null;
    }
    
    // Declare these once at the top for all cases
    const value = config[field.name] || (field.type === "multi-select" ? [] : "");
    const hasError = !!errors[field.name];
    const handleSelectChange = (newValue: string) => {
      setConfig(prev => ({ ...prev, [field.name]: newValue }));
      if (hasError) {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[field.name];
          return newErrors;
        });
      }
    };
    const renderLabel = () => (
      <Label className="text-sm font-medium">
        {field.label || field.name}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </Label>
    );
    
    // For select fields, use defaultValue if the config value is empty or undefined
    let valueWithDefault = value;
    if (field.type === "select" && (value === "" || value === undefined) && field.defaultValue !== undefined) {
      valueWithDefault = field.defaultValue;
    } else {
      valueWithDefault = value || "";
    }
    
    // Debug logging for select fields with default values
    if (field.type === "select" && field.defaultValue && (config[field.name] === "" || config[field.name] === undefined)) {
      console.log('🔍 Select field debug:', {
        fieldName: field.name,
        defaultValue: field.defaultValue,
        currentValue: valueWithDefault,
        configValue: config[field.name]
      });
    }

    // Special case: For guildId field, if bot is not in the server, only render the field and bot checker UI, no extra spacing
    if (
      nodeInfo?.type?.startsWith("discord_action_") &&
      field.name === "guildId" &&
      config.guildId &&
      botStatus[config.guildId] === false
    ) {
      return (
        <div className="space-y-2">
          {renderLabel()}
          <Select
            value={value}
            onValueChange={handleSelectChange}
            disabled={field.readonly}
          >
            <SelectTrigger className={cn(
              "w-full",
              hasError && "border-red-500",
              field.readonly && "bg-muted/50 cursor-not-allowed"
            )}>
              <SelectValue placeholder={field.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {dynamicOptions[field.name]?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Discord bot status indicator (already styled) */}
          {nodeInfo?.type?.startsWith("discord_action_") && field.name === "guildId" && value && (
            <div className="flex items-center gap-2 mt-2">
              <div className={cn(
                "flex items-center gap-2 text-sm",
                "text-amber-600"
              )}>
                <div className="w-2 h-2 bg-amber-500 rounded-full" />
                Bot is not in this server or lacks permissions
                {errors.botRefresh && (
                  <p className="text-xs text-amber-500 mt-1">{errors.botRefresh}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const popup = window.open(
                        "https://discord.com/oauth2/authorize?client_id=1378595955212812308&permissions=274877918208&scope=bot",
                        "discord_bot_invite",
                        "width=500,height=600,scrollbars=yes,resizable=yes"
                      )
                      if (popup) {
                        const checkClosed = setInterval(() => {
                          if (popup.closed) {
                            clearInterval(checkClosed)
                            setTimeout(async () => {
                              if (config.guildId) {
                                await checkBotInGuild(config.guildId)
                              }
                            }, 1000)
                          }
                        }, 500)
                        setTimeout(() => {
                          clearInterval(checkClosed)
                        }, 300000)
                      }
                    }}
                  >
                    Add Bot
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (config.guildId) {
                        await checkBotInGuild(config.guildId)
                      }
                    }}
                  >
                    Refresh
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }
    
    // Special case: YouTube Update Video Details - fetch video data when video is selected
    if (nodeInfo?.type === "youtube_action_update_video" && field.name === "videoId") {
      const value = config[field.name] || "";
      const hasError = !!errors[field.name];
      
      // Get options from dynamic data
      const options = dynamicOptions[field.name] || 
                     (typeof field.dynamic === 'string' ? dynamicOptions[field.dynamic] : []) || 
                     [];
      
      const handleVideoSelect = async (newValue: string) => {
        setConfig({ ...config, [field.name]: newValue });
        
        // Clear error when user selects a video
        if (hasError) {
          setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors[field.name];
            return newErrors;
          });
        }
        
        // Fetch video details if a video is selected
        if (newValue) {
          try {
            const integration = getIntegrationByProvider("youtube");
            if (!integration) {
              console.error("YouTube integration not found");
              return;
            }
            
            // Fetch video details from YouTube API
            const response = await fetch("/api/integrations/youtube/get-video-details", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                videoId: newValue,
                integrationId: integration.id,
              }),
            });
            
            if (response.ok) {
              const videoData = await response.json();
              
              // Update form fields with video details
              setConfig(prev => ({
                ...prev,
                title: videoData.title || "",
                description: videoData.description || "",
                privacyStatus: videoData.privacyStatus || "private",
                tags: videoData.tags ? videoData.tags.join(", ") : "",
              }));
            } else {
              console.error("Failed to fetch video details:", response.statusText);
            }
          } catch (error) {
            console.error("Error fetching video details:", error);
          }
        }
      };
      
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Label className="text-sm font-medium">
              {field.label || field.name}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            {field.description && (
              <EnhancedTooltip 
                description={field.description}
                title={`${field.label || field.name} Information`}
                showExpandButton={field.description.length > 150}
                disabled={!tooltipsEnabled}
              />
            )}
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Combobox
                options={options.map((option: any) => {
                  const videoOption = typeof option === 'string' ? { value: option, label: option } : option;
                  const searchableText = [
                    videoOption.label,
                    videoOption.description,
                    videoOption.publishedAt ? new Date(videoOption.publishedAt).toLocaleDateString() : '',
                    videoOption.value
                  ].filter(Boolean).join(' ').toLowerCase();
                  
                  return {
                    value: videoOption.value,
                    label: videoOption.label,
                    description: videoOption.description,
                    publishedAt: videoOption.publishedAt,
                    thumbnail: videoOption.thumbnail,
                    searchValue: searchableText
                  };
                })}
                value={value}
                onChange={handleVideoSelect}
                disabled={loadingDynamic}
                placeholder={loadingDynamic ? "Loading..." : field.placeholder}
                searchPlaceholder="Search videos by title, description, or date..."
                emptyPlaceholder={loadingDynamic ? "Loading..." : "No videos found."}
                creatable={false}
              />
            </div>
            <VariablePicker
              workflowData={workflowData}
              currentNodeId={currentNodeId}
              onVariableSelect={(variable) => {
                setConfig(prev => ({ ...prev, [field.name]: variable }))
              }}
              fieldType="text"
              trigger={
                <Button variant="outline" size="sm" className="flex-shrink-0 px-3 min-h-[2.5rem]" title="Select from previous node">
                  <span className="text-sm font-mono">{`{}`}</span>
                </Button>
              }
            />
          </div>
          {hasError && (
            <p className="text-xs text-red-500">{errors[field.name]}</p>
          )}
        </div>
      );
    }
    
    // Special case: YouTube Fields to Return multi-select
    if (field.name === "fieldsToReturn") {
      const value = config[field.name] || [];
      const hasError = !!errors[field.name];
      
      const handleMultiSelectChange = (newValue: string[]) => {
        setConfig({ ...config, [field.name]: newValue })
        
        // Clear error when user selects values
        if (hasError) {
          setErrors(prev => {
            const newErrors = { ...prev }
            delete newErrors[field.name]
            return newErrors
          })
        }
      };
      
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">
              {field.label || field.name}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            {field.name === "fieldsToReturn" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-4 w-4 p-0">
                    <HelpCircle className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <div className="space-y-2">
                    <p className="font-medium">Field Options:</p>
                    <ul className="space-y-1 text-sm">
                      <li><strong>ID only:</strong> Returns just video IDs</li>
                      <li><strong>Basic info:</strong> Title, description, publish date, and thumbnail URL</li>
                      <li><strong>Statistics:</strong> View count, like count, and comment count</li>
                      <li><strong>Content details:</strong> Video duration and quality (SD/HD)</li>
                      <li><strong>Status:</strong> Privacy setting and embedding permissions</li>
                      <li><strong>Full snippet:</strong> Complete video metadata</li>
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <SlackEmailInviteMultiCombobox
            value={Array.isArray(value) ? value : []}
            onChange={handleMultiSelectChange}
            options={(field.options || []).map((option: any) => ({
              value: typeof option === 'string' ? option : option.value,
              label: typeof option === 'string' ? option : option.label
            }))}
            placeholder={field.placeholder}
            disabled={loadingDynamic}
          />

          {hasError && (
            <p className="text-xs text-red-500">{errors[field.name]}</p>
          )}
        </div>
      );
    }
    
    // Debug: Log every field name and type as it is rendered
    console.log('[ConfigModal] Rendering field:', field.name, 'type:', field.type);
    
    // DEBUG: Extra logging for icon/cover fields
    if (field.name === "icon" || field.name === "cover") {
      console.log(`🔍 DEBUG ${field.name} field:`, {
        fieldName: field.name,
        fieldType: field.type,
        nodeType: nodeInfo?.type,
        fieldDef: field
      })
    }
    // Custom Google Meet button/card rendering for Google Calendar create event
    if (nodeInfo?.type === "google_calendar_action_create_event" && field.name === "createMeetLink") {
      const handleAddMeet = async () => {
        setMeetLoading(true)
        try {
          const res = await fetch("/api/integrations/google-calendar/meet-draft", { method: "POST" })
          const data = await res.json()
          if (data.meetUrl && data.eventId) {
            setConfig(prev => ({ ...prev, createMeetLink: true, meetUrl: data.meetUrl, meetEventId: data.eventId }))
          } else {
            throw new Error(data.error || "Failed to create Google Meet link")
          }
        } catch (err) {
          alert("Failed to create Google Meet link. Please try again.")
        } finally {
          setMeetLoading(false)
        }
      }
      const handleRemoveMeet = async () => {
        setMeetLoading(true)
        try {
          if (config.meetEventId) {
            await fetch("/api/integrations/google-calendar/meet-draft", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ eventId: config.meetEventId })
            })
          }
        } catch {}
        setConfig(prev => ({ ...prev, createMeetLink: false, meetUrl: undefined, meetEventId: undefined }))
        setMeetLoading(false)
      }
      if (!config.createMeetLink || !config.meetUrl) {
        return (
          <Button
            className="w-full bg-[#c7d6f7] text-[#174ea6] hover:bg-[#b3c6f7] font-medium rounded-2xl py-2 text-base flex items-center justify-center gap-2"
            style={{ minWidth: 260 }}
            onClick={handleAddMeet}
            type="button"
            disabled={meetLoading}
          >
            <Video className="w-5 h-5 mr-2 -ml-1" />
            {meetLoading ? "Creating Google Meet Link..." : "Add Google Meet Video Conference"}
          </Button>
        )
      }
      return (
        <GoogleMeetCard
          meetUrl={config.meetUrl}
          guestLimit={100}
          onRemove={handleRemoveMeet}
          onCopy={() => {}}
          onSettings={() => {}}
        />
      )
    }
    // For select fields, use defaultValue if the config value is empty or undefined
    let computedValue = value;
    if (field.type === "select" && (value === "" || value === undefined) && field.defaultValue !== undefined) {
      computedValue = field.defaultValue;
    }
    // Debug logging for select fields with default values
    if (field.type === "select" && field.defaultValue && (config[field.name] === "" || config[field.name] === undefined)) {
      console.log('🔍 Select field debug:', {
        fieldName: field.name,
        defaultValue: field.defaultValue,
        currentValue: computedValue,
        configValue: config[field.name]
      });
    }

    // Dynamic label for facebook_action_get_page_insights periodCount
    let dynamicLabel = field.label
    if (
      nodeInfo?.type === "facebook_action_get_page_insights" &&
      field.name === "periodCount"
    ) {
      const period = config["period"] || "day"
      if (period === "day") dynamicLabel = "Number of Days"
      else if (period === "week") dynamicLabel = "Number of Weeks"
      else if (period === "month") dynamicLabel = "Number of Months"
    }

    // Add label rendering
    const renderLabel = () => (
      <div className="flex items-center gap-2 mb-2">
        <Label className="text-sm font-medium">
          {dynamicLabel || field.label || field.name}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        {field.description && (
          <EnhancedTooltip 
            description={field.description}
            title={`${field.label || field.name} Information`}
            showExpandButton={field.description.length > 150}
            disabled={!tooltipsEnabled}
          />
        )}
      </div>
    )

    // Special case: Discord Add Reaction emoji field (Discord-style UI)
    if (
      nodeInfo?.type === "discord_action_add_reaction" &&
      field.name === "emoji"
    ) {
      const guildId = config.guildId;
      const messageId = config.messageId;
      const channelId = config.channelId;



      const handleAddReaction = (emoji: any) => {
        // Store the full emoji object for proper handling
        const emojiData = {
          ...emoji,
          // Ensure we have the correct format for Discord API
          value: emoji.custom ? `${emoji.name}:${emoji.id}` : emoji.native,
          display: emoji.custom ? emoji.name : emoji.native
        };
        
        // Get current emojis (handle both array and single emoji formats)
        let currentEmojis = [];
        if (Array.isArray(config[field.name])) {
          currentEmojis = config[field.name];
        } else if (config[field.name]) {
          currentEmojis = [config[field.name]];
        }
        
        // Check if emoji is already selected (prevent duplicates)
        const isDuplicate = currentEmojis.some((existing: any) => 
          existing.custom ? existing.id === emojiData.id : existing.native === emojiData.native
        );
        
        if (!isDuplicate) {
          const newEmojis = [...currentEmojis, emojiData];
          setConfig({ ...config, [field.name]: newEmojis });
        }
        
        setDiscordPickerOpen(false);
      };

      const handleRemoveReaction = (index: number) => {
        // Get current emojis
        let currentEmojis = [];
        if (Array.isArray(config[field.name])) {
          currentEmojis = config[field.name];
        } else if (config[field.name]) {
          currentEmojis = [config[field.name]];
        }
        
        const newEmojis = currentEmojis.filter((_: any, i: number) => i !== index);
        setConfig({ ...config, [field.name]: newEmojis.length > 0 ? newEmojis : null });
      };

      // Get current emojis from config (handle both array and single emoji formats)
      let currentEmojis = [];
      if (Array.isArray(config[field.name])) {
        currentEmojis = config[field.name];
      } else if (config[field.name]) {
        // Handle both string and object formats for backward compatibility
        const emojiData = typeof config[field.name] === 'string' ? { 
          native: config[field.name],
          name: config[field.name],
          custom: false
        } : config[field.name];
        currentEmojis = [emojiData];
      }

      return (
        <div className="space-y-4">
          {renderLabel()}
          
          <div className="p-4 bg-[#232428] rounded-lg w-full max-w-lg">
            {/* Reaction bar with selected emojis and plus button */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Existing message reactions */}
              {messageReactions.map((reaction: any) => (
                <div
                  key={reaction.id}
                  className="flex items-center px-2 py-1 rounded-full bg-[#232428] border border-[#404249] text-lg"
                >
                  <span className="mr-1">{reaction.emoji}</span>
                  <span className="text-sm">{reaction.count}</span>
                </div>
              ))}
              
              {/* Selected emojis - show only emoji, no names */}
              {currentEmojis.map((emoji: any, index: number) => (
                <div key={emoji.id || emoji.native || index} className="flex items-center px-2 py-1 rounded-full bg-[#313338] border border-[#404249] text-lg">
                  <span className="mr-1">
                    {emoji.custom ? (
                      <img 
                        src={emoji.url} 
                        alt={emoji.name} 
                        className="w-5 h-5" 
                      />
                    ) : (
                      emoji.native
                    )}
                  </span>
                  <button
                    onClick={() => handleRemoveReaction(index)}
                    className="ml-1 p-0.5 rounded-md hover:bg-[#404249] text-muted-foreground hover:text-white transition-colors"
                    type="button"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              
              {/* Plus button - always show if message is selected */}
              {messageId && (
                <button
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-[#232428] border border-[#404249] hover:bg-[#404249] text-xl"
                  onClick={() => setDiscordPickerOpen((v: boolean) => !v)}
                  type="button"
                >
                  +
                </button>
              )}
            </div>



            {/* Emoji picker popover */}
            {discordPickerOpen && (
              <div className="relative z-50">
                <div className="absolute">
                  <DiscordEmojiPicker
                    guildId={guildId}
                    onSelect={handleAddReaction}
                    trigger={null}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Special case: Discord Remove Reaction emoji field (Discord-style UI)
    if (
      nodeInfo?.type === "discord_action_remove_reaction" &&
      field.name === "emoji"
    ) {
      const guildId = config.guildId;
      const messageId = config.messageId;
      const channelId = config.channelId;

      const handleSelectReaction = (reaction: any) => {
        // For remove reaction, allow selecting multiple reactions
        const currentSelected = config[field.name] || []; [];
        const isSelected = currentSelected.some((r: any) => r.id === reaction.id);
        
        let newSelected;
        if (isSelected) {
          // Remove from selection
          newSelected = currentSelected.filter((r: any) => r.id !== reaction.id);
        } else {
          // Add to selection
          newSelected = [...currentSelected, reaction];
        }
        
        setConfig({ ...config, [field.name]: newSelected });
      };

      const handleRemoveSelectedReaction = (reactionToRemove: any) => {
        const currentSelected = config[field.name] || [];
        const newSelected = currentSelected.filter((r: any) => r.id !== reactionToRemove.id);
        setConfig({ ...config, [field.name]: newSelected });
      };

      const handleClearAllSelected = () => {
        setConfig({ ...config, [field.name]: [] });
      };

      // Get current selected reactions from config
      const selectedReactions = config[field.name] || [];

      return (
        <div className="space-y-4">
          {renderLabel()}
          <div className="p-4 bg-[#232428] rounded-lg w-full max-w-lg">
            {/* Instructions */}
            <div className="mb-3 text-sm text-muted-foreground">
              Click a reaction below to select it for removal:
            </div>
            
            {/* Reaction bar with existing reactions */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Existing message reactions */}
              {messageReactions.map((reaction: any) => (
                <div
                  key={reaction.id}
                  className={`flex items-center px-3 py-2 rounded-full border-2 text-lg cursor-pointer transition-all ${
                    selectedReactions.some((r: any) => r.id === reaction.id)
                      ? 'bg-red-500/20 border-red-500 text-red-100 shadow-lg shadow-red-500/20'
                      : 'bg-[#232428] border-[#404249] hover:bg-[#2a2d31] hover:border-[#4f545c]'
                  }`}
                  onClick={() => handleSelectReaction(reaction)}
                >
                  <span className="mr-2">{reaction.emoji}</span>
                  <span className="text-sm font-medium">{reaction.count}</span>
                  {selectedReactions.some((r: any) => r.id === reaction.id) && (
                    <span className="ml-2 text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">
                      REMOVE
                    </span>
                  )}
                </div>
              ))}
            </div>
            
            {/* Selected reactions confirmation */}
            {selectedReactions.length > 0 && (
              <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-red-400">🗑️</span>
                    <span className="text-sm text-red-200">
                      <strong>Will remove:</strong> {selectedReactions.length} reaction(s)
                    </span>
                  </div>
                  <button
                    onClick={handleRemoveSelectedReaction}
                    className="text-red-400 hover:text-red-200 transition-colors"
                    type="button"
                    title="Deselect reaction"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Handle Google Sheets create spreadsheet sheets configuration
    if (nodeInfo?.type === "google_sheets_action_create_spreadsheet" && field.name === "sheets") {
      const [sheets, setSheets] = useState<Array<{ 
        name: string; 
        columns: number; 
        columnNames: string[] 
      }>>(
        config.sheets || [{ name: "Sheet1", columns: 5, columnNames: ["Column 1", "Column 2", "Column 3", "Column 4", "Column 5"] }]
      )

      const addSheet = () => {
        const defaultColumnNames = Array.from({ length: 5 }, (_, i) => `Column ${i + 1}`)
        const newSheets = [...sheets, { name: `Sheet${sheets.length + 1}`, columns: 5, columnNames: defaultColumnNames }]
        setSheets(newSheets)
        setConfig(prev => ({ ...prev, sheets: newSheets }))
      }

      const removeSheet = (index: number) => {
        if (sheets.length > 1) {
          const newSheets = sheets.filter((_, i) => i !== index)
          setSheets(newSheets)
          setConfig(prev => ({ ...prev, sheets: newSheets }))
        }
      }

      const updateSheet = (index: number, field: 'name' | 'columns', value: string | number) => {
        const newSheets = [...sheets]
        if (field === 'columns') {
          const currentColumnNames = newSheets[index].columnNames || []
          const newColumnCount = Math.max(1, Math.min(26, value as number))
          
          // Adjust column names array to match new column count
          let newColumnNames = [...currentColumnNames]
          if (newColumnCount > currentColumnNames.length) {
            // Add new column names
            for (let i = currentColumnNames.length; i < newColumnCount; i++) {
              newColumnNames.push(`Column ${i + 1}`)
            }
          } else if (newColumnCount < currentColumnNames.length) {
            // Remove excess column names
            newColumnNames = newColumnNames.slice(0, newColumnCount)
          }
          
          newSheets[index] = { 
            ...newSheets[index], 
            columns: newColumnCount,
            columnNames: newColumnNames
          }
        } else if (field === 'name') {
          newSheets[index] = { ...newSheets[index], name: value as string }
        }
        setSheets(newSheets)
        setConfig(prev => ({ ...prev, sheets: newSheets }))
      }

      const updateColumnName = (sheetIndex: number, columnIndex: number, value: string) => {
        const newSheets = [...sheets]
        newSheets[sheetIndex].columnNames[columnIndex] = value
        setSheets(newSheets)
        setConfig(prev => ({ ...prev, sheets: newSheets }))
      }

      return (
        <div className="space-y-4">
          {renderLabel()}
          <div className="space-y-3">
            {sheets.map((sheet, index) => (
              <div key={`sheet-${index}-${sheet.name || index}`} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Sheet {index + 1}</h4>
                  {sheets.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeSheet(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Sheet Name</Label>
                    <Input
                      value={sheet.name}
                      onChange={(e) => updateSheet(index, 'name', e.target.value)}
                      placeholder="e.g., Sales Data, Inventory"
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Number of Columns</Label>
                    <Input
                      type="number"
                      value={sheet.columns}
                      onChange={(e) => updateSheet(index, 'columns', parseInt(e.target.value) || 1)}
                      min="1"
                      max="26"
                      className="text-sm"
                    />
                  </div>
                </div>
                
                {/* Column Names */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Column Names</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: sheet.columns }, (_, colIndex) => (
                      <div key={`sheet-${index}-col-${colIndex}`} className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          Column {colIndex + 1}
                        </Label>
                        <Input
                          value={sheet.columnNames?.[colIndex] || `Column ${colIndex + 1}`}
                          onChange={(e) => updateColumnName(index, colIndex, e.target.value)}
                          placeholder={`Column ${colIndex + 1}`}
                          className="text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={addSheet}
              className="w-full"
            >
              + Add Another Sheet
            </Button>
          </div>
        </div>
      )
    }

    // Handle Airtable record actions custom fields layout
    if ((nodeInfo?.type === "airtable_action_create_record" || 
         nodeInfo?.type === "airtable_action_update_record") && 
        field.name === "fields") {
      const selectedTable = dynamicOptions["tableName"]?.find((table: any) => table.value === config.tableName)
      const tableFields = selectedTable?.fields || []
      
      if (!config.tableName) {
        return (
          <div className="space-y-2">
            <div className="p-6 border border-dashed border-muted-foreground/25 rounded-lg">
              <p className="text-sm text-muted-foreground text-center">
                Please select a table first to configure record fields
              </p>
            </div>
          </div>
        )
      }

      if (tableFields.length === 0) {
        return (
          <div className="space-y-2">
            <div className="p-6 border border-dashed border-muted-foreground/25 rounded-lg">
              <p className="text-sm text-muted-foreground text-center">
                Loading table fields...
              </p>
            </div>
          </div>
        )
      }
      
      // Sort fields to prioritize status fields and linked records
      const sortedFields = [...tableFields].sort((a, b) => {
        // Helper function to check if a field is a priority field
        const isPriorityField = (field: any) => {
          // Check for status fields
          const isStatus = field.type === "singleSelect" && 
                         (field.name.toLowerCase().includes('status') || 
                          field.name.toLowerCase().includes('state'))
          
          // Check for linked record fields we want to prioritize
          const isPriorityLinkedRecord = field.type === "linkedRecord" && 
                         (field.name.toLowerCase().includes('project') || 
                          field.name.toLowerCase().includes('task') ||
                          field.name.toLowerCase().includes('feedback'))
          
          return isStatus || isPriorityLinkedRecord
        }
        
        const aIsPriority = isPriorityField(a)
        const bIsPriority = isPriorityField(b)
        
        if (aIsPriority && !bIsPriority) return -1
        if (!aIsPriority && bIsPriority) return 1
        
        // If both are priority fields, sort by type (status first, then linked records)
        if (aIsPriority && bIsPriority) {
          const aIsStatus = a.type === "singleSelect"
          const bIsStatus = b.type === "singleSelect"
          if (aIsStatus && !bIsStatus) return -1
          if (!aIsStatus && bIsStatus) return 1
        }
        
        return 0
      })
      
      return (
        <div className="space-y-4">
          {renderLabel()}
          <div className="text-sm text-muted-foreground">
            Map your data to table columns from "{config.tableName}":
          </div>
          

          
          {/* Priority Record Selection */}
          {(dynamicOptions["task_records"]?.length > 0 || dynamicOptions["project_records"]?.length > 0 || dynamicOptions["feedback_records"]?.length > 0) && (
            <div className="space-y-4">
              <div className="text-sm font-medium text-muted-foreground">
                Link to Existing Records
              </div>
              
              {/* Task Selection */}
              {dynamicOptions["task_records"]?.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Related Task</Label>
                  <Combobox
                    value={config.fields?.RelatedTask || ""}
                    onChange={(value) => {
                      const newFields = { ...config.fields, RelatedTask: value }
                      setConfig(prev => ({ ...prev, fields: newFields }))
                    }}
                    placeholder="Search and select a task"
                    options={dynamicOptions["task_records"]}
                    searchPlaceholder="Search tasks..."
                    emptyPlaceholder="No tasks found."
                  />
                </div>
              )}
              
              {/* Project Selection */}
              {dynamicOptions["project_records"]?.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Related Project</Label>
                  <Combobox
                    value={config.fields?.RelatedProject || ""}
                    onChange={(value) => {
                      const newFields = { ...config.fields, RelatedProject: value }
                      setConfig(prev => ({ ...prev, fields: newFields }))
                    }}
                    placeholder="Search and select a project"
                    options={dynamicOptions["project_records"]}
                    searchPlaceholder="Search projects..."
                    emptyPlaceholder="No projects found."
                  />
                </div>
              )}
              
              {/* Feedback Selection */}
              {dynamicOptions["feedback_records"]?.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Related Feedback</Label>
                  <Combobox
                    value={config.fields?.RelatedFeedback || ""}
                    onChange={(value) => {
                      const newFields = { ...config.fields, RelatedFeedback: value }
                      setConfig(prev => ({ ...prev, fields: newFields }))
                    }}
                    placeholder="Search and select feedback"
                    options={dynamicOptions["feedback_records"]}
                    searchPlaceholder="Search feedback..."
                    emptyPlaceholder="No feedback found."
                  />
                </div>
              )}
            </div>
          )}
          
          {/* Main Fields Grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            {sortedFields.map((fieldDef: any, fieldIndex: number) => {
              const fieldValue = config.fields?.[fieldDef.name] || ""
              
              // Check if this field represents a linked table (foreign key relationship)
              const isLinkedField = fieldDef.type === "linkedRecord" || 
                                   fieldDef.type === "link" || 
                                   fieldDef.type === "multipleRecordLinks" ||
                                   fieldDef.type === "recordLink" || 
                                   fieldDef.type === "lookup" ||
                                   fieldDef.linkedTableName ||
                                   fieldDef.foreignTable
              
              // Check if this is a priority linked field (projects, tasks, feedback)
              const isPriorityLinkedField = isLinkedField && 
                                   (fieldDef.name.toLowerCase().includes('project') || 
                                    fieldDef.name.toLowerCase().includes('task') ||
                                    fieldDef.name.toLowerCase().includes('feedback'))
              


              return (
                <div key={`airtable-field-${fieldIndex}-${fieldDef.name}`} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">
                        {fieldDef.name}
                        {fieldDef.required && <span className="text-red-500 ml-1">*</span>}
                      </Label>
                      {isLinkedField && !isPriorityLinkedField && fieldDef.linkedTableName && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleCreateNew(fieldDef.linkedTableName)}
                          className="text-xs h-6 px-2"
                        >
                          {createNewTables[fieldDef.linkedTableName] ? "Use Existing" : "Create New"}
                        </Button>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground capitalize">
                      {isPriorityLinkedField ? "Linked Record" : fieldDef.type}
                    </span>
                  </div>
                  
                  {/* Field Input */}
                  {fieldDef.type === "singleSelect" && fieldDef.options ? (
                    <div className="flex gap-2">
                      <Select
                        value={fieldValue}
                        onValueChange={(value) => {
                          const newFields = { ...config.fields, [fieldDef.name]: value }
                          setConfig(prev => ({ ...prev, fields: newFields }))
                        }}
                      >
                        <SelectTrigger className="text-sm h-auto min-h-[2.5rem]">
                          <SelectValue placeholder={`Select ${fieldDef.name.toLowerCase()}`} />
                        </SelectTrigger>
                        <SelectContent 
                          className="max-h-[min(384px,calc(100vh-64px))] overflow-y-auto" 
                          side="bottom" 
                          sideOffset={0} 
                          align="start"
                        >
                          {fieldDef.options.choices.map((choice: any, choiceIndex: number) => (
                            <SelectItem key={`choice-${choiceIndex}-${choice.name}`} value={choice.name} className="whitespace-nowrap">
                              {choice.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <VariablePicker
                        workflowData={workflowData}
                        currentNodeId={currentNodeId}
                        onVariableSelect={(variable) => {
                          const newFields = { ...config.fields, [fieldDef.name]: variable }
                          setConfig(prev => ({ ...prev, fields: newFields }))
                        }}
                        fieldType="text"
                        trigger={
                          <Button variant="outline" size="sm" className="flex-shrink-0 px-3 min-h-[2.5rem]">
                            <span className="text-sm font-mono">{`{}`}</span>
                          </Button>
                        }
                      />
                    </div>
                  ) : isPriorityLinkedField ? (
                    <div className="flex gap-2">
                      <Combobox
                        value={fieldValue}
                        onChange={(value) => {
                          const newFields = { ...config.fields, [fieldDef.name]: value }
                          setConfig(prev => ({ ...prev, fields: newFields }))
                        }}
                        placeholder={`Search and select ${fieldDef.name.toLowerCase()}`}
                        options={
                          // Try multiple possible keys for the dropdown options
                          (() => {
                            const options = dynamicOptions[`${fieldDef.name}_records`] || 
                              dynamicOptions[`${fieldDef.name.toLowerCase()}_records`] ||
                              dynamicOptions[`${fieldDef.name.replace(/\s+/g, '_').toLowerCase()}_records`] ||
                              // Fallback to generic keys for priority fields
                              (fieldDef.name.toLowerCase().includes('project') ? dynamicOptions["project_records"] : []) ||
                              (fieldDef.name.toLowerCase().includes('task') ? dynamicOptions["task_records"] : []) ||
                              (fieldDef.name.toLowerCase().includes('feedback') ? dynamicOptions["feedback_records"] : []) ||
                              []
                            

                            
                            return options
                          })()
                        }
                        searchPlaceholder="Search records..."
                        emptyPlaceholder="No records found."
                      />
                      <VariablePicker
                        workflowData={workflowData}
                        currentNodeId={currentNodeId}
                        onVariableSelect={(variable) => {
                          const newFields = { ...config.fields, [fieldDef.name]: variable }
                          setConfig(prev => ({ ...prev, fields: newFields }))
                        }}
                        fieldType="text"
                        trigger={
                          <Button variant="outline" size="sm" className="flex-shrink-0 px-3 min-h-[2.5rem]">
                            <span className="text-sm font-mono">{`{}`}</span>
                          </Button>
                        }
                      />
                    </div>
                  ) : isLinkedField && fieldDef.linkedTableName ? (
                    <div className="flex gap-2">
                      <Combobox
                        value={fieldValue}
                        onChange={(value) => {
                          const newFields = { ...config.fields, [fieldDef.name]: value }
                          setConfig(prev => ({ ...prev, fields: newFields }))
                        }}
                        placeholder={`Search and select ${fieldDef.name.toLowerCase()}`}
                        options={
                          // Try multiple possible keys for the dropdown options
                          dynamicOptions[`${fieldDef.name}_records`] || 
                          dynamicOptions[`${fieldDef.name.toLowerCase()}_records`] ||
                          dynamicOptions[`${fieldDef.name.replace(/\s+/g, '_').toLowerCase()}_records`] ||
                          []
                        }
                        searchPlaceholder="Search records..."
                        emptyPlaceholder="No records found."
                      />
                      <VariablePicker
                        workflowData={workflowData}
                        currentNodeId={currentNodeId}
                        onVariableSelect={(variable) => {
                          const newFields = { ...config.fields, [fieldDef.name]: variable }
                          setConfig(prev => ({ ...prev, fields: newFields }))
                        }}
                        fieldType="text"
                        trigger={
                          <Button variant="outline" size="sm" className="flex-shrink-0 px-3 min-h-[2.5rem]">
                            <span className="text-sm font-mono">{`{}`}</span>
                          </Button>
                        }
                      />
                    </div>
                  ) : fieldDef.type === "checkbox" ? (
                    <div className="flex items-center justify-center space-x-2 min-h-[2.5rem] border rounded-md p-2">
                      <Checkbox
                        checked={fieldValue || false}
                        onCheckedChange={(checked) => {
                          const newFields = { ...config.fields, [fieldDef.name]: checked }
                          setConfig(prev => ({ ...prev, fields: newFields }))
                        }}
                      />
                      <Label className="text-sm">Enable</Label>
                    </div>
                  ) : fieldDef.type === "date" ? (
                    <div className="space-y-2">
                      <div className="relative">
                        <Input
                          type="date"
                          value={fieldValue === "{{current_date}}" ? "" : fieldValue}
                          onChange={(e) => {
                            const newFields = { ...config.fields, [fieldDef.name]: e.target.value }
                            setConfig(prev => ({ ...prev, fields: newFields }))
                          }}
                          className="text-sm min-h-[2.5rem] [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-2 [&::-webkit-calendar-picker-indicator]:top-1/2 [&::-webkit-calendar-picker-indicator]:-translate-y-1/2 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                          placeholder={fieldValue === "{{current_date}}" ? "Current date will be used" : ""}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant={fieldValue === "{{current_date}}" ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            const newValue = fieldValue === "{{current_date}}" ? "" : "{{current_date}}"
                            const newFields = { ...config.fields, [fieldDef.name]: newValue }
                            setConfig(prev => ({ ...prev, fields: newFields }))
                          }}
                          className="text-xs h-7 flex-1"
                        >
                          {fieldValue === "{{current_date}}" ? "Using Current Date" : "Use Current Date"}
                        </Button>
                        <EnhancedTooltip 
                          description="When enabled, this field will automatically use the current date each time the workflow runs, rather than a fixed date."
                          title="Auto Date Information"
                          buttonClassName="h-7 w-7 p-0 flex-shrink-0"
                          showExpandButton={false}
                          disabled={!tooltipsEnabled}
                        />
                      </div>
                    </div>
                  ) : fieldDef.type === "attachment" || fieldDef.type === "file" || fieldDef.type === "image" || fieldDef.name.toLowerCase().includes('image') || fieldDef.name.toLowerCase().includes('photo') || fieldDef.name.toLowerCase().includes('picture') ? (
                    <div className="flex flex-col gap-1">
                      {/* DEBUG: Log when generic file input is used for icon/cover */}
                      {(fieldDef.name === "icon" || fieldDef.name === "cover") && console.log('❌ Generic file input used for icon/cover:', { fieldName: fieldDef.name, nodeType: nodeInfo?.type, fieldType: fieldDef.type })}
                      {(fieldDef.name === "icon" || fieldDef.name === "cover") && (
                        <div style={{ color: 'white', background: 'red', padding: 4, fontWeight: 'bold', borderRadius: 4, marginBottom: 8 }}>
                          USING GENERIC FILE INPUT FOR {fieldDef.name.toUpperCase()} (SHOULD USE ENHANCED)
                        </div>
                      )}
                      <input
                        type="file"
                        id={`file-${fieldDef.name}`}
                        multiple={fieldDef.type === "attachment"}
                        accept={fieldDef.type === "image" ? "image/*" : undefined}
                        onChange={(e) => {
                          const files = Array.from(e.target.files || [])
                          const newFields = { ...config.fields, [fieldDef.name]: files }
                          setConfig(prev => ({ ...prev, fields: newFields }))
                        }}
                        className="hidden"
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => document.getElementById(`file-${fieldDef.name}`)?.click()}
                          className="min-h-[2.5rem] text-sm flex-1"
                        >
                          Upload {fieldDef.type === "image" ? "Image" : fieldDef.type === "attachment" ? "Files" : "File"}
                        </Button>
                        <VariablePicker
                          workflowData={workflowData}
                          currentNodeId={currentNodeId}
                          onVariableSelect={(variable) => {
                            const newFields = { ...config.fields, [fieldDef.name]: variable }
                            setConfig(prev => ({ ...prev, fields: newFields }))
                          }}
                          fieldType="file"
                          trigger={
                            <Button variant="outline" size="sm" className="flex-shrink-0 px-3 min-h-[2.5rem]">
                              <span className="text-sm font-mono">{`{}`}</span>
                            </Button>
                          }
                        />
                      </div>
                      {fieldValue && (
                        <div className="text-xs text-muted-foreground">
                          {Array.isArray(fieldValue) && fieldValue.length > 0 
                            ? fieldValue.length === 1
                              ? `Selected: ${fieldValue[0].name}`
                              : `${fieldValue.length} files: ${fieldValue.map(f => f.name).join(', ')}`
                            : typeof fieldValue === 'string' && fieldValue.includes('{{')
                            ? 'Using file from previous node'
                            : 'File selected'
                          }
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Textarea
                        value={fieldValue}
                        placeholder={`Enter ${fieldDef.name.toLowerCase()}`}
                        onChange={(e) => {
                          const newFields = { ...config.fields, [fieldDef.name]: e.target.value }
                          setConfig(prev => ({ ...prev, fields: newFields }))
                        }}
                        className="text-sm flex-1 min-h-[2.5rem] resize-none"
                        rows={1}
                      />
                      <VariablePicker
                        workflowData={workflowData}
                        currentNodeId={currentNodeId}
                        onVariableSelect={(variable) => {
                          const currentValue = fieldValue || ""
                          const newValue = currentValue + variable
                          const newFields = { ...config.fields, [fieldDef.name]: newValue }
                          setConfig(prev => ({ ...prev, fields: newFields }))
                        }}
                        fieldType={fieldDef.type === "multilineText" ? "textarea" : "text"}
                        trigger={
                          <Button variant="outline" size="sm" className="flex-shrink-0 px-3 min-h-[2.5rem]">
                            <span className="text-sm font-mono">{`{}`}</span>
                          </Button>
                        }
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          
        </div>
      )
    }

    // Extract filename from URL for display
    const extractFilenameFromUrl = (url: string): string => {
      try {
        const urlObj = new URL(url)
        const pathname = urlObj.pathname
        const filename = pathname.split('/').pop() || 'file'
        
        // Special handling for OneDrive URLs
        if (url.includes('onedrive.live.com') || url.includes('1drv.ms')) {
          // Extract file ID from OneDrive URL
          const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/)
          if (fileIdMatch) {
            const fileId = fileIdMatch[1]
            // Try to extract filename from URL path
            const pathParts = pathname.split('/')
            const lastPart = pathParts[pathParts.length - 1]
            if (lastPart && lastPart.includes('.')) {
              return decodeURIComponent(lastPart)
            } else {
              return `OneDrive File - ${fileId}`
            }
          }
        }
        
        // Special handling for Dropbox URLs
        if (url.includes('dropbox.com')) {
          // Extract filename from Dropbox URL path
          const dropboxMatch = url.match(/\/s\/([a-zA-Z0-9]+)\/([^?]+)/)
          if (dropboxMatch) {
            const filename = dropboxMatch[2]
            if (filename && filename.includes('.')) {
              return decodeURIComponent(filename)
            } else {
              return `Dropbox File - ${dropboxMatch[1]}`
            }
          }
        }
        
        return decodeURIComponent(filename)
      } catch {
        // Fallback for invalid URLs
        const urlParts = url.split('/')
        const lastPart = urlParts[urlParts.length - 1]
        
        if (lastPart && lastPart.includes('.')) {
          return lastPart
        }
        
        // Try to extract OneDrive file ID even from invalid URLs
        const onedriveMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/)
        if (onedriveMatch) {
          return `OneDrive File - ${onedriveMatch[1]}`
        }
        
        // Try to extract Dropbox file ID even from invalid URLs
        const dropboxMatch = url.match(/\/s\/([a-zA-Z0-9]+)/)
        if (dropboxMatch) {
          return `Dropbox File - ${dropboxMatch[1]}`
        }
        
        return 'downloaded-file'
      }
    }

    // Handle URL field changes with filename extraction
    const handleUrlFieldChange = (newValue: string) => {
      const newConfig = { ...config, [field.name]: newValue }
      
      // Auto-extract filename for text fields that look like URLs
      if (field.name.includes('url') && newValue && !config.filename) {
        const filename = extractFilenameFromUrl(newValue)
        if (filename) {
          newConfig.filename = filename
        }
      }
      
      // Auto-populate filename for OneDrive and Dropbox URL upload actions
      if ((nodeInfo?.type === "onedrive_action_upload_file_from_url" || nodeInfo?.type === "dropbox_action_upload_file_from_url") && 
          field.name === "fileUrl" && newValue) {
        const extractedFilename = extractFilenameFromUrl(newValue)
        const currentFileName = config.fileName || ""
        const hasUserEditedFileName = currentFileName.trim() !== ""
        
        // Only auto-populate if user hasn't manually set a filename
        if (!hasUserEditedFileName && extractedFilename) {
          newConfig.fileName = extractedFilename
        }
      }
      
      setConfig(newConfig)
    }

    const handleChange = (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      const newValue = e.target.value
      
      if (field.name.includes('url')) {
        handleUrlFieldChange(newValue)
      } else {
        setConfig({ ...config, [field.name]: newValue })
      }
      
      // Clear error when user starts typing
      if (hasError && newValue.trim() !== '') {
        setErrors(prev => {
          const newErrors = { ...prev }
          delete newErrors[field.name]
          return newErrors
        })
      }
    }

    const handleEmailAutocompleteChange = (newValue: string) => {
      setConfig({ ...config, [field.name]: newValue })
      
      // Clear error when user starts typing
      if (hasError && newValue.trim() !== '') {
        setErrors(prev => {
          const newErrors = { ...prev }
          delete newErrors[field.name]
          return newErrors
        })
      }
    }

    const handleFieldSelectChange = (newValue: string) => {
      console.log('🔄 Select value changed:', {
        fieldName: field.name,
        newValue,
        isAirtableAction: nodeInfo?.type === "airtable_action_create_record",
        isBaseIdField: field.name === "baseId",
        nodeType: nodeInfo?.type,
        configSchema: nodeInfo?.configSchema?.map(f => ({ name: f.name, dependsOn: f.dependsOn })),
        isTrelloAction: nodeInfo?.type === "trello_action_create_card" || nodeInfo?.type === "trello_action_move_card",
        isBoardIdField: field.name === "boardId"
      })
      
      // Discord: Save label for guildId, channelId, messageId
      if (nodeInfo?.providerId === 'discord' && (field.name === 'guildId' || field.name === 'channelId' || field.name === 'messageId')) {
        let label = undefined;
        // Try dynamic options first
        if (dynamicOptions[field.name]) {
          const found = dynamicOptions[field.name].find((opt: any) => (opt.value || opt.id) === newValue);
          if (found) label = (found as any).label || (found as any).name;
        }
        // Try configSchema static options
        if (!label && Array.isArray(field.options)) {
          const found = field.options.find((opt: any) => (typeof opt === 'string' ? opt : opt.value) === newValue);
          if (found) label = typeof found === 'string' ? found : (found as any).label;
        }
        setConfig(prev => ({
          ...prev,
          [field.name]: newValue,
          [`${field.name}_label`]: label || newValue
        }))
        // Continue with the rest of the logic, but return early to avoid duplicate setConfig
        return;
      }
      
      // Handle template changes for Notion database creation
      if (nodeInfo?.type === "notion_action_create_database" && field.name === "template") {
        if (newValue) {
          const templateConfig = getTemplateConfiguration(newValue)
          if (templateConfig) {
            setConfig(prev => ({
              ...prev,
              [field.name]: newValue,
              properties: templateConfig.properties,
              views: templateConfig.views
            }))
          } else {
            setConfig({ ...config, [field.name]: newValue })
          }
        } else {
          // Clear template - reset to empty properties and views
          setConfig(prev => ({
            ...prev,
            [field.name]: newValue,
            properties: [],
            views: []
          }))
        }
      }
      // Clear dependent fields when base changes for Airtable
      else if ((nodeInfo?.type === "airtable_action_create_record" || 
           nodeInfo?.type === "airtable_action_update_record" ||
           nodeInfo?.type === "airtable_action_move_record" ||
           nodeInfo?.type === "airtable_action_list_records") && 
          field.name === "baseId") {

        setConfig(prev => ({ 
          ...prev, 
          [field.name]: newValue,
          tableName: undefined,
          fields: undefined
        }))
      } else {
        console.log('🔄 Updating config state:', {
          fieldName: field.name,
          newValue,
          oldConfig: config,
          isTrelloAction: nodeInfo?.type === "trello_action_create_card" || nodeInfo?.type === "trello_action_move_card"
        })
        setConfig({ ...config, [field.name]: newValue })
      }
      
      // For Discord actions, channels will be loaded automatically by fetchDependentData
      if (nodeInfo?.type === "discord_action_send_message" && field.name === "guildId" && newValue) {
        console.log(`🔄 Guild selected: ${newValue}, channels will be loaded automatically`)
      }
      
      // Clear error when user selects a value
      if (hasError) {
        setErrors(prev => {
          const newErrors = { ...prev }
          delete newErrors[field.name]
          return newErrors
        })
      }
      
      // Handle dependent field updates
      console.log('🔄 Checking for dependent fields:', {
        fieldName: field.name,
        configSchemaLength: nodeInfo?.configSchema?.length || 0,
        configSchema: nodeInfo?.configSchema?.map(f => ({ name: f.name, dependsOn: f.dependsOn })),
        isDiscordAction: nodeInfo?.type === "discord_action_send_message",
        isDiscordEditMessageAction: nodeInfo?.type === "discord_action_edit_message",
        isGuildIdField: field.name === "guildId"
      })
      
      // Skip dependent field updates for Discord message actions - handled by separate effect
      if (nodeInfo?.type === "discord_action_edit_message" || nodeInfo?.type === "discord_action_delete_message" || nodeInfo?.type === "discord_action_send_message" || nodeInfo?.type === "discord_action_fetch_messages" || nodeInfo?.type === "discord_action_add_reaction" || nodeInfo?.type === "discord_action_remove_reaction" || nodeInfo?.type === "discord_action_fetch_reactions" || nodeInfo?.type === "discord_action_update_channel" || nodeInfo?.type === "discord_action_delete_channel") {
        console.log('🔄 Skipping dependent field updates for Discord message action - handled by separate effect')
        return
      }
      
      nodeInfo?.configSchema?.forEach(dependentField => {
        console.log('🔄 Checking field:', {
          fieldName: dependentField.name,
          dependsOn: dependentField.dependsOn,
          currentFieldName: field.name,
          isMatch: dependentField.dependsOn === field.name,
          isDiscordAction: nodeInfo?.type === "discord_action_send_message",
          isDiscordChannelField: dependentField.name === "channelId" && dependentField.dependsOn === "guildId"
        })
        
        if (dependentField.dependsOn === field.name) {
          console.log('🔄 Found dependent field:', {
            field: dependentField.name,
            dependsOn: field.name,
            newValue,
            isDiscordAction: nodeInfo?.type === "discord_action_send_message",
            isDiscordChannelFetch: dependentField.name === "channelId" && field.name === "guildId"
          })
          
          // Special logging for Discord channels
          if (nodeInfo?.type === "discord_action_send_message" && dependentField.name === "channelId" && field.name === "guildId") {
            console.log('🔄 Discord channel fetch triggered:', {
              guildId: newValue,
              channelField: dependentField,
              willCallFetchDependentData: true
            })
          }
          
          // Always call fetchDependentData - it now has deduplication built-in
          fetchDependentData(dependentField, newValue)
        }
      })
    }

    const handleMultiSelectChange = (newValue: string[]) => {
      setConfig({ ...config, [field.name]: newValue })
      
      // Clear error when user selects values
      if (hasError) {
        setErrors(prev => {
          const newErrors = { ...prev }
          delete newErrors[field.name]
          return newErrors
        })
      }
    }

    const handleCheckboxChange = (checked: boolean) => {
      setConfig(prev => ({ ...prev, [field.name]: checked }))
    }

    const handleFileChange = async (files: FileList | File[]) => {
      const fileArray = Array.from(files)
      
      // Auto-populate filename for OneDrive and Dropbox upload actions
      if ((nodeInfo?.type === "onedrive_action_upload_file" || nodeInfo?.type === "dropbox_action_upload_file") && 
          field.name === "uploadedFiles" && fileArray.length > 0) {
        const currentFileName = config.fileName || ""
        const hasUserEditedFileName = currentFileName.trim() !== ""
        
        if (fileArray.length === 1) {
          // Single file: use the file's name (only if user hasn't manually set a name)
          if (!hasUserEditedFileName) {
            const fileName = fileArray[0].name
            setConfig(prev => ({ ...prev, [field.name]: fileArray, fileName }))
            return
          }
        } else if (fileArray.length > 1) {
          // Multiple files: use the first file's name as base (only if user hasn't manually set a name)
          if (!hasUserEditedFileName) {
            const firstFileName = fileArray[0].name
            // Remove extension to create a base name
            const baseName = firstFileName.replace(/\.[^/.]+$/, "")
            setConfig(prev => ({ ...prev, [field.name]: fileArray, fileName: baseName }))
            return
          }
        }
      }
      
      if (field.multiple) {
        setConfig(prev => ({ ...prev, [field.name]: fileArray }))
      } else {
        setConfig(prev => ({ ...prev, [field.name]: fileArray[0] || null }))
      }
    }

    const handleDateChange = (date: Date | undefined) => {
      const dateString = date ? date.toISOString().split('T')[0] : ""
      const newConfig = { ...config, [field.name]: dateString }
      
      // Special handling for Google Calendar start/end date sync
      if (field.name === "startDate" && dateString && !config.endDate) {
        newConfig.endDate = dateString
      }
      
      setConfig(newConfig)
    }

    const handleTimeChange = (time: string) => {
      setConfig(prev => ({ ...prev, [field.name]: time }))
    }

    const handleVariableSelect = (variable: string) => {
      const currentValue = config[field.name] || ""
      
      // If there's existing text and it doesn't already end with the variable, append it
      let newValue = variable
      if (currentValue && !currentValue.includes(variable)) {
        newValue = currentValue + variable
      }
      
      setConfig({ ...config, [field.name]: newValue })
      
      // Clear any validation errors
      if (hasError) {
        setErrors(prev => {
          const newErrors = { ...prev }
          delete newErrors[field.name]
          return newErrors
        })
      }
    }

    // Special handling for icon and cover fields in Notion create page
    if ((field.name === "icon" || field.name === "cover") && nodeInfo?.type === "notion_action_create_page") {
      console.log(`🎯 EnhancedFileInput triggered for:`, { fieldName: field.name, nodeType: nodeInfo?.type, fieldType: field.type })
      return (
        <div className="space-y-2">
          {renderLabel()}
          <EnhancedFileInput
            fieldDef={field as NodeField}
            fieldValue={value}
            onValueChange={(newValue) => {
              setConfig(prev => ({ ...prev, [field.name]: newValue }))
            }}
            workflowData={workflowData}
            currentNodeId={currentNodeId}
          />
          {hasError && (
            <p className="text-xs text-red-500">{errors[field.name]}</p>
          )}
        </div>
      )
    }

    switch (String(field.type)) {
      case "text":
        // Fall through to default text handling
      case "email":
      case "password":
        return (
          <div className="space-y-2">
            {renderLabel()}
            <div className="flex gap-2 w-full">
              <div className="flex-1 relative">
                <Input
                  type={field.type}
                  value={value}
                  onChange={handleChange}
                  placeholder={loadingDynamic ? "Loading..." : field.placeholder}
                  readOnly={field.readonly || loadingDynamic}
                  disabled={loadingDynamic}
                  className={cn(
                    "flex-1", 
                    hasError && "border-red-500",
                    (field.readonly || loadingDynamic) && "bg-muted/50 cursor-not-allowed"
                  )}
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  data-form-type="other"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  data-dashlane-ignore="true"
                  name={`custom-${field.type}-${Math.random().toString(36).substr(2, 9)}`}
                />
                {loadingDynamic && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-md">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </div>
                  </div>
                )}
              </div>
              {!field.readonly && !loadingDynamic && (
                <VariablePicker
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  onVariableSelect={handleVariableSelect}
                  fieldType={field.type}
                  trigger={
                    <Button size="sm" className="flex-shrink-0 px-3 h-10 bg-gradient-to-r from-purple-400 to-purple-600 hover:from-purple-500 hover:to-purple-700 text-white border-0 shadow-sm" title="Insert variable">
                      <span className="text-sm font-mono">{`{}`}</span>
                    </Button>
                  }
                />
              )}
            </div>
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "number":
        return (
          <div className="space-y-2">
            {renderLabel()}
            <div className="flex gap-2 w-full">
              <div className="flex-1 relative">
              <Input
                type="number"
                value={value}
                onChange={(e) => {
                  // Apply min/max constraints if defined
                  const parsedValue = e.target.value === "" ? "" : parseFloat(e.target.value);
                  let finalValue = parsedValue;
                  
                  if (typeof parsedValue === 'number') {
                    if ('min' in field && !isNaN(field.min as number) && parsedValue < field.min!) {
                      finalValue = field.min as number;
                    } else if ('max' in field && !isNaN(field.max as number) && parsedValue > field.max!) {
                      finalValue = field.max as number;
                    }
                    
                    // If value was adjusted, update the input directly
                    if (finalValue !== parsedValue) {
                      e.target.value = finalValue.toString();
                    }
                  }
                  
                  handleChange(e);
                }}
                min={field.min}
                max={field.max}
                placeholder={loadingDynamic ? "Loading..." : field.placeholder}
                disabled={loadingDynamic}
                className={cn("w-full", hasError && "border-red-500", loadingDynamic && "bg-muted/50 cursor-not-allowed")}
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                data-dashlane-ignore="true"
                name={`custom-number-${Math.random().toString(36).substr(2, 9)}`}
              />
              {loadingDynamic && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-md">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </div>
                </div>
              )}
              {!field.readonly && !loadingDynamic && (
                <VariablePicker
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  onVariableSelect={handleVariableSelect}
                  fieldType={field.type}
                  trigger={
                    <Button size="sm" className="flex-shrink-0 px-3 h-10 bg-gradient-to-r from-purple-400 to-purple-600 hover:from-purple-500 hover:to-purple-700 text-white border-0 shadow-sm" title="Insert variable">
                      <span className="text-sm font-mono">{`{}`}</span>
                    </Button>
                  }
                />
              )}
            </div>
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "textarea":
        return (
          <div className="space-y-2">
            {renderLabel()}
            <div className="w-full space-y-2">
              <div className="relative">
                <Textarea
                  value={value}
                  onChange={handleChange}
                  placeholder={loadingDynamic ? "Loading..." : field.placeholder}
                  disabled={loadingDynamic}
                  className={cn("w-full min-h-[100px] resize-y", hasError && "border-red-500", loadingDynamic && "bg-muted/50 cursor-not-allowed")}
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  data-form-type="other"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  data-dashlane-ignore="true"
                  name={`custom-textarea-${Math.random().toString(36).substr(2, 9)}`}
                />
                {loadingDynamic && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-md">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </div>
                  </div>
                )}
              </div>
              {!loadingDynamic && (
                <div className="flex justify-end">
                  <VariablePicker
                    workflowData={workflowData}
                    currentNodeId={currentNodeId}
                    onVariableSelect={handleVariableSelect}
                    fieldType={field.type}
                    trigger={
                      <Button variant="outline" size="sm" className="gap-2">
                        <span className="text-sm font-mono">{`{}`}</span>
                        Insert Variable
                      </Button>
                    }
                  />
                </div>
              )}
            </div>
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "rich-text":
        return (
          <div className="space-y-2">
            {renderLabel()}
            
            <div className="w-full space-y-2">
              <div className="border rounded-md">
                {/* Email Compose Toolbar */}
                <div className="flex flex-wrap items-center gap-1 p-2 border-b bg-muted/30">
                  {/* Font Controls Group */}
                  <div className="flex items-center gap-1 mr-2">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">Font:</span>
                      <select 
                        className="h-8 px-2 text-xs border rounded bg-background hover:bg-muted"
                        onChange={(e) => {
                          const editor = document.querySelector(`[data-rich-editor="${field.name}"]`) as HTMLElement
                          if (editor) {
                            document.execCommand('fontName', false, e.target.value)
                            setConfig(prev => ({ ...prev, [field.name]: editor.innerHTML }))
                          }
                        }}
                        title="Font Family - Change text font"
                      >
                        <option value="Arial">Arial</option>
                        <option value="Times New Roman">Times New Roman</option>
                        <option value="Courier New">Courier New</option>
                        <option value="Georgia">Georgia</option>
                        <option value="Verdana">Verdana</option>
                        <option value="Helvetica">Helvetica</option>
                      </select>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">Size:</span>
                      <select 
                        className="h-8 px-2 text-xs border rounded bg-background hover:bg-muted"
                        onChange={(e) => {
                          const editor = document.querySelector(`[data-rich-editor="${field.name}"]`) as HTMLElement
                          if (editor) {
                            document.execCommand('fontSize', false, e.target.value)
                            setConfig(prev => ({ ...prev, [field.name]: editor.innerHTML }))
                          }
                        }}
                        title="Font Size - Change text size"
                      >
                        <option value="1">8pt</option>
                        <option value="2">10pt</option>
                        <option value="3">12pt</option>
                        <option value="4">14pt</option>
                        <option value="5">18pt</option>
                        <option value="6">24pt</option>
                        <option value="7">36pt</option>
                      </select>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">Color:</span>
                      <input 
                        type="color" 
                        className="h-8 w-8 border rounded cursor-pointer"
                        onChange={(e) => {
                          const editor = document.querySelector(`[data-rich-editor="${field.name}"]`) as HTMLElement
                          if (editor) {
                            document.execCommand('foreColor', false, e.target.value)
                            setConfig(prev => ({ ...prev, [field.name]: editor.innerHTML }))
                          }
                        }}
                        title="Text Color - Change text color"
                      />
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">Highlight:</span>
                      <input 
                        type="color" 
                        className="h-8 w-8 border rounded cursor-pointer"
                        onChange={(e) => {
                          const editor = document.querySelector(`[data-rich-editor="${field.name}"]`) as HTMLElement
                          if (editor) {
                            document.execCommand('backColor', false, e.target.value)
                            setConfig(prev => ({ ...prev, [field.name]: editor.innerHTML }))
                          }
                        }}
                        title="Highlight Color - Highlight text with background color"
                      />
                    </div>
                  </div>

                  <div className="w-px h-6 bg-border mx-1"></div>

                  {/* Style Controls Group */}
                  <div className="flex items-center gap-1 mr-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const editor = document.querySelector(`[data-rich-editor="${field.name}"]`) as HTMLElement
                        if (editor) {
                          document.execCommand('bold', false)
                          setConfig(prev => ({ ...prev, [field.name]: editor.innerHTML }))
                        }
                      }}
                      className="h-8 w-8 p-0 hover:bg-muted"
                      title="Bold (Ctrl+B) - Make text bold"
                    >
                      <strong className="text-sm">B</strong>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const editor = document.querySelector(`[data-rich-editor="${field.name}"]`) as HTMLElement
                        if (editor) {
                          document.execCommand('italic', false)
                          setConfig(prev => ({ ...prev, [field.name]: editor.innerHTML }))
                        }
                      }}
                      className="h-8 w-8 p-0 hover:bg-muted"
                      title="Italic (Ctrl+I) - Make text italic"
                    >
                      <em className="text-sm">I</em>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const editor = document.querySelector(`[data-rich-editor="${field.name}"]`) as HTMLElement
                        if (editor) {
                          document.execCommand('underline', false)
                          setConfig(prev => ({ ...prev, [field.name]: editor.innerHTML }))
                        }
                      }}
                      className="h-8 w-8 p-0 hover:bg-muted"
                      title="Underline (Ctrl+U) - Underline text"
                    >
                      <u className="text-sm">U</u>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const editor = document.querySelector(`[data-rich-editor="${field.name}"]`) as HTMLElement
                        if (editor) {
                          document.execCommand('strikeThrough', false)
                          setConfig(prev => ({ ...prev, [field.name]: editor.innerHTML }))
                        }
                      }}
                      className="h-8 w-8 p-0 hover:bg-muted"
                      title="Strikethrough - Draw a line through text"
                    >
                      <s className="text-sm">S</s>
                    </Button>
                  </div>

                  <div className="w-px h-6 bg-border mx-1"></div>

                  {/* Alignment Controls Group */}
                  <div className="flex items-center gap-1 mr-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const editor = document.querySelector(`[data-rich-editor="${field.name}"]`) as HTMLElement
                        if (editor) {
                          document.execCommand('justifyLeft', false)
                          setConfig(prev => ({ ...prev, [field.name]: editor.innerHTML }))
                        }
                      }}
                      className="h-8 w-8 p-0 hover:bg-muted"
                      title="Align Left - Align text to the left"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 3h18v2H3V3zm0 8h14v2H5v-2zm0 8h18v2H3v-2z"/>
                      </svg>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const editor = document.querySelector(`[data-rich-editor="${field.name}"]`) as HTMLElement
                        if (editor) {
                          document.execCommand('justifyCenter', false)
                          setConfig(prev => ({ ...prev, [field.name]: editor.innerHTML }))
                        }
                      }}
                      className="h-8 w-8 p-0 hover:bg-muted"
                      title="Align Center - Center align text"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 3h18v2H3V3zm2 8h14v2H5v-2zm-2 8h18v2H3v-2z"/>
                      </svg>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const editor = document.querySelector(`[data-rich-editor="${field.name}"]`) as HTMLElement
                        if (editor) {
                          document.execCommand('justifyRight', false)
                          setConfig(prev => ({ ...prev, [field.name]: editor.innerHTML }))
                        }
                      }}
                      className="h-8 w-8 p-0 hover:bg-muted"
                      title="Align Right - Align text to the right"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 3h18v2H3V3zm6 8h12v2H5v-2zm-6 8h18v2H3v-2z"/>
                      </svg>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const editor = document.querySelector(`[data-rich-editor="${field.name}"]`) as HTMLElement
                        if (editor) {
                          document.execCommand('justifyFull', false)
                          setConfig(prev => ({ ...prev, [field.name]: editor.innerHTML }))
                        }
                      }}
                      className="h-8 w-8 p-0 hover:bg-muted"
                      title="Justify - Justify text alignment"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 3h18v2H3V3zm0 8h18v2H3v-2zm0 8h18v2H3v-2z"/>
                      </svg>
                    </Button>
                  </div>

                  <div className="w-px h-6 bg-border mx-1"></div>

                  {/* List and Indent Controls Group */}
                  <div className="flex items-center gap-1 mr-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const editor = document.querySelector(`[data-rich-editor="${field.name}"]`) as HTMLElement
                        if (editor) {
                          document.execCommand('insertUnorderedList', false)
                          setConfig(prev => ({ ...prev, [field.name]: editor.innerHTML }))
                        }
                      }}
                      className="h-8 w-8 p-0 hover:bg-muted"
                      title="Bullet List - Create a bulleted list"
                    >
                      <span className="text-sm">•</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const editor = document.querySelector(`[data-rich-editor="${field.name}"]`) as HTMLElement
                        if (editor) {
                          document.execCommand('insertOrderedList', false)
                          setConfig(prev => ({ ...prev, [field.name]: editor.innerHTML }))
                        }
                      }}
                      className="h-8 w-8 p-0 hover:bg-muted"
                      title="Numbered List - Create a numbered list"
                    >
                      <span className="text-sm">1.</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const editor = document.querySelector(`[data-rich-editor="${field.name}"]`) as HTMLElement
                        if (editor) {
                          document.execCommand('indent', false)
                          setConfig(prev => ({ ...prev, [field.name]: editor.innerHTML }))
                        }
                      }}
                      className="h-8 w-8 p-0 hover:bg-muted"
                      title="Indent - Increase indentation"
                    >
                      <span className="text-sm">→</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const editor = document.querySelector(`[data-rich-editor="${field.name}"]`) as HTMLElement
                        if (editor) {
                          document.execCommand('outdent', false)
                          setConfig(prev => ({ ...prev, [field.name]: editor.innerHTML }))
                        }
                      }}
                      className="h-8 w-8 p-0 hover:bg-muted"
                      title="Outdent - Decrease indentation"
                    >
                      <span className="text-sm">←</span>
                    </Button>
                  </div>

                  <div className="w-px h-6 bg-border mx-1"></div>

                  {/* Media and Insert Controls Group */}
                  <div className="flex items-center gap-1 mr-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const url = prompt('Enter URL:')
                        if (url) {
                          const editor = document.querySelector(`[data-rich-editor="${field.name}"]`) as HTMLElement
                          if (editor) {
                            document.execCommand('createLink', false, url)
                            setConfig(prev => ({ ...prev, [field.name]: editor.innerHTML }))
                          }
                        }
                      }}
                      className="h-8 w-8 p-0 hover:bg-muted"
                      title="Insert Link (Ctrl+K) - Add a hyperlink to selected text"
                    >
                      🔗
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const imageUrl = prompt('Enter image URL:')
                        if (imageUrl) {
                          const editor = document.querySelector(`[data-rich-editor="${field.name}"]`) as HTMLElement
                          if (editor) {
                            document.execCommand('insertImage', false, imageUrl)
                            setConfig(prev => ({ ...prev, [field.name]: editor.innerHTML }))
                          }
                        }
                      }}
                      className="h-8 w-8 p-0 hover:bg-muted"
                      title="Insert Image - Add an image to the email"
                    >
                      🖼️
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const input = document.createElement('input')
                        input.type = 'file'
                        input.multiple = true
                        input.accept = '*/*'
                        input.onchange = (e) => {
                          const files = Array.from((e.target as HTMLInputElement).files || [])
                          if (files.length > 0) {
                            setAttachments(prev => ({
                              ...prev,
                              [field.name]: [...(prev[field.name] || []), ...files]
                            }))
                          }
                        }
                        input.click()
                      }}
                      className="h-8 w-8 p-0 hover:bg-muted"
                      title="Attach File - Attach a file to the email"
                    >
                      📎
                    </Button>
                  </div>

                  <div className="w-px h-6 bg-border mx-1"></div>

                  {/* Signature Control - Only show for Gmail and Outlook email actions */}
                  {(field.name === 'content' || field.name === 'body') &&
                    (nodeInfo?.providerId === 'gmail' || nodeInfo?.providerId === 'microsoft-outlook') && (
                      <div className="flex items-center gap-1">
                        <select 
                          className="h-8 px-2 text-xs border rounded bg-background hover:bg-muted"
                          onChange={(e) => {
                            const editor = document.querySelector(`[data-rich-editor="${field.name}"]`) as HTMLElement
                            if (editor && e.target.value) {
                              const signatureKey = nodeInfo?.providerId === 'gmail' ? 'gmail_signatures' : 'outlook_signatures'
                              const signatures = dynamicOptions[signatureKey] || []
                              const selectedSignature = signatures.find(sig => sig.value === e.target.value) as any
                              if (selectedSignature && selectedSignature.content) {
                                // Convert plain text signature to HTML with line breaks
                                const htmlSignature = '<br><br>' + selectedSignature.content.replace(/\n/g, '<br>')
                                document.execCommand('insertHTML', false, htmlSignature)
                                setConfig(prev => ({ ...prev, [field.name]: editor.innerHTML }))
                              }
                            }
                          }}
                          title="Insert Signature - Add a signature to the email"
                        >
                          <option value="">Signature</option>
                          {(dynamicOptions[nodeInfo?.providerId === 'gmail' ? 'gmail_signatures' : 'outlook_signatures'] || []).map((signature: any, sigIndex: number) => (
                            <option key={`signature-${sigIndex}-${signature.value}`} value={signature.value}>
                              {signature.label}
                            </option>
                          ))}
                        </select>
                      </div>
                  )}
                </div>

                {/* Visual Rich Text Editor */}
                <div
                  contentEditable
                  data-rich-editor={field.name}
                  onInput={(e) => {
                    const target = e.target as HTMLElement
                    setConfig(prev => ({ ...prev, [field.name]: target.innerHTML }))
                  }}
                  onFocus={(e) => {
                    const target = e.target as HTMLElement
                    if (target.innerHTML === '' || target.innerHTML === '<br>') {
                      target.innerHTML = ''
                    }
                  }}
                  onBlur={(e) => {
                    const target = e.target as HTMLElement
                    setConfig(prev => ({ ...prev, [field.name]: target.innerHTML }))
                    if (target.innerHTML === '' || target.innerHTML === '<br>') {
                      target.innerHTML = ''
                    }
                  }}
                  className={cn(
                    "w-full min-h-[120px] p-3 border-0 focus-visible:ring-0 outline-none resize-y overflow-y-auto",
                    "prose prose-sm max-w-none",
                    hasError && "border-red-500"
                  )}
                  style={{
                    fontFamily: 'inherit',
                    fontSize: '14px',
                    lineHeight: '1.5'
                  }}
                  data-placeholder={field.placeholder}
                  suppressContentEditableWarning={true}
                  ref={(el) => {
                    if (el && el.innerHTML !== (value || '')) {
                      el.innerHTML = value || ''
                    }
                  }}
                />

                {/* Attachments Display */}
                {attachments[field.name] && attachments[field.name].length > 0 && (
                  <div className="p-3 border-t bg-muted/20">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-muted-foreground">Attachments:</span>
                    </div>
                    <div className="space-y-1">
                      {attachments[field.name].map((file, index) => (
                        <div key={`attachment-${index}-${file.name}`} className="flex items-center justify-between p-2 bg-background border rounded text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">📎</span>
                            <span className="font-medium">{file.name}</span>
                            <span className="text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setAttachments(prev => ({
                                ...prev,
                                [field.name]: prev[field.name].filter((_, i) => i !== index)
                              }))
                            }}
                            className="h-6 w-6 p-0 hover:bg-muted"
                            title="Remove attachment"
                          >
                            <span className="text-xs">×</span>
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex justify-between items-center">
                <p className="text-xs text-muted-foreground">
                  Format your text visually. The formatted content will be sent as HTML.
                </p>
                <VariablePicker
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  onVariableSelect={handleVariableSelect}
                  fieldType={field.type}
                  trigger={
                    <Button variant="outline" size="sm" className="gap-2">
                      <span className="text-sm font-mono">{`{}`}</span>
                      Insert Variable
                    </Button>
                  }
                />
              </div>
            </div>
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "select":
        // Custom Discord user selector for enhanced user selection
        if (nodeInfo?.type === "discord_action_send_direct_message" && field.name === "userId") {
          return (
            <div className="space-y-2">
              <DiscordUserSelector
                value={value || ""}
                onChange={handleSelectChange}
                placeholder={field.placeholder}
                disabled={loadingDynamic}
              />
              {hasError && (
                <p className="text-xs text-red-500">{errors[field.name]}</p>
              )}
            </div>
          )
        }

        // Add variable picker for Discord message action channel and message fields
        if (nodeInfo && (nodeInfo.type === "discord_action_edit_message" || nodeInfo.type === "discord_action_delete_message" || nodeInfo.type === "discord_action_send_message" || nodeInfo.type === "discord_action_fetch_messages" || nodeInfo.type === "discord_action_add_reaction" || nodeInfo.type === "discord_action_remove_reaction" || nodeInfo.type === "discord_action_fetch_reactions" || nodeInfo.type === "discord_action_update_channel" || nodeInfo.type === "discord_action_delete_channel") && (field.name === "channelId" || field.name === "messageId")) {
          // Get options for the select field
          let options: any[] = []
          if (field.dynamic) {
            options = dynamicOptions[field.name] || 
                     (typeof field.dynamic === 'string' ? dynamicOptions[field.dynamic] : []) || 
                     []
          } else if (field.options) {
            options = field.options
          }
          
          // Determine loading state for this specific field
          const isFieldLoading = field.name === 'channelId' ? loadingDiscordChannels : 
                                field.name === 'messageId' ? loadingDiscordMessages : 
                                loadingDynamic
          
          // Find the selected option to display the label properly
          const selectedOption = options.find((option: any) => {
            const optionValue = typeof option === 'string' ? option : option.value
            return optionValue === value
          })
          
          // Use selected option label, fallback to stored label, then fallback to value
          let selectedLabel = value
          if (selectedOption) {
            selectedLabel = typeof selectedOption === 'string' ? selectedOption : selectedOption.label
          } else if (config[`${field.name}_label`]) {
            // Fallback to stored label if option not found (e.g., when data is still loading)
            selectedLabel = config[`${field.name}_label`]
          }
          
          return (
            <div className="space-y-2">
              {renderLabel()}
              <div className="flex gap-2 w-full">
                <div className="flex-1">
                  <Select
                    value={value}
                    onValueChange={handleSelectChange}
                    disabled={isFieldLoading}
                  >
                    <SelectTrigger className={cn("w-full", hasError && "border-red-500")}>
                      <SelectValue placeholder={
                        isFieldLoading 
                          ? `Loading ${field.name === 'channelId' ? 'channels' : field.name === 'messageId' ? 'messages' : 'options'}...` 
                          : field.placeholder
                      }>
                        {selectedLabel}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent 
                      className="max-h-[min(384px,calc(100vh-64px))] overflow-y-auto" 
                      side="bottom" 
                      sideOffset={0} 
                      align="start"
                    >
                      {isFieldLoading ? (
                        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Loading {field.name === 'channelId' ? 'channels' : field.name === 'messageId' ? 'messages' : 'options'}...
                        </div>
                      ) : options.length === 0 ? (
                        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                          {field.name === 'channelId' ? 'No channels available' : 
                           field.name === 'messageId' ? 'No messages available' : 
                           'No options available'}
                        </div>
                      ) : (
                        options.map((option: any, optionIndex: number) => {
                          const optionValue = typeof option === 'string' ? option : option.value
                          const optionLabel = typeof option === 'string' ? option : option.label
                          return (
                            <SelectItem key={`select-option-${optionIndex}-${optionValue || 'undefined'}`} value={optionValue} className="whitespace-nowrap">
                              {optionLabel}
                            </SelectItem>
                          )
                        })
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <VariablePicker
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  onVariableSelect={(variable) => {
                    setConfig(prev => ({ ...prev, [field.name]: variable }))
                  }}
                  fieldType="text"
                  trigger={
                    <Button variant="outline" size="sm" className="flex-shrink-0 px-3 min-h-[2.5rem]" title="Select from previous node">
                      <span className="text-sm font-mono">{`{}`}</span>
                    </Button>
                  }
                />
              </div>
              {hasError && (
                <p className="text-xs text-red-500">{errors[field.name]}</p>
              )}
            </div>
          )
        }

        // Try multiple keys for dynamic options to ensure compatibility
        let options = []
        if (field.dynamic) {
          // Try field name first, then dynamic key, then both
          options = dynamicOptions[field.name] || 
                   (typeof field.dynamic === 'string' ? dynamicOptions[field.dynamic] : []) || 
                   []
          
          // For Trello, ensure we have data before rendering
          if ((nodeInfo?.type === "trello_action_create_card" || nodeInfo?.type === "trello_action_move_card") && options.length === 0) {
            // If we don't have options yet, show loading state
            console.log(`🎯 TRELLO: No options available for "${field.name}", showing loading state`)
          }
          
          // Enhanced debugging for Trello to see what keys are available
          if (nodeInfo?.type === "trello_action_create_card" || nodeInfo?.type === "trello_action_move_card") {
            console.log(`🎯 TRELLO OPTIONS LOOKUP for "${field.name}":`, {
              fieldName: field.name,
              fieldDynamic: field.dynamic,
              optionsFromFieldName: dynamicOptions[field.name]?.length || 0,
              optionsFromDynamicKey: (typeof field.dynamic === 'string' ? dynamicOptions[field.dynamic]?.length : 0) || 0,
              finalOptionsCount: options.length,
              availableKeys: Object.keys(dynamicOptions),
              actualDataFromFieldName: dynamicOptions[field.name],
              actualDataFromDynamicKey: typeof field.dynamic === 'string' ? dynamicOptions[field.dynamic] : null,
              allDynamicOptions: dynamicOptions,
              renderTimestamp: new Date().toISOString()
            })
          }
        } else {
          options = field.options || []
        }
        
        // Enhanced debugging for Trello fields
        if (nodeInfo?.type === "trello_action_create_card") {
          console.log(`🎯 TRELLO SELECT FIELD "${field.name}":`, {
            fieldName: field.name,
            fieldDynamic: field.dynamic,
            fieldDependsOn: field.dependsOn,
            optionsCount: options.length,
            options: options,
            dynamicOptionsKeys: Object.keys(dynamicOptions),
            dynamicOptionsForField: dynamicOptions[field.name],
            allDynamicOptions: dynamicOptions,
            currentConfig: config,
            dependsOnValue: field.dependsOn ? config[field.dependsOn] : null,
            currentValue: value,
            isDisabled: loadingDynamic || Boolean(nodeInfo?.type === "trello_action_create_card" && field.dynamic && options.length === 0 && !field.dependsOn)
          })
        }
        
        console.log(`🔍 Dropdown ${field.name} rendering:`, { 
          fieldName: field.name,
          dynamic: field.dynamic,
          dependsOn: field.dependsOn,
          availableKeys: Object.keys(dynamicOptions),
          optionsLength: options.length,
          options: options.slice(0, 3), // Show first 3 items
          dynamicOptionsForField: dynamicOptions[field.name],
          dynamicOptions: dynamicOptions
        })
        console.log(`🔍 Select field "${field.name}" (${field.dynamic || 'static'}):`, {
          fieldName: field.name,
          fieldDynamic: field.dynamic,
          optionsCount: options.length,
          options: options,
          dynamicOptionsKeys: Object.keys(dynamicOptions),
          dynamicOptionsForField: dynamicOptions[field.name]
        })
        
        // Special debugging for Discord channels
        if (field.dynamic === "discord_channels") {
          console.log(`🎯 DISCORD CHANNELS DEBUG for "${field.name}":`, {
            fieldName: field.name,
            fieldDynamic: field.dynamic,
            optionsCount: options.length,
            options: options,
            dynamicOptionsKeys: Object.keys(dynamicOptions),
            dynamicOptionsForField: dynamicOptions[field.name],
            allDynamicOptions: dynamicOptions,
            currentConfig: config,
            dependsOnValue: field.dependsOn ? config[field.dependsOn] : null,
            currentValue: value,
            nodeType: nodeInfo?.type
          })
        }


        

        
        // Use MultiCombobox for multiple select with creatable option
        if (field.multiple && field.creatable) {
          // Special handling for Gmail labels to make it more like Gmail's interface
          if (field.name === 'labelIds' && field.dynamic === 'gmail-labels') {
            return (
              <div className="space-y-2">
                {renderLabel()}
                <GmailLabelsInput
                  options={options.map((option) => {
                    if (typeof option === 'string') {
                      return {
                        value: option,
                        label: option,
                        isExisting: false
                      }
                    } else {
                      return {
                        value: option.value,
                        label: option.label,
                        isExisting: (option as any).isExisting || false
                      }
                    }
                  })}
                  value={Array.isArray(value) ? value : []}
                  onChange={(newValues) => {
                    // Separate existing label IDs from new label names
                    const existingLabelIds: string[] = []
                    const newLabelNames: string[] = []
                    
                    for (const val of newValues) {
                      const option = options.find(opt => 
                        (typeof opt === 'string' ? opt : opt.value) === val
                      )
                      if (option && typeof option === 'object' && (option as any).isExisting) {
                        existingLabelIds.push(val)
                      } else {
                        newLabelNames.push(val)
                      }
                    }
                    
                    // Store both existing IDs and new names
                    setConfig(prev => ({
                      ...prev,
                      labelIds: existingLabelIds,
                      labelNames: newLabelNames
                    }))
                  }}
                  placeholder={loadingDynamic ? "Loading..." : "Type to add labels..."}
                  disabled={loadingDynamic}
                />
                {hasError && (
                  <p className="text-xs text-red-500">{errors[field.name]}</p>
                )}
              </div>
            )
          }
          
          // For all other multiple/creatable fields, use MultiCombobox
          return (
            <div className="space-y-2">
              {renderLabel()}
              <MultiCombobox
                options={options.map((option) => {
                  if (typeof option === 'string') {
                    return {
                      value: option,
                      label: option,
                      isExisting: false
                    }
                  } else {
                    return {
                      value: option.value,
                      label: option.label,
                      isExisting: (option as any).isExisting || false
                    }
                  }
                })}
                value={Array.isArray(value) ? value : []}
                onChange={handleMultiSelectChange}
                placeholder={loadingDynamic ? "Loading..." : field.placeholder}
                searchPlaceholder="Search or type to create new ones..."
                emptyPlaceholder={loadingDynamic ? "Loading..." : "No results found."}
                disabled={loadingDynamic}
                creatable={true}
              />
              {hasError && (
                <p className="text-xs text-red-500">{errors[field.name]}</p>
              )}
            </div>
          )
        }
        
        // Use Combobox for single select with creatable option
        if (field.creatable) {
          return (
            <div className="space-y-2">
              {renderLabel()}
              <Combobox
                options={options.map((option) => ({
                  value: typeof option === 'string' ? option : option.value,
                  label: typeof option === 'string' ? option : option.label,
                  description: typeof option === 'object' && 'description' in option && typeof option.description === 'string' ? option.description : undefined
                }))}
                value={value}
                onChange={handleSelectChange}
                disabled={loadingDynamic}
                placeholder={loadingDynamic ? "Loading..." : field.placeholder}
                searchPlaceholder="Search or type to create new..."
                emptyPlaceholder={loadingDynamic ? "Loading..." : "No results found."}
                creatable={true}
              />
              {hasError && (
                <p className="text-xs text-red-500">{errors[field.name]}</p>
              )}
            </div>
          )
        }
        
        // YouTube video fields with VariablePicker support
        if (field.dynamic === "youtube_videos") {
          return (
            <div className="space-y-2">
              {renderLabel()}
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select
                    value={value}
                    onValueChange={(newValue) => {
                      console.log('🎯 YOUTUBE VIDEO SELECT onValueChange called:', {
                        fieldName: field.name,
                        newValue,
                        oldValue: value,
                        nodeType: nodeInfo?.type
                      })
                      handleSelectChange(newValue)
                    }}
                    disabled={loadingDynamic}
                  >
                    <SelectTrigger className={cn("w-full", hasError && "border-red-500")}>
                      <SelectValue placeholder={
                        loadingDynamic 
                          ? "Loading..." 
                          : field.placeholder
                      } />
                    </SelectTrigger>
                    <SelectContent 
                      className="max-h-[min(384px,calc(100vh-64px))] overflow-y-auto" 
                      side="bottom" 
                      sideOffset={0} 
                      align="start"
                    >
                      {loadingDynamic ? (
                        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Loading videos...
                        </div>
                      ) : options.length === 0 ? (
                        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                          No videos available
                        </div>
                      ) : (
                        options.map((option, optionIndex) => {
                          const optionValue = typeof option === 'string' ? option : option.value
                          const optionLabel = typeof option === 'string' ? option : option.label
                          return (
                            <SelectItem key={`select-option-${optionIndex}-${optionValue || 'undefined'}`} value={optionValue} className="whitespace-nowrap">
                              {optionLabel}
                            </SelectItem>
                          )
                        })
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <VariablePicker
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  onVariableSelect={(variable) => {
                    setConfig(prev => ({ ...prev, [field.name]: variable }))
                  }}
                  fieldType="text"
                  trigger={
                    <Button variant="outline" size="sm" className="flex-shrink-0 px-3 min-h-[2.5rem]" title="Select from previous node">
                      <span className="text-sm font-mono">{`{}`}</span>
                    </Button>
                  }
                />
              </div>
              {hasError && (
                <p className="text-xs text-red-500">{errors[field.name]}</p>
              )}
            </div>
          )
        }
        
        // Use regular Select for single select without creatable option
        // Debug logging for Dropbox folders
        if (field.dynamic === "dropbox-folders") {
          console.log('🎯 Dropbox folder field detected:', {
            fieldName: field.name,
            fieldDynamic: field.dynamic,
            optionsCount: options.length
          })
        }
        
        // Determine loading state for Discord fields
        const isDiscordField = nodeInfo?.providerId === 'discord' && (field.name === 'channelId' || field.name === 'messageId')
        const isFieldLoading = isDiscordField ? 
          (field.name === 'channelId' ? loadingDiscordChannels : loadingDiscordMessages) : 
          loadingDynamic
        
        return (
          <div className="space-y-2">
            {renderLabel()}
            <div className="flex gap-2 w-full">
              <div className="flex-1">
                <Select
                  value={value}
                  onValueChange={(newValue) => {
                    console.log('🎯 TRELLO SELECT onValueChange called:', {
                      fieldName: field.name,
                      newValue,
                      oldValue: value,
                      isTrelloAction: nodeInfo?.type === "trello_action_create_card" || nodeInfo?.type === "trello_action_move_card"
                    })
                    handleSelectChange(newValue)
                  }}
                  disabled={isFieldLoading || Boolean((nodeInfo?.type === "trello_action_create_card" || nodeInfo?.type === "trello_action_move_card") && field.dynamic && options.length === 0 && !field.dependsOn)}
                >
              <SelectTrigger className={cn("w-full", hasError && "border-red-500")}>
                <SelectValue placeholder={
                  isFieldLoading 
                    ? (isDiscordField ? `Loading ${field.name === 'channelId' ? 'channels' : 'messages'}...` : "Loading...")
                    : ((nodeInfo?.type === "trello_action_create_card" || nodeInfo?.type === "trello_action_move_card") && field.dynamic && options.length === 0 && field.dependsOn)
                    ? `Select ${field.dependsOn} first`
                    : field.placeholder
                } />
              </SelectTrigger>
              <SelectContent 
                className="max-h-[min(384px,calc(100vh-64px))] overflow-y-auto" 
                side="bottom" 
                sideOffset={0} 
                align="start"
              >
                {isFieldLoading ? (
                  <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    {isDiscordField ? 
                      `Loading ${field.name === 'channelId' ? 'channels' : 'messages'}...` : 
                      'Loading options...'}
                  </div>
                ) : options.length === 0 ? (
                  <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                    {isDiscordField ? 
                      (field.name === 'channelId' ? 'No channels available' : 'No messages available') : 
                      'No options available'}
                  </div>
                ) : (
                  options.map((option, optionIndex) => {
                    const optionValue = typeof option === 'string' ? option : option.value
                    const optionLabel = typeof option === 'string' ? option : option.label
                    return (
                      <SelectItem key={`select-option-${optionIndex}-${optionValue || 'undefined'}`} value={optionValue} className="whitespace-nowrap">
                        {optionLabel}
                      </SelectItem>
                    )
                  })
                )}
              </SelectContent>
            </Select>
              </div>
              {!field.readonly && !loadingDynamic && (
                <VariablePicker
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  onVariableSelect={handleVariableSelect}
                  fieldType={field.type}
                  trigger={
                    <Button size="sm" className="flex-shrink-0 px-3 h-10 bg-gradient-to-r from-purple-400 to-purple-600 hover:from-purple-500 hover:to-purple-700 text-white border-0 shadow-sm" title="Insert variable">
                      <span className="text-sm font-mono">{`{}`}</span>
                    </Button>
                  }
                />
              )}
            </div>
            
            {/* Discord bot status indicator */}
            {nodeInfo?.type?.startsWith("discord_action_") && field.name === "guildId" && value && (
              <div className="flex items-center gap-2 mt-2">
                {checkingBot ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking bot status...
                  </div>
                ) : botStatus[value] === undefined ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="w-2 h-2 bg-gray-400 rounded-full" />
                    Bot status not checked
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (config.guildId) {
                            await checkBotInGuild(config.guildId)
                          }
                        }}
                      >
                        Check Status
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const popup = window.open(
                            "https://discord.com/oauth2/authorize?client_id=1378595955212812308&permissions=274877918208&scope=bot",
                            "discord_bot_invite",
                            "width=500,height=600,scrollbars=yes,resizable=yes"
                          )
                          if (popup) {
                            const checkClosed = setInterval(() => {
                              if (popup.closed) {
                                clearInterval(checkClosed)
                                setTimeout(async () => {
                                  if (config.guildId) {
                                    await checkBotInGuild(config.guildId)
                                  }
                                }, 1000)
                              }
                            }, 500)
                            setTimeout(() => {
                              clearInterval(checkClosed)
                            }, 300000)
                          }
                        }}
                      >
                        Add Bot
                      </Button>
                    </div>
                  </div>
                ) : botStatus[value] ? (
                  <div className={cn(
                    "flex items-center gap-2 text-sm",
                    "text-green-600"
                  )}>
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    Bot is connected to this server
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => checkBotInGuild(value)}
                    >
                      Refresh
                    </Button>
                  </div>
                ) : (
                  <div className={cn(
                    "flex items-center gap-2 text-sm",
                    "text-amber-600"
                  )}>
                    <div className="w-2 h-2 bg-amber-500 rounded-full" />
                    Bot is not in this server or lacks permissions
                    {errors.botRefresh && (
                      <p className="text-xs text-amber-500 mt-1">{errors.botRefresh}</p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const popup = window.open(
                            "https://discord.com/oauth2/authorize?client_id=1378595955212812308&permissions=274877918208&scope=bot",
                            "discord_bot_invite",
                            "width=500,height=600,scrollbars=yes,resizable=yes"
                          )
                          if (popup) {
                            const checkClosed = setInterval(() => {
                              if (popup.closed) {
                                clearInterval(checkClosed)
                                setTimeout(async () => {
                                  if (config.guildId) {
                                    await checkBotInGuild(config.guildId)
                                  }
                                }, 1000)
                              }
                            }, 500)
                            setTimeout(() => {
                              clearInterval(checkClosed)
                            }, 300000)
                          }
                        }}
                      >
                        Add Bot
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (config.guildId) {
                            await checkBotInGuild(config.guildId)
                          }
                        }}
                      >
                        Refresh
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "email-autocomplete":
        return (
          <div className="space-y-2">
            {renderLabel()}
            <div className="flex gap-2 w-full">
              <div className="flex-1 relative">
                <EmailAutocomplete
                  value={value}
                  onChange={handleEmailAutocompleteChange}
                  placeholder={loadingDynamic ? "Loading..." : field.placeholder}
                  disabled={loadingDynamic}
                  suggestions={dynamicOptions[field.dynamic] || []}
                  multiple={true}
                  isLoading={!!loadingDynamic[field.name]}
                  error={dynamicErrors[field.dynamic] || (!loadingDynamic && (!dynamicOptions[field.dynamic] || dynamicOptions[field.dynamic].length === 0) ? "Unable to load email suggestions. Please check your Gmail integration." : undefined)}
                  className={cn(
                    "flex-1", 
                    hasError && "border-red-500",
                    loadingDynamic && "bg-muted/50 cursor-not-allowed"
                  )}
                />
              </div>
              {!field.readonly && !loadingDynamic && (
                <VariablePicker
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  onVariableSelect={handleVariableSelect}
                  fieldType={field.type}
                  trigger={
                    <Button size="sm" className="flex-shrink-0 px-3 h-10 bg-gradient-to-r from-purple-400 to-purple-600 hover:from-purple-500 hover:to-purple-700 text-white border-0 shadow-sm" title="Insert variable">
                      <span className="text-sm font-mono">{`{}`}</span>
                    </Button>
                  }
                />
              )}
            </div>
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "combobox":
        // Special case for Slack addPeople field
        if (nodeInfo?.type === "slack_action_create_channel" && field.name === "addPeople") {
          const slackPeopleOptions = field.dynamic ? dynamicOptions[field.name] || [] : field.options || [];
          const emailsArray = Array.isArray(value)
            ? value
            : (typeof value === "string" && value ? value.split(",").map(e => e.trim()).filter(Boolean) : []);
          return (
            <div className="space-y-2">
              {renderLabel()}
              {slackUserFetchError && (
                <div className="text-red-500 text-xs flex items-center gap-2">
                  {slackUserFetchError}
                  <button type="button" className="underline" onClick={() => { setSlackUserFetchError(null); fetchDynamicData(); }}>Retry</button>
                </div>
              )}
              <SlackEmailInviteMultiCombobox
                value={emailsArray}
                onChange={emails => {
                  setConfig(prev => ({
                    ...prev,
                    [field.name]: emails
                  }))
                }}
                options={slackPeopleOptions.map((option) => ({
                  value: typeof option === 'string' ? option : option.value,
                  label: typeof option === 'string' ? option : option.label,
                  description: typeof option === 'object' && 'description' in option && typeof option.description === 'string' ? option.description : undefined
                }))}
                placeholder={loadingDynamic ? "Loading..." : field.placeholder || "Enter a name or email"}
                disabled={loadingDynamic}
              />
              {hasError && (
                <p className="text-xs text-red-500">{errors[field.name]}</p>
              )}
            </div>
          );
        }

      default:
        return (
          <div className="space-y-2">
            {renderLabel()}
            <Input
              value={value}
              onChange={handleChange}
              placeholder={field.placeholder}
              readOnly={field.readonly}
              className={cn(
                "w-full", 
                hasError && "border-red-500",
                field.readonly && "bg-muted/50 cursor-not-allowed"
              )}
              autoComplete="new-password"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              data-dashlane-ignore="true"
              name={`custom-field-${Math.random().toString(36).substr(2, 9)}`}
            />
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )
    }
  }

  const renderDataFlowPanel = (title: string, data: any, type: 'input' | 'output', isStoredData = false) => {
    if (!data) return null

    return (
      <div className={cn(
        "flex-1 bg-background border-l border-border overflow-hidden",
        type === 'input' ? "border-r-0" : "border-l-0"
      )}>
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
            <h3 className="text-sm font-semibold text-foreground">
              {title}
            </h3>
            <div className="flex items-center gap-2">
              {isStoredData && (
                <div className="flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-amber-100 text-amber-700">
                  <Clock className="w-3 h-3" />
                  Cached
                </div>
              )}
              <div className={cn(
                "px-2 py-1 text-xs rounded-full",
                type === 'input' 
                  ? "bg-blue-100 text-blue-700" 
                  : "bg-green-100 text-green-700"
              )}>
                {type === 'input' ? 'Input' : 'Output'}
              </div>
            </div>
          </div>
          
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-3">
              <div className="bg-muted/50 rounded-lg p-3">
                <pre className="text-xs text-foreground whitespace-pre-wrap break-words">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
              
              {/* Show execution status for stored data */}
              {isStoredData && nodeTestResult && (
                <div className={cn(
                  "text-xs px-2 py-1 rounded",
                  nodeTestResult.success 
                    ? "bg-green-100 text-green-800" 
                    : "bg-red-100 text-red-800"
                )}>
                  {nodeTestResult.success 
                    ? `✓ Executed successfully (Step ${nodeTestResult.executionOrder})`
                    : `✗ Failed: ${nodeTestResult.error}`}
                </div>
              )}
              
              {type === 'output' && nodeInfo?.outputSchema && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Available Fields:
                  </div>
                  <div className="space-y-1">
                    {nodeInfo.outputSchema.map((field, outputFieldIndex) => (
                      <div key={`output-field-${outputFieldIndex}-${field.name}`} className="text-xs border rounded p-2 bg-background">
                        <div className="font-medium text-foreground">
                          {field.label} ({field.type})
                        </div>
                        <div className="text-muted-foreground">
                          {field.description}
                        </div>
                        {field.example && (
                          <div className="text-blue-600 font-mono mt-1">
                            Example: {typeof field.example === 'object' 
                              ? JSON.stringify(field.example) 
                              : field.example}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    )
  }

  if (!nodeInfo) return null

  // Find the configSchema fields for Notion database creation
  const isNotionDatabaseNode = nodeInfo?.type === "notion_action_create_database"
  let notionConfigFields: any[] = []
  let notionCustomConfig: any = {}
  if (isNotionDatabaseNode && nodeInfo?.configSchema) {
    // Group all custom fields for Notion database config
    notionConfigFields = nodeInfo.configSchema.filter(f => !["properties","views","icon","cover"].includes(f.name))
    notionCustomConfig = {
      properties: config.properties || [],
      views: config.views || [],
      icon: config.icon || {},
      cover: config.cover || {},
    }
  }

  // Helper: Fetch Slack users for workspace
  const fetchSlackUsers = async (workspaceId: string, userId: string) => {
    const res = await fetch("/api/integrations/slack/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, userId })
    })
    const data = await res.json()
    return data.success ? data.users : []
  }

  // Helper: Check if user is admin in workspace
  const fetchSlackAdminStatus = async (workspaceId: string, userId: string) => {
    const res = await fetch("/api/integrations/slack/admin-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, userId })
    })
    const data = await res.json()
    return data.success ? data.is_admin : false
  }

  // Helper: Slack template preview

  // Add a state for Slack user fetch error
  const [slackUserFetchError, setSlackUserFetchError] = React.useState<string | null>(null);

  // In the effect or callback that fetches Slack users, catch timeout errors and set the error state
  // Example (pseudo):
  // try { await fetchSlackUsers(); setSlackUserFetchError(null); } catch (e) { if (e.message.includes('timeout')) setSlackUserFetchError('Fetching Slack users timed out. Please try again.'); }

  // In the UI where Slack users are fetched (e.g., addPeople field), show the error and a retry button
  // Example:
  {slackUserFetchError && (
    <div className="text-red-500 text-xs flex items-center gap-2">
      {slackUserFetchError}
      <button type="button" className="underline" onClick={() => { setSlackUserFetchError(null); fetchDynamicData(); }}>Retry</button>
    </div>
  )}

  // Fetch Slack workspace plan when workspace changes (for Slack Create Channel modal)
  useEffect(() => {
    console.log("🔍 useEffect triggered for workspace plan:", { 
      nodeType: nodeInfo?.type, 
      workspace: config.workspace,
      isOpen: isOpen
    });
    
    async function fetchSlackWorkspacePlan() {
      console.log("🔍 fetchSlackWorkspacePlan called with:", { 
        nodeType: nodeInfo?.type, 
        workspace: config.workspace,
        isSlackAction: nodeInfo?.type === "slack_action_create_channel"
      });
      
      if (nodeInfo?.type === "slack_action_create_channel" && config.workspace) {
        console.log("🔍 Fetching Slack workspace plan for:", config.workspace);
        setSlackPlanLoading(true);
        setSlackPlanError(null);
        setRateLimitError(null);
        try {
          const res = await fetch("/api/integrations/slack/workspace-plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspaceId: config.workspace }),
          });
          if (!res.ok) {
            if (res.status === 429) {
              setRateLimitError("Slack API rate limit reached. Please wait a minute before trying again.");
              setRefreshCooldown(60);
            }
            throw new Error(`HTTP error! status: ${res.status}`);
          }
          const data = await res.json();
          console.log("🔍 Received workspace plan:", data.plan);
          const isSlackPro = ["pro", "business", "enterprise"].includes(data.plan);
          console.log("🔍 isSlackPro:", isSlackPro);
          setConfig(prev => ({
            ...prev,
            isSlackPro
          }));
        } catch (e) {
          console.error("Failed to fetch Slack workspace plan:", e);
          setSlackPlanError("Failed to check workspace plan. Assuming free plan.");
          setConfig(prev => ({ ...prev, isSlackPro: false }));
          if (rateLimitError) setRefreshCooldown(60);
        } finally {
          setSlackPlanLoading(false);
        }
      } else {
        console.log("🔍 Not fetching workspace plan - conditions not met");
      }
    }
    fetchSlackWorkspacePlan();
    // Only run when workspace or node type changes
  }, [config.workspace, nodeInfo?.type]);

  useEffect(() => {
    async function refreshSlackProviderPlanAndIntegration() {
      if (
        isOpen &&
        nodeInfo?.type === "slack_action_create_channel" &&
        config.workspace
      ) {
        try {
          // Get current user ID
          const user = await getUser();
          if (!user?.id) return;
          // Call refresh-plan API
          await fetch("/api/integrations/slack/refresh-plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.id, workspaceId: config.workspace }),
          });
          // Reload integration data from store
          await loadIntegrationData("slack", config.workspace, { forceRefresh: true });
        } catch (err) {
          console.error("Failed to refresh Slack provider plan:", err);
        }
      }
    }
    refreshSlackProviderPlanAndIntegration();
    // Only run when modal opens, workspace changes, or node type changes
  }, [isOpen, config.workspace, nodeInfo?.type]);

  // Add state for preview modal
  const [previewTemplate, setPreviewTemplate] = useState<string | null>(null);
  const [refreshCooldown, setRefreshCooldown] = useState(0);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);

  // Cooldown timer for refresh
  useEffect(() => {
    if (refreshCooldown > 0) {
      const timer = setTimeout(() => setRefreshCooldown(refreshCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [refreshCooldown]);

  return (
    <TooltipProvider>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent 
          className={cn(
            "max-w-7xl w-full max-h-[95vh] p-0 gap-0 overflow-hidden rounded-b-none",
            showDataFlowPanels && "max-w-[98vw]"
          )}
        >
          <div className="flex h-full">
            {/* Left Data Flow Panel - Input */}
            {showDataFlowPanels && (
              <div className="w-80 bg-muted/30 border-r border-border">
                {segmentTestResult ? (
                  renderDataFlowPanel(
                    "Workflow Input", 
                    segmentTestResult.targetNodeInput,
                    'input',
                    false
                  )
                ) : nodeTestData ? (
                  renderDataFlowPanel(
                    "Node Input", 
                    nodeTestData.input,
                    'input',
                    true
                  )
                ) : null}
              </div>
            )}

            {/* Main Configuration Content */}
            <div className="flex-1 flex flex-col min-w-0 max-w-full">
              <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-lg font-semibold">
                    Configure {nodeInfo.title || nodeInfo.type}
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    Configuration settings for {nodeInfo.title || nodeInfo.type}
                  </DialogDescription>
                  
                  {/* Test Button in Top Right */}
                  <div className="flex items-center gap-2">
                    {nodeInfo?.testable && workflowData && currentNodeId && !currentNodeId.startsWith('pending-') && (
                      <Button 
                        variant="secondary"
                        size="sm"
                        onClick={handleTestWorkflowSegment}
                        disabled={isSegmentTestLoading}
                        className="gap-2"
                      >
                        {isSegmentTestLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Testing...
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4" />
                            Test
                          </>
                        )}
                      </Button>
                    )}
                    
                    {/* Show data panels button for nodes with cached test data */}
                    {!showDataFlowPanels && nodeTestData && isInExecutionPath && (
                      <Button 
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDataFlowPanels(true)}
                        className="gap-2"
                      >
                        <TestTube className="w-4 h-4" />
                        Show Data
                      </Button>
                    )}
                    
                    {showDataFlowPanels && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowDataFlowPanels(false)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
                
                {/* Test Status */}
                {showDataFlowPanels && (
                  <div className="space-y-2 mt-3">
                    {segmentTestResult && (
                      <div className={cn(
                        "text-sm px-3 py-2 rounded-md",
                        segmentTestResult.success 
                          ? "bg-green-100 text-green-800" 
                          : "bg-red-100 text-red-800"
                      )}>
                        {segmentTestResult.success 
                          ? `✓ Test successful - Executed ${segmentTestResult.executionPath?.length || 0} nodes`
                          : `✗ Test failed: ${segmentTestResult.error}`}
                      </div>
                    )}
                    
                    {!segmentTestResult && nodeTestData && (
                      <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-md bg-blue-100 text-blue-800">
                        <TestTube className="w-4 h-4" />
                        <span>Showing cached test data from previous workflow execution</span>
                        {testTimestamp && (
                          <span className="text-xs opacity-75">
                            • {new Date(testTimestamp).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </DialogHeader>

              {/* Configuration Form */}
              <ScrollArea className="flex-1 max-h-[70vh] overflow-x-hidden">
                <div className="px-6 py-4 space-y-6 w-full max-w-full">
                  {/* Integration Error */}
                  {errors.integrationError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm text-red-700">{errors.integrationError}</p>
                          {errors.integrationError.includes('reconnect') && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2"
                              onClick={() => {
                                // Trigger reconnection for the current integration
                                const integration = getIntegrationByProvider(nodeInfo?.providerId || "")
                                if (integration) {
                                  // Use the integration store's reconnect function
                                  const { reconnectIntegration } = useIntegrationStore.getState()
                                  reconnectIntegration(integration.id)
                                }
                              }}
                            >
                              Reconnect {nodeInfo?.providerId || 'Integration'}
                            </Button>
                          )}
                          {!errors.integrationError.includes('reconnect') && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2"
                              onClick={() => {
                                // Clear the error and retry loading data
                                setErrors(prev => {
                                  const newErrors = { ...prev }
                                  delete newErrors.integrationError
                                  return newErrors
                                })
                                // Retry loading dynamic data
                                fetchDynamicData()
                              }}
                            >
                              Retry
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {nodeInfo?.type === "onedrive_action_upload_file" && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <p className="text-sm text-blue-800">
                        <strong>Tip:</strong> You can either enter text content to create a text file, or upload existing files. 
                        If you upload files, the file name field will be automatically populated:
                      </p>
                      <ul className="text-sm text-blue-800 mt-1 ml-4 list-disc">
                        <li>Single file: Uses the uploaded file's name</li>
                        <li>Multiple files: Uses the first file's name (without extension) as a base name</li>
                        <li>Auto-population only occurs if you haven't manually entered a file name</li>
                        <li>You can always edit the file name manually if needed</li>
                      </ul>
                    </div>
                  )}
                  
                  {nodeInfo?.type === "dropbox_action_upload_file" && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <p className="text-sm text-blue-800">
                        <strong>Tip:</strong> You can either enter text content to create a text file, or upload existing files. 
                        If you upload files, the file name field will be automatically populated:
                      </p>
                      <ul className="text-sm text-blue-800 mt-1 ml-4 list-disc">
                        <li>Single file: Uses the uploaded file's name</li>
                        <li>Multiple files: Uses the first file's name (without extension) as a base name</li>
                        <li>Auto-population only occurs if you haven't manually entered a file name</li>
                        <li>You can always edit the file name manually if needed</li>
                      </ul>
                    </div>
                  )}
                  
                  {nodeInfo?.type === "onedrive_action_upload_file_from_url" && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <p className="text-sm text-blue-800">
                        <strong>Tip:</strong> When you enter a file URL, the file name field will be automatically populated with the filename from the URL:
                      </p>
                      <ul className="text-sm text-blue-800 mt-1 ml-4 list-disc">
                        <li>The filename is extracted from the URL path (e.g., "document.pdf" from "https://example.com/files/document.pdf")</li>
                        <li>For OneDrive URLs, it extracts the file ID and creates a descriptive name</li>
                        <li>Auto-population only occurs if you haven't manually entered a file name</li>
                        <li><strong>Filename Priority:</strong> If you enter a filename in the textbox, it will be used. If you leave it blank, the original filename from the URL will be used.</li>
                        <li>You can always edit the file name manually if needed</li>
                        <li>If no filename can be extracted, it will default to "downloaded-file"</li>
                      </ul>
                    </div>
                  )}
                  
                  {nodeInfo?.type === "dropbox_action_upload_file_from_url" && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <p className="text-sm text-blue-800">
                        <strong>Tip:</strong> When you enter a file URL, the file name field will be automatically populated with the filename from the URL:
                      </p>
                      <ul className="text-sm text-blue-800 mt-1 ml-4 list-disc">
                        <li>The filename is extracted from the URL path (e.g., "document.pdf" from "https://example.com/files/document.pdf")</li>
                        <li>For Dropbox URLs, it extracts the file ID and creates a descriptive name</li>
                        <li>Auto-population only occurs if you haven't manually entered a file name</li>
                        <li><strong>Filename Priority:</strong> If you enter a filename in the textbox, it will be used. If you leave it blank, the original filename from the URL will be used.</li>
                        <li>You can always edit the file name manually if needed</li>
                        <li>If no filename can be extracted, it will default to "downloaded-file"</li>
                      </ul>
                    </div>
                  )}

                  {/* Gmail Fetch Message Basic/Advanced Tabs */}
                  {nodeInfo?.type === "gmail_action_search_email" && (
                    <>
                      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mb-6">
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="basic">Basic</TabsTrigger>
                          <TabsTrigger value="advanced">Advanced</TabsTrigger>
                        </TabsList>
                      </Tabs>
                      
                      {activeTab === "basic" && (
                        <div className="mb-3 text-sm text-muted-foreground">
                          Configure basic settings for fetching Gmail messages. Use the Advanced tab for more specialized options.
                        </div>
                      )}
                      
                      {activeTab === "advanced" && (
                        <div className="mb-3 text-sm text-muted-foreground">
                          Configure advanced settings for the Gmail API request. These options provide more control over message retrieval.
                        </div>
                      )}
                      
                      {activeTab === "basic" && (
                        <div className="flex justify-end mb-6">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="gap-2"
                            onClick={handlePreview}
                            disabled={previewLoading}
                          >
                            {previewLoading ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading...
                              </>
                            ) : (
                              <>
                                <Eye className="h-4 w-4" />
                                Load Sample
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                      

                    </>
                  )}

                  {/* Configuration Fields */}
                  {isNotionDatabaseNode ? (
                    <>
                      {notionConfigFields.map((field, idx) => (
                        <div key={`notion-config-field-${field.name}-${idx}`} className="flex flex-col space-y-3 pb-4 border-b border-border/50 last:border-b-0 last:pb-0">
                          {renderField(field)}
                        </div>
                      ))}
                      {/* Render the NotionDatabaseConfig tabbed editor ONCE for all custom fields */}
                      <div className="flex flex-col space-y-3 pb-4 border-b border-border/50 last:border-b-0 last:pb-0">
                        <NotionDatabaseConfig
                          value={notionCustomConfig}
                          onChange={(newValue: any) => setConfig(prev => ({
                            ...prev,
                            properties: newValue.properties,
                            views: newValue.views,
                            icon: newValue.icon,
                            cover: newValue.cover,
                          }))}
                          fieldName="notionDatabaseConfig"
                        />
                      </div>
                    </>
                  ) : (
                    // Default: render all fields as before
                    nodeInfo?.configSchema?.map((field, configFieldIndex) => {
                      if (!shouldShowField(field)) return null
                      return (
                        <div key={`config-field-${configFieldIndex}-${field.name}`} className="flex flex-col space-y-3 pb-4 border-b border-border/50 last:border-b-0 last:pb-0">
                          {renderField(field)}
                        </div>
                      )
                    })
                  )}
                  
                  {/* Data Preview Table for Google Sheets Actions */}
                  {((nodeInfo?.type === "google_sheets_unified_action" && config.action && config.spreadsheetId && config.sheetName) || 
                    (nodeInfo?.type === "google-sheets_action_create_row" && config.spreadsheetId && config.sheetName) ||
                    (nodeInfo?.type === "google_sheets_action_read_data" && config.readMode && config.spreadsheetId && config.sheetName) ||
                    (nodeInfo?.providerId === "google-sheets" && nodeInfo?.type !== "google_sheets_unified_action" && nodeInfo?.type !== "google-sheets_action_create_row" && nodeInfo?.type !== "google_sheets_action_read_data" && config.spreadsheetId && config.sheetName)) && 
                   dynamicOptions.sheetData && (dynamicOptions.sheetData as any).headers && Array.isArray((dynamicOptions.sheetData as any).headers) && (dynamicOptions.sheetData as any).data && Array.isArray((dynamicOptions.sheetData as any).data) && (
                    <div className="space-y-3 border-b pb-4">
                      <div className="text-sm font-medium">
                        {nodeInfo?.type === "google_sheets_unified_action" 
                          ? `Data Preview for ${config.action} action:`
                          : nodeInfo?.type === "google-sheets_action_create_row"
                          ? "Select a row to insert relative to:"
                          : nodeInfo?.type === "google_sheets_action_read_data"
                          ? config.readMode === "rows"
                            ? "Select rows to read:"
                            : config.readMode === "cells"
                              ? "Select cells to read:"
                              : config.readMode === "range"
                                ? "Select a range to read:"
                                : "Data Preview:"
                          : "Data Preview:"}
                        {loadingDynamic && <span className="text-muted-foreground ml-2">(Loading...)</span>}
                      </div>
                      
                      <div className="border rounded-lg overflow-hidden select-none" style={{ userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}>
                        {/* Header Row */}
                        <div className="grid gap-2 p-2 bg-muted/50 select-none" style={{ 
                          gridTemplateColumns: `repeat(${(dynamicOptions.sheetData as any).headers.length}, minmax(120px, 1fr))`,
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          MozUserSelect: 'none',
                          msUserSelect: 'none'
                        }}>
                          {(dynamicOptions.sheetData as any).headers.map((header: any, index: number) => (
                            <div key={`header-${index}-${header.column || index}`} className="text-xs font-medium text-center p-1 select-none" style={{ userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}>
                                <div className="font-mono bg-background px-2 py-1 rounded mb-1">
                                  {header.column}
                                </div>
                                <div className="truncate">{header.name}</div>
                            </div>
                          ))}
                        </div>
                        
                        {/* Data Rows */}
                        <div className="max-h-80 overflow-y-auto">
                          {(dynamicOptions.sheetData as any).data.map((row: any, index: number) => (
                            <div 
                              key={`row-${index}-${row.rowIndex || index}`} 
                              className={`grid gap-2 p-2 border-t select-none ${
                                (nodeInfo?.type === "google_sheets_unified_action" && config.action !== "add") ||
                                nodeInfo?.type === "google-sheets_action_create_row" ||
                                (nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "rows")
                                  ? `cursor-pointer hover:bg-muted/50 ${
                                      (nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "rows"
                                        ? (config.selectedRows || []).some((r: any) => r.rowIndex === row.rowIndex)
                                        : config.selectedRow?.rowIndex === row.rowIndex)
                                        ? "bg-primary/10 border border-primary" 
                                        : "border border-transparent"
                                    }`
                                  : "border border-transparent"
                              }`}
                              style={{ 
                                gridTemplateColumns: `repeat(${(dynamicOptions.sheetData as any).headers.length}, minmax(120px, 1fr))`,
                                userSelect: 'none',
                                WebkitUserSelect: 'none',
                                MozUserSelect: 'none',
                                msUserSelect: 'none'
                              }}
                              onClick={() => {
                                if (nodeInfo?.type === "google_sheets_unified_action" && config.action !== "add") {
                                  // For update action, populate column values with current row data
                                  if (config.action === "update") {
                                    const columnValues: Record<string, string> = {}
                                    row.values.forEach((value: string, index: number) => {
                                      const header = (dynamicOptions.sheetData as any).headers[index]
                                      if (header) {
                                        columnValues[header.column] = value || ""
                                      }
                                    })
                                    setConfig(prev => ({
                                      ...prev,
                                      selectedRow: row,
                                      columnValues: columnValues
                                    }))
                                  } else {
                                    // For delete action, just select the row
                                    setConfig(prev => ({
                                      ...prev,
                                      selectedRow: row
                                    }))
                                  }
                                } else if (nodeInfo?.type === "google-sheets_action_create_row") {
                                  // For create row action, just select the row
                                  setConfig(prev => ({
                                    ...prev,
                                    selectedRow: row
                                  }))
                                } else if (nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "rows") {
                                  // For read data rows mode, toggle row selection
                                  const currentSelectedRows = config.selectedRows || []
                                  const isSelected = currentSelectedRows.some((r: any) => r.rowIndex === row.rowIndex)
                                  
                                  const newSelectedRows = isSelected
                                    ? currentSelectedRows.filter((r: any) => r.rowIndex !== row.rowIndex)
                                    : [...currentSelectedRows, row]
                                  
                                  setConfig(prev => ({
                                    ...prev,
                                    selectedRows: newSelectedRows
                                  }))
                                }
                              }}
                            >
                              {row.values.map((cell: string, cellIndex: number) => (
                                <div 
                                  key={`cell-${index}-${cellIndex}`} 
                                  className={`text-sm truncate p-1 select-none ${
                                    nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "range"
                                      ? `cursor-crosshair ${
                                          selectedRange && isCellInRange(index, cellIndex, selectedRange)
                                            ? "bg-blue-500 text-white"
                                            : isDragging && dragStart && dragEnd
                                              ? isCellInRange(index, cellIndex, { start: dragStart, end: dragEnd })
                                                ? "bg-blue-300"
                                                : ""
                                              : ""
                                        }`
                                      : nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "cells"
                                        ? `cursor-pointer ${
                                            isCellSelected(index, cellIndex)
                                              ? "bg-green-200 text-green-900"
                                              : "hover:bg-green-100 hover:text-black"
                                          }`
                                        : ""
                                  }`}
                                  onMouseDown={() => handleMouseDown(index, cellIndex)}
                                  onMouseEnter={() => handleMouseEnter(index, cellIndex)}
                                  onClick={() => handleCellClick(index, cellIndex)}
                                  style={{ userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}
                                >
                                  {cell || ""}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {nodeInfo?.type === "google_sheets_unified_action" && config.action === "delete" && config.selectedRow && (
                        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                          ⚠️ Row selected for deletion!
                        </div>
                      )}
                      
                      {nodeInfo?.type === "google-sheets_action_create_row" && config.selectedRow && (
                        <div className="text-sm text-blue-600 bg-blue-50 p-2 rounded">
                          ✓ Row selected! New row will be inserted {config.insertPosition === "above" ? "above" : config.insertPosition === "below" ? "below" : "at the end of"} the selected row.
                        </div>
                      )}
                      
                      {nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "rows" && config.selectedRows && Array.isArray(config.selectedRows) && config.selectedRows.length > 0 && (
                        <div className="text-sm text-green-600 bg-green-50 p-2 rounded">
                          ✓ {config.selectedRows.length} row(s) selected for reading!
                        </div>
                      )}
                      
                      {nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "cells" && config.selectedCells && Array.isArray(config.selectedCells) && config.selectedCells.length > 0 && (
                        <div className="text-sm text-green-600 bg-green-50 p-2 rounded">
                          ✓ {config.selectedCells.length} cell(s) selected for reading!
                        </div>
                      )}

                      {nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "range" && config.range && (
                        <div className="text-sm text-blue-600 bg-blue-50 p-2 rounded">
                          ✓ Range selected: {config.range}
                          {isDragging && (
                            <span className="ml-2 text-blue-500">
                              (Drag to adjust selection)
                            </span>
                          )}
                        </div>
                      )}

                      {nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "range" && !config.range && (
                        <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                          💡 Click and drag to select a range of cells
                        </div>
                      )}

                      {nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "cells" && (!config.selectedCells || config.selectedCells.length === 0) && (
                        <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                          💡 Click on cells to select them for reading
                        </div>
                      )}

                      {/* Column Input Fields for Add and Update Actions */}
                      {((nodeInfo?.type === "google_sheets_unified_action" && (config.action === "add" || (config.action === "update" && config.selectedRow))) ||
                        (nodeInfo?.type === "google-sheets_action_create_row")) && dynamicOptions.sheetData && (dynamicOptions.sheetData as any).headers && Array.isArray((dynamicOptions.sheetData as any).headers) && (
                        <div className="space-y-3 border-b pb-4">
                          <div className="text-sm font-medium">
                            {nodeInfo?.type === "google-sheets_action_create_row" 
                              ? "Enter values for the new row:"
                              : config.action === "add" 
                                ? "Enter values for each column:" 
                                : "Edit values for the selected row:"}
                          </div>
                          
                          <div className="space-y-3">
                            {(dynamicOptions.sheetData as any).headers.map((header: any, index: number) => (
                              <div key={`column-input-${index}-${header.column || index}`} className="flex flex-col space-y-2">
                                <Label className="text-sm font-medium">
                                  {header.name} ({header.column})
                                </Label>
                                <Input
                                  value={config.columnValues?.[header.column] || ""}
                                  onChange={(e) => {
                                    setConfig(prev => ({
                                      ...prev,
                                      columnValues: {
                                        ...prev.columnValues,
                                        [header.column]: e.target.value
                                      }
                                    }))
                                  }}
                                  placeholder={`Enter value for ${header.name}`}
                                  className="w-full"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Discord Bot Connection Hint */}
                  {nodeInfo?.type === "discord_action_send_message" && config.guildId && !botStatus[config.guildId] && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm text-amber-700">
                            <strong>Bot Required:</strong> You need to add the Discord bot to your server before you can send messages to channels. 
                            The bot needs permission to view channels and send messages.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Preview Functionality */}
                  {(nodeInfo?.type === "discord_action_fetch_messages" || 
                    nodeInfo?.type === "notion_action_search_pages") && (
                    <div className="space-y-3 border-t pt-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">Preview Results</div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handlePreview}
                          disabled={previewLoading}
                        >
                          {previewLoading ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            <>
                              <Eye className="w-4 h-4 mr-2" />
                              Load Preview
                            </>
                          )}
                        </Button>
                      </div>

                      {previewError && (
                        <div className="text-sm text-red-600 bg-red-50 p-3 rounded border">
                          {previewError}
                        </div>
                      )}

                      {previewData && (
                        <div className="space-y-2">
                          {nodeInfo?.type === "discord_action_fetch_messages" && (
                            <DiscordMessagesPreview messages={previewData.messages || []} />
                          )}
                          {nodeInfo?.type === "notion_action_search_pages" && (
                            <NotionRecordsPreview 
                              records={previewData.pages || []} 
                              columns={["title", "url", "object", "last_edited_time"]} 
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Gmail Message Preview */}
                  {nodeInfo?.type === "gmail_action_search_email" && (
                    <div className="space-y-3 border-t pt-4 mt-6 w-full max-w-full">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">Sample Messages</div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handlePreview}
                          disabled={previewLoading}
                        >
                          {previewLoading ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            <>
                              <Eye className="w-4 h-4 mr-2" />
                              Load Sample
                            </>
                          )}
                        </Button>
                      </div>

                      {previewError && (
                        <div className="text-sm text-red-600 bg-red-50 p-3 rounded border">
                          {previewError}
                        </div>
                      )}

                      {!previewData && !previewError && (
                        <div className="text-sm text-muted-foreground bg-muted/30 p-4 rounded border flex flex-col items-center justify-center">
                          <div className="mb-2">
                            <Mail className="w-8 h-8 text-muted-foreground/50" />
                          </div>
                          <p>No data yet. Run your workflow or use "Load Sample" to preview results.</p>
                        </div>
                      )}

                      {previewData && (
                        <div className="w-full border rounded-lg overflow-hidden">
                          <div className="max-h-[400px] overflow-y-auto overflow-x-hidden">
                            <GmailEmailsPreview 
                              emails={previewData.emails || []} 
                              fieldsMask={config.fieldsMask}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Dialog Footer */}
              <DialogFooter className="px-6 py-4 border-t border-border flex-shrink-0 bg-background sticky bottom-0 left-0 right-0">
                <div className="flex items-center justify-between w-full">
                  <Button variant="outline" onClick={() => onClose(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSave}
                    disabled={loadingDynamic}
                  >
                    {loadingDynamic ? "Loading..." : "Save Configuration"}
                  </Button>
                </div>
              </DialogFooter>
            </div>

            {/* Right Data Flow Panel - Output */}
            {showDataFlowPanels && (
              <div className="w-80 bg-muted/30 border-l border-border">
                {segmentTestResult ? (
                  renderDataFlowPanel(
                    "Node Output", 
                    segmentTestResult.targetNodeOutput,
                    'output',
                    false
                  )
                ) : nodeTestData ? (
                  renderDataFlowPanel(
                    "Node Output", 
                    nodeTestData.output,
                    'output',
                    true
                  )
                ) : null}
              </div>
            )}
          </div>
          
          {/* Loading Overlay with double loading prevention */}
          {(() => {
            // Debug loading states
            console.log('🔍 ConfigurationModal Loading states:', {
              loadingDynamic,
              hasShownLoading,
              retryCount,
              nodeInfoType: nodeInfo?.type,
              integrationName
            })

            // Use a more robust loading condition that prevents double loading
            const shouldShowLoading = () => {
              // Debug current loading state
              console.log('🔍 shouldShowLoading check:', {
                loadingDynamic,
                hasShownLoading,
                activeTasks: Array.from(activeLoadingTasksRef.current),
                nodeInfoType: nodeInfo?.type,
                isDiscordAction: nodeInfo?.type === "discord_action_send_message",
                checkingBot,
                hasGuildId: !!config.guildId,
                hasChannels: !!dynamicOptions.discord_channels
              })
              
              // If we're not in a loading state, don't show loading
              if (!loadingDynamic) {
                return false
              }
              
              // If we've already shown loading and we're still loading, continue showing it
              if (hasShownLoading && loadingDynamic) {
                return true
              }
              
              // For Discord actions, be more specific about when to show loading
              if (nodeInfo?.type === "discord_action_send_message") {
                // Only show loading if we have active loading tasks
                const hasActiveTasks = activeLoadingTasksRef.current.size > 0
                
                // If we have guilds loaded and no active tasks, don't show loading
                const hasGuilds = dynamicOptions.guildId && dynamicOptions.guildId.length > 0
                
                if (hasGuilds && !hasActiveTasks) {
                  // Force clear loading state if we have guilds but no active tasks
                  if (loadingDynamic) {
                    setTimeout(() => {
                      setLoadingDynamic(false)
                      setHasShownLoading(false)
                      loadingStateRef.current = false
                    }, 0)
                  }
                  return false
                }
                
                return hasActiveTasks
              }
              
              // For other integrations, show loading if we're in a loading state
              return loadingDynamic
            }

            const isLoading = shouldShowLoading()
            
            if (isLoading) {
              console.log('🔄 ConfigurationModal Showing loading screen due to:', {
                loadingDynamic,
                hasShownLoading,
                nodeInfoType: nodeInfo?.type,
                isDiscordAction: nodeInfo?.type === "discord_action_send_message",
                hasGuildId: !!config.guildId,
                hasChannels: !!dynamicOptions.discord_channels,
                checkingBot
              })
              
              return (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center z-50">
                  <ConfigurationLoadingScreen 
                    integrationName={nodeInfo.title || nodeInfo.type || integrationName}
                  />
                  {retryCount > 0 && (
                    <div className="mt-4 text-sm text-muted-foreground animate-pulse">
                      Retrying... (attempt {retryCount + 1})
                    </div>
                  )}
                </div>
              )
            }
            
            return null
          })()}
        </DialogContent>
      </Dialog>
      {/* Preview Modal */}
      {previewTemplate && (
        <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Pro Template Preview</DialogTitle>
              <DialogDescription>
                This is a preview of the <b>{previewTemplate}</b> template. Upgrade to Slack Pro to use this template.
              </DialogDescription>
            </DialogHeader>
            {/* Example preview content, can be replaced with real template details */}
            <div className="p-4 bg-muted rounded-md">
              <p>Example workflow, fields, and features for <b>{previewTemplate}</b>...</p>
            </div>
            <div className="flex justify-end mt-4">
              <a
                href="https://slack.com/plans"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline hover:text-blue-800"
              >
                Upgrade to Slack Pro
              </a>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </TooltipProvider>
  )
}
