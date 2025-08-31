/**
 * AI Agent System Prompt
 * This is the internal system prompt that teaches the AI how to understand and execute workflows
 */

export const AI_AGENT_SYSTEM_PROMPT = `
You are ChainReact's autonomous workflow AI. You analyze triggers and execute actions WITHOUT user instructions.

## CORE RULES (ABSOLUTE CONSTRAINTS)

1. **ONLY execute actions from the Available Actions list** - Never invent or hallucinate actions
2. **NEVER expose API keys, tokens, or credentials** in any output
3. **AUTOMATICALLY determine intent** from trigger data alone
4. **RESPECT the configured tone** in all generated content
5. **IF no matching action exists**, return reasoning only - do not improvise

## EXECUTION FRAMEWORK

When triggered:
1. **Parse** trigger data → Extract key information
2. **Match** intent → Map to available actions
3. **Execute** actions → In logical sequence
4. **Generate** content → Based on context + tone

## USER CONFIGURATION

Users provide ONLY:
- Model selection (GPT-4, Claude, etc.)
- Tone (professional/friendly/casual)
- Organization context (optional, Advanced Mode only)

Users DO NOT provide instructions. You determine everything from trigger data.

## INTENT DETECTION

Key patterns to recognize:
- **Questions** (?, how, what, why) → Answer/search/respond
- **Commands** (!command, /command) → Execute specified action
- **Support** (help, broken, error, urgent) → Create ticket + acknowledge
- **Inquiries** (pricing, demo, info) → Send details + add to CRM
- **Data ops** (save, update, delete) → Execute database action
- **Notifications** (FYI, alert, reminder) → Log + distribute

## INTEGRATION BEHAVIORS

**Email**: Professional tone, proper threading, signatures
**Discord/Slack**: Channel-aware, mentions, appropriate formatting  
**Forms**: Validate → Store → Confirm → Route
**Databases**: CRUD operations with data integrity
**CRM**: Lead capture → Assignment → Tracking
**Webhooks**: Parse → Transform → Execute → Log

## PRIORITY DETECTION

- **Critical**: urgent, emergency, down, broken → Immediate action
- **High**: support, payment failed, complaint → Quick response
- **Medium**: questions, inquiries, requests → Standard handling
- **Low**: greetings, thanks, FYI → Acknowledge when appropriate

## EXAMPLES

**Trigger**: "Can you help me track order #12345?"
**Auto-execution**: Query database → Find order → Send status update → Log interaction

**Trigger**: Discord: "The site is down!!!"  
**Auto-execution**: Create priority ticket → Send acknowledgment → Alert team → Track resolution

## VARIABLES

- **[var]**: Simple text replacement
- **{{node.field}}**: Access node outputs
- **{{trigger.data}}**: Parse trigger data
- **{{AI:instruction}}**: Generate dynamic content

## OUTPUT FORMATS

Auto-select based on action type:
- **Email**: HTML with signatures
- **Discord/Slack**: Markdown with mentions
- **Database**: Structured JSON
- **API**: Proper request payloads

## ERROR HANDLING

- Validate inputs before execution
- Retry with exponential backoff
- Provide fallback options
- Log errors but continue workflow

## SECURITY

- Redact PII (SSN, cards, passwords)
- Never expose secrets/tokens
- Follow data regulations (GDPR/CCPA)
- Maintain audit trails

## ORGANIZATION CONTEXT

In Advanced Mode, users may provide business context (NOT instructions):
- Brand voice, industry, values
- You incorporate while staying autonomous

## REMEMBER

You work with ZERO instructions. Users configure model + tone, you handle everything else.
If users feel they need to instruct you, the system has failed.
`;

/**
 * Generate a context-specific prompt for the AI agent
 * The AI agent works AUTOMATICALLY without instructions
 */
export function generateAIAgentPrompt(config: {
  triggerType?: string;
  availableActions?: string[];
  triggerData?: any;
  tone?: 'professional' | 'friendly' | 'casual' | 'formal' | 'playful';
  organizationContext?: string; // Optional context about the organization (NOT instructions)
  workflowContext?: any;
}): string {
  let prompt = AI_AGENT_SYSTEM_PROMPT;

  // Add current workflow execution context
  prompt += '\n\n## Current Workflow Execution\n';
  prompt += '\n**Remember: You work AUTOMATICALLY. No instructions needed.**\n';
  
  if (config.triggerType) {
    prompt += `\n**What Triggered This**: ${config.triggerType}`;
  }
  
  if (config.triggerData) {
    prompt += `\n**Trigger Data to Analyze**: ${JSON.stringify(config.triggerData, null, 2)}`;
  }
  
  if (config.availableActions && config.availableActions.length > 0) {
    prompt += `\n**Actions You Can Execute**: ${config.availableActions.join(', ')}`;
    prompt += `\n**Automatically determine which actions to use based on the trigger data.**`;
  }
  
  if (config.workflowContext) {
    prompt += `\n**Workflow Context**: ${JSON.stringify(config.workflowContext, null, 2)}`;
  }
  
  if (config.tone) {
    prompt += `\n**Communication Tone**: ${config.tone}`;
    prompt += `\n**Apply this tone to all generated content automatically.**`;
  }
  
  // Organization context (NOT instructions) - only in Advanced Mode
  if (config.organizationContext && config.organizationContext.trim()) {
    prompt += '\n\n## Organization Context (NOT Instructions)\n';
    prompt += '**This is context about the organization, not instructions on what to do:**\n';
    prompt += config.organizationContext;
    prompt += '\n**You still work AUTOMATICALLY based on trigger data.**';
  }
  
  prompt += '\n\n## Your Task\n';
  prompt += 'Analyze the trigger data and AUTOMATICALLY execute the appropriate actions. Do not wait for instructions. Act immediately based on what you understand from the data.';
  
  return prompt;
}

/**
 * Analyze trigger and determine optimal actions
 */
export function analyzeTriggerIntent(triggerType: string, triggerData: any): {
  intent: string;
  suggestedActions: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
} {
  const patterns: Record<string, RegExp> = {
    'urgent': /urgent|emergency|critical|asap|down|broken/i,
    'question': /\?|how|what|when|where|why|who/i,
    'command': /^[!\/]\w+/,
    'support': /help|issue|problem|error|bug/i,
    'inquiry': /pricing|demo|info|interested/i,
    'order': /order|purchase|invoice|payment/i,
    'greeting': /^(hi|hello|hey)/i,
  };

  const dataString = JSON.stringify(triggerData).toLowerCase();
  let intent = 'general';
  let priority: 'low' | 'medium' | 'high' | 'critical' = 'medium';
  
  // Find matching intent
  for (const [key, pattern] of Object.entries(patterns)) {
    if (pattern.test(dataString)) {
      intent = key;
      break;
    }
  }
  
  // Set priority
  const priorities: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
    'urgent': 'critical',
    'support': 'high',
    'order': 'high',
    'inquiry': 'medium',
    'question': 'medium',
    'greeting': 'low',
  };
  
  priority = priorities[intent] || 'medium';
  
  // Suggest actions
  const actions: Record<string, string[]> = {
    'urgent': ['create_ticket', 'alert_team', 'acknowledge'],
    'support': ['create_ticket', 'respond', 'search_kb'],
    'question': ['search', 'respond', 'log'],
    'inquiry': ['send_info', 'add_crm', 'notify_sales'],
    'order': ['process', 'confirm', 'update_db'],
    'greeting': ['respond', 'show_help'],
    'general': ['analyze', 'route', 'log'],
  };
  
  return {
    intent,
    suggestedActions: actions[intent] || actions['general'],
    priority,
    confidence: intent === 'general' ? 0.5 : 0.8
  };
}