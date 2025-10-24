import { NodeComponent } from "../../types"

import { aiAgentNode } from "./aiAgentNode"

/**
 * AI Nodes - Single Versatile AI Agent
 *
 * aiAgentNode: Unified AI agent that handles all AI operations based on the prompt:
 * - Summarization
 * - Data extraction
 * - Sentiment analysis
 * - Translation
 * - Content generation
 * - Text classification
 * - And any other AI task based on natural language instructions
 */
export const aiNodes: NodeComponent[] = [
  aiAgentNode,  // ⭐ Single versatile AI Agent - handles everything via prompt
]

export {
  aiAgentNode,
}
