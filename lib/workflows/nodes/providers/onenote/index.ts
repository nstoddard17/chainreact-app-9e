import { NodeComponent } from "../../types"
import {
  FileText,
  Edit,
  FolderPlus,
  Plus,
  Download,
  List,
  Search,
  Trash2
} from "lucide-react"

// Microsoft OneNote Triggers - REMOVED
// Microsoft Graph doesn't support webhook subscriptions for OneNote resources
// OneNote Webhooks API was deprecated in May 2023
// See: https://devblogs.microsoft.com/microsoft365dev/onenote-webhooks-api-deprecation/
//
// Possible future implementation: Polling-based triggers that check for new/modified notes periodically
//
// const onenoteTriggerNewNote: NodeComponent = { ... }
// const onenoteTriggerNoteModified: NodeComponent = { ... }

// Microsoft OneNote Actions
const onenoteActionCreatePage: NodeComponent = {
  type: "microsoft-onenote_action_create_page",
  title: "Create Page",
  description: "Create a new page in OneNote with HTML content support",
  icon: FileText,
  providerId: "microsoft-onenote",
  requiredScopes: ["Notes.ReadWrite.All"],
  category: "Productivity",
  isTrigger: false,
  configSchema: [
    { 
      name: "notebookId", 
      label: "Notebook", 
      type: "select",
      dynamic: "onenote_notebooks",
      required: true,
      placeholder: "Select a notebook",
      loadOnMount: true,
      description: "The notebook where the page will be created"
    },
    { 
      name: "sectionId", 
      label: "Section", 
      type: "select",
      dynamic: "onenote_sections",
      required: false,
      placeholder: "Select a section",
      dependsOn: "notebookId",
      description: "The section where the page will be created (uses default section if not specified)"
    },
    { 
      name: "title", 
      label: "Page Title", 
      type: "text", 
      required: true, 
      placeholder: "Enter page title",
      description: "The title of the new page"
    },
    { 
      name: "content", 
      label: "HTML Content", 
      type: "textarea", 
      required: false, 
      placeholder: "Enter page content (HTML supported)",
      description: "The HTML content of the page. Supports limited HTML/XHTML tags"
    },
    {
      name: "contentType",
      label: "Content Type",
      type: "select",
      required: false,
      defaultValue: "text/html",
      options: [
        { value: "text/html", label: "HTML" },
        { value: "application/xhtml+xml", label: "XHTML" },
        { value: "text/plain", label: "Plain Text" }
      ],
      description: "The format of the content being sent"
    }
  ],
  outputSchema: [
    { name: "id", label: "Page ID", type: "string", description: "The unique ID of the created page" },
    { name: "title", label: "Page Title", type: "string", description: "The title of the page" },
    { name: "contentUrl", label: "Content URL", type: "string", description: "URL to access the page content" },
    { name: "webUrl", label: "Web URL", type: "string", description: "URL to view the page in OneNote web app" },
    { name: "createdDateTime", label: "Created Date", type: "string", description: "When the page was created" },
    { name: "lastModifiedDateTime", label: "Last Modified Date", type: "string", description: "When the page was last modified" },
    { name: "level", label: "Indentation Level", type: "number", description: "The indentation level of the page" },
    { name: "order", label: "Order", type: "number", description: "The order of the page within its parent section" }
  ]
}

const onenoteActionCreateNotebook: NodeComponent = {
  type: "microsoft-onenote_action_create_notebook",
  title: "Create Notebook",
  description: "Create a new notebook in OneNote",
  icon: Plus,
  providerId: "microsoft-onenote",
  requiredScopes: ["Notes.ReadWrite.All"],
  category: "Productivity",
  isTrigger: false,
  configSchema: [
    { 
      name: "displayName", 
      label: "Notebook Name", 
      type: "text", 
      required: true, 
      placeholder: "Enter notebook name",
      description: "The name of the new notebook"
    },
    {
      name: "overwriteIfExists",
      label: "If name exists, use existing",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "If a notebook with this name exists, use it instead of creating a new one"
    },
    {
      name: "userRole",
      label: "User Role",
      type: "select",
      required: false,
      defaultValue: "owner",
      options: [
        { value: "owner", label: "Owner" },
        { value: "contributor", label: "Contributor" },
        { value: "reader", label: "Reader" }
      ],
      description: "The role of the user in the notebook"
    }
  ],
  outputSchema: [
    { name: "id", label: "Notebook ID", type: "string", description: "The unique ID of the created notebook" },
    { name: "displayName", label: "Notebook Name", type: "string", description: "The name of the notebook" },
    { name: "createdDateTime", label: "Created Date", type: "string", description: "When the notebook was created" },
    { name: "lastModifiedDateTime", label: "Last Modified Date", type: "string", description: "When the notebook was last modified" },
    { name: "isDefault", label: "Is Default", type: "boolean", description: "Whether this is the default notebook" },
    { name: "isShared", label: "Is Shared", type: "boolean", description: "Whether the notebook is shared" },
    { name: "sectionsUrl", label: "Sections URL", type: "string", description: "URL to access the notebook's sections" },
    { name: "sectionGroupsUrl", label: "Section Groups URL", type: "string", description: "URL to access the notebook's section groups" }
  ]
}

const onenoteActionCreateSection: NodeComponent = {
  type: "microsoft-onenote_action_create_section",
  title: "Create Section",
  description: "Create a new section in a OneNote notebook",
  icon: FolderPlus,
  providerId: "microsoft-onenote",
  requiredScopes: ["Notes.ReadWrite.All"],
  category: "Productivity",
  isTrigger: false,
  configSchema: [
    { 
      name: "notebookId", 
      label: "Notebook", 
      type: "select",
      dynamic: "onenote_notebooks",
      required: true,
      placeholder: "Select a notebook",
      loadOnMount: true,
      description: "The notebook where the section will be created"
    },
    { 
      name: "displayName", 
      label: "Section Name", 
      type: "text", 
      required: true, 
      placeholder: "Enter section name",
      description: "The name of the new section"
    }
  ],
  outputSchema: [
    { name: "id", label: "Section ID", type: "string", description: "The unique ID of the created section" },
    { name: "displayName", label: "Section Name", type: "string", description: "The name of the section" },
    { name: "createdDateTime", label: "Created Date", type: "string", description: "When the section was created" },
    { name: "lastModifiedDateTime", label: "Last Modified Date", type: "string", description: "When the section was last modified" },
    { name: "pagesUrl", label: "Pages URL", type: "string", description: "URL to access the section's pages" },
    { name: "isDefault", label: "Is Default", type: "boolean", description: "Whether this is the default section" }
  ]
}

const onenoteActionUpdatePage: NodeComponent = {
  type: "microsoft-onenote_action_update_page",
  title: "Update Page",
  description: "Update an existing OneNote page with new content",
  icon: Edit,
  providerId: "microsoft-onenote",
  requiredScopes: ["Notes.ReadWrite.All"],
  category: "Productivity",
  isTrigger: false,
  configSchema: [
    { 
      name: "notebookId", 
      label: "Notebook", 
      type: "select",
      dynamic: "onenote_notebooks",
      required: true,
      placeholder: "Select a notebook",
      loadOnMount: true,
      description: "The notebook containing the page"
    },
    { 
      name: "sectionId", 
      label: "Section", 
      type: "select",
      dynamic: "onenote_sections",
      required: true,
      placeholder: "Select a section",
      dependsOn: "notebookId",
      description: "The section containing the page"
    },
    { 
      name: "pageId", 
      label: "Page", 
      type: "select",
      dynamic: "onenote_pages",
      required: true,
      placeholder: "Select a page to update",
      dependsOn: "sectionId",
      description: "The page to update"
    },
    {
      name: "updateMode",
      label: "Update Mode",
      type: "select",
      required: false,
      defaultValue: "append",
      options: [
        { value: "append", label: "Append to End" },
        { value: "prepend", label: "Add to Beginning" },
        { value: "replace", label: "Replace Content" },
        { value: "insert", label: "Insert at Position" }
      ],
      description: "How to update the page content"
    },
    { 
      name: "content", 
      label: "New Content", 
      type: "textarea", 
      required: true, 
      placeholder: "Enter content to add (HTML supported)",
      description: "The HTML content to add to the page"
    },
    {
      name: "target",
      label: "Target Element",
      type: "text",
      required: false,
      placeholder: "CSS selector or data-id (for insert mode)",
      description: "The target element for insert mode (CSS selector or data-id)",
      visibilityCondition: { field: "updateMode", operator: "equals", value: "insert" }
    },
    {
      name: "position",
      label: "Insert Position",
      type: "select",
      required: false,
      defaultValue: "after",
      options: [
        { value: "after", label: "After Target" },
        { value: "before", label: "Before Target" },
        { value: "inside", label: "Inside Target" }
      ],
      description: "Where to insert relative to target element",
      visibilityCondition: { field: "updateMode", operator: "equals", value: "insert" }
    }
  ],
  outputSchema: [
    { name: "id", label: "Page ID", type: "string", description: "The ID of the updated page" },
    { name: "title", label: "Page Title", type: "string", description: "The title of the page" },
    { name: "contentUrl", label: "Content URL", type: "string", description: "URL to access the updated page content" },
    { name: "webUrl", label: "Web URL", type: "string", description: "URL to view the page in OneNote web app" },
    { name: "lastModifiedDateTime", label: "Last Modified Date", type: "string", description: "When the page was last modified" },
    { name: "success", label: "Success", type: "boolean", description: "Whether the update was successful" }
  ]
}

const onenoteActionGetPageContent: NodeComponent = {
  type: "microsoft-onenote_action_get_page_content",
  title: "Get Page Content",
  description: "Retrieve the HTML content of a OneNote page",
  icon: Download,
  providerId: "microsoft-onenote",
  requiredScopes: ["Notes.Read", "Notes.ReadWrite.All"],
  category: "Productivity",
  isTrigger: false,
  configSchema: [
    { 
      name: "notebookId", 
      label: "Notebook", 
      type: "select",
      dynamic: "onenote_notebooks",
      required: true,
      placeholder: "Select a notebook",
      loadOnMount: true,
      description: "The notebook containing the page"
    },
    { 
      name: "sectionId", 
      label: "Section", 
      type: "select",
      dynamic: "onenote_sections",
      required: true,
      placeholder: "Select a section",
      dependsOn: "notebookId",
      description: "The section containing the page"
    },
    { 
      name: "pageId", 
      label: "Page", 
      type: "select",
      dynamic: "onenote_pages",
      required: true,
      placeholder: "Select a page to retrieve",
      dependsOn: "sectionId",
      description: "The page to retrieve content from"
    },
    {
      name: "includeIDs",
      label: "Include Element IDs",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Include data-id attributes for updating specific elements"
    },
    {
      name: "preGenerated",
      label: "Pre-generated Content",
      type: "boolean",
      required: false,
      defaultValue: true,
      description: "Get pre-generated HTML for faster retrieval"
    }
  ],
  outputSchema: [
    { name: "id", label: "Page ID", type: "string", description: "The unique ID of the page" },
    { name: "title", label: "Page Title", type: "string", description: "The title of the page" },
    { name: "content", label: "HTML Content", type: "string", description: "The HTML content of the page" },
    { name: "contentUrl", label: "Content URL", type: "string", description: "URL to access the page content" },
    { name: "webUrl", label: "Web URL", type: "string", description: "URL to view the page in OneNote web app" },
    { name: "createdDateTime", label: "Created Date", type: "string", description: "When the page was created" },
    { name: "lastModifiedDateTime", label: "Last Modified Date", type: "string", description: "When the page was last modified" },
    { name: "level", label: "Indentation Level", type: "number", description: "The indentation level of the page" }
  ]
}

const onenoteActionGetPages: NodeComponent = {
  type: "microsoft-onenote_action_get_pages",
  title: "Get Pages",
  description: "List pages from OneNote with filtering options",
  icon: List,
  providerId: "microsoft-onenote",
  requiredScopes: ["Notes.Read", "Notes.ReadWrite.All"],
  category: "Productivity",
  isTrigger: false,
  configSchema: [
    { 
      name: "notebookId", 
      label: "Notebook", 
      type: "select",
      dynamic: "onenote_notebooks",
      required: false,
      placeholder: "Select a notebook (optional)",
      loadOnMount: true,
      description: "Filter pages by notebook"
    },
    { 
      name: "sectionId", 
      label: "Section", 
      type: "select",
      dynamic: "onenote_sections",
      required: false,
      placeholder: "Select a section (optional)",
      dependsOn: "notebookId",
      description: "Filter pages by section"
    },
    {
      name: "filter",
      label: "Filter Query",
      type: "text",
      required: false,
      placeholder: "e.g., createdDateTime ge 2024-01-01",
      description: "OData filter query"
    },
    {
      name: "orderBy",
      label: "Order By",
      type: "select",
      required: false,
      defaultValue: "lastModifiedDateTime desc",
      options: [
        { value: "lastModifiedDateTime desc", label: "Last Modified (Newest First)" },
        { value: "lastModifiedDateTime asc", label: "Last Modified (Oldest First)" },
        { value: "createdDateTime desc", label: "Created Date (Newest First)" },
        { value: "createdDateTime asc", label: "Created Date (Oldest First)" },
        { value: "title asc", label: "Title (A-Z)" },
        { value: "title desc", label: "Title (Z-A)" }
      ],
      description: "How to sort the results"
    },
    {
      name: "top",
      label: "Maximum Results",
      type: "number",
      required: false,
      defaultValue: 20,
      min: 1,
      max: 100,
      description: "Maximum number of pages to return"
    }
  ],
  outputSchema: [
    {
      name: "pages",
      label: "Pages",
      type: "array",
      description: "Array of pages matching the filter criteria",
      items: {
        type: "object",
        properties: [
          { name: "id", label: "Page ID", type: "string", description: "The unique ID of the page" },
          { name: "title", label: "Page Title", type: "string", description: "The title of the page" },
          { name: "contentUrl", label: "Content URL", type: "string", description: "URL to access the page content" },
          { name: "webUrl", label: "Web URL", type: "string", description: "URL to view the page in OneNote web app" },
          { name: "createdDateTime", label: "Created Date", type: "string", description: "When the page was created" },
          { name: "lastModifiedDateTime", label: "Last Modified Date", type: "string", description: "When the page was last modified" },
          { name: "level", label: "Indentation Level", type: "number", description: "The indentation level of the page" },
          { name: "order", label: "Order", type: "number", description: "The order of the page" }
        ]
      }
    },
    { name: "count", label: "Total Count", type: "number", description: "Total number of pages returned" }
  ]
}

const onenoteActionCopyPage: NodeComponent = {
  type: "microsoft-onenote_action_copy_page",
  title: "Copy Page",
  description: "Copy a OneNote page to another section",
  icon: FileText,
  providerId: "microsoft-onenote",
  requiredScopes: ["Notes.ReadWrite.All"],
  category: "Productivity",
  isTrigger: false,
  configSchema: [
    { 
      name: "sourceNotebookId", 
      label: "Source Notebook", 
      type: "select",
      dynamic: "onenote_notebooks",
      required: true,
      placeholder: "Select source notebook",
      loadOnMount: true,
      description: "The notebook containing the page to copy"
    },
    { 
      name: "sourceSectionId", 
      label: "Source Section", 
      type: "select",
      dynamic: "onenote_sections",
      required: true,
      placeholder: "Select source section",
      dependsOn: "sourceNotebookId",
      description: "The section containing the page to copy"
    },
    { 
      name: "sourcePageId", 
      label: "Source Page", 
      type: "select",
      dynamic: "onenote_pages",
      required: true,
      placeholder: "Select page to copy",
      dependsOn: "sourceSectionId",
      description: "The page to copy"
    },
    { 
      name: "targetNotebookId", 
      label: "Target Notebook", 
      type: "select",
      dynamic: "onenote_notebooks",
      required: true,
      placeholder: "Select target notebook",
      loadOnMount: true,
      description: "The notebook to copy the page to"
    },
    { 
      name: "targetSectionId", 
      label: "Target Section", 
      type: "select",
      dynamic: "onenote_sections",
      required: true,
      placeholder: "Select target section",
      dependsOn: "targetNotebookId",
      description: "The section to copy the page to"
    }
  ],
  outputSchema: [
    { name: "id", label: "New Page ID", type: "string", description: "The ID of the copied page" },
    { name: "title", label: "Page Title", type: "string", description: "The title of the copied page" },
    { name: "contentUrl", label: "Content URL", type: "string", description: "URL to access the copied page content" },
    { name: "webUrl", label: "Web URL", type: "string", description: "URL to view the copied page in OneNote web app" },
    { name: "createdDateTime", label: "Created Date", type: "string", description: "When the copied page was created" },
    { name: "success", label: "Success", type: "boolean", description: "Whether the copy operation was successful" }
  ]
}

const onenoteActionSearch: NodeComponent = {
  type: "microsoft-onenote_action_search",
  title: "Search OneNote",
  description: "Search across OneNote content",
  icon: Search,
  providerId: "microsoft-onenote",
  requiredScopes: ["Notes.Read", "Notes.ReadWrite.All"],
  category: "Productivity",
  isTrigger: false,
  configSchema: [
    { 
      name: "searchQuery", 
      label: "Search Query", 
      type: "text",
      required: true,
      placeholder: "Enter search terms",
      description: "The text to search for in OneNote"
    },
    {
      name: "scope",
      label: "Search Scope",
      type: "select",
      required: false,
      defaultValue: "all",
      options: [
        { value: "all", label: "All Notebooks" },
        { value: "notebook", label: "Specific Notebook" },
        { value: "section", label: "Specific Section" }
      ],
      description: "Where to search"
    },
    { 
      name: "notebookId", 
      label: "Notebook", 
      type: "select",
      dynamic: "onenote_notebooks",
      required: false,
      placeholder: "Select notebook to search",
      loadOnMount: true,
      description: "Limit search to this notebook",
      visibilityCondition: { field: "scope", operator: "equals", value: "notebook" }
    },
    { 
      name: "sectionId", 
      label: "Section", 
      type: "select",
      dynamic: "onenote_sections",
      required: false,
      placeholder: "Select section to search",
      dependsOn: "notebookId",
      description: "Limit search to this section",
      visibilityCondition: { field: "scope", operator: "equals", value: "section" }
    },
    {
      name: "maxResults",
      label: "Maximum Results",
      type: "number",
      required: false,
      defaultValue: 20,
      min: 1,
      max: 100,
      description: "Maximum number of results to return"
    }
  ],
  outputSchema: [
    {
      name: "results",
      label: "Search Results",
      type: "array",
      description: "Array of pages matching the search query",
      items: {
        type: "object",
        properties: [
          { name: "id", label: "Page ID", type: "string", description: "The unique ID of the page" },
          { name: "title", label: "Page Title", type: "string", description: "The title of the page" },
          { name: "preview", label: "Preview", type: "string", description: "A preview snippet of the page content" },
          { name: "contentUrl", label: "Content URL", type: "string", description: "URL to access the page content" },
          { name: "webUrl", label: "Web URL", type: "string", description: "URL to view the page in OneNote web app" },
          { name: "createdDateTime", label: "Created Date", type: "string", description: "When the page was created" },
          { name: "lastModifiedDateTime", label: "Last Modified Date", type: "string", description: "When the page was last modified" }
        ]
      }
    },
    { name: "count", label: "Result Count", type: "number", description: "Total number of results found" }
  ]
}

const onenoteActionDeletePage: NodeComponent = {
  type: "microsoft-onenote_action_delete_page",
  title: "Delete Page",
  description: "Delete a OneNote page",
  icon: Trash2,
  providerId: "microsoft-onenote",
  requiredScopes: ["Notes.ReadWrite.All"],
  category: "Productivity",
  isTrigger: false,
  configSchema: [
    { 
      name: "notebookId", 
      label: "Notebook", 
      type: "select",
      dynamic: "onenote_notebooks",
      required: true,
      placeholder: "Select a notebook",
      loadOnMount: true,
      description: "The notebook containing the page"
    },
    { 
      name: "sectionId", 
      label: "Section", 
      type: "select",
      dynamic: "onenote_sections",
      required: true,
      placeholder: "Select a section",
      dependsOn: "notebookId",
      description: "The section containing the page"
    },
    { 
      name: "pageId", 
      label: "Page", 
      type: "select",
      dynamic: "onenote_pages",
      required: true,
      placeholder: "Select page to delete",
      dependsOn: "sectionId",
      description: "The page to delete"
    },
    {
      name: "confirmDelete",
      label: "Confirm Deletion",
      type: "boolean",
      required: true,
      defaultValue: false,
      description: "Confirm that you want to permanently delete this page"
    }
  ],
  outputSchema: [
    { name: "success", label: "Success", type: "boolean", description: "Whether the page was successfully deleted" },
    { name: "deletedPageId", label: "Deleted Page ID", type: "string", description: "The ID of the deleted page" },
    { name: "deletedAt", label: "Deleted At", type: "string", description: "Timestamp when the page was deleted" }
  ]
}

// Export all OneNote nodes
export const onenoteNodes: NodeComponent[] = [
  // Note: OneNote triggers removed - Microsoft Graph doesn't support webhook subscriptions for OneNote
  // OneNote Webhooks API was deprecated in May 2023
  // Future: Could implement polling-based triggers instead

  // Actions (10)
  onenoteActionCreatePage,
  onenoteActionCreateNotebook,
  onenoteActionCreateSection,
  onenoteActionUpdatePage,
  onenoteActionGetPageContent,
  onenoteActionGetPages,
  onenoteActionCopyPage,
  onenoteActionSearch,
  onenoteActionDeletePage,
]