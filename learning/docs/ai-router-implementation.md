# AI Router Implementation Guide

## Overview

The AI Router is a revolutionary workflow node that intelligently routes workflow execution through multiple output paths based on content analysis. It replaces complex if-then logic with AI-powered decision making.

## Key Features

### 6. AI Field Automation
- **Let AI Decide**: Any field can be set to AI mode where it's automatically populated
- **Visual Indicator**: Fields in AI mode show "Defined automatically by AI" banner
- **Runtime Resolution**: AI analyzes workflow context and generates appropriate values
- **Field Types**: Works with text, email, numbers, dates, selections, and more

### 7. Dynamic AI Variables
- **Simple Variables**: Use `[name]`, `[email]`, `[subject]` etc. for automatic replacement
- **AI Instructions**: Use `{{AI:summarize}}`, `{{AI:extract_key_points}}` for AI generation
- **Context Aware**: Variables are resolved based on trigger data and previous results
- **Natural Language**: Write templates like "Hi [name], thank you for asking about [subject]"

## Key Features

### 1. Multi-Path Routing
- **Single Path Mode**: Routes to one output only
- **Multi-Path Mode**: Can trigger multiple outputs simultaneously  
- **Weighted Mode**: Distributes based on confidence scores

### 2. Template System
Pre-configured routing templates:
- **Support Router**: Routes support messages (bugs, features, queries)
- **Content Moderator**: Filters content (approved, review, rejected)
- **Lead Qualifier**: Qualifies sales leads (hot, warm, cold)
- **Task Dispatcher**: Routes to appropriate teams
- **Custom Router**: Define your own logic

### 3. Memory Options
- **No Memory**: Stateless routing
- **Workflow Context**: Remembers within workflow run
- **Conversation Memory**: Remembers across runs
- **Vector Storage**: Semantic memory search (Pinecone, Weaviate, etc.)

### 4. API Configuration
- **ChainReact API**: Metered billing, no setup required
- **Custom API Keys**: Use your own OpenAI, Anthropic, Google, or Mistral keys
- Encrypted storage of custom keys
- Per-execution cost limits

### 5. Usage Tracking & Billing
- All AI usage is tracked regardless of API source
- Plan-based limits (Free, Pro, Business, Enterprise)
- Cost tracking per execution
- Monthly budget management for custom keys

## Architecture

### File Structure
```
/lib/workflows/nodes/providers/ai/
  ├── aiRouterNode.ts          # Node definition and templates
  └── index.ts                 # Export aggregator

/lib/workflows/actions/
  └── aiRouterAction.ts        # Execution handler with usage tracking

/components/workflows/
  └── AIRouterConfigModal.tsx  # Configuration UI with output paths

/db/migrations/
  ├── add_user_api_keys.sql    # Custom API key storage
  └── add_ai_cost_tracking.sql # Usage and cost tracking
```

### Database Schema

#### user_api_keys
Stores encrypted custom API keys with budget tracking:
- `encrypted_key`: AES-256 encrypted API key
- `monthly_budget`: User-defined spending limit
- `current_usage`: Current month's usage

#### ai_routing_decisions
Audit trail of all routing decisions:
- `selected_paths`: Which outputs were triggered
- `confidence_scores`: AI's confidence in decisions
- `cost`: Actual cost incurred

#### workflow_conversations
Memory storage for conversation context:
- `context`: JSON blob of conversation history
- `expires_at`: Auto-cleanup after 30 days

## Implementation Details

### Output Path Configuration
Each output path has:
```typescript
{
  id: string           // Unique identifier
  name: string         // Display name
  color: string        // Visual indicator
  condition: {
    type: 'ai_decision' | 'keyword' | 'regex' | 'fallback'
    value?: string     // Pattern for keyword/regex
    minConfidence?: number  // Threshold for AI decisions
  }
}
```

### Routing Decision Process
1. **Input Analysis**: AI analyzes incoming data
2. **Classification**: Determines categories/intents
3. **Path Matching**: Matches classifications to output paths
4. **Confidence Check**: Ensures minimum confidence thresholds
5. **Fallback**: Routes to default if no matches

### Usage Limits by Plan
```typescript
const PLAN_LIMITS = {
  free: { monthly: 100, daily: 10, perExecution: 0.05 },
  pro: { monthly: 1000, daily: 100, perExecution: 0.50 },
  business: { monthly: 5000, daily: 500, perExecution: 2.00 },
  enterprise: { monthly: -1, daily: -1, perExecution: 10.00 } // Unlimited
}
```

### Cost Calculation
```typescript
// Per 1K tokens
const MODEL_PRICING = {
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  // ... etc
}
```

## Usage Examples

### Example 1: Discord Support Bot
```typescript
// Configuration
{
  template: 'support_router',
  model: 'gpt-4-turbo',
  outputPaths: [
    { name: 'Bug Report', condition: { type: 'ai_decision' } },
    { name: 'Feature Request', condition: { type: 'ai_decision' } },
    { name: 'Support Query', condition: { type: 'ai_decision' } }
  ],
  decisionMode: 'multi' // Can trigger multiple paths
}

// Input
{ message: "The app crashes and I'd like a dark mode feature" }

// Output
{
  selectedPaths: ['bug_report', 'feature_request'],
  confidence: { bug_report: 0.92, feature_request: 0.88 }
}
```

### Example 2: Lead Qualification
```typescript
// Configuration
{
  template: 'lead_qualifier',
  model: 'gpt-3.5-turbo',
  apiSource: 'custom',
  customApiKey: 'sk-...',
  outputPaths: [
    { name: 'Hot Lead', condition: { minConfidence: 0.8 } },
    { name: 'Warm Lead', condition: { minConfidence: 0.6 } },
    { name: 'Cold Lead', condition: { type: 'fallback' } }
  ]
}
```

## Workflow Builder Integration

### Visual Representation
```
     [AI Router]
         │
    ╔════╪════╗
    ║    │    ║
    ▼    ▼    ▼
  Bug  Feature Support
   │      │      │
[Create] [Log] [Email]
[Ticket] [Idea] [Team]
```

### Connection Handling
The workflow builder must support:
1. Multiple output ports from AI Router node
2. Color-coded paths for visual clarity
3. Path execution visualization
4. Parallel execution of multiple paths

## Security Considerations

### API Key Encryption
- All custom API keys are AES-256 encrypted
- Keys never exposed in logs or UI (except when entering)
- Separate encryption key per environment

### Usage Enforcement
- Hard limits enforced at execution time
- Automatic fallback to error if limits exceeded
- Real-time usage tracking in database

### Data Privacy
- Conversation memory expires after 30 days
- User data isolated via RLS policies
- No cross-user data access possible

## Testing

### Test Routing Decision
```typescript
const testInput = {
  message: "Bug: Login fails on mobile Safari"
}

const result = await executeAIRouter(config, {
  userId: 'test-user',
  workflowId: 'test-workflow',
  executionId: 'test-execution',
  input: testInput
})

expect(result.selectedPaths).toContain('bug_report')
expect(result.confidence).toBeGreaterThan(0.7)
```

### Test Usage Tracking
```typescript
// Execute router
await executeAIRouter(config, context)

// Verify usage was tracked
const usage = await supabase
  .from('ai_cost_logs')
  .select('*')
  .eq('user_id', userId)
  .single()

expect(usage.feature).toBe('ai_agent')
expect(usage.cost).toBeGreaterThan(0)
```

## Migration from Old AI Agent

### Key Differences
1. **Multiple Outputs**: Old agent had single output, router has multiple
2. **Templates**: Pre-configured routing patterns
3. **Custom API Keys**: Users can bring their own keys
4. **Visual Paths**: See all possible routes in workflow
5. **Usage Tracking**: More granular cost tracking

### Migration Steps
1. Replace `ai_agent` nodes with `ai_router`
2. Configure output paths for each scenario
3. Connect each path to appropriate actions
4. Test routing decisions
5. Monitor usage and costs

## Future Enhancements

### Planned Features
1. **Learning Mode**: AI learns from corrections
2. **A/B Testing**: Test different routing strategies
3. **Analytics Dashboard**: Visualize routing patterns
4. **Custom Templates**: Save and share templates
5. **Batch Processing**: Route multiple inputs at once

### Integration Possibilities
1. **Vector Databases**: Semantic search for context
2. **External APIs**: Call external classifiers
3. **ML Models**: Custom classification models
4. **Webhooks**: Notify external systems of decisions

## Troubleshooting

### Common Issues

#### "Usage limit exceeded"
- Check plan limits in database
- Verify custom API key if using
- Check daily/monthly usage

#### "No paths selected"
- Verify confidence thresholds
- Check fallback path exists
- Review AI prompt/template

#### "API key invalid"
- Re-enter API key
- Verify provider matches key
- Check key permissions

## Best Practices

1. **Start with Templates**: Use pre-built templates before custom
2. **Test Thoroughly**: Use test mode before production
3. **Monitor Costs**: Set appropriate cost limits
4. **Use Fallbacks**: Always have a default path
5. **Clear Naming**: Use descriptive path names
6. **Appropriate Models**: Balance cost vs accuracy
7. **Memory Wisely**: Only use memory when needed
8. **Secure Keys**: Rotate API keys regularly