import * as React from "react"
import { NodeComponent } from "../../../types"

const ClassifyIcon = ({ className }: { className?: string }) =>
  React.createElement("img", {
    src: "/integrations/ai.svg",
    alt: "Classify",
    className: className ? `object-contain ${className}` : "h-5 w-5 object-contain",
    width: 20,
    height: 20,
    draggable: false,
  })

/**
 * Classify Text Node
 *
 * Categorizes text into predefined categories.
 * Great for routing tickets, tagging content, etc.
 */
export const classifyTextNode: NodeComponent = {
  type: "ai_classify",
  title: "Classify Text",
  description: "Categorize text into predefined categories",
  icon: ClassifyIcon,
  category: "AI & Automation",
  providerId: "ai",
  isTrigger: false,
  testable: true,
  producesOutput: true,

  configSchema: [
    {
      name: "text",
      label: "Text to Classify",
      type: "textarea",
      multiline: true,
      rows: 6,
      required: true,
      hasVariablePicker: true,
      placeholder: "{{trigger.email.body}} or paste text here",
      description: "The text content to classify"
    },
    {
      name: "categories",
      label: "Categories",
      type: "textarea",
      multiline: true,
      rows: 8,
      required: true,
      placeholder: `List your categories (one per line):
bug_report
feature_request
question
feedback
complaint
billing
general

Or use common presets:
• "sentiment" → positive, negative, neutral
• "priority" → high, medium, low
• "urgency" → urgent, normal, low`,
      description: "The categories the AI should classify into"
    },
    {
      name: "allowMultiple",
      label: "Allow Multiple Categories",
      type: "select",
      defaultValue: "single",
      options: [
        { value: "single", label: "Single category only" },
        { value: "multiple", label: "Can have multiple categories" }
      ],
      description: "Whether the input can belong to multiple categories"
    },
    {
      name: "includeConfidence",
      label: "Include Confidence Score",
      type: "select",
      defaultValue: "yes",
      options: [
        { value: "yes", label: "Yes - Include confidence (0-1)" },
        { value: "no", label: "No - Just the category" }
      ],
      description: "Whether to include the AI's confidence level"
    },
    {
      name: "fallbackCategory",
      label: "Fallback Category",
      type: "text",
      placeholder: "other",
      description: "Category to use if text doesn't fit any defined category"
    },
    {
      name: "model",
      label: "AI Model",
      type: "select",
      defaultValue: "gpt-4o-mini",
      options: [
        { value: "gpt-4o-mini", label: "GPT-4o Mini ⭐ Recommended" },
        { value: "gpt-4o", label: "GPT-4o (More accurate)" },
        { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (Budget)" }
      ],
      description: "Which AI model to use"
    }
  ],

  outputSchema: [
    {
      name: "category",
      label: "Category",
      type: "string",
      description: "The primary classification category"
    },
    {
      name: "categories",
      label: "All Categories",
      type: "array",
      description: "All matching categories (when multiple allowed)"
    },
    {
      name: "confidence",
      label: "Confidence",
      type: "number",
      description: "AI's confidence in the classification (0-1)"
    },
    {
      name: "reasoning",
      label: "Reasoning",
      type: "string",
      description: "Brief explanation of why this category was chosen"
    },
    {
      name: "scores",
      label: "All Scores",
      type: "object",
      description: "Confidence scores for all categories"
    }
  ]
}
