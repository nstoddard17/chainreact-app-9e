/**
 * Dynamic Template Learning System
 * Auto-generates workflow templates from user behavior patterns
 *
 * Purpose:
 * - Analyze clusters of similar prompts
 * - Generate regex patterns for matching
 * - Create reusable templates from common workflows
 * - Reduce LLM costs by identifying patterns
 *
 * How it works:
 * 1. User prompts are logged with their LLM-generated plans
 * 2. System finds clusters of similar prompts (5+ similar prompts)
 * 3. Generates a template from the most common plan structure
 * 4. Creates regex patterns to match future prompts
 * 5. New template is marked for admin validation
 * 6. Once validated, template is activated and used for matching
 */

import { createClient } from '@/utils/supabase/client'
import { logger } from '@/lib/utils/logger'
import { findSimilarPrompts } from './promptAnalytics'
import type { WorkflowTemplate, PlanNode } from './templateMatching'

export interface DynamicTemplate {
  id: string
  templateId: string
  templateName: string
  patterns: RegExp[]
  examplePrompts: string[]
  plan: PlanNode[]
  requiresProvider: boolean
  providerCategory?: string
  supportedProviders: string[]
  generatedFromPrompts: string[]
  sourceLlmResponses: number
  confidenceScore: number
  isActive: boolean
  isValidated: boolean
  createdAt: string
}

export interface TemplateGenerationResult {
  success: boolean
  templateId?: string
  confidence: number
  reason?: string
  template?: DynamicTemplate
}

/**
 * Analyze prompt clusters and generate templates for high-frequency patterns
 */
export async function generateTemplatesFromClusters(
  minSimilarPrompts: number = 5,
  minConfidence: number = 70
): Promise<TemplateGenerationResult[]> {
  try {
    const supabase = createClient()

    logger.info('[DynamicTemplates] Starting template generation from clusters...')

    // Get prompt clusters that are candidates for templates
    const { data: clusters, error: clusterError } = await supabase
      .from('prompt_clusters')
      .select('*')
      .eq('template_candidate', true)
      .gte('prompt_count', minSimilarPrompts)
      .is('template_id', null) // Only clusters that don't have a template yet
      .order('prompt_count', { ascending: false })
      .limit(20)

    if (clusterError) {
      logger.error('[DynamicTemplates] Failed to get clusters:', clusterError)
      return []
    }

    if (!clusters || clusters.length === 0) {
      logger.info('[DynamicTemplates] No template candidates found')
      return []
    }

    logger.info(`[DynamicTemplates] Found ${clusters.length} template candidates`)

    const results: TemplateGenerationResult[] = []

    for (const cluster of clusters) {
      try {
        const result = await generateTemplateFromCluster(cluster, minConfidence)
        results.push(result)

        if (result.success && result.templateId) {
          // Update cluster with template ID
          await supabase
            .from('prompt_clusters')
            .update({
              template_id: result.templateId,
              generated_at: new Date().toISOString()
            })
            .eq('id', cluster.id)

          logger.info(`[DynamicTemplates] ✅ Generated template: ${result.templateId}`)
        }

      } catch (error: any) {
        logger.error(`[DynamicTemplates] Error generating template for cluster ${cluster.id}:`, error)
        results.push({
          success: false,
          confidence: 0,
          reason: error.message
        })
      }
    }

    logger.info(`[DynamicTemplates] Generated ${results.filter(r => r.success).length}/${results.length} templates`)

    return results

  } catch (error: any) {
    logger.error('[DynamicTemplates] Error in generateTemplatesFromClusters:', error)
    return []
  }
}

/**
 * Generate a template from a single cluster
 */
async function generateTemplateFromCluster(
  cluster: any,
  minConfidence: number
): Promise<TemplateGenerationResult> {
  const supabase = createClient()

  // Get all prompts in this cluster
  const { data: prompts, error: promptError } = await supabase
    .from('workflow_prompts')
    .select('id, prompt, plan_nodes, detected_provider, metadata')
    .in('id', cluster.prompt_ids)

  if (promptError || !prompts || prompts.length === 0) {
    return {
      success: false,
      confidence: 0,
      reason: 'Failed to fetch prompts'
    }
  }

  // Extract common patterns
  const patterns = generatePatternsFromPrompts(prompts.map((p: any) => p.prompt))
  const examplePrompts = prompts.slice(0, 5).map((p: any) => p.prompt)

  // Analyze plan structure from the prompts
  // In real implementation, we'd fetch the actual plans from workflow_prompts.metadata
  // For now, we'll use a simplified approach
  const commonProvider = cluster.common_providers?.[0]
  const avgNodes = cluster.avg_node_count || 2

  // Generate template ID
  const templateId = `dynamic-${cluster.cluster_key.replace(/\s+/g, '-').substring(0, 50)}-${Date.now()}`

  // Calculate confidence score based on cluster quality
  const confidence = calculateConfidenceScore({
    promptCount: prompts.length,
    avgNodes,
    hasCommonProvider: !!commonProvider,
    patternCount: patterns.length
  })

  if (confidence < minConfidence) {
    return {
      success: false,
      confidence,
      reason: `Confidence ${confidence}% below minimum ${minConfidence}%`
    }
  }

  // Create the template
  // Note: In production, we'd analyze the actual workflow plans from the prompts
  // For now, we'll create a placeholder structure that needs admin validation
  const template: DynamicTemplate = {
    id: '', // Will be set by database
    templateId,
    templateName: `Auto: ${cluster.cluster_name}`,
    patterns: patterns.map(p => new RegExp(p, 'i')),
    examplePrompts,
    plan: [], // TODO: Extract from actual prompt plans
    requiresProvider: !!commonProvider,
    providerCategory: cluster.common_providers?.[0] ? 'email' : undefined, // TODO: Detect category
    supportedProviders: cluster.common_providers || [],
    generatedFromPrompts: cluster.prompt_ids,
    sourceLlmResponses: prompts.length,
    confidenceScore: confidence,
    isActive: false, // Requires validation
    isValidated: false,
    createdAt: new Date().toISOString()
  }

  // Store in database
  try {
    const { data, error } = await supabase
      .from('dynamic_templates')
      .insert({
        template_id: template.templateId,
        template_name: template.templateName,
        patterns: patterns.map(p => ({ pattern: p })),
        example_prompts: template.examplePrompts,
        plan: template.plan,
        requires_provider: template.requiresProvider,
        provider_category: template.providerCategory,
        supported_providers: template.supportedProviders,
        generated_from_prompts: template.generatedFromPrompts,
        source_llm_responses: template.sourceLlmResponses,
        confidence_score: template.confidenceScore,
        is_active: false,
        is_validated: false
      })
      .select('id')
      .single()

    if (error) {
      logger.error('[DynamicTemplates] Failed to store template:', error)
      return {
        success: false,
        confidence,
        reason: 'Database error'
      }
    }

    template.id = data.id

    return {
      success: true,
      templateId: template.templateId,
      confidence,
      template
    }

  } catch (error: any) {
    logger.error('[DynamicTemplates] Error storing template:', error)
    return {
      success: false,
      confidence,
      reason: error.message
    }
  }
}

/**
 * Generate regex patterns from a list of similar prompts
 */
function generatePatternsFromPrompts(prompts: string[]): string[] {
  // Extract common keywords
  const keywords = extractCommonKeywords(prompts)

  // Generate patterns that capture the essence of these prompts
  const patterns: string[] = []

  // Pattern 1: Main keyword combination
  if (keywords.length >= 2) {
    patterns.push(`${keywords[0]}.*${keywords[1]}`)
  }

  // Pattern 2: Reverse order
  if (keywords.length >= 2) {
    patterns.push(`${keywords[1]}.*${keywords[0]}`)
  }

  // Pattern 3: Exact phrase if prompts are very similar
  const longestCommonSubstring = findLongestCommonSubstring(prompts)
  if (longestCommonSubstring.length >= 10) {
    patterns.push(longestCommonSubstring)
  }

  // Pattern 4: Individual keywords as fallback
  keywords.slice(0, 3).forEach(keyword => {
    if (keyword.length >= 4) {
      patterns.push(keyword)
    }
  })

  return patterns.filter((p, i, arr) => arr.indexOf(p) === i) // Dedupe
}

/**
 * Extract common keywords from prompts
 */
function extractCommonKeywords(prompts: string[]): string[] {
  // Tokenize all prompts
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'when', 'where', 'why', 'how', 'all', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now', 'i', 'my', 'me', 'get', 'got', 'have', 'has', 'had', 'when'])

  const wordCounts = new Map<string, number>()

  prompts.forEach(prompt => {
    const words = prompt
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))

    words.forEach(word => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1)
    })
  })

  // Sort by frequency
  const sortedWords = Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)

  // Return top keywords that appear in at least 50% of prompts
  const minFrequency = Math.ceil(prompts.length * 0.5)
  return sortedWords.filter(word => (wordCounts.get(word) || 0) >= minFrequency)
}

/**
 * Find longest common substring among prompts
 */
function findLongestCommonSubstring(prompts: string[]): string {
  if (prompts.length === 0) return ''
  if (prompts.length === 1) return prompts[0]

  let longest = ''
  const first = prompts[0].toLowerCase()

  for (let i = 0; i < first.length; i++) {
    for (let j = i + 1; j <= first.length; j++) {
      const substring = first.substring(i, j)
      if (substring.length <= longest.length) continue

      const appearsInAll = prompts.every(p =>
        p.toLowerCase().includes(substring)
      )

      if (appearsInAll && substring.trim().length > longest.length) {
        longest = substring.trim()
      }
    }
  }

  return longest
}

/**
 * Calculate confidence score for a template
 */
function calculateConfidenceScore(factors: {
  promptCount: number
  avgNodes: number
  hasCommonProvider: boolean
  patternCount: number
}): number {
  let score = 0

  // Prompt count factor (max 40 points)
  score += Math.min(factors.promptCount * 5, 40)

  // Consistency factor (max 20 points)
  if (factors.avgNodes > 0 && factors.avgNodes < 10) {
    score += 20
  } else if (factors.avgNodes >= 10) {
    score += 10
  }

  // Provider consistency (max 20 points)
  if (factors.hasCommonProvider) {
    score += 20
  }

  // Pattern quality (max 20 points)
  score += Math.min(factors.patternCount * 5, 20)

  return Math.min(Math.round(score), 100)
}

/**
 * Load all active dynamic templates
 */
export async function loadDynamicTemplates(): Promise<WorkflowTemplate[]> {
  try {
    const supabase = createClient()

    const { data, error } = await supabase
      .from('dynamic_templates')
      .select('*')
      .eq('is_active', true)
      .eq('is_validated', true)

    if (error) {
      logger.error('[DynamicTemplates] Failed to load templates:', error)
      return []
    }

    if (!data || data.length === 0) {
      return []
    }

    logger.debug(`[DynamicTemplates] Loaded ${data.length} active templates`)

    // Convert to WorkflowTemplate format
    return data.map((template: any) => ({
      id: template.template_id,
      patterns: (template.patterns || []).map((p: any) => new RegExp(p.pattern || p, 'i')),
      description: template.template_name,
      requiresProvider: template.requires_provider ? [template.provider_category || 'email'] : [],
      plan: (providerId: string) => {
        // Return the stored plan with provider substitution
        return (template.plan || []).map((node: any) => ({
          ...node,
          providerId: template.requires_provider ? providerId : node.providerId
        }))
      }
    }))

  } catch (error: any) {
    logger.error('[DynamicTemplates] Error loading templates:', error)
    return []
  }
}

/**
 * Validate and activate a dynamic template (admin only)
 */
export async function validateTemplate(
  templateId: string,
  userId: string,
  activate: boolean = true
): Promise<boolean> {
  try {
    const supabase = createClient()

    const { error } = await supabase
      .from('dynamic_templates')
      .update({
        is_validated: true,
        validated_by: userId,
        validated_at: new Date().toISOString(),
        is_active: activate
      })
      .eq('template_id', templateId)

    if (error) {
      logger.error('[DynamicTemplates] Failed to validate template:', error)
      return false
    }

    logger.info(`[DynamicTemplates] ✅ Template ${templateId} validated and ${activate ? 'activated' : 'kept inactive'}`)

    return true

  } catch (error: any) {
    logger.error('[DynamicTemplates] Error validating template:', error)
    return false
  }
}

/**
 * Analyze a single prompt and potentially create a cluster
 */
export async function analyzePromptForClustering(
  promptId: string,
  prompt: string,
  minSimilarPrompts: number = 5
): Promise<void> {
  try {
    // Find similar prompts
    const similar = await findSimilarPrompts(prompt, 50) // 50% similarity threshold

    if (similar.length < minSimilarPrompts - 1) {
      // Not enough similar prompts yet
      return
    }

    const supabase = createClient()

    // Create or update cluster
    const clusterKey = prompt.toLowerCase().substring(0, 100)
    const promptIds = [promptId, ...similar.map(s => s.id)]

    const { error } = await supabase
      .from('prompt_clusters')
      .upsert({
        cluster_key: clusterKey,
        cluster_name: prompt.substring(0, 200),
        prompt_ids: promptIds,
        prompt_count: promptIds.length,
        template_candidate: promptIds.length >= minSimilarPrompts,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'cluster_key'
      })

    if (error) {
      logger.error('[DynamicTemplates] Failed to create/update cluster:', error)
      return
    }

    if (promptIds.length >= minSimilarPrompts) {
      logger.info(`[DynamicTemplates] 🎯 Cluster "${clusterKey}" reached ${promptIds.length} prompts - template candidate!`)
    }

  } catch (error: any) {
    logger.error('[DynamicTemplates] Error analyzing prompt for clustering:', error)
  }
}
