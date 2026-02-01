import { NodeComponent } from "../../types"

import { aiAgentNode } from "./aiAgentNode"
import { aiPromptNode } from "./actions/aiPrompt"
import { summarizeTextNode } from "./actions/summarizeText"
import { extractDataNode } from "./actions/extractData"
import { classifyTextNode } from "./actions/classifyText"
import { sentimentAnalysisNode } from "./actions/sentimentAnalysis"
import { translateTextNode } from "./actions/translateText"
import { generateContentNode } from "./actions/generateContent"

/**
 * AI Nodes - Specialized AI Actions (like Zapier/Make.com)
 *
 * Specialized nodes for common AI tasks:
 * - aiPromptNode: Custom prompt for power users (like Zapier's "Send Prompt")
 * - summarizeTextNode: Create concise summaries
 * - extractDataNode: Pull structured data from text
 * - classifyTextNode: Categorize text into categories
 * - sentimentAnalysisNode: Detect emotional tone
 * - translateTextNode: Translate between languages
 * - generateContentNode: Create new content (emails, posts, etc.)
 *
 * Plus the full-featured AI Agent for complex multi-step tasks.
 */
export const aiNodes: NodeComponent[] = [
  // Specialized nodes (simple, focused - like Zapier/Make)
  aiPromptNode,           // 🎯 Custom prompt - power users
  summarizeTextNode,      // 📝 Summarization
  extractDataNode,        // 📋 Data extraction
  classifyTextNode,       // 🏷️ Classification
  sentimentAnalysisNode,  // 😊 Sentiment analysis
  translateTextNode,      // 🌐 Translation
  generateContentNode,    // ✨ Content generation

  // Full-featured agent (for complex tasks)
  aiAgentNode,            // 🤖 Full AI Agent with all features
]

export {
  aiAgentNode,
  aiPromptNode,
  summarizeTextNode,
  extractDataNode,
  classifyTextNode,
  sentimentAnalysisNode,
  translateTextNode,
  generateContentNode,
}
