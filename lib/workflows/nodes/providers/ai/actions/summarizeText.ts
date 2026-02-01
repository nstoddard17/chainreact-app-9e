import * as React from "react"
import { NodeComponent } from "../../../types"

const SummarizeIcon = ({ className }: { className?: string }) =>
  React.createElement("img", {
    src: "/integrations/ai.svg",
    alt: "Summarize",
    className: className ? `object-contain ${className}` : "h-5 w-5 object-contain",
    width: 20,
    height: 20,
    draggable: false,
  })

/**
 * Summarize Text Node
 *
 * Creates concise summaries of text content.
 * Simpler interface than the full AI Agent - focused on one task.
 */
export const summarizeTextNode: NodeComponent = {
  type: "ai_summarize",
  title: "Summarize Text",
  description: "Create a concise summary of any text content",
  icon: SummarizeIcon,
  category: "AI & Automation",
  providerId: "ai",
  isTrigger: false,
  testable: true,
  producesOutput: true,

  configSchema: [
    {
      name: "text",
      label: "Text to Summarize",
      type: "textarea",
      multiline: true,
      rows: 6,
      required: true,
      hasVariablePicker: true,
      placeholder: "{{trigger.email.body}} or paste text here",
      description: "The text content you want summarized"
    },
    {
      name: "format",
      label: "Summary Format",
      type: "select",
      defaultValue: "bullets",
      options: [
        { value: "bullets", label: "Bullet points (3-5 key points)" },
        { value: "paragraph", label: "Short paragraph (2-3 sentences)" },
        { value: "oneliner", label: "One-line summary" },
        { value: "detailed", label: "Detailed summary with sections" }
      ],
      description: "How the summary should be formatted"
    },
    {
      name: "length",
      label: "Summary Length",
      type: "select",
      defaultValue: "medium",
      options: [
        { value: "brief", label: "Brief (1-2 sentences or 3 bullets)" },
        { value: "medium", label: "Medium (3-5 sentences or 5 bullets)" },
        { value: "detailed", label: "Detailed (full paragraph or 7+ bullets)" }
      ],
      description: "How long the summary should be"
    },
    {
      name: "focus",
      label: "Focus On (Optional)",
      type: "text",
      hasVariablePicker: true,
      placeholder: "e.g., action items, key decisions, main topics",
      description: "Optionally specify what aspects to emphasize"
    },
    {
      name: "model",
      label: "AI Model",
      type: "select",
      defaultValue: "gpt-4o-mini",
      options: [
        { value: "gpt-4o-mini", label: "GPT-4o Mini ⭐ Recommended" },
        { value: "gpt-4o", label: "GPT-4o (More capable)" },
        { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (Budget)" }
      ],
      description: "Which AI model to use"
    }
  ],

  outputSchema: [
    {
      name: "summary",
      label: "Summary",
      type: "string",
      description: "The generated summary"
    },
    {
      name: "keyPoints",
      label: "Key Points",
      type: "array",
      description: "Main points extracted (for bullet format)"
    },
    {
      name: "wordCount",
      label: "Word Count",
      type: "number",
      description: "Number of words in the summary"
    },
    {
      name: "originalLength",
      label: "Original Length",
      type: "number",
      description: "Word count of original text"
    },
    {
      name: "compressionRatio",
      label: "Compression Ratio",
      type: "number",
      description: "How much the text was compressed (e.g., 0.2 = 80% shorter)"
    }
  ]
}
