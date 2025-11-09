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
      name: "contentSource",
      label: "Content Source",
      type: "select",
      required: false,
      defaultValue: "file_upload",
      options: [
        { value: "manual", label: "Enter Manually" },
        { value: "file_upload", label: "Upload File" }
      ],
      description: "Choose how to provide the document content",
      tabGroup: "Document",
      loadOnMount: false // Static options - don't load
    },
    {
      name: "content",
      label: "Content",
      type: "textarea",
      required: false,
      placeholder: "Enter your document content here...\n\nYou can use {{variables}} to insert dynamic values from your workflow.",
      description: "Document content. Use {{variable}} syntax to insert workflow variables.",
      rows: 10,
      tabGroup: "Document",
      showIf: (values: any) => !values.contentSource || values.contentSource === "manual"
    },
    {
      name: "uploadedFile",
      label: "Upload File",
      type: "file",
      required: false,
      accept: ".txt,.docx,.pdf,.html,.md",
      description: "Upload a file to use as the document content. The file name will be used as the document title.",
      tabGroup: "Document",
      showIf: (values: any) => values.contentSource === "file_upload",
      autoFillTitle: true // Custom property to indicate this field should populate the title
    },
    {
      name: "folderId",
      label: "Destination Folder",
      type: "select",
      required: false,
      dynamic: "google-drive-folders",
      loadOnMount: true,
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
      visibilityCondition: { field: "enableSharing", operator: "equals", value: true },
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
      visibilityCondition: { field: "shareType", operator: "equals", value: "specific_users" },
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
      visibilityCondition: { field: "enableSharing", operator: "equals", value: true },
      tabGroup: "Share Document"
    },
    {
      name: "sendNotification",
      label: "Send Email Notification",
      type: "boolean",
      required: false,
      defaultValue: true,
      description: "Send an email notification to the users being shared with",
      visibilityCondition: { field: "shareType", operator: "equals", value: "specific_users" },
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
      visibilityCondition: { field: "enableSharing", operator: "equals", value: true },
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
  producesOutput: true,
  outputSchema: [
    {
      name: "documentId",
      label: "Document ID",
      type: "string",
      description: "The unique ID of the created Google Document"
    },
    {
      name: "documentUrl",
      label: "Document URL",
      type: "string",
      description: "Direct URL to view/edit the document"
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
      description: "Timestamp when the document was created (ISO 8601)"
    },
    {
      name: "folderId",
      label: "Folder ID",
      type: "string",
      description: "ID of the folder where the document was created (if specified)"
    },
    {
      name: "sharedWith",
      label: "Shared With",
      type: "array",
      description: "Array of email addresses the document was shared with (if sharing was enabled)"
    },
    {
      name: "permissionLevel",
      label: "Permission Level",
      type: "string",
      description: "Permission level granted to shared users (viewer, commenter, editor)"
    }
  ]
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
      loadOnMount: true,
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
  producesOutput: true,
  outputSchema: [
    {
      name: "documentId",
      label: "Document ID",
      type: "string",
      description: "The unique ID of the updated Google Document"
    },
    {
      name: "documentUrl",
      label: "Document URL",
      type: "string",
      description: "Direct URL to view/edit the updated document"
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
      description: "Timestamp when the document was updated (ISO 8601)"
    },
    {
      name: "revisionId",
      label: "Revision ID",
      type: "string",
      description: "The ID of the new revision created by this update"
    },
    {
      name: "contentLength",
      label: "Content Length",
      type: "number",
      description: "Length of the newly inserted content in characters"
    },
    {
      name: "insertionLocation",
      label: "Insertion Location",
      type: "string",
      description: "Where the content was inserted (beginning, end, after_text, before_text, replace)"
    }
  ]
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
  configSchema: [
    {
      name: "folderId",
      label: "Only when created in folder",
      type: "select",
      required: false,
      dynamic: "google-drive-folders",
      loadOnMount: true,
      placeholder: "Any folder",
      description: "Filter to only trigger when the new document is created inside this folder"
    },
    {
      name: "mimeType",
      label: "File type",
      type: "select",
      required: false,
      defaultValue: "application/vnd.google-apps.document",
      options: [
        { value: "application/vnd.google-apps.document", label: "Google Docs (native)" },
        { value: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Microsoft Word (.docx)" },
        { value: "application/pdf", label: "PDF (.pdf)" },
        { value: "text/plain", label: "Plain Text (.txt)" }
      ],
      placeholder: "Any type",
      description: "Only trigger for the selected file type"
    }
  ],
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
      name: "folderId",
      label: "Only when in folder",
      type: "select",
      required: false,
      dynamic: "google-drive-folders",
      loadOnMount: true,
      placeholder: "Any folder",
      description: "Filter to only trigger when the document is inside this folder"
    },
    {
      name: "mimeType",
      label: "File type",
      type: "select",
      required: false,
      options: [
        { value: "application/vnd.google-apps.document", label: "Google Docs (native)" },
        { value: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Microsoft Word (.docx)" },
        { value: "application/pdf", label: "PDF (.pdf)" },
        { value: "text/plain", label: "Plain Text (.txt)" }
      ],
      placeholder: "Any type",
      description: "Only trigger for the selected file type"
    },
    {
      name: "documentId",
      label: "Document (Optional)",
      type: "select",
      dynamic: "google-docs-documents",
      loadOnMount: true,
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