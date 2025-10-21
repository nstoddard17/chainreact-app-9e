import { NodeComponent } from "../../types"

import { aiAgentNode } from "./aiAgentNode"
import {
  summarizeActionSchema,
  extractActionSchema,
  sentimentActionSchema,
  translateActionSchema,
  generateActionSchema,
  classifyActionSchema,
} from "./actions/dataProcessing.schema"

/**
 * AI Nodes - Unified and Specialized
 *
 * aiAgentNode: Main unified AI agent (replaces old ai_message and ai_router)
 * Other nodes: Specialized single-purpose AI operations
 */
export const aiNodes: NodeComponent[] = [
  aiAgentNode,              // ⭐ NEW: Unified AI Agent (message + routing + hybrid)
  summarizeActionSchema,    // Summarize text
  extractActionSchema,      // Extract data
  sentimentActionSchema,    // Analyze sentiment
  translateActionSchema,    // Translate languages
  generateActionSchema,     // Generate content
  classifyActionSchema,     // Classify text
]

export {
  aiAgentNode,
  summarizeActionSchema,
  extractActionSchema,
  sentimentActionSchema,
  translateActionSchema,
  generateActionSchema,
  classifyActionSchema,
}
