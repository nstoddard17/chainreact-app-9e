# Discord Support Workflow - AI Generator Use Case

## Overview

This document demonstrates how the AI Workflow Generator creates intelligent Discord support workflows that automatically triage and handle different types of messages.

## Use Case: Discord Support Channel Automation

### The Problem
Many Discord servers have support channels that become overwhelming with different types of messages:
- Bug reports that need tickets
- General questions needing answers
- Urgent issues requiring immediate attention
- Feature requests to be logged
- FAQs that could be answered instantly

### The Solution
An AI-powered workflow that automatically:
1. Reads new Discord messages
2. Analyzes content to determine message type
3. Routes to appropriate handling chain
4. Takes appropriate actions for each scenario

## Sample User Prompt

### Natural Language Version (What Users Actually Say)
```
I need help setting up something for our Discord server. We get a lot of messages 
in our support channel and it's getting overwhelming to manage. I want the bot to 
automatically read new messages and figure out what kind of help people need. 
Like if someone's reporting a bug, it should create a ticket somewhere and let 
them know we got it. If it's just a regular question, it should try to answer it. 
If someone says something is urgent or broken, it needs to alert our team right away. 
And for feature requests, maybe it could save those somewhere so we don't forget 
about them. Basically I want it to be smart enough to know what to do with different 
types of messages - like having different response paths depending on what people 
are asking about. Can it do all that automatically when someone posts in our 
Discord channel?
```

### What the AI Understands
The AI detects these scenarios from the prompt:
- **Bug Reports** - "reporting a bug", "create a ticket"
- **Support Questions** - "regular question", "try to answer"
- **Urgent Issues** - "urgent or broken", "alert team right away"
- **Feature Requests** - "save those somewhere"

## Expected Generated Workflow

### Trigger
- **Type**: `discord_trigger_new_message`
- **Config**: Monitors specified Discord channel for new messages

### AI Agent with Scenario-Based Chains

#### Chain 1: Bug Report Handler
**Triggers On**: Messages containing "bug", "error", "broken", "crash"
**Actions**:
1. `github_action_create_issue` - Creates GitHub issue with bug details
2. `slack_action_send_message` - Notifies dev team in #bugs channel
3. `discord_action_send_message` - Confirms ticket created to user

#### Chain 2: General Support
**Triggers On**: Messages containing "how", "what", "help", "question"
**Actions**:
1. `google_drive_action_search` - Searches documentation
2. `discord_action_send_message` - Sends helpful answer

#### Chain 3: Urgent Alert
**Triggers On**: Messages containing "urgent", "critical", "down", "emergency"
**Actions**:
1. `slack_action_send_message` - Immediate alert to #urgent with @here
2. `email_action_send` - Email on-call engineer
3. `discord_action_send_message` - Acknowledge urgency to user

#### Chain 4: Feature Request Logging
**Triggers On**: Messages containing "feature", "request", "suggestion", "idea"
**Actions**:
1. `notion_action_create_page` - Log in feature requests database
2. `discord_action_send_message` - Thank user for suggestion

#### Chain 5: FAQ Handler (Optional)
**Triggers On**: Common questions about pricing, features, hours
**Actions**:
1. `discord_action_send_message` - Send instant answer

## Technical Implementation

### Model Selection
- **Recommended**: `gpt-4o-mini` for cost efficiency
- **Alternative**: `gpt-4o` for more complex scenarios

### API Request Example
```javascript
const response = await fetch('/api/ai/generate-workflow', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    prompt: DISCORD_SUPPORT_PROMPT,
    model: 'gpt-4o-mini'
  }),
});
```

### Validation Points
The generated workflow should include:
1. ✅ Discord trigger (new message)
2. ✅ AI Agent node
3. ✅ Multiple chains (3-5 expected)
4. ✅ Diverse actions per chain
5. ✅ No duplicate "send message" only chains

## Key Features

### Intelligent Scenario Detection
The system analyzes prompts for keywords and patterns:
- Explicit mentions (bug, urgent, feature)
- Implicit needs ("figure out", "different types")
- Vague requirements ("be smart", "know what to do")

### Automatic Chain Mapping
Each detected scenario maps to appropriate actions:
- Bug → Ticket creation + Team notification
- Support → Documentation search + Response
- Urgent → Immediate alerts + High-priority handling
- Feature → Database logging + Acknowledgment

### Fallback Chains
If critical chains are missing, the system adds defaults:
- Bug Report Handler (if Discord + support context)
- General Support (for unmatched messages)

## Testing

### Running the Test
```bash
node test-discord-support-workflow.mjs
```

### Expected Test Output
```
✅ Discord trigger found
✅ AI Agent found
✅ Bug Report Chain (with ticket creation)
✅ Support Chain (with search actions)
✅ Urgent Chain (with alert actions)
✅ Feature Request Chain (with storage actions)
```

## Common Issues and Solutions

### Issue: AI creates repetitive chains
**Solution**: Enhanced prompt now emphasizes diverse actions and scenario-based thinking

### Issue: Missing expected chains
**Solution**: Fallback logic adds critical chains if missing

### Issue: Wrong actions for scenarios
**Solution**: Explicit mapping in prompt guides AI to use appropriate actions

## Best Practices

1. **Be Specific About Scenarios**: Mention specific situations (bugs, questions, urgent)
2. **Describe Desired Actions**: Say what should happen (create ticket, alert team)
3. **Use Natural Language**: The AI understands conversational descriptions
4. **Test Generated Workflows**: Always review chains before activation
5. **Iterate if Needed**: Regenerate with more specific prompts if needed

## Future Enhancements

- [ ] Add more sophisticated scenario detection
- [ ] Support custom chain templates
- [ ] Enable chain priority ordering
- [ ] Add conditional logic between chains
- [ ] Support multi-language Discord servers

## Related Documentation

- [AI Workflow Generator Overview](./AI_WORKFLOW_GENERATOR.md)
- [Workflow Actions Documentation](./WORKFLOW_ACTIONS_DOCUMENTATION.md)
- [Chain Builder Architecture](../learning/docs/ai-agent-chain-builder-architecture.md)