"use client"

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  Zap, Layers, Shield, Users, Bot, GitBranch,
  Clock, Workflow, Plug, Bell, BarChart3, Menu, X, ArrowRight,
  Info, AlertTriangle, CheckCircle, Lightbulb
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { TempFooter } from '@/components/temp-landing/TempFooter'

/* ------------------------------------------------------------------ */
/*  Rich content block types                                           */
/* ------------------------------------------------------------------ */

type ContentBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'steps'; items: { title: string; text: string }[] }
  | { type: 'callout'; variant: 'tip' | 'info' | 'warning'; title?: string; text: string }
  | { type: 'code'; language: string; code: string; caption?: string }
  | { type: 'image'; src: string; alt: string; caption?: string }
  | { type: 'placeholder-image'; alt: string; caption: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'list'; items: string[]; ordered?: boolean }
  | { type: 'divider' }

interface DocPage {
  id: string
  title: string
  group: string
  blocks: ContentBlock[]
}

/* ------------------------------------------------------------------ */
/*  Pages data                                                         */
/* ------------------------------------------------------------------ */

const pages: DocPage[] = [
  // ── GETTING STARTED ──────────────────────────────────────────────
  {
    id: 'overview',
    title: 'Overview',
    group: 'GETTING STARTED',
    blocks: [
      { type: 'paragraph', text: 'ChainReact is an AI-native workflow automation platform. It connects the tools you already use - Gmail, Slack, Stripe, Notion, GitHub, and more - and lets you build automations visually or by describing what you want in plain English.' },
      { type: 'paragraph', text: 'Unlike traditional automation tools, ChainReact uses AI at every layer: an AI planner that builds workflows from natural language, AI nodes that generate content at runtime, and smart suggestions that help you configure each step. Workflows are executed deterministically - AI helps you build them, but the execution engine is predictable and reliable.' },
      { type: 'image', src: '/docs/dashboard.png', alt: 'ChainReact Dashboard', caption: 'The ChainReact dashboard gives you a real-time view of all your workflows, execution history, and integration status.' },
      { type: 'heading', text: 'How it works' },
      { type: 'paragraph', text: 'ChainReact sits between your integrations and the actions you want to automate. Here\'s the flow:' },
      { type: 'steps', items: [
        { title: 'A trigger fires.', text: 'Something happens in one of your connected services - a new email arrives, a payment succeeds, a file is uploaded, a form is submitted. ChainReact detects this event in real-time via webhooks, or on a schedule via polling.' },
        { title: 'Your workflow executes.', text: 'The workflow engine processes each node in order - actions call external APIs, logic nodes control branching and loops, and AI nodes generate intelligent content. Every step is logged with full input/output data.' },
        { title: 'Results are delivered.', text: 'The final actions complete - emails are sent, messages posted, records created, files uploaded. You can monitor results in the execution history or receive notifications on success or failure.' },
      ]},
      { type: 'heading', text: 'Two ways to build' },
      { type: 'paragraph', text: 'You can build workflows in two ways, and switch between them at any time:' },
      { type: 'list', items: [
        'Visual builder - Drag and drop nodes on a canvas, connect them with edges, and configure each step in a side panel. Full control over every detail.',
        'AI planner - Describe what you want in plain English. The AI selects nodes, configures fields, maps variables, and generates the layout. Review the plan, apply it, and customize as needed.',
      ]},
      { type: 'callout', variant: 'tip', text: 'Most users start with the AI planner to get a working draft, then fine-tune in the visual builder. You can also use the AI to modify an existing workflow - it understands the current state of your canvas.' },
      { type: 'heading', text: 'Quick start' },
      { type: 'steps', items: [
        { title: 'Create your account', text: 'Go to chainreact.app and click "Get started". Sign up with email or a social provider (Google, GitHub). Choose a username - this is your identity across teams and the community.' },
        { title: 'Connect an integration', text: 'Navigate to Integrations and click "Connect" on any service. You\'ll be redirected to authorize via OAuth. ChainReact never stores your password.' },
        { title: 'Create a workflow', text: 'Click "New Workflow". Either describe your automation in the AI chat or add nodes manually on the canvas.' },
        { title: 'Test and activate', text: 'Click "Run" to test with sample data. When it works, click "Activate" to go live. Trigger resources are created automatically.' },
      ]},
      { type: 'heading', text: 'Navigating the dashboard' },
      { type: 'paragraph', text: 'After signing in, you land on the Workflows page. This is your home base. The sidebar provides navigation to all major areas:' },
      { type: 'table', headers: ['Section', 'What it does'], rows: [
        ['Workflows', 'List of all your workflows with status, last run time, and task usage. Create new workflows and organize with folders.'],
        ['Integrations', 'Connect and manage third-party services. View health status and reconnect if needed.'],
        ['Templates', 'Browse pre-built workflows. Deploy them to your workspace and customize.'],
        ['Teams', 'Create teams, invite members, and share workflows.'],
        ['Settings', 'Account preferences, billing, notification settings.'],
      ]},
      { type: 'heading', text: 'Next steps' },
      { type: 'list', items: [
        'Read the Onboarding Guide for a complete step-by-step walkthrough.',
        'Explore the Workflow Builder to understand the visual editor.',
        'Browse Templates for pre-built automations you can deploy immediately.',
      ]},
    ],
  },
  {
    id: 'onboarding',
    title: 'Onboarding Guide',
    group: 'GETTING STARTED',
    blocks: [
      { type: 'paragraph', text: 'This guide walks you through going from zero to a running workflow. Follow each step in order - it should take about 10 minutes.' },
      { type: 'heading', text: 'Step 1: Create your account' },
      { type: 'paragraph', text: 'Go to chainreact.app and click "Get started". You can sign up with your email address or use a social provider (Google, GitHub).' },
      { type: 'paragraph', text: 'After signing up, you\'ll be prompted to choose a username. This is your identity across teams, shared templates, and the community forum. You can change it later in Settings > Profile.' },
      { type: 'image', src: '/docs/login.png', alt: 'Account setup', caption: 'The ChainReact login page - sign up with email or a social provider to get started.' },
      { type: 'heading', text: 'Step 2: Connect your first integration' },
      { type: 'paragraph', text: 'Navigate to Integrations in the sidebar. You\'ll see a grid of available services - Gmail, Slack, Stripe, Notion, GitHub, and more.' },
      { type: 'steps', items: [
        { title: 'Click "Connect" on a service', text: 'For this guide, we\'ll use Gmail. Click the "Connect" button on the Gmail card.' },
        { title: 'Authorize with Google', text: 'You\'ll be redirected to Google\'s authorization page. Sign in and approve the requested permissions. ChainReact only requests the minimum scopes needed.' },
        { title: 'Verify the connection', text: 'After authorization, you\'re redirected back. Gmail should now show as "Connected" with a green indicator.' },
      ]},
      { type: 'callout', variant: 'info', text: 'You can connect as many integrations as you want. Each one unlocks new triggers and actions in the workflow builder.' },
      { type: 'heading', text: 'Step 3: Create your first workflow' },
      { type: 'paragraph', text: 'Click "New Workflow" from the dashboard. You\'ll enter the workflow builder with an empty canvas. The workflow builder has an AI-powered React agent built directly into the canvas that helps you plan and build your automation.' },
      { type: 'steps', items: [
        { title: 'Open the React agent', text: 'In the workflow builder, the AI agent panel is on the right side of the canvas. Describe what you want to automate in the chat input.' },
        { title: 'Describe your automation', text: 'Type something like: "When I get a new email in Gmail, send me a notification on Slack with the sender and subject." The React agent analyzes your request and generates a plan.' },
        { title: 'Review the plan', text: 'The agent shows a step-by-step breakdown: a Gmail trigger, followed by a Slack action. It auto-configures the variable mappings (sender name, subject line) and selects your default Slack channel.' },
        { title: 'Apply the plan', text: 'The agent generates the nodes directly on your canvas. The trigger and action appear, already connected and configured. You can continue chatting with the agent to refine the workflow.' },
      ]},
      { type: 'callout', variant: 'info', text: 'The React agent inside the workflow builder is different from the AI Assistant page. The agent builds and modifies workflows on your canvas. The AI Assistant (/ai-assistant) is a separate general-purpose chat for questions about your account, integrations, and ChainReact features.' },
      { type: 'heading', text: 'Step 4: Configure and test' },
      { type: 'paragraph', text: 'Click on any node to open its configuration panel. Review the fields - the AI has filled in most of them, but you may want to customize.' },
      { type: 'list', items: [
        'For the Slack action, verify the channel name is correct.',
        'For the message body, you can see the variable mappings: {{trigger.sender}} and {{trigger.subject}} will be replaced with real data at runtime.',
        'Add any filters to the trigger - for example, only emails from a specific sender.',
      ]},
      { type: 'paragraph', text: 'When ready, click "Run" in the toolbar. The workflow executes with sample data and you can see each step\'s input and output in the execution log.' },
      { type: 'heading', text: 'Step 5: Activate' },
      { type: 'paragraph', text: 'When you\'re happy with the test results, click "Activate" in the toolbar. The workflow is now live.' },
      { type: 'callout', variant: 'tip', text: 'When you activate a workflow, trigger resources are automatically created (webhooks are registered, polling schedules begin). When you deactivate, they\'re cleaned up. You don\'t need to manage this manually.' },
      { type: 'paragraph', text: 'That\'s it - you now have a running automation. Check the History tab on the workflow page to see future executions as they happen.' },
    ],
  },

  // ── CORE FEATURES ────────────────────────────────────────────────
  {
    id: 'workflow-builder',
    title: 'Workflow Builder',
    group: 'CORE FEATURES',
    blocks: [
      { type: 'paragraph', text: 'The workflow builder is where you design, configure, and test your automations. It\'s a visual, node-based editor with a canvas that supports drag-and-drop, zoom, pan, and multi-select.' },
      { type: 'image', src: '/docs/dashboard.png', alt: 'Workflow Builder', caption: 'The workflow builder showing your workflows, connected nodes, and execution status.' },
      { type: 'heading', text: 'Canvas' },
      { type: 'paragraph', text: 'The central workspace where nodes and edges live. Nodes represent steps (triggers, actions, logic, AI), and edges connect them to define execution order. You can drag nodes to reposition them, click edges to inspect data flow, and use the "+" buttons to add new nodes between existing ones.' },
      { type: 'paragraph', text: 'Double-click an empty area of the canvas to quickly add a new node. Use Cmd/Ctrl+Z to undo any change.' },
      { type: 'heading', text: 'Node configuration panel' },
      { type: 'paragraph', text: 'When you click a node, a panel opens on the right showing all configurable fields. Fields are typed: text inputs, dropdowns (for selecting channels, labels, etc.), toggle switches, and variable mapping selectors. Required fields are marked with an asterisk.' },
      { type: 'paragraph', text: 'Every field has three modes:' },
      { type: 'table', headers: ['Mode', 'Description', 'Example'], rows: [
        ['Static', 'A fixed value you type. Same every execution.', 'Channel: #general'],
        ['Mapped', 'References data from an upstream node via {{nodeId.field}}.', 'To: {{trigger.sender_email}}'],
        ['AI-generated', 'Generated at runtime by a language model via {{AI_FIELD:name}}.', 'Body: {{AI_FIELD:emailReply}}'],
      ]},
      { type: 'heading', text: 'AI chat panel' },
      { type: 'paragraph', text: 'A side panel where you can describe changes in natural language. The AI understands the current state of your workflow and can add nodes, reconfigure fields, remove steps, or rebuild the entire flow. Every AI suggestion is previewed before being applied.' },
      { type: 'callout', variant: 'tip', text: 'You can undo any AI-generated change. The builder keeps a full history of modifications, so you can step backward and forward freely.' },
      { type: 'heading', text: 'Toolbar' },
      { type: 'paragraph', text: 'The top bar provides quick access to key actions:' },
      { type: 'table', headers: ['Button', 'Action'], rows: [
        ['Run', 'Execute the workflow manually with sample or real trigger data.'],
        ['Activate / Deactivate', 'Toggle the workflow\'s live state. Creates/removes trigger resources.'],
        ['Undo / Redo', 'Step through change history.'],
        ['History', 'View past executions and their logs.'],
        ['Settings', 'Configure notifications, execution preferences, and workflow metadata.'],
      ]},
    ],
  },
  {
    id: 'triggers',
    title: 'Triggers',
    group: 'CORE FEATURES',
    blocks: [
      { type: 'paragraph', text: 'Every workflow starts with exactly one trigger - the event that kicks off execution. When the trigger fires, the workflow runs through all connected nodes in order.' },
      { type: 'heading', text: 'Webhook triggers' },
      { type: 'paragraph', text: 'Webhook triggers receive real-time notifications from external services. When you activate a workflow with a webhook trigger, ChainReact registers a webhook URL with the provider (e.g., Stripe, GitHub). When an event occurs, the provider sends a POST request to that URL, and the workflow executes immediately.' },
      { type: 'paragraph', text: 'When you deactivate the workflow, the webhook is automatically deleted. You don\'t need to manage webhook lifecycle manually.' },
      { type: 'heading', text: 'Polling triggers' },
      { type: 'paragraph', text: 'For services that don\'t support webhooks (or where webhooks require an enterprise plan), ChainReact polls the API at regular intervals.' },
      { type: 'callout', variant: 'info', text: 'On activation, an initial snapshot of the current state is captured so only new changes trigger the workflow. This prevents the "first poll" problem where every existing record would fire.' },
      { type: 'heading', text: 'Setting up a trigger' },
      { type: 'steps', items: [
        { title: 'Add a trigger node', text: 'In the workflow builder, click the "+" button or drag a trigger from the node palette. Select the integration (e.g., Gmail) and the trigger event (e.g., "New Email Received").' },
        { title: 'Configure filters', text: 'Most triggers support filters. For Gmail: filter by label, sender, or subject keywords. For Stripe: filter by event type. For GitHub: filter by repository, branch, or event type.' },
        { title: 'Test the trigger', text: 'Click "Run" to simulate a trigger event with sample data. Verify downstream nodes receive the correct data.' },
        { title: 'Activate', text: 'Click "Activate" to create the trigger resources and go live.' },
      ]},
      { type: 'callout', variant: 'warning', text: 'If a webhook trigger fails to register (e.g., due to permissions), activation will fail with an error message explaining the issue and how to fix it.' },
      { type: 'heading', text: 'Supported trigger types' },
      { type: 'table', headers: ['Integration', 'Trigger events', 'Type'], rows: [
        ['Gmail', 'New email received (with label/sender/subject filters)', 'Polling'],
        ['Google Calendar', 'Event created, updated, cancelled', 'Polling (sync token)'],
        ['Google Drive', 'New file in folder, file modified', 'Polling'],
        ['Slack', 'New message, reaction added, member joined', 'Webhook'],
        ['Discord', 'New message, member joined, reaction added', 'Webhook'],
        ['Notion', 'Page created, page updated, database entry added', 'Polling'],
        ['Stripe', 'Payment succeeded, subscription created/cancelled, invoice paid', 'Webhook'],
        ['GitHub', 'Push, PR opened/merged, issue created, release published', 'Webhook'],
        ['Mailchimp', 'New subscriber, subscriber updated, campaign sent', 'Polling'],
        ['Airtable', 'New record, record updated', 'Polling'],
      ]},
    ],
  },
  {
    id: 'actions-logic',
    title: 'Actions & Logic',
    group: 'CORE FEATURES',
    blocks: [
      { type: 'paragraph', text: 'Actions are the nodes that do work - calling external APIs to send emails, post messages, create records, or process payments. Logic nodes control flow without calling external services.' },
      { type: 'heading', text: 'Actions' },
      { type: 'paragraph', text: 'Each action connects to a specific integration and performs a specific operation. When you add an action node, you select the integration and operation, then configure its fields.' },
      { type: 'paragraph', text: 'Actions cost 1 task per execution. This is counted each time the node runs - including inside loops.' },
      { type: 'heading', text: 'Field configuration' },
      { type: 'paragraph', text: 'Every action has configurable fields. There are three ways to set a field\'s value:' },
      { type: 'steps', items: [
        { title: 'Static value', text: 'Type a fixed value. It stays the same every time the workflow runs. Example: Slack channel "#general", email subject "Weekly Report".' },
        { title: 'Variable mapping', text: 'Reference data from an upstream node using {{nodeId.field}} syntax. Click the {{ }} button on any field to browse available upstream data. Example: {{trigger.sender_email}} inserts the email address that triggered the workflow.' },
        { title: 'AI-generated', text: 'Mark the field as AI-generated using {{AI_FIELD:fieldName}}. At runtime, a language model generates the content using all upstream data as context. Use for email bodies, summaries, and messages - never for IDs, enums, or structural config.' },
      ]},
      { type: 'heading', text: 'Logic nodes' },
      { type: 'paragraph', text: 'Logic nodes are free - they don\'t count toward task usage. Use them to control how your workflow executes.' },
      { type: 'table', headers: ['Node type', 'What it does', 'Example'], rows: [
        ['Condition', 'Branches execution based on a data value.', 'If amount > $100, take path A; otherwise path B.'],
        ['Loop', 'Iterates over an array, running inner nodes for each item.', 'For each email attachment, save to Google Drive.'],
        ['Delay', 'Pauses execution for a duration.', 'Wait 24 hours, then send a follow-up email.'],
        ['Filter', 'Continues or stops the workflow based on a condition.', 'Only continue if sender is from @company.com.'],
      ]},
      { type: 'callout', variant: 'info', text: 'Loop iterations multiply inner node costs. A loop with 10 items containing 2 action nodes costs 20 tasks (10 x 2). The cost preview shows this before execution.' },
    ],
  },
  {
    id: 'ai-nodes',
    title: 'AI Nodes',
    group: 'CORE FEATURES',
    blocks: [
      { type: 'paragraph', text: 'AI nodes bring language model capabilities directly into your workflow execution. Unlike the AI planner (which helps you build), AI nodes run during execution and produce output that downstream nodes can use.' },
      { type: 'heading', text: 'Types of AI nodes' },
      { type: 'table', headers: ['Type', 'What it does', 'Task cost'], rows: [
        ['Text Generation', 'Produces free-form text from a prompt + upstream data.', '1-5'],
        ['Classification', 'Assigns one of your predefined labels to input data.', '1'],
        ['Summarization', 'Condenses long content into a brief summary.', '1-3'],
        ['Decision', 'Evaluates data against criteria, returns structured yes/no.', '1-2'],
      ]},
      { type: 'heading', text: 'Setting up an AI node' },
      { type: 'steps', items: [
        { title: 'Add the node', text: 'Click "+" and select "AI" from the node type picker. Choose the operation type.' },
        { title: 'Write your prompt', text: 'In the configuration panel, write the prompt. Use variable mapping ({{nodeId.field}}) to inject upstream data. Be specific - "Summarize this email in 2 sentences focusing on the issue and urgency" is better than "Summarize this".' },
        { title: 'Configure output', text: 'For classification, define your categories. For decisions, define outcomes. For text generation, the output is free-form text available to downstream nodes.' },
        { title: 'Test', text: 'Run the workflow manually and check the AI output in the execution log. Adjust the prompt until the output quality is right.' },
      ]},
      { type: 'heading', text: 'Example: Auto-classify support tickets' },
      { type: 'code', language: 'text', code: 'Prompt:\nClassify the following support ticket into one of these categories:\nbilling, technical, feature_request, account, other.\n\nTicket subject: {{trigger.subject}}\nTicket body: {{trigger.body}}\nCustomer plan: {{trigger.plan}}\n\nReturn only the category name.', caption: 'A classification prompt that uses upstream trigger data to categorize incoming support tickets.' },
      { type: 'callout', variant: 'tip', text: 'AI nodes have access to ALL upstream data. You can reference fields from any prior node in your prompt - not just the immediate predecessor.' },
    ],
  },
  {
    id: 'variable-mapping',
    title: 'Variable Mapping',
    group: 'CORE FEATURES',
    blocks: [
      { type: 'paragraph', text: 'Variable mapping is how data flows between nodes. When one node produces output, downstream nodes can reference specific fields from that output.' },
      { type: 'heading', text: 'Syntax' },
      { type: 'paragraph', text: 'The format is {{nodeId.field}} - for example, {{trigger.sender_email}} or {{node_abc.response.status}}. When the workflow executes, references are replaced with actual values.' },
      { type: 'code', language: 'text', code: 'Static text:      "Hello, welcome to our platform!"\nMapped text:      "Hello {{trigger.customer_name}}, welcome!"\nMixed:            "Payment of ${{stripe.amount}} from {{stripe.email}}"\nNested:           "File: {{drive.files.0.name}}"', caption: 'You can combine static text and variable references in any field.' },
      { type: 'heading', text: 'Using the mapping selector' },
      { type: 'steps', items: [
        { title: 'Open the selector', text: 'Click on any field, then click the {{ }} button on the right side.' },
        { title: 'Browse upstream data', text: 'The dropdown shows all upstream nodes and their output fields, organized by node. Each field shows its name, data type, and a sample value from the last test run.' },
        { title: 'Click to insert', text: 'Click a field to insert its reference. You can add multiple references in a single field.' },
        { title: 'Navigate nested data', text: 'For nested objects, use dot notation: {{trigger.payload.customer.name}}. The dropdown shows the full structure.' },
      ]},
      { type: 'callout', variant: 'info', text: 'Always prefer mapping real data over AI-generated fields. AI fields are for content that doesn\'t exist in the data - like a drafted response or summary. For IDs, emails, amounts, and factual data, always map from the source.' },
      { type: 'callout', variant: 'tip', text: 'If a mapped field is empty or missing at runtime, it resolves to an empty string. The workflow continues - it doesn\'t fail.' },
    ],
  },
  {
    id: 'testing',
    title: 'Testing & Execution',
    group: 'CORE FEATURES',
    blocks: [
      { type: 'paragraph', text: 'ChainReact provides detailed visibility into every workflow run. Whether you\'re testing manually or reviewing a live execution, the tools are the same.' },
      { type: 'heading', text: 'Manual testing' },
      { type: 'paragraph', text: 'Click "Run" in the toolbar. The workflow executes immediately using sample trigger data (from your last real event, or generated samples if none exists). The execution log appears in real-time showing progress.' },
      { type: 'image', src: '/docs/dashboard.png', alt: 'Execution log', caption: 'The execution log shows every node\'s status, input data, output data, and timing.' },
      { type: 'heading', text: 'Reading the execution log' },
      { type: 'paragraph', text: 'Each node in the log shows:' },
      { type: 'table', headers: ['Field', 'Description'], rows: [
        ['Status', 'Success (green), Failed (red), or Skipped (gray).'],
        ['Input', 'The exact data the node received, including resolved variable mappings.'],
        ['Output', 'The data the node produced, available to downstream nodes.'],
        ['Duration', 'How long the node took to execute.'],
        ['Error', 'For failed nodes: the exact error message and API response.'],
      ]},
      { type: 'heading', text: 'Debugging failures' },
      { type: 'steps', items: [
        { title: 'Identify the failed node', text: 'It\'s highlighted red in the execution log with the error message visible.' },
        { title: 'Read the error', text: 'The log shows the full error from the external service: "401 Unauthorized", "Channel not found", "Rate limit exceeded", etc. It also shows the request that was sent.' },
        { title: 'Fix the configuration', text: 'Click the node in the builder to open its config panel. Fix the issue - wrong channel name, expired token, missing field.' },
        { title: 'Retry from that node', text: 'Click "Retry from here" to re-execute just the failed node and everything after it. You don\'t need to re-run the entire workflow.' },
      ]},
      { type: 'heading', text: 'Execution history' },
      { type: 'paragraph', text: 'From the workflow detail page, click the "History" tab to see all past executions. Each entry shows the trigger event, execution time, status, and task usage. Click any entry to see the full log.' },
      { type: 'callout', variant: 'tip', text: 'The execution log preserves the exact data that flowed through each node. You can always trace back to understand why a specific action was taken.' },
    ],
  },
  {
    id: 'templates',
    title: 'Templates',
    group: 'CORE FEATURES',
    blocks: [
      { type: 'paragraph', text: 'Templates are pre-built workflows that you can deploy with a few clicks. They solve common automation scenarios and serve as starting points you can customize.' },
      { type: 'image', src: '/docs/templates.png', alt: 'Template Library', caption: 'The template library with category filters and search - browse, preview, and deploy pre-built workflows.' },
      { type: 'heading', text: 'Browsing templates' },
      { type: 'paragraph', text: 'There are two places to find templates:' },
      { type: 'list', items: [
        'Template Library (in your dashboard) - requires sign-in. Shows all predefined templates plus community-published ones.',
        'Templates Showcase (/templates/showcase) - public, no sign-in required. Shows all predefined templates.',
      ]},
      { type: 'paragraph', text: 'Each template card shows the name, description, required integrations, number of steps, and category. Use the search bar and category filters to find what you need.' },
      { type: 'heading', text: 'Deploying a template' },
      { type: 'steps', items: [
        { title: 'Preview', text: 'Click a template to see the full details: step-by-step breakdown, required integrations, and a visual preview of the workflow structure.' },
        { title: 'Connect required integrations', text: 'If the template needs integrations you haven\'t connected, you\'ll be prompted to connect them first.' },
        { title: 'Deploy', text: 'Click "Use Template". The workflow is created in your workspace with all nodes pre-configured.' },
        { title: 'Customize', text: 'Open the workflow in the builder. Adjust configurations, add or remove steps, change filters, modify AI prompts. It\'s a regular workflow now.' },
      ]},
      { type: 'heading', text: 'Publishing your own templates' },
      { type: 'paragraph', text: 'Built a useful workflow? Open the workflow settings and click "Publish as Template". Give it a name, description, and category. Published templates appear in the community library and are automatically available to the AI planner as reference patterns.' },
      { type: 'callout', variant: 'tip', text: 'Even if you don\'t deploy a template, browsing them teaches you patterns for common automation scenarios. They\'re a great learning resource.' },
    ],
  },

  // ── INTEGRATIONS & API ───────────────────────────────────────────
  {
    id: 'connecting',
    title: 'Connecting Integrations',
    group: 'INTEGRATIONS & API',
    blocks: [
      { type: 'paragraph', text: 'Integrations are the external services your workflows interact with. Before you can use a service as a trigger or action, you need to connect it - authorizing ChainReact to access your account.' },
      { type: 'paragraph', text: 'ChainReact uses OAuth 2.0 for all integrations. You\'re redirected to the service\'s own login page to authorize access. ChainReact receives a scoped token - never your password.' },
      { type: 'image', src: '/docs/integrations.png', alt: 'Apps & Integrations page', caption: 'The integrations page shows your connected services and available integrations.' },
      { type: 'heading', text: 'How to connect' },
      { type: 'steps', items: [
        { title: 'Go to Integrations', text: 'Click "Integrations" in the sidebar. You\'ll see a grid of available services with their current status.' },
        { title: 'Click "Connect"', text: 'A popup or redirect takes you to the service\'s authorization page. Sign in and approve the permissions.' },
        { title: 'Verify', text: 'After authorization, the service shows as "Connected" with a green indicator. Its triggers and actions are now available in the workflow builder.' },
      ]},
      { type: 'callout', variant: 'info', text: 'ChainReact only requests the minimum OAuth scopes needed for the triggers and actions it supports. You can review the exact permissions during the authorization flow.' },
      { type: 'heading', text: 'Disconnecting' },
      { type: 'paragraph', text: 'Click the service card and select "Disconnect". This revokes ChainReact\'s access token. Any active workflows using this service will be paused and you\'ll be notified.' },
    ],
  },
  {
    id: 'supported-services',
    title: 'Supported Services',
    group: 'INTEGRATIONS & API',
    blocks: [
      { type: 'paragraph', text: 'ChainReact currently supports the following integrations. Each includes triggers (events that start workflows) and actions (operations your workflows can perform).' },
      { type: 'table', headers: ['Service', 'Triggers', 'Actions'], rows: [
        ['Gmail', 'New email (with filters)', 'Send, reply, add label, mark read/unread, trash'],
        ['Google Calendar', 'Event created/updated/cancelled', 'Create, update, delete, list events'],
        ['Google Drive', 'New file, file modified', 'Upload, create folder, move, share, list'],
        ['Slack', 'New message, reaction, member joined', 'Send message, DM, upload file, set topic'],
        ['Discord', 'New message, member joined, reaction', 'Send message, create channel, assign role'],
        ['Notion', 'Page created/updated, DB entry added', 'Create page, update, add DB entry, query'],
        ['Stripe', 'Payment, subscription, invoice, dispute', 'Create charge, customer, subscription, refund'],
        ['GitHub', 'Push, PR, issue, release', 'Create issue, comment, PR, merge, release'],
        ['Mailchimp', 'New subscriber, campaign sent', 'Add/update subscriber, create/send campaign'],
        ['Airtable', 'New record, record updated', 'Create, update, delete, list records'],
      ]},
      { type: 'paragraph', text: 'More integrations are added regularly based on user requests. Submit a request from the Integrations page for a service we don\'t support yet.' },
    ],
  },
  {
    id: 'integration-health',
    title: 'Integration Health',
    group: 'INTEGRATIONS & API',
    blocks: [
      { type: 'paragraph', text: 'ChainReact proactively monitors every connected integration to ensure your workflows run reliably. The health system operates automatically - you don\'t need to configure anything.' },
      { type: 'heading', text: 'How monitoring works' },
      { type: 'list', items: [
        'Token refresh - Tokens are tracked and automatically refreshed before they expire. This happens silently in the background.',
        'Health checks - Periodic lightweight API calls validate each integration. Interval depends on the provider: 4h for Slack/Discord/GitHub/Notion, 6h for Gmail/Calendar, 12h for others.',
        'Status indicators - Healthy (green), Warning (yellow), Action Required (red). Visible on the Integrations page.',
      ]},
      { type: 'heading', text: 'Escalation timeline' },
      { type: 'paragraph', text: 'If an integration stays degraded, ChainReact escalates notifications:' },
      { type: 'table', headers: ['Day', 'Action'], rows: [
        ['0', 'Initial notification. Issue detected, automatic retry in progress.'],
        ['2', 'Reminder. Steps to resolve (usually reconnecting).'],
        ['5', 'Urgent notice. Workflows may be failing silently.'],
        ['7', 'Workflows paused to prevent silent failures.'],
      ]},
      { type: 'paragraph', text: 'Reconnecting resets the escalation. Health returns to green and paused workflows become eligible to resume (they don\'t auto-resume - you choose which to reactivate).' },
    ],
  },

  // ── AI FEATURES ──────────────────────────────────────────────────
  {
    id: 'ai-planner',
    title: 'React Agent',
    group: 'AI FEATURES',
    blocks: [
      { type: 'paragraph', text: 'The React agent is an AI-powered assistant built directly into the workflow builder. It lets you build automations by describing what you want in plain English - the agent creates nodes, configures fields, maps variables, and connects everything on your canvas.' },
      { type: 'paragraph', text: 'The React agent is different from the AI Assistant page. The agent lives inside the workflow builder and modifies your canvas in real-time. The AI Assistant (/ai-assistant) is a separate general-purpose chat for questions about your account and ChainReact features.' },
      { type: 'heading', text: 'How to use' },
      { type: 'steps', items: [
        { title: 'Open the agent panel', text: 'In the workflow builder, the React agent panel is on the right side of the canvas. Type your request in the chat input at the bottom.' },
        { title: 'Describe your automation', text: 'Be specific about which services, what should trigger it, what actions should happen, and any conditions. Example: "When a customer pays on Stripe, look up their email in Airtable, and send a thank-you email via Gmail with their order details."' },
        { title: 'Review the plan', text: 'The agent responds with a step-by-step plan showing the trigger, actions, logic, and data flow. It outlines what it will build before applying changes.' },
        { title: 'Watch it build', text: 'The agent generates nodes directly on your canvas - trigger, actions, and connections appear in real-time. Fields are pre-configured with variable mappings and sensible defaults.' },
        { title: 'Refine with follow-ups', text: 'Continue the conversation: "Only send the email if payment is over $50" or "Add a Slack notification too." The agent understands the current state of your canvas and makes targeted changes.' },
      ]},
      { type: 'callout', variant: 'tip', text: 'The React agent only suggests nodes for services you\'ve connected. If your prompt mentions Slack but you haven\'t connected it, the agent will tell you to connect it first.' },
      { type: 'heading', text: 'Tips for better results' },
      { type: 'list', items: [
        'Be specific. "Automate my email" is vague. "When I receive an email from @company.com with an invoice attachment, save it to Drive and notify #accounting on Slack" gives the agent everything it needs.',
        'You can use the agent on an existing workflow - it understands the current canvas state and can add, modify, or remove nodes.',
        'Follow-up messages are context-aware. You can iteratively refine without re-describing the whole workflow.',
        'The agent supports undo - if it makes a change you don\'t like, you can step backward.',
      ]},
    ],
  },
  {
    id: 'ai-fields',
    title: 'AI-Generated Fields',
    group: 'AI FEATURES',
    blocks: [
      { type: 'paragraph', text: 'AI-generated fields let you use language model intelligence inside node configuration. Instead of a static value or mapped data, the AI produces content at runtime based on your workflow context.' },
      { type: 'heading', text: 'Syntax' },
      { type: 'code', language: 'text', code: '{{AI_FIELD:emailBody}}\n{{AI_FIELD:summary}}\n{{AI_FIELD:responseCategory}}', caption: 'AI field references in node configuration.' },
      { type: 'paragraph', text: 'When the workflow executes, the system sends the field name, any instructions, and all upstream node data to the language model. The model generates contextual content that replaces the reference.' },
      { type: 'heading', text: 'When to use' },
      { type: 'list', items: [
        'Email body text - Compose personalized responses based on trigger data.',
        'Slack messages - Generate contextual summaries instead of generic notifications.',
        'Data summaries - Condense long API responses or email threads.',
        'Response drafts - Draft customer support replies for review or auto-sending.',
      ]},
      { type: 'callout', variant: 'warning', text: 'Never use AI fields for IDs, dropdown selections, enum values, channel names, or structural configuration. Those should always be static or mapped from upstream data.' },
    ],
  },

  // ── CONFIGURATION ────────────────────────────────────────────────
  {
    id: 'teams',
    title: 'Teams & Roles',
    group: 'CONFIGURATION',
    blocks: [
      { type: 'paragraph', text: 'Teams let you collaborate on workflows with other people. Members share a workspace with shared workflows, integrations, and templates.' },
      { type: 'heading', text: 'Creating a team' },
      { type: 'steps', items: [
        { title: 'Go to Teams', text: 'Navigate to Teams in the sidebar and click "Create Team".' },
        { title: 'Name your team', text: 'Enter a team name and optional description. You become the Admin automatically.' },
        { title: 'Invite members', text: 'Click "Invite" and enter email addresses. Members receive an invitation link. If they don\'t have an account, they\'ll be prompted to create one.' },
      ]},
      { type: 'heading', text: 'Roles' },
      { type: 'table', headers: ['Role', 'Capabilities'], rows: [
        ['Admin', 'Full access: team settings, member management, billing, all workflows. Can invite/remove members and delete the team.'],
        ['Member', 'Create, edit, and run workflows. Connect integrations. Use templates. Cannot manage team settings or members.'],
        ['Viewer', 'Read-only access to workflows and execution history. Cannot edit or connect anything.'],
      ]},
      { type: 'callout', variant: 'tip', text: 'Team integrations are shared - when an Admin or Member connects a service, all team workflows can use it. You only need to connect Gmail once for the whole team.' },
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications & Alerts',
    group: 'CONFIGURATION',
    blocks: [
      { type: 'paragraph', text: 'ChainReact sends two types of notifications: workflow execution alerts and integration health alerts.' },
      { type: 'heading', text: 'Workflow notifications' },
      { type: 'paragraph', text: 'Configure per-workflow in the workflow settings panel. Toggle notifications on, enter an email address, and select which events to be notified about: failures, completions, and activations/deactivations.' },
      { type: 'heading', text: 'Integration health alerts' },
      { type: 'paragraph', text: 'Automatic. When an integration\'s health changes, you receive an email explaining what happened and what to do. The escalation timeline follows the schedule described in Integration Health.' },
      { type: 'callout', variant: 'info', text: 'When you reconnect a degraded integration, the escalation resets. Paused workflows become eligible to resume - they don\'t auto-resume. You choose which to reactivate.' },
    ],
  },
  {
    id: 'security',
    title: 'Security & Privacy',
    group: 'CONFIGURATION',
    blocks: [
      { type: 'paragraph', text: 'ChainReact is designed with security at every layer. Here\'s a comprehensive overview.' },
      { type: 'heading', text: 'Encryption' },
      { type: 'paragraph', text: 'All data is encrypted at rest (AES-256) and in transit (TLS 1.3). This applies to workflow definitions, execution logs, user data, and integration credentials. Tokens and API keys are stored in an encrypted vault and never appear in logs, errors, or API responses.' },
      { type: 'heading', text: 'OAuth 2.0' },
      { type: 'paragraph', text: 'Every integration uses OAuth 2.0. ChainReact never sees your passwords. Tokens are scoped to minimum required permissions and automatically refreshed before expiration.' },
      { type: 'heading', text: 'Row-Level Security' },
      { type: 'paragraph', text: 'Our PostgreSQL database enforces row-level security policies. Data isolation is at the database level - not just the application level. One user\'s queries cannot return another user\'s data, even if application code had a bug.' },
      { type: 'heading', text: 'Additional protections' },
      { type: 'list', items: [
        'CORS - Strict policies prevent unauthorized cross-origin requests. No wildcard origins with credentials.',
        'CSP - Content Security Policy headers protect against XSS and injection attacks.',
        'No token logging - Secrets are never written to logs, error tracking, or debugging output.',
        'Admin step-up auth - Destructive admin actions require re-verifying your identity.',
      ]},
      { type: 'callout', variant: 'info', text: 'Found a vulnerability? Report it to security@chainreact.app. We respond within 24 hours.' },
    ],
  },

  // ── ACCOUNT ──────────────────────────────────────────────────────
  {
    id: 'billing',
    title: 'Plans & Billing',
    group: 'ACCOUNT',
    blocks: [
      { type: 'paragraph', text: 'ChainReact uses a task-based billing model. Every workflow execution consumes tasks based on the nodes it runs.' },
      { type: 'heading', text: 'What counts as a task' },
      { type: 'table', headers: ['Node type', 'Cost', 'Notes'], rows: [
        ['Action nodes', '1 task', 'Per execution. Counted inside loops too.'],
        ['AI nodes', '1-5 tasks', 'Depends on operation complexity and input size.'],
        ['Trigger nodes', 'Free', 'The event that starts your workflow.'],
        ['Logic nodes', 'Free', 'Conditions, loops, delays, filters.'],
      ]},
      { type: 'callout', variant: 'info', text: 'Loop iterations multiply inner costs. 10 iterations × 2 action nodes = 20 tasks. The cost preview shows this before execution.' },
      { type: 'heading', text: 'Plans' },
      { type: 'table', headers: ['', 'Free', 'Pro', 'Enterprise'], rows: [
        ['Workflows', '5', '25', 'Unlimited'],
        ['Tasks / month', '1,000', '10,000', 'Unlimited'],
        ['Integrations', 'All standard', 'All standard', 'All + custom'],
        ['AI planner', 'Yes', 'Priority', 'Priority'],
        ['Versioning', '-', 'Yes', 'Yes'],
        ['SSO / SAML', '-', '-', 'Yes'],
        ['Custom deploy', '-', '-', 'Yes'],
        ['Support', 'Community', 'Email', 'Dedicated'],
      ]},
      { type: 'heading', text: 'Monitoring usage' },
      { type: 'paragraph', text: 'Your current task usage is visible on the dashboard and in Settings > Billing. See a breakdown by workflow - which ones consume the most tasks and how usage trends over time.' },
    ],
  },
]

/* ------------------------------------------------------------------ */
/*  Changelog                                                          */
/* ------------------------------------------------------------------ */

const changelogEntries = [
  {
    version: '0.16.0',
    date: 'April 2026',
    title: 'Landing Page, Docs & Public Pages',
    changes: [
      'New marketing landing page with feature showcase, pricing preview, and integrations section',
      'Full documentation site with sidebar navigation, search, and rich content blocks',
      'Public pages: Enterprise, Templates Showcase, Community, Support, About, Contact, Security',
      'Deterministic health state machine for integration monitoring with escalation timeline',
      'Task-cost visibility: server-authoritative cost preview, loop expansion, confirmation dialog, and billing history',
      'Major webhook overhaul with improved Gmail, Calendar, and Teams trigger lifecycle',
    ],
  },
  {
    version: '0.15.0',
    date: 'March 2026',
    title: 'React Agent Overhaul',
    changes: [
      'Complete revamp of the React agent flow with state-based context',
      'Undo support and flow awareness in the AI planner',
      'Conversation summarization for context management',
      'Major AI update with workflow completion recognition and verification',
      'Page loading overhaul with preloader system',
      'File cleanup and task cost fixes for workflows',
      'Admin panel updates and new controls',
    ],
  },
  {
    version: '0.14.0',
    date: 'February 2026',
    title: 'Polling Triggers & Mailchimp',
    changes: [
      'Centralized polling cron system with per-provider intervals',
      'Completed Mailchimp integration: triggers (new subscriber, updates) and actions (add/update subscriber, campaigns)',
      'Finished Trello triggers with webhook lifecycle',
      'Shopify trigger updates and silent failure detection',
      'Stripe billing and webhook lifecycle improvements',
      'Proactive health check system for integrations',
      'Google Drive trigger fixes',
    ],
  },
  {
    version: '0.13.0',
    date: 'January 2026',
    title: 'Teams, Monday & Refactoring',
    changes: [
      'Completed all Microsoft Teams triggers and actions',
      'Monday.com integration with triggers',
      'Major codebase refactor: removed legacy paths and one-off scripts',
      'Fixed manual triggers with React agent',
      'Added scopes for Monday triggers',
      'Google Sheets integration improvements',
      'Cron job for webhook event cleanup',
      'QOL improvements for the workflow builder',
    ],
  },
  {
    version: '0.12.0',
    date: 'December 2025',
    title: 'Shopify & Final Integrations',
    changes: [
      'Completed Shopify integration with OAuth and webhook triggers',
      'Finished Mailchimp actions and triggers',
      'Teams page and settings finalized',
      'Shopify triggers and webhook lifecycle',
    ],
  },
  {
    version: '0.11.0',
    date: 'November 2025',
    title: 'Teams, Organizations & Shopify',
    changes: [
      'Team lifecycle management with grace periods and warnings',
      'Automatic workspace switching for team/org creation',
      'Admin debug system for troubleshooting',
      'Fixed N+1 query issues on team pages',
      'Role-based permissions for team Quick Actions',
      'Team Recent Activity feature',
      'Shopify OAuth integration started',
      'Airtable Add Attachment UX improvements',
      'Notion and Mailchimp integration updates',
    ],
  },
  {
    version: '0.10.0',
    date: 'October 2025',
    title: 'Trigger Lifecycle & Notion',
    changes: [
      'Major update to trigger lifecycle management',
      'Refactored execution engine',
      'Notion API and webhook update (documentation changed)',
      'HubSpot Public App webhooks with dynamic subscription management',
      'Microsoft Teams trigger completion with webhook lifecycle',
      'Centralized required field and visibility function refactor',
      'Admin page improvements',
      'Organization and teams settings overhaul',
      'Workspace team isolation implementation',
      'Trigger delete fix - no longer leaves orphaned actions',
      'Security: removed sensitive data from logs',
    ],
  },
  {
    version: '0.9.0',
    date: 'September 2025',
    title: 'AI Agent & Airtable Completion',
    changes: [
      'AI agent chain builder - completed multi-step AI workflow chains',
      'Real-time synchronization between AI Agent builder and main workflow',
      'Airtable triggers fully working with webhook verification',
      'Gmail and Airtable triggers working end-to-end',
      'OneDrive new file webhook trigger',
      'Stripe billing page with webhook integration',
      'Google Drive upload file action completed',
      'Gmail and Google Drive actions completed',
      'Professional email templates for account confirmations',
      'Workflow builder action modal connection fixes',
      'Major refactoring of AI agent flow',
    ],
  },
  {
    version: '0.8.0',
    date: 'August 2025',
    title: 'Webhooks & Integration Actions',
    changes: [
      'Webhook system setup for all major providers',
      'Microsoft Graph webhook system with subscription management',
      'Stripe webhook integration with signature verification',
      'Airtable webhook flow with per-base registration',
      'Trello webhook endpoint and board-level webhooks',
      'Slack URL verification and webhook event handling',
      'HubSpot trigger definitions for webhook subscriptions',
      'AI agent improvements: variable resolution, OpenAI API integration',
      'Airtable config modals completed with date picker and record selector',
      'Google Sheets record selector UI',
      'Admin controls expanded',
      'Coming Soon badges for planned integrations (Beehiiv, ManyChat, PayPal, etc.)',
    ],
  },
  {
    version: '0.7.0',
    date: 'July 2025',
    title: 'Workflow Builder & AI Agent',
    changes: [
      'AI agent added to workflow builder',
      'Airtable move record and create record actions',
      'Google Drive scope changes',
      'Google Spreadsheet workflow updates and Sheets actions completed',
      'Discord workflow updates with reaction config modals',
      'Variable picker for previous nodes',
      'Workflow builder node position saving fix',
      'Performance enhancements and caching (templates, integrations)',
      'Teams OAuth flow improvements',
    ],
  },
  {
    version: '0.6.0',
    date: 'June 2025',
    title: 'OAuth Framework & Integration Foundation',
    changes: [
      'OAuth 2.0 framework for all providers: Gmail, Slack, Discord, Notion, GitHub, Stripe, Teams, Trello, LinkedIn, OneDrive, Twitter/X, Facebook',
      'Integration diagnostics tool with scope validation',
      'Standardized OAuth callback routes and redirect URIs',
      'Integration page rebuilt with detailed connection status',
      'Google OAuth with OpenID scopes and enhanced error handling',
      'Microsoft identity association for domain verification',
      'Encrypted token storage with automatic refresh',
      'Auth flow simplification across all pages',
    ],
  },
  {
    version: '0.5.0',
    date: 'May 2025',
    title: 'Project Initialization',
    changes: [
      'Repository initialized',
      'GitHub OAuth integration - first provider connected',
      'Login form with email/password and social providers',
      'Landing page with initial design',
      'Integration connection/disconnection flow',
      'Pricing page design',
    ],
  },
]

/* ------------------------------------------------------------------ */
/*  Sidebar                                                            */
/* ------------------------------------------------------------------ */

interface SidebarGroup { label: string; items: { id: string; title: string }[] }

function buildSidebar(): SidebarGroup[] {
  const groups = new Map<string, SidebarGroup>()
  for (const page of pages) {
    if (!groups.has(page.group)) groups.set(page.group, { label: page.group, items: [] })
    groups.get(page.group)!.items.push({ id: page.id, title: page.title })
  }
  // Add changelog under ACCOUNT
  groups.get('ACCOUNT')!.items.push({ id: 'changelog', title: 'Changelog' })
  return Array.from(groups.values())
}

/* ------------------------------------------------------------------ */
/*  Block renderer                                                     */
/* ------------------------------------------------------------------ */

function BlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'paragraph':
      return <p className="text-[15px] text-gray-600 leading-[1.8] mb-5">{block.text}</p>

    case 'heading':
      return <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">{block.text}</h2>

    case 'steps':
      return (
        <div className="my-6 space-y-5">
          {block.items.map((step, i) => (
            <div key={i} className="flex gap-4">
              <div className="shrink-0 w-7 h-7 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold mt-0.5">
                {i + 1}
              </div>
              <div>
                <p className="text-[15px] font-semibold text-gray-900 mb-1">{step.title}</p>
                <p className="text-[14px] text-gray-600 leading-[1.7]">{step.text}</p>
              </div>
            </div>
          ))}
        </div>
      )

    case 'callout': {
      const styles = {
        tip: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', label: 'text-orange-700', icon: Lightbulb },
        info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', label: 'text-blue-700', icon: Info },
        warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', label: 'text-amber-700', icon: AlertTriangle },
      }
      const s = styles[block.variant]
      const Icon = s.icon
      return (
        <div className={`${s.bg} border ${s.border} rounded-lg p-4 my-6 flex gap-3`}>
          <Icon className={`w-4 h-4 ${s.label} mt-0.5 shrink-0`} />
          <div>
            {block.title && <p className={`text-xs font-semibold ${s.label} uppercase tracking-wider mb-1`}>{block.title}</p>}
            <p className={`text-sm ${s.text} leading-relaxed`}>{block.text}</p>
          </div>
        </div>
      )
    }

    case 'code':
      return (
        <div className="my-6">
          <div className="bg-gray-900 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
              <span className="text-xs text-gray-400">{block.language}</span>
            </div>
            <pre className="p-4 overflow-x-auto">
              <code className="text-sm text-gray-300 leading-relaxed whitespace-pre">{block.code}</code>
            </pre>
          </div>
          {block.caption && <p className="text-xs text-gray-400 mt-2 text-center">{block.caption}</p>}
        </div>
      )

    case 'placeholder-image':
      return (
        <div className="my-8">
          <div className="bg-gray-100 border border-gray-200 rounded-lg overflow-hidden aspect-[16/9] flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
              </div>
              <p className="text-sm text-gray-400">{block.alt}</p>
            </div>
          </div>
          {block.caption && <p className="text-xs text-gray-500 mt-2 text-center">{block.caption}</p>}
        </div>
      )

    case 'image':
      return (
        <div className="my-8">
          <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <img src={block.src} alt={block.alt} className="w-full" />
          </div>
          {block.caption && <p className="text-xs text-gray-500 mt-2 text-center">{block.caption}</p>}
        </div>
      )

    case 'table':
      return (
        <div className="my-6 overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-gray-50">
                {block.headers.map((h, i) => (
                  <th key={i} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0">
                  {row.map((cell, j) => (
                    <td key={j} className={`px-4 py-2.5 text-gray-600 ${j === 0 ? 'font-medium text-gray-900' : ''}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )

    case 'list':
      return (
        <ul className={`my-4 space-y-2 ${block.ordered ? 'list-decimal' : 'list-disc'} pl-5`}>
          {block.items.map((item, i) => (
            <li key={i} className="text-[14px] text-gray-600 leading-[1.7] pl-1">{item}</li>
          ))}
        </ul>
      )

    case 'divider':
      return <hr className="my-8 border-gray-200" />

    default:
      return null
  }
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function DocsPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [activePageId, setActivePageId] = useState('overview')
  const [showChangelog, setShowChangelog] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const sidebarGroups = buildSidebar()
  const activePage = pages.find(p => p.id === activePageId)
  const activeId = showChangelog ? 'changelog' : activePageId

  const navigateTo = (id: string) => {
    setActivePageId(id)
    setShowChangelog(false)
    setSidebarOpen(false)
    window.scrollTo({ top: 0 })
  }

  // Prev / Next
  const currentIdx = pages.findIndex(p => p.id === activePageId)
  const prevPage = currentIdx > 0 ? pages[currentIdx - 1] : null
  const nextPage = currentIdx < pages.length - 1 ? pages[currentIdx + 1] : null

  return (
    <div className="min-h-screen bg-white">
      {/* Top nav */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between h-14 px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/logo_transparent.png" alt="ChainReact" width={22} height={22} />
              <span className="text-sm font-semibold text-gray-900">ChainReact</span>
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-sm text-gray-500">Docs</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-1.5 text-gray-500 hover:text-gray-900"
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <button
              onClick={() => router.push(user ? '/workflows' : '/auth/login')}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium h-8 px-4 rounded-md bg-orange-600 text-white hover:bg-orange-700 transition-colors"
            >
              {user ? 'Go to Dashboard' : 'Get Started'}
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto flex">
        {/* Sidebar */}
        <aside
          className={`
            fixed inset-y-0 left-0 z-40 w-56 bg-white border-r border-gray-200 pt-14 overflow-y-auto
            transition-transform duration-200
            lg:sticky lg:top-14 lg:pt-0 lg:h-[calc(100vh-56px)] lg:translate-x-0 lg:z-0
            ${sidebarOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'}
          `}
        >
          <nav className="py-3 px-3">
            {sidebarGroups.map((group) => (
              <div key={group.label} className="mb-4">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-2">
                  {group.label}
                </p>
                <div className="space-y-px">
                  {group.items.map((item) => {
                    const isActive = activeId === item.id
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          if (item.id === 'changelog') {
                            setShowChangelog(true)
                            setSidebarOpen(false)
                            window.scrollTo({ top: 0 })
                          } else {
                            navigateTo(item.id)
                          }
                        }}
                        className={`w-full text-left px-3 py-1.5 rounded-sm text-[13px] transition-colors border-l-2 ${
                          isActive
                            ? 'border-orange-500 bg-orange-50/60 text-orange-700 font-medium'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                        }`}
                      >
                        {item.title}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/20 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 px-8 sm:px-12 lg:px-20 py-10 max-w-3xl">
          {showChangelog ? (
            <>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Changelog</h1>
              <p className="text-gray-500 mb-10">A history of everything we&apos;ve shipped.</p>
              <div className="space-y-10">
                {changelogEntries.map((entry) => (
                  <div key={entry.version} className="relative pl-8 border-l-2 border-gray-200">
                    <div className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-orange-500 border-2 border-white" />
                    <div className="flex items-baseline gap-3 mb-2">
                      <span className="text-xs font-mono font-semibold px-2 py-0.5 bg-orange-100 text-orange-700 rounded">v{entry.version}</span>
                      <span className="text-xs text-gray-400">{entry.date}</span>
                    </div>
                    <h3 className="text-base font-semibold text-gray-900 mb-2">{entry.title}</h3>
                    <ul className="space-y-1">
                      {entry.changes.map((c) => (
                        <li key={c} className="text-sm text-gray-600 flex items-start gap-2">
                          <span className="text-gray-300 mt-1 shrink-0">•</span>{c}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          ) : activePage ? (
            <>
              <h1 className="text-3xl font-bold text-gray-900 mb-6">{activePage.title}</h1>
              {activePage.blocks.map((block, i) => (
                <BlockRenderer key={i} block={block} />
              ))}

              {/* Prev / Next */}
              <div className="flex items-center justify-between mt-14 pt-8 border-t border-gray-200">
                {prevPage && !showChangelog ? (
                  <button
                    onClick={() => navigateTo(prevPage.id)}
                    className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                  >
                    ← {prevPage.title}
                  </button>
                ) : <span />}
                {nextPage && !showChangelog ? (
                  <button
                    onClick={() => navigateTo(nextPage.id)}
                    className="text-sm text-orange-600 hover:text-orange-700 transition-colors flex items-center gap-1"
                  >
                    {nextPage.title}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : !showChangelog ? (
                  <button
                    onClick={() => { setShowChangelog(true); window.scrollTo({ top: 0 }) }}
                    className="text-sm text-orange-600 hover:text-orange-700 transition-colors flex items-center gap-1"
                  >
                    Changelog
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : <span />}
              </div>
            </>
          ) : null}

        </main>
      </div>

      {/* Full-width footer */}
      <TempFooter />
    </div>
  )
}
