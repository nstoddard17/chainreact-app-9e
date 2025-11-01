import { NodeComponent } from "../../../types"

const GMAIL_UPDATE_SIGNATURE_METADATA = {
  key: "gmail_action_update_signature",
  name: "Update Signature",
  description: "Update or create your Gmail email signature"
}

export const updateSignatureActionSchema: NodeComponent = {
  type: GMAIL_UPDATE_SIGNATURE_METADATA.key,
  title: "Update Signature",
  description: GMAIL_UPDATE_SIGNATURE_METADATA.description,
  icon: "PenTool" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "gmail",
  testable: true,
  requiredScopes: ["https://www.googleapis.com/auth/gmail.settings.basic"],
  category: "Communication",
  outputSchema: [
    {
      name: "signature",
      label: "Signature HTML",
      type: "string",
      description: "The updated signature HTML",
      example: "<div>Best regards,<br>John Doe</div>"
    },
    {
      name: "sendAsEmail",
      label: "Send-As Email",
      type: "string",
      description: "The email address this signature applies to",
      example: "john@company.com"
    },
    {
      name: "isDefault",
      label: "Is Default",
      type: "boolean",
      description: "Whether this is the default signature",
      example: true
    },
    {
      name: "updatedAt",
      label: "Updated At",
      type: "string",
      description: "When the signature was updated",
      example: "2024-01-15T10:30:00Z"
    },
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the signature was updated successfully",
      example: true
    }
  ],
  configSchema: [
    {
      name: "sendAsEmail",
      label: "Send-As Email Address",
      type: "select",
      dynamic: "gmail-send-as-emails",
      required: false,
      placeholder: "Select email address...",
      description: "Email address to set signature for (defaults to primary)",
      tooltip: "If you have multiple send-as addresses configured in Gmail, select which one to update. Leave empty for your primary email."
    },
    {
      name: "signatureType",
      label: "Signature Type",
      type: "select",
      required: true,
      options: [
        { value: "html", label: "HTML (formatted)" },
        { value: "text", label: "Plain Text" }
      ],
      defaultValue: "html",
      description: "Format of the signature",
      tooltip: "HTML allows formatting, colors, images, and links. Plain text is simple and compatible with all email clients."
    },
    {
      name: "signatureHtml",
      label: "Signature HTML",
      type: "textarea",
      required: true,
      rows: 10,
      placeholder: "<div style=\"font-family: Arial, sans-serif;\">\n  <strong>John Doe</strong><br>\n  Product Manager<br>\n  Company Inc.<br>\n  <a href=\"mailto:john@company.com\">john@company.com</a><br>\n  <a href=\"https://company.com\">company.com</a>\n</div>",
      supportsAI: true,
      description: "HTML content for the signature",
      tooltip: "Full HTML is supported. You can include inline styles, images (use absolute URLs), and links.",
      visibleWhen: {
        field: "signatureType",
        value: "html"
      }
    },
    {
      name: "signatureText",
      label: "Signature Text",
      type: "textarea",
      required: true,
      rows: 6,
      placeholder: "John Doe\nProduct Manager\nCompany Inc.\njohn@company.com\ncompany.com",
      supportsAI: true,
      description: "Plain text content for the signature",
      tooltip: "Simple text signature without formatting. Use line breaks to separate lines.",
      visibleWhen: {
        field: "signatureType",
        value: "text"
      }
    },
    {
      name: "includeInReplies",
      label: "Include in Replies",
      type: "boolean",
      required: false,
      defaultValue: true,
      description: "Automatically add signature to reply emails",
      tooltip: "When enabled, Gmail will add this signature when replying to emails, not just new emails."
    },
    {
      name: "makeDefault",
      label: "Set as Default",
      type: "boolean",
      required: false,
      defaultValue: true,
      description: "Make this the default signature for new emails",
      tooltip: "When enabled, this signature will be used for all new emails from this account."
    }
  ]
}
