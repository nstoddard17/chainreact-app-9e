# ChainReact — Master Strategy & Competitive Positioning

**Last Updated:** 2026-04-03
**Status:** Living Document — Update as strategy evolves

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [What ChainReact Is](#2-what-chainreact-is)
3. [Competitive Landscape](#3-competitive-landscape)
4. [Our Unique Differentiators](#4-our-unique-differentiators)
5. [Positioning & Messaging](#5-positioning--messaging)
6. [Pricing Strategy](#6-pricing-strategy)
7. [Feature Roadmap — What Seals The Deal](#7-feature-roadmap--what-seals-the-deal)
8. [Landing Page & Marketing Strategy](#8-landing-page--marketing-strategy)
9. [Target Audience](#9-target-audience)
10. [Content & SEO Strategy](#10-content--seo-strategy)
11. [Growth Playbook](#11-growth-playbook)
12. [Technical Moats](#12-technical-moats)
13. [Pending Pages & Marketing Infrastructure](#13-pending-pages--marketing-infrastructure)

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

## 7. Feature Roadmap — What Seals The Deal

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

## 8. Landing Page & Marketing Strategy

### Landing Page Design Research (Key Findings)

Based on analysis of Zapier, Make.com, n8n, Pipedream, Relay, Tray, Workato, Vercel, Linear, Notion, and Stripe landing pages:

#### Must-Have (Table Stakes)
- Dual CTA hero (primary "Get started free" + secondary "See demo")
- Social proof logo strip immediately below hero
- Sticky navigation with CTA
- Mobile-responsive
- Dark/light mode support

#### High Impact (Our Differentiators)
- **Animated workflow visualization** in hero (showing AI building a workflow)
- **Tabbed feature showcase** to demonstrate breadth without scrolling
- **Specific metrics** as social proof (not just logos)
- **Three-step "how it works"** section

### Landing Page Redesign Plan

The landing page redesign is underway with the following positioning:

**Hero:** "Stop fixing automations. Train them instead." (or updated to AI-building focus)
**Subheadline:** "Build workflows that improve over time. When AI gets it wrong, correct it once — it learns forever."

**Section Flow:**
1. Header (scroll-aware)
2. Hero (headline + product screenshot/video + CTAs)
3. Trust Bar (integration logos)
4. Problem Framing ("Sound familiar?")
5. The Learning Loop (Build → Teach → Improve — scroll sequence)
6. Use Cases (tabbed: Support, Sales, Marketing, Operations)
7. Feature Showcase (AI Router, Analytics, Templates)
8. Integrations (20+ deep integrations)
9. Stats (capability messaging)
10. Final CTA (gradient close)
11. Footer (newsletter + links)

**Key Design Decisions:**
- Light-first (approachable, broad audience)
- Orange accent color (conversion-focused)
- Scroll-triggered transitions (not scroll-pinning)
- Real product screenshots, not fake UI replicas
- All work under `/app/temp/` until finalized

#### Updated Hero Recommendation (Post-Strategy)

Consider updating the hero to lead with the AI builder story:

**Primary:** "Describe your workflow. Watch AI build it."
**Sub:** "ChainReact's AI builder creates complete workflows from plain English — node by node, in real time. Free for everyone."
**CTA:** "Try the AI Builder" + "Watch Demo"
**Visual:** Embedded demo video or animated visualization of the streaming AI build experience

---

## 9. Target Audience

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

## 10. Content & SEO Strategy

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

## 11. Growth Playbook

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

## 12. Technical Moats

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

## 13. Pending Pages & Marketing Infrastructure

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
