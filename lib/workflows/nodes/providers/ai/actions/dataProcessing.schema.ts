import { NodeComponent } from "../../../types"
import { Bot } from "lucide-react"

const baseAiActionConfig = {
  icon: Bot,
  providerId: "ai",
  category: "AI & Automation",
  isTrigger: false,
  producesOutput: true,
  hideInActionSelection: true,
} satisfies Partial<NodeComponent>

export const summarizeActionSchema: NodeComponent = {
  type: "ai_action_summarize",
  title: "AI Summarize",
  description: "Summarize text with optional style or focus instructions.",
  ...baseAiActionConfig,
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
  outputSchema: [
    { name: "classification", label: "Classification", type: "string", description: "Selected classification label." },
    { name: "confidence", label: "Confidence", type: "number", description: "Confidence score for the classification." },
    { name: "categories", label: "Categories", type: "array", description: "Available categories considered for classification." },
    { name: "text", label: "Analyzed Text", type: "string", description: "The text that was classified." },
  ],
}
