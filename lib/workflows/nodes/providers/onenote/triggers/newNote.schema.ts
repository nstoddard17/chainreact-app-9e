import { NodeComponent } from "../../../types"

export const newNoteTriggerSchema: NodeComponent = {
  type: "microsoft-onenote_trigger_new_note",
  title: "New Note in Section",
  description: "Triggers when a new note is created in a notebook/section (uses OneDrive change notifications as a signal).",
  isTrigger: true,
  providerId: "microsoft-onenote",
  category: "Productivity",
  icon: "FileText" as any, // Will be resolved in index file
  producesOutput: true,
  triggerType: "webhook",
  requiredScopes: ["Notes.Read", "Notes.ReadWrite.All"],
  configSchema: [
    {
      name: "notebookId",
      label: "Notebook",
      type: "select",
      dynamic: "onenote_notebooks",
      required: true,
      placeholder: "Select a notebook",
      loadOnMount: true,
      description: "The notebook to monitor for new notes"
    },
    {
      name: "sectionId",
      label: "Section",
      type: "select",
      dynamic: "onenote_sections",
      required: false,
      placeholder: "All sections",
      dependsOn: "notebookId",
      description: "Optionally filter to a specific section. Leave blank to monitor all sections in the notebook."
    },
    
  ],
  outputSchema: [
    {
      name: "id",
      label: "Page ID",
      type: "string",
      description: "The unique ID of the new page"
    },
    {
      name: "title",
      label: "Page Title",
      type: "string",
      description: "The title of the new page"
    },
    {
      name: "content",
      label: "HTML Content",
      type: "string",
      description: "The HTML content of the page"
    },
    {
      name: "contentUrl",
      label: "Content URL",
      type: "string",
      description: "URL to access the page content"
    },
    {
      name: "webUrl",
      label: "Web URL",
      type: "string",
      description: "URL to view the page in OneNote web app"
    },
    {
      name: "createdDateTime",
      label: "Created Date",
      type: "string",
      description: "When the page was created"
    },
    {
      name: "lastModifiedDateTime",
      label: "Last Modified Date",
      type: "string",
      description: "When the page was last modified"
    },
    {
      name: "level",
      label: "Indentation Level",
      type: "number",
      description: "The indentation level of the page"
    },
    {
      name: "order",
      label: "Order",
      type: "number",
      description: "The order of the page within its parent section"
    },
    {
      name: "notebookId",
      label: "Notebook ID",
      type: "string",
      description: "The ID of the notebook containing this page"
    },
    {
      name: "notebookName",
      label: "Notebook Name",
      type: "string",
      description: "The name of the notebook containing this page"
    },
    {
      name: "sectionId",
      label: "Section ID",
      type: "string",
      description: "The ID of the section containing this page"
    },
    {
      name: "sectionName",
      label: "Section Name",
      type: "string",
      description: "The name of the section containing this page"
    }
  ]
}
