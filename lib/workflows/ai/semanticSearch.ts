/**
 * Semantic Search for Action Discovery
 * 
 * Uses embeddings and similarity search to find relevant actions
 */

import { ACTION_METADATA, ActionMetadata } from './actionMetadata'

/**
 * Semantic similarity calculation using cosine similarity
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  
  let dotProduct = 0
  let normA = 0
  let normB = 0
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Search for actions based on semantic similarity
 */
export async function searchActions(
  query: string,
  availableActionIds: string[],
  topK: number = 5
): Promise<Array<{ action: ActionMetadata, score: number }>> {
  // Get query embedding
  const queryEmbedding = await getEmbedding(query)
  
  // Calculate similarities for available actions
  const similarities: Array<{ action: ActionMetadata, score: number }> = []
  
  for (const actionId of availableActionIds) {
    const action = ACTION_METADATA[actionId]
    if (!action) continue
    
    // Get or compute action embedding
    let actionEmbedding = action.embedding
    if (!actionEmbedding) {
      // Compute embedding from action text
      const actionText = buildActionText(action)
      actionEmbedding = await getEmbedding(actionText)
      // Cache for future use
      action.embedding = actionEmbedding
    }
    
    const similarity = cosineSimilarity(queryEmbedding, actionEmbedding)
    similarities.push({ action, score: similarity })
  }
  
  // Sort by similarity and return top K
  similarities.sort((a, b) => b.score - a.score)
  return similarities.slice(0, topK)
}

/**
 * Build searchable text from action metadata
 */
function buildActionText(action: ActionMetadata): string {
  const parts = [
    action.name,
    action.description,
    ...action.tags,
    ...action.keywords,
    ...action.useCases,
    ...action.triggers,
    ...action.capabilities
  ]
  
  // Add example queries
  const examples = [
    ...(action.examples.support || []),
    ...(action.examples.notifications || []),
    ...(action.examples.dataProcessing || []),
    ...(action.examples.automation || [])
  ]
  
  for (const example of examples) {
    parts.push(example.userQuery)
    parts.push(example.intent)
    parts.push(example.scenario)
  }
  
  return parts.join(' ')
}

/**
 * Get embedding for text (simplified - would use real embedding API)
 */
async function getEmbedding(text: string): Promise<number[]> {
  // In production, this would call OpenAI embeddings API
  // For now, return a simple hash-based embedding
  const embedding = new Array(384).fill(0)
  
  // Simple hashing for demonstration
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i)
    const index = (charCode * 31 + i) % embedding.length
    embedding[index] += charCode / 1000
  }
  
  // Normalize
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
  return embedding.map(val => val / norm)
}

/**
 * Rank actions by multiple factors
 */
export function rankActions(
  actions: Array<{ action: ActionMetadata, score: number }>,
  context: {
    recentlyUsed?: string[]
    userPreferences?: string[]
    triggerType?: string
  }
): Array<{ action: ActionMetadata, score: number, reasoning: string }> {
  return actions.map(({ action, score }) => {
    let adjustedScore = score
    const reasoning = []
    
    // Boost recently used actions
    if (context.recentlyUsed?.includes(action.id)) {
      adjustedScore *= 1.2
      reasoning.push('Recently used')
    }
    
    // Boost actions matching user preferences
    if (context.userPreferences?.some(pref => 
      action.tags.includes(pref) || action.category === pref
    )) {
      adjustedScore *= 1.15
      reasoning.push('Matches preferences')
    }
    
    // Boost actions matching trigger type
    if (context.triggerType && action.triggers.some(trigger => 
      trigger.toLowerCase().includes(context.triggerType!.toLowerCase())
    )) {
      adjustedScore *= 1.3
      reasoning.push('Matches trigger type')
    }
    
    return {
      action,
      score: adjustedScore,
      reasoning: reasoning.join(', ') || 'Semantic match'
    }
  }).sort((a, b) => b.score - a.score)
}

/**
 * Find similar actions to a given action
 */
export async function findSimilarActions(
  actionId: string,
  availableActionIds: string[],
  topK: number = 3
): Promise<ActionMetadata[]> {
  const action = ACTION_METADATA[actionId]
  if (!action) return []
  
  // Search using action's description and tags
  const query = `${action.description} ${action.tags.join(' ')}`
  const results = await searchActions(
    query,
    availableActionIds.filter(id => id !== actionId),
    topK
  )
  
  return results.map(r => r.action)
}

/**
 * Suggest actions based on workflow context
 */
export async function suggestActions(
  workflowContext: {
    triggerType?: string
    existingActions: string[]
    workflowPurpose?: string
  },
  allActionIds: string[]
): Promise<Array<{ action: ActionMetadata, reason: string }>> {
  const suggestions: Array<{ action: ActionMetadata, reason: string }> = []
  
  // Filter to actions not already in workflow
  const availableIds = allActionIds.filter(id => 
    !workflowContext.existingActions.includes(id)
  )
  
  // Suggest based on trigger type
  if (workflowContext.triggerType) {
    for (const actionId of availableIds) {
      const action = ACTION_METADATA[actionId]
      if (!action) continue
      
      // Check if action commonly follows this trigger
      const matchesTrigger = action.triggers.some(trigger =>
        trigger.toLowerCase().includes(workflowContext.triggerType!.toLowerCase())
      )
      
      if (matchesTrigger) {
        suggestions.push({
          action,
          reason: `Commonly used with ${workflowContext.triggerType} triggers`
        })
      }
    }
  }
  
  // Suggest complementary actions
  for (const existingId of workflowContext.existingActions) {
    const existingAction = ACTION_METADATA[existingId]
    if (!existingAction) continue
    
    // Find actions that work well together
    if (existingAction.id.includes('email') && !workflowContext.existingActions.includes('slack_post_message')) {
      const slackAction = ACTION_METADATA['slack_post_message']
      if (slackAction) {
        suggestions.push({
          action: slackAction,
          reason: 'Add team notification alongside email'
        })
      }
    }
    
    if (existingAction.category === 'communication' && !workflowContext.existingActions.some(id => 
      ACTION_METADATA[id]?.category === 'database'
    )) {
      // Suggest database action for logging
      const airtableAction = ACTION_METADATA['airtable_create_record']
      if (airtableAction) {
        suggestions.push({
          action: airtableAction,
          reason: 'Log communications for tracking'
        })
      }
    }
  }
  
  // Suggest based on workflow purpose
  if (workflowContext.workflowPurpose) {
    const results = await searchActions(
      workflowContext.workflowPurpose,
      availableIds,
      3
    )
    
    for (const { action, score } of results) {
      if (score > 0.7) {
        suggestions.push({
          action,
          reason: 'Matches workflow purpose'
        })
      }
    }
  }
  
  // Remove duplicates and limit results
  const seen = new Set<string>()
  return suggestions.filter(({ action }) => {
    if (seen.has(action.id)) return false
    seen.add(action.id)
    return true
  }).slice(0, 5)
}

/**
 * Extract intent from user query
 */
export function extractIntent(query: string): {
  action: 'send' | 'create' | 'update' | 'delete' | 'get' | 'search' | 'notify' | 'process'
  target: string
  attributes: string[]
} {
  const query_lower = query.toLowerCase()
  
  // Action detection
  let action: any = 'process'
  if (query_lower.includes('send') || query_lower.includes('email')) action = 'send'
  else if (query_lower.includes('create') || query_lower.includes('add')) action = 'create'
  else if (query_lower.includes('update') || query_lower.includes('edit')) action = 'update'
  else if (query_lower.includes('delete') || query_lower.includes('remove')) action = 'delete'
  else if (query_lower.includes('get') || query_lower.includes('fetch')) action = 'get'
  else if (query_lower.includes('search') || query_lower.includes('find')) action = 'search'
  else if (query_lower.includes('notify') || query_lower.includes('alert')) action = 'notify'
  
  // Target detection
  let target = 'data'
  if (query_lower.includes('email')) target = 'email'
  else if (query_lower.includes('message')) target = 'message'
  else if (query_lower.includes('record')) target = 'record'
  else if (query_lower.includes('file')) target = 'file'
  else if (query_lower.includes('user')) target = 'user'
  else if (query_lower.includes('customer')) target = 'customer'
  else if (query_lower.includes('team')) target = 'team'
  
  // Attribute extraction
  const attributes: string[] = []
  if (query_lower.includes('urgent')) attributes.push('urgent')
  if (query_lower.includes('important')) attributes.push('important')
  if (query_lower.includes('daily')) attributes.push('recurring')
  if (query_lower.includes('summary')) attributes.push('summary')
  if (query_lower.includes('confirmation')) attributes.push('confirmation')
  
  return { action, target, attributes }
}

/**
 * Match intent to available actions
 */
export function matchIntentToActions(
  intent: ReturnType<typeof extractIntent>,
  availableActionIds: string[]
): Array<{ actionId: string, confidence: number }> {
  const matches: Array<{ actionId: string, confidence: number }> = []
  
  for (const actionId of availableActionIds) {
    const action = ACTION_METADATA[actionId]
    if (!action) continue
    
    let confidence = 0
    
    // Match action type
    if (intent.action === 'send' && actionId.includes('send')) confidence += 0.3
    if (intent.action === 'create' && actionId.includes('create')) confidence += 0.3
    if (intent.action === 'notify' && (actionId.includes('send') || actionId.includes('post'))) confidence += 0.2
    
    // Match target
    if (intent.target === 'email' && actionId.includes('email')) confidence += 0.3
    if (intent.target === 'message' && (actionId.includes('message') || actionId.includes('slack') || actionId.includes('discord'))) confidence += 0.3
    if (intent.target === 'record' && (actionId.includes('airtable') || actionId.includes('sheets'))) confidence += 0.3
    
    // Match attributes
    for (const attr of intent.attributes) {
      if (action.tags.includes(attr) || action.keywords.includes(attr)) {
        confidence += 0.1
      }
    }
    
    if (confidence > 0) {
      matches.push({ actionId, confidence: Math.min(confidence, 1) })
    }
  }
  
  return matches.sort((a, b) => b.confidence - a.confidence)
}