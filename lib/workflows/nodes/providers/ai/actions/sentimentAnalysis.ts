import * as React from "react"
import { NodeComponent } from "../../../types"

const SentimentIcon = ({ className }: { className?: string }) =>
  React.createElement("img", {
    src: "/integrations/ai.svg",
    alt: "Sentiment",
    className: className ? `object-contain ${className}` : "h-5 w-5 object-contain",
    width: 20,
    height: 20,
    draggable: false,
  })

/**
 * Sentiment Analysis Node
 *
 * Analyzes the emotional tone of text.
 * Returns positive, negative, or neutral with confidence score.
 */
export const sentimentAnalysisNode: NodeComponent = {
  type: "ai_sentiment",
  title: "Analyze Sentiment",
  description: "Detect the emotional tone of text (positive, negative, neutral)",
  icon: SentimentIcon,
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
      label: "Text to Analyze",
      type: "textarea",
      multiline: true,
      rows: 6,
      required: true,
      hasVariablePicker: true,
      placeholder: "{{trigger.email.body}} or paste text here",
      description: "The text content to analyze for sentiment"
    },
    {
      name: "granularity",
      label: "Analysis Depth",
      type: "select",
      defaultValue: "simple",
      options: [
        { value: "simple", label: "Simple (positive/negative/neutral)" },
        { value: "detailed", label: "Detailed (include mixed, very positive/negative)" },
        { value: "numeric", label: "Numeric score (-1 to +1)" }
      ],
      description: "How detailed the sentiment analysis should be"
    },
    {
      name: "includeEmotions",
      label: "Detect Specific Emotions",
      type: "select",
      defaultValue: "no",
      options: [
        { value: "no", label: "No - Just overall sentiment" },
        { value: "yes", label: "Yes - Detect joy, anger, sadness, etc." }
      ],
      description: "Whether to identify specific emotions"
    },
    {
      name: "model",
      label: "AI Model",
      type: "select",
      defaultValue: "gpt-4o-mini",
      options: [
        { value: "gpt-4o-mini", label: "GPT-4o Mini ⭐ Recommended" },
        { value: "gpt-4o", label: "GPT-4o (More nuanced)" },
        { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (Budget)" }
      ],
      description: "Which AI model to use"
    }
  ],

  outputSchema: [
    {
      name: "sentiment",
      label: "Sentiment",
      type: "string",
      description: "The overall sentiment (positive, negative, neutral)"
    },
    {
      name: "score",
      label: "Sentiment Score",
      type: "number",
      description: "Numeric score from -1 (very negative) to +1 (very positive)"
    },
    {
      name: "confidence",
      label: "Confidence",
      type: "number",
      description: "AI's confidence in the analysis (0-1)"
    },
    {
      name: "emotions",
      label: "Detected Emotions",
      type: "object",
      description: "Specific emotions detected (if enabled)"
    },
    {
      name: "primaryEmotion",
      label: "Primary Emotion",
      type: "string",
      description: "The dominant emotion (if emotion detection enabled)"
    },
    {
      name: "summary",
      label: "Analysis Summary",
      type: "string",
      description: "Brief explanation of the sentiment"
    }
  ]
}
