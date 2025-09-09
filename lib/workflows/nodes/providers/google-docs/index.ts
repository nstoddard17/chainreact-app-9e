import { NodeComponent } from "../../types"
import {
  PenSquare,
  Edit,
  Share,
  Download,
  FileText
} from "lucide-react"

// Google Docs Actions
const googleDocsActionCreateDocument: NodeComponent = {
  type: "google_docs_action_create_document",
  title: "Create Document",
  description: "Create a new Google Document with customizable content and properties",
  icon: PenSquare,
  providerId: "google-docs",
  category: "Productivity",
  isTrigger: false,
  requiredScopes: ["https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive.readonly"],
  configSchema: [
    {
      name: "title",
      label: "Document Title",
      type: "text",
      required: true,
      placeholder: "e.g., Meeting Notes, Project Report, Documentation",
      description: "The title of the new document"
    },
    {
      name: "content",
      label: "Content",
      type: "textarea",
      required: false,
      placeholder: "Enter your document content here...\n\nYou can use {{variables}} to insert dynamic values from your workflow.",
      description: "Document content. Use {{variable}} syntax to insert workflow variables.",
      rows: 10
    },
    {
      name: "folderId",
      label: "Destination Folder",
      type: "select",
      required: false,
      dynamic: "google-drive-folders",
      placeholder: "Select a folder (optional)",
      description: "Choose where to create the document"
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
      name: "previewDocument",
      label: "Preview Document",
      type: "button-toggle",
      defaultValue: "false",
      options: [
        { value: "false", label: "Hide Preview" },
        { value: "true", label: "Show Preview" }
      ],
      description: "Toggle to show a read-only preview of the document's first 10 lines"
    },
    {
      name: "documentPreview",
      label: "Document Preview",
      type: "custom",
      required: false,
      placeholder: "Select a document to see its preview",
      description: "Preview of the document's current content (first 10 lines)",
      readonly: true,
      conditional: { field: "previewDocument", value: "true" }
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
      placeholder: "Text to search for in the document",
      description: "Required when inserting after or before specific text",
      showWhen: { insertLocation: ["after_text", "before_text"] }
    },
    {
      name: "content",
      label: "Content to Insert",
      type: "textarea",
      required: true,
      placeholder: "Enter content to insert...\n\nYou can use {{variables}} to insert dynamic values.",
      description: "Content to insert into the document. Use {{variable}} syntax for workflow variables.",
      rows: 8
    },
    {
      name: "makeRevision",
      label: "Create Revision",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Save this update as a named revision in document history"
    },
    {
      name: "revisionComment",
      label: "Revision Comment",
      type: "text",
      required: false,
      placeholder: "e.g., Added Q4 financial data, Updated contact information",
      conditional: { field: "makeRevision", value: true },
      description: "Optional comment to label this version in the document's revision history"
    }
  ],
}

const googleDocsActionShareDocument: NodeComponent = {
  type: "google_docs_action_share_document",
  title: "Share Document",
  description: "Share a Google Document with specific users or make it public",
  icon: Share,
  providerId: "google-docs",
  category: "Productivity",
  isTrigger: false,
  requiredScopes: ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/drive.readonly"],
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
      name: "previewDocument",
      label: "Preview Document",
      type: "button-toggle",
      defaultValue: "false",
      options: [
        { value: "false", label: "Hide Preview" },
        { value: "true", label: "Show Preview" }
      ],
      description: "Toggle to show a read-only preview of the document's first 10 lines"
    },
    {
      name: "documentPreview",
      label: "Document Preview",
      type: "custom",
      required: false,
      placeholder: "Select a document to see its preview",
      description: "Preview of the document's current content (first 10 lines)",
      readonly: true,
      conditional: { field: "previewDocument", value: "true" }
    },
    {
      name: "shareType",
      label: "Share Type",
      type: "select",
      required: true,
      defaultValue: "specific_users",
      options: [
        { value: "specific_users", label: "Share with Specific Users" },
        { value: "anyone_with_link", label: "Anyone with Link" },
        { value: "make_public", label: "Make Public (Anyone can find)" },
        { value: "domain", label: "Anyone in Organization" }
      ],
      description: "Choose how to share the document"
    },
    {
      name: "emails",
      label: "Email Addresses",
      type: "email-autocomplete",
      required: false,
      placeholder: "Enter email addresses separated by commas",
      description: "Email addresses of people to share with",
      dynamic: "google-contacts",
      conditional: { field: "shareType", value: "specific_users" }
    },
    {
      name: "permission",
      label: "Permission Level",
      type: "select",
      required: true,
      defaultValue: "viewer",
      options: [
        { value: "viewer", label: "Viewer (Read Only)" },
        { value: "commenter", label: "Commenter (Can Comment)" },
        { value: "editor", label: "Editor (Can Edit)" },
        { value: "owner", label: "Owner (Transfer Ownership)" }
      ],
      description: "Permission level for the shared users"
    },
    {
      name: "sendNotification",
      label: "Send Email Notification",
      type: "boolean",
      required: false,
      defaultValue: true,
      description: "Send an email notification to the users being shared with",
      conditional: { field: "shareType", value: "specific_users" }
    },
    {
      name: "emailMessage",
      label: "Notification Message",
      type: "textarea",
      required: false,
      placeholder: "Optional message to include in the sharing email",
      description: "Custom message to include in the notification email",
      showWhen: { shareType: "specific_users", sendNotification: true }
    },
    {
      name: "allowDownload",
      label: "Allow Download/Print/Copy",
      type: "boolean",
      required: false,
      defaultValue: true,
      description: "Allow viewers and commenters to download, print, or copy the document"
    },
    {
      name: "expirationDate",
      label: "Access Expiration Date",
      type: "date",
      required: false,
      placeholder: "Optional expiration date for access",
      description: "Date when the shared access will expire (optional)"
    },
    {
      name: "transferOwnership",
      label: "Transfer Ownership",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Transfer ownership of the document to the specified user (irreversible)",
      conditional: { field: "permission", value: "owner" }
    }
  ],
}

const googleDocsActionExportDocument: NodeComponent = {
  type: "google_docs_action_export_document",
  title: "Export Document",
  description: "Export a Google Doc to various formats (PDF, DOCX, etc.)",
  icon: Download,
  providerId: "google-docs",
  requiredScopes: ["https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive.readonly"],
  category: "Productivity",
  isTrigger: false,
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
      name: "previewDocument",
      label: "Preview Document",
      type: "button-toggle",
      defaultValue: "false",
      options: [
        { value: "false", label: "Hide Preview" },
        { value: "true", label: "Show Preview" }
      ],
      description: "Toggle to show a read-only preview of the document's first 10 lines"
    },
    {
      name: "documentPreview",
      label: "Document Preview",
      type: "custom",
      required: false,
      placeholder: "Select a document to see its preview",
      description: "Preview of the document's current content (first 10 lines)",
      readonly: true,
      conditional: { field: "previewDocument", value: "true" }
    },
    {
      name: "exportFormat",
      label: "Export Format",
      type: "select",
      required: true,
      defaultValue: "pdf",
      options: [
        { value: "pdf", label: "PDF (.pdf)" },
        { value: "docx", label: "Microsoft Word (.docx)" },
        { value: "odt", label: "OpenDocument Text (.odt)" },
        { value: "rtf", label: "Rich Text Format (.rtf)" },
        { value: "txt", label: "Plain Text (.txt)" },
        { value: "html", label: "HTML (.html)" },
        { value: "epub", label: "EPUB Publication (.epub)" },
        { value: "md", label: "Markdown (.md)" }
      ],
      description: "Choose the format to export the document"
    },
    {
      name: "exportOptions",
      label: "Export Options",
      type: "select",
      required: false,
      defaultValue: "default",
      options: [
        { value: "default", label: "Default Settings" },
        { value: "compact", label: "Compact (Smaller File Size)" },
        { value: "high_quality", label: "High Quality (Larger File)" }
      ],
      description: "Additional export options",
      conditional: { field: "exportFormat", value: "pdf" }
    },
    {
      name: "includeComments",
      label: "Include Comments",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Include document comments in the export (if supported by format)"
    },
    {
      name: "includeSuggestions",
      label: "Include Suggestions",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Include suggested edits in the export (if supported by format)"
    },
    {
      name: "destinationType",
      label: "Save To",
      type: "select",
      required: true,
      defaultValue: "drive",
      options: [
        { value: "drive", label: "Google Drive" },
        { value: "email", label: "Send via Email" },
        { value: "download", label: "Direct Download" },
        { value: "webhook", label: "Send to Webhook" }
      ],
      description: "Where to save or send the exported document"
    },
    {
      name: "destinationFolder",
      label: "Destination Folder",
      type: "select",
      dynamic: "google-drive-folders",
      required: false,
      placeholder: "Select a folder (uses root if not specified)",
      description: "Google Drive folder to save the exported file",
      conditional: { field: "destinationType", value: "drive" }
    },
    {
      name: "emailRecipients",
      label: "Email Recipients",
      type: "email-autocomplete",
      required: false,
      placeholder: "Enter email addresses separated by commas",
      dynamic: "google-contacts",
      description: "Email addresses to send the exported document to",
      conditional: { field: "destinationType", value: "email" }
    },
    {
      name: "emailSubject",
      label: "Email Subject",
      type: "text",
      required: false,
      placeholder: "Exported Document: {{title}}",
      description: "Subject line for the email",
      conditional: { field: "destinationType", value: "email" }
    },
    {
      name: "emailBody",
      label: "Email Body",
      type: "textarea",
      required: false,
      placeholder: "Please find the exported document attached.",
      description: "Message body for the email",
      conditional: { field: "destinationType", value: "email" }
    },
    {
      name: "webhookUrl",
      label: "Webhook URL",
      type: "text",
      required: false,
      placeholder: "https://example.com/webhook",
      description: "Webhook URL to send the exported file",
      conditional: { field: "destinationType", value: "webhook" }
    },
    {
      name: "webhookHeaders",
      label: "Webhook Headers",
      type: "textarea",
      required: false,
      placeholder: "Authorization: Bearer token\nContent-Type: application/octet-stream",
      description: "Optional headers for the webhook request (one per line)",
      conditional: { field: "destinationType", value: "webhook" }
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
  // Actions (4)
  googleDocsActionCreateDocument,
  googleDocsActionUpdateDocument,
  googleDocsActionShareDocument,
  googleDocsActionExportDocument,
  
  // Triggers (2)
  googleDocsTriggerNewDocument,
  googleDocsTriggerDocumentUpdated,
]