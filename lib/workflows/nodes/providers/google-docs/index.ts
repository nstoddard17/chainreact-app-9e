import { NodeComponent } from "../../types"
import {
  PenSquare,
  Edit,
  Share,
  FileText
} from "lucide-react"

// Google Docs Actions
const googleDocsActionCreateDocument: NodeComponent = {
  type: "google_docs_action_create_document",
  title: "Create Document",
  description: "Create a new Google Document with customizable content and sharing options",
  icon: PenSquare,
  providerId: "google-docs",
  category: "Productivity",
  isTrigger: false,
  requiredScopes: ["https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive"],
  configSchema: [
    // Document tab fields
    {
      name: "title",
      label: "Document Title",
      type: "text",
      required: true,
      placeholder: "e.g., Meeting Notes, Project Report, Documentation",
      description: "The title of the new document",
      tabGroup: "Document"
    },
    {
      name: "content",
      label: "Content",
      type: "textarea",
      required: false,
      placeholder: "Enter your document content here...\n\nYou can use {{variables}} to insert dynamic values from your workflow.",
      description: "Document content. Use {{variable}} syntax to insert workflow variables.",
      rows: 10,
      tabGroup: "Document"
    },
    {
      name: "folderId",
      label: "Destination Folder",
      type: "select",
      required: false,
      dynamic: "google-drive-folders",
      placeholder: "Select a folder (optional)",
      description: "Choose where to create the document",
      tabGroup: "Document"
    },
    // Share Document tab fields
    {
      name: "enableSharing",
      label: "Share this Document",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Enable sharing options for the created document",
      tabGroup: "Share Document"
    },
    {
      name: "shareType",
      label: "Share Type",
      type: "select",
      required: false,
      defaultValue: "specific_users",
      options: [
        { value: "specific_users", label: "Share with Specific Users" },
        { value: "anyone_with_link", label: "Anyone with Link" },
        { value: "make_public", label: "Make Public (Anyone can find)" }
      ],
      description: "Choose how to share the document",
      conditional: { field: "enableSharing", value: true },
      tabGroup: "Share Document"
    },
    {
      name: "emails",
      label: "Email Addresses",
      type: "email-autocomplete",
      required: false,
      placeholder: "Enter email addresses separated by commas",
      description: "Email addresses of people to share with",
      dynamic: "google-contacts",
      conditional: { field: "shareType", value: "specific_users" },
      showIf: (values: any) => values.enableSharing && values.shareType === "specific_users",
      tabGroup: "Share Document"
    },
    {
      name: "permission",
      label: "Permission Level",
      type: "select",
      required: false,
      defaultValue: "viewer",
      options: [
        { value: "viewer", label: "Viewer (Read Only)" },
        { value: "commenter", label: "Commenter (Can Comment)" },
        { value: "editor", label: "Editor (Can Edit)" }
      ],
      description: "Permission level for the shared users",
      conditional: { field: "enableSharing", value: true },
      tabGroup: "Share Document"
    },
    {
      name: "sendNotification",
      label: "Send Email Notification",
      type: "boolean",
      required: false,
      defaultValue: true,
      description: "Send an email notification to the users being shared with",
      conditional: { field: "shareType", value: "specific_users" },
      showIf: (values: any) => values.enableSharing && values.shareType === "specific_users",
      tabGroup: "Share Document"
    },
    {
      name: "emailMessage",
      label: "Notification Message",
      type: "textarea",
      required: false,
      placeholder: "Optional message to include in the sharing email",
      description: "Custom message to include in the notification email",
      showIf: (values: any) => values.enableSharing && values.shareType === "specific_users" && values.sendNotification,
      tabGroup: "Share Document"
    },
    {
      name: "allowDownload",
      label: "Allow Download/Print/Copy",
      type: "boolean",
      required: false,
      defaultValue: true,
      description: "Allow viewers and commenters to download, print, or copy the document",
      conditional: { field: "enableSharing", value: true },
      tabGroup: "Share Document"
    },
    {
      name: "expirationDate",
      label: "Access Expiration Date",
      type: "date",
      required: false,
      placeholder: "Optional expiration date for access",
      description: "Date when the shared access will expire (optional)",
      showIf: (values: any) => values.enableSharing && values.shareType !== "anyone_with_link",
      tabGroup: "Share Document"
    }
  ],
}

const googleDocsActionUpdateDocument: NodeComponent = {
  type: "google_docs_action_update_document",
  title: "Update Document",
  description: "Update content in an existing Google Document",
  icon: Edit,
  providerId: "google-docs",
  category: "Productivity",
  isTrigger: false,
  requiredScopes: ["https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive.readonly"],
  configSchema: [
    {
      name: "documentId",
      label: "Document",
      type: "select",
      dynamic: "google-docs-documents",
      required: true,
      placeholder: "Select a document from your Google Docs",
      description: "Choose from your Google Docs documents"
    },
    {
      name: "documentPreview",
      label: "Document Preview",
      type: "google_docs_preview",
      required: false,
      description: "Toggle to show a read-only preview of the document's first 2 paragraphs",
      dependsOn: "documentId"
    },
    {
      name: "insertLocation",
      label: "Insert Location",
      type: "select",
      required: true,
      defaultValue: "end",
      options: [
        { value: "beginning", label: "At Beginning" },
        { value: "end", label: "At End" },
        { value: "replace", label: "Replace All Content" },
        { value: "after_text", label: "After Specific Text" },
        { value: "before_text", label: "Before Specific Text" }
      ],
      description: "Where to insert the new content"
    },
    {
      name: "searchText",
      label: "Search Text",
      type: "text",
      required: false,
      placeholder: "Text to search for in the document (supports wildcards: * for any characters)",
      description: "Enter the text to search for. Use * as a wildcard for pattern matching.",
      hidden: true,
      showIf: (values: any) => values.insertLocation === "after_text" || values.insertLocation === "before_text"
    },
    {
      name: "content",
      label: "Content to Insert",
      type: "textarea",
      required: true,
      placeholder: "Enter content to insert...\n\nYou can use {{variables}} to insert dynamic values.",
      description: "Content to insert into the document. Use {{variable}} syntax for workflow variables.",
      rows: 8
    }
  ],
}



// Google Docs Triggers
const googleDocsTriggerNewDocument: NodeComponent = {
  type: "google_docs_trigger_new_document",
  title: "New Document Created",
  description: "Triggers when a new Google Document is created",
  icon: FileText,
  providerId: "google-docs",
  category: "Productivity",
  isTrigger: true,
  producesOutput: true,
  requiredScopes: ["https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive.readonly"],
  outputSchema: [
    {
      name: "documentId",
      label: "Document ID",
      type: "string",
      description: "The unique ID of the created document"
    },
    {
      name: "title",
      label: "Document Title",
      type: "string",
      description: "The title of the created document"
    },
    {
      name: "createdAt",
      label: "Created At",
      type: "string",
      description: "The timestamp when the document was created"
    },
    {
      name: "createdBy",
      label: "Created By",
      type: "string",
      description: "Email of the user who created the document"
    },
    {
      name: "url",
      label: "Document URL",
      type: "string",
      description: "Direct URL to open the document"
    },
    {
      name: "folderId",
      label: "Folder ID",
      type: "string",
      description: "The ID of the folder where the document was created (if any)"
    }
  ]
}

const googleDocsTriggerDocumentUpdated: NodeComponent = {
  type: "google_docs_trigger_document_updated",
  title: "Document Updated",
  description: "Triggers when a Google Document is modified or updated",
  icon: Edit,
  providerId: "google-docs",
  category: "Productivity",
  isTrigger: true,
  producesOutput: true,
  requiredScopes: ["https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive.readonly"],
  configSchema: [
    {
      name: "documentId",
      label: "Document (Optional)",
      type: "select",
      dynamic: "google-docs-documents",
      required: false,
      placeholder: "Select a specific document to monitor",
      description: "Leave empty to monitor all documents, or select a specific document"
    }
  ],
  outputSchema: [
    {
      name: "documentId",
      label: "Document ID",
      type: "string",
      description: "The unique ID of the updated document"
    },
    {
      name: "title",
      label: "Document Title",
      type: "string",
      description: "The title of the updated document"
    },
    {
      name: "updatedAt",
      label: "Updated At",
      type: "string",
      description: "The timestamp when the document was updated"
    },
    {
      name: "updatedBy",
      label: "Updated By",
      type: "string",
      description: "Email of the user who updated the document"
    },
    {
      name: "revisionId",
      label: "Revision ID",
      type: "string",
      description: "The ID of the latest revision"
    },
    {
      name: "changeType",
      label: "Change Type",
      type: "string",
      description: "Type of change made (content, format, etc.)"
    },
    {
      name: "url",
      label: "Document URL",
      type: "string",
      description: "Direct URL to open the document"
    }
  ]
}

// Export all Google Docs nodes
export const googleDocsNodes: NodeComponent[] = [
  // Actions (2)
  googleDocsActionCreateDocument,
  googleDocsActionUpdateDocument,
  
  // Triggers (2)
  googleDocsTriggerNewDocument,
  googleDocsTriggerDocumentUpdated,
]