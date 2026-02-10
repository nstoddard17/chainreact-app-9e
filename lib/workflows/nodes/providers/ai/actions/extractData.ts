import * as React from "react"
import { NodeComponent } from "../../../types"

const ExtractIcon = ({ className }: { className?: string }) =>
  React.createElement("img", {
    src: "/integrations/ai.svg",
    alt: "Extract Data",
    className: className ? `object-contain ${className}` : "h-5 w-5 object-contain",
    width: 20,
    height: 20,
    draggable: false,
  })

/**
 * Extract Data Node
 *
 * Extracts structured data from unstructured text.
 * Returns clean JSON with the specified fields.
 */
export const extractDataNode: NodeComponent = {
  type: "ai_extract",
  title: "Extract Data",
  description: "Pull specific information from text into structured data",
  icon: ExtractIcon,
  category: "AI & Automation",
  providerId: "ai",
  isTrigger: false,
  testable: true,
  producesOutput: true,
  billableTest: true, // AI calls cost money - deduct from user's task quota when testing
  testCost: 1,

  configSchema: [
    {
      name: "text",
      label: "Text to Extract From",
      type: "textarea",
      multiline: true,
      rows: 6,
      required: true,
      hasVariablePicker: true,
      placeholder: "{{trigger.email.body}} or paste text here",
      description: "The text content to extract data from"
    },
    {
      name: "fieldsToExtract",
      label: "Fields to Extract",
      type: "textarea",
      multiline: true,
      rows: 8,
      required: true,
      placeholder: `List the fields to extract (one per line):
name
email
phone
company
order_number
amount
date

Or describe what to look for:
"Extract the customer's name, email address, and any order numbers mentioned"`,
      description: "Specify the data fields you want the AI to extract"
    },
    {
      name: "outputFormat",
      label: "Output Format",
      type: "select",
      defaultValue: "object",
      options: [
        { value: "object", label: "JSON Object - { field: value }" },
        { value: "array", label: "JSON Array - [{ field, value }]" },
        { value: "csv", label: "CSV Format - field,value" }
      ],
      description: "How to structure the extracted data"
    },
    {
      name: "handleMissing",
      label: "If Field Not Found",
      type: "select",
      defaultValue: "null",
      options: [
        { value: "null", label: "Return null" },
        { value: "empty", label: "Return empty string" },
        { value: "omit", label: "Omit the field entirely" },
        { value: "unknown", label: "Return 'unknown'" }
      ],
      description: "What to do when a field can't be found"
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
      name: "data",
      label: "Extracted Data",
      type: "object",
      description: "The extracted fields as key-value pairs"
    },
    {
      name: "fieldsFound",
      label: "Fields Found",
      type: "array",
      description: "List of fields that were successfully extracted"
    },
    {
      name: "fieldsMissing",
      label: "Fields Missing",
      type: "array",
      description: "List of fields that couldn't be found"
    },
    {
      name: "confidence",
      label: "Confidence",
      type: "number",
      description: "AI's confidence in the extraction (0-1)"
    },
    {
      name: "rawJson",
      label: "Raw JSON",
      type: "string",
      description: "The extracted data as a JSON string"
    }
  ]
}
