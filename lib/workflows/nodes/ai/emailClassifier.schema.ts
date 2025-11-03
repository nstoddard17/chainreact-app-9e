import { NodeComponent } from "../types"

/**
 * AI Email Classifier Node
 *
 * Uses AI to semantically analyze email content and determine if it matches
 * the user's described intent. Much more powerful than keyword matching.
 *
 * Example Use Cases:
 * - "Is this email about our return policy?" (semantic understanding)
 * - "Is this a customer complaint?" (tone/intent detection)
 * - "Does this email require urgent action?" (priority classification)
 */
export const aiEmailClassifierSchema: NodeComponent = {
  type: "ai_email_classifier",
  title: "AI Email Classifier",
  description: "Uses AI to determine if email content matches your intent. Goes beyond keyword matching to understand meaning and context.",
  category: "AI",
  providerId: "ai",
  icon: "Brain" as any,
  producesOutput: true,

  configSchema: [
    {
      name: "intent",
      label: "What should this email be about?",
      type: "textarea",
      required: true,
      placeholder: "e.g., 'customer complaints about shipping delays' or 'questions about our return policy'",
      description: "Describe what kind of email you're looking for. The AI will read the email and determine if it matches.",
      rows: 3
    },
    {
      name: "emailBody",
      label: "Email Body",
      type: "text",
      required: true,
      supportsVariables: true,
      placeholder: "{{trigger.body}}",
      description: "The email content to analyze. Usually from the trigger's body field."
    },
    {
      name: "emailSubject",
      label: "Email Subject (Optional)",
      type: "text",
      required: false,
      supportsVariables: true,
      placeholder: "{{trigger.subject}}",
      description: "The email subject line. Helps provide additional context for classification."
    },
    {
      name: "matchThreshold",
      label: "Match Confidence Threshold",
      type: "select",
      required: false,
      defaultValue: "medium",
      options: [
        { value: "low", label: "Low (50%) - More emails match" },
        { value: "medium", label: "Medium (70%) - Balanced" },
        { value: "high", label: "High (90%) - Very strict" }
      ],
      description: "How confident should the AI be before considering it a match?"
    },
    {
      name: "additionalContext",
      label: "Additional Context (Optional)",
      type: "textarea",
      required: false,
      placeholder: "e.g., 'Our return policy allows 30-day returns. Customers often mention RMA numbers.'",
      description: "Provide extra context to help the AI understand what you're looking for.",
      rows: 2
    }
  ],

  outputSchema: [
    {
      name: "matches",
      label: "Matches Intent",
      type: "boolean",
      description: "True if the email matches your intent, false otherwise"
    },
    {
      name: "confidence",
      label: "Confidence Score",
      type: "number",
      description: "How confident the AI is (0-100)"
    },
    {
      name: "reasoning",
      label: "AI Reasoning",
      type: "string",
      description: "Explanation of why it matched or didn't match"
    },
    {
      name: "categories",
      label: "Detected Categories",
      type: "array",
      description: "Topics/categories detected in the email (e.g., ['complaint', 'urgent', 'shipping'])"
    },
    {
      name: "sentiment",
      label: "Email Sentiment",
      type: "string",
      description: "Overall tone of the email (positive, negative, neutral, urgent)"
    },
    {
      name: "keyPoints",
      label: "Key Points",
      type: "array",
      description: "Main points or topics mentioned in the email"
    }
  ]
}
