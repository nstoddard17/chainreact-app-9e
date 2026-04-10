import { callLLMWithRetry } from "@/lib/ai/llm-retry"
import { AI_MODELS } from "@/lib/ai/models"
import { createClient } from "@supabase/supabase-js"

import { logger } from '@/lib/utils/logger'

const MEMORY_DOC_TYPE = "memory"
const MEMORY_SCOPE = "user"
const MAX_MEMORIES = 20

interface MemoryEntry {
  fact: string
  category: string
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export class AIMemoryService {
  /**
   * Load user's memory document content for injection into assistant context
   */
  async loadUserMemory(userId: string): Promise<string | null> {
    try {
      const supabase = getSupabaseAdmin()

      const { data, error } = await supabase
        .from("user_memory_documents")
        .select("content, structured_data")
        .eq("user_id", userId)
        .eq("doc_type", MEMORY_DOC_TYPE)
        .eq("scope", MEMORY_SCOPE)
        .is("workflow_id", null)
        .order("last_accessed_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error || !data) return null

      // Update last_accessed_at
      if (data) {
        await supabase
          .from("user_memory_documents")
          .update({ last_accessed_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("doc_type", MEMORY_DOC_TYPE)
          .eq("scope", MEMORY_SCOPE)
          .is("workflow_id", null)
      }

      return data.content || null
    } catch (error) {
      logger.error("Failed to load user memory:", error)
      return null
    }
  }

  /**
   * Extract key facts/preferences from a conversation and save to memory
   */
  async extractAndSaveMemory(
    userId: string,
    conversationHistory: Array<{ role: string; content: string }>
  ): Promise<void> {
    // Only extract from conversations with at least 4 turns (2 user + 2 assistant)
    if (conversationHistory.length < 4) return

    try {
      // Load existing memory to avoid duplicates
      const existingMemory = await this.loadUserMemory(userId) || ""

      const historyText = conversationHistory
        .map(m => `${m.role}: ${m.content}`)
        .join("\n")

      const response = await callLLMWithRetry({
        model: AI_MODELS.fast,
        messages: [
          {
            role: "system",
            content: `You extract key user preferences and facts from conversations for future reference.
Rules:
- Only extract NEW information not already in existing memory
- Focus on: user preferences, communication style, frequently referenced projects/tools, role/team info
- Return a JSON array of objects: [{"fact": "...", "category": "preference|context|style"}]
- Return empty array [] if nothing new worth remembering
- Max 5 new facts per conversation
- Be concise — each fact should be one sentence`
          },
          {
            role: "user",
            content: `Existing memory:\n${existingMemory || "(none)"}\n\nNew conversation:\n${historyText}\n\nExtract new facts:`
          }
        ],
        temperature: 0.1,
        max_tokens: 500
      })

      const responseText = response.choices?.[0]?.message?.content || "[]"

      let newFacts: MemoryEntry[]
      try {
        const parsed = JSON.parse(responseText.replace(/```json?\n?/g, "").replace(/```/g, "").trim())
        newFacts = Array.isArray(parsed) ? parsed : []
      } catch {
        logger.info("No new memory facts extracted")
        return
      }

      if (newFacts.length === 0) return

      // Append new facts to existing memory
      const newEntries = newFacts.map(f => `- [${f.category}] ${f.fact}`).join("\n")
      const updatedContent = existingMemory
        ? `${existingMemory}\n${newEntries}`
        : newEntries

      // Trim to max entries
      const lines = updatedContent.split("\n").filter(l => l.trim().startsWith("-"))
      const trimmedContent = lines.slice(-MAX_MEMORIES).join("\n")

      await this.saveMemory(userId, trimmedContent)

      logger.info(`Saved ${newFacts.length} new memory facts for user ${userId}`)
    } catch (error) {
      logger.error("Failed to extract/save memory:", error)
    }
  }

  private async saveMemory(userId: string, content: string): Promise<void> {
    const supabase = getSupabaseAdmin()

    // Upsert — create or update the single memory document per user
    const { data: existing } = await supabase
      .from("user_memory_documents")
      .select("id")
      .eq("user_id", userId)
      .eq("doc_type", MEMORY_DOC_TYPE)
      .eq("scope", MEMORY_SCOPE)
      .is("workflow_id", null)
      .maybeSingle()

    if (existing) {
      await supabase
        .from("user_memory_documents")
        .update({
          content,
          updated_at: new Date().toISOString()
        })
        .eq("id", existing.id)
    } else {
      await supabase
        .from("user_memory_documents")
        .insert({
          user_id: userId,
          doc_type: MEMORY_DOC_TYPE,
          scope: MEMORY_SCOPE,
          title: "Assistant Memory",
          description: "Automatically extracted preferences and context from assistant conversations",
          content
        })
    }
  }

  /**
   * Format memory for injection into LLM system prompt
   */
  formatMemoryForPrompt(memory: string | null): string {
    if (!memory) return ""
    return `\nUSER CONTEXT & PREFERENCES (from previous conversations):\n${memory}\n\nUse this context to personalize your responses. Do not mention this memory explicitly unless the user asks about it.\n`
  }
}

export const aiMemoryService = new AIMemoryService()
