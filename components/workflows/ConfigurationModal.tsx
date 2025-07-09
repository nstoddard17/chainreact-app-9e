"use client"

import { useState, useEffect, useRef, useCallback } from "react"
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
import { ConfigurationLoadingScreen } from "@/components/ui/loading-screen"
import { FileUpload } from "@/components/ui/file-upload"
import { DatePicker } from "@/components/ui/date-picker"
import { TimePicker } from "@/components/ui/time-picker"
import { Play, X, Loader2, TestTube, Clock, HelpCircle, AlertCircle, Video, ChevronLeft, ChevronRight, Database, Calendar, Upload } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { EnhancedTooltip } from "@/components/ui/enhanced-tooltip"
import { ScrollArea } from "@/components/ui/scroll-area"
import GoogleMeetCard from "@/components/ui/google-meet-card"
import VariablePicker from "./VariablePicker"
import { NotionDatabaseConfig } from "./NotionDatabaseConfig"

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
                <Button variant="outline" size="sm" className="flex-shrink-0 px-3">
                  <Database className="w-4 h-4" />
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
  onClose: () => void
  onSave: (config: Record<string, any>) => void
  nodeInfo: NodeComponent | null
  integrationName: string
  initialData?: Record<string, any>
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
}

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
  // State to control tooltip visibility
  const [tooltipsEnabled, setTooltipsEnabled] = useState(false)
  const [config, setConfig] = useState<Record<string, any>>(initialData)
  
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
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { loadIntegrationData, getIntegrationByProvider, checkIntegrationScopes, integrationData } = useIntegrationStore()
  const [dynamicOptions, setDynamicOptions] = useState<
    Record<string, { value: string; label: string; fields?: any[]; isExisting?: boolean }[]>
  >({})
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
  
  // Loading state management to prevent flashing
  const loadingStartTimeRef = useRef<number | null>(null)
  const minLoadingTimeRef = useRef<number>(1000) // Minimum 1 second loading time
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Debounced loading state setter
  const setLoadingDynamicDebounced = useCallback((loading: boolean) => {
    if (loading) {
      // Start loading
      loadingStartTimeRef.current = Date.now()
      setLoadingDynamic(true)
    } else {
      // Check if minimum loading time has passed
      const elapsed = Date.now() - (loadingStartTimeRef.current || 0)
      const remainingTime = Math.max(0, minLoadingTimeRef.current - elapsed)
      
      if (remainingTime > 0) {
        // Set a timeout to hide loading after minimum time
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current)
        }
        loadingTimeoutRef.current = setTimeout(() => {
          setLoadingDynamic(false)
          loadingStartTimeRef.current = null
          loadingTimeoutRef.current = null
        }, remainingTime)
      } else {
        // Hide loading immediately
        setLoadingDynamic(false)
        loadingStartTimeRef.current = null
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current)
          loadingTimeoutRef.current = null
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
  }, [isOpen, nodeInfo?.providerId])

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

  // Reset loading state when modal closes
  useEffect(() => {
    if (!isOpen) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      setLoadingDynamic(false)
      setRetryCount(0)
      // Reset previous dependent values when modal closes
      previousDependentValues.current = {}
      hasInitializedTimezone.current = false
      hasInitializedDefaults.current = false
      // Clear errors when modal closes
      setErrors({})
      // Reset range selection state
      setIsDragging(false)
      setDragStart(null)
      setDragEnd(null)
      setSelectedRange(null)
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
    
    setCheckingBot(true)
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
        
        // If bot is connected, fetch channels for this guild
        if (isBotPresent && nodeInfo?.type === "discord_action_send_message") {
          console.log('✅ Bot is connected, fetching channels for guild:', guildId)
          const integration = getIntegrationByProvider(nodeInfo?.providerId || "")
          if (integration) {
            try {
              // Use a direct API call to avoid triggering the loading modal
              const response = await fetch('/api/integrations/fetch-user-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  integrationId: integration.id,
                  providerId: 'discord',
                  dataType: 'discord_channels',
                  guildId: guildId
                })
              })
              
              if (response.ok) {
                const result = await response.json()
                if (result.success && result.data) {
                  const mappedChannels = result.data.map((channel: any) => ({
                    value: channel.value,
                    label: channel.name || channel.label,
                  }))
                  setDynamicOptions(prev => ({
                    ...prev,
                    "channelId": mappedChannels,
                  }))
                  console.log('✅ Channels loaded:', mappedChannels.length)
                } else {
                  console.log('⚠️ No channels found for guild:', guildId)
                }
              } else {
                console.error("Error fetching channels:", response.statusText)
              }
            } catch (error) {
              console.error("Error fetching channels:", error)
            }
          }
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

    // For now, use the existing table fields from dynamicOptions since the API doesn't support dynamic field fetching
    // In the future, this could be enhanced to make actual API calls when the backend supports it
    try {
      setLoadingDynamic(true)
      
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
      setLoadingDynamic(false)
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
    

    
    // Special logic for Discord send message action
    if (nodeInfo?.type === "discord_action_send_message") {
      // Always show guildId (server selection)
      if (field.name === "guildId") {
        return true
      }
      
      // Only show other fields if bot is connected to the selected server
      if (config.guildId && botStatus[config.guildId]) {
        return true
      }
      
      // Hide all other fields until bot is connected
      return false
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

  // Function to fetch dynamic data for dependent fields
  const fetchDependentData = useCallback(async (field: ConfigField | NodeField, dependentValue: any) => {
    if (!field.dynamic || !field.dependsOn) return
    

    
    const integration = getIntegrationByProvider(nodeInfo?.providerId || "")
    if (!integration) return

    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Create new AbortController for this request
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      setLoadingDynamic(true)
      const data = await loadIntegrationData(
        field.dynamic as string,
        integration.id,
        { [field.dependsOn]: dependentValue }
      )
      
      // Only update state if the request wasn't aborted
      if (!controller.signal.aborted && data) {
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

        setDynamicOptions(prev => ({
          ...prev,
          [field.name]: mappedData
        }))
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
        setLoadingDynamic(false)
      }
    }
  }, [config, nodeInfo?.providerId, getIntegrationByProvider, loadIntegrationData])

  const fetchDynamicData = useCallback(async () => {
    if (!nodeInfo || !nodeInfo.providerId) return

    const integration = getIntegrationByProvider(nodeInfo.providerId)
    if (!integration) {
      console.warn('⚠️ No integration found for provider:', nodeInfo.providerId)
      return
    }

    // Check if integration needs reconnection due to missing scopes
    const scopeCheck = checkIntegrationScopes(nodeInfo.providerId)
    if (scopeCheck.needsReconnection) {
      console.warn(`Integration needs reconnection: ${scopeCheck.reason}`)
      setErrors({ integrationError: `This integration needs to be reconnected to access the required permissions. Please reconnect your ${nodeInfo.providerId} integration.` })
      return
    }

    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Create new AbortController for this request
    const controller = new AbortController()
    abortControllerRef.current = controller

    setLoadingDynamicDebounced(true)
    let hasData = false
    const newOptions: Record<string, any[]> = {}

    // Collect all dynamic fields (excluding dependent fields)
    const dynamicFields = (nodeInfo.configSchema || []).filter(field => field.dynamic && !field.dependsOn)

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
    const fetchPromises = [
      ...fieldsToFetch.map(field => {
        return loadIntegrationData(field.dynamic as string, integration.id)
          .then(data => ({ field, data, error: null }))
          .catch(error => ({ field, data: null, error }))
      }),
      ...signaturesNotCached.map(sig => {
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
          }
      }
      if (hasData) {
        console.log('💾 Updating dynamic options:', {
          optionKeys: Object.keys(newOptions),
          sampleData: Object.entries(newOptions).map(([key, value]) => ({
            field: key,
            count: value.length,
            sample: value[0]
          }))
        })
        setDynamicOptions(newOptions)
      }
      setLoadingDynamicDebounced(false)
    }
  }, [nodeInfo, getIntegrationByProvider, checkIntegrationScopes, loadIntegrationData, integrationData, setLoadingDynamicDebounced])

  useEffect(() => {
    if (isOpen && nodeInfo?.providerId) {
      fetchDynamicData()
    }
  }, [isOpen, nodeInfo?.providerId, fetchDynamicData])

  // Handle dependent field updates when their dependencies change
  useEffect(() => {
    if (!isOpen || !nodeInfo) return

    console.log('🔄 Checking dependent fields:', {
      nodeType: nodeInfo.type,
      config,
      configSchema: nodeInfo.configSchema
    })

    const fetchDependentFields = async () => {
      for (const field of nodeInfo.configSchema || []) {
        if (field.dependsOn && field.dynamic) {
          const dependentValue = config[field.dependsOn]
          const previousValue = previousDependentValues.current[field.dependsOn]
          
          console.log(`🔍 Checking field dependency:`, {
            fieldName: field.name,
            dependsOn: field.dependsOn,
            currentValue: dependentValue,
            previousValue,
            dynamic: field.dynamic
          })
          
          // Only update if the dependent value has actually changed
          if (dependentValue !== previousValue) {
            console.log(`🔄 Dependent value changed for ${field.name}, fetching new data`)
            previousDependentValues.current[field.dependsOn] = dependentValue
            
            if (dependentValue) {
              await fetchDependentData(field, dependentValue)
            } else {
              console.log(`❌ No dependent value for ${field.name}, clearing options`)
              // Clear dependent field options when dependency is cleared
              setDynamicOptions(prev => {
                const newOptions = { ...prev }
                delete newOptions[field.name]
                return newOptions
              })
              // Clear dependent field value
              setConfig(prev => {
                const newConfig = { ...prev }
                delete newConfig[field.name]
                return newConfig
              })
            }
          }
        }
      }

      // Fetch project, task, and feedback records when base is selected for Airtable actions
      if (nodeInfo?.type === "airtable_action_create_record" && config.baseId) {
        const previousBaseId = previousDependentValues.current["baseId"]
        if (config.baseId !== previousBaseId) {
          console.log(`🔄 Base changed to ${config.baseId}, fetching project/task/feedback records`)
          previousDependentValues.current["baseId"] = config.baseId
          
          const integration = getIntegrationByProvider(nodeInfo.providerId || "")
          if (integration) {
            try {
              // Fetch project records
              const projectData = await loadIntegrationData("airtable_project_records", integration.id, { baseId: config.baseId })
              if (projectData && projectData.length > 0) {
                console.log(`📊 Processing Airtable project records:`, {
                  recordCount: projectData.length,
                  records: projectData.map((r: any) => ({
                    value: r.value,
                    label: r.label
                  }))
                })
                const mappedProjectRecords = projectData.map((record: any) => ({
                  value: record.value,
                  label: record.label,
                  description: record.description,
                  fields: record.fields || {}
                }))
                setDynamicOptions(prev => ({
                  ...prev,
                  "project_records": mappedProjectRecords,
                  // Also store with common field name variations
                  "Project_records": mappedProjectRecords,
                  "Projects_records": mappedProjectRecords,
                  "Associated Project_records": mappedProjectRecords,
                  "Related Project_records": mappedProjectRecords
                }))
              }

              // Fetch task records
              const taskData = await loadIntegrationData("airtable_task_records", integration.id, { baseId: config.baseId })
              if (taskData && taskData.length > 0) {
                console.log(`📋 Processing Airtable task records:`, {
                  recordCount: taskData.length,
                  records: taskData.map((r: any) => ({
                    value: r.value,
                    label: r.label
                  }))
                })
                const mappedTaskRecords = taskData.map((record: any) => ({
                  value: record.value,
                  label: record.label,
                  description: record.description,
                  fields: record.fields || {}
                }))
                setDynamicOptions(prev => ({
                  ...prev,
                  "task_records": mappedTaskRecords,
                  // Also store with common field name variations
                  "Task_records": mappedTaskRecords,
                  "Tasks_records": mappedTaskRecords,
                  "Associated Task_records": mappedTaskRecords,
                  "Related Task_records": mappedTaskRecords
                }))
              }

              // Fetch feedback records
              const feedbackData = await loadIntegrationData("airtable_feedback_records", integration.id, { baseId: config.baseId })
              if (feedbackData && feedbackData.length > 0) {
                const mappedFeedbackRecords = feedbackData.map((record: any) => ({
                  value: record.value,
                  label: record.label,
                  description: record.description,
                  fields: record.fields || {}
                }))
                setDynamicOptions(prev => ({
                  ...prev,
                  "feedback_records": mappedFeedbackRecords,
                  // Also store with common field name variations
                  "Feedback_records": mappedFeedbackRecords,
                  "Feedbacks_records": mappedFeedbackRecords,
                  "Associated Feedback_records": mappedFeedbackRecords,
                  "Related Feedback_records": mappedFeedbackRecords
                }))
              }
            } catch (error) {
              console.error(`❌ Error fetching project/task/feedback records:`, error)
            }
          }
        }
      }

      // Fetch Discord channels when guild is selected
      if (nodeInfo?.type === "discord_action_send_message" && config.guildId) {
        const previousGuildId = previousDependentValues.current["guildId"]
        if (config.guildId !== previousGuildId) {
          console.log(`🔄 Guild changed to ${config.guildId}, fetching Discord channels`)
          previousDependentValues.current["guildId"] = config.guildId
          
          const integration = getIntegrationByProvider(nodeInfo.providerId || "")
          if (integration) {
            try {
              const channelData = await loadIntegrationData("discord_channels", integration.id, { guildId: config.guildId })
              if (channelData && channelData.length > 0) {
                console.log(`📺 Processing Discord channels:`, {
                  channelCount: channelData.length,
                  channels: channelData.map((c: any) => ({
                    value: c.value,
                    label: c.label
                  }))
                })
                const mappedChannels = channelData.map((channel: any) => ({
                  value: channel.value,
                  label: channel.label,
                }))
                setDynamicOptions(prev => ({
                  ...prev,
                  "channelId": mappedChannels,
                }))
              }
            } catch (error) {
              console.error(`❌ Error fetching Discord channels:`, error)
              // Set an error state to show to the user
              setErrors(prev => ({
                ...prev,
                channelId: "Failed to load channels. The bot may not have permission to view channels in this server. Please ensure the bot has the 'View Channels' permission."
              }))
            }
          }
        }
      }
    }

    fetchDependentFields()
  }, [isOpen, nodeInfo, config, fetchDependentData])

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
      try {
        setLoadingDynamicDebounced(true)
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
          setLoadingDynamicDebounced(false)
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

        try {
          setLoadingDynamicDebounced(true)
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
            setLoadingDynamicDebounced(false)
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
      onSave(configWithAttachments)
      onClose()
    }
  }

  const renderField = (field: ConfigField | NodeField) => {
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
    let value = config[field.name]
    if (field.type === "select" && (value === "" || value === undefined) && field.defaultValue !== undefined) {
      value = field.defaultValue
    } else {
      value = value || ""
    }
    const hasError = !!errors[field.name]
    
    // Debug logging for select fields with default values
    if (field.type === "select" && field.defaultValue && (config[field.name] === "" || config[field.name] === undefined)) {
      console.log('🔍 Select field debug:', {
        fieldName: field.name,
        defaultValue: field.defaultValue,
        currentValue: value,
        configValue: config[field.name]
      })
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
                        <SelectContent className="max-h-96">
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
                            <Database className="w-4 h-4" />
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
                            <Database className="w-4 h-4" />
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
                            <Database className="w-4 h-4" />
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
                              <Database className="w-4 h-4" />
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
                            <Database className="w-4 h-4" />
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

    const handleSelectChange = (newValue: string) => {
      console.log('🔄 Select value changed:', {
        fieldName: field.name,
        newValue,
        isAirtableAction: nodeInfo?.type === "airtable_action_create_record",
        isBaseIdField: field.name === "baseId"
      })
      
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
        setConfig({ ...config, [field.name]: newValue })
      }
      
      // Check Discord bot status when guild is selected
      if (nodeInfo?.type === "discord_action_send_message" && field.name === "guildId" && newValue) {
        checkBotInGuild(newValue)
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
      nodeInfo?.configSchema?.forEach(dependentField => {
        if (dependentField.dependsOn === field.name) {
          console.log('🔄 Found dependent field:', {
            field: dependentField.name,
            dependsOn: field.name,
            newValue
          })
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
      case "email":
      case "password":
        return (
          <div className="space-y-2">
            {renderLabel()}
            <div className="flex gap-2 w-full">
              <Input
                type={field.type}
                value={value}
                onChange={handleChange}
                placeholder={field.placeholder}
                readOnly={field.readonly}
                className={cn(
                  "flex-1", 
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
                name={`custom-${field.type}-${Math.random().toString(36).substr(2, 9)}`}
              />
              {!field.readonly && (
                <VariablePicker
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  onVariableSelect={handleVariableSelect}
                  fieldType={field.type}
                  trigger={
                    <Button variant="outline" size="sm" className="flex-shrink-0 px-3">
                      <Database className="w-4 h-4" />
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
            <Input
              type="number"
              value={value}
              onChange={handleChange}
              placeholder={field.placeholder}
              className={cn("w-full", hasError && "border-red-500")}
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
              <Textarea
                value={value}
                onChange={handleChange}
                placeholder={field.placeholder}
                className={cn("w-full min-h-[100px] resize-y", hasError && "border-red-500")}
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
              <div className="flex justify-end">
                <VariablePicker
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  onVariableSelect={handleVariableSelect}
                  fieldType={field.type}
                  trigger={
                    <Button variant="outline" size="sm" className="gap-2">
                      <Database className="w-4 h-4" />
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
                        <path d="M3 3h18v2H3V3zm0 8h14v2H3v-2zm0 8h18v2H3v-2z"/>
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
                        <path d="M3 3h18v2H3V3zm6 8h12v2H9v-2zm-6 8h18v2H3v-2z"/>
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
                      <Database className="w-4 h-4" />
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
        const options = field.dynamic ? dynamicOptions[field.name] || [] : field.options || []
        
        // Use MultiCombobox for multiple select with creatable option
        if (field.multiple && field.creatable) {
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
                onChange={(newValues) => {
                  // For Gmail labels, we need to handle both existing labels and new label names
                  if (field.name === 'labelIds') {
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
                  } else {
                    // For other fields, use the standard behavior
                    handleMultiSelectChange(newValues)
                  }
                }}
                placeholder={loadingDynamic ? "Loading..." : field.placeholder}
                searchPlaceholder="Search labels or type to create new ones..."
                emptyPlaceholder={loadingDynamic ? "Loading..." : "No labels found."}
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
        
        // Use regular Select for single select without creatable option
        // Debug logging for Dropbox folders
        if (field.dynamic === "dropbox-folders") {
          console.log('🎯 Dropbox folder field detected:', {
            fieldName: field.name,
            fieldDynamic: field.dynamic,
            optionsCount: options.length
          })
        }
        
        return (
          <div className="space-y-2">
            {renderLabel()}
            <Select
              value={value}
              onValueChange={handleSelectChange}
              disabled={loadingDynamic}
            >
              <SelectTrigger className={cn("w-full", hasError && "border-red-500")}>
                <SelectValue placeholder={loadingDynamic ? "Loading..." : field.placeholder} />
              </SelectTrigger>
              <SelectContent 
                className={cn(
                  "max-h-96",
                  // Enhanced scroll styling for Dropbox folder dropdowns
                  field.dynamic === "dropbox-folders" && "max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
                )} 
                side="bottom" 
                sideOffset={4} 
                align="start" 
                avoidCollisions={false} 
                style={{ 
                  transform: 'translateY(0) !important',
                  // Additional scroll styling for Dropbox folders
                  ...(field.dynamic === "dropbox-folders" && {
                    maxHeight: '192px', // Reduced to 48 * 4px (12rem)
                    overflowY: 'scroll', // Force scrollbar to be visible
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#d1d5db #f3f4f6'
                  })
                }}
              >
                {options.map((option, optionIndex) => {
                  const optionValue = typeof option === 'string' ? option : option.value
                  const optionLabel = typeof option === 'string' ? option : option.label
                  return (
                    <SelectItem key={`select-option-${optionIndex}-${optionValue || 'undefined'}`} value={optionValue} className="whitespace-nowrap">
                      {optionLabel}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            
            {/* Discord bot status indicator */}
            {nodeInfo?.type === "discord_action_send_message" && field.name === "guildId" && value && (
              <div className="flex items-center gap-2 mt-2">
                {checkingBot ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking bot status...
                  </div>
                ) : botStatus[value] !== undefined ? (
                  <div className={cn(
                    "flex items-center gap-2 text-sm",
                    botStatus[value] ? "text-green-600" : "text-amber-600"
                  )}>
                    {botStatus[value] ? (
                      <>
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        Bot is connected to this server
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => checkBotInGuild(value)}
                        >
                          Refresh
                        </Button>
                      </>
                    ) : (
                      <>
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
                              "https://discord.com/oauth2/authorize?client_id=1378595955212812308&permissions=274877910016&scope=bot",
                              "discord_bot_invite",
                              "width=500,height=600,scrollbars=yes,resizable=yes"
                            )
                            
                            if (popup) {
                              // Monitor when the popup is closed and check bot status
                              const checkClosed = setInterval(() => {
                                if (popup.closed) {
                                  clearInterval(checkClosed)
                                  
                                  // Wait 1 second for Discord to process the bot addition
                                  setTimeout(async () => {
                                    if (config.guildId) {
                                      console.log('🔄 Checking bot status after popup closed...')
                                      await checkBotInGuild(config.guildId)
                                      const currentBotStatus = botStatus[config.guildId]
                                      if (currentBotStatus) {
                                        console.log('✅ Bot is now connected')
                                        // Clear any previous errors
                                        setErrors(prev => {
                                          const newErrors = { ...prev }
                                          delete newErrors.channelId
                                          return newErrors
                                        })
                                      } else {
                                        console.log('❌ Bot is still not connected after 1 second')
                                        // Show manual refresh option
                                        setErrors(prev => ({
                                          ...prev,
                                          botRefresh: "Bot not detected. Click 'Refresh' to check again."
                                        }))
                                      }
                                    }
                                  }, 1000) // Wait 1 second for Discord to process
                                }
                              }, 500) // Check every 500ms if popup is closed
                              
                              // Cleanup after 5 minutes
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
                              console.log('🔄 Manual refresh of bot status...')
                              await checkBotInGuild(config.guildId)
                              const currentBotStatus = botStatus[config.guildId]
                              if (currentBotStatus) {
                                console.log('✅ Bot is now connected')
                                // Clear any previous errors
                                setErrors(prev => {
                                  const newErrors = { ...prev }
                                  delete newErrors.botRefresh
                                  delete newErrors.channelId
                                  return newErrors
                                })
                              } else {
                                console.log('❌ Bot is still not connected')
                              }
                            }
                          }}
                        >
                          Refresh
                        </Button>
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            )}
            
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "combobox":
        const comboboxOptions = field.dynamic ? dynamicOptions[field.name] || [] : field.options || []
        return (
          <div className="space-y-2">
            {renderLabel()}
            <Combobox
              value={value}
              onChange={handleSelectChange}
              disabled={loadingDynamic}
              placeholder={loadingDynamic ? "Loading..." : field.placeholder}
              options={comboboxOptions.map((option) => ({
                value: typeof option === 'string' ? option : option.value,
                label: typeof option === 'string' ? option : option.label,
                description: typeof option === 'object' && 'description' in option && typeof option.description === 'string' ? option.description : undefined
              }))}
              searchPlaceholder={field.creatable ? "Search or type to create new..." : "Search records..."}
              emptyPlaceholder={loadingDynamic ? "Loading..." : "No records found."}
              creatable={field.creatable || false}
            />
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "boolean":
        return (
          <div className="space-y-2">
            {renderLabel()}
            <div className="flex items-center space-x-3">
              <Checkbox
                checked={!!value}
                onCheckedChange={handleCheckboxChange}
                className={cn(hasError && "border-red-500")}
              />
              <Label className="text-sm font-medium cursor-pointer" onClick={() => handleCheckboxChange(!value)}>
                Enable
              </Label>
            </div>
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "file":
        return (
          <div className="space-y-2">
            {renderLabel()}
            <div className="flex gap-2">
              <div className="flex-1">
                <FileUpload
                  value={value}
                  onChange={handleFileChange}
                  accept={field.accept}
                  maxFiles={field.multiple ? 10 : 1}
                  maxSize={typeof field.maxSize === 'number' ? field.maxSize : undefined}
                  placeholder={field.placeholder}
                  className={cn(hasError && "border-red-500")}
                />
              </div>
              <VariablePicker
                workflowData={workflowData}
                currentNodeId={currentNodeId}
                onVariableSelect={(variable) => {
                  // For file fields, we can set the variable path as a string
                  // The actual file handling will be done during execution
                  setConfig(prev => ({ ...prev, [field.name]: variable }))
                }}
                fieldType="file"
                trigger={
                  <Button variant="outline" size="sm" className="flex-shrink-0 px-3 h-auto">
                    <Database className="w-4 h-4" />
                  </Button>
                }
              />
            </div>
            {field.description && (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "date":
        return (
          <div className="space-y-2">
            {renderLabel()}
            <div className="relative group w-64">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                <Calendar className="w-5 h-5" />
              </span>
              <input
                type="date"
                value={value || ""}
                onChange={e => {
                  setConfig(prev => ({ ...prev, [field.name]: e.target.value }))
                }}
                className={cn(
                  "pl-10 pr-3 py-2 w-full rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary",
                  hasError ? "border-red-500" : "border-border"
                )}
                placeholder="Select date"
              />
            </div>
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "time":
        return (
          <div className="space-y-2">
            {renderLabel()}
            <TimePicker
              value={value}
              onChange={handleTimeChange}
              placeholder={field.placeholder}
              className={cn(hasError && "border-red-500")}
            />
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "datetime": {
        // Validation: must be in the future
        const now = new Date()
        const selected = value ? new Date(value) : null
        const isPast = selected && selected < now
        return (
          <div className="space-y-2">
            {renderLabel()}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative group w-64">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                      <Calendar className="w-5 h-5" />
                    </span>
                    <input
                      type="datetime-local"
                      value={value ? value.slice(0, 16) : ""}
                      onChange={e => {
                        setConfig(prev => ({ ...prev, [field.name]: e.target.value }))
                      }}
                      min={now.toISOString().slice(0, 16)}
                      className={cn(
                        "pl-10 pr-3 py-2 w-full rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary",
                        hasError || isPast ? "border-red-500" : "border-border"
                      )}
                      placeholder="Select date & time"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Select a future time for the post to go live.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {(hasError || isPast) && (
              <p className="text-xs text-red-500">
                {isPast ? "Please select a future date and time." : errors[field.name]}
              </p>
            )}
          </div>
        )
      }

      case "email-autocomplete":
        const emailOptions = dynamicOptions[field.name] || []
        const emailSuggestions = emailOptions.map((opt: any) => ({
          value: opt.value || opt.email,
          label: opt.label || opt.email || opt.value,
          email: opt.email || opt.value,
          name: opt.name,
          type: opt.type,
          isGroup: opt.isGroup,
          groupId: opt.groupId,
          members: opt.members
        }))
        
        // Fields that support multiple emails
        const isMultipleEmail = field.multiple || field.name === "attendees" || field.name === "to" || field.name === "cc" || field.name === "bcc"
        
        return (
          <div className="space-y-2">
            {renderLabel()}
            <EmailAutocomplete
              value={value}
              onChange={(newValue) => setConfig(prev => ({ ...prev, [field.name]: newValue }))}
              suggestions={emailSuggestions}
              placeholder={field.placeholder}
              multiple={isMultipleEmail}
              disabled={loadingDynamic}
              isLoading={loadingDynamic}
              className={cn(hasError && "border-red-500")}
            />
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "location-autocomplete":
        return (
          <div className="space-y-2">
            {renderLabel()}
            <LocationAutocomplete
              value={value}
              onChange={(newValue) => setConfig(prev => ({ ...prev, [field.name]: newValue }))}
              placeholder={field.placeholder}
              className={cn(hasError && "border-red-500")}
            />
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "info":
        return (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-4">
            <div className="flex-1">
              <div className="font-medium text-blue-800 mb-1">{(field as any).label}</div>
              <div className="text-blue-700 text-sm">{(field as any).description}</div>
            </div>
            {(field as any).showConnectButton && (
              <Button
                variant="default"
                onClick={() => {
                  // Discord bot invite URL with your bot's client ID
                  window.open("https://discord.com/oauth2/authorize?client_id=1378595955212812308&scope=bot+applications.commands&permissions=268438528", "_blank")
                }}
              >
                Connect Bot
              </Button>
            )}
          </div>
        )

      case "notion_pages": {
        // Type guard for expected structure
        const isNotionData = (data: any): data is { workspace: any; pages: any[] } =>
          data && typeof data === 'object' && 'workspace' in data && 'pages' in data

        const notionDataRaw = Array.isArray(dynamicOptions[field.name]) ? dynamicOptions[field.name][0] : undefined
        const notionData = isNotionData(notionDataRaw) ? notionDataRaw : { workspace: { id: 'default', name: 'Workspace' }, pages: [] }
        const workspace = notionData.workspace
        const pages = Array.isArray(notionData.pages) ? notionData.pages : []

        // Build hierarchical options
        console.log('🔍 Notion data processing:', {
          workspace,
          pagesCount: pages.length,
          pages: pages.slice(0, 2) // Log first 2 pages for debugging
        })
        
        const notionOptions = [
          {
            value: `group_${workspace?.id || "default"}`,
            label: workspace?.name || "Workspace",
            isGroup: true,
            emails: pages.map((page: any) => ({
              key: page.id,
              value: page.id,
              label: `${page.icon ? page.icon + ' ' : ''}${page.title}`,
              description: page.url,
              ...(Array.isArray(page.subpages) && page.subpages.length > 0
                ? {
                    emails: page.subpages.map((sub: any) => ({
                      key: sub.id,
                      value: sub.id,
                      label: `${sub.icon ? sub.icon + ' ' : ''}${sub.title}`,
                      description: sub.url,
                    })),
                    isGroup: true,
                    groupId: page.id,
                    groupName: page.title,
                  }
                : {})
            })),
          },
        ]
        
        console.log('🔍 Built notion options:', notionOptions)

        return (
          <div className="space-y-2">
            {renderLabel()}
            <HierarchicalCombobox
              options={notionOptions}
              value={value}
              onChange={handleSelectChange}
              disabled={loadingDynamic}
              placeholder={loadingDynamic ? "Loading..." : field.placeholder}
              searchPlaceholder="Search pages..."
              emptyPlaceholder={loadingDynamic ? "Loading..." : "No pages found."}
            />
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )
      }

      case "custom":
        // Custom field renderer for Slack iconUrl
        if (field.name === "iconUrl" && nodeInfo?.type === "slack_action_send_message") {
          const [iconMode, setIconMode] = useState<"url" | "upload">("url")
          const [iconFile, setIconFile] = useState<File | null>(null)
          const iconFileInputRef = useRef<HTMLInputElement>(null)

          const handleIconFileUpload = (files: FileList | null) => {
            if (!files || files.length === 0) return
            const file = files[0]
            setIconFile(file)
            setConfig(prev => ({ ...prev, [field.name]: { mode: "upload", file, fileName: file.name } }))
          }

          return (
            <div className="space-y-2">
              {renderLabel()}
              <div className="space-y-3">
                {/* Mode Toggle */}
                <div className="flex items-center space-x-2">
                  <Button
                    type="button"
                    variant={iconMode === "url" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setIconMode("url")}
                  >
                    URL
                  </Button>
                  <Button
                    type="button"
                    variant={iconMode === "upload" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setIconMode("upload")}
                  >
                    Upload
                  </Button>
                </div>

                {/* URL Input */}
                {iconMode === "url" ? (
                  <div className="flex gap-2">
                    <Input
                      value={typeof value === "string" ? value : ""}
                      onChange={handleChange}
                      placeholder="https://example.com/icon.png"
                      className="flex-1"
                    />
                    <VariablePicker
                      workflowData={workflowData}
                      currentNodeId={currentNodeId}
                      onVariableSelect={handleVariableSelect}
                      fieldType="text"
                      trigger={
                        <Button variant="outline" size="sm" className="flex-shrink-0 px-3">
                          <Database className="w-4 h-4" />
                        </Button>
                      }
                    />
                  </div>
                ) : (
                  /* File Upload */
                  <div className="space-y-2">
                    <input
                      ref={iconFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleIconFileUpload(e.target.files)}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => iconFileInputRef.current?.click()}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {iconFile ? iconFile.name : "Upload Image File"}
                    </Button>
                    {iconFile && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Selected: {iconFile.name}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setIconFile(null)
                            setConfig(prev => ({ ...prev, [field.name]: "" }))
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {hasError && (
                <p className="text-xs text-red-500">{errors[field.name]}</p>
              )}
            </div>
          )
        }
        
        // Handle custom field types for Notion database configuration
        if (field.name === "properties" || field.name === "views" || field.name === "icon" || field.name === "cover") {
          return (
            <div className="space-y-2">
              {renderLabel()}
              <NotionDatabaseConfig
                value={value}
                onChange={(newValue: any) => setConfig(prev => ({ ...prev, [field.name]: newValue }))}
                fieldName={field.name}
              />
              {hasError && (
                <p className="text-xs text-red-500">{errors[field.name]}</p>
              )}
            </div>
          )
        }
        
        // Fall through to default for other custom fields
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

  return (
    <TooltipProvider>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent 
          className={cn(
            "max-w-7xl w-full max-h-[95vh] p-0 gap-0 overflow-hidden",
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
            <div className="flex-1 flex flex-col">
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
              <ScrollArea className="flex-1 max-h-[70vh]">
                <div className="px-6 py-4 space-y-6">
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
                  
                  {/* Tips for File Upload Actions */}
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
                </div>
              </ScrollArea>

              {/* Dialog Footer */}
              <DialogFooter className="px-6 py-4 border-t border-border flex-shrink-0">
                <div className="flex items-center justify-between w-full">
                  <Button variant="outline" onClick={onClose}>
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
          
          {/* Loading Overlay */}
          {loadingDynamic && (
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
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
