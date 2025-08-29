import { NodeComponent } from "../../types"
import {
  FileText,
  Edit,
  FolderPlus
} from "lucide-react"

// Microsoft OneNote Triggers
const onenoteTriggerNewNote: NodeComponent = {
  type: "microsoft-onenote_trigger_new_note",
  title: "New note created",
  description: "Triggers when a new note is created",
  icon: FileText,
  providerId: "microsoft-onenote",
  category: "Productivity",
  isTrigger: true,
  requiredScopes: ["Notes.ReadWrite.All"],
}

const onenoteTriggerNoteModified: NodeComponent = {
  type: "microsoft-onenote_trigger_note_modified",
  title: "Note modified",
  description: "Triggers when a note is modified",
  icon: Edit,
  providerId: "microsoft-onenote",
  category: "Productivity",
  isTrigger: true,
  requiredScopes: ["Notes.ReadWrite.All"],
}

// Microsoft OneNote Actions
const onenoteActionCreatePage: NodeComponent = {
  type: "microsoft-onenote_action_create_page",
  title: "Create Page",
  description: "Create a new page in OneNote",
  icon: FileText,
  providerId: "microsoft-onenote",
  requiredScopes: ["Notes.ReadWrite.All"],
  category: "Productivity",
  isTrigger: false,
  configSchema: [
    { 
      name: "notebookId", 
      label: "Notebook", 
      type: "combobox",
      dynamic: "onenote_notebooks",
      required: true,
      placeholder: "Select a notebook or type to create new",
      creatable: true
    },
    { 
      name: "sectionId", 
      label: "Section", 
      type: "combobox",
      dynamic: "onenote_sections",
      required: true,
      placeholder: "Select a section or type to create new",
      dependsOn: "notebookId",
      creatable: true
    },
    { name: "title", label: "Page Title", type: "text", required: true, placeholder: "Enter page title" },
    { name: "content", label: "Content", type: "textarea", required: false, placeholder: "Enter page content" }
  ]
}

const onenoteActionCreateSection: NodeComponent = {
  type: "microsoft-onenote_action_create_section",
  title: "Create Section",
  description: "Create a new section in OneNote",
  icon: FolderPlus,
  providerId: "microsoft-onenote",
  requiredScopes: ["Notes.ReadWrite.All"],
  category: "Productivity",
  isTrigger: false,
  configSchema: [
    { 
      name: "notebookId", 
      label: "Notebook", 
      type: "combobox",
      dynamic: "onenote_notebooks",
      required: true,
      placeholder: "Select a notebook or type to create new",
      creatable: true
    },
    { name: "displayName", label: "Section Name", type: "text", required: true, placeholder: "Enter section name" }
  ]
}

const onenoteActionUpdatePage: NodeComponent = {
  type: "microsoft-onenote_action_update_page",
  title: "Update Page",
  description: "Update an existing OneNote page",
  icon: Edit,
  providerId: "microsoft-onenote",
  requiredScopes: ["Notes.ReadWrite.All"],
  category: "Productivity",
  isTrigger: false,
  configSchema: [
    { 
      name: "notebookId", 
      label: "Notebook", 
      type: "combobox",
      dynamic: "onenote_notebooks",
      required: true,
      placeholder: "Select a notebook or type to create new",
      creatable: true
    },
    { 
      name: "sectionId", 
      label: "Section", 
      type: "combobox",
      dynamic: "onenote_sections",
      required: true,
      placeholder: "Select a section or type to create new",
      dependsOn: "notebookId",
      creatable: true
    },
    { 
      name: "pageId", 
      label: "Page", 
      type: "combobox",
      dynamic: "onenote_pages",
      required: true,
      placeholder: "Select a page or type to create new",
      dependsOn: "sectionId",
      creatable: true
    },
    { name: "title", label: "New Title", type: "text", required: false, placeholder: "New page title" },
    { name: "content", label: "New Content", type: "textarea", required: false, placeholder: "New page content" }
  ]
}

// Export all OneNote nodes (actually 5 nodes, not 4)
export const onenoteNodes: NodeComponent[] = [
  // Triggers (2)
  onenoteTriggerNewNote,
  onenoteTriggerNoteModified,
  
  // Actions (3)
  onenoteActionCreatePage,
  onenoteActionCreateSection,
  onenoteActionUpdatePage,
]