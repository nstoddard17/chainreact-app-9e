import { BaseActionHandler } from "./baseActionHandler"
import { IntentAnalysisResult, Integration } from "../aiIntentAnalysisService"
import { ActionExecutionResult } from "../aiActionExecutionService"
import { logger } from '@/lib/utils/logger'

/**
 * App Knowledge Handler
 * Answers questions about ChainReact features, capabilities, and how to use the platform
 */
export class AppKnowledgeHandler extends BaseActionHandler {
  private knowledgeBase: Record<string, string> = {
    // General App Questions
    'what_is_chainreact': `ChainReact is a powerful workflow automation platform that connects your favorite apps and automates repetitive tasks. You can build visual workflows that trigger automatically and perform actions across 20+ integrations including Gmail, Slack, Notion, Google Drive, and more.`,

    'how_to_create_workflow': `To create a workflow:
1. Go to the Workflows page (/workflows)
2. Click "Create Workflow" or choose a template
3. Add a trigger (what starts the workflow)
4. Add actions (what happens next)
5. Connect the nodes
6. Test your workflow
7. Activate it when ready!`,

    'available_integrations': `ChainReact supports 20+ integrations:

**Communication:** Gmail, Outlook, Slack, Discord, Microsoft Teams
**Productivity:** Notion, Airtable, Trello, Google Sheets, OneNote
**File Storage:** Google Drive, OneDrive, Dropbox, Box
**Business:** HubSpot, Stripe, Shopify, PayPal
**Developer:** GitHub, GitLab
**Social Media:** Twitter, Facebook, Instagram, LinkedIn, TikTok, YouTube
**Calendar:** Google Calendar

You can connect these in the Integrations page.`,

    'what_are_triggers': `Triggers are events that start your workflow automatically. Examples:
- When a new email arrives (Gmail)
- When a file is uploaded (Google Drive)
- When a form is submitted (Airtable)
- When a message is posted (Slack)
- On a schedule (every hour, daily, etc.)

Each workflow needs exactly one trigger to activate.`,

    'what_are_actions': `Actions are tasks that your workflow performs. You can chain multiple actions together. Examples:
- Send an email
- Create a Notion page
- Upload a file to Google Drive
- Post to Slack
- Add a row to Airtable
- Send a Discord message

Workflows can have unlimited actions!`,

    'ai_agent_explained': `AI Agents are intelligent workflow nodes that use AI to make decisions and generate content. They can:
- Analyze incoming data
- Make decisions based on context
- Generate dynamic content
- Choose which actions to perform
- Extract information from text
- Summarize content
- Route data intelligently

Think of them as smart assistants within your workflows!`,

    'workflow_execution': `When a workflow runs:
1. The trigger fires (email received, time reached, etc.)
2. Data flows through the workflow nodes
3. Each action executes in order
4. You can view the execution log
5. Results are stored for 30 days

Active workflows run automatically. Inactive workflows won't trigger.`,

    'how_to_connect_integration': `To connect an integration:
1. Go to Settings → Integrations (/integrations)
2. Find the integration you want
3. Click "Connect"
4. Log in with your account
5. Grant permissions
6. You're connected!

Each integration is securely connected with OAuth and your credentials are encrypted.`,

    'workflow_templates': `Templates are pre-built workflows you can use as starting points. Examples:
- Email to Slack notifications
- Google Drive to Notion sync
- Auto-respond to forms
- Daily summary reports
- Social media schedulers

Browse templates when creating a new workflow!`,

    'execution_logs': `Execution logs show you what happened when your workflow ran:
- Which trigger started it
- What data was processed
- Which actions executed
- Any errors that occurred
- Timing information

View logs on the workflow detail page.`,

    'workflow_variables': `Variables let you pass data between workflow nodes:
- {{trigger.email}} - Data from the trigger
- {{previous_action.result}} - Output from actions
- {{AI_FIELD:fieldName}} - AI-generated values

Use the variable picker when configuring actions.`,

    'pricing_plans': `ChainReact offers flexible pricing:
- **Free Plan**: 100 workflow executions/month, core integrations
- **Pro Plan**: Unlimited executions, all integrations, AI agents
- **Team Plan**: Everything in Pro + collaboration features

Check the Pricing page for current details.`,

    'workflow_limits': `Workflow limits:
- **Nodes**: Unlimited per workflow
- **Executions**: Depends on your plan
- **File size**: 10MB per file transfer
- **API calls**: Rate limited by provider
- **Execution time**: 5 minutes max per run

Need higher limits? Contact support!`,

    'troubleshooting': `Common issues and solutions:
- **Workflow not triggering**: Check if it's active and trigger is configured
- **Action failing**: Verify integration is connected and has permissions
- **Data not flowing**: Check variable names and connections
- **Execution timeout**: Simplify workflow or split into multiple workflows
- **Integration disconnected**: Reconnect in Integrations page

Still stuck? Check execution logs or ask me for specific help!`,

    'security_privacy': `Your data security is our priority:
- **Encryption**: All credentials encrypted with AES-256
- **OAuth**: Secure authentication, we never see passwords
- **Privacy**: We only access data you explicitly authorize
- **Compliance**: SOC 2, GDPR compliant
- **No sharing**: Your workflows and data stay private

Read our Security Policy for full details.`,

    'collaboration': `Team collaboration features:
- **Shared workflows**: Share with team members
- **Role permissions**: Admin, Editor, Viewer roles
- **Activity logs**: See who made changes
- **Comments**: Discuss workflows with team
- **Templates**: Share workflow templates

Available on Team plan!`,

    'mobile_app': `Currently ChainReact is web-only, but:
- **Mobile responsive**: Use on phone/tablet browser
- **Notifications**: Get email alerts for executions
- **Monitoring**: Check workflow status on mobile
- **Future**: Native mobile app coming soon!`,

    'api_access': `For developers:
- **REST API**: Full programmatic access
- **Webhooks**: Trigger workflows from anywhere
- **Custom integrations**: Build your own connectors
- **SDKs**: JavaScript, Python coming soon

See API Documentation for details.`,

    'getting_started': `Welcome to ChainReact! Here's how to get started:
1. Connect your first integration (Gmail, Slack, etc.)
2. Create a simple workflow from a template
3. Test it to see how it works
4. Activate it!
5. Explore more complex automations

Need help? I'm here to assist! Just ask me anything.`
  }

  async handleQuery(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    this.logHandlerStart("App Knowledge", intent)

    try {
      const query = intent.parameters?.query || intent.parameters?.question
      const topic = this.detectTopic(query)

      if (topic && this.knowledgeBase[topic]) {
        return {
          content: this.knowledgeBase[topic],
          metadata: {
            type: "info",
            topic,
            source: "app_knowledge"
          }
        }
      }

      // Fallback: provide general help
      return {
        content: `I can help you learn about ChainReact! Here are some topics I can explain:

**Workflows**
- How to create workflows
- What are triggers and actions
- Workflow execution and logs
- AI Agents

**Integrations**
- Available integrations
- How to connect integrations
- Integration permissions

**Features**
- Workflow templates
- Variables and data flow
- Collaboration
- Security and privacy

**Getting Started**
- Quick start guide
- Troubleshooting

What would you like to know more about?`,
        metadata: {
          type: "info",
          topics: Object.keys(this.knowledgeBase)
        }
      }

    } catch (error: any) {
      logger.error("❌ App knowledge query error:", error)
      return this.getErrorResponse("I'm having trouble answering that question. Please try rephrasing it.")
    }
  }

  async handleAction(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    // App knowledge is query-only
    return this.handleQuery(intent, integrations, userId, supabaseAdmin)
  }

  private detectTopic(query: string): string | null {
    if (!query) return null

    const lowercaseQuery = query.toLowerCase()

    // Topic detection keywords
    const topicMap: Record<string, string[]> = {
      'what_is_chainreact': ['what is chainreact', 'about chainreact', 'what does chainreact do'],
      'how_to_create_workflow': ['create workflow', 'make workflow', 'build workflow', 'new workflow'],
      'available_integrations': ['integrations', 'what integrations', 'which apps', 'supported apps'],
      'what_are_triggers': ['trigger', 'what triggers', 'how does trigger', 'workflow starts'],
      'what_are_actions': ['action', 'what actions', 'what can workflows do'],
      'ai_agent_explained': ['ai agent', 'what is ai agent', 'ai node'],
      'workflow_execution': ['how workflows run', 'workflow execution', 'how does workflow execute'],
      'how_to_connect_integration': ['connect integration', 'how to connect', 'link integration'],
      'workflow_templates': ['template', 'pre-built workflow', 'example workflow'],
      'execution_logs': ['execution log', 'workflow log', 'see what happened'],
      'workflow_variables': ['variable', 'pass data', 'data between nodes'],
      'pricing_plans': ['pricing', 'cost', 'how much', 'plans'],
      'workflow_limits': ['limit', 'maximum', 'how many'],
      'troubleshooting': ['not working', 'broken', 'error', 'problem', 'troubleshoot'],
      'security_privacy': ['security', 'privacy', 'safe', 'encryption', 'data protection'],
      'collaboration': ['team', 'collaborate', 'share workflow', 'multiple users'],
      'mobile_app': ['mobile', 'phone', 'app', 'ios', 'android'],
      'api_access': ['api', 'developer', 'webhook', 'programmatic'],
      'getting_started': ['getting started', 'how to start', 'begin', 'first workflow']
    }

    // Find matching topic
    for (const [topic, keywords] of Object.entries(topicMap)) {
      if (keywords.some(keyword => lowercaseQuery.includes(keyword))) {
        return topic
      }
    }

    return null
  }
}
