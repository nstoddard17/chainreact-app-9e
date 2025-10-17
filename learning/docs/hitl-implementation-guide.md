# Human-in-the-Loop (HITL) Implementation Guide

**Last Updated**: October 16, 2025
**Status**: ✅ Fully Implemented
**Complexity**: Medium-High

## 📌 Overview

The Human-in-the-Loop (HITL) feature is a groundbreaking workflow control mechanism that pauses workflow execution for **full conversational interaction** with humans before continuing. Unlike traditional approval systems that offer binary yes/no decisions, HITL enables rich, multi-turn AI-powered conversations where users can discuss, modify, and refine workflow decisions.

### What Makes This Unique

**Traditional HITL Systems:**
- "Approve this action? [Yes/No]"
- Single response required
- No context or discussion

**ChainReact HITL:**
- Full conversational AI assistant
- Multi-turn discussions about workflow context
- Variable extraction from natural conversation
- Automatic continuation detection
- Context-aware responses

## 🏗️ Architecture

### Components

1. **Node Definition** (`/lib/workflows/nodes/providers/automation/hitl.ts`)
   - Configuration schema
   - Output schema
   - Field definitions

2. **Action Handler** (`/lib/workflows/actions/hitl/`)
   - `index.ts` - Main execution orchestrator
   - `conversation.ts` - AI conversation processing (OpenAI GPT-4)
   - `discord.ts` - Discord integration
   - `types.ts` - TypeScript definitions

3. **Discord Webhook** (`/app/api/webhooks/discord/hitl/route.ts`)
   - Receives Discord messages
   - Routes to active conversations
   - Processes through AI
   - Detects continuation signals
   - Resumes workflows

4. **Resume Service** (`/lib/workflows/resumeWorkflow.ts`)
   - Workflow resume logic
   - Stuck workflow detection
   - Resume orchestration

5. **Cron Job** (`/app/api/cron/resume-stuck-workflows/route.ts`)
   - Runs every 2 minutes
   - Checks for stuck workflows
   - Automatically resumes when ready

6. **Database Schema**
   ```sql
   -- workflow_executions enhancements
   ALTER TABLE workflow_executions
     ADD status TEXT,
     ADD paused_node_id TEXT,
     ADD paused_at TIMESTAMP,
     ADD resume_data JSONB;

   -- New table: hitl_conversations
   CREATE TABLE hitl_conversations (
     id UUID PRIMARY KEY,
     execution_id UUID REFERENCES workflow_executions(id),
     node_id TEXT,
     channel_type TEXT,
     channel_id TEXT,
     user_id TEXT,
     conversation_history JSONB,
     extracted_variables JSONB,
     status TEXT,
     started_at TIMESTAMP,
     completed_at TIMESTAMP,
     timeout_at TIMESTAMP
   );
   ```

## 🔄 Workflow Flow

### 1. Workflow Execution Hits HITL Node

```typescript
// When HITL node executes:
1. Resolve initial message with variables: "I'm about to {{action}}"
2. Send message to Discord (creates thread)
3. Create conversation record in database
4. Update workflow_executions:
   - status: 'paused'
   - paused_node_id: current node
   - resume_data: { config, context, input }
5. Return pauseExecution: true
```

### 2. User Responds in Discord

```typescript
// Discord bot forwards message to webhook:
1. POST /api/webhooks/discord/hitl
2. Find active conversation by channel_id
3. Add user message to conversation_history
4. Process through AI conversation handler
5. AI responds back in Discord
6. Check for continuation signal
```

### 3. Continuation Detection

The AI uses OpenAI function calling to detect when the user is ready to continue:

```typescript
{
  "name": "continue_workflow",
  "description": "Call when user is ready to continue",
  "parameters": {
    "extractedVariables": { /* extracted data */ },
    "summary": "Brief summary of conversation"
  }
}
```

Default continuation signals:
- "continue"
- "proceed"
- "go ahead"
- "send it"
- "looks good"
- "approve"

### 4. Workflow Resumes

```typescript
// When continuation detected:
1. Mark conversation as 'completed'
2. Update workflow_executions:
   - status: 'running'
   - paused_node_id: null
   - resume_data updated with extracted variables
3. Call resumeWorkflowExecution(executionId)
4. Trigger /api/workflows/resume-execution
5. Continue from next nodes
```

## 💻 Implementation Details

### Node Configuration

```typescript
{
  type: "hitl_conversation",
  config: {
    // Basic
    channel: "discord",  // "slack" | "sms" (future)
    discordGuildId: "123456789",
    discordChannelId: "987654321",
    initialMessage: "I'm about to send this email: {{emailBody}}",
    contextData: JSON.stringify({ emailBody, recipient }),

    // Advanced
    systemPrompt: "You are helping review an email...",
    extractVariables: {
      "decision": "approved | rejected | modified",
      "modifiedBody": "Updated email body if changed",
      "notes": "Additional context"
    },
    timeout: 60,  // minutes
    timeoutAction: "cancel" | "proceed",
    continuationSignals: ["continue", "go ahead"]
  }
}
```

### Variable Extraction

Variables defined in `extractVariables` are automatically extracted by the AI from the conversation:

```json
{
  "extractVariables": {
    "userDecision": "The user's final decision (approve/reject/modify)",
    "modifiedContent": "If user suggested changes, the updated content",
    "urgency": "Whether the user indicated this is urgent",
    "notes": "Any additional context provided by the user"
  }
}
```

After the conversation, these become available in the workflow as:

```javascript
{{extractedVariables.userDecision}}
{{extractedVariables.modifiedContent}}
{{extractedVariables.urgency}}
{{extractedVariables.notes}}
```

### AI System Prompt

The AI is given context about the workflow state:

```typescript
const systemPrompt = `
You are a workflow assistant helping review and refine this step.

Context Data:
${JSON.stringify(contextData, null, 2)}

Your job:
1. Present what's about to happen clearly
2. Answer questions about the data and context
3. Accept suggestions and modifications
4. When the user is satisfied, detect continuation signals
5. Extract key decisions to pass to the next workflow steps

Continuation signals: ${continuationSignals.join(', ')}

When ready, call continue_workflow with:
- extractedVariables: ${JSON.stringify(extractVariables)}
- summary: Brief summary of the conversation
`
```

## 🔧 Discord Bot Setup

### Gateway Event Forwarding

Your Discord bot must forward MESSAGE_CREATE events to the HITL webhook:

```typescript
// In your Discord bot (discord-gateway service):
client.on('messageCreate', async (message) => {
  // Ignore bot messages to prevent loops
  if (message.author.bot) return

  // Forward to HITL webhook
  try {
    await fetch('https://your-app.com/api/webhooks/discord/hitl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        t: 'MESSAGE_CREATE',
        d: {
          content: message.content,
          channel_id: message.channel.id,
          author: {
            id: message.author.id,
            username: message.author.username,
            bot: message.author.bot
          }
        }
      })
    })
  } catch (error) {
    console.error('Failed to forward to HITL webhook:', error)
  }
})
```

### Required Bot Permissions

- `VIEW_CHANNEL`
- `SEND_MESSAGES`
- `READ_MESSAGE_HISTORY`
- `CREATE_PUBLIC_THREADS`
- `SEND_MESSAGES_IN_THREADS`

## 🚨 Critical Configuration

### Environment Variables

```env
# Required for AI conversation
OPENAI_API_KEY=sk-...

# For resume functionality
NEXT_PUBLIC_SITE_URL=https://your-app.com
```

### Vercel Cron Configuration

Already added to `vercel.json`:

```json
{
  "path": "/api/cron/resume-stuck-workflows",
  "schedule": "*/2 * * * *"  // Every 2 minutes
}
```

## 📝 Usage Examples

### Example 1: Email Review

```typescript
{
  type: "hitl_conversation",
  config: {
    channel: "discord",
    discordGuildId: "{{discordServer}}",
    discordChannelId: "{{reviewChannel}}",
    initialMessage: `I'm about to send this email to {{recipientEmail}}:

Subject: {{emailSubject}}
Body: {{emailBody}}

What do you think? Any changes needed?`,
    contextData: JSON.stringify({
      recipient: "{{recipientEmail}}",
      subject: "{{emailSubject}}",
      body: "{{emailBody}}"
    }),
    extractVariables: {
      "decision": "approved | rejected | modified",
      "newSubject": "Updated subject if changed",
      "newBody": "Updated body if changed",
      "notes": "Any additional instructions"
    },
    timeout: 30
  }
}
```

**Conversation Example:**

```
Bot: I'm about to send this email to john@example.com:

Subject: Project Update
Body: Hi John, here's the update on the project...

What do you think? Any changes needed?

User: Can you make the tone more friendly?

Bot: Sure! Here's a friendlier version:

"Hey John! 👋 Hope you're doing well. I wanted to share an exciting update..."

Would you like me to use this version?

User: Yes, that's much better. Go ahead!

Bot: Great! Continuing the workflow with these changes: Made the email tone more friendly and casual. Updated subject and body accordingly.

✅ Workflow continuing! Thanks for the input.
```

### Example 2: Code Deployment Review

```typescript
{
  type: "hitl_conversation",
  config: {
    channel: "discord",
    discordGuildId: "{{discordServer}}",
    discordChannelId: "{{deploymentsChannel}}",
    initialMessage: `Ready to deploy:

Branch: {{branchName}}
Environment: {{environment}}
Changes: {{changeCount}} files modified
Tests: {{testStatus}}

Review the changes and approve when ready.`,
    systemPrompt: "You are a deployment assistant. Discuss code changes, risk assessment, and timing. Ensure the user has reviewed all critical changes before approving deployment.",
    extractVariables: {
      "approved": "true | false",
      "rollbackPlan": "User's rollback strategy if provided",
      "deploymentNotes": "Any notes about the deployment"
    },
    timeout: 120
  }
}
```

## 🐛 Troubleshooting

### Issue: Workflow Not Resuming

**Symptoms**: Conversation completes but workflow doesn't continue

**Checklist**:
1. Check `workflow_executions.status` - should be 'running' after continuation
2. Check `workflow_executions.paused_node_id` - should be null after resume
3. Check logs for "Workflow ready to resume" message
4. Verify cron job is running: `GET /api/cron/resume-stuck-workflows`
5. Check if `resume_data.output` contains extracted variables

**Solution**:
```bash
# Manually trigger resume check
curl https://your-app.com/api/cron/resume-stuck-workflows

# Check execution status in database
SELECT id, status, paused_node_id, paused_at
FROM workflow_executions
WHERE status = 'running' AND paused_node_id IS NOT NULL;
```

### Issue: Discord Messages Not Reaching Webhook

**Symptoms**: User responds but AI doesn't reply

**Checklist**:
1. Verify Discord bot is running and connected
2. Check bot has MESSAGE_CREATE intent enabled
3. Verify webhook URL is correct in bot code
4. Check webhook logs: `/api/webhooks/discord/hitl`
5. Ensure bot is in the correct server/channel

**Debug**:
```javascript
// Add logging to Discord bot
client.on('messageCreate', (msg) => {
  console.log('Message received:', {
    content: msg.content,
    channel: msg.channel.id,
    author: msg.author.id
  })
})
```

### Issue: Conversation Timing Out

**Symptoms**: Workflow cancels before user responds

**Solutions**:
1. Increase `timeout` in node config (default: 60 minutes)
2. Set `timeoutAction` to 'proceed' to continue anyway
3. Check `hitl_conversations.timeout_at` timestamp

### Issue: Variables Not Extracted

**Symptoms**: Workflow continues but variables are empty

**Checklist**:
1. Verify `extractVariables` is valid JSON
2. Check OpenAI API key is set
3. Review conversation history in database
4. Ensure continuation was detected (check logs for "Continuation signal detected")
5. Verify `extractedVariables` in `resume_data.output`

**Debug**:
```sql
SELECT conversation_history, extracted_variables
FROM hitl_conversations
WHERE execution_id = 'your-execution-id';
```

## 🔒 Security Considerations

### User Verification

The system tracks `external_user_id` (Discord user ID) to ensure only authorized users can respond. Future enhancement: add explicit user verification.

### Token Safety

- Never log conversation content (may contain sensitive data)
- All conversation data is encrypted at rest in Supabase
- Use RLS policies to restrict access

### Rate Limiting

Consider adding rate limits to prevent abuse:
- Max concurrent HITL conversations per user: 10
- Max conversation duration: 24 hours
- Max messages per conversation: 100

## 📊 Monitoring

### Key Metrics

1. **Active Conversations**
   ```sql
   SELECT COUNT(*) FROM hitl_conversations WHERE status = 'active';
   ```

2. **Average Conversation Duration**
   ```sql
   SELECT AVG(EXTRACT(EPOCH FROM (completed_at - started_at))/60) as avg_minutes
   FROM hitl_conversations
   WHERE status = 'completed';
   ```

3. **Continuation Success Rate**
   ```sql
   SELECT
     COUNT(CASE WHEN status = 'completed' THEN 1 END) * 100.0 / COUNT(*) as success_rate
   FROM hitl_conversations;
   ```

4. **Stuck Workflows**
   ```sql
   SELECT COUNT(*)
   FROM workflow_executions
   WHERE status = 'running' AND paused_node_id IS NOT NULL;
   ```

## 🚀 Future Enhancements

### Planned Features

1. **Slack Support** - Full Slack integration with slash commands
2. **SMS Support** - Twilio integration for SMS-based conversations
3. **Web UI** - In-app conversation interface
4. **Voice** - Integration with voice assistants
5. **Multi-user** - Require approval from multiple people
6. **Escalation** - Auto-escalate to manager if timeout
7. **Templates** - Pre-built conversation templates
8. **Analytics** - Conversation quality metrics

### API Extensions

- `GET /api/hitl/conversations/:id` - View conversation history
- `POST /api/hitl/conversations/:id/cancel` - Cancel waiting workflow
- `POST /api/hitl/conversations/:id/approve` - Programmatic approval
- `GET /api/hitl/stats` - Conversation statistics

## 📚 Related Documentation

- [Action/Trigger Implementation Guide](/learning/docs/action-trigger-implementation-guide.md)
- [Workflow Execution Guide](/learning/docs/workflow-execution-implementation-guide.md)
- [Logging Best Practices](/learning/docs/logging-best-practices.md)
- [Discord Integration](/learning/docs/discord-integration.md)

## ✅ Testing Checklist

Before deploying HITL feature:

- [ ] Database migration applied successfully
- [ ] OpenAI API key configured
- [ ] Discord bot forwarding MESSAGE_CREATE events
- [ ] Cron job scheduled in Vercel
- [ ] Test workflow: Manual trigger → HITL → Discord message sent
- [ ] Test conversation: Bot responds to messages
- [ ] Test continuation: Saying "continue" resumes workflow
- [ ] Test timeout: Workflow cancels/proceeds after timeout
- [ ] Test variable extraction: Variables available in next nodes
- [ ] Test stuck workflow recovery: Cron job resumes paused workflows

## 🎯 Success Criteria

The HITL feature is working correctly when:

1. ✅ Workflow pauses at HITL node
2. ✅ Message appears in Discord with thread
3. ✅ User can have multi-turn conversation with AI
4. ✅ AI understands context and answers questions
5. ✅ Workflow resumes when user approves
6. ✅ Extracted variables are passed to next nodes
7. ✅ Timeout behavior works as configured
8. ✅ Stuck workflows are automatically recovered

---

**Created**: October 16, 2025
**Author**: Claude + ChainReact Team
**Complexity Rating**: ⭐⭐⭐⭐ (4/5)
**Status**: Production Ready (pending integration testing)
