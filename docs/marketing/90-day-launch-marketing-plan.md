# ChainReact: 90-Day Launch Marketing Plan

Status: FINAL v1
Date: 2026-07-08
Owner: Marcus
Prepared by: Claude (growth strategy + market research; competitor pricing verified against official pricing pages 2026-07-08)

---

## Executive Summary

Go, with two conditions. The product is live, the market is provably hungry (n8n went from a $2.5B valuation in Oct 2025 to $5.2B in May 2026 on the back of exactly the demand ChainReact targets: people fleeing Zapier's pricing and complexity), and there is an open positioning slot: AI-builds-it automation at a $0-19 entry price, where the AI-native competitors start at $37-50 and the incumbents still make you assemble workflows by hand. The two conditions: (1) the four launch Blockers must ship in the 2-4 week runway, above all a public pricing page and an anonymously browsable template gallery, because today the core promise is invisible to a visitor who has not signed up; (2) the "under 2 minutes" claim stays off the homepage until median time-to-first-run actually supports it, because the product's realistic golden path today is 5-10 minutes and overpromising here converts launch attention into churn and bad reviews.

The strategy is activation-first, loops-over-launches. Launch day matters as a forcing function and a starting gun, but the research is unambiguous that it is not the growth engine: ~10% of Product Hunt launches get Featured, the median Show HN gets 2 points, and a founder who hit #1 on PH converted exactly one paying customer. The engines that compound in this category are (a) a public template library with per-template landing pages (n8n's 10,444-template gallery is the proof), (b) a relentless faceless demo-clip cadence riding the measured automation-content wave (one n8n tutorial channel grew 230k to 842k subscribers in 13 months), and (c) SEO/GEO groundwork planted now that pays in months 3-9, since 51% of B2B software buyers now start research in an AI chatbot and those answers cite review sites, Reddit, and honest comparison listicles.

Focus: three ICPs only. Indie founders/micro-SaaS (beachhead, they live on the launch channels), small agencies/ops consultants (revenue and the future partner multiplier), and Shopify micro-brands (urgent, template-shaped pain). Everyone else, including recruiters, real estate, and local services, is explicitly LATER because their stacks are not in the current 29 integrations. Monetization at launch: free plan generous enough to run a real automation forever, Pro at $19 positioned directly against Zapier's $19.99/750 tasks with ~6.6x the allowance, a numbered founding-member offer (first 100 accounts, 40% off for life) instead of any lifetime deal, and three pricing-page promises aimed at the category's loudest complaint: only actions count, hard caps by default, no surprise bills.

Budget: $0 in ads for at least 45 days (one exception: X Premium at ~$8-16/mo). One afternoon of startup-credit applications (Cloudflare $10k, Microsoft $5k path, Google $2k, AWS $1k, Supabase ~6 months free) should erase most of year-one infrastructure cost. Paid spend unlocks only when the funnel converts measurably (activation ≥25-30%, free-to-paid ≥2%), and then starts with niche newsletters and capped Reddit ads, never broad search or social prospecting.

90-day targets (targets, not predictions): 2,500-6,000 cumulative signups, 500-1,500 activated users (activated = a workflow with 3+ successful runs on 2+ days within 14 days of signup), 25-75 paying customers, 2-3 channels with proven cost-per-activated-user, and the template/content loops built and indexing. The metric reported everywhere is weekly activated accounts. Signups are tracked but never celebrated.

---

## 0. Grounding: Product Facts, Assumptions, Constraints

### Verified product facts (from the ChainReactV2 codebase, 2026-07-07)

| Fact | Value |
|---|---|
| Production | Live at https://chainreact.app (v2-main), not yet announced |
| Integrations | 29 external providers + native (schedule, manual) |
| Actions / triggers | ~309 actions, ~72 triggers |
| Official templates | 96 seeded across 7 categories, working "use template" flow |
| AI builder | React Agent visible at launch; free deterministic workflow check; LLM guidance metered by AI credits (Free 20 / Pro 500 / Team 2,000 / Business 10,000) |
| Billing | Stripe checkout, portal, and webhooks implemented; plan tiers free / pro / team / business / enterprise; per-plan task limits |
| Deepest integrations | Slack (31 actions), HubSpot (26), Monday (24), Notion (16), Stripe (16), Gmail (15), Mailchimp (14), Google Sheets (12), Airtable (11), Shopify (11), Dropbox (11), Outlook (11) |

Integration list (for ICP coverage decisions): Airtable, Asana, Calendly, Discord, Dropbox, Facebook, GitHub, Gmail, Google Analytics, Google Calendar, Google Docs, Google Drive, Google Sheets, HubSpot, Mailchimp, Microsoft Excel, OneDrive, OneNote, Outlook, Outlook Calendar, Microsoft Teams, Monday, Notion, QuickBooks, Shopify, Slack, Stripe, Trello, Typeform.

### Known product gaps that constrain marketing (verified)

- No public pricing page.
- Template marketplace requires login (no anonymous browsing, so templates currently generate zero SEO or shareability value).
- No sitemap.xml, robots.txt, OpenGraph metadata, or llms.txt.
- No onboarding email sequence or in-app activation checklist.
- No referral mechanics, no public template share links, no usage dashboard UI.
- No blog or content surface.

These gaps are treated as launch workstream items in Section 13, not as blockers to planning.

### Stated assumptions

1. Team of 1-2 people; founder time is the scarce resource. Roughly 15-25 hours/week available for marketing.
2. Tool budget ~$0-100/month. No ad budget at launch.
3. US-based entity (matters for credits, grants, competitions).
4. Public announcement in 2-4 weeks; the remaining product blockers in Section 13 close within that window.
5. Exact plan prices are not yet public; Section 10 recommends them.
6. Content format is screen-recorded demos and written posts. No on-camera founder content.
7. "Day 1" throughout this plan means announcement day, not deploy day (the app is already deployed).

### Assumptions in the brief that deserve pushback

- "Fastest realistic path to high user volume": workflow automation is a considered adoption, not an impulse install. Launch spikes produce signups, not activated users. The realistic high-volume path is compounding loops (templates, SEO, share moments) that take 60-180 days to spin up, seeded by launch-window bursts. This plan optimizes for activated users and loop construction, and treats raw signup volume as a vanity metric.
- "Under 2 minutes": the current realistic template path is estimated at 5-10 minutes (signup, email confirm, OAuth connect, field config, activate). The promise is marketable only if the product makes it true for at least one golden path. Section 9 defines time-to-first-run as a core metric and Section 13 includes the work to shorten it. Do not put "2 minutes" in the headline until a median new user actually hits ~2-3 minutes on the golden path, or the promise becomes the top churn complaint.
- 29 integrations is a real constraint, not a detail. Zapier has thousands. Positioning must never compete on catalog breadth, and ICP selection must be restricted to segments whose entire stack is covered by the 29 (Section 2 does exactly this).

---

## 1. Market Landscape

### The market in four sentences

Workflow automation is roughly a $24B market in 2025, projected to reach ~$41B by 2031 at a 9.4% CAGR ([Mordor Intelligence](https://www.mordorintelligence.com/industry-reports/workflow-automation-market)). The 2025-26 story is the AI-agent wave: Make shipped AI Agents (Apr 2025) and Grid (Jun 2025), Zapier sells Agents and Chatbots as separate SKUs, Gumloop raised a $50M Series B led by Benchmark (Mar 2026), and OpenAI launched AgentKit (Oct 2025) then announced it is winding down the visual Agent Builder with full shutdown Nov 30, 2026, proof that even giant platforms churn in this space. The other story is n8n's breakout: $2.5B valuation in Oct 2025, doubled to $5.2B in May 2026 after a EUR 60M+ SAP investment, with Sacra estimating $40M ARR (Jul 2025) and 10,444 community templates ([n8n](https://blog.n8n.io/series-c/), [Bloomberg via PR Newswire](https://www.prnewswire.co.uk/news-releases/n8n-valuation-doubles-to-5-2bn-as-sap-makes-strategic-investment-and-plans-to-embed-the-ai-platform-into-joule-studio-302767227.html), [Sacra](https://sacra.com/c/n8n/)). n8n's growth is the clearest evidence that demand to escape Zapier's pricing and complexity is real and large.

### Competitor table (pricing fetched from official pricing pages 2026-07-08 unless noted)

| Tool | Positioning | Entry paid price | Free plan | What they do well | Weaknesses / user complaints |
|---|---|---|---|---|---|
| [Zapier](https://zapier.com/pricing) | Default choice, 7,000+ apps | Pro from $19.99/mo (annual; $29.99 monthly), 750 tasks | 100 tasks/mo, 2-step Zaps only, 15-min polling | Catalog breadth; brand; dominates AI-answer citations (~21% of SaaS prompts per [Semrush](https://martech.org/saas-in-ai-search/)) | Cost at volume is the #1 documented complaint; every step consumes a task; overages at 1.25x; Trustpilot ~1.4/5 with $400-1,200 surprise-bill reports ([StartupOwl](https://startupowl.com/reviews/zapier)); example math: 8-step workflow x 100 leads/day = ~24k tasks = ~$847/mo ([TinyCommand](https://tinycommand.com/blogs/zapier-pricing-explained)) |
| [Make](https://www.make.com/en/pricing) | Visual builder, cheap ops | Core $12/mo (10k credits) | 1,000 credits/mo, 2 active scenarios, 15-min interval | Price per operation; visual canvas power | Learning curve; Aug 2025 operations-to-credits switch angered small customers ("a real jab at us smaller, non-enterprise creators", [Make community](https://community.make.com/t/credit-based-billing-a-jab-to-non-enterprise-creators/90182)); credit costs now vary per action |
| [n8n](https://n8n.io/pricing) | Fair-code, technical, AI-native | Starter EUR 20/mo, 2.5k executions | Self-hosted community edition free/unlimited | Per-execution pricing (steps free); 10,444 community templates; massive momentum | Steep learning curve for non-technical users (top G2/Capterra complaint); debugging pain; late-2025 self-hosted enterprise price hikes caused backlash ([StartupOwl](https://startupowl.com/reviews/n8n)) |
| [IFTTT](https://ifttt.com/plans) | Consumer/smart-home | Pro $2.99/mo | 2 applets | Simplicity, consumer brand | Not a business tool; shallow integrations |
| [Bardeen](https://www.bardeen.ai) | PIVOTED May 2025: now a GTM/lead-gen tool ("Find and reach leads no one else can") | n/a | n/a | n/a | Exited general automation entirely; its old "easy AI automation" audience is unserved ([Voiceflow analysis](https://www.voiceflow.com/blog/bardeen-ai)) |
| [Relay.app](https://www.relay.app/pricing) | Human-in-the-loop automation | Pro $19/mo, 750 steps | 200 steps + 500 AI credits/mo | Approvals/HITL UX; generous AI credits | Smaller catalog; step metering |
| [Pipedream](https://pipedream.com/docs/pricing) | Developer-first, code-level | Basic $29/mo (secondary source; official page JS-blocked) | 100 credits/day | Depth for developers | Not for non-technical users |
| [Gumloop](https://www.gumloop.com/pricing) | AI-native workflows | Pro $37/mo, 20k+ credits | 5k credits, 1 active trigger | AI-first UX; Benchmark-backed momentum | Priced above mainstream SMB entry; per-action credit rates not disclosed |
| [Lindy](https://www.lindy.ai/pricing) | AI employees/agents | Plus $49.99/mo | None (7-day trial only) | Agent breadth, slick demos | Killed its free tier; moved upmarket; credit counts not advertised |
| Relevance AI | AI workforce, enterprise-leaning | Pro ~$19/mo (secondary; official page shows only enterprise) | 200 actions/mo | Agent teams for ops | Dual-meter (actions + vendor credits) complexity after Sept 2025 restructure |
| [Power Automate](https://www.microsoft.com/en-us/power-platform/products/power-automate/pricing) | Microsoft-shop default | $15/user/mo | Limited with M365 | Bundling, RPA, enterprise reach | Per-user pricing; Microsoft-stack UX; licensing complexity |
| [Airtable Automations](https://support.airtable.com/docs/airtable-plans) | Feature of Airtable | Team $20/user/mo, 25k runs | 100 runs/mo | Native to the base people already use | Only automates around Airtable; per-seat cost |

### Momentum read (directional)

- Gaining: n8n (fastest in the category), Gumloop, Lindy (upmarket), Relay.app.
- Steady but strained: Make (credit-billing backlash), Zapier (revenue giant, loud pricing dissatisfaction), Power Automate and Airtable (captive ecosystems).
- Losing or exited: IFTTT (consumer niche), Bardeen (left the category), OpenAI's visual Agent Builder (shutting down Nov 2026).

### Where ChainReact positions differently

1. Build-speed wedge: incumbents added AI copilots, but their primary UX is still manual step assembly. ChainReact's primary UX is describe-then-review. The AI-native competitors that share this UX (Gumloop $37, Lindy $49.99, no free tier) have priced themselves out of the mainstream SMB entry point. The $0-19 AI-native slot is comparatively open.
2. Reliability wedge vs agents: the 2025-26 agent products improvise at runtime. ChainReact's AI builds a deterministic, inspectable workflow, checks it before it runs, and helps repair it. "AI builds it; a workflow you can trust runs it" is a differentiated and honest claim.
3. Simplicity wedge vs Make/n8n: n8n's #1 complaint is its learning curve. ChainReact targets exactly the users n8n's growth is pulling in but then losing.
4. Pricing-trust wedge vs Zapier/Make: the category's loudest pain is surprise bills and metering anxiety. ChainReact can make "hard caps by default, no surprise overage, triggers and logic free" a page-level promise (Section 10).
5. Focused-stack honesty: 29 deep integrations, never marketed as breadth. The ICP gate in Section 2 keeps us out of segments where the catalog loses.

Weaknesses to manage: catalog size (never compete on it), no self-hosting (do not court n8n's core audience), zero brand trust surface at launch (fix with G2 reviews, transparent metrics posts, honest comparison pages).

---

## 2. Ideal Customer Profiles (Ruthless Cut: 3 Now, Everyone Else Later)

Method: segments are scored on five axes (workflow pain intensity, willingness to pay, reachability at $0, likelihood to share/refer) plus a hard gate the brief did not ask for but that decides everything at 29 integrations: stack coverage. If a segment's daily tools are not in the current catalog, they cannot activate no matter how good the marketing is, so they are LATER by definition.

Research support for the top-3 choice: the launch channels that work at $0 (PH, HN, IH, X, r/SaaS) are populated by ICP-1 almost by definition; agencies/consultants are the segment automation platforms monetize through partner programs (Zapier Solution Partners, Make Partners, n8n's Expert pilot all exist because agencies multiply usage); and the r/n8n template wave plus the 842k-subscriber automation-tutorial channels show where organic automation demand currently concentrates (Section 5 citations).

### ICP-1 (beachhead): Solo founders, indie makers, and micro-SaaS teams (1-5 people)

- Stack: Stripe, Gmail, Slack/Discord, Google Sheets, Notion, GitHub, Calendly, Typeform. 100% covered.
- Pain: everything is manual (payment notifications, lead follow-up, user onboarding, support triage, weekly metrics); no time to learn Make/n8n.
- Why now: they are literally the audience on the launch channels we can reach for $0 (Product Hunt, Hacker News, X, Indie Hackers, r/SaaS, r/nocode). Launch content and ICP-1 acquisition are the same work.
- Willingness to pay: low-to-mid ($10-30/mo), but they are loud: they share, screenshot, and write about tools.
- Role in strategy: activation volume, testimonials, template contributions, social proof.

### ICP-2 (revenue): Small digital agencies and solo ops/automation consultants

- Stack: HubSpot, Slack, Gmail/Outlook, Google Sheets/Docs/Drive, Mailchimp, Calendly, Typeform, Monday/Asana/Trello, Stripe/QuickBooks. Covered.
- Pain: repeatable client-ops work (lead intake, reporting, client onboarding, invoice chasing) done manually across many clients.
- Why now: highest willingness to pay (automation is billable), and each agency is a multiplier (one convert implements ChainReact for 5-50 clients). Reachable free via LinkedIn, r/agency, r/marketing, ops communities, and direct outreach.
- Role in strategy: paid conversion, case studies, and the future agency-partner loop (Section 6).

### ICP-3 (urgency): E-commerce micro-brands (Shopify-first, 1-10 people)

- Stack: Shopify, Stripe, Gmail, Mailchimp, Google Sheets, Slack, Facebook. Covered.
- Pain: order ops (failed payments, fulfillment updates, review requests, low-stock alerts, daily sales digests) with immediate revenue consequences.
- Why now: pain is urgent and constant; the segment is concentrated in reachable places (r/shopify, ecom Discords/FB groups); templates map 1:1 to their needs.
- Role in strategy: high-intent template traffic and fast free-to-paid conversion.

### Later, not now (with the trigger that promotes them)

| Segment | Why later | Promote when |
|---|---|---|
| Ops managers at 20-200 person SMBs | Longer buying cycle; expects roles/SSO/audit and references | 3+ agency/SMB case studies exist and team features are proven |
| Sales teams | Salesforce, Outreach, Apollo not integrated (only HubSpot) | Salesforce integration ships |
| Recruiters/staffing | No ATS integrations (Greenhouse, Lever, Ashby) | An ATS integration ships |
| Real estate | No FollowUpBoss/kvCORE, no SMS provider (no Twilio) | Real-estate CRM or SMS ships |
| Local service businesses | No Jobber/Housecall Pro/ServiceTitan, no SMS | Field-service tool or Twilio ships |
| Creators/influencers | No YouTube/Instagram/TikTok/Buffer publishing (Facebook only) | Social publishing integrations ship |
| Enterprise | Everything about it (procurement, security review, SLAs) | Not in the first 12 months |

The discipline this buys: every template, post, landing page, and outreach message in the first 90 days targets ICP-1, 2, or 3. Anything aimed elsewhere is cut.

---

## 3. Positioning and Messaging

Validated against the Section 1 findings: the "describe it and it's built" UX at a $0-19 entry price is genuinely open territory (Gumloop starts at $37, Lindy at $49.99 with no free tier, Bardeen left the category), and the two loudest complaint clusters in the market are Zapier/Make metering anxiety and n8n's learning curve. The messaging below is aimed at exactly those seams.

### Positioning statement (internal)

For small teams and builders who know what they want automated but not how to wire it, ChainReact is the workflow automation platform whose AI agent builds, configures, and checks the automation for you across the ~30 tools you already use. Unlike Zapier and Make, you do not assemble workflows step-by-step from scratch; unlike n8n, there is nothing to host, script, or debug.

### One-line positioning (external)

Describe the workflow you need. ChainReact's AI builds it across your apps and gets it running in minutes.

### Homepage headline options

1. "Type what you want automated. ChainReact builds it." (subhead: AI-built workflows across Gmail, Slack, Stripe, Shopify, Notion and 25 more. Free to start.)
2. "From 'I should automate that' to done, in minutes."
3. "Automation that builds itself."
4. "Stop doing your apps' work for them."
5. "The AI workflow builder for the tools you already use."

Recommendation: ship #1. It states the differentiator (AI builds it) as an instruction the visitor can immediately test. Only switch to a time-based claim ("in under 2 minutes") once median time-to-first-run supports it.

### Social bio / tagline options

- "AI workflow automation. Describe it; it's live across Gmail, Slack, Stripe, Notion + 25 more. Free plan."
- "Turn 'I should automate that' into a running workflow in minutes."
- "Your apps, finally working together. AI-built automations, ~100 free templates."

### "Why ChainReact instead of Zapier / Make / n8n?"

The honest answer, usable verbatim in Reddit comments and FAQs:

"Zapier is the biggest catalog and the safest default; if you need an obscure app, use Zapier. ChainReact is for the 30 mainstream tools most small teams actually run on. The difference is how you build: you describe the automation and the AI constructs and configures it, checks it for problems, and helps you fix it when it breaks, instead of you assembling trigger-action steps by hand. Make is powerful but has a real learning curve. n8n is excellent if you're technical and want to self-host. If you're not technical and your stack is mainstream, ChainReact gets you to a running workflow faster, with pricing that doesn't punish you for succeeding."

The pricing contrast, concretely (usable in comparison pages): Zapier's free plan is 100 tasks/month with two-step Zaps only, and its Pro plan is $19.99/month for 750 tasks with every step consuming a task; ChainReact's recommended free plan runs real multi-step workflows at 5x the allowance, and Pro at $19 includes ~6.6x the tasks with triggers and logic free (Section 10). Against Make: no credit conversions to decode. Against n8n cloud (EUR 20/2,500 executions): comparable value without self-hosting or expressions.

### Messaging by audience

Non-technical users (ICP-1/3 core):
- "You don't need to learn automation. Tell ChainReact what should happen ('when someone pays me on Stripe, send a thank-you email and log it in Sheets') and it builds the workflow. You review it, click activate, done."
- Never say: webhook, JSON, API, payload, node graph.

Power users:
- "~309 actions and ~72 triggers across 29 apps, multi-step workflows, an AI agent that drafts the flow and a deterministic checker that catches broken configs before they run. Build by hand when you want control; let the agent do the boring wiring when you don't."

Small teams (ICP-2 + team-plan buyers):
- "Shared workspaces, team plans, and workflows your whole team can see and fix. Automations shouldn't live in one person's account and die when they leave."

---

## 4. Launch Strategy: Week 0 Through Day 90

Reality check from the research before the plan: launch-day channels are smaller than folklore says. Only ~10% of Product Hunt launches get Featured now; Featured launches typically see 1,000-5,000 visitors and 10-150 signups, non-featured 100-500 visitors and 1-15 signups ([shno.co aggregation](https://www.shno.co/marketing-statistics/product-hunt-launch-statistics), directional blog data). The median Show HN gets 2 points and 61.7% get zero comments ([188k-post dataset](https://danfking.github.io/blog/2026/04/23/show-hn-by-the-numbers/), [Sturdy Statistics](https://blog.sturdystatistics.com/posts/show_hn/)). A founder hit #1 on PH with 612 upvotes and got exactly 1 paying customer ([marketingideas.com](https://www.marketingideas.com/p/how-to-successfully-launch-on-product)). Launch day is a starting gun and a deadline-forcing function, not the growth plan. The growth plan is Sections 5-6.

### Phase structure and goals (activated users, not signups)

| Phase | Window | Primary goal | Secondary goal |
|---|---|---|---|
| Week 0 (pre-launch) | Now to Day 0 (2-4 wks) | Close Blocker assets (S13); 20-30 beta users producing testimonials | Warm up channels; credit applications in flight |
| Day 1 | Announcement day | Coordinated multi-channel launch; founder present all day | 400-1,500 visitors, 30-120 signups, 10-40 activated within 72h (composite of PH + X + IH + personal network; wide range because Featured status is outside our control) |
| Days 1-7 | Launch week | Convert launch attention into activation; fix funnel leaks live | First 10 user conversations; first testimonials |
| Days 8-30 | Loop construction | Template gallery public + SEO foundation live; content cadence running | First paying customers (founding-member offer) |
| Days 31-60 | Experiment triage | Kill losing channels, double winning ones; agency outreach motion | Comparison pages + integration pages indexing |
| Days 61-90 | Compounding | Working loops (template SEO, demo-clip social, community templates) | Decide on first paid spend based on Section 8 gates |

### Week 0 (pre-launch, the 2-4 week runway)

Product/asset work (details and effort in Section 13):
1. Close the four Blockers: pricing page, public template gallery, analytics instrumentation, launch homepage sections + demo video.
2. Ship High-leverage quick wins: sitemap/robots/OG metadata, onboarding email sequence, in-app first-run checklist.

Marketing groundwork:
1. Create/claim accounts: X (buy Premium, ~$8-16/mo; free-account posts are demonstrably throttled), LinkedIn (personal, not company page; company pages get materially less reach per the 1.8M-post [Algorithm InSights 2025 dataset](https://www.linkedin.com/posts/richardvanderblom_chapter-1-algorithm-insights-report-2025-activity-7322514599126130688-Q895)), YouTube channel, TikTok, Product Hunt maker profile, Indie Hackers, Reddit (age the account NOW; comment helpfully for 2-4 weeks in target subreddits before ever posting about ChainReact; most subs enforce karma minimums and the 90/10 rule).
1b. Put up the Product Hunt "Coming Soon" teaser page (free, official); aim for 100+ notification subscribers before launch. PH mods state teaser traction does not influence Featured selection, but it does deliver day-one visitors ([PH help](https://help.producthunt.com/en/articles/6684724)).
1c. Create the G2 profile and seed the first 5-10 reviews from beta users. This is a GEO play, not vanity: G2 is the 4th most-cited source by ChatGPT for SaaS queries ([Semrush AI Visibility Index](https://martech.org/saas-in-ai-search/)), and 51% of B2B software buyers now start research with an AI chatbot ([G2 Answer Economy survey, Mar 2026](https://www.prnewswire.com/news-releases/new-g2-research-half-of-b2b-software-buyers-now-start-their-research-with-ai-chatbots-302742807.html)).
2. Build-in-public warmup: 3-4 posts/week on X and LinkedIn documenting the road to launch (real numbers, real screenshots, real problems). Goal is not audience size; it is having a non-empty account and 50-200 genuinely earned followers by Day 1.
3. Recruit 20-30 beta users by hand from ICP-1 communities and personal network. Watch 5+ of them onboard over screenshare or session replay. Fix the top 3 activation blockers they hit. Collect 5-10 quotable testimonials with permission. (This is the temporary concierge tactic: it is for learning and testimonials, not the growth motion.)
4. Line up Day-1 supporters: a private list (email/DM group) of 30-60 people who explicitly agreed to try it and comment on launch day. No vote-begging; ask for honest comments and feedback in the PH thread.
5. Prepare all launch assets (Section 13 list): PH gallery, demo video, 6-10 demo clips banked, launch posts drafted for each channel in that channel's native voice.
6. Submit startup-credit applications (Section 7) in parallel; they cost hours and pay for the year's infrastructure.

### Day 1 (announcement day)

Run order (US timing):
1. 12:01 AM PT: Product Hunt launch goes live. Launch on a weekend or Monday if maximizing Featured odds matters more than weekday traffic volume (weekends are least competitive; Featured status drives most of the outcome). First comment = personal maker story + one specific ask for feedback. Founder in the comments every 30-60 min all day.
2. Morning: X launch thread (the story + 60-second demo clip; put the link in the first reply, not the post body, because body links cost roughly 30-50% of reach per third-party algorithm analyses), LinkedIn launch post (personal account; document/PDF-carousel posts are currently the top-engagement format), Indie Hackers launch post with real pre-launch numbers (IH converts founder-audience products far better than PH per directional data).
3. Personal network: 30-50 individual emails/DMs (not BCC) with a one-line ask: try it, tell me where it broke.
4. All day: reply to every single comment, DM, and email within minutes. Day 1's job is conversation volume, not broadcast.
5. Evening: post Day-1 numbers transparently on X/IH ("here's what launch day actually did"), which itself earns a second wave.
6. Show HN goes on a DIFFERENT day (see Days 1-7): HN rules require something people can try without signup walls, and the measured best slot is Monday 00:00 UTC (Sunday 7pm ET), which gives a 10.8% chance of 50+ points vs 2.6% at the worst slot ([Show HN dataset](https://danfking.github.io/blog/2026/04/23/show-hn-by-the-numbers/)). Post the public template gallery as the playable artifact, text-first, zero marketing tone. Splitting PH and HN days also gives two spikes instead of one.

What Day 1 is NOT: Reddit promo day (unless a subreddit explicitly allows launch posts and the account has karma/history), a paid-ads day, or a press-release day.

### Days 1-7

- Show HN on the first Sunday evening ET after launch (see Day 1 note 6): template gallery as the artifact, founder answering every comment for 6+ hours. Expectation-set: the median Show HN gets 2 points; treat anything above 20 as a win and zero traction as normal.
- Personal onboarding offer to every signup (a 15-min setup call or async Loom): temporary, for learning and testimonials.
- Daily: 1 demo clip posted (X + Shorts + TikTok + LinkedIn), every comment answered.
- Instrumented funnel reviewed daily; fix the single biggest leak each day (Section 9 diagnosis playbook).
- Directory submissions batch (Section 5, CH-12).
- Founding-member offer live from Day 1 (Section 10): first 100 paid accounts get lifetime 40-50% off, visibly numbered.
- End of week: publish "Launch week: the real numbers" post (IH + X + LinkedIn). Transparency content reliably outperforms promotion for a cold-start account.

### Days 8-30

- Content cadence locks in (Section 11 calendar): 4-5 demo clips/week, 2 written posts/week, 1 SEO page/week minimum.
- Template gallery SEO foundation complete: every template a public indexable page with OG card [Section 13].
- First 3 comparison pages live (vs Zapier, vs Make, vs n8n). Note: public keyword-volume data for "zapier alternatives" is not verifiable without paid tools; the observable signal is that the SERP is saturated with 2025-26 vendor listicles (Lindy, Gumloop, Celigo all publish them), which means head terms are slow to win but the format is table-stakes sales collateral, and comparison listicles are what AI answers cite (32.5% of LLM citations are listicles; content with tables is cited ~2.5x more, [Search Engine Land](https://searchengineland.com/ai-citations-favor-listicles-articles-product-pages-study-472364), [Wix AI Search Lab](https://www.wix.com/studio/ai-search-lab/research/content-types-most-cited-by-llms)).
- Begin ICP-2 motion: 10-15 personalized agency outreaches/week (scripts in Section 12), goal 5 agency design-partner accounts by Day 30.
- Weekly build-in-public metrics post continues.
- Goal by Day 30 (targets, not predictions): 600-1,500 cumulative signups, ≥30% reaching first successful run, 120-400 activated users, 10-30 paying (founding-member offer). For calibration: median SaaS activation is ~37% of signups and PLG companies average ~34.6% ([Agile Growth Labs 2025 benchmarks](https://www.agilegrowthlabs.com/blog/user-activation-rate-benchmarks-2025/)), and launch-channel folklore overstates volume, so the bottom of these ranges is not failure.

### Days 31-60

- Experiment triage per Section 5 cards: each channel hits its timebox; kill/iterate/double decisions documented.
- Programmatic SEO wave 1: integration pages (29) + pair pages only where a real template exists (top 50-100 pairs, not all 812). Hard rule from the research: Google's Mar 2024 scaled-content-abuse policy punishes many-pages-little-value sites at the domain level, and even Zapier's deep pair pages get near-zero traffic; every published page needs real templates, screenshots, and copy (see CH-8).
- Community template publishing opened to users (Section 6 Loop 4) with creator credit.
- 3 published case studies (1 per ICP) from design partners.
- Newsletter/community collabs: 3-5 pitches/week for template-pack giveaways or guest teardowns (Section 12 script).

### Days 61-90

- Double down on the 2-3 channels that produced activated users at acceptable founder-hours cost.
- Referral program v1 only if activation ≥ target (give tasks, get tasks; Section 6 Loop 5).
- Agency partner program v1 (directory listing + client-workspace story) if ≥5 agencies are active.
- First paid experiments only if Section 8 gates pass (working funnel + LTV signal).
- Day 90 deliverable: a one-page "what compounds" memo deciding the next quarter's 2 loops.

---

## 5. Acquisition Channels as Experiments

Every channel is an experiment card with a kill criterion. Founder-hours are the budget being spent; guard them.

### CH-1: Product Hunt launch
- Current state: only ~10% of launches get Featured since the Jan 2024 editorial split; Featured launches see roughly 1,000-5,000 visitors / 10-150 signups, non-featured 100-500 / 1-15; signup conversion runs 1-3%; PH traffic is below its 2018-19 peak but stable ([shno.co stats](https://www.shno.co/marketing-statistics/product-hunt-launch-statistics), directional blog aggregation; the ecosystem cross-cites itself, so treat as ranges).
- Hypothesis: a well-prepared PH launch produces a few hundred to a few thousand visits, credibility assets (badge, reviews), and, most importantly, a deadline that forces the Blocker list done.
- Audience: ICP-1, early adopters, other founders.
- Action: Week-0 prep (Coming Soon teaser to 100+ subscribers, gallery, video, first-comment maker story, supporter list), launch 12:01 AM PT on a weekend/Monday, founder present 16 hours.
- Success: ≥20 activated users within 72h + ≥20 genuine reviews.
- Failure: <10 activated users and no follow-on traffic bump; if not Featured, treat low numbers as expected, not as signal about the product.
- Timebox: one launch + 2 days follow-through.
- Next decision: success → schedule a v2 launch (new AI feature) in 60-90 days. Failure → PH is done; the assets remain.

### CH-2: Hacker News (Show HN)
- Current state, measured: median Show HN gets 2 points; 61.7% get zero comments; 50+ points = top 6%; best posting slot Monday 00:00 UTC (Sun 7pm ET) = 10.8% chance of 50+ points; a front page run historically means five figures of visits over 24-48h but founder retros also report front-page hits with thousands of pageviews and zero conversions ([188k-post analysis](https://danfking.github.io/blog/2026/04/23/show-hn-by-the-numbers/), [Sturdy Statistics](https://blog.sturdystatistics.com/posts/show_hn/), [Aidlab postmortem](https://www.indiehackers.com/post/front-page-of-hn-the-full-postmortem-traffic-lessons-surprises-cbe9e0a7f6)).
- Hypothesis: HN's builder audience overlaps ICP-1 and rewards honest, try-it-now posts; the public template gallery is the no-signup artifact HN rules require.
- Action: text-first Show HN, Sunday 7pm ET, no marketing voice, founder answers every comment for 6+ hours; per official rules the thing must be playable without signups.
- Success: front page (top 30) or ≥15 activated users.
- Failure: <10 points and no comments; that is the modal outcome and not fatal.
- Timebox: 1 post launch week + optionally 1 later technical post (e.g., "how our deterministic workflow checker works"; technical-depth posts are the HN-native second shot).
- Next decision: HN is a lottery ticket with positive expected value; buy it twice, then stop.

### CH-3: Reddit (value-first, never spam)
- Current state: sitewide norm is the 90/10 rule ("a redditor with a website, not a website with a Reddit account") plus per-sub karma/age minimums. r/Entrepreneur (multi-million members): zero self-promo in posts. r/smallbusiness: promotion only in designated threads. r/SaaS: the most promo-tolerant with context. r/nocode (~65-100k) and r/automation (~90k): tool posts tolerated when genuinely relevant. r/n8n (200k+): a live template-sharing wave that proves the automation-content demand ([subreddit norms roundups](https://redship.io/blog/reddit-self-promotion-rules), counts conflict across sources and Reddit itself was unfetchable; treat sizes as approximate). Also strategic: Reddit is the single most-cited domain in LLM answers (40.1% of citations in Semrush's 150k-citation study, [Semrush](https://www.semrush.com/blog/most-cited-domains-ai/)), so helpful Reddit answers compound into AI-answer visibility.
- Hypothesis: automation questions are asked constantly in r/smallbusiness, r/shopify, r/agency, r/Entrepreneur, r/nocode, r/automation; genuinely useful answers with occasional disclosure convert at high intent. Existence proof at small scale: a founder documented 26 personalized Reddit DMs → 18 replies → 13 signups → 6 paying customers ([OneUp case study](https://oneup.today/reddit-first-users-case-study)).
- Action: Week 0 = account aging + helpful comments only. Post-launch = 3-5 substantive comment-answers/day in threads asking "how do I automate X"; 1-2 value posts/month per subreddit (a real guide, template pack, or honest launch retro with numbers); always disclose affiliation.
- Success: ≥20 activated users/month attributable (UTM or "how did you hear").
- Failure: bans, removed posts, or <5 activated users/month by Day 45.
- Timebox: 45 days.
- Next decision: success → make it a permanent 30-min daily habit. Failure → reduce to passive monitoring via F5Bot/GummySearch mentions of "zapier too expensive" etc.
- Risk: highest reputational risk of any channel; the mitigation is being actually useful and disclosing.

### CH-4: X (build-in-public + demo clips)
- Current state (third-party algorithm analyses, directional): body links cost ~30-50% of reach (put links in the first reply); roughly half of free-account posts get zero engagement and Premium accounts see a 2-4x reach boost (buy Premium); engagement weighting makes replies ~13.5x a like and an author replying to your reply ~150x, which is why the replies-first strategy works at zero followers; >3 posts/day triggers dampening ([OpenTweet](https://opentweet.io/blog/how-twitter-x-algorithm-works-2026), [PostEverywhere](https://posteverywhere.ai/blog/how-the-x-twitter-algorithm-works)).
- Hypothesis: faceless screen-demo clips + transparent metrics posts can grow a founder account to 1-3k relevant followers in 90 days and produce a steady trickle of high-intent signups.
- Action: 2-3 posts/day max, 4-5 substantive pieces/week (2-3 demo clips, 1 metrics/lessons post, 1 thread); heavy replying to automation/no-code conversations; links in first reply, never the body.
- Success: ≥15 activated users/month by Day 60; ≥1 post/month over 20k impressions.
- Failure: <5 activated users/month at Day 60.
- Timebox: 60 days (organic social needs runway).
- Next decision: success → keep + add spaces/collabs. Failure → cut posting to 2/week repurposed clips, move hours to SEO.

### CH-5: LinkedIn (founder personal account)
- Current state (measured, 1.8M-post dataset to Feb 2025): organic reach down ~50% YoY; an average post reaches 8-12% of followers; company pages get materially less reach than personal profiles; document posts (PDF carousels, 8-10 slides) are the top-engagement format at ~6.6%; native short video also outperforms ([Van der Blom Algorithm InSights 2025](https://www.linkedin.com/posts/richardvanderblom_chapter-1-algorithm-insights-report-2025-activity-7322514599126130688-Q895)).
- Hypothesis: ICP-2 (agencies, ops consultants) lives here; document-post teardowns ("6 automations every agency runs for clients" as a carousel) and screen-demo videos generate agency conversations.
- Action: 3 posts/week (1 carousel teardown, 1 demo video/GIF, 1 build-in-public), 10 thoughtful comments/day on ops/agency creators' posts, connection requests to engaged commenters. Post from the personal account; the company page just mirrors.
- Success: ≥10 agency/ops conversations/month; ≥5 activated ICP-2 accounts/month by Day 60.
- Failure: <3 conversations/month at Day 60.
- Timebox: 60 days.
- Next decision: success → this becomes the ICP-2 engine feeding outreach (CH-10). Failure → shift ICP-2 effort fully to direct outreach + communities.

### CH-6: YouTube Shorts + TikTok (faceless demo clips)
- Current state: the automation-content wave is real and measured. Nate Herk's n8n/AI-automation tutorial channel went from ~230k subscribers (Jun 2025) to 842k with 43M total views (Jul 2026), and his paid community has 305k+ members ([vidIQ channel stats](https://vidiq.com/youtube-stats/channel/@nateherk/)). Honest caveats: no measured baseline exists for what a NEW faceless channel gets (unconfirmed), YouTube's Jul 2025 inauthentic-content policy demonetizes mass-produced template videos (real screen demos with real narration are fine), and claims that TikTok drives 15-35% of SaaS signups come from a vendor selling that service (unverified).
- Hypothesis: screen-capture demos with caption overlays ride the existing n8n-content demand; each clip is evergreen inventory; conversion is a trickle, not a flood.
- Action: 3-4 Shorts/week cross-posted TikTok; format = hook text overlay ("Stop copying Stripe payments into Sheets"), 25-45s screen demo at 1.5-2x, CTA to template page; batch-record weekly.
- Success: ≥1 clip >10k views in first 45 days OR ≥10 activated users/month attributed.
- Failure: flat <500-view average and no attributed activations by Day 60.
- Timebox: 60 days.
- Next decision: success → increase to daily + start 3-8 min long-form YouTube tutorials (the durable asset; long-form tutorial search is where the n8n creators actually win). Failure → keep clips as byproduct of other work only (they cost little once demos exist).

### CH-7: Template gallery SEO (the product IS the content)
- Case-study grounding: n8n hosts 10,444 community templates on public creator-credited pages and actively recruits template authors with a 30%/12-month affiliate cut, and an ecosystem of third-party template libraries now funnels demand to them ([n8n.io/workflows](https://n8n.io/workflows/) fetched 2026-07-08). Zapier's programmatic/integration pages carry roughly 16% of its organic traffic but with high commercial intent ([Ahrefs case study](https://ahrefs.com/blog/zapier-seo-case-study/)). Expectation-setting: SEO takes 3-6 months minimum, 6-12 in competitive niches, slower on brand-new domains ([Search Engine Land](https://searchengineland.com/guide/how-long-does-seo-take-to-work)); this channel is planted now and harvested in months 3-9.
- Hypothesis: 96 public template pages targeting long-tail "automate X" and "[app] to [app]" queries can rank on a new domain because the queries are low-competition, and they convert at high intent straight into the use-template flow.
- Action: make gallery public and indexable (Section 13 Blocker), one keyword-mapped title/description per template, internal linking from integration pages, submit sitemap.
- Success: 500+ organic visits/month by Day 90 with template→signup ≥8%.
- Failure: near-zero impressions at Day 90 (suggests indexing or thin-content problems).
- Timebox: build once in weeks 1-2, evaluate at Day 90 (SEO latency is real).
- Next decision: success → scale template count + community templates (Loop 4). Failure → audit indexing/quality before writing anything else.

### CH-8: Programmatic integration + pair pages
- Case-study grounding + warning: Zapier's loop worked because partners wrote the page copy and co-marketed "their" pages, and pages matched real search demand ([Foundation Inc](https://foundationinc.co/lab/seo-strategy-zapier)); deep pair pages get near-zero traffic even for Zapier, and Google's Mar 2024 "scaled content abuse" policy explicitly targets many-pages-little-value sites, with domain-level penalties that take months to recover from ([Amsive](https://www.amsive.com/insights/seo/googles-helpful-content-update-ranking-system-what-happened-and-what-changed-in-2024/)). At zero authority, shipping 812 thin pair pages is how you get classified as spam.
- Hypothesis: 29 strong "/integrations/slack" pages + only the pair pages where a real template exists capture bottom-funnel searches at honest scale.
- Action: one strong page per provider (real actions/triggers listed, 3-5 linked templates, screenshots, FAQ), then pair pages ONLY where a template actually exists; expand with usage data.
- Success: integration pages indexed and getting impressions by Day 60; ≥300 organic visits/month by Day 90.
- Failure: no impressions by Day 90.
- Timebox: wave 1 in days 8-30, evaluate Day 90.
- Next decision: expand pairs gradually; never publish pages with no unique content.

### CH-9: Comparison / alternatives pages
- Hypothesis: "Zapier alternative", "Make vs Zapier", "n8n vs Zapier" searchers are actively switching; honest comparisons (conceding where competitors win) convert and earn AI-answer citations.
- Action: 3 pages in days 8-30 (vs Zapier, vs Make, vs n8n) + 1 roundup ("best Zapier alternatives 2026" including competitors honestly).
- Success: page-2+ rankings or AI-answer citations by Day 90; any attributed activations.
- Failure: nothing indexed/ranked by Day 90 (expected to be slow; these are competitive terms).
- Timebox: write once, refresh quarterly.
- Next decision: these pages are also sales collateral for outreach and Reddit answers regardless of rankings, so they stay.

### CH-10: Cold outreach (ICP-2 agencies + ops consultants)
- Hypothesis: 10-15 genuinely personalized outreaches/week to small agencies convert 5-10% into conversations because the offer (automate a specific client workflow, free setup help, founding rate) is concrete.
- Action: scripts in Section 12; personalize with one true observation about their agency; offer a specific workflow, not "a demo".
- Success: ≥10% reply rate, 5 design-partner agencies by Day 30.
- Failure: <3% reply rate after 50 sends (message-market fit problem; rewrite).
- Timebox: 50 sends, then review.
- Next decision: success → systematize (100/week ceiling; never automate the personalization away). Failure → fix the offer before the volume.

### CH-11: Newsletters, podcasts, communities (borrowed audiences)
- Hypothesis: ICP-adjacent newsletters and communities will feature a genuinely useful template pack or teardown for free (content is their product), delivering warm high-trust traffic.
- Action: 3-5 pitches/week from Day 14 (script in Section 12); offer a custom template pack ("10 automations for Shopify stores") or data/teardown piece, not "coverage".
- Success: 2+ placements by Day 45; ≥10 activated users per placement.
- Failure: 0 placements after 30 pitches.
- Timebox: 30 pitches.
- Next decision: success → build a rolling pipeline; consider small paid sponsorships in Section 8 ($500 tier). Failure → revisit the artifact being offered.

### CH-12: Directories (BetaList, alternatives sites, etc.)
- Current state: BetaList free queue is now 2-4 months (submit in Week 0 so it lands near launch; $99-129 expedite exists). Free and worth the minutes: Uneed, AlternativeTo, SaaSHub, Peerlist Launchpad, TinyLaunch, Fazier, MicroLaunch. Paid listings to skip at this stage: There's An AI For That ($347), Toolify ($99).
- Hypothesis: individually tiny, collectively a durable trickle + backlink base for a new domain, plus the G2/Capterra profiles that feed AI answers.
- Action: submit BetaList in Week 0; batch the free directories in launch week; stand up G2/Capterra and ask every happy beta user for a review (review sites are top-cited sources in AI answers; Section 4, 1c).
- Success: any; treat as hygiene.
- Failure: n/a (cost is ~4 hours once).
- Timebox: 1 day + 1 hour/month maintenance.

### CH-13: Affiliates (deliberately later)
- Status: DO NOT BUILD before Day 60+ and only after paid conversion exists (an affiliate program with no converting funnel pays commissions on nothing and wastes partner goodwill). See Section 6 Loop 5 ordering and Section 7.
- Verified norms to build against when the time comes: Make pays 35% of referred payments for 12 months ([Make](https://help.make.com/affiliate-program)); n8n pays 30% for 12 months and ties it to template creators ([n8n](https://n8n.io/affiliates/)); the Rewardful benchmark report (250 programs, $68.4M tracked) puts average SaaS commissions at ~22-24.5% and says programs take 6-24 months to produce meaningful revenue ([Rewardful](https://www.rewardful.com/articles/saas-affiliate-program-benchmarks)). Tooling: Rewardful/Tolt/FirstPromoter all start at $49/mo; PartnerStack is enterprise-priced (~$500-800/mo+), skip it.
- When built: 30% recurring for 12 months on Stripe via Rewardful-class tooling, recruited from users who already share, plus template creators (copy the n8n creator-affiliate pattern).

### CH-14: Agency partner / reseller program (later)
- Status: informal only in days 1-60 (design partners + founding rate). Formalize (directory listing, revenue share, client workspaces) after ≥5 agencies actively deliver client work on ChainReact.

---

## 6. High-Volume Growth Loops

Ordered by build-now vs build-later. Each loop names the product change required.

### Build now (days 0-30)

Loop 1: Template gallery SEO loop.
Templates → public indexable pages → search + AI-answer traffic → signup via "use this template" → users publish templates (Loop 4 later) → more pages. Product changes: anonymous gallery browsing (Blocker), per-template OG cards, template→signup deep link that survives onboarding and lands the user inside the template with their apps prompted for connection.

Loop 2: Demo-clip social loop.
Every template/workflow built (for content, for users, for self) → 30-45s screen clip → X/Shorts/TikTok/LinkedIn → template page → signup → new user workflows suggest new clips. Product change: none required (screen recorder + template links); later, a one-click "record this run" export would supercharge it.

Loop 3: Team invites (exists; instrument it).
Workflows that touch shared tools (Slack channels, shared Sheets) naturally expose teammates. Product changes: track invite events in analytics; add a visible "invite a teammate" prompt after first successful run of a team-relevant workflow.

### Build mid (days 30-60)

Loop 4: Community template publishing with creator credit.
Users publish templates → public creator-credited pages → creators share their own pages (ego + portfolio) → traffic → more users → more templates. Product changes: publishing flow already exists (visibility model); add public creator profile pages + "template by [name]" credit + a lightweight review gate for quality. This is n8n's proven loop at full scale: 10,444 community templates on creator-credited public pages, with creators later monetized via a 30%/12-month affiliate cut ([n8n.io/workflows](https://n8n.io/workflows/)); an entire third-party ecosystem of template libraries now markets n8n for free. ChainReact copies the mechanics early and adds the affiliate layer only after paid conversion exists (Loop 5 gate).

### Build later (days 60-90, gated)

Loop 5: Referral credits (gate: activation ≥ target, paid conversion exists).
Give 200 tasks / get 200 tasks (or one month of Pro at higher tiers). Referral before activation amplifies nothing; referral after activation amplifies a working funnel. Product change: referral codes + credit grants on the existing task-ledger system.

Loop 6: Agency-client multiplier (gate: ≥5 active agencies).
Agency builds for client → client workspace on ChainReact → client staff see it and reuse → client becomes independent account; agency earns partner status/margin. Product changes: none for v1 beyond team accounts (exists); later, client-workspace handoff and partner directory.

### Product changes ranked by activation/virality leverage

1. Anonymous template gallery + OG share cards (unlocks Loops 1, 2, 4 and every channel's landing surface).
2. Golden-path onboarding: signup → prompted to pick a template or type a sentence into the AI builder → connect only the 1-2 apps that template needs → test run with sample data → activate. Measure time-to-first-run end to end.
3. First-run "moment": success screen worth screenshotting (what ran, what it will save, share/template-ize buttons). This is the share moment the product currently lacks.
4. In-app activation checklist + 5-email onboarding sequence keyed to funnel stage (Section 9).
5. Public workflow/template share links for users (share what you built without publishing to marketplace).
6. Referral credits (later, per Loop 5).

---

## 7. Funding and Budget Without Investors

All terms below verified 2026-07-08 against official program pages unless flagged.

### Credit programs a bootstrapper actually qualifies for (no VC required)

| Program | What you get | Eligibility notes | Effort | Worth it |
|---|---|---|---|---|
| [Microsoft for Startups](https://learn.microsoft.com/en-us/startups/microsoft-for-startups/overview) | $1,000 Azure now + $4,000 after business verification; up to $150k unlocked over time with usage | Founders Hub name retired Jul 2025; self-serve path needs no funding | 1-2 hrs | Yes if any Azure use; else low |
| [AWS Activate Founders](https://aws.amazon.com/startups/credits/) | $1,000 credits + ~$350 support credits | Explicitly for bootstrapped; business email + site | 1 hr | Yes if any AWS use |
| [Google for Startups Cloud, Start tier](https://cloud.google.com/startup/benefits) | $2,000 over 12 months + $200 training | <5 yrs old, NO institutional VC required | 1 hr | Yes if any GCP use |
| [Cloudflare for Startups Tier 3](https://www.cloudflare.com/startups/) | $10,000 credits, 12 months | "No minimum funding required," <$1M raised | 1-2 hrs | Yes; best no-strings amount |
| [Supabase Startup Program](https://supabase.com/solutions/startups) | ~6 months Team plan free (~$3,600 reported; exact terms not published) | Open to bootstrapped per third-party trackers; treat as approximate | 1 hr | Yes; ChainReact runs on Supabase |
| [Notion for Startups](https://www.notion.com/help/notion-for-startups) | 3 months Business + AI free | <100 employees, new customer | 30 min | Sure |
| [HubSpot Bootstrap Program](https://www.hubspot.com/startups/bootstrap-program) | 30% off year 1 | No funding needed; <5 yrs, 1-25 employees | 30 min | Only if adopting HubSpot |
| [Stripe Atlas](https://support.stripe.com/questions/atlas-fee-credits-faq) | $2,500 Stripe credits with $500 incorporation | Fee-waiver-on-first-$100k perk discontinued for companies incorporated after Oct 16, 2025 | n/a if already incorporated | Only if incorporation is still pending |

Not accessible without VC backing (skip, do not spend hours on): [Vercel for Startups credits](https://vercel.com/startups/credits) (requires approved accelerator/VC partner), [OpenAI startup credits](https://openai.com/startups/) (partner VCs only), [Anthropic startup credits](https://claude.com/programs/startups) (membership is open to bootstrappers, credits require institutional funding).

Realistic haul from one focused day of applications: roughly $5k-15k of infrastructure cost erased for year 1, which matters more than it sounds because it makes the $0-ad-budget plan genuinely $0.

### AppSumo / lifetime deals: recommended NO

- Official baseline split: 95% of revenue from new customers you bring, 70% from AppSumo's returning customers; payouts 60 days after month end; Select-tier splits are negotiated and unpublished (third parties commonly report partners netting ~30% on Select) ([AppSumo partner docs](https://sell.appsumo.com/g/getting-paid), [AppSumo blog](https://appsumo.com/blog/breaking-down-appsumo-revenue-share)).
- Noah Kagan self-reported AppSumo revenue fell ~50% over 2024-25 (single-source via [ppc.land](https://ppc.land/appsumos-revenue-crashes-50-as-lifetime-deal-model-faces-existential-crisis/); uncorroborated but from the founder himself).
- Documented small-SaaS outcome: $19 LTD x 362 customers = $3,209 net with ~30% refund rate ([Indie Hackers retro](https://www.indiehackers.com/post/my-appsumo-campaign-zero-audience-362-paying-customers)).
- Structural problem for ChainReact specifically: lifetime users consume tasks and AI credits forever against a one-time payment. For a usage-metered product this is selling unlimited liability at a discount.
- The founding-member offer (Section 10) captures the same urgency as an LTD while keeping recurring revenue.

### Accelerators: not now

- YC: $500k for 7% + MFN SAFE, ~1% acceptance ([YC deal](https://www.ycombinator.com/deal)); it is a VC-track commitment, not a funding hack.
- The no-equity/low-touch niche has emptied: Mercury Raise closed as a program, buildspace shut down Aug 2024, Pioneer stopped investing in 2024 (confirmed via their own pages).
- [TinySeed](https://tinyseed.com/program) ($120-300k for 10-12%, remote, bootstrapper-native) is the only culture-fit option; consider only after 90 days of traction data, and only if you decide you want capital at all.

### Grants and competitions (US)

- [Verizon Small Business Digital Ready](https://digitalready.verizonwireless.com/funding): $10k grants, unlocked by completing 2 free courses on their platform; 10 winners/month through Dec 2026. Two hours of effort for a lottery ticket with a real prize: do it in Week 0.
- [Arch Grants](https://archgrants.org/programs/startup-competition/): $75k equity-free but requires relocating HQ to St. Louis for a year; annual cycle (2026 closed). Only if relocation is genuinely on the table.
- SBIR/STTR: funds mission-aligned R&D, not horizontal SaaS product work. Skip; do not burn weeks on it.

### Order of operations (does not slow launch)

1. Week 0, one afternoon: apply to Supabase, Cloudflare, Google, Microsoft, AWS, Notion; start the two Verizon courses in the background.
2. Day 1 onward: founding-member annual prepays are the real "funding round": 25 founding members at ~$137/yr (Pro annual at 40% off) is ~$3.4k of non-dilutive cash and 25 committed references.
3. Days 30-90: angel/advisor monthly-update list (Section 12 script) builds the relationship pipeline without raising; if a raise ever becomes attractive, the update history is the deck.
4. Never: LTD marketplaces, paid pitch competitions, accelerator applications as a funding strategy.

---

## 8. Paid Marketing: Staged, Gated, Mostly Later

Cost context from research (2025-26 sources): B2B SaaS Google Ads CPC averages $8.86 (+29% YoY, [AdLabz](https://www.adlabz.co/b2b-saas-google-ads-benchmarks-for-2025)), with typical SaaS search CPCs $3-7 ([Ryze](https://www.get-ryze.ai/blog/saas-google-ads-cost-benchmarks-budget-2026)); per-keyword CPCs for "zapier alternative"-class terms are not publicly verifiable without a paid tool, but expect the high end given competitor bidding. Reddit Ads: $5-10/day minimum viable, B2B SaaS CPCs reported $0.50-2.00, agencies suggest ~$2k/mo to properly validate ([Understory](https://www.understoryagency.com/blog/effective-reddit-ads-guide), [Metadata](https://metadata.io/resources/blog/reddit-ads-playbook-for-b2b-saas/)). X Ads: cheap reach (~$5.80 CPM) but weak direct conversion (~0.69% visitor-to-lead vs LinkedIn's 2.74%, [Improvado](https://improvado.io/blog/twitter-ads-guide)). Newsletter sponsorships: <5k subs $50-250/placement, 5-50k subs $500-3,000, specialized B2B CPMs $50-100+ ([beehiiv](https://www.beehiiv.com/blog/newsletter-sponsorship-cost)); dev-newsletter reference points: CSS Weekly $500/issue, iOS Dev Weekly $1,800/issue.

### Gates that must be true before the first paid dollar

1. Funnel instrumented and stable: you can trace visitor to activated user by source.
2. Activation (A3) ≥ 25-30% of signups on the golden path.
3. Free-to-paid ≥ 2% on a cohort at least 30 days old (freemium benchmark band is 2-5%; [Daydream](https://www.withdaydream.com/library/insights/freemium-conversion-rate)).
4. At least one page (template, comparison, or homepage) converting visitors to signup at ≥5%.
5. A defensible LTV guess: one retained paying cohort ≥ 3 months.

### Staged budgets

$0/month (now through at least Day 45):
- Everything organic. One sanctioned exception: X Premium (~$8-16/mo), because third-party algorithm analyses report free-account posts get materially throttled and Premium accounts see 2-4x reach ([OpenTweet](https://opentweet.io/blog/how-twitter-x-algorithm-works-2026); third-party, but cheap enough to just take).

$500/month (earliest Day 45-60, only if gates 1-3 pass):
- $200-400: two placements in small niche newsletters (<25k subs) read by ICP-1/2 (indie SaaS, ops, no-code); negotiate directly, expect $50-250 each at the small end.
- $100-300: Reddit Ads pilot at $5-10/day, interest + subreddit targeting around automation/small-business topics, driving to a template page, capped and killed if cost per activated user exceeds ~$25.
- Measure everything in cost per ACTIVATED user, never CPC or signup.

$2,000/month (only if $500 tier found a channel with acceptable cost per activated user):
- $1,000-1,200: scale the winner (more newsletter placements or Reddit at the ~$2k validation level from the playbooks above).
- $500-800: first Google Ads: exact-match only, bottom-funnel ("zapier alternative", "make alternative", "[app] [app] integration" terms you already rank content for), tight budget caps, expect $3-9 CPCs.
- $0 on LinkedIn, Meta, X ads at this tier.

$5,000/month (only with CAC payback < 6 months measured):
- Scale Google search on proven terms; add retargeting (site visitors + template-page viewers).
- One mid-band newsletter or YouTube automation-channel sponsorship ($500-3,000; the n8n-tutorial creator ecosystem now has large audiences, e.g. channels in the hundreds of thousands of subscribers).
- Keep 10-15% for testing one new channel per month.

$10,000/month (only with repeatable payback and >$15-20k MRR):
- Add LinkedIn ads narrowly for ICP-2 (agencies/ops) despite high CPCs, because intent quality is real there.
- Sponsor 2-3 creators/newsletters on recurring slots; negotiate quarterly rates.
- Still $0 on: Meta prospecting, display, brand campaigns, conference booths.

### Never spend early on

Broad match search, competitor head terms at scale, Meta/TikTok prospecting, LinkedIn before ICP-2 revenue exists, paid directory "featured" slots (e.g., There's An AI For That at $347), PR distribution, and any agency retainer.

---

## 9. Metrics and Funnel (Activation Over Vanity)

### Minimum viable launch funnel

Visitor → signup → connect app → choose template or build workflow → run/test workflow → understand value → upgrade, invite, or share.

| Stage | Event to instrument | Early target (estimate; label: pre-benchmark) | If it leaks, look at |
|---|---|---|---|
| Visitor → signup | landing view → account created | 3-6% cold traffic; 8-15% from template pages | Headline/demo mismatch, signup friction, no pricing page trust gap |
| Signup → connect app | first OAuth completed | ≥60% within 24h | OAuth scariness (scopes copy), unclear first step, missing the golden path |
| Connect → workflow created/used | template used or workflow saved | ≥70% of connectors | Template quality for that user's stack; builder overwhelm; AI prompt discoverability |
| Created → first successful run | first run with success status | ≥70% of creators | Config errors (deterministic checker should catch), confusing test flow, provider auth failures |
| First run → understand value | returns within 7d OR enables a second workflow OR run streak ≥3 | ≥50% of first-runners | Workflow triggered rarely (help pick higher-frequency templates), silent failures, no run-notification |
| Value → upgrade/invite/share | checkout, invite sent, template shared/published | 2-5% of activated to paid in 30d (estimate) | Free tier too generous/too stingy, no visible usage meter, missing upgrade moments |

### Definitions (proposed, product-enforceable)

- Setup moment (A1): first integration connected.
- Aha moment (A2): first successful workflow run (test or live).
- ACTIVATED USER (A3): has ≥1 enabled workflow with ≥3 successful runs on ≥2 distinct days within 14 days of signup. This is the number reported everywhere. Signups are tracked but never celebrated.
- Time-to-first-run (TTFR): minutes from account creation to A2. The "2-minute promise" metric. Target: median <10 min at launch, <5 by Day 60, and only then market the 2-minute claim aggressively (measured from template-click for the golden path).

Benchmark calibration (2025 datasets): median SaaS activation is ~37% of signups, PLG companies average ~34.6%, and <20% signals an onboarding friction problem ([Agile Growth Labs](https://www.agilegrowthlabs.com/blog/user-activation-rate-benchmarks-2025/)); freemium free-to-paid runs 2-5% typical / 8-15% top quartile ([Daydream](https://www.withdaydream.com/library/insights/freemium-conversion-rate)). Our A3 definition is stricter than most "activation" definitions in those datasets, so hitting 25-30% A3 would be genuinely good.

### North star

Weekly Activated Accounts (new A3 count per week). Supporting: WAU of accounts with ≥1 enabled workflow; successful runs per active account per week.

### Instrumentation (Week 0 work, Section 13)

- PostHog (free tier) for product events + funnels + session replay; events: landing_view, signup, integration_connected(provider), template_used(id), workflow_created, workflow_first_run(status), run_streak_3, checkout_started/completed, invite_sent, template_published. The existing `workflow_runs` and `workflow_template_usage_events` tables already capture the server-side truth; mirror the key ones as analytics events.
- Attribution: UTMs on every link this plan generates + a one-question "where did you hear about us?" on signup (free-text; people answer it; it catches dark-social that UTMs miss).
- Weekly ritual: one hour, same day each week: funnel table, top drop-off, one fix shipped, one channel decision. Written up as the build-in-public metrics post (the ritual produces content for free).

### Diagnosis playbook (drop-off → first three things to check)

1. Watch 5 session replays of users who hit the drop-off stage. (Almost always sufficient.)
2. Check the stage's error/event logs (OAuth failures by provider, run failures by action).
3. Ask 3 real users from that cohort (email them personally; at this scale they answer).

---

## 10. Pricing and Offer Strategy

### What the market charges (official pages, fetched 2026-07-08)

| Tool | Free | Entry paid | What a dollar buys |
|---|---|---|---|
| Zapier | 100 tasks/mo, 2-step only | $19.99/mo → 750 tasks | ~37 tasks/$; every step billed |
| Make | 1,000 credits, 2 scenarios | $12/mo → 10,000 credits | ~833 credits/$; credits vary per action |
| n8n Cloud | none (self-host free) | EUR 20/mo → 2,500 executions | 125 full runs/$; steps free |
| Relay.app | 200 steps + 500 AI credits | $19/mo → 750 steps | ~39 steps/$ |
| Gumloop | 5k credits, 1 trigger | $37/mo → 20k+ credits | AI-native premium pricing |
| Lindy | none (trial only) | $49.99/mo | AI-native premium pricing |

Metering models in play: per-task/step (Zapier, Relay, ChainReact's current model), per-credit (Make, Gumloop), per-execution (n8n; the model users increasingly perceive as fair), per-user (Power Automate $15/user, Airtable $20/user).

### Recommended launch pricing

ChainReact's billing is task-based (actions cost tasks; triggers and logic are free; AI credits are a separate pool). Do not re-architect billing now; instead price the model so the category's #1 complaint (metering anxiety) works for us:

| Plan | Price (annual / monthly) | Tasks/mo | Active workflows | AI credits | Notes |
|---|---|---|---|---|---|
| Free | $0 | 500 | 3 | 20 | Enough for 1-2 real always-on automations; beats Zapier free (100, 2-step) on every visible axis |
| Pro | $19 / $24 | 5,000 | Unlimited | 500 | Anchored $0.99 under Zapier Pro with ~6.6x the tasks |
| Team | $49 / $59 | 15,000 | Unlimited | 2,000 | Flat per workspace with 10 seats included; undercuts Zapier Team ($69) and every per-seat competitor |
| Business | $149 / $179 | 50,000 | Unlimited | 10,000 | Priority support; keeps a visible upgrade path |
| Enterprise | Contact | Custom | Custom | Custom | Exists in billing already; do not sell it actively (Section 15) |

These are recommendations to pressure-test, not gospel: the load-bearing choices are (a) free tier generous enough to run one real automation forever, (b) Pro visibly cheaper-per-task than Zapier, (c) Team flat-rate per workspace, not per seat. Exact numbers can move.

Pricing-page promises (each counters a documented competitor complaint):
1. "Only actions count. Triggers, filters, and logic are always free." (vs Zapier's every-step billing)
2. "Hard caps by default. Your workflow pauses at your limit; it never surprise-bills you. Overage is strictly opt-in." (vs $400-1,200 surprise-bill reports)
3. "Prices and allowances are public and stable." (vs Make's credit-switch backlash)

### Offer structure

- Trial: 14-day full Pro trial, no card required, landing on the functional Free plan afterward. Benchmarks: opt-in trials convert ~9-18% depending on dataset ([Userpilot](https://userpilot.com/blog/saas-average-conversion-rate/)); freemium converts 2-5% typical, 8-15% top quartile ([Daydream](https://www.withdaydream.com/library/insights/freemium-conversion-rate), [ProductLed](https://productled.com/blog/product-led-growth-benchmarks)). Model the P&L at 2-3%.
- Founding-member offer (Day 1): first 100 paid accounts get 40% off for life (Pro $11.40/mo, Team $29.40/mo, annual equivalents), publicly numbered ("37 of 100 claimed"). This is the LTD alternative: urgency and reward without selling unlimited lifetime usage against one-time cash.
- No lifetime deals, no AppSumo (economics in Section 7).
- Discounts beyond founding: none in the first 90 days. Coupons train bargain-hunting; the founding offer is the one exception because it builds the reference base.

### Avoiding the free-user trap

- Size Free for value proof, not for living on: one to two real automations run forever, but the 3-workflow and 20-AI-credit caps mean anyone automating seriously hits a wall inside a month.
- Make usage visible (Section 13 usage meter): people upgrade when they can see the meter filling; invisible limits just create support tickets.
- Put the upgrade moment at proven value: when a workflow pauses at the cap, the resume button is the upgrade button, with the run history right there showing what the automation has been doing for them.
- Watch the ratio: if >90% of activated users sit comfortably inside Free at Day 60, shrink the Free task cap for NEW signups (grandfather existing) rather than raising prices.

---

## 11. 30-Day Content Calendar (From Day 1)

Formats: CLIP = 25-60s faceless screen demo with caption overlays, cross-posted to X + YouTube Shorts + TikTok + LinkedIn. POST = written post native to the channel. PAGE = SEO page/blog on chainreact.app. All clips end on a template-page CTA.

| Day | Piece (channel) | Hook / working title |
|---|---|---|
| 1 | PH launch + X thread + LinkedIn + IH post | "We built an AI that turns 'I should automate that' into a running workflow. Here's the whole story + numbers." |
| 2 | CLIP | "Stripe payment → Slack #wins + Sheets log. Built by AI in 90 seconds, live." |
| 3 | POST (Reddit r/smallbusiness, value-only) | "5 tasks you're doing manually that a $0 tool should be doing (no links; ask me anything)" |
| 4 | CLIP | "Gmail attachment → auto-filed in Drive by sender. Never dig through email again." |
| 5 | POST (LinkedIn) | "Why we built ChainReact after watching small teams lose hours to copy-paste" (text + GIF) |
| 6 | CLIP | "Typeform lead → HubSpot contact + Slack ping + follow-up draft. 3 apps, 0 code." |
| 7 | POST (X + IH) | "Launch week, real numbers: X visitors, Y signups, Z people actually automated something. What worked and what flopped." |
| 8 | PAGE | "Zapier alternatives in 2026: an honest comparison (including where Zapier is still better)" |
| 9 | CLIP | "Shopify order → thank-you email + fulfillment log. E-com ops on autopilot." |
| 10 | POST (LinkedIn, ICP-2) | "The 6 automations every agency should run for every client (steal these)" |
| 11 | CLIP | "Calendly booking → Notion CRM entry + reminder email. Never no-show a lead." |
| 12 | POST (Reddit r/shopify, value-only) | "Order-ops checklist: what to automate first in a 1-person store" |
| 13 | CLIP | "Failed Stripe payment → instant email + follow-up task. Recover revenue while you sleep." |
| 14 | POST (X) | "Week 2 numbers + the funnel leak we found watching 10 session replays" |
| 15 | PAGE | "How to automate invoice follow-ups with QuickBooks + Gmail (free template)" |
| 16 | CLIP | "New GitHub issue → Slack triage with priority labels. Your repo, self-sorting." |
| 17 | POST (LinkedIn) | "We watched 50 people build their first automation. Here's exactly where they got stuck." |
| 18 | CLIP | "Mailchimp subscriber → welcome sequence + Sheets audience log." |
| 19 | PAGE | "Make vs Zapier vs ChainReact for small teams (2026)" |
| 20 | CLIP | "Monday.com task done → Teams update + client email draft." |
| 21 | POST (X + IH) | "Week 3: our first N paying customers. What they have in common." |
| 22 | POST (Reddit r/nocode) | "Launch retro with real numbers: PH vs HN vs Reddit vs X for an automation tool" |
| 23 | CLIP | "Google Sheets row → personalized Gmail. Mail merge without the merge." |
| 24 | PAGE | "10 Slack automations for small teams (with free templates)" |
| 25 | CLIP | "Discord member joins → welcome DM + member log. Community ops, automated." |
| 26 | POST (LinkedIn, ICP-2) | "Agency case study: [design partner] automated client reporting and saved X hrs/week" |
| 27 | CLIP | "Notion database → Friday digest email to the team. The update meeting, deleted." |
| 28 | PAGE | "Behind the scenes: how we built 96 workflow templates (and which 10 people actually use)" |
| 29 | CLIP | "The AI builder, uncut: prompt → workflow → test → live in one take." |
| 30 | POST (X + IH + LinkedIn) | "Day 30, everything public: funnel, activation rate, revenue, channel scorecard, and month 2 plan." |

Repurposing rule: every PAGE becomes a thread + a LinkedIn post; every CLIP's script becomes a tweet; every metrics POST feeds the next week's Reddit comments with real numbers. Nothing is written once.

---

## 12. Outreach Scripts (Copy-Paste, Personalize the [brackets])

Rules: 2 sentences of them, 1-2 sentences of us, one concrete ask, no links in the first message unless asked, plain text, no "hope this finds you well," no fake compliments.

### Small business owner (email/DM)

"Hi [name], saw your post about [specific manual task, e.g., 'chasing invoices by hand']. We just launched ChainReact: you literally type 'when an invoice is 7 days overdue, email the client and remind me in Slack' and it builds that automation across QuickBooks/Gmail/Slack. Free plan covers this. Want me to set that exact one up for you? Takes about 10 minutes and you keep it either way."

### Agency (email, ICP-2)

"Hi [name], noticed [agency] runs [service, e.g., 'lead gen for home services clients']. Quick question: how are you handling [specific client workflow, e.g., 'getting form leads into each client's CRM and notifying them']? We built ChainReact (AI builds cross-app automations from a plain-English description). Agencies use it to standardize client ops without Zapier's per-client cost. I'll build your messiest client workflow with you free, and early agencies get a founding rate locked for life. Worth 20 minutes this week?"

### Creator (DM)

"Hey [name], love [specific piece]. I run ChainReact, an AI that builds automations between your apps (e.g., new Typeform response from a sponsor → Notion pipeline + draft reply in Gmail). Building a small group of creators to shape our creator templates; you'd get free Pro for a year and direct input on what we build next. Interested?"

### Ops manager (LinkedIn)

"Hi [name], saw you run ops at [company]. What's the most annoying recurring task on your plate right now: reporting, onboarding, data shuffling between [tool] and [tool]? Asking because we built ChainReact (describe a workflow in a sentence, AI builds it across ~30 mainstream apps) and I'm collecting the top 10 ops workflows to ship as one-click templates. If yours is one of them I'll build it for you first, free."

### Startup founder (X DM / email)

"Hey [name], congrats on [recent thing]. We just launched ChainReact: type what you want automated ('Stripe payment → Slack + spreadsheet + thank-you email') and the AI builds it. Free plan, ~100 templates. If you try it and tell me where it breaks, I'll comp you [3 months Pro]. Deal?"

### Local service business (email; note: SMS tools not yet integrated, keep scope honest)

"Hi [name], quick one: when someone fills out your [quote request form], what happens next? If the answer is 'I see it when I check email,' we can fix that today: instant email reply to the customer, the job logged in a spreadsheet, and a task on your board, automatically. Free to set up, I'll do it with you in 15 minutes. (We don't do text-message alerts yet, so if SMS is essential I'll say so upfront.)"

### Community / newsletter owner

"Hi [name], I read [newsletter]; the [specific issue] on [topic] was excellent. We make ChainReact (AI-built workflow automations). Not pitching a sponsorship: I'd like to build a free custom template pack for your audience, e.g., '10 automations for [their niche],' that you can share as your own resource, with a landing page for your readers. If it performs, happy to talk about something ongoing. Want me to draft the pack list?"

### Potential affiliate (later; only send once program exists)

"Hey [name], your [content] about [Zapier/Make/n8n/automation] keeps ranking, so you clearly own this audience. We just opened ChainReact's partner program: [20-30%] recurring for 12 months per referral, and early partners get a custom landing page + template pack for their audience. Want the details?"

### Angel investor / advisor (relationship-first; we are not raising)

"Hi [name], I'm building ChainReact: AI-built workflow automation for small teams (describe it in a sentence, it's live in minutes; 29 integrations, ~100 templates, launched [date]). Not raising right now. I send a short monthly update with real numbers (activation, revenue, what's working). Would you like to be on it? And if one thing in our plan deserves a challenge, I'd genuinely value 15 minutes of your skepticism."

---

## 13. Launch Assets Checklist (Blocker / High Leverage / Later)

Effort estimates assume 1 person, focused.

### BLOCKERS (launch does not happen without these)

| Asset | Effort | Why it blocks |
|---|---|---|
| Public pricing page (tiers, limits, FAQ) | 1-2 days | Every channel drives here; no visible pricing = no trust = no paid conversion; comparison content impossible without it |
| Public (anonymous) template gallery + template detail pages | 2-4 days | The #1 landing surface for every channel and both SEO loops; auth-gated templates make the core promise invisible |
| Analytics + funnel instrumentation (PostHog + events + UTMs + "where did you hear") | 1 day | Without it every experiment in Section 5 is blind and the weekly ritual is fiction |
| Homepage launch pass (hero + 60-90s demo video + how-it-works + integrations grid + template rail + pricing link + FAQ) | 2-3 days | First impression for all launch traffic; current homepage is minimal |
| Demo video (60-90s screen capture, captioned) + 6-10 banked demo clips | 1-2 days | PH gallery, homepage hero, and week-1 social all depend on it |
| Launch posts drafted per channel (PH copy + first comment, X thread, LinkedIn, IH, HN text, personal emails) | 1 day | Day-1 quality collapses if written on Day 1 |
| Support flow (support@ + in-app link + 15-20 core help docs: connect each major provider, build/test/activate, billing, limits) | 2-3 days | Launch-day confusion with no help surface burns the only first impressions we get |
| Legal hygiene (ToS, privacy, cookie notice verified current) | 0.5 day | OAuth provider requirements + basic trust |

### HIGH LEVERAGE (ship in Week 0 if possible, else days 1-14)

| Asset | Effort | Why it matters |
|---|---|---|
| SEO foundation: sitemap.xml, robots.txt, OpenGraph/Twitter cards (esp. per-template OG images), llms.txt | 0.5-1 day | Zero-cost multiplier on every link ever shared; currently absent |
| Onboarding email sequence (5 emails keyed to funnel stage: welcome/golden path → connect nudge → first-run nudge → success/next template → founding offer) | 1-2 days | Directly attacks the three biggest funnel leaks; email is owned distribution |
| In-app activation checklist (connect an app → use a template → test run → activate) | 1-2 days | Makes the golden path visible in-product; pairs with TTFR metric |
| Usage meter UI (tasks + AI credits consumed) | 2-3 days | Users will not pay for invisible limits; prerequisite for honest upgrade moments |
| Comparison pages ×3 (vs Zapier, vs Make, vs n8n) | 2-3 days | Sales collateral immediately, SEO asset over time |
| Integration landing pages ×29 (template per provider) | 2-3 days | Bottom-funnel SEO + destination for provider-specific content and clips |
| "Where did you hear about us?" free-text on signup | 0.5 day | Catches dark-social attribution UTMs miss |
| Founding-member offer mechanics (numbered counter, lifetime discount via Stripe coupon) | 1 day | Day-1 monetization urgency without LTD downsides |

### LATER (deliberately not now)

| Asset | Earliest | Why later |
|---|---|---|
| Referral program | Day 60+ | Amplifies nothing until activation and paid conversion are proven (Section 6 Loop 5 gates) |
| Affiliate program + tooling | Day 60+ | Same gate as referral, plus partner goodwill is spent if funnel doesn't convert |
| Blog beyond the ~8 launch-window PAGEs | Day 30+ | SEO latency; cornerstone pages first, cadence later |
| Community template submission review flow | Day 30-60 | Needs a base of users who can author quality templates |
| Public creator profile pages | Day 30-60 | Follows community templates |
| "Powered by ChainReact" surfaces | Day 90+ | Weak surface for workflow tools (outputs live inside users' private apps) |
| Status page / trust center | Day 60+ | Nice for ICP-2 sales later; not launch-critical |
| Case-study pages ×3 | Day 30-45 | Requires design partners to have real results first |
| Second PH launch assets | Day 60-90 | Tied to a genuinely new feature release |

---

## 14. Final Recommendation and Priorities

### The plan in three sentences

First, spend the 2-4 week runway making the funnel real: pricing page, public template gallery, instrumentation, onboarding, demo assets, and 20-30 hand-recruited beta users producing testimonials and funnel data. Second, launch loudly but with sober expectations (launch day is a starting gun, not the strategy) and convert the attention into activated users through founder-intensive onboarding, a founding-member offer, and a daily fix-the-biggest-leak ritual. Third, from Day 8 onward, put every available hour into the two compounding systems this market demonstrably rewards (the template/content library and the demo-clip social loop) while running the Section 5 experiment cards and killing losers on schedule.

### Do first / second / third

1. FIRST (this week): Section 13 Blockers. Nothing else matters until a visitor can see pricing, browse templates without logging in, and be measured through the funnel.
2. SECOND (rest of Week 0): beta cohort + channel warmup + launch assets + credit applications (one afternoon, Section 7).
3. THIRD (Day 1 and onward): launch sequence (Section 4), then the weekly experiment/metrics ritual (Section 9) drives everything else.

### Highest-leverage 10 actions for the first week (Week 0, day 1-7)

1. Ship the public pricing page with the founding-member offer and the three pricing promises (Section 10).
2. Make the template gallery publicly browsable with per-template OG cards, titles, and sitemap (Section 13 Blocker; unlocks CH-7, HN artifact, and all social CTAs).
3. Wire PostHog + UTM discipline + "where did you hear about us?" free-text on signup.
4. Record the 60-90s master demo video and bank 10 short demo clips.
5. Create all accounts (X Premium, LinkedIn, YouTube, TikTok, PH maker + Coming Soon teaser, IH, Reddit) and start the Reddit account aging with helpful comments only.
6. Hand-recruit the first 10 beta users; watch 5 onboard live; fix the top activation blocker found.
7. Submit BetaList (2-4 month free queue means Week 0 submission lands near launch) and stand up the G2 profile.
8. Spend one afternoon on credit applications: Supabase, Cloudflare ($10k), Google ($2k), Microsoft ($5k path), AWS ($1k), Notion; start the Verizon Digital Ready courses.
9. Publish the first 3 build-in-public posts (X + LinkedIn) documenting the road to launch with real screenshots and numbers.
10. Ship the 5-email onboarding sequence + in-app activation checklist keyed to the funnel stages.

### Highest-leverage 10 actions for the first month (Days 1-30)

1. Execute the Day 1 sequence (Section 4) with the founder present all day; then the Show HN on the first Sunday evening.
2. Run the daily funnel review for the first 7 days; ship one leak fix per day.
3. Talk to every activated user: 15-minute calls or async Looms; extract testimonials, template requests, and the words they use (that language becomes the copy).
4. Hold the content cadence: 4-5 demo clips + 2 written posts + 1 SEO page per week (Section 11 calendar), everything cross-posted, links in first replies on X.
5. Publish the 3 comparison pages and all 29 integration pages (with real content only).
6. Establish the 30-min/day Reddit answering habit in target subreddits, always disclosing.
7. Send 10-15 personalized agency outreaches/week; land 5 design-partner agencies.
8. Post the weekly transparent metrics update (X + IH + LinkedIn); it is both accountability and content.
9. Close the first 10-30 founding-member customers; number them publicly; ask each for a G2 review.
10. Run the Day-30 channel scorecard against the Section 5 kill criteria and write the month-2 plan from it.

### What to ignore (reconciled with research)

Everything in Section 15, plus specifically research-confirmed traps: AppSumo/LTDs (Section 7 economics), thin programmatic pair pages at scale (Google's scaled-content policy, Section 5 CH-8), llms.txt as a priority (97% of llms.txt files get zero bot traffic; Google calls it speculative), paid directory placements ($347 TAAFT listing), X ads (0.69% conversion benchmark), accelerator applications as funding, and any channel whose numbers you cannot trace to activated users.

---

## 15. Do Not Do Yet (Plausible but Wasteful Before Product-Market Proof)

- Broad paid ads (search head terms, Meta prospecting, brand campaigns): burns cash discovering what session replays reveal for free. Gate: Section 8.
- Generic PR (press releases, TechCrunch pitching, PR agencies): automation tools are not news; effort-to-activated-user ratio is terrible at this stage.
- Overbuilt affiliate/referral systems: commissions on a funnel that doesn't convert; both are Day 60+ behind explicit gates.
- Enterprise chasing (security questionnaires, procurement, custom contracts): months of founder time for one logo that churns when the SLA doesn't exist. First 12 months: no.
- Paid directory placements and "featured" slots: free tiers only.
- Conference sponsorships / event booths: cost and time profile of paid ads with worse measurement.
- Heavy influencer deals: seed free accounts + template packs instead; pay only after organic evidence a creator's audience converts.
- Building new integrations reactively for segments outside ICP-1/2/3: integration roadmap follows the ICP promotion triggers in Section 2, not one-off requests.
- Multi-channel paid tooling (attribution suites, CDPs, marketing automation platforms): PostHog + UTMs + a spreadsheet until well past $10k MRR.
- A company LinkedIn/X page strategy: personal founder accounts get the reach; company pages are parked placeholders for now.

---

## Day 1 Launch Checklist

Pre-flight (all YES before announcing; these are the Section 13 Blockers):
- [ ] Pricing page live with founding-member counter
- [ ] Template gallery publicly browsable; OG cards render correctly when links are pasted into X/LinkedIn/Discord
- [ ] Signup → template → connect → test run golden path walked by 3 fresh accounts without a hitch
- [ ] Funnel events firing in PostHog; UTMs on every prepared link; "where did you hear about us?" live
- [ ] Demo video + 10 clips banked; PH gallery assets uploaded; teaser page has its subscriber base
- [ ] All launch posts drafted (PH first comment, X thread, LinkedIn post, IH post, HN text for later, 30-50 personal notes)
- [ ] Onboarding emails firing; support@ monitored; help docs cover connect/build/test/billing
- [ ] Status/run-failure notifications working (launch-day errors WILL happen; users must see honest errors)

Launch day timeline (PT):
- [ ] 12:01 AM: PH launch live; first comment posted (maker story + one specific feedback ask)
- [ ] 12:05 AM: notify the 30-60 supporter list (honest comments, not vote-begging)
- [ ] 7-9 AM: X launch thread (demo clip; link in first reply) + LinkedIn launch post + IH launch post
- [ ] 9 AM-12 PM: 30-50 personal emails/DMs, individually written
- [ ] All day: reply to every PH comment/DM/email within the hour; personally onboard anyone who wobbles
- [ ] 8-10 PM: transparent Day-1 numbers post on X/IH
- [ ] EOD: record in the metrics sheet: visitors, signups, A1/A2 counts, founding members, by source

Rules of the day: no Reddit promotion (the account keeps helping, not launching), no paid anything, founder talks to users over watching the upvote count.

## First 30 Days Execution Calendar

Daily non-negotiables (60-90 min total): answer every user message; 30 min Reddit answers; 1 X interaction block (replies > posts); log yesterday's funnel numbers.

| Week | Theme | Shipping | Channel actions | Success check (end of week) |
|---|---|---|---|---|
| Week 1 (Days 1-7) | Launch + listen | Daily leak fixes from funnel review; testimonial collection | Day 1 sequence; Show HN Sunday 7pm ET; daily demo clip; directory batch; personal onboarding for every signup | 10-40 activated users; 10 user conversations done; biggest funnel leak identified and fixed |
| Week 2 (Days 8-14) | Convert attention into systems | 3 comparison pages; first integration pages; usage meter if not done | Content calendar days 8-14; launch-week retro post (IH/X); first newsletter/community pitches; agency outreach begins (10-15) | Content cadence held; 2+ agency conversations; founding members >10 |
| Week 3 (Days 15-21) | ICP-2 push + SEO wave 1 | All 29 integration pages live; case-study interviews with design partners | Calendar days 15-21; LinkedIn carousel teardown; 10-15 more agency outreaches; second value post in one subreddit | 5 design-partner agencies committed; integration pages indexed (Search Console) |
| Week 4 (Days 22-30) | Triage + double down | Community template publishing spec (Loop 4); first case study drafted | Calendar days 22-30; Day-30 transparent recap post; channel scorecard against Section 5 kill criteria | Day-30 targets (Section 4) assessed honestly; month-2 plan written: 2 channels doubled, laggards killed |

## Sources

Competitor pricing and positioning (all fetched 2026-07-08 unless dated): [Zapier pricing](https://zapier.com/pricing) · [Make pricing](https://www.make.com/en/pricing) · [n8n pricing](https://n8n.io/pricing) · [IFTTT plans](https://ifttt.com/plans) · [Relay.app pricing](https://www.relay.app/pricing) · [Gumloop pricing](https://www.gumloop.com/pricing) · [Lindy pricing](https://www.lindy.ai/pricing) · [Pipedream docs](https://pipedream.com/docs/pricing) · [Power Automate pricing](https://www.microsoft.com/en-us/power-platform/products/power-automate/pricing) · [Airtable plans](https://support.airtable.com/docs/airtable-plans) · [Bardeen homepage](https://www.bardeen.ai) + [Voiceflow on the Bardeen pivot](https://www.voiceflow.com/blog/bardeen-ai) · [Make community credit-billing thread](https://community.make.com/t/credit-based-billing-a-jab-to-non-enterprise-creators/90182) · [StartupOwl Zapier review](https://startupowl.com/reviews/zapier) · [StartupOwl n8n review](https://startupowl.com/reviews/n8n) · [Zapier overage help doc](https://help.zapier.com/hc/en-us/articles/15279018245901-How-pay-per-task-billing-works-in-Zapier)

Market and momentum: [Mordor Intelligence workflow automation](https://www.mordorintelligence.com/industry-reports/workflow-automation-market) · [n8n Series C](https://blog.n8n.io/series-c/) · [n8n x SAP announcement](https://blog.n8n.io/n8n-sap/) + [PR Newswire](https://www.prnewswire.co.uk/news-releases/n8n-valuation-doubles-to-5-2bn-as-sap-makes-strategic-investment-and-plans-to-embed-the-ai-platform-into-joule-studio-302767227.html) · [Sacra n8n](https://sacra.com/c/n8n/) · [Gumloop Series B](https://www.gumloop.com/blog/series-b) · [OpenAI AgentKit](https://openai.com/index/introducing-agentkit/) + [AgentKit deprecation report](https://mcp.directory/blog/openai-agentkit-deprecation-2026) · [Make AI Agents](https://www.make.com/en/blog/make-ai-agents)

Launch channels: [Show HN rules](https://news.ycombinator.com/showhn.html) · [Show HN by the numbers (188k posts)](https://danfking.github.io/blog/2026/04/23/show-hn-by-the-numbers/) · [Sturdy Statistics Show HN analysis](https://blog.sturdystatistics.com/posts/show_hn/) · [Aidlab HN postmortem](https://www.indiehackers.com/post/front-page-of-hn-the-full-postmortem-traffic-lessons-surprises-cbe9e0a7f6) · [shno.co PH statistics](https://www.shno.co/marketing-statistics/product-hunt-launch-statistics) · [PH Coming Soon help](https://help.producthunt.com/en/articles/6684724) · [PH launch case numbers](https://www.marketingideas.com/p/how-to-successfully-launch-on-product) · [Reddit self-promo norms](https://redship.io/blog/reddit-self-promotion-rules) · [OneUp Reddit case study](https://oneup.today/reddit-first-users-case-study) · [X algorithm analysis (OpenTweet)](https://opentweet.io/blog/how-twitter-x-algorithm-works-2026) · [X engagement weights (PostEverywhere)](https://posteverywhere.ai/blog/how-the-x-twitter-algorithm-works) · [LinkedIn Algorithm InSights 2025](https://www.linkedin.com/posts/richardvanderblom_chapter-1-algorithm-insights-report-2025-activity-7322514599126130688-Q895) · [Nate Herk channel stats (vidIQ)](https://vidiq.com/youtube-stats/channel/@nateherk/) · [BetaList FAQ](https://betalist.com/faq)

SEO/GEO and loops: [Ahrefs Zapier SEO case study](https://ahrefs.com/blog/zapier-seo-case-study/) · [Foundation Inc Zapier study](https://foundationinc.co/lab/seo-strategy-zapier) · [Search Engine Land: how long SEO takes](https://searchengineland.com/guide/how-long-does-seo-take-to-work) · [Amsive on 2024 helpful-content/scaled-content](https://www.amsive.com/insights/seo/googles-helpful-content-update-ranking-system-what-happened-and-what-changed-in-2024/) · [n8n workflows gallery](https://n8n.io/workflows/) · [G2 Answer Economy survey](https://www.prnewswire.com/news-releases/new-g2-research-half-of-b2b-software-buyers-now-start-their-research-with-ai-chatbots-302742807.html) · [martech.org SaaS in AI search](https://martech.org/saas-in-ai-search/) · [Semrush most-cited domains in AI](https://www.semrush.com/blog/most-cited-domains-ai/) · [SEL: AI citations favor listicles](https://searchengineland.com/ai-citations-favor-listicles-articles-product-pages-study-472364) · [Wix AI Search Lab content types](https://www.wix.com/studio/ai-search-lab/research/content-types-most-cited-by-llms) · [SEJ: Google on llms.txt](https://www.searchenginejournal.com/google-says-llms-txt-is-purely-speculative-for-now/577576/) · [GrowSurf SaaS referral statistics](https://growsurf.com/statistics/saas-referral-statistics/) · [Rewardful SaaS affiliate benchmarks](https://www.rewardful.com/articles/saas-affiliate-program-benchmarks) · [Make affiliate program](https://help.make.com/affiliate-program) · [n8n affiliates](https://n8n.io/affiliates/) · [n8n partners](https://n8n.io/partners/)

Funding and benchmarks: [Microsoft for Startups overview](https://learn.microsoft.com/en-us/startups/microsoft-for-startups/overview) + [program changes](https://learn.microsoft.com/en-us/startups/changes-microsoft-for-startups) · [AWS Activate](https://aws.amazon.com/startups/credits/) · [Google for Startups Cloud](https://cloud.google.com/startup/benefits) · [Cloudflare for Startups](https://www.cloudflare.com/startups/) · [Supabase startups](https://supabase.com/solutions/startups) · [Vercel startups credits](https://vercel.com/startups/credits) · [OpenAI startups](https://openai.com/startups/) · [Anthropic startup program terms](https://www.anthropic.com/startup-program-official-terms) · [HubSpot Bootstrap](https://www.hubspot.com/startups/bootstrap-program) · [Notion for Startups](https://www.notion.com/help/notion-for-startups) · [Stripe Atlas fee credits](https://support.stripe.com/questions/atlas-fee-credits-faq) · [AppSumo getting paid](https://sell.appsumo.com/g/getting-paid) · [ppc.land on AppSumo](https://ppc.land/appsumos-revenue-crashes-50-as-lifetime-deal-model-faces-existential-crisis/) · [AppSumo LTD founder retro](https://www.indiehackers.com/post/my-appsumo-campaign-zero-audience-362-paying-customers) · [YC deal](https://www.ycombinator.com/deal) · [TinySeed](https://tinyseed.com/program) · [Arch Grants](https://archgrants.org/programs/startup-competition/) · [Verizon Digital Ready](https://digitalready.verizonwireless.com/funding) · [Daydream freemium benchmarks](https://www.withdaydream.com/library/insights/freemium-conversion-rate) · [ProductLed benchmarks](https://productled.com/blog/product-led-growth-benchmarks) · [Userpilot conversion benchmarks](https://userpilot.com/blog/saas-average-conversion-rate/) · [Agile Growth Labs activation benchmarks](https://www.agilegrowthlabs.com/blog/user-activation-rate-benchmarks-2025/) · [beehiiv newsletter sponsorship costs](https://www.beehiiv.com/blog/newsletter-sponsorship-cost) · [AdLabz B2B SaaS Google Ads benchmarks](https://www.adlabz.co/b2b-saas-google-ads-benchmarks-for-2025) · [Understory Reddit ads guide](https://www.understoryagency.com/blog/effective-reddit-ads-guide) · [Improvado X ads guide](https://improvado.io/blog/twitter-ads-guide)

Source-quality note: official pricing pages and the measured datasets (188k Show HN posts, 1.8M LinkedIn posts, Semrush citation studies, Rewardful's 250-program report) are the strongest sources here. The launch-channel statistics ecosystem (shno, awesome-directories, daily.dev and similar) heavily cross-cites itself; those numbers are directional ranges, not facts. Anything single-source or unverifiable is flagged inline where it is used.
