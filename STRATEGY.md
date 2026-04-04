# ChainReact — Master Strategy & Competitive Positioning

**Last Updated:** 2026-04-04
**Status:** Living Document — Update as strategy evolves

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [What ChainReact Is](#2-what-chainreact-is)
3. [Competitive Landscape](#3-competitive-landscape)
4. [Our Unique Differentiators](#4-our-unique-differentiators)
5. [Positioning & Messaging](#5-positioning--messaging)
6. [Pricing Strategy](#6-pricing-strategy)
7. [Current App Feature Inventory](#7-current-app-feature-inventory)
8. [Where We Can Improve & What To Add](#8-where-we-can-improve--what-to-add)
9. [Feature Roadmap — What Seals The Deal](#9-feature-roadmap--what-seals-the-deal)
10. [Landing Page Analysis & Redesign](#10-landing-page-analysis--redesign)
11. [Target Audience](#11-target-audience)
12. [Content & SEO Strategy](#12-content--seo-strategy)
13. [Growth Playbook](#13-growth-playbook)
14. [Technical Moats](#14-technical-moats)
15. [Pending Pages & Marketing Infrastructure](#15-pending-pages--marketing-infrastructure)

---

## 1. Executive Summary

**Old positioning:** "A cheaper alternative to Zapier with extra features."
**Problem:** Make.com already owns the "cheap Zapier" lane with years of head start, 3,000+ integrations, and strong brand recognition. We can't win that fight.

**New positioning:** "The AI-native automation platform — describe it, watch AI build it, it just works."

**Why this wins:** After comprehensive analysis of every major competitor (Zapier, Make.com, n8n, Activepieces, Relay.app, Bardeen, Pipedream, Power Automate, Tray.io, Lindy.ai, Relevance AI), **no one does what our AI builder does**. We have genuine technical moats that would take competitors 12+ months to replicate. Price becomes the pleasant surprise, not the headline.

---

## 2. What ChainReact Is

ChainReact is a workflow automation platform that connects integrations (Slack, Gmail, Stripe, Shopify, etc.), allows users to build workflows visually or through AI, and executes workflows deterministically. AI is a core component of both the **creation** and **execution** experience.

### Core Stack
- Next.js 15 App Router, TypeScript, Supabase (PostgreSQL + real-time)
- Zustand stores, Tailwind + Shadcn/UI
- Custom node-based workflow engine (React Flow)
- Multi-model AI (OpenAI GPT-4o, Claude, Google Gemini)

### Current Scale
- 35+ integration providers
- 247+ workflow nodes
- 40+ pre-built templates
- 5-tier pricing (Free → Enterprise)
- Public Beta status

---

## 3. Competitive Landscape

### Direct Competitors

| Platform | Positioning | Pricing | AI Building | Integrations | Weakness |
|---|---|---|---|---|---|
| **Zapier** | Easiest automation for everyone | $0-$69/mo (task-based) | "Describe a Zap" — shallow, ~60-70% complete | 7,000+ | Expensive at scale, punitive task pricing |
| **Make.com** | Powerful + cheap visual builder | $0-$29/mo (ops-based) | Basic AI assistant, module-level help | 3,000+ | Steep learning curve, overwhelming UI |
| **n8n** | Open-source, developer-first | Free (self-host) / $20-50/mo (cloud) | No AI builder — focuses on AI nodes | 400+ | Requires DevOps knowledge, less polished |
| **Activepieces** | True open-source (MIT) | Free (self-host) / $10/mo | Minimal AI | ~200 | Young product, small catalog |
| **Relay.app** | Human-in-the-loop AI | $9-29/mo | AI as execution step, not builder | ~150 | Small integration catalog |
| **Bardeen** | Browser-based AI automation | Free / $10/mo | Magic Box NL builder (good, narrow scope) | Limited | Browser-dependent, can't scale |
| **Pipedream** | Code-first for developers | Free / $29-75/mo | No AI builder | 3,000+ | Not for non-technical users |
| **Power Automate** | Microsoft ecosystem | $15-40/user/mo | Copilot (strong within MSFT) | Microsoft-focused | Clunky UI, confusing licensing |
| **Tray.io** | Enterprise integration | $500+/mo custom | Merlin AI | Universal connector | Expensive, opaque pricing |

### AI-Native Competitors (Different Category)

| Platform | What They Do | How They Differ |
|---|---|---|
| **Lindy.ai** | "AI employees" — agents that decide how to handle situations | More agentic, less deterministic. No repeatable audit trail. |
| **Relevance AI** | AI agent/workforce platform for sales/support | Agent capabilities, not traditional workflows. |
| **Clay** | AI-powered data enrichment spreadsheets | Niche to sales/marketing data. Not workflow automation. |

### Key Market Insights

**Universal user complaints about automation tools:**
- Task/operation-based pricing feels punitive at scale
- Debugging workflows is universally painful
- Error handling is inadequate across all platforms
- Vendor lock-in anxiety
- "Simple" tools can't handle complex logic; "powerful" tools are too complex
- Workflows become undocumented tribal knowledge

**Unmet needs:**
- Better observability and debugging
- Version control for workflows
- Test mode that doesn't consume tasks
- Native AI that actually understands your business context
- Migration tools between platforms

**Emerging trends:**
- AI workflow generation from natural language is becoming table stakes
- AI as a workflow step (not just builder) is the real battleground
- Open-source is gaining fast
- "Agent" workflows where AI decides the path are emerging but unproven
- Human-in-the-loop resonates with teams that don't trust full autonomy

---

## 4. Our Unique Differentiators

### What NOBODY Else Does

| Feature | Description | Closest Competitor | Gap |
|---|---|---|---|
| **Real-time streaming workflow generation** | Users watch nodes build one-by-one via SSE as AI creates their workflow | Nobody | We're alone |
| **Field classification system** | Every field categorized as deterministic, mappable, or generative — no field is ever empty | Nobody | We're alone |
| **`{{AI_FIELD}}` runtime generation** | AI generates dynamic content at execution time with full upstream context | Lindy.ai (conceptually) | Architecturally different |
| **Multi-turn conversational refinement** | Modify workflows through conversation without replanning from scratch | Power Automate Copilot (partial) | We're deeper |
| **Self-growing template pool** | System learns from user patterns, auto-generates templates | Nobody | We're alone |
| **Business context injection** | Smart context with precedence rules and deduplication | Nobody | We're alone |
| **Drafting context state machine** | Persistent multi-turn state without LLM replanning | Nobody | We're alone |
| **AI as native workflow participant** | AI Agent, AI Router, AI Message, AI Data Processing as first-class nodes | n8n has AI nodes | Our integration is deeper |

### Competitive Feature Matrix — AI Building

| Capability | Zapier | Make | n8n | Power Automate | Bardeen | Lindy | **ChainReact** |
|---|---|---|---|---|---|---|---|
| NL → Workflow | Yes | Basic | No | Yes | Yes | Yes (agents) | **Yes** |
| Multi-step generation | Limited | Basic | No | Yes | Yes | N/A | **Yes** |
| Auto field configuration | Partial | Minimal | No | Good (MSFT only) | Good (scraping) | N/A | **Yes + AI_FIELD** |
| Streaming generation | No | No | No | No | No | No | **Yes** |
| Field classification | No | No | No | No | No | No | **Yes** |
| Conversational refinement | Basic | No | No | Partial | No | Basic | **Yes** |
| Real-time node building | No | No | No | No | No | No | **Yes** |
| Self-learning templates | No | No | No | No | No | No | **Yes** |
| Business context memory | No | No | No | No | No | No | **Yes** |

### What This Means

Our streaming AI builder is not an incremental improvement — it's a category-defining experience. When a user describes a workflow and watches it get built node-by-node in real time, with AI automatically classifying and filling every field, that's a fundamentally different experience from any competitor. This is our "wow moment."

---

## 5. Positioning & Messaging

### Primary Positioning

> **"The automation platform where AI does the building, not just the running."**

### One-Liner Options

| Option | Use Case |
|---|---|
| "Describe it. Watch AI build it. Done." | Homepage hero, ads |
| "Workflows that think, not just connect." | Feature pages, social |
| "From idea to automation in 60 seconds." | Demo CTAs, tutorials |
| "AI builds your workflows. You just describe what you want." | Explainer content |
| "Stop configuring. Start describing." | Pain point ads |

### Messaging Hierarchy

1. **Hook:** Watch AI build your workflow in real-time (demo/video)
2. **Trust:** It actually works — best-in-class monitoring and debugging
3. **Value:** Free to build, cheap to run. 3x cheaper than Zapier.
4. **Moat:** Workflows get smarter over time (business context, templates, AI fields)

### What We Are NOT

- We are NOT "Zapier but cheaper" (Make.com owns this)
- We are NOT "open-source automation" (n8n/Activepieces own this)
- We are NOT "AI agents that replace workflows" (Lindy/Relevance own this)
- We ARE "AI-native workflow automation" — AI builds deterministic workflows, combining the reliability of traditional automation with the intelligence of AI

---

## 6. Pricing Strategy

### Current Pricing

| Plan | Price | Tasks/Month | Key Features |
|---|---|---|---|
| Free | $0 | 100 | Basic workflows, 5 active, 7-day history |
| Pro | $19/mo | 750 | AI Agents, 30-day history, detailed logs |
| Beta | $0 | 750 | Full Pro access + priority support |
| Team | $49/mo | 2,000 | 5 members, shared workspaces, 90-day history |
| Business | $99/mo | 5,000 | 15 members, dedicated support, 1-year history |
| Enterprise | Custom | Unlimited | SSO/SAML, custom contracts, 99.99% SLA |

### Recommended Pricing Strategy: Free to Build, Pay to Run

**Core principle:** Let everyone experience the AI magic for free. Charge for execution.

**Why this works:**
- The marginal cost of AI generation (~$0.01-0.05 per workflow) is tiny vs lifetime customer value
- People who build workflows WILL want to run them — natural conversion funnel
- Competitors charge for everything — this is disruptive
- Marketing writes itself: **"Free AI workflow builder. Forever."**

**The math:** At $0.03 average per AI generation, if 10% of free users convert to $19/mo Pro, you need each free user to generate fewer than ~63 workflows before one converts. That's extremely viable.

**Implementation:**
- Unlimited AI workflow creation on ALL tiers (including Free)
- Free tier: 100 task executions/month (existing)
- Rate limiting: 20 AI generations per day to prevent abuse (existing rate limit of 20/min is sufficient)
- AI nodes in execution (AI Router, AI Message, etc.) count as tasks and consume from the task quota

**Key messaging shift:**
- Old: "100 free tasks/month"
- New: "Build unlimited workflows with AI. Free forever. Pay only when you run them."

### Overage Pricing (Existing)
- Pro: $0.025/task
- Team: $0.02/task
- Business: $0.015/task
- Positioned as 2.7-6.7x cheaper than Zapier equivalents

---

## 7. Current App Feature Inventory

Everything ChainReact currently offers, organized by what users can do:

### Workflow Builder
- **Visual drag-and-drop canvas** — node-based editor with ReactFlow, auto-layout, zoom/pan/fit controls
- **247+ workflow nodes** across 35+ integration providers
- **Node configuration** — point-and-click setup with provider-specific UIs, cascading dependent fields, dynamic option loading
- **Conditional logic** — If/Then branching with AND/OR conditions, comparison operators, custom expressions
- **Loops** — iterate over arrays or repeat N times (up to 500), with cost estimation
- **Filters** — multi-condition array filtering
- **HTTP Request node** — generic REST calls (GET/POST/PUT/DELETE) with custom headers/auth
- **Data Transformer** — format conversion, HTML→Markdown, text manipulation
- **Web scraping** — Extract Website Data node with DOM selectors
- **Workflow versioning** — automatic version tracking, revert to previous versions, change summaries
- **Workflow organization** — folders, search, sort, filter by status, star/favorite, workspace scoping

### AI Features (User-Facing)
- **AI chat-based workflow builder** — describe what you want in natural language, watch AI build it
- **Real-time streaming generation** — nodes appear one-by-one on canvas via SSE with build progress %
- **Conversational refinement** — modify workflows through follow-up messages without replanning
- **Provider disambiguation** — AI detects "send a message" and asks which app (Slack vs Teams vs Discord)
- **AI Agent node** — AI-powered decision logic within workflows, configurable model/provider/prompts
- **AI Router node** — intelligent branching with confidence scores based on AI analysis
- **AI Message node** — dynamic content generation with variable substitution + AI enhancement
- **AI Data Processing node** — extract, classify, summarize, translate using AI
- **AI Field automation** — mark individual fields as AI-generated, auto-filled from workflow context
- **Business context memory** — AI remembers your company details across sessions

### Triggers
- **Manual** — run on demand
- **Webhook** — HTTP endpoint trigger
- **Schedule** — one-time, recurring (daily/weekly), custom intervals
- **Integration event triggers** — new email, new Slack message, new Shopify order, etc.
- **Polling triggers** — Gmail, Google Drive, Airtable, Shopify, Microsoft Excel, etc.
- **Push/webhook triggers** — Slack, Discord, Stripe, GitHub (real-time)

### Integrations (35+ Providers)

| Category | Providers |
|---|---|
| Communication | Gmail, Slack, Discord, Microsoft Teams, Microsoft Outlook, ManyChat |
| Productivity | Google Docs, Google Drive, Google Sheets, Google Calendar, Notion, Trello, Airtable, Monday.com, OneNote |
| Storage | OneDrive, Google Drive, Dropbox |
| Business/CRM | HubSpot, Mailchimp, Stripe, Gumroad |
| Social Media | Twitter/X, Facebook, Instagram, LinkedIn |
| E-Commerce | Shopify, Stripe |
| Analytics | Google Analytics |
| Development | GitHub |

- One-click OAuth connection for each provider
- Multi-account support (multiple Gmail accounts, etc.)
- Connection health monitoring with proactive refresh
- Secure encrypted credential storage

### Human-in-the-Loop (HITL)
- **Ask Human via Chat** — workflow pauses and asks a human for input
- **Discord integration** for HITL conversations
- **Timeout configuration** — auto-resume or fail after set time
- **Variable extraction** from human responses
- **Conversation transcript tracking**

### Templates
- 40+ pre-built templates across categories: AI Automation, Customer Service, Sales & CRM, Social Media, Productivity
- One-click "Use Template" with provider substitution modal
- Template preview before importing
- Search and filter by category
- Self-growing template pool (system learns from user patterns)

### Execution & Monitoring
- **Test Mode** — run workflows with mock or real trigger data
- **Debug Mode** — execution path visualization with node-by-node status
- **Execution logs** — detailed logs with timestamps, input/output data, error messages
- **AI Field resolution details** — see exactly what AI generated and why
- **Cost tracking** — per-node cost estimation, task balance widget, confirmation for expensive runs
- **Analytics dashboard** — success rate, error rate, daily trends, top workflows, average execution time

### Team & Collaboration
- **Teams** — create and manage teams within organizations
- **Shared workspaces** — personal, team, and organization-level workflow scoping
- **Workflow sharing** — share with individuals or teams (use/manage/admin permissions)
- **Organization management** — org-wide settings, member management

### Settings & Account
- **Profile** — name, email, username, avatar
- **Billing** — plan management, usage tracking, upgrade/downgrade
- **AI Usage** — token usage and cost tracking
- **Notifications** — email/Slack alerts for workflow success/failure, weekly digest
- **Appearance** — dark/light theme
- **AI Context** — business context configuration for better AI suggestions

### Onboarding & Learning
- **Interactive onboarding tour** — step-by-step walkthrough with spotlight highlighting
- **Onboarding checklist** — Connect app → Create workflow → Test → Activate
- **Learning center** (`/learn`) — docs, video tutorials, integration guides, API reference
- **Keyboard shortcuts**

### Security & Auth
- Email/password auth via Supabase
- OAuth integration for app connections
- Two-factor authentication setup
- Session management
- Encrypted credential storage (AES-256)
- SSO/SAML (Enterprise tier)

---

## 8. Where We Can Improve & What To Add

### Current Weaknesses (Be Honest)

**Integration Count Gap**
- We have 35+ integrations. Zapier has 7,000+. Make has 3,000+.
- This is our biggest weakness on paper. Mitigate by: (1) focusing on the top 50 most-used integrations, (2) building a generic HTTP/API node that covers everything else, (3) AI that configures generic HTTP calls from natural language.

**Error Handling UX**
- Execution errors exist in logs but aren't user-friendly
- Need: plain-english error explanations, one-click retry from failed step, proactive health alerts
- This is a universal competitor weakness — fixing it is a huge differentiator

**Onboarding Speed**
- Current onboarding checklist is good but not magical
- Need: pre-connected demo mode, AI-guided first workflow in under 2 minutes
- The AI builder should BE the onboarding — "What do you want to automate?" as the first question

**Social Proof**
- We're in beta — no real customer metrics yet
- Stats on landing page (10k workflows, 99.9% uptime) may not be credible yet
- Better: Show the product, not claims. Demo video > vanity metrics.

**Template Depth**
- 40+ templates is good but could be richer
- Need category-specific deep templates (e.g., "Complete Shopify order management" not just "Shopify → Slack")

**Documentation**
- `/docs` page doesn't exist yet
- `/learn` page exists but could be richer
- Users need per-integration setup guides

### What To Add (Prioritized)

#### P0 — Must Have Before Marketing Push

| Feature | Why | Impact |
|---|---|---|
| **60-second demo video** | The #1 conversion asset. Shows AI building a workflow in real-time. | Conversion +++ |
| **Pre-signup demo mode** | Try the AI builder with mock data before creating an account | Top-of-funnel +++ |
| **Plain-english error messages** | "Your Slack token expired" instead of "401 Unauthorized" | Retention +++ |
| **One-click retry from failed step** | Don't re-run the whole workflow, just the broken part | Retention ++ |
| **Per-integration setup guides** | "How to connect Gmail in 30 seconds" | Activation ++ |

#### P1 — Strong Differentiators

| Feature | Why | Impact |
|---|---|---|
| **"Explain This Workflow" button** | AI generates plain-english docs for any workflow. Nobody does this. | Differentiation +++ |
| **Workflow marketplace** | Users share/discover templates. Community flywheel. | Growth +++ |
| **Import from Zapier** | Reduce switching friction. Parse Zap JSON or rebuild from description. | Acquisition ++ |
| **Cost comparison calculator** | Show exact savings vs Zapier/Make for their use case | Conversion ++ |
| **Natural language monitoring** | "Alert me when Shopify orders drop below 10/day" | Differentiation ++ |

#### P2 — Growth Multipliers

| Feature | Why | Impact |
|---|---|---|
| **AI Workflow Optimizer** | "This costs $3.20/mo — here's a version that costs $0.80" | Differentiation ++ |
| **Workflow version visual diff** | See exactly what changed. One-click rollback. | Retention + |
| **Team approval flows** | Pause workflow → human approves → continue | Feature parity + |
| **More integrations** | Target top 50 most-requested. Add Asana, Jira, Zendesk, Intercom, Calendly. | Acquisition ++ |
| **Mobile monitoring app** | Check workflow status, approve HITL from phone | Retention + |

#### P3 — Moonshots

| Feature | Why | Impact |
|---|---|---|
| **Embeddable workflows** | SaaS companies embed ChainReact in their products | Revenue +++ |
| **Voice-to-workflow** | Speak your automation. Mobile-first creation. | Differentiation ++ |
| **Screenshot/video → workflow** | Upload manual process recording, AI automates it | Differentiation +++ |
| **Workflow analytics + recommendations** | "Your Slack notification workflow runs 200x/day — consider batching" | Retention ++ |

### Features to Showcase on Landing Page (Conversion Drivers)

These are the features that will make visitors sign up. Ordered by conversion impact:

1. **AI builds your workflow in real-time** (streaming demo video) — This is THE hook
2. **Free to build, pay to run** — Removes all friction from trying the product
3. **35+ deep integrations** — Proves it's not a toy
4. **AI nodes that think** — AI Router, AI Message, AI Agent as workflow steps
5. **Human-in-the-loop** — AI pauses and asks you when unsure
6. **Templates library** — One-click start, don't build from scratch
7. **Conditional logic & loops** — Handle complex business rules
8. **Execution monitoring** — Know what's happening, debug in seconds
9. **Team collaboration** — Share workflows, manage permissions
10. **3x cheaper than Zapier** — The pleasant surprise after the wow moment

---

## 9. Feature Roadmap — What Seals The Deal

### Tier 1: Highest Impact (Build These First)

#### 1. Reliability & Debugging Excellence
**Why:** People leave Zapier/Make because workflows break silently. If failures are clearly explained with one-click fixes, that's worth more than any feature.

**What to build:**
- Plain-english error explanations ("Slack rejected the message because the channel was archived")
- One-click retry from the exact failed step
- Proactive notifications before things break (health checks exist — surface them to users)
- Workflow health dashboard showing at-risk workflows

**Marketing angle:** "Debug in seconds, not hours"

#### 2. Speed to First Value (Onboarding)
**Why:** #1 reason people abandon automation tools is they can't get their first workflow working.

**What to build:**
- User signs up → connects 2 apps → describes what they want → watches AI build it → tests → activates. Under 5 minutes.
- Pre-connected demo mode: try the AI builder BEFORE signing up with mock data
- Interactive onboarding with guided first workflow

**Marketing angle:** "Your first automation in 5 minutes"

#### 3. "Explain This Workflow" — AI Documentation
**Why:** Nobody does this. Every competitor's workflows become undocumented tribal knowledge.

**What to build:**
- Click a button → AI generates plain-english documentation of what a workflow does
- Auto-updated when workflow changes
- Exportable for team wikis

**Marketing angle:** "Workflows that document themselves"

#### 4. Demo Video of AI Building a Workflow
**Why:** This is your "wow moment" and it needs to be captured.

**What to create:**
- 60-second screen recording: user types description → AI builds workflow node-by-node → user refines → tests → activates
- Use on homepage hero, social media, ads, Product Hunt launch
- This single asset could be the most valuable marketing investment

### Tier 2: Strong Differentiators (Build These Next)

#### 5. Workflow Marketplace / Community Templates
**Why:** Creates a community flywheel. Your self-growing template pool feeds this naturally.

**What to build:**
- Users share and discover workflows
- "One-click install" templates with guided setup
- Rating system, categories, search
- Featured/trending templates

**Marketing angle:** "Thousands of workflows, one click away"

#### 6. "Import from Zapier" Migration Tool
**Why:** Reduces switching friction. People are frustrated with Zapier but scared to migrate.

**What to build:**
- Parse Zapier Zap export JSON
- "Describe your existing automation and we'll rebuild it"
- Side-by-side cost comparison calculator

**Marketing angle:** "Switch from Zapier in minutes"

#### 7. Workflow Version History with Visual Diff
**Why:** Version control for workflows is an unmet need across the industry.

**What to build:**
- See exactly what changed between versions
- One-click rollback
- Versioning already exists in the codebase — surface it better in UI

#### 8. Natural Language Monitoring
**Why:** Turns the platform into a monitoring tool, not just automation.

**What to build:**
- "Alert me when my Shopify orders drop below 10/day"
- "Notify me if any workflow fails more than 3 times"
- AI interprets monitoring rules from natural language

**Marketing angle:** "Monitor your business in plain English"

### Tier 3: Moonshot Differentiators (Future)

#### 9. AI Workflow Optimizer
- "Your workflow runs 47 steps but could be reduced to 12"
- "This workflow costs $3.20/month — here's a version that costs $0.80"
- Directly attacks the "Zapier is too expensive" pain

#### 10. Team Handoff & Approval Flows
- Workflow runs → pauses → sends approval request → continues or stops
- Relay.app's whole pitch — take the feature without making it the whole product

#### 11. Embeddable Workflows
- Let SaaS companies embed ChainReact workflows into their own products
- "Powered by ChainReact" in integration pages
- Opens B2B2C revenue stream

#### 12. Voice-to-Workflow
- Speak your automation → AI builds it
- Mobile-first creation experience
- Nobody does this

#### 13. AI Workflow Generation from Screenshot/Video
- "Show me your manual process, I'll automate it"
- Upload a screen recording of your manual workflow → AI creates the automated version

---

## 10. Landing Page Analysis & Redesign

### Current State: Two Landing Pages

We have two landing pages — the current homepage (`/`) and a temp redesign (`/temp`). Here's the honest analysis of both:

### Current Homepage (`/`) — Analysis

**Section Flow:**
1. Header (sticky, standard nav)
2. Hero: "Workflow automation that thinks for itself"
3. HITL Demo (interactive 6-step workflow demo)
4. Flexibility Section (3x3 feature grid — 9 features)
5. Use Cases (4 tabbed: Support, Sales, Content, Data Sync)
6. Integrations Showcase (2-row auto-scrolling marquee)
7. Social Proof (Available Today / On Roadmap lists + stats)
8. Final CTA + Footer

**What's Working:**
- Interactive HITL demo immediately shows product value (6-step customer support flow)
- Clear feature grid is scannable (9 features with icons)
- Integration marquee conveys breadth (20+ logos)
- Use case tabs with workflow steps and ROI metrics are specific and tangible
- Gradient hero creates visual interest
- Stats section (10k workflows, <100ms, 99.9% uptime) adds credibility

**What's Not Working:**
- Hero headline "thinks for itself" is vague — doesn't explain what the product does
- The HITL demo is cool but it's below the fold — visitors may not scroll to see it
- 9-feature grid is generic ("Enterprise Security", "Fast Execution") — could describe any SaaS tool
- "Everything You Need" header says nothing specific
- Social proof stats may not be credible in beta
- CTA is "Get Early Access" — not specific about what you get
- The AI builder story (our #1 differentiator) is barely mentioned
- No pricing visibility on the landing page
- Missing: comparison to alternatives, specific customer outcomes

### Temp Redesign (`/temp`) — Analysis

**Section Flow:**
1. Header (transparent → blur on scroll, Space Grotesk font)
2. Hero: "Your automations break. Ours learn." + browser mockup screenshot
3. Trust Bar (integration logos marquee)
4. Why Automation Breaks (3-paragraph problem narrative)
5. Learning Loop (3-step scroll sequence: Build → Teach → Improve)
6. Use Cases (4 tabbed with problem/outcome format)
7. Feature Showcase (asymmetric 7/5 grid — 4 features)
8. Integrations (large "20+" gradient number + marquee)
9. Stats (narrative paragraph with embedded metrics)
10. Final CTA: "Try it. It's free."
11. Footer (newsletter signup + links)

**What's Working:**
- Problem-first narrative creates emotional connection ("Every automation tool has the same problem")
- "Your automations break. Ours learn." is a much stronger headline than "thinks for itself"
- Learning Loop scroll sequence is engaging on desktop (build → teach → improve story)
- Use cases show problem/outcome instead of just feature lists
- Asymmetric feature grid feels more dynamic than uniform grids
- Space Grotesk typography adds personality
- Cleaner, more focused design — less visual clutter
- Story flow follows: Why → How → What (classic Golden Circle)

**What's Not Working:**
- No interactive demo — relies entirely on narrative (tell vs show)
- PlaceholderMedia components still need real screenshots/videos
- "What else is in the box" section undersells important features
- No social proof metrics at all
- Stats section is too subtle (buried in a paragraph)
- Final CTA "Try it. It's free." is generic
- Learning Loop focuses on HITL/corrections but misses the AI builder story entirely
- No mention of AI building workflows from natural language
- Missing: pricing, specific use case outcomes, comparison to alternatives

### Head-to-Head Verdict

| Aspect | Current (`/`) | Temp (`/temp`) | Winner |
|---|---|---|---|
| Emotional hook | Weak — feature-focused | Strong — problem-first | **Temp** |
| Shows product | Yes — interactive demo | No — placeholder images | **Current** |
| Core differentiator visible | No — AI builder buried | Partially — learning loop | **Neither** |
| Typography/personality | Standard sans-serif | Space Grotesk, more character | **Temp** |
| Social proof | Stats + roadmap list | None | **Current** |
| Use case depth | Detailed with steps + ROI | Problem/outcome pairs | **Tie** |
| Integration display | Marquee + custom request CTA | Large "20+" + marquee | **Tie** |
| CTA clarity | "Get Early Access" (vague) | "Try it. It's free." (better) | **Temp** |
| Overall narrative flow | Feature dump | Story (Why → How → What) | **Temp** |
| Mobile experience | Good | Good | **Tie** |

### Recommended Landing Page Design — Best of Both + AI Builder Focus

Take the temp redesign as the foundation (better narrative structure, better design), but fix its weaknesses and add the AI builder as the hero story.

#### Recommended Section Flow

```
1. HEADER — Sticky, scroll-aware transparency, Space Grotesk
2. HERO — AI builder headline + embedded demo video/animation
3. TRUST BAR — Integration logos + "Works with your tools"
4. PROBLEM — "Every automation tool has the same problem" (from temp)
5. THE AI BUILDER — "Describe it. Watch AI build it." (NEW — our #1 differentiator)
6. THE LEARNING LOOP — "It gets smarter" (from temp, shortened)
7. FEATURES — Key capabilities grid (from current, with better design)
8. USE CASES — Tabbed with outcomes (best of both)
9. INTEGRATIONS — 20+ deep integrations
10. PRICING — Visible on landing page (currently hidden)
11. SOCIAL PROOF — Stats + testimonials (when available)
12. FINAL CTA — Specific and compelling
13. FOOTER — Newsletter + links
```

#### Section Details

**1. HEADER**
- Keep temp's scroll-aware transparency + Space Grotesk
- Nav: How It Works, Features, Pricing, Integrations
- CTA: "Try Free" (orange, always visible)

**2. HERO — The AI Builder Story**
This is the most important change. The hero must show our #1 differentiator immediately.

- **Headline:** "Describe your workflow. Watch AI build it."
- **Subheadline:** "ChainReact turns plain English into working automations — built node by node in real time. Free to try."
- **Primary CTA:** "Start Building — Free" (orange)
- **Secondary CTA:** "Watch 60-Second Demo" (outline)
- **Visual:** Embedded video (or animated mockup) showing the streaming AI build experience
  - User types "When I get a new Shopify order, send a Slack notification and add to Google Sheets"
  - AI builds nodes one by one on the canvas
  - Fields auto-populate
  - Workflow is ready to test
- **Below hero:** Small trust badge row: "No credit card" + "35+ integrations" + "Free during beta"

**Why this hero works:** It immediately answers "What does this do?" and "Why is it different?" — the two questions every landing page visitor asks in the first 5 seconds.

**3. TRUST BAR**
- Keep temp's marquee with 12 integration logos
- "Works with Gmail, Slack, Shopify, HubSpot, and 30+ more"

**4. PROBLEM SECTION — "Sound familiar?"**
- Keep temp's problem-first narrative but make it punchier:
  - "You spend hours building a workflow. It breaks. You fix it. It breaks again."
  - "Generic AI doesn't understand your business. It hallucinates. You clean up the mess."
  - "Every correction disappears. Nothing learns. You're back to square one."
- Transition: "ChainReact is different." (arrow or line leading to next section)

**5. THE AI BUILDER — New Section (Most Important)**
This section doesn't exist in either current page. It should be the centerpiece.

- **Headline:** "AI that builds your workflows for you"
- **3-step visual:**
  1. **Describe** — "Tell ChainReact what you want in plain English"
     - Show chat interface screenshot
  2. **Watch** — "AI builds your workflow node by node, in real time"
     - Show streaming build animation/GIF (nodes appearing on canvas)
  3. **Refine** — "Don't like something? Just say so. AI updates it instantly."
     - Show refinement conversation screenshot
- **Below:** "Then AI fills in every field automatically — no manual configuration."
- **CTA:** "Try the AI Builder" (links to signup → workflow builder)

**Why this section matters:** This is what no competitor has. It deserves its own dedicated section, not a bullet point.

**6. THE LEARNING LOOP — Shortened**
- Keep temp's concept but condense from scroll sequence to 3 static cards:
  1. "AI hits an edge case it's unsure about → it asks you"
  2. "You correct it once"
  3. "It never asks the same question twice"
- Visual: Simple before/after or accuracy improvement graphic
- This should be 1/3 the screen space of the current temp version — it's important but secondary to the AI builder

**7. FEATURES — Clean Grid**
- Take current page's grid approach but with temp's design sensibility
- **6 features, not 9** (cut the generic ones):
  1. **AI Nodes** — AI Router, AI Message, AI Agent as workflow steps
  2. **Visual Builder** — Drag-and-drop with 247+ nodes
  3. **Conditional Logic** — If/then, loops, filters for complex rules
  4. **Human-in-the-Loop** — AI pauses and asks when unsure
  5. **Execution Monitoring** — Real-time logs, error tracking, analytics
  6. **Templates** — 40+ pre-built workflows, one-click start
- Each: icon + title + 1-line description + small screenshot/illustration

**8. USE CASES — Tabbed**
- Keep current's tabbed approach with temp's problem/outcome format
- 4 tabs: Customer Support, Sales Pipeline, Content Publishing, Data Sync
- Each shows: problem statement, solution with ChainReact, outcome metrics
- CTA per tab: "Build This Workflow with AI"

**9. INTEGRATIONS**
- Keep temp's "20+" large gradient number
- Marquee of logos
- Add: "Don't see your tool? Our HTTP Request node connects to anything with an API."

**10. PRICING — New (Currently Hidden)**
- Show pricing directly on the landing page
- Lead with: "Free AI builder. Forever. Pay only when you run workflows."
- Show Free / Pro / Team tiers (simplified version of full pricing page)
- Highlight: "3x cheaper than Zapier" comparison note
- CTA: "Start Free"

**Why show pricing:** Hiding pricing loses visitors who want to evaluate before signing up. Transparency builds trust. Every top competitor (Zapier, Make, n8n) shows pricing on their homepage.

**11. SOCIAL PROOF**
- For now (beta): Show capability metrics — "247+ nodes", "35+ integrations", "<100ms response", "AI builds in 60 seconds"
- When available: Customer quotes, logos, specific outcomes
- Include: "Free during beta — join early for lifetime benefits"

**12. FINAL CTA**
- **Headline:** "Your first AI-built workflow is 60 seconds away"
- **Sub:** "Describe what you want. Watch AI build it. Test it. Activate it. All free."
- **Button:** "Start Building — Free" (large, orange)
- **Trust:** "No credit card. Cancel anytime. Free during beta."

**13. FOOTER**
- Keep temp's newsletter signup
- Columns: Product, Resources, Company, Legal
- Social links
- Clean, minimal

#### Design System for Final Page

- **Font:** Space Grotesk (headlines), Inter/system (body) — from temp
- **Colors:** Slate-900/white (text), Orange-500 (primary CTA), Rose-500 (gradient accents) — blend of both
- **Layout:** Max-w-7xl, consistent py-24 sections
- **Animations:** Scroll-triggered fade-ins (subtle), no scroll-pinning
- **Screenshots:** Real product screenshots, not mockups or illustrations
- **Mobile:** Single-column fallback, stacked CTAs, no scroll sequences

---

## 11. Target Audience

### Primary: Non-Technical Ops/Marketing/Sales Teams
**Who:** People who currently use Zapier/Make but find them too complex or expensive
**Pain:** "I know what I want automated but I don't know how to build it"
**Message:** "Just describe it. AI builds it for you."

### Secondary: Small Business Founders
**Who:** Founders drowning in manual processes who don't have time to learn a tool
**Pain:** "I need automation but I don't have a technical co-founder"
**Message:** "Your first automation in 5 minutes, no code required"

### Tertiary: Agencies
**Who:** Marketing/ops agencies who build automations for clients
**Pain:** "Building client automations takes too long and costs too much"
**Message:** "Build client automations 10x faster with AI"

### Quaternary: Developers
**Who:** Developers who want AI to scaffold integration work
**Pain:** "I don't want to manually configure every field in every integration"
**Message:** "AI handles the boring parts, you handle the logic"

### Audience Shift
**From:** "People who think Zapier is too expensive"
**To:** "People who want AI to handle the complexity of automation for them"

---

## 12. Content & SEO Strategy

### Blog Posts (Priority Order)

**Launch Posts:**
1. "Introducing ChainReact: The AI That Builds Your Workflows For You"
2. "Watch: AI Builds a Complete Workflow in 60 Seconds" (demo video post)
3. "ChainReact vs Zapier: Why We're Different (It's Not Just Price)"
4. "How ChainReact's AI Actually Works (Technical Deep Dive)"
5. "Your First AI-Built Workflow in 5 Minutes (Tutorial)"

**Ongoing Content:**
- Workflow template showcases ("Automate your Shopify → Slack pipeline in 30 seconds")
- Comparison pages ("ChainReact vs Make.com", "ChainReact vs n8n")
- Use case guides ("AI-Powered Customer Support Automation")
- Integration guides (per-provider)

### SEO Pages
- `/compare/zapier` — ChainReact vs Zapier
- `/compare/make` — ChainReact vs Make.com
- `/compare/n8n` — ChainReact vs n8n
- `/templates` — Template marketplace (high-intent traffic)
- `/integrations/[provider]` — Per-integration landing pages

### Comparison Page Legal Guidelines

Comparison pages are **legally safe and industry-standard** — Pipedream, Monday.com, Notion, ClickUp, HubSpot, and even Make.com all publish competitor comparison pages. Comparative advertising is protected under the First Amendment and the Lanham Act (US). Follow these rules:

**Do:**
- State **factual, verifiable claims** only ("Zapier charges $19.99/mo for 750 tasks")
- Use competitor **trademarked names accurately** (correct spelling, capitalization)
- Include a disclaimer: *"All pricing and features verified as of [date]. Trademarks belong to their respective owners."*
- Focus on ChainReact's strengths — don't attack competitors
- Keep information **current** — update pages when competitor pricing/features change
- Link to competitor pricing pages as sources when citing their prices

**Don't:**
- Make **false or misleading claims** about competitors
- Use competitor **logos without permission** (describe them, don't display them)
- Imply **endorsement or affiliation** (no "Recommended Zapier alternative" or "Zapier-approved")
- Use **disparaging or mocking language** about competitors
- Run **paid ads using competitor trademarked names in ad copy** (bidding on keywords is fine in the US, but the ad text itself shouldn't include their trademark — this is the one gray area)
- Forget to **update pages** — stale/wrong competitor info is the #1 legal risk

**Page Template:**
```
Title: "ChainReact vs [Competitor] — Honest Comparison (2026)"
Sections:
  1. Quick summary (2-3 sentences, neutral tone)
  2. Feature comparison table (factual, sourced)
  3. Pricing comparison (with "as of [date]" note)
  4. Where [Competitor] wins (shows honesty/credibility)
  5. Where ChainReact wins (our differentiators)
  6. Who should use which (helps reader self-select)
  7. CTA: "Try ChainReact free"
Footer disclaimer: "Trademarks belong to their respective owners.
  Pricing and features verified as of [date]."
```

**Why include "Where [Competitor] wins":** This builds trust. If someone reads a comparison page that only praises ChainReact, they won't believe any of it. Acknowledging competitor strengths (e.g., "Zapier has 7,000+ integrations vs our 35+") makes the page credible, and lets our real differentiators (AI builder, price) land harder.

### Pending Pages to Build
1. **Contact** (`/contact`) — simplest, highest immediate value
2. **Security** (`/security`) — builds trust fast
3. **Documentation** (`/docs`) — most important for user success
4. **Blog** (`/blog`) — SEO value grows over time

---

## 13. Growth Playbook

### Phase 1: Product-Led Growth (Now)

1. **Ship the "wow moment"** — Make the AI builder experience flawless
2. **Free tier as conversion funnel** — Unlimited AI building, limited execution
3. **Demo video** — 60-second screen recording for everywhere
4. **Product Hunt launch** — Lead with the streaming AI builder
5. **Template library** — Pre-built workflows that showcase the AI

### Phase 2: Content-Led Growth (Next)

1. **Comparison pages** — SEO for "[tool] alternative" keywords
2. **Tutorial content** — "How to automate X with AI" blog posts
3. **YouTube demos** — Video content showing AI building workflows
4. **Community templates** — User-generated content flywheel

### Phase 3: Community-Led Growth (Future)

1. **Workflow marketplace** — Users share and discover
2. **Agency partner program** — Agencies build on ChainReact for clients
3. **Embeddable workflows** — B2B2C distribution
4. **Integration partner pages** — Co-marketing with integration providers

### The Viral Loop
```
User describes workflow → AI builds it (wow!) → User shares demo/result
→ New user signs up → Describes their own workflow → Repeat
```

The streaming AI build experience IS the viral moment. Every first-time user who watches their workflow get built live is a potential advocate.

---

## 14. Technical Moats

These are architecturally unique systems that would take competitors 12+ months to replicate:

### 1. Multi-Stage LLM Planning Pipeline
- Two-tier node catalog (compact for selection, full for configuration)
- ~50 tokens per node in selection phase vs ~500 for full schema
- Multi-stage: intent → strategy → node selection → configuration → edges
- Reference: `/src/lib/workflows/builder/agent/llmPlanner.ts`

### 2. Field Classification Engine
- Every field classified as deterministic, mappable, or generative
- Hard rule: no text field is ever empty
- Semantic matching with recency weighting for auto-mapping
- Reference: `/src/lib/workflows/builder/agent/fieldClassifier.ts`

### 3. SSE Streaming Generation
- Real-time node-by-node building with step-by-step feedback
- Event types: thinking, checking_prerequisites, planning, building, node_creating, node_configuring, node_testing, workflow_complete
- Reference: `/app/api/ai/stream-workflow/route.ts`, `/lib/ai/stream-workflow-helpers.ts`

### 4. Drafting Context State Machine
- Persistent multi-turn state without LLM replanning
- Deterministic reducer (no LLM calls needed for state transitions)
- ~50-80 tokens of context per turn
- Reference: `/src/lib/workflows/builder/agent/draftingContext.ts`

### 5. Business Context Injection
- Precedence system: User prompt > Locked entries > Unlocked entries > Workflow preferences > HITL memories
- Canonical key normalization prevents duplicate facts
- Relevance scoring with provider/category matching
- Reference: `/lib/ai/businessContextFormatter.ts`

### 6. Self-Growing Template Pool
- Three layers: built-in → published (DB) → dynamic (auto-learned)
- Analyzes prompt clusters (5+ similar prompts) to generate new templates
- Template matches cost $0, LLM fallback costs $0.01-0.05
- Reference: `/lib/workflows/ai-agent/dynamicTemplates.ts`

### 7. Agent Evaluation Framework
- Built-in A/B testing and quality tracking for AI planner
- 24 event types across 4 categories
- Deterministic 10% sampling (hash-based)
- Reference: `/lib/eval/agentEvalTracker.ts`

---

## 15. Pending Pages & Marketing Infrastructure

### Pages to Build

| Page | Priority | Effort | Purpose |
|---|---|---|---|
| `/contact` | P0 | Low | Users need a way to reach us |
| `/security` | P0 | Low | Builds trust fast |
| `/docs` | P1 | Medium | User success, reduces support load |
| `/blog` | P1 | Medium | SEO, thought leadership |
| `/compare/zapier` | P1 | Low | High-intent SEO traffic |
| `/compare/make` | P1 | Low | High-intent SEO traffic |
| `/compare/n8n` | P2 | Low | Developer audience |
| `/templates` (public) | P2 | Medium | SEO + conversion |
| `/integrations/[provider]` | P2 | Medium | Per-integration SEO pages |

### Marketing Assets Needed

| Asset | Priority | Purpose |
|---|---|---|
| 60-second AI builder demo video | P0 | Homepage hero, social, ads, Product Hunt |
| Product screenshots (7 key screens) | P0 | Landing page, docs, social |
| Cost comparison calculator | P1 | Conversion tool, comparison pages |
| Case study template | P2 | Customer stories |
| Press kit | P2 | Media outreach |

---

## Summary: The Winning Formula

```
1. HOOK:    "Watch AI build your workflow in real-time"
            → Demo video, interactive demo, streaming experience

2. CONVERT: "Free AI builder, forever"
            → Unlimited workflow creation, pay only for execution

3. RETAIN:  "It just works — and gets smarter"
            → Best-in-class debugging, self-improving templates, business context

4. EXPAND:  "Your whole team, automated"
            → Team features, marketplace, embeddable workflows

5. DEFEND:  Technical moats
            → 12+ months for competitors to replicate our AI architecture
```

**The one thing that matters most right now:** Capture the AI builder experience in a demo video and put it front and center. That streaming build experience IS the product. Everything else flows from that wow moment.

---

## Appendix A: Temp Landing Page Redesign Prompt

The following is a complete specification for redesigning the `/temp` landing page. Copy this entire section as a prompt for implementation.

---

### PROMPT: Redesign the `/temp` Landing Page

Redesign the temp landing page at `/temp` to lead with our #1 differentiator — the AI workflow builder — instead of the current HITL/learning loop focus. Keep the temp page's design system (Space Grotesk, slate/orange palette, scroll-aware header) but restructure the sections, rewrite the copy, and add new sections.

**Important:** All changes stay within `/app/temp/` and `/components/temp-landing/`. Do not touch the current homepage at `/`.

#### SECTION-BY-SECTION CHANGES

**1. TempHeader.tsx — Update Nav Items**
- Change nav items to: `"How It Works"` → `#how-it-works`, `"Features"` → `#features`, `"Pricing"` → `#pricing`, `"Integrations"` → `#integrations`
- Add `"Pricing"` and remove `"Use Cases"` from the nav (use cases are still on the page, just not nav-linked)
- Keep everything else (scroll-aware transparency, mobile menu, auth-based CTAs)

**2. HeroSection.tsx — Complete Rewrite (Most Important Change)**

Current headline: "Your automations break. Ours learn."
Current subheadline: "ChainReact builds workflows that get better every time you correct them..."

**Change to:**

- **Badge:** Keep `"Free during beta"` but change to `"Free AI workflow builder — no credit card required"`
- **Headline:** `"Describe your workflow."` (line 1, slate-900) + `"Watch AI build it."` (line 2, orange-500→rose-500 gradient, same styling as current "Ours learn.")
- **Subheadline:** `"Tell ChainReact what you want in plain English. AI builds it node by node, in real time — then fills in every field automatically. No drag-and-drop required."`
- **Primary CTA:** Keep current logic (logged in → "Go to Workflows", not logged in → "Start building — free")
- **Secondary CTA:** Change from `"See how it works"` scrolling to `#how-it-works` → `"Watch 60-second demo"` scrolling to `#how-it-works` (same anchor, different label)
- **Fine print:** Change to `"No credit card. No configuration. Your first workflow in under 2 minutes."`
- **Right column (browser mockup):** Keep the browser chrome frame. Change the PlaceholderMedia label to `"Video: AI building a workflow from natural language — user types prompt, nodes appear one by one on canvas, fields auto-populate"`. Change type from `"screenshot"` to `"video"`. This is where the 60-second demo video will go.
- Keep all animations, layout (2-col grid), and styling unchanged.

**3. TrustBar — No Changes**
Keep as-is.

**4. WhyAutomationBreaks.tsx — Rewrite Copy, Same Layout**

Current headline: "Every automation tool has the same problem."

**Change to:**

- **Headline:** `"Other tools make you do all the work."`
- **Paragraph 1:** `"Zapier gives you a blank canvas and 7,000 connectors. Make gives you a visual builder with a learning curve. Both expect you to figure out the logic, configure every field, and debug every failure yourself."`
- **Paragraph 2:** `"That's fine if you're an automation expert. But most people just want to describe what they need and have it work."` (Make `"describe what they need and have it work"` bold/medium weight.)
- **Paragraph 3:** `"That's what ChainReact does."` (bold/medium weight, same as current paragraph 3 styling)

Keep: layout (`max-w-3xl mx-auto`, `py-24`, centered), typography, fade-in animation.

**5. LearningLoopSection.tsx — Repurpose as "How the AI Builder Works"**

This section currently shows the HITL learning loop (build → AI unsure → learns). Repurpose it to showcase the AI builder flow instead. The HITL story moves to a shorter section later.

- **Section title:** Change from `"How it actually works"` to `"How it works"`
- **Section ID:** Keep `id="how-it-works"`

**Change the 3 steps:**

**Step 1:**
- Title: `"Describe what you need"`
- Description: `"Type what you want in plain English. 'When I get a new Shopify order, send a Slack notification to #sales and add a row to Google Sheets.' That's it."`
- Media label: `"Screenshot: AI chat interface with user typing a workflow description"`

**Step 2:**
- Title: `"Watch AI build it — live"`
- Description: `"AI creates your workflow node by node in real time. You see each step appear on the canvas, fields auto-populate, and connections form. No manual configuration."`
- Media label: `"GIF/Video: Streaming workflow generation — nodes appearing one by one on the canvas with fields filling in automatically"`

**Step 3:**
- Title: `"Refine with conversation"`
- Description: `"Don't like something? Just say so. 'Add a filter for orders over $100' or 'Use Discord instead of Slack.' AI updates the workflow instantly without rebuilding from scratch."`
- Media label: `"Screenshot: Chat conversation showing user requesting a change and AI updating the workflow"`

Keep: ScrollSequence component, all animations, desktop sticky behavior, mobile stacked fallback.

**6. NEW SECTION: AI That Runs Inside Your Workflows — Add After Learning Loop**

Create a new component `AINodesSection.tsx` and add it to TempLanding.tsx after LearningLoopSection.

This section highlights that AI isn't just the builder — it's also a participant in running workflows.

- **Headline:** `"AI that works inside your workflows, not just builds them"`
- **Subheadline:** `"Four AI-powered nodes that make your automations intelligent."`
- **Layout:** 2x2 grid on desktop (`lg:grid-cols-2 gap-6`), stacked on mobile
- **4 cards:**

  1. **AI Router** — Icon: `GitBranch`
     - Title: `"AI Router"`
     - Description: `"Routes data down different paths based on AI understanding — not rigid if/then rules. Handles edge cases automatically."`

  2. **AI Message** — Icon: `MessageSquare`
     - Title: `"AI Message"`
     - Description: `"Generates personalized emails, Slack messages, and notifications using your data and brand voice."`

  3. **AI Agent** — Icon: `Bot`
     - Title: `"AI Agent"`
     - Description: `"An AI that uses your other workflow nodes as tools. Give it a goal and it figures out the steps."`

  4. **AI Data Processing** — Icon: `FileSearch`
     - Title: `"AI Data Processing"`
     - Description: `"Summarize, classify, extract, or translate data. Turn unstructured content into structured actions."`

- **Card styling:** Match FeatureShowcase card style (`rounded-2xl border border-slate-200/60 dark:border-slate-700/40 bg-white dark:bg-slate-900/40 p-6`)
- **Icon:** Inside a small rounded square (`w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center`), icon color `text-orange-600 dark:text-orange-400`
- **Animation:** Staggered fade-in, same as FeatureShowcase
- **Below the grid, centered:** `"Plus: Human-in-the-Loop — when AI is unsure, it pauses and asks you. Your correction becomes permanent knowledge."` (text-sm, slate-500, italic)

**7. UseCasesSection.tsx — Keep But Shorten**

Keep the current 4 tabs (Support, Sales, Content, Ops) and the exact copy, but make one change:

- Change each tab's CTA (there isn't one currently) — add a button below the solution text: `"Build this with AI →"` linking to `/auth/login` (or `/workflows` if logged in). Style: text link with arrow, `text-orange-600 hover:text-orange-700 font-medium text-sm`.

Everything else stays the same.

**8. FeatureShowcase.tsx — Replace 4 Features**

The current 4 features (AI reads docs, smart routing, analytics, templates) overlap with the new AI Nodes section. Replace them with non-AI features that round out the product story.

**New 4 features:**

1. **Feature 1 (lg:col-span-7):**
   - Title: `"Visual builder for when you want control"`
   - Description: `"Drag-and-drop 247+ nodes across 35+ integrations. Conditional logic, loops, filters, and HTTP requests. Full power when you need it."`
   - Media label: `"Screenshot: Workflow builder canvas with multiple connected nodes"`

2. **Feature 2 (lg:col-span-5):**
   - Title: `"Templates to start in 5 minutes"`
   - Description: `"40+ pre-built workflows for support, sales, content, and ops. Pick one, connect your tools, and go."`
   - Media label: `"Screenshot: Template library grid with categories"`

3. **Feature 3 (lg:col-span-5):**
   - Title: `"Know what's working"`
   - Description: `"Execution logs, success rates, error tracking. See every step your workflow took and debug issues instantly."`
   - Media label: `"Screenshot: Execution log detail view with node-by-node results"`

4. **Feature 4 (lg:col-span-7):**
   - Title: `"Teams and sharing"`
   - Description: `"Share workflows with your team, manage permissions, and collaborate across workspaces. Built for solo operators and growing teams."`
   - Media label: `"Screenshot: Workflow sharing dialog with permission levels"`

**Change section header:**
- Title: `"Everything else you need"`
- Subtitle: `"A complete platform, not just an AI trick."`

Keep: asymmetric 12-col grid layout, card styling, staggered animations.

**9. IntegrationsSection.tsx — Add "Don't See Your Tool?" Note**

Keep everything as-is but add below the marquee:

```
<p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-8">
  Don't see your tool? Our <span className="font-medium text-slate-700 dark:text-slate-300">HTTP Request node</span> connects to anything with an API.
</p>
```

**10. NEW SECTION: Pricing Preview — Add After Integrations**

Create a new component `PricingPreview.tsx` and add it to TempLanding.tsx after IntegrationsSection.

- **Section ID:** `id="pricing"`
- **Headline:** `"Simple pricing. No surprises."`
- **Subheadline:** `"Build unlimited workflows with AI. Free forever. Pay only when you run them."`

- **3 plan cards** in a row (`lg:grid-cols-3 gap-6`):

  **Free:**
  - Price: `"$0"` + `"/month"`
  - Features: `"100 task executions/month"`, `"Unlimited AI workflow building"`, `"35+ integrations"`, `"7-day execution history"`
  - CTA: `"Get Started"` (outline button)

  **Pro** (highlighted with orange border):
  - Badge: `"Most Popular"` (small orange pill)
  - Price: `"$19"` + `"/month"`
  - Features: `"750 task executions/month"`, `"Unlimited AI workflow building"`, `"AI Agent nodes"`, `"30-day history"`, `"Email support"`
  - CTA: `"Start Free Trial"` (filled orange button)

  **Team:**
  - Price: `"$49"` + `"/month"`
  - Features: `"2,000 task executions/month"`, `"Unlimited AI workflow building"`, `"5 team members"`, `"Shared workspaces"`, `"90-day history"`, `"Priority support"`
  - CTA: `"Start Free Trial"` (outline button)

- **Below cards:** `"All plans include unlimited AI workflow creation. "` + link `"See full pricing →"` to `/pricing` if it exists, or `#` as placeholder.
- **Card styling:** Match the app's design tokens. Highlighted card gets `border-orange-500` and `ring-1 ring-orange-500/20`.
- **Animation:** Staggered fade-in on scroll.

**11. StatsSection.tsx — Rewrite With Stronger Claims**

Current: single paragraph about 20+ tools and 100ms response time.

**Change to 4-stat grid layout** (`grid-cols-2 lg:grid-cols-4 gap-8`):

| Stat | Label |
|---|---|
| `"247+"` | `"Workflow nodes"` |
| `"35+"` | `"Deep integrations"` |
| `"< 100ms"` | `"Avg response time"` |
| `"60 sec"` | `"AI builds a workflow"` |

- Each stat: large number (`text-4xl md:text-5xl font-bold text-slate-900 dark:text-white`), label below (`text-sm text-slate-500 dark:text-slate-400`)
- Keep the fine print below: `"Currently in free beta. No credit card, no contracts, no sales calls."`
- Layout: `max-w-4xl mx-auto text-center`
- Remove the paragraph format.

**12. FinalCTA.tsx — Rewrite To Be Specific**

Current: "Try it. It's free."

**Change to:**

- **Headline:** `"Your first AI-built workflow is 60 seconds away"`
- **Subheadline:** `"Describe what you want. Watch AI build it. Test it. Activate it. All free."`
- **Button:** Keep current auth-aware logic, same styling
- **Fine print:** `"No credit card. Free during beta. Cancel anytime."`

**13. TempFooter.tsx — No Changes**
Keep as-is.

**14. TempLanding.tsx — Update Section Order**

Update the component render order to:

```tsx
<TempHeader />
<HeroSection />
<TrustBar />
<WhyAutomationBreaks />
<LearningLoopSection />      {/* Now "How the AI Builder Works" */}
<AINodesSection />            {/* NEW */}
<UseCasesSection />
<FeatureShowcase />           {/* Updated features */}
<IntegrationsSection />
<PricingPreview />            {/* NEW */}
<StatsSection />              {/* Now 4-stat grid */}
<FinalCTA />
<TempFooter />
```

#### NEW FILES TO CREATE
1. `/components/temp-landing/AINodesSection.tsx`
2. `/components/temp-landing/PricingPreview.tsx`

#### FILES TO MODIFY
1. `/components/temp-landing/TempLanding.tsx` — add new sections to render order
2. `/components/temp-landing/TempHeader.tsx` — update nav items
3. `/components/temp-landing/HeroSection.tsx` — full copy rewrite
4. `/components/temp-landing/WhyAutomationBreaks.tsx` — copy rewrite
5. `/components/temp-landing/LearningLoopSection.tsx` — change 3 steps to AI builder flow
6. `/components/temp-landing/FeatureShowcase.tsx` — replace 4 features
7. `/components/temp-landing/StatsSection.tsx` — change to 4-stat grid
8. `/components/temp-landing/FinalCTA.tsx` — rewrite headline/copy
9. `/components/temp-landing/IntegrationsSection.tsx` — add "don't see your tool?" note
10. `/components/temp-landing/UseCasesSection.tsx` — add CTA per tab

#### DO NOT CHANGE
- `/components/temp-landing/ScrollSequence.tsx` — keep the scroll-triggered animation system
- `/components/temp-landing/PlaceholderMedia.tsx` — keep the placeholder system
- `/components/temp-landing/TrustBar.tsx` — keep as-is
- `/components/temp-landing/TempFooter.tsx` — keep as-is
- Any files outside of `/app/temp/` and `/components/temp-landing/`

#### DESIGN SYSTEM (Keep Consistent)
- Headline font: `font-[var(--font-space-grotesk)]`
- Colors: slate-900 text, orange-500 accent, rose-500 gradient, slate-200 borders
- Animations: Framer Motion `whileInView` fade-ins, ScrollSequence for the builder steps
- Spacing: `py-24` per section, `max-w-7xl mx-auto`, `px-4 sm:px-6 lg:px-8`
- Cards: `rounded-2xl border border-slate-200/60 dark:border-slate-700/40 bg-white dark:bg-slate-900/40`

#### VERIFICATION
1. `npm run dev` → navigate to `/temp` and verify all 13 sections render correctly
2. Test light and dark mode
3. Test responsive: mobile (375px), tablet (768px), desktop (1280px+)
4. Verify ScrollSequence still works for the AI builder steps on desktop
5. Verify ScrollSequence falls back to stacked cards on mobile
6. Verify nav smooth-scrolling works for all 4 nav items including new Pricing anchor
7. Verify auth-aware CTAs (logged in vs not)
8. `npm run build` to confirm no build errors
9. Current homepage at `/` is completely untouched
