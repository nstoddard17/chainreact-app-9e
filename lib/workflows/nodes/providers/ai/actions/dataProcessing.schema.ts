import { NodeComponent } from "../../../types"
import { Bot } from "lucide-react"
import { getTemplateOptionsForAction } from "./templates"

const modelField = {
  name: "model",
  label: "Model",
  type: "select",
  required: true,
  defaultValue: "gpt-4o-mini",
  options: [
    { value: "gpt-4o", label: "OpenAI GPT-4o" },
    { value: "gpt-4o-mini", label: "OpenAI GPT-4o mini" },
    { value: "o4-mini", label: "OpenAI o4-mini" },
    { value: "claude-3-haiku-20240307", label: "Anthropic Claude 3 Haiku" },
    { value: "claude-3-sonnet-20240229", label: "Anthropic Claude 3 Sonnet" }
  ],
  description: "Select the foundation model used to complete this step."
}

const baseAiActionConfig = {
  icon: Bot,
  providerId: "ai",
  category: "AI & Automation",
  isTrigger: false,
  producesOutput: true,
  hideInActionSelection: true,
  needsConfiguration: true,
} satisfies Partial<NodeComponent>

const createTemplateField = (actionType: string) => {
  const options = getTemplateOptionsForAction(actionType)
  if (options.length === 0) return null

  return {
    name: "template",
    label: "Template",
    type: "select" as const,
    defaultValue: "custom",
    options: [
      { value: "custom", label: "Custom", description: "Start from scratch with your own instructions." },
      ...options
    ],
    description: "Pick a preset to pre-fill the configuration or choose Custom to supply your own settings."
  }
}

const summarizeTemplateField = createTemplateField("ai_action_summarize")
const extractTemplateField = createTemplateField("ai_action_extract")
const sentimentTemplateField = createTemplateField("ai_action_sentiment")
const translateTemplateField = createTemplateField("ai_action_translate")
const generateTemplateField = createTemplateField("ai_action_generate")
const classifyTemplateField = createTemplateField("ai_action_classify")

export const summarizeActionSchema: NodeComponent = {
  type: "ai_action_summarize",
  title: "AI Summarize",
  description: "Summarize text with optional style or focus instructions.",
  ...baseAiActionConfig,
  configSchema: [
    ...(summarizeTemplateField ? [summarizeTemplateField] : []),
    modelField,
    {
      name: "inputText",
      label: "Text to Summarize",
      type: "textarea",
      required: true,
      placeholder: "Paste text or insert a variable like {{trigger.message.content}}",
      description: "Provide the raw text you want the AI to summarize."
    },
    {
      name: "maxLength",
      label: "Maximum Length",
      type: "number",
      defaultValue: 300,
      min: 50,
      max: 2000,
      step: 10,
      description: "Limit the length of the summary (in characters)."
    },
    {
      name: "style",
      label: "Preferred Style",
      type: "text",
      placeholder: "e.g. concise, bullet points, executive summary",
      description: "Optional style instructions for the summary tone or format."
    },
    {
      name: "focus",
      label: "Focus Points",
      type: "textarea",
      placeholder: "Highlight specific areas or questions to address in the summary.",
      description: "Optional list of focus areas. Separate multiple points with commas or new lines."
    }
  ],
  outputSchema: [
    { name: "summary", label: "Summary", type: "string", description: "Generated summary text." },
    { name: "originalLength", label: "Original Length", type: "number", description: "Length of the source text." },
    { name: "summaryLength", label: "Summary Length", type: "number", description: "Length of the generated summary." },
    { name: "style", label: "Style", type: "string", description: "Style used for summarization." },
    { name: "focus", label: "Focus", type: "string", description: "Focus areas provided to the model." },
  ],
}

export const extractActionSchema: NodeComponent = {
  type: "ai_action_extract",
  title: "AI Extract Information",
  description: "Extract structured information from text (emails, names, urls, custom prompts, etc).",
  ...baseAiActionConfig,
  configSchema: [
    ...(extractTemplateField ? [extractTemplateField] : []),
    modelField,
    {
      name: "inputText",
      label: "Text to Analyze",
      type: "textarea",
      required: true,
      placeholder: "Paste text or insert a variable.",
      description: "Provide the source text that contains the details you want to extract."
    },
    {
      name: "extractionType",
      label: "Extraction Type",
      type: "select",
      defaultValue: "entities",
      options: [
        { value: "entities", label: "Entities (names, emails, phone numbers, etc.)" },
        { value: "keywords", label: "Keywords" },
        { value: "custom", label: "Custom Instructions" }
      ],
      description: "Select the type of extraction you want to perform."
    },
    {
      name: "instructions",
      label: "Extraction Instructions",
      type: "textarea",
      placeholder: "Optional detailed instructions or expected JSON schema.",
      description: "Provide custom guidance for the AI when using the custom extraction type."
    },
    {
      name: "returnFormat",
      label: "Return Format",
      type: "select",
      defaultValue: "auto",
      options: [
        { value: "auto", label: "Auto detect" },
        { value: "json", label: "JSON" },
        { value: "array", label: "Array" },
        { value: "text", label: "Plain text" }
      ],
      description: "Choose how the extracted data should be returned."
    }
  ],
  outputSchema: [
    { name: "extracted", label: "Extracted Data", type: "object", description: "Structured extraction result (string, list, or JSON)." },
    { name: "extractionType", label: "Extraction Type", type: "string", description: "The configured extraction type." },
    { name: "returnFormat", label: "Return Format", type: "string", description: "Format used for the extraction result." },
    { name: "originalText", label: "Original Text", type: "string", description: "Text that was analyzed." },
  ],
}

export const sentimentActionSchema: NodeComponent = {
  type: "ai_action_sentiment",
  title: "AI Sentiment Analysis",
  description: "Analyze tone or sentiment for a given message.",
  ...baseAiActionConfig,
  configSchema: [
    ...(sentimentTemplateField ? [sentimentTemplateField] : []),
    modelField,
    {
      name: "inputText",
      label: "Text to Analyze",
      type: "textarea",
      required: true,
      placeholder: "Paste text or drop a variable.",
      description: "Provide the message or content whose sentiment you want to evaluate."
    },
    {
      name: "labels",
      label: "Custom Sentiment Labels",
      type: "textarea",
      placeholder: "positive, neutral, negative",
      description: "Optional custom labels. Separate multiple labels with commas or new lines."
    },
    {
      name: "confidence",
      label: "Include Confidence Score",
      type: "boolean",
      defaultValue: true,
      description: "Include a confidence score for the sentiment classification."
    }
  ],
  outputSchema: [
    { name: "sentiment", label: "Sentiment", type: "string", description: "Sentiment classification (positive/negative/neutral/etc)." },
    { name: "confidence", label: "Confidence", type: "number", description: "Confidence score for the sentiment classification." },
    { name: "text", label: "Analyzed Text", type: "string", description: "Text that was evaluated." },
  ],
}

export const translateActionSchema: NodeComponent = {
  type: "ai_action_translate",
  title: "AI Translate",
  description: "Translate text between languages or normalize language usage.",
  ...baseAiActionConfig,
  configSchema: [
    ...(translateTemplateField ? [translateTemplateField] : []),
    modelField,
    {
      name: "inputText",
      label: "Text to Translate",
      type: "textarea",
      required: true,
      placeholder: "Provide text or variable reference.",
      description: "Source text that will be translated."
    },
    {
      name: "targetLanguage",
      label: "Target Language",
      type: "text",
      defaultValue: "en",
      placeholder: "e.g. en, fr, es",
      description: "Language code to translate into."
    },
    {
      name: "sourceLanguage",
      label: "Source Language",
      type: "text",
      defaultValue: "auto",
      placeholder: "auto (detect) or specify, e.g. en",
      description: "Language code of the original text. Use auto to detect automatically."
    }
  ],
  outputSchema: [
    { name: "originalText", label: "Original Text", type: "string", description: "Input text before translation." },
    { name: "translatedText", label: "Translated Text", type: "string", description: "The translated output." },
    { name: "sourceLanguage", label: "Source Language", type: "string", description: "Detected or provided source language." },
    { name: "targetLanguage", label: "Target Language", type: "string", description: "Language the text was translated into." },
  ],
}

export const generateActionSchema: NodeComponent = {
  type: "ai_action_generate",
  title: "AI Generate Content",
  description: "Generate custom content such as replies, summaries, or formatted documents.",
  ...baseAiActionConfig,
  configSchema: [
    ...(generateTemplateField ? [generateTemplateField] : []),
    modelField,
    {
      name: "prompt",
      label: "Prompt",
      type: "textarea",
      placeholder: "Describe what the AI should produce. You can include variables like {{support-summarize.summary}}.",
      description: "Primary instruction or prompt for the AI.",
      defaultValue: "Use the structured context provided to craft a clear, helpful response. Address the customer's concern, acknowledge their situation, reference the ticket priority if provided (e.g. {{priority}}), and outline next steps. Maintain a confident and empathetic tone."
    },
    {
      name: "contentType",
      label: "Content Type",
      type: "select",
      defaultValue: "response",
      options: [
        { value: "response", label: "Response / Reply" },
        { value: "email", label: "Email" },
        { value: "summary", label: "Summary" },
        { value: "report", label: "Report" },
        { value: "custom", label: "Custom" }
      ],
      description: "Select the type of content to generate."
    },
    {
      name: "tone",
      label: "Tone",
      type: "select",
      defaultValue: "neutral",
      options: [
        { value: "friendly", label: "Friendly" },
        { value: "professional", label: "Professional" },
        { value: "casual", label: "Casual" },
        { value: "neutral", label: "Neutral" },
        { value: "formal", label: "Formal" }
      ],
      description: "Set the desired tone of the generated content."
    },
    {
      name: "length",
      label: "Length",
      type: "select",
      defaultValue: "medium",
      options: [
        { value: "short", label: "Short" },
        { value: "medium", label: "Medium" },
        { value: "long", label: "Long" }
      ],
      description: "Approximate length of the generated content."
    },
    {
      name: "temperature",
      label: "Creativity (Temperature)",
      type: "number",
      defaultValue: 0.7,
      min: 0,
      max: 1,
      step: 0.1,
      description: "Higher values create more imaginative responses; lower values stay focused."
    },
    {
      name: "maxTokens",
      label: "Maximum Tokens",
      type: "number",
      defaultValue: 300,
      min: 50,
      max: 2000,
      step: 25,
      description: "Limit the size of the generated response."
    },
    {
      name: "inputData",
      label: "Structured Variables",
      type: "object",
      hidden: true,
      defaultValue: {}
    }
  ],
  outputSchema: [
    { name: "content", label: "Generated Content", type: "string", description: "Primary generated text." },
    { name: "contentType", label: "Content Type", type: "string", description: "Type of content generated (email, summary, etc)." },
    { name: "tone", label: "Tone", type: "string", description: "Requested tone for the generated content." },
    { name: "length", label: "Length", type: "string", description: "Requested length of the output." },
    { name: "inputData", label: "Input Data", type: "object", description: "Structured data that was provided to the model." },
    { name: "timestamp", label: "Generated At", type: "string", description: "Timestamp when the content was generated." },
  ],
}

export const classifyActionSchema: NodeComponent = {
  type: "ai_action_classify",
  title: "AI Classify",
  description: "Assign categories or labels to text based on provided options.",
  ...baseAiActionConfig,
  configSchema: [
    ...(classifyTemplateField ? [classifyTemplateField] : []),
    modelField,
    {
      name: "inputText",
      label: "Text to Classify",
      type: "textarea",
      required: true,
      placeholder: "Paste text or insert a variable.",
      description: "Provide the content that should be classified."
    },
    {
      name: "categories",
      label: "Categories",
      type: "textarea",
      placeholder: "Enter one category per line or separated by commas.",
      description: "List the possible categories the AI can choose from."
    },
    {
      name: "confidence",
      label: "Include Confidence Score",
      type: "boolean",
      defaultValue: true,
      description: "Include how confident the AI is in its classification."
    }
  ],
  outputSchema: [
    { name: "classification", label: "Classification", type: "string", description: "Selected classification label." },
    { name: "confidence", label: "Confidence", type: "number", description: "Confidence score for the classification." },
    { name: "categories", label: "Categories", type: "array", description: "Available categories considered for classification." },
    { name: "text", label: "Analyzed Text", type: "string", description: "The text that was classified." },
  ],
}
