/**
 * Master Prompt Builder System
 * 
 * Dynamically generates comprehensive prompts for AI routing and field generation
 */

import { ACTION_METADATA, ActionMetadata, ActionExample } from './actionMetadata'
import { AI_ROUTER_TEMPLATES } from '../nodes/providers/ai/aiRouterNode'

export interface PromptContext {
  template?: string // Router template being used
  availableActions: string[] // Action IDs available in workflow
  triggerType?: string // Type of trigger in workflow
  userPreferences?: {
    tone?: 'professional' | 'casual' | 'friendly' | 'technical'
    verbosity?: 'concise' | 'detailed' | 'comprehensive'
    industry?: string
  }
  workflowContext?: {
    name?: string
    description?: string
    purpose?: string
  }
}

export interface GeneratedPrompt {
  system: string
  examples: string
  constraints: string
  full: string
}

/**
 * Build comprehensive master prompt for AI Router
 */
export function buildMasterPrompt(context: PromptContext): GeneratedPrompt {
  const systemPrompt = buildSystemPrompt(context)
  const examplesPrompt = buildExamplesPrompt(context)
  const constraintsPrompt = buildConstraintsPrompt(context)
  
  return {
    system: systemPrompt,
    examples: examplesPrompt,
    constraints: constraintsPrompt,
    full: `${systemPrompt}\n\n${examplesPrompt}\n\n${constraintsPrompt}`
  }
}

/**
 * Build system prompt with ChainReact understanding
 */
function buildSystemPrompt(context: PromptContext): string {
  let prompt = `You are ChainReact AI, an intelligent workflow automation assistant that helps route and configure automated workflows.

ROLE:
You analyze incoming data (triggers) and determine the best actions to take based on the content and context. You understand various integration platforms and can intelligently route workflows through appropriate paths.

CORE CAPABILITIES:
1. Intent Recognition - Understand what users want to achieve from their messages
2. Action Selection - Choose the most appropriate actions from available options
3. Field Generation - Create contextually appropriate content for action fields
4. Variable Resolution - Extract and use data from triggers and previous actions
5. Multi-Path Routing - Determine if multiple actions should be triggered

WORKFLOW CONTEXT:`

  if (context.workflowContext) {
    prompt += `
- Workflow Name: ${context.workflowContext.name || 'Not specified'}
- Purpose: ${context.workflowContext.purpose || 'General automation'}
- Description: ${context.workflowContext.description || 'No description'}`
  }

  if (context.template && AI_ROUTER_TEMPLATES[context.template as keyof typeof AI_ROUTER_TEMPLATES]) {
    const template = AI_ROUTER_TEMPLATES[context.template as keyof typeof AI_ROUTER_TEMPLATES]
    prompt += `

ROUTING TEMPLATE: ${template.name}
${template.systemPrompt}`
  }

  // Add available actions section
  prompt += `

AVAILABLE ACTIONS:
${buildActionsSection(context.availableActions)}`

  return prompt
}

/**
 * Build actions section with detailed metadata
 */
function buildActionsSection(actionIds: string[]): string {
  const sections: string[] = []
  
  // Group actions by category
  const categorized: Record<string, ActionMetadata[]> = {}
  
  for (const actionId of actionIds) {
    const metadata = ACTION_METADATA[actionId]
    if (metadata) {
      if (!categorized[metadata.category]) {
        categorized[metadata.category] = []
      }
      categorized[metadata.category].push(metadata)
    }
  }
  
  // Build sections for each category
  for (const [category, actions] of Object.entries(categorized)) {
    sections.push(`\n=== ${category.toUpperCase()} ACTIONS ===`)
    
    for (const action of actions) {
      sections.push(`
${action.name} (${action.id}):
  Description: ${action.description}
  Use when: ${action.useCases.slice(0, 3).join(', ')}
  Triggers: ${action.triggers.slice(0, 3).join(', ')}
  Tags: ${action.tags.slice(0, 5).join(', ')}
  Capabilities: ${action.capabilities.slice(0, 3).join(', ')}`)
      
      if (action.avoidWhen.length > 0) {
        sections.push(`  Avoid when: ${action.avoidWhen[0]}`)
      }
    }
  }
  
  return sections.join('\n')
}

/**
 * Build examples section from action metadata
 */
function buildExamplesPrompt(context: PromptContext): string {
  let prompt = `EXAMPLES OF ACTION USAGE:

These examples show how to match user intents to appropriate actions and configurations:`

  const examples: string[] = []
  
  // Collect examples from all available actions
  for (const actionId of context.availableActions) {
    const metadata = ACTION_METADATA[actionId]
    if (!metadata) continue
    
    // Get examples from different categories
    const allExamples: ActionExample[] = []
    
    if (metadata.examples.support) allExamples.push(...metadata.examples.support)
    if (metadata.examples.notifications) allExamples.push(...metadata.examples.notifications)
    if (metadata.examples.dataProcessing) allExamples.push(...metadata.examples.dataProcessing)
    if (metadata.examples.automation) allExamples.push(...metadata.examples.automation)
    
    // Add up to 2 examples per action
    for (const example of allExamples.slice(0, 2)) {
      examples.push(`
Example: "${example.userQuery}"
Scenario: ${example.scenario}
Action: ${metadata.name} (${metadata.id})
Intent: ${example.intent}
Configuration Pattern:
${JSON.stringify(example.configuration, null, 2)}
`)
    }
  }
  
  // Add examples
  prompt += examples.slice(0, 10).join('\n---\n')
  
  return prompt
}

/**
 * Build constraints and rules section
 */
function buildConstraintsPrompt(context: PromptContext): string {
  let prompt = `ROUTING RULES AND CONSTRAINTS:

1. CONFIDENCE SCORING:
   - High confidence (>0.8): Clear intent matching examples
   - Medium confidence (0.5-0.8): Partial match or ambiguous intent
   - Low confidence (<0.5): Unclear intent, suggest alternatives

2. FIELD GENERATION RULES:
   - When generating email subjects, be concise and descriptive
   - When generating email bodies, match the tone to the context
   - For formal communication, use professional language
   - For team communication, be casual but clear
   - Always personalize with available data

3. VARIABLE USAGE:
   - Use {{trigger.x.y}} format for accessing trigger data
   - Use {{nodeId.field}} for previous node outputs
   - Use {{AI:instruction}} for AI-generated content
   - Extract real values when available, generate appropriate ones when not

4. MULTI-PATH DECISIONS:
   - Can trigger multiple paths if content matches multiple intents
   - Consider logical flow - don't trigger conflicting actions
   - Priority matters - urgent items should trigger immediate actions`

  if (context.userPreferences?.tone) {
    prompt += `

5. TONE PREFERENCE: ${context.userPreferences.tone}
   - Adjust all generated content to match this tone`
  }

  prompt += `

6. OUTPUT FORMAT:
   For routing decisions, respond with:
   {
     "primary_action": "action_id",
     "confidence": 0.0-1.0,
     "reasoning": "why this action was chosen",
     "alternatives": [
       {
         "action": "alternative_action_id",
         "confidence": 0.0-1.0,
         "reason": "why this could work"
       }
     ],
     "suggested_config": {
       "field_name": "suggested_value"
     }
   }

7. ERROR HANDLING:
   - If no good match found, suggest closest alternatives
   - Explain why certain actions weren't chosen
   - Provide helpful context for uncertain decisions`

  return prompt
}

/**
 * Build field-specific prompt for AI field generation
 */
export function buildFieldPrompt(
  fieldName: string,
  fieldType: string,
  fieldConstraints: any,
  context: any
): string {
  let prompt = `Generate an appropriate value for the field "${fieldName}".

FIELD DETAILS:
- Type: ${fieldType}
- Purpose: ${fieldConstraints?.description || 'Not specified'}`

  if (fieldConstraints?.maxLength) {
    prompt += `\n- Maximum length: ${fieldConstraints.maxLength} characters`
  }
  
  if (fieldConstraints?.options) {
    prompt += `\n- Must be one of: ${fieldConstraints.options.join(', ')}`
  }
  
  if (fieldConstraints?.format) {
    prompt += `\n- Format: ${fieldConstraints.format}`
  }

  prompt += `

CONTEXT DATA:
${JSON.stringify(context, null, 2)}

GENERATION RULES:
1. Use real data from context when available
2. Generate realistic placeholder data when not available
3. Match the field type exactly
4. For emails, ensure valid format
5. For names, use proper capitalization
6. For dates, use ISO format
7. Keep within constraints

Respond with ONLY the generated value, no explanation.`

  return prompt
}

/**
 * Build template-specific prompt overlay
 */
export function buildTemplatePrompt(templateId: string): string {
  const template = AI_ROUTER_TEMPLATES[templateId as keyof typeof AI_ROUTER_TEMPLATES]
  if (!template) return ''
  
  let prompt = `SPECIALIZED TEMPLATE: ${template.name}

${template.systemPrompt}

TEMPLATE-SPECIFIC ROUTING:
`

  // Add template-specific output paths
  if (template.defaultOutputs) {
    prompt += '\nExpected output paths:\n'
    for (const output of template.defaultOutputs) {
      prompt += `- ${output.name}: ${output.description || 'No description'}\n`
    }
  }

  return prompt
}

/**
 * Combine prompts for specific use case
 */
export function combinePrompts(
  base: string,
  template?: string,
  context?: string
): string {
  const parts = [base]
  
  if (template) {
    parts.push(`\n\n${template}`)
  }
  
  if (context) {
    parts.push(`\n\nCURRENT CONTEXT:\n${context}`)
  }
  
  return parts.join('')
}

/**
 * Generate prompt for action discovery
 */
export function buildActionDiscoveryPrompt(
  userIntent: string,
  availableActions: string[]
): string {
  return `Analyze the user's intent and suggest the best action(s) to take.

USER INTENT: "${userIntent}"

AVAILABLE ACTIONS:
${availableActions.map(id => {
  const metadata = ACTION_METADATA[id]
  if (!metadata) return `- ${id}`
  return `- ${metadata.name} (${id}): ${metadata.description}`
}).join('\n')}

Consider:
1. Which action(s) best match the intent?
2. Are multiple actions needed?
3. What order should they execute?
4. What configuration would be needed?

Respond with a ranked list of appropriate actions and reasoning.`
}

/**
 * Cache generated prompts for performance
 */
const promptCache = new Map<string, GeneratedPrompt>()

export function getCachedPrompt(context: PromptContext): GeneratedPrompt {
  const cacheKey = JSON.stringify(context)
  
  if (promptCache.has(cacheKey)) {
    return promptCache.get(cacheKey)!
  }
  
  const prompt = buildMasterPrompt(context)
  promptCache.set(cacheKey, prompt)
  
  // Limit cache size
  if (promptCache.size > 100) {
    const firstKey = promptCache.keys().next().value
    promptCache.delete(firstKey)
  }
  
  return prompt
}
