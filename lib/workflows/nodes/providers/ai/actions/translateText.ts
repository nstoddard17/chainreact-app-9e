import * as React from "react"
import { NodeComponent } from "../../../types"

const TranslateIcon = ({ className }: { className?: string }) =>
  React.createElement("img", {
    src: "/integrations/ai.svg",
    alt: "Translate",
    className: className ? `object-contain ${className}` : "h-5 w-5 object-contain",
    width: 20,
    height: 20,
    draggable: false,
  })

/**
 * Translate Text Node
 *
 * Translates text between languages using AI.
 * Preserves formatting and context better than simple translation.
 */
export const translateTextNode: NodeComponent = {
  type: "ai_translate",
  title: "Translate Text",
  description: "Translate text to another language",
  icon: TranslateIcon,
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
      label: "Text to Translate",
      type: "textarea",
      multiline: true,
      rows: 6,
      required: true,
      hasVariablePicker: true,
      placeholder: "{{trigger.email.body}} or paste text here",
      description: "The text content to translate"
    },
    {
      name: "targetLanguage",
      label: "Translate To",
      type: "select",
      required: true,
      defaultValue: "spanish",
      options: [
        { value: "spanish", label: "Spanish" },
        { value: "french", label: "French" },
        { value: "german", label: "German" },
        { value: "italian", label: "Italian" },
        { value: "portuguese", label: "Portuguese" },
        { value: "chinese", label: "Chinese (Simplified)" },
        { value: "chinese_traditional", label: "Chinese (Traditional)" },
        { value: "japanese", label: "Japanese" },
        { value: "korean", label: "Korean" },
        { value: "arabic", label: "Arabic" },
        { value: "hindi", label: "Hindi" },
        { value: "russian", label: "Russian" },
        { value: "dutch", label: "Dutch" },
        { value: "polish", label: "Polish" },
        { value: "turkish", label: "Turkish" },
        { value: "vietnamese", label: "Vietnamese" },
        { value: "thai", label: "Thai" },
        { value: "indonesian", label: "Indonesian" },
        { value: "other", label: "Other (specify below)" }
      ],
      description: "Target language for translation"
    },
    {
      name: "customLanguage",
      label: "Custom Language",
      type: "text",
      dependsOn: "targetLanguage",
      visibilityCondition: { field: "targetLanguage", operator: "equals", value: "other" },
      required: true,
      placeholder: "e.g., Swedish, Hebrew, Swahili",
      description: "Specify the target language"
    },
    {
      name: "sourceLanguage",
      label: "Source Language",
      type: "select",
      defaultValue: "auto",
      options: [
        { value: "auto", label: "Auto-detect" },
        { value: "english", label: "English" },
        { value: "spanish", label: "Spanish" },
        { value: "french", label: "French" },
        { value: "german", label: "German" },
        { value: "chinese", label: "Chinese" },
        { value: "japanese", label: "Japanese" },
        { value: "other", label: "Other" }
      ],
      description: "Source language (auto-detect recommended)"
    },
    {
      name: "preserveFormatting",
      label: "Preserve Formatting",
      type: "select",
      defaultValue: "yes",
      options: [
        { value: "yes", label: "Yes - Keep markdown, HTML, line breaks" },
        { value: "no", label: "No - Plain text only" }
      ],
      description: "Whether to preserve original formatting"
    },
    {
      name: "tone",
      label: "Translation Tone",
      type: "select",
      defaultValue: "neutral",
      options: [
        { value: "neutral", label: "Neutral - Standard translation" },
        { value: "formal", label: "Formal - Professional, polished" },
        { value: "casual", label: "Casual - Relaxed, conversational" },
        { value: "literal", label: "Literal - Word-for-word" }
      ],
      description: "The tone/style of the translation"
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
      name: "translatedText",
      label: "Translated Text",
      type: "string",
      description: "The translated text"
    },
    {
      name: "sourceLanguage",
      label: "Detected Source Language",
      type: "string",
      description: "The language the original text was in"
    },
    {
      name: "targetLanguage",
      label: "Target Language",
      type: "string",
      description: "The language translated to"
    },
    {
      name: "confidence",
      label: "Confidence",
      type: "number",
      description: "AI's confidence in the translation (0-1)"
    },
    {
      name: "characterCount",
      label: "Character Count",
      type: "number",
      description: "Number of characters translated"
    }
  ]
}
