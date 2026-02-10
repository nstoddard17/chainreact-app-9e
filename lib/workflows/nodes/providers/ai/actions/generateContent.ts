import * as React from "react"
import { NodeComponent } from "../../../types"

const GenerateIcon = ({ className }: { className?: string }) =>
  React.createElement("img", {
    src: "/integrations/ai.svg",
    alt: "Generate",
    className: className ? `object-contain ${className}` : "h-5 w-5 object-contain",
    width: 20,
    height: 20,
    draggable: false,
  })

/**
 * Generate Content Node
 *
 * Creates new content based on instructions.
 * Great for drafting emails, social posts, descriptions, etc.
 */
export const generateContentNode: NodeComponent = {
  type: "ai_generate",
  title: "Generate Content",
  description: "Create new content like emails, messages, or descriptions",
  icon: GenerateIcon,
  category: "AI & Automation",
  providerId: "ai",
  isTrigger: false,
  testable: true,
  producesOutput: true,
  billableTest: true, // AI calls cost money - deduct from user's task quota when testing
  testCost: 1,

  configSchema: [
    {
      name: "contentType",
      label: "Content Type",
      type: "select",
      required: true,
      defaultValue: "email",
      options: [
        { value: "email", label: "Email" },
        { value: "message", label: "Chat Message (Slack, Discord, etc.)" },
        { value: "social", label: "Social Media Post" },
        { value: "blog", label: "Blog Post / Article" },
        { value: "description", label: "Product / Item Description" },
        { value: "summary", label: "Executive Summary" },
        { value: "response", label: "Response / Reply" },
        { value: "other", label: "Other" }
      ],
      description: "Type of content to generate"
    },
    {
      name: "instructions",
      label: "Instructions",
      type: "textarea",
      multiline: true,
      rows: 6,
      required: true,
      hasVariablePicker: true,
      placeholder: `Describe what you want generated:
• "Write a welcome email for new subscribers"
• "Create a product description for {{trigger.product.name}}"
• "Draft a meeting follow-up based on these notes"
• "Write a Twitter thread about {{topic}}"`,
      description: "Detailed instructions for content generation"
    },
    {
      name: "context",
      label: "Context / Input Data (Optional)",
      type: "textarea",
      multiline: true,
      rows: 4,
      hasVariablePicker: true,
      placeholder: "{{trigger.data}} or add background information",
      description: "Additional context or data to base the content on"
    },
    {
      name: "tone",
      label: "Tone",
      type: "select",
      defaultValue: "professional",
      options: [
        { value: "professional", label: "Professional - Clear and business-like" },
        { value: "friendly", label: "Friendly - Warm and approachable" },
        { value: "casual", label: "Casual - Relaxed and conversational" },
        { value: "formal", label: "Formal - Polished and traditional" },
        { value: "enthusiastic", label: "Enthusiastic - Energetic and excited" },
        { value: "empathetic", label: "Empathetic - Understanding and caring" }
      ],
      description: "The tone of the generated content"
    },
    {
      name: "length",
      label: "Length",
      type: "select",
      defaultValue: "medium",
      options: [
        { value: "short", label: "Short (1-2 paragraphs)" },
        { value: "medium", label: "Medium (3-4 paragraphs)" },
        { value: "long", label: "Long (5+ paragraphs)" },
        { value: "custom", label: "Custom word count" }
      ],
      description: "How long the content should be"
    },
    {
      name: "customWordCount",
      label: "Target Word Count",
      type: "number",
      min: 50,
      max: 3000,
      defaultValue: 300,
      dependsOn: "length",
      visibilityCondition: { field: "length", operator: "equals", value: "custom" },
      description: "Approximate word count target"
    },
    {
      name: "includeSubject",
      label: "Generate Subject Line",
      type: "select",
      defaultValue: "yes",
      dependsOn: "contentType",
      visibilityCondition: { field: "contentType", operator: "in", value: ["email", "blog"] },
      options: [
        { value: "yes", label: "Yes - Generate a subject/title" },
        { value: "no", label: "No - Body only" }
      ],
      description: "Whether to generate a subject line or title"
    },
    {
      name: "model",
      label: "AI Model",
      type: "select",
      defaultValue: "gpt-4o-mini",
      options: [
        { value: "gpt-4o-mini", label: "GPT-4o Mini ⭐ Recommended" },
        { value: "gpt-4o", label: "GPT-4o (Higher quality)" },
        { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (Budget)" }
      ],
      description: "Which AI model to use"
    }
  ],

  outputSchema: [
    {
      name: "content",
      label: "Generated Content",
      type: "string",
      description: "The main generated content"
    },
    {
      name: "subject",
      label: "Subject / Title",
      type: "string",
      description: "Generated subject line or title (if applicable)"
    },
    {
      name: "wordCount",
      label: "Word Count",
      type: "number",
      description: "Number of words in the generated content"
    },
    {
      name: "contentType",
      label: "Content Type",
      type: "string",
      description: "The type of content that was generated"
    }
  ]
}
