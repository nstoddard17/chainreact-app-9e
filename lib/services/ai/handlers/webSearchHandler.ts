import { BaseActionHandler } from "./baseActionHandler"
import { IntentAnalysisResult, Integration } from "../aiIntentAnalysisService"
import { ActionExecutionResult } from "../aiActionExecutionService"
import { callLLMWithRetry } from "@/lib/ai/llm-retry"
import { AI_MODELS } from "@/lib/ai/models"

import { logger } from '@/lib/utils/logger'

interface SerperResult {
  title: string
  link: string
  snippet: string
  position: number
}

export class WebSearchHandler extends BaseActionHandler {
  async handleQuery(
    intent: IntentAnalysisResult,
    _integrations: Integration[],
    _userId: string,
    _supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    this.logHandlerStart("Web Search", intent)

    const parameters = intent.parameters || {}
    const query = parameters.query || parameters.search || parameters.question || ""

    if (!query) {
      return this.getErrorResponse("What would you like me to search the web for?")
    }

    const apiKey = process.env.SERPER_API_KEY
    if (!apiKey) {
      return this.getErrorResponse(
        "Web search is not configured yet. Please ask an admin to add the SERPER_API_KEY environment variable."
      )
    }

    try {
      // Search the web via Serper API
      const searchResults = await this.searchWeb(query, apiKey)

      if (searchResults.length === 0) {
        return {
          content: `I couldn't find any relevant results for "${query}". Try rephrasing your search.`,
          metadata: { type: "web_search", query, results: [] }
        }
      }

      // Synthesize an answer from the search results using LLM
      const answer = await this.synthesizeAnswer(query, searchResults)

      // Build source citations
      const sources = searchResults.slice(0, 5).map((r, i) => ({
        index: i + 1,
        title: r.title,
        url: r.link,
        snippet: r.snippet
      }))

      return {
        content: answer,
        metadata: {
          type: "web_search",
          query,
          sources
        }
      }
    } catch (error: any) {
      logger.error("❌ Web search error:", error)
      return this.getErrorResponse("Web search failed. Please try again.")
    }
  }

  async handleAction(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    // Web search is read-only, route to handleQuery
    return this.handleQuery(intent, integrations, userId, supabaseAdmin)
  }

  private async searchWeb(query: string, apiKey: string): Promise<SerperResult[]> {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        q: query,
        num: 5
      })
    })

    if (!response.ok) {
      throw new Error(`Serper API error: ${response.status}`)
    }

    const data = await response.json()
    const organic = data.organic || []

    return organic.map((item: any, index: number) => ({
      title: item.title || "",
      link: item.link || "",
      snippet: item.snippet || "",
      position: index + 1
    }))
  }

  private async synthesizeAnswer(query: string, results: SerperResult[]): Promise<string> {
    const sourcesContext = results.map((r, i) =>
      `[${i + 1}] ${r.title}\n${r.snippet}\nURL: ${r.link}`
    ).join("\n\n")

    const systemPrompt = `You are a helpful assistant. Answer the user's question using the search results provided.
Be concise and informative. Include numbered citations like [1], [2] when referencing information from specific sources.
If the search results don't contain enough information, say so honestly.`

    const userPrompt = `Question: ${query}\n\nSearch Results:\n${sourcesContext}\n\nProvide a clear, cited answer:`

    const response = await callLLMWithRetry({
      model: AI_MODELS.fast,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 1000
    })

    return response.choices?.[0]?.message?.content || "I was unable to synthesize an answer from the search results."
  }
}
