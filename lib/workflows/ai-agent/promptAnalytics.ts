/**
 * Prompt Analytics Service
 * Tracks user prompts, template usage, and identifies template opportunities
 *
 * Purpose:
 * - Log every user prompt for pattern analysis
 * - Track template hit rate and LLM usage
 * - Identify common patterns that should become templates
 * - Calculate cost savings from template usage
 */

import { createClient } from '@/utils/supabase/client'
import { logger } from '@/lib/utils/logger'

export interface PromptLogEntry {
  userId: string
  workflowId?: string
  prompt: string
  templateId?: string
  usedTemplate: boolean
  templateSource?: 'built_in' | 'dynamic'
  usedLlm: boolean
  llmCost?: number
  detectedProvider?: string
  providerCategory?: string
  planNodes?: number
  planComplexity?: 'simple' | 'medium' | 'complex'
  planGenerated: boolean
}

export interface PromptUpdateData {
  promptId: string
  planBuilt?: boolean
  planExecuted?: boolean
  userSatisfaction?: number
  regenerated?: boolean
}

export interface TemplateCandidate {
  prompt: string
  frequency: number
  providersUsed: string[]
  avgComplexity: number
  buildCount: number
  lastSeen: string
}

export interface TemplatePerformance {
  templateId: string
  templateSource: string
  totalUses: number
  successRate: number
  plansBuilt: number
  plansExecuted: number
  totalCostSaved: number
  executionRate: number
  lastUsedAt: string
}

export interface DailyCostSavings {
  date: string
  totalPrompts: number
  templateUses: number
  llmUses: number
  costSaved: number
  llmCostSpent: number
  templateHitRate: number
}

/**
 * Normalize prompt for pattern matching
 * Removes extra spaces, converts to lowercase, removes punctuation
 */
function normalizePrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
}

/**
 * Determine plan complexity based on node count
 */
function getPlanComplexity(nodeCount: number): 'simple' | 'medium' | 'complex' {
  if (nodeCount <= 2) return 'simple'
  if (nodeCount <= 4) return 'medium'
  return 'complex'
}

/**
 * Log a user prompt with template/LLM usage
 */
export async function logPrompt(entry: PromptLogEntry): Promise<string | null> {
  try {
    const supabase = createClient()

    const { data, error } = await supabase
      .from('workflow_prompts')
      .insert({
        user_id: entry.userId,
        workflow_id: entry.workflowId,
        prompt: entry.prompt,
        normalized_prompt: normalizePrompt(entry.prompt),
        template_id: entry.templateId,
        used_template: entry.usedTemplate,
        template_source: entry.templateSource,
        used_llm: entry.usedLlm,
        llm_cost: entry.llmCost || (entry.usedLlm ? 0.03 : 0.0),
        detected_provider: entry.detectedProvider,
        provider_category: entry.providerCategory,
        plan_nodes: entry.planNodes,
        plan_complexity: entry.planComplexity || (entry.planNodes ? getPlanComplexity(entry.planNodes) : null),
        plan_generated: entry.planGenerated,
      })
      .select('id')
      .single()

    if (error) {
      logger.error('[PromptAnalytics] Failed to log prompt:', error)
      return null
    }

    logger.debug('[PromptAnalytics] Logged prompt:', {
      promptId: data.id,
      usedTemplate: entry.usedTemplate,
      templateId: entry.templateId,
      cost: entry.usedTemplate ? '$0.00' : `$${entry.llmCost || 0.03}`
    })

    return data.id

  } catch (error: any) {
    logger.error('[PromptAnalytics] Error logging prompt:', error)
    return null
  }
}

/**
 * Update a logged prompt with additional data
 * Used when user builds or executes the workflow
 */
export async function updatePrompt(update: PromptUpdateData): Promise<boolean> {
  try {
    const supabase = createClient()

    const updateData: any = {}
    if (update.planBuilt !== undefined) updateData.plan_built = update.planBuilt
    if (update.planExecuted !== undefined) updateData.plan_executed = update.planExecuted
    if (update.userSatisfaction !== undefined) updateData.user_satisfaction = update.userSatisfaction
    if (update.regenerated !== undefined) updateData.regenerated = update.regenerated

    const { error } = await supabase
      .from('workflow_prompts')
      .update(updateData)
      .eq('id', update.promptId)

    if (error) {
      logger.error('[PromptAnalytics] Failed to update prompt:', error)
      return false
    }

    logger.debug('[PromptAnalytics] Updated prompt:', {
      promptId: update.promptId,
      ...updateData
    })

    return true

  } catch (error: any) {
    logger.error('[PromptAnalytics] Error updating prompt:', error)
    return false
  }
}

/**
 * Get template candidates (prompts that appear frequently but don't have a template)
 */
export async function getTemplateCandidates(minFrequency: number = 3): Promise<TemplateCandidate[]> {
  try {
    const supabase = createClient()

    const { data, error } = await supabase
      .from('template_candidates')
      .select('*')
      .gte('frequency', minFrequency)
      .order('frequency', { ascending: false })
      .limit(50)

    if (error) {
      logger.error('[PromptAnalytics] Failed to get template candidates:', error)
      return []
    }

    return data.map((row: any) => ({
      prompt: row.normalized_prompt,
      frequency: row.frequency,
      providersUsed: row.providers_used || [],
      avgComplexity: parseFloat(row.avg_complexity) || 0,
      buildCount: row.build_count || 0,
      lastSeen: row.last_seen
    }))

  } catch (error: any) {
    logger.error('[PromptAnalytics] Error getting template candidates:', error)
    return []
  }
}

/**
 * Get template performance metrics
 */
export async function getTemplatePerformance(): Promise<TemplatePerformance[]> {
  try {
    const supabase = createClient()

    const { data, error } = await supabase
      .from('template_performance')
      .select('*')
      .order('total_uses', { ascending: false })

    if (error) {
      logger.error('[PromptAnalytics] Failed to get template performance:', error)
      return []
    }

    return data.map((row: any) => ({
      templateId: row.template_id,
      templateSource: row.template_source,
      totalUses: row.total_uses,
      successRate: parseFloat(row.success_rate) || 0,
      plansBuilt: row.plans_built,
      plansExecuted: row.plans_executed,
      totalCostSaved: parseFloat(row.total_cost_saved) || 0,
      executionRate: parseFloat(row.execution_rate) || 0,
      lastUsedAt: row.last_used_at
    }))

  } catch (error: any) {
    logger.error('[PromptAnalytics] Error getting template performance:', error)
    return []
  }
}

/**
 * Get daily cost savings for the last 30 days
 */
export async function getDailyCostSavings(days: number = 30): Promise<DailyCostSavings[]> {
  try {
    const supabase = createClient()

    const { data, error } = await supabase
      .from('daily_cost_savings')
      .select('*')
      .order('date', { ascending: false })
      .limit(days)

    if (error) {
      logger.error('[PromptAnalytics] Failed to get cost savings:', error)
      return []
    }

    return data.map((row: any) => ({
      date: row.date,
      totalPrompts: row.total_prompts,
      templateUses: row.template_uses,
      llmUses: row.llm_uses,
      costSaved: parseFloat(row.cost_saved) || 0,
      llmCostSpent: parseFloat(row.llm_cost_spent) || 0,
      templateHitRate: parseFloat(row.template_hit_rate) || 0
    }))

  } catch (error: any) {
    logger.error('[PromptAnalytics] Error getting cost savings:', error)
    return []
  }
}

/**
 * Find similar prompts to a given prompt
 * Used for clustering and template generation
 */
export async function findSimilarPrompts(
  prompt: string,
  minSimilarity: number = 3
): Promise<Array<{ id: string; prompt: string; similarity: number }>> {
  try {
    const supabase = createClient()
    const normalized = normalizePrompt(prompt)

    // Use PostgreSQL full-text search for similarity
    const { data, error } = await supabase
      .from('workflow_prompts')
      .select('id, prompt, normalized_prompt')
      .textSearch('prompt', normalized, {
        type: 'websearch',
        config: 'english'
      })
      .limit(20)

    if (error) {
      logger.error('[PromptAnalytics] Failed to find similar prompts:', error)
      return []
    }

    // Calculate simple similarity score based on word overlap
    const results = data.map((row: any) => {
      const similarity = calculateSimilarity(normalized, row.normalized_prompt)
      return {
        id: row.id,
        prompt: row.prompt,
        similarity
      }
    })

    // Filter by minimum similarity and sort
    return results
      .filter(r => r.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)

  } catch (error: any) {
    logger.error('[PromptAnalytics] Error finding similar prompts:', error)
    return []
  }
}

/**
 * Calculate similarity score between two normalized prompts
 * Simple word overlap algorithm
 */
function calculateSimilarity(prompt1: string, prompt2: string): number {
  const words1 = new Set(prompt1.split(' '))
  const words2 = new Set(prompt2.split(' '))

  const intersection = new Set([...words1].filter(w => words2.has(w)))
  const union = new Set([...words1, ...words2])

  // Jaccard similarity
  return (intersection.size / union.size) * 100
}

/**
 * Get total cost savings summary
 */
export async function getCostSavingsSummary(): Promise<{
  totalPrompts: number
  templateUses: number
  llmUses: number
  totalCostSaved: number
  totalCostSpent: number
  templateHitRate: number
  avgCostPerPrompt: number
}> {
  try {
    const supabase = createClient()

    const { data, error } = await supabase
      .from('workflow_prompts')
      .select('used_template, llm_cost')

    if (error) {
      logger.error('[PromptAnalytics] Failed to get cost summary:', error)
      return {
        totalPrompts: 0,
        templateUses: 0,
        llmUses: 0,
        totalCostSaved: 0,
        totalCostSpent: 0,
        templateHitRate: 0,
        avgCostPerPrompt: 0
      }
    }

    const totalPrompts = data.length
    const templateUses = data.filter((p: any) => p.used_template).length
    const llmUses = totalPrompts - templateUses
    const totalCostSaved = templateUses * 0.03
    const totalCostSpent = data.reduce((sum: number, p: any) => sum + (p.llm_cost || 0), 0)
    const templateHitRate = totalPrompts > 0 ? (templateUses / totalPrompts) * 100 : 0
    const avgCostPerPrompt = totalPrompts > 0 ? totalCostSpent / totalPrompts : 0

    return {
      totalPrompts,
      templateUses,
      llmUses,
      totalCostSaved,
      totalCostSpent,
      templateHitRate,
      avgCostPerPrompt
    }

  } catch (error: any) {
    logger.error('[PromptAnalytics] Error getting cost summary:', error)
    return {
      totalPrompts: 0,
      templateUses: 0,
      llmUses: 0,
      totalCostSaved: 0,
      totalCostSpent: 0,
      templateHitRate: 0,
      avgCostPerPrompt: 0
    }
  }
}
