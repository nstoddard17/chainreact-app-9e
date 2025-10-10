import { createClient } from "@supabase/supabase-js"
import path from "path"
import { fileURLToPath } from "url"
import dotenv from "dotenv"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, "../.env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const CENTER_X = 600
const Y_START = 100
const Y_STEP = 180
const BRANCH_SPACING = 400

function layoutNodes(nodes, connections) {
  const nodeMap = new Map(nodes.map(node => [node.id, node]))
  const outgoing = new Map()
  const indegree = new Map()

  nodes.forEach(node => {
    indegree.set(node.id, 0)
  })

  connections.forEach(conn => {
    if (!nodeMap.has(conn.source) || !nodeMap.has(conn.target)) {
      return
    }
    if (!outgoing.has(conn.source)) {
      outgoing.set(conn.source, [])
    }
    outgoing.get(conn.source).push(conn)
    indegree.set(conn.target, (indegree.get(conn.target) ?? 0) + 1)
  })

  const branchCandidates = new Map()
  connections.forEach(conn => {
    const source = conn.source
    const targetNode = nodeMap.get(conn.target)
    if (!targetNode) return

    let branchKey = null
    if (
      targetNode.data?.parentAIAgentId === source &&
      typeof targetNode.data?.parentChainIndex === 'number'
    ) {
      branchKey = `${source}:chain-${targetNode.data.parentChainIndex}`
    } else if (conn.sourceHandle) {
      branchKey = `${source}:handle-${conn.sourceHandle}`
    }

    if (branchKey) {
      if (!branchCandidates.has(source)) {
        branchCandidates.set(source, new Set())
      }
      branchCandidates.get(source).add(branchKey)
    }
  })

  const branchOffsets = new Map()
  branchCandidates.forEach((set, parentId) => {
    const keys = Array.from(set)
    keys.sort((a, b) => {
      const extract = (key) => {
        const parts = key.split(':')
        const suffix = parts[1] || ''
        const chainMatch = suffix.match(/chain-(\d+)/)
        if (chainMatch) return parseInt(chainMatch[1], 10)
        return suffix.charCodeAt(0)
      }
      return extract(a) - extract(b)
    })
    const offsets = new Map()
    const count = keys.length
    keys.forEach((key, index) => {
      const offsetIndex = index - (count - 1) / 2
      offsets.set(key, offsetIndex * BRANCH_SPACING)
    })
    branchOffsets.set(parentId, offsets)
  })

  const depth = new Map()
  const branchKeyMap = new Map()
  const indegreeCopy = new Map(indegree)
  const queue = []

  nodes.forEach(node => {
    const isTrigger = Boolean(node.data?.isTrigger)
    if (isTrigger || (indegreeCopy.get(node.id) ?? 0) === 0) {
      queue.push(node.id)
      depth.set(node.id, 0)
      if (!branchKeyMap.has(node.id)) {
        branchKeyMap.set(node.id, 'root')
      }
    }
  })

  while (queue.length > 0) {
    const nodeId = queue.shift()
    const currentDepth = depth.get(nodeId) ?? 0
    const currentBranch = branchKeyMap.get(nodeId) ?? 'root'
    const edges = outgoing.get(nodeId) || []

    for (const edge of edges) {
      const targetId = edge.target
      const targetNode = nodeMap.get(targetId)
      if (!targetNode) continue

      let nextBranch = currentBranch
      if (
        targetNode.data?.parentAIAgentId === edge.source &&
        typeof targetNode.data?.parentChainIndex === 'number'
      ) {
        nextBranch = `${edge.source}:chain-${targetNode.data.parentChainIndex}`
      } else if (edge.sourceHandle) {
        nextBranch = `${edge.source}:handle-${edge.sourceHandle}`
      }

      if (!branchKeyMap.has(targetId)) {
        branchKeyMap.set(targetId, nextBranch)
      }

      if (!depth.has(targetId) || depth.get(targetId) < currentDepth + 1) {
        depth.set(targetId, currentDepth + 1)
      }

      const remaining = (indegreeCopy.get(targetId) ?? 0) - 1
      indegreeCopy.set(targetId, remaining)
      if (remaining === 0) {
        queue.push(targetId)
      }
    }
  }

  nodes.forEach(node => {
    if (!depth.has(node.id)) {
      depth.set(node.id, 0)
    }
    if (!branchKeyMap.has(node.id)) {
      branchKeyMap.set(node.id, 'root')
    }
  })

  const nodePositions = new Map()
  const sortedNodes = [...nodes].sort((a, b) => {
    const depthDiff = (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0)
    if (depthDiff !== 0) return depthDiff
    return a.id.localeCompare(b.id)
  })

  sortedNodes.forEach(node => {
    const nodeDepth = depth.get(node.id) ?? 0
    const branchKey = branchKeyMap.get(node.id) ?? 'root'
    let x = CENTER_X

    if (branchKey !== 'root') {
      const [parentId] = branchKey.split(':')
      const parentPos = nodePositions.get(parentId)
      const parentX = parentPos ? parentPos.x : CENTER_X
      const offsets = branchOffsets.get(parentId)
      const offset = offsets?.get(branchKey) ?? 0
      x = parentX + offset
    } else if (node.data?.parentAIAgentId) {
      const parentPos = nodePositions.get(node.data.parentAIAgentId)
      if (parentPos) {
        x = parentPos.x
      }
    }

    const y = Y_START + nodeDepth * Y_STEP
    node.position = { x, y }
    nodePositions.set(node.id, { x, y })
  })

  return nodes
}

const templateUpdates = {
  // Content Publishing Workflow
  "df49e07b-11e2-4523-866a-c1924da2f04e": {
    nodes: [
      {
        id: "airtable-trigger-1",
        type: "custom",
        position: { x: 750, y: 50 },
        data: {
          type: "airtable_trigger_new_record",
          title: "New Content Submitted",
          description: "Content ready for review",
          isTrigger: true,
          providerId: "airtable",
          config: { baseId: "", tableName: "" },
          validationState: {
            missingRequired: ["baseId", "tableName"],
          },
        },
      },
      {
        id: "content-router",
        type: "custom",
        position: { x: 750, y: 240 },
        data: {
          type: "ai_router",
          title: "Route Content",
          description: "Categorize content for the best publishing channel",
          config: {
            template: "custom",
            systemPrompt:
              "You are an editorial operations assistant. Review the submitted content details and choose the best distribution path: blog_article, social_campaign, or newsletter_feature. Consider audience, tone, and readiness.",
            model: "gpt-4o-mini",
            apiSource: "chainreact",
            memory: "workflow",
            outputPaths: [
              {
                id: "blog_article",
                name: "Blog Article",
                description: "Long-form content suited for the blog",
                color: "#2563eb",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "social_campaign",
                name: "Social Campaign",
                description: "Short-form or promotional content for social media",
                color: "#f97316",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "newsletter_feature",
                name: "Newsletter Feature",
                description: "Content best suited for the upcoming newsletter",
                color: "#8b5cf6",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "manual_review",
                name: "Needs Review",
                description: "Unclear category; flag for manual review",
                color: "#6b7280",
                condition: { type: "fallback" },
              },
            ],
            decisionMode: "single",
            includeReasoning: true,
            temperature: 0.2,
            maxRetries: 1,
            timeout: 30,
            costLimit: 0.4,
          },
        },
      },
      {
        id: "blog-summary",
        type: "custom",
        position: { x: 250, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Draft",
          description: "Summarize the submitted content for blog planning",
          config: {
            inputText: "{{trigger.fields}}",
            maxLength: 260,
            style: "brief",
            focus: "audience, key message, call-to-action",
          },
        },
      },
      {
        id: "blog-article",
        type: "custom",
        position: { x: 250, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Draft Blog Article",
          description: "Create a polished blog-ready version of the content",
          config: {
            inputData: {
              sourceSummary: "{{node.blog-summary.output.summary}}",
              originalFields: "{{trigger.fields}}",
            },
            contentType: "report",
            tone: "professional",
            length: "long",
          },
        },
      },
      {
        id: "blog-title",
        type: "custom",
        position: { x: 250, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "Craft Blog Title",
          description: "Generate a compelling title for the blog post",
          config: {
            inputData: {
              summary: "{{node.blog-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-1-notion",
        type: "custom",
        position: { x: 250, y: 840 },
        data: {
          type: "notion_action_create_page",
          title: "Publish to Blog Database",
          description: "Add to the published blog posts database",
          providerId: "notion",
          config: {
            databaseId: "",
            title: "{{node.blog-title.output.content}}",
            content: "{{node.blog-article.output.content}}",
          },
          validationState: {
            missingRequired: ["databaseId"],
          },
        },
      },
      {
        id: "blog-notify",
        type: "custom",
        position: { x: 250, y: 980 },
        data: {
          type: "ai_action_generate",
          title: "Blog Announcement",
          description: "Draft a marketing-ready announcement for the new blog post",
          config: {
            inputData: {
              summary: "{{node.blog-summary.output.summary}}",
              title: "{{node.blog-title.output.content}}",
            },
            contentType: "response",
            tone: "friendly",
            length: "short",
          },
        },
      },
      {
        id: "chain-1-slack",
        type: "custom",
        position: { x: 250, y: 1120 },
        data: {
          type: "slack_action_send_message",
          title: "Notify Marketing Team",
          description: "Share blog highlights with marketing",
          providerId: "slack",
          config: {
            channelId: "",
            message: "{{node.blog-notify.output.content}}",
          },
          validationState: {
            missingRequired: ["channelId"],
          },
        },
      },
      {
        id: "social-summary",
        type: "custom",
        position: { x: 750, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize for Social",
          description: "Extract the core message for social promotion",
          config: {
            inputText: "{{trigger.fields}}",
            maxLength: 200,
            style: "bullet_points",
            focus: "hook, benefits, target persona",
          },
        },
      },
      {
        id: "social-caption",
        type: "custom",
        position: { x: 750, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Generate Social Caption",
          description: "Craft a social-ready caption with CTA",
          config: {
            inputData: {
              summary: "{{node.social-summary.output.summary}}",
            },
            contentType: "response",
            tone: "friendly",
            length: "short",
          },
        },
      },
      {
        id: "social-platform",
        type: "custom",
        position: { x: 750, y: 700 },
        data: {
          type: "ai_action_classify",
          title: "Select Platform",
          description: "Recommend the best social platform for this content",
          config: {
            inputText: "{{node.social-summary.output.summary}}",
            categories: [
              "LinkedIn",
              "Instagram",
              "Twitter/X",
              "Facebook",
              "TikTok",
              "YouTube",
            ],
            confidence: true,
          },
        },
      },
      {
        id: "social-schedule",
        type: "custom",
        position: { x: 750, y: 840 },
        data: {
          type: "ai_action_generate",
          title: "Schedule Recommendation",
          description: "Recommend when to publish the post",
          config: {
            inputData: {
              platform: "{{node.social-platform.output.classification}}",
              summary: "{{node.social-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-2-airtable",
        type: "custom",
        position: { x: 750, y: 980 },
        data: {
          type: "airtable_action_create_record",
          title: "Schedule Social Posts",
          description: "Create a record in the social calendar",
          providerId: "airtable",
          config: {
            baseId: "",
            tableName: "",
            fields: {
              Post: "{{node.social-caption.output.content}}",
              Platform: "{{node.social-platform.output.classification}}",
              Scheduled: "{{node.social-schedule.output.content}}",
            },
          },
          validationState: {
            missingRequired: ["baseId", "tableName"],
          },
        },
      },
      {
        id: "social-notify",
        type: "custom",
        position: { x: 750, y: 1120 },
        data: {
          type: "ai_action_generate",
          title: "Social Team Update",
          description: "Summarize what is scheduled for the social team",
          config: {
            inputData: {
              post: "{{node.social-caption.output.content}}",
              platform: "{{node.social-platform.output.classification}}",
              scheduled: "{{node.social-schedule.output.content}}",
            },
            contentType: "response",
            tone: "friendly",
            length: "short",
          },
        },
      },
      {
        id: "chain-2-slack",
        type: "custom",
        position: { x: 750, y: 1260 },
        data: {
          type: "slack_action_send_message",
          title: "Notify Social Team",
          description: "Send social rollout details",
          providerId: "slack",
          config: {
            channelId: "",
            message: "{{node.social-notify.output.content}}",
          },
          validationState: {
            missingRequired: ["channelId"],
          },
        },
      },
      {
        id: "newsletter-summary",
        type: "custom",
        position: { x: 1250, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize for Newsletter",
          description: "Summarize the content focusing on newsletter readers",
          config: {
            inputText: "{{trigger.fields}}",
            maxLength: 220,
            style: "brief",
            focus: "value proposition and key highlights",
          },
        },
      },
      {
        id: "newsletter-draft",
        type: "custom",
        position: { x: 1250, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Draft Newsletter Section",
          description: "Generate copy ready for newsletter inclusion",
          config: {
            inputData: {
              summary: "{{node.newsletter-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "friendly",
            length: "medium",
          },
        },
      },
      {
        id: "newsletter-title",
        type: "custom",
        position: { x: 1250, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "Create Newsletter Title",
          description: "Craft a strong subject-style title for the feature",
          config: {
            inputData: {
              summary: "{{node.newsletter-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "friendly",
            length: "short",
          },
        },
      },
      {
        id: "chain-3-airtable",
        type: "custom",
        position: { x: 1250, y: 840 },
        data: {
          type: "airtable_action_create_record",
          title: "Add to Newsletter Queue",
          description: "Store newsletter-ready content",
          providerId: "airtable",
          config: {
            baseId: "",
            tableName: "",
            fields: {
              Title: "{{node.newsletter-title.output.content}}",
              Content: "{{node.newsletter-draft.output.content}}",
              Status: "Queued",
            },
          },
          validationState: {
            missingRequired: ["baseId", "tableName"],
          },
        },
      },
      {
        id: "newsletter-notify",
        type: "custom",
        position: { x: 1250, y: 980 },
        data: {
          type: "ai_action_generate",
          title: "Newsletter Team Update",
          description: "Let the newsletter team know what is queued",
          config: {
            inputData: {
              title: "{{node.newsletter-title.output.content}}",
              summary: "{{node.newsletter-summary.output.summary}}",
            },
            contentType: "response",
            tone: "friendly",
            length: "short",
          },
        },
      },
      {
        id: "chain-3-slack",
        type: "custom",
        position: { x: 1250, y: 1120 },
        data: {
          type: "slack_action_send_message",
          title: "Notify Newsletter Team",
          description: "Share newsletter-ready copy and highlights",
          providerId: "slack",
          config: {
            channelId: "",
            message: "{{node.newsletter-notify.output.content}}",
          },
          validationState: {
            missingRequired: ["channelId"],
          },
        },
      },
    ],
    connections: [
      { id: "content-edge-0", source: "airtable-trigger-1", target: "content-router" },
      {
        id: "content-edge-1",
        source: "content-router",
        target: "blog-summary",
        sourceHandle: "blog_article",
      },
      { id: "content-edge-2", source: "blog-summary", target: "blog-article" },
      { id: "content-edge-3", source: "blog-article", target: "blog-title" },
      { id: "content-edge-4", source: "blog-title", target: "chain-1-notion" },
      { id: "content-edge-5", source: "blog-title", target: "blog-notify" },
      { id: "content-edge-6", source: "chain-1-notion", target: "blog-notify" },
      { id: "content-edge-7", source: "blog-notify", target: "chain-1-slack" },
      {
        id: "content-edge-8",
        source: "content-router",
        target: "social-summary",
        sourceHandle: "social_campaign",
      },
      { id: "content-edge-9", source: "social-summary", target: "social-caption" },
      { id: "content-edge-10", source: "social-caption", target: "social-platform" },
      { id: "content-edge-11", source: "social-platform", target: "social-schedule" },
      { id: "content-edge-12", source: "social-schedule", target: "chain-2-airtable" },
      { id: "content-edge-13", source: "chain-2-airtable", target: "social-notify" },
      { id: "content-edge-14", source: "social-notify", target: "chain-2-slack" },
      {
        id: "content-edge-15",
        source: "content-router",
        target: "newsletter-summary",
        sourceHandle: "newsletter_feature",
      },
      { id: "content-edge-16", source: "newsletter-summary", target: "newsletter-draft" },
      { id: "content-edge-17", source: "newsletter-draft", target: "newsletter-title" },
      { id: "content-edge-18", source: "newsletter-title", target: "chain-3-airtable" },
      { id: "content-edge-19", source: "chain-3-airtable", target: "newsletter-notify" },
      { id: "content-edge-20", source: "newsletter-notify", target: "chain-3-slack" },
    ],
  },
  // Smart Email Triage - Sales & Support Router
  "4242bf06-dc76-4e4d-8fe0-d9de01108713": {
    nodes: [
      {
        id: "gmail-trigger-1",
        type: "custom",
        position: { x: 750, y: 50 },
        data: {
          type: "gmail_trigger_new_email",
          title: "New Email Received",
          description: "Trigger on new Gmail messages",
          isTrigger: true,
          providerId: "gmail",
          config: {
            labelId: "INBOX",
            includeSpamTrash: false,
          },
        },
      },
      {
        id: "email-router",
        type: "custom",
        position: { x: 750, y: 240 },
        data: {
          type: "ai_router",
          title: "Classify Email Type",
          description: "Route email to sales, support, or internal teams",
          config: {
            template: "custom",
            systemPrompt:
              "You are an inbox assistant. Analyze the email and classify into sales_inquiry, support_request, or internal_update. sales_inquiry: prospects/customers asking about pricing or product. support_request: bug, issue, or troubleshooting. internal_update: colleagues or automated internal systems.",
            model: "gpt-4o-mini",
            apiSource: "chainreact",
            memory: "workflow",
            outputPaths: [
              {
                id: "sales_inquiry",
                name: "Sales Inquiry",
                description: "Potential lead requiring sales follow-up",
                color: "#22c55e",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "support_request",
                name: "Support Request",
                description: "Customer issue needing support",
                color: "#ef4444",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "internal_update",
                name: "Internal Update",
                description: "Internal communications or documents",
                color: "#3b82f6",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "manual_review",
                name: "Needs Review",
                description: "Unclear classification",
                color: "#6b7280",
                condition: { type: "fallback" },
              },
            ],
            decisionMode: "single",
            includeReasoning: true,
            temperature: 0.2,
            maxRetries: 1,
            timeout: 30,
            costLimit: 0.25,
          },
        },
      },
      // Sales branch
      {
        id: "sales-summary",
        type: "custom",
        position: { x: 240, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Sales Inquiry",
          description: "Summarize the sales interest",
          config: {
            inputText: "{{trigger.email.body}}",
            maxLength: 150,
            style: "brief",
            focus: "sender, product interest, timeline",
          },
        },
      },
      {
        id: "sales-email-address",
        type: "custom",
        position: { x: 240, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Extract Contact Email",
          description: "Provide sender email for CRM record",
          config: {
            inputData: {
              summary: "{{node.sales-summary.output.summary}}",
              headers: "{{trigger.email}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "sales-interest",
        type: "custom",
        position: { x: 240, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "Capture Interest",
          description: "Describe product interest or ask",
          config: {
            inputData: {
              summary: "{{node.sales-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "friendly",
            length: "medium",
          },
        },
      },
      {
        id: "sales-name",
        type: "custom",
        position: { x: 240, y: 840 },
        data: {
          type: "ai_action_generate",
          title: "Identify Lead Name",
          description: "Provide contact name for CRM",
          config: {
            inputData: {
              summary: "{{node.sales-summary.output.summary}}",
              original: "{{trigger.email}}",
            },
            contentType: "summary",
            tone: "friendly",
            length: "short",
          },
        },
      },
      {
        id: "chain-1-airtable",
        type: "custom",
        position: { x: 240, y: 980 },
        data: {
          type: "airtable_action_create_record",
          title: "Log Sales Lead",
          description: "Create CRM record for sales team",
          providerId: "airtable",
          config: {
            baseId: "",
            tableName: "",
            fields: {
              Email: "{{node.sales-email-address.output.content}}",
              Interest: "{{node.sales-interest.output.content}}",
              "Lead Name": "{{node.sales-name.output.content}}",
            },
          },
          validationState: { missingRequired: ["baseId", "tableName"] },
        },
      },
      {
        id: "sales-notification",
        type: "custom",
        position: { x: 240, y: 1120 },
        data: {
          type: "ai_action_generate",
          title: "Sales Slack Notification",
          description: "Draft Slack update for sales team",
          config: {
            inputData: {
              summary: "{{node.sales-summary.output.summary}}",
              email: "{{node.sales-email-address.output.content}}",
            },
            contentType: "response",
            tone: "friendly",
            length: "short",
          },
        },
      },
      {
        id: "chain-1-slack",
        type: "custom",
        position: { x: 240, y: 1260 },
        data: {
          type: "slack_action_send_message",
          title: "Notify Sales Team",
          description: "Post lead summary to sales Slack channel",
          providerId: "slack",
          config: {
            channelId: "",
            message: "{{node.sales-notification.output.content}}",
          },
          validationState: { missingRequired: ["channelId"] },
        },
      },
      // Support branch
      {
        id: "support-summary",
        type: "custom",
        position: { x: 750, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Support Request",
          description: "Summarize the support issue",
          config: {
            inputText: "{{trigger.email.body}}",
            maxLength: 150,
            style: "brief",
            focus: "issue, urgency, user context",
          },
        },
      },
      {
        id: "support-customer",
        type: "custom",
        position: { x: 750, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Identify Customer",
          description: "Provide customer name",
          config: {
            inputData: {
              summary: "{{node.support-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "support-issue",
        type: "custom",
        position: { x: 750, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "Describe Issue",
          description: "Create ticket-ready issue summary",
          config: {
            inputData: {
              summary: "{{node.support-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "medium",
          },
        },
      },
      {
        id: "support-ticket-id",
        type: "custom",
        position: { x: 750, y: 840 },
        data: {
          type: "ai_action_generate",
          title: "Generate Ticket Reference",
          description: "Create human-readable ticket identifier",
          config: {
            inputData: {
              summary: "{{node.support-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-2-airtable",
        type: "custom",
        position: { x: 750, y: 980 },
        data: {
          type: "airtable_action_create_record",
          title: "Create Support Ticket",
          description: "Log support ticket in Airtable",
          providerId: "airtable",
          config: {
            baseId: "",
            tableName: "",
            fields: {
              Issue: "{{node.support-issue.output.content}}",
              Customer: "{{node.support-customer.output.content}}",
              "Ticket ID": "{{node.support-ticket-id.output.content}}",
            },
          },
          validationState: { missingRequired: ["baseId", "tableName"] },
        },
      },
      {
        id: "support-alert",
        type: "custom",
        position: { x: 750, y: 1120 },
        data: {
          type: "ai_action_generate",
          title: "Support Slack Alert",
          description: "Draft alert for support channel",
          config: {
            inputData: {
              summary: "{{node.support-summary.output.summary}}",
              ticket: "{{node.support-ticket-id.output.content}}",
            },
            contentType: "response",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-2-slack",
        type: "custom",
        position: { x: 750, y: 1260 },
        data: {
          type: "slack_action_send_message",
          title: "Alert Support Team",
          description: "Send Slack message to support channel",
          providerId: "slack",
          config: {
            channelId: "",
            message: "{{node.support-alert.output.content}}",
          },
          validationState: { missingRequired: ["channelId"] },
        },
      },
      // Internal branch
      {
        id: "internal-summary",
        type: "custom",
        position: { x: 1260, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Internal Email",
          description: "Summarize internal communication",
          config: {
            inputText: "{{trigger.email.body}}",
            maxLength: 150,
            style: "brief",
            focus: "goal, action items, stakeholders",
          },
        },
      },
      {
        id: "internal-doc-title",
        type: "custom",
        position: { x: 1260, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Create Doc Title",
          description: "Generate Notion document title",
          config: {
            inputData: {
              summary: "{{node.internal-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "internal-doc-content",
        type: "custom",
        position: { x: 1260, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "Draft Doc Content",
          description: "Create structured notes for Notion",
          config: {
            inputData: {
              summary: "{{node.internal-summary.output.summary}}",
              emailBody: "{{trigger.email.body}}",
            },
            contentType: "report",
            tone: "professional",
            length: "medium",
          },
        },
      },
      {
        id: "chain-3-notion",
        type: "custom",
        position: { x: 1260, y: 840 },
        data: {
          type: "notion_action_create_page",
          title: "Create Internal Doc",
          description: "Store summary and actions in Notion",
          providerId: "notion",
          config: {
            databaseId: "",
            title: "{{node.internal-doc-title.output.content}}",
            content: "{{node.internal-doc-content.output.content}}",
          },
          validationState: { missingRequired: ["databaseId"] },
        },
      },
    ],
    connections: [
      { id: "email-edge-0", source: "gmail-trigger-1", target: "email-router" },
      {
        id: "email-edge-1",
        source: "email-router",
        target: "sales-summary",
        sourceHandle: "sales_inquiry",
      },
      { id: "email-edge-2", source: "sales-summary", target: "sales-email-address" },
      { id: "email-edge-3", source: "sales-email-address", target: "sales-interest" },
      { id: "email-edge-4", source: "sales-interest", target: "sales-name" },
      { id: "email-edge-5", source: "sales-name", target: "chain-1-airtable" },
      { id: "email-edge-6", source: "chain-1-airtable", target: "sales-notification" },
      { id: "email-edge-7", source: "sales-notification", target: "chain-1-slack" },
      {
        id: "email-edge-8",
        source: "email-router",
        target: "support-summary",
        sourceHandle: "support_request",
      },
      { id: "email-edge-9", source: "support-summary", target: "support-customer" },
      { id: "email-edge-10", source: "support-customer", target: "support-issue" },
      { id: "email-edge-11", source: "support-issue", target: "support-ticket-id" },
      { id: "email-edge-12", source: "support-ticket-id", target: "chain-2-airtable" },
      { id: "email-edge-13", source: "chain-2-airtable", target: "support-alert" },
      { id: "email-edge-14", source: "support-alert", target: "chain-2-slack" },
      {
        id: "email-edge-15",
        source: "email-router",
        target: "internal-summary",
        sourceHandle: "internal_update",
      },
      { id: "email-edge-16", source: "internal-summary", target: "internal-doc-title" },
      { id: "email-edge-17", source: "internal-doc-title", target: "internal-doc-content" },
      { id: "email-edge-18", source: "internal-doc-content", target: "chain-3-notion" },
    ],
  },
  // Social Media Sentiment Router
  "54be1b5b-e58f-43e5-b60d-d5da9ec7098f": {
    nodes: [
      {
        id: "discord-trigger-1",
        type: "custom",
        position: { x: 750, y: 50 },
        data: {
          type: "discord_trigger_new_message",
          title: "Community Mention",
          description: "Monitor community channel for mentions",
          isTrigger: true,
          config: {
            channelId: "",
            includeBot: false,
          },
          validationState: { missingRequired: ["channelId"] },
        },
      },
      {
        id: "sentiment-router",
        type: "custom",
        position: { x: 750, y: 240 },
        data: {
          type: "ai_router",
          title: "Classify Sentiment & Intent",
          description: "Determine sentiment and route to the right team",
          config: {
            template: "custom",
            systemPrompt:
              "You are a community operations assistant. Classify the message sentiment and intent into positive_signal, negative_signal, or general_conversation. Positive includes praise/testimonials. Negative includes complaints or issues. General covers neutral conversation or questions.",
            model: "gpt-4o-mini",
            apiSource: "chainreact",
            memory: "workflow",
            outputPaths: [
              {
                id: "positive_signal",
                name: "Positive Signal",
                description: "Shareable positive feedback",
                color: "#22c55e",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "negative_signal",
                name: "Negative Signal",
                description: "Complaints requiring support follow-up",
                color: "#ef4444",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "general_conversation",
                name: "General Conversation",
                description: "Neutral discussions or questions",
                color: "#3b82f6",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "manual_review",
                name: "Needs Review",
                description: "Unable to classify",
                color: "#6b7280",
                condition: { type: "fallback" },
              },
            ],
            decisionMode: "single",
            includeReasoning: true,
            temperature: 0.2,
            maxRetries: 1,
            timeout: 30,
            costLimit: 0.25,
          },
        },
      },
      // Positive branch
      {
        id: "positive-summary",
        type: "custom",
        position: { x: 240, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Positive Mention",
          description: "Summarize the praise to capture key points",
          config: {
            inputText: "{{trigger.message.content}}",
            maxLength: 150,
            style: "brief",
            focus: "user, product, main compliment",
          },
        },
      },
      {
        id: "positive-customer",
        type: "custom",
        position: { x: 240, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Identify Customer",
          description: "Determine the customer name or handle",
          config: {
            inputData: {
              original: "{{trigger.message}}",
              summary: "{{node.positive-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "friendly",
            length: "short",
          },
        },
      },
      {
        id: "positive-feedback",
        type: "custom",
        position: { x: 240, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "Highlight Feedback",
          description: "Create a shareable feedback quote",
          config: {
            inputData: {
              summary: "{{node.positive-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "friendly",
            length: "medium",
          },
        },
      },
      {
        id: "chain-1-airtable",
        type: "custom",
        position: { x: 240, y: 840 },
        data: {
          type: "airtable_action_create_record",
          title: "Save Testimonial",
          description: "Store positive feedback for marketing",
          providerId: "airtable",
          config: {
            baseId: "",
            tableName: "",
            fields: {
              Type: "Testimonial",
              Customer: "{{node.positive-customer.output.content}}",
              Feedback: "{{node.positive-feedback.output.content}}",
            },
          },
          validationState: { missingRequired: ["baseId", "tableName"] },
        },
      },
      {
        id: "positive-marketing",
        type: "custom",
        position: { x: 240, y: 980 },
        data: {
          type: "ai_action_generate",
          title: "Marketing Highlight",
          description: "Draft message to share with marketing",
          config: {
            inputData: {
              summary: "{{node.positive-summary.output.summary}}",
              customer: "{{node.positive-customer.output.content}}",
            },
            contentType: "response",
            tone: "friendly",
            length: "short",
          },
        },
      },
      {
        id: "chain-1-slack",
        type: "custom",
        position: { x: 240, y: 1120 },
        data: {
          type: "slack_action_send_message",
          title: "Share with Marketing",
          description: "Send highlight to marketing Slack channel",
          providerId: "slack",
          config: {
            channelId: "",
            message: "{{node.positive-marketing.output.content}}",
          },
          validationState: { missingRequired: ["channelId"] },
        },
      },
      // Negative branch
      {
        id: "negative-summary",
        type: "custom",
        position: { x: 750, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Negative Mention",
          description: "Summarize the complaint or problem",
          config: {
            inputText: "{{trigger.message.content}}",
            maxLength: 160,
            style: "brief",
            focus: "issue, impact, requested fix",
          },
        },
      },
      {
        id: "negative-customer",
        type: "custom",
        position: { x: 750, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Identify Customer",
          description: "Provide customer handle or name",
          config: {
            inputData: {
              summary: "{{node.negative-summary.output.summary}}",
              original: "{{trigger.message}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "negative-issue",
        type: "custom",
        position: { x: 750, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "Describe Issue",
          description: "Generate issue summary for ticket",
          config: {
            inputData: {
              summary: "{{node.negative-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "medium",
          },
        },
      },
      {
        id: "negative-priority",
        type: "custom",
        position: { x: 750, y: 840 },
        data: {
          type: "ai_action_classify",
          title: "Set Priority",
          description: "Assign priority based on sentiment and severity",
          config: {
            inputText: "{{node.negative-summary.output.summary}}",
            categories: ["Critical", "High", "Medium", "Low"],
            confidence: true,
          },
        },
      },
      {
        id: "chain-2-airtable",
        type: "custom",
        position: { x: 750, y: 980 },
        data: {
          type: "airtable_action_create_record",
          title: "Log Support Ticket",
          description: "Create support ticket for negative feedback",
          providerId: "airtable",
          config: {
            baseId: "",
            tableName: "",
            fields: {
              Issue: "{{node.negative-issue.output.content}}",
              Customer: "{{node.negative-customer.output.content}}",
              Priority: "{{node.negative-priority.output.classification}}",
            },
          },
          validationState: { missingRequired: ["baseId", "tableName"] },
        },
      },
      {
        id: "negative-alert",
        type: "custom",
        position: { x: 750, y: 1120 },
        data: {
          type: "ai_action_generate",
          title: "Support Alert Message",
          description: "Compose Slack alert for support team",
          config: {
            inputData: {
              summary: "{{node.negative-summary.output.summary}}",
              priority: "{{node.negative-priority.output.classification}}",
            },
            contentType: "response",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-2-slack",
        type: "custom",
        position: { x: 750, y: 1260 },
        data: {
          type: "slack_action_send_message",
          title: "Alert Support Team",
          description: "Notify support channel of negative feedback",
          providerId: "slack",
          config: {
            channelId: "",
            message: "{{node.negative-alert.output.content}}",
          },
          validationState: { missingRequired: ["channelId"] },
        },
      },
      // Neutral branch
      {
        id: "neutral-summary",
        type: "custom",
        position: { x: 1260, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Discussion",
          description: "Summarize general discussion for tracking",
          config: {
            inputText: "{{trigger.message.content}}",
            maxLength: 140,
            style: "brief",
            focus: "topic, question, context",
          },
        },
      },
      {
        id: "neutral-user",
        type: "custom",
        position: { x: 1260, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Identify User",
          description: "Provide user handle for record",
          config: {
            inputData: {
              original: "{{trigger.message}}",
            },
            contentType: "summary",
            tone: "friendly",
            length: "short",
          },
        },
      },
      {
        id: "neutral-topic",
        type: "custom",
        position: { x: 1260, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "Identify Topic",
          description: "Supply topic keywords for tracking",
          config: {
            inputData: {
              summary: "{{node.neutral-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-3-airtable",
        type: "custom",
        position: { x: 1260, y: 840 },
        data: {
          type: "airtable_action_create_record",
          title: "Log Discussion",
          description: "Track general community discussion",
          providerId: "airtable",
          config: {
            baseId: "",
            tableName: "",
            fields: {
              Type: "Discussion",
              User: "{{node.neutral-user.output.content}}",
              Topic: "{{node.neutral-topic.output.content}}",
            },
          },
          validationState: { missingRequired: ["baseId", "tableName"] },
        },
      },
    ],
    connections: [
      { id: "sentiment-edge-0", source: "discord-trigger-1", target: "sentiment-router" },
      {
        id: "sentiment-edge-1",
        source: "sentiment-router",
        target: "positive-summary",
        sourceHandle: "positive_signal",
      },
      { id: "sentiment-edge-2", source: "positive-summary", target: "positive-customer" },
      { id: "sentiment-edge-3", source: "positive-customer", target: "positive-feedback" },
      { id: "sentiment-edge-4", source: "positive-feedback", target: "chain-1-airtable" },
      { id: "sentiment-edge-5", source: "chain-1-airtable", target: "positive-marketing" },
      { id: "sentiment-edge-6", source: "positive-marketing", target: "chain-1-slack" },
      {
        id: "sentiment-edge-7",
        source: "sentiment-router",
        target: "negative-summary",
        sourceHandle: "negative_signal",
      },
      { id: "sentiment-edge-8", source: "negative-summary", target: "negative-customer" },
      { id: "sentiment-edge-9", source: "negative-customer", target: "negative-issue" },
      { id: "sentiment-edge-10", source: "negative-issue", target: "negative-priority" },
      { id: "sentiment-edge-11", source: "negative-priority", target: "chain-2-airtable" },
      { id: "sentiment-edge-12", source: "chain-2-airtable", target: "negative-alert" },
      { id: "sentiment-edge-13", source: "negative-alert", target: "chain-2-slack" },
      {
        id: "sentiment-edge-14",
        source: "sentiment-router",
        target: "neutral-summary",
        sourceHandle: "general_conversation",
      },
      { id: "sentiment-edge-15", source: "neutral-summary", target: "neutral-user" },
      { id: "sentiment-edge-16", source: "neutral-user", target: "neutral-topic" },
      { id: "sentiment-edge-17", source: "neutral-topic", target: "chain-3-airtable" },
    ],
  },
  // Bug Triage & Assignment System
  "4de2f32d-df55-4d43-b431-99622035f827": {
    nodes: [
      {
        id: "discord-trigger-1",
        type: "custom",
        position: { x: 750, y: 50 },
        data: {
          type: "discord_trigger_new_message",
          title: "Bug Report Channel",
          description: "Monitor bug intake channel",
          isTrigger: true,
          config: {
            channelId: "",
            includeBot: false,
          },
          validationState: { missingRequired: ["channelId"] },
        },
      },
      {
        id: "bug-router",
        type: "custom",
        position: { x: 750, y: 240 },
        data: {
          type: "ai_router",
          title: "Classify Bug Severity",
          description: "Determine severity and team assignment",
          config: {
            template: "custom",
            systemPrompt:
              "You are an engineering triage assistant. Review the bug report message and classify into critical, high, or routine. Use critical for outages/security, high for major feature breakages, routine for normal bugs.",
            model: "gpt-4o-mini",
            apiSource: "chainreact",
            memory: "workflow",
            outputPaths: [
              {
                id: "critical_bug",
                name: "Critical Bug",
                description: "Critical incident requiring immediate action",
                color: "#dc2626",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "high_priority",
                name: "High Priority",
                description: "High priority but not critical",
                color: "#f97316",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "routine_bug",
                name: "Routine Bug",
                description: "Standard backlog bug",
                color: "#22c55e",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "manual_review",
                name: "Manual Review",
                description: "Unable to classify",
                color: "#6b7280",
                condition: { type: "fallback" },
              },
            ],
            decisionMode: "single",
            includeReasoning: true,
            temperature: 0.15,
            maxRetries: 1,
            timeout: 30,
            costLimit: 0.25,
          },
        },
      },
      // Critical branch
      {
        id: "critical-summary",
        type: "custom",
        position: { x: 240, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Critical Bug",
          description: "Summarize the critical incident details",
          config: {
            inputText: "{{trigger.message.content}}",
            maxLength: 180,
            style: "brief",
            focus: "impact, steps to reproduce, affected users",
          },
        },
      },
      {
        id: "critical-title",
        type: "custom",
        position: { x: 240, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Generate Incident Title",
          description: "Create concise incident title",
          config: {
            inputData: {
              summary: "{{node.critical-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "critical-details",
        type: "custom",
        position: { x: 240, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "Draft Incident Details",
          description: "Generate structured bug report details",
          config: {
            inputData: {
              summary: "{{node.critical-summary.output.summary}}",
              original: "{{trigger.message.content}}",
            },
            contentType: "report",
            tone: "professional",
            length: "medium",
          },
        },
      },
      {
        id: "chain-1-notion",
        type: "custom",
        position: { x: 240, y: 840 },
        data: {
          type: "notion_action_create_page",
          title: "Log Critical Bug",
          description: "Create incident entry in Notion",
          providerId: "notion",
          config: {
            databaseId: "",
            title: "{{node.critical-title.output.content}}",
            content: "{{node.critical-details.output.content}}",
          },
          validationState: { missingRequired: ["databaseId"] },
        },
      },
      {
        id: "critical-alert",
        type: "custom",
        position: { x: 240, y: 980 },
        data: {
          type: "ai_action_generate",
          title: "Critical Alert Message",
          description: "Draft alert for incident channel",
          config: {
            inputData: {
              summary: "{{node.critical-summary.output.summary}}",
            },
            contentType: "response",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-1-slack",
        type: "custom",
        position: { x: 240, y: 1120 },
        data: {
          type: "slack_action_send_message",
          title: "Alert Incident Channel",
          description: "Send alert to incident Slack channel",
          providerId: "slack",
          config: {
            channelId: "",
            message: "{{node.critical-alert.output.content}}",
          },
          validationState: { missingRequired: ["channelId"] },
        },
      },
      // High priority branch
      {
        id: "high-summary",
        type: "custom",
        position: { x: 750, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize High Priority Bug",
          description: "Summarize issue for engineering triage",
          config: {
            inputText: "{{trigger.message.content}}",
            maxLength: 160,
            style: "brief",
            focus: "severity, repro steps, affected area",
          },
        },
      },
      {
        id: "high-title",
        type: "custom",
        position: { x: 750, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Generate Bug Title",
          description: "Create title for bug ticket",
          config: {
            inputData: {
              summary: "{{node.high-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "high-details",
        type: "custom",
        position: { x: 750, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "Generate Bug Details",
          description: "Draft detailed bug report",
          config: {
            inputData: {
              summary: "{{node.high-summary.output.summary}}",
              original: "{{trigger.message.content}}",
            },
            contentType: "report",
            tone: "professional",
            length: "medium",
          },
        },
      },
      {
        id: "chain-2-notion",
        type: "custom",
        position: { x: 750, y: 840 },
        data: {
          type: "notion_action_create_page",
          title: "Log High Priority Bug",
          description: "Create Notion entry for bug triage",
          providerId: "notion",
          config: {
            databaseId: "",
            title: "{{node.high-title.output.content}}",
            content: "{{node.high-details.output.content}}",
          },
          validationState: { missingRequired: ["databaseId"] },
        },
      },
      {
        id: "high-team-notify",
        type: "custom",
        position: { x: 750, y: 980 },
        data: {
          type: "ai_action_generate",
          title: "Notify Engineering Team",
          description: "Craft Slack message for engineering channel",
          config: {
            inputData: {
              summary: "{{node.high-summary.output.summary}}",
            },
            contentType: "response",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-2-slack",
        type: "custom",
        position: { x: 750, y: 1120 },
        data: {
          type: "slack_action_send_message",
          title: "Notify Engineering",
          description: "Send bug summary to engineering Slack",
          providerId: "slack",
          config: {
            channelId: "",
            message: "{{node.high-team-notify.output.content}}",
          },
          validationState: { missingRequired: ["channelId"] },
        },
      },
      // Routine branch
      {
        id: "routine-summary",
        type: "custom",
        position: { x: 1260, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Routine Bug",
          description: "Summarize routine bug for backlog",
          config: {
            inputText: "{{trigger.message.content}}",
            maxLength: 140,
            style: "brief",
            focus: "feature area, repro steps, priority suggestion",
          },
        },
      },
      {
        id: "routine-title",
        type: "custom",
        position: { x: 1260, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Create Backlog Title",
          description: "Generate backlog-friendly title",
          config: {
            inputData: {
              summary: "{{node.routine-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "routine-details",
        type: "custom",
        position: { x: 1260, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "Draft Backlog Details",
          description: "Draft details for backlog entry",
          config: {
            inputData: {
              summary: "{{node.routine-summary.output.summary}}",
              original: "{{trigger.message.content}}",
            },
            contentType: "report",
            tone: "professional",
            length: "medium",
          },
        },
      },
      {
        id: "chain-3-notion",
        type: "custom",
        position: { x: 1260, y: 840 },
        data: {
          type: "notion_action_create_page",
          title: "Log Routine Bug",
          description: "Add bug to backlog",
          providerId: "notion",
          config: {
            databaseId: "",
            title: "{{node.routine-title.output.content}}",
            content: "{{node.routine-details.output.content}}",
          },
          validationState: { missingRequired: ["databaseId"] },
        },
      },
    ],
    connections: [
      { id: "bug-edge-0", source: "discord-trigger-1", target: "bug-router" },
      {
        id: "bug-edge-1",
        source: "bug-router",
        target: "critical-summary",
        sourceHandle: "critical_bug",
      },
      { id: "bug-edge-2", source: "critical-summary", target: "critical-title" },
      { id: "bug-edge-3", source: "critical-title", target: "critical-details" },
      { id: "bug-edge-4", source: "critical-details", target: "chain-1-notion" },
      { id: "bug-edge-5", source: "chain-1-notion", target: "critical-alert" },
      { id: "bug-edge-6", source: "critical-alert", target: "chain-1-slack" },
      {
        id: "bug-edge-7",
        source: "bug-router",
        target: "high-summary",
        sourceHandle: "high_priority",
      },
      { id: "bug-edge-8", source: "high-summary", target: "high-title" },
      { id: "bug-edge-9", source: "high-title", target: "high-details" },
      { id: "bug-edge-10", source: "high-details", target: "chain-2-notion" },
      { id: "bug-edge-11", source: "chain-2-notion", target: "high-team-notify" },
      { id: "bug-edge-12", source: "high-team-notify", target: "chain-2-slack" },
      {
        id: "bug-edge-13",
        source: "bug-router",
        target: "routine-summary",
        sourceHandle: "routine_bug",
      },
      { id: "bug-edge-14", source: "routine-summary", target: "routine-title" },
      { id: "bug-edge-15", source: "routine-title", target: "routine-details" },
      { id: "bug-edge-16", source: "routine-details", target: "chain-3-notion" },
    ],
  },
  // Lead Qualification & CRM Update
  "1d6b7462-eb2f-4578-88cd-01603bedff8a": {
    nodes: [
      {
        id: "airtable-trigger-1",
        type: "custom",
        position: { x: 750, y: 50 },
        data: {
          type: "airtable_trigger_new_record",
          title: "New Lead Captured",
          description: "Lead added to CRM funnel",
          isTrigger: true,
          providerId: "airtable",
          config: { baseId: "", tableName: "" },
          validationState: { missingRequired: ["baseId", "tableName"] },
        },
      },
      {
        id: "lead-router",
        type: "custom",
        position: { x: 750, y: 240 },
        data: {
          type: "ai_router",
          title: "Score & Route Lead",
          description: "Classify lead into hot, warm, or nurture",
          config: {
            template: "custom",
            systemPrompt:
              "You are a revenue ops assistant. Review the lead details (company size, budget, urgency, engagement) and classify into hot_lead, warm_lead, or nurture_lead. hot_lead should represent high intent and urgency, warm_lead is promising but needs outreach, nurture_lead goes to slower nurture track.",
            model: "gpt-4o-mini",
            apiSource: "chainreact",
            memory: "workflow",
            outputPaths: [
              {
                id: "hot_lead",
                name: "Hot Lead",
                description: "Immediate follow-up required",
                color: "#ef4444",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "warm_lead",
                name: "Warm Lead",
                description: "Schedule call / nurture",
                color: "#f97316",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "nurture_lead",
                name: "Nurture Lead",
                description: "Add to nurture track",
                color: "#6366f1",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "manual_review",
                name: "Manual Review",
                description: "Needs manual scoring",
                color: "#6b7280",
                condition: { type: "fallback" },
              },
            ],
            decisionMode: "single",
            includeReasoning: true,
            temperature: 0.2,
            maxRetries: 1,
            timeout: 30,
            costLimit: 0.3,
          },
        },
      },
      // Hot lead branch
      {
        id: "hot-summary",
        type: "custom",
        position: { x: 240, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Hot Lead",
          description: "Summarize why the lead is hot",
          config: {
            inputText: "{{trigger.fields}}",
            maxLength: 150,
            style: "brief",
            focus: "buying signals and pain points",
          },
        },
      },
      {
        id: "hot-score",
        type: "custom",
        position: { x: 240, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Generate Lead Score",
          description: "Produce a 0-100 score with reasoning",
          config: {
            inputData: {
              summary: "{{node.hot-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-1-airtable",
        type: "custom",
        position: { x: 240, y: 700 },
        data: {
          type: "airtable_action_update_record",
          title: "Update Lead Score",
          description: "Log score on the lead record",
          providerId: "airtable",
          config: {
            baseId: "",
            tableName: "",
            recordId: "{{trigger.recordId}}",
            fields: {
              Score: "{{node.hot-score.output.content}}",
              Stage: "Hot Lead",
            },
          },
          validationState: { missingRequired: ["baseId", "tableName"] },
        },
      },
      {
        id: "hot-senior-rep",
        type: "custom",
        position: { x: 240, y: 840 },
        data: {
          type: "ai_action_generate",
          title: "Assign Senior Rep",
          description: "Choose the best senior rep email for follow-up",
          config: {
            inputData: {
              summary: "{{node.hot-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "hot-email-body",
        type: "custom",
        position: { x: 240, y: 980 },
        data: {
          type: "ai_action_generate",
          title: "Compose Executive Handoff",
          description: "Write a high urgency email for the senior rep",
          config: {
            inputData: {
              summary: "{{node.hot-summary.output.summary}}",
              score: "{{node.hot-score.output.content}}",
            },
            contentType: "email",
            tone: "professional",
            length: "medium",
          },
        },
      },
      {
        id: "hot-email-subject",
        type: "custom",
        position: { x: 240, y: 1120 },
        data: {
          type: "ai_action_generate",
          title: "Create Follow-up Subject",
          description: "Subject for executive handoff email",
          config: {
            inputData: {
              summary: "{{node.hot-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-1-gmail",
        type: "custom",
        position: { x: 240, y: 1260 },
        data: {
          type: "gmail_action_send_email",
          title: "Notify Senior Rep",
          description: "Send hot lead details to senior rep",
          providerId: "gmail",
          config: {
            to: "{{node.hot-senior-rep.output.content}}",
            subject: "{{node.hot-email-subject.output.content}}",
            body: "{{node.hot-email-body.output.content}}",
          },
        },
      },
      // Warm lead branch
      {
        id: "warm-summary",
        type: "custom",
        position: { x: 750, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Warm Lead",
          description: "Summarize nurture-ready lead",
          config: {
            inputText: "{{trigger.fields}}",
            maxLength: 150,
            style: "brief",
            focus: "needs, buying window, recommended next step",
          },
        },
      },
      {
        id: "warm-score",
        type: "custom",
        position: { x: 750, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Generate Warm Score",
          description: "Produce lead score text for warm track",
          config: {
            inputData: {
              summary: "{{node.warm-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-2-airtable",
        type: "custom",
        position: { x: 750, y: 700 },
        data: {
          type: "airtable_action_update_record",
          title: "Update Warm Lead Score",
          description: "Log warm lead score",
          providerId: "airtable",
          config: {
            baseId: "",
            tableName: "",
            recordId: "{{trigger.recordId}}",
            fields: {
              Score: "{{node.warm-score.output.content}}",
              Stage: "Warm Lead",
            },
          },
          validationState: { missingRequired: ["baseId", "tableName"] },
        },
      },
      {
        id: "warm-lead-email",
        type: "custom",
        position: { x: 750, y: 840 },
        data: {
          type: "ai_action_generate",
          title: "Confirm Lead Email",
          description: "Generate lead email address for outreach",
          config: {
            inputData: {
              original: "{{trigger.fields}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "warm-demo-body",
        type: "custom",
        position: { x: 750, y: 980 },
        data: {
          type: "ai_action_generate",
          title: "Draft Demo Invite",
          description: "Compose email inviting the lead to a demo",
          config: {
            inputData: {
              summary: "{{node.warm-summary.output.summary}}",
              score: "{{node.warm-score.output.content}}",
            },
            contentType: "email",
            tone: "friendly",
            length: "medium",
          },
        },
      },
      {
        id: "warm-demo-subject",
        type: "custom",
        position: { x: 750, y: 1120 },
        data: {
          type: "ai_action_generate",
          title: "Create Demo Subject",
          description: "Subject line for demo invite",
          config: {
            inputData: {
              summary: "{{node.warm-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "friendly",
            length: "short",
          },
        },
      },
      {
        id: "chain-2-gmail",
        type: "custom",
        position: { x: 750, y: 1260 },
        data: {
          type: "gmail_action_send_email",
          title: "Send Demo Invite",
          description: "Email warm lead to book demo",
          providerId: "gmail",
          config: {
            to: "{{node.warm-lead-email.output.content}}",
            subject: "{{node.warm-demo-subject.output.content}}",
            body: "{{node.warm-demo-body.output.content}}",
          },
        },
      },
      // Nurture branch
      {
        id: "nurture-summary",
        type: "custom",
        position: { x: 1260, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Nurture Lead",
          description: "Summarize low urgency lead",
          config: {
            inputText: "{{trigger.fields}}",
            maxLength: 150,
            style: "brief",
            focus: "interest area, nurture suggestion",
          },
        },
      },
      {
        id: "nurture-score",
        type: "custom",
        position: { x: 1260, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Generate Nurture Score",
          description: "Provide nurture score text",
          config: {
            inputData: {
              summary: "{{node.nurture-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-3-airtable",
        type: "custom",
        position: { x: 1260, y: 700 },
        data: {
          type: "airtable_action_update_record",
          title: "Update Nurture Score",
          description: "Log nurture score and stage",
          providerId: "airtable",
          config: {
            baseId: "",
            tableName: "",
            recordId: "{{trigger.recordId}}",
            fields: {
              Score: "{{node.nurture-score.output.content}}",
              Stage: "Nurture",
            },
          },
          validationState: { missingRequired: ["baseId", "tableName"] },
        },
      },
    ],
    connections: [
      { id: "lead-edge-0", source: "airtable-trigger-1", target: "lead-router" },
      {
        id: "lead-edge-1",
        source: "lead-router",
        target: "hot-summary",
        sourceHandle: "hot_lead",
      },
      { id: "lead-edge-2", source: "hot-summary", target: "hot-score" },
      { id: "lead-edge-3", source: "hot-score", target: "chain-1-airtable" },
      { id: "lead-edge-4", source: "chain-1-airtable", target: "hot-senior-rep" },
      { id: "lead-edge-5", source: "hot-senior-rep", target: "hot-email-body" },
      { id: "lead-edge-6", source: "hot-email-body", target: "hot-email-subject" },
      { id: "lead-edge-7", source: "hot-email-subject", target: "chain-1-gmail" },
      {
        id: "lead-edge-8",
        source: "lead-router",
        target: "warm-summary",
        sourceHandle: "warm_lead",
      },
      { id: "lead-edge-9", source: "warm-summary", target: "warm-score" },
      { id: "lead-edge-10", source: "warm-score", target: "chain-2-airtable" },
      { id: "lead-edge-11", source: "chain-2-airtable", target: "warm-lead-email" },
      { id: "lead-edge-12", source: "warm-lead-email", target: "warm-demo-body" },
      { id: "lead-edge-13", source: "warm-demo-body", target: "warm-demo-subject" },
      { id: "lead-edge-14", source: "warm-demo-subject", target: "chain-2-gmail" },
      {
        id: "lead-edge-15",
        source: "lead-router",
        target: "nurture-summary",
        sourceHandle: "nurture_lead",
      },
      { id: "lead-edge-16", source: "nurture-summary", target: "nurture-score" },
      { id: "lead-edge-17", source: "nurture-score", target: "chain-3-airtable" },
    ],
  },
  // Inventory Management & Reordering
  "7e6fdcba-9799-4ff9-9e53-bd512b905d9f": {
    nodes: [
      {
        id: "airtable-trigger-1",
        type: "custom",
        position: { x: 750, y: 50 },
        data: {
          type: "airtable_trigger_record_updated",
          title: "Inventory Level Updated",
          description: "Track stock changes",
          isTrigger: true,
          providerId: "airtable",
          config: { baseId: "", tableName: "" },
          validationState: { missingRequired: ["baseId", "tableName"] },
        },
      },
      {
        id: "inventory-router",
        type: "custom",
        position: { x: 750, y: 240 },
        data: {
          type: "ai_router",
          title: "Assess Inventory Status",
          description: "Decide urgency and route action",
          config: {
            template: "custom",
            systemPrompt:
              "You are an inventory planner. Based on the updated stock data, choose: critical_low (urgent reorder/rush), reorder_point (standard reorder), or monitor_trend (watch trending items). Consider quantity, reorder point, velocity, and supplier SLAs.",
            model: "gpt-4o-mini",
            apiSource: "chainreact",
            memory: "workflow",
            outputPaths: [
              {
                id: "critical_low",
                name: "Critical Low Stock",
                description: "Requires rush order",
                color: "#ef4444",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "reorder_point",
                name: "Standard Reorder",
                description: "Create purchase order",
                color: "#f97316",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "monitor_trend",
                name: "Monitor Trend",
                description: "Item trending, monitor closely",
                color: "#22c55e",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "manual_review",
                name: "Manual Review",
                description: "Needs manual decision",
                color: "#6b7280",
                condition: { type: "fallback" },
              },
            ],
            decisionMode: "single",
            includeReasoning: true,
            temperature: 0.15,
            maxRetries: 1,
            timeout: 30,
            costLimit: 0.3,
          },
        },
      },
      // Critical branch
      {
        id: "critical-summary",
        type: "custom",
        position: { x: 240, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Critical Alert",
          description: "Summarize item status for urgent action",
          config: {
            inputText: "{{trigger.changedFields}}",
            maxLength: 150,
            style: "brief",
            focus: "item, stock level, reorder point, impact",
          },
        },
      },
      {
        id: "critical-supplier-email",
        type: "custom",
        position: { x: 240, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Supplier Email Address",
          description: "Determine supplier contact email",
          config: {
            inputData: {
              item: "{{trigger.changedFields}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "critical-rush-body",
        type: "custom",
        position: { x: 240, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "Draft Rush Order Email",
          description: "Write urgent rush order email",
          config: {
            inputData: {
              summary: "{{node.critical-summary.output.summary}}",
            },
            contentType: "email",
            tone: "professional",
            length: "medium",
          },
        },
      },
      {
        id: "critical-rush-subject",
        type: "custom",
        position: { x: 240, y: 840 },
        data: {
          type: "ai_action_generate",
          title: "Rush Order Subject",
          description: "Generate subject for rush order email",
          config: {
            inputData: {
              summary: "{{node.critical-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-1-gmail",
        type: "custom",
        position: { x: 240, y: 980 },
        data: {
          type: "gmail_action_send_email",
          title: "Send Rush Order",
          description: "Email supplier for rush order",
          providerId: "gmail",
          config: {
            to: "{{node.critical-supplier-email.output.content}}",
            subject: "{{node.critical-rush-subject.output.content}}",
            body: "{{node.critical-rush-body.output.content}}",
          },
        },
      },
      {
        id: "critical-alert",
        type: "custom",
        position: { x: 240, y: 1120 },
        data: {
          type: "ai_action_generate",
          title: "Warehouse Alert Message",
          description: "Draft alert for warehouse or ops",
          config: {
            inputData: {
              summary: "{{node.critical-summary.output.summary}}",
            },
            contentType: "response",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-1-slack",
        type: "custom",
        position: { x: 240, y: 1260 },
        data: {
          type: "slack_action_send_message",
          title: "Alert Warehouse",
          description: "Notify warehouse operations",
          providerId: "slack",
          config: {
            channelId: "",
            message: "{{node.critical-alert.output.content}}",
          },
          validationState: { missingRequired: ["channelId"] },
        },
      },
      // Reorder branch
      {
        id: "reorder-summary",
        type: "custom",
        position: { x: 750, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Reorder Need",
          description: "Summarize data for purchase order",
          config: {
            inputText: "{{trigger.changedFields}}",
            maxLength: 150,
            style: "brief",
            focus: "current stock, reorder point, vendor",
          },
        },
      },
      {
        id: "reorder-item",
        type: "custom",
        position: { x: 750, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Identify Item",
          description: "Provide item name/code for PO",
          config: {
            inputData: {
              summary: "{{node.reorder-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "reorder-quantity",
        type: "custom",
        position: { x: 750, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "Determine Quantity",
          description: "Recommend reorder quantity",
          config: {
            inputData: {
              summary: "{{node.reorder-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-2-airtable",
        type: "custom",
        position: { x: 750, y: 840 },
        data: {
          type: "airtable_action_create_record",
          title: "Create Purchase Order",
          description: "Log PO for approval",
          providerId: "airtable",
          config: {
            baseId: "",
            tableName: "",
            fields: {
              Item: "{{node.reorder-item.output.content}}",
              Quantity: "{{node.reorder-quantity.output.content}}",
              Status: "Pending Approval",
            },
          },
          validationState: { missingRequired: ["baseId", "tableName"] },
        },
      },
      {
        id: "reorder-supplier-email",
        type: "custom",
        position: { x: 750, y: 980 },
        data: {
          type: "ai_action_generate",
          title: "Supplier Email (Reorder)",
          description: "Confirm supplier contact",
          config: {
            inputData: {
              summary: "{{node.reorder-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "reorder-po-body",
        type: "custom",
        position: { x: 750, y: 1120 },
        data: {
          type: "ai_action_generate",
          title: "Draft Purchase Order Email",
          description: "Compose standard PO email",
          config: {
            inputData: {
              summary: "{{node.reorder-summary.output.summary}}",
              quantity: "{{node.reorder-quantity.output.content}}",
            },
            contentType: "email",
            tone: "professional",
            length: "medium",
          },
        },
      },
      {
        id: "reorder-po-subject",
        type: "custom",
        position: { x: 750, y: 1260 },
        data: {
          type: "ai_action_generate",
          title: "Purchase Order Subject",
          description: "Subject line for PO email",
          config: {
            inputData: {
              item: "{{node.reorder-item.output.content}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-2-gmail",
        type: "custom",
        position: { x: 750, y: 1400 },
        data: {
          type: "gmail_action_send_email",
          title: "Send Purchase Order",
          description: "Email supplier with PO",
          providerId: "gmail",
          config: {
            to: "{{node.reorder-supplier-email.output.content}}",
            subject: "{{node.reorder-po-subject.output.content}}",
            body: "{{node.reorder-po-body.output.content}}",
          },
        },
      },
      // Monitor branch
      {
        id: "monitor-summary",
        type: "custom",
        position: { x: 1260, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Trend",
          description: "Summarize item trend details",
          config: {
            inputText: "{{trigger.changedFields}}",
            maxLength: 150,
            style: "brief",
            focus: "trend, demand signals, recommended actions",
          },
        },
      },
      {
        id: "chain-3-airtable",
        type: "custom",
        position: { x: 1260, y: 560 },
        data: {
          type: "airtable_action_update_record",
          title: "Flag as Trending",
          description: "Update record to flag trending status",
          providerId: "airtable",
          config: {
            baseId: "",
            tableName: "",
            recordId: "{{trigger.recordId}}",
            fields: {
              Watch: "Yes",
              Notes: "{{node.monitor-summary.output.summary}}",
            },
          },
          validationState: { missingRequired: ["baseId", "tableName"] },
        },
      },
      {
        id: "monitor-notify",
        type: "custom",
        position: { x: 1260, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "Operations Update",
          description: "Notify ops to monitor trend",
          config: {
            inputData: {
              summary: "{{node.monitor-summary.output.summary}}",
            },
            contentType: "response",
            tone: "friendly",
            length: "short",
          },
        },
      },
      {
        id: "chain-3-slack",
        type: "custom",
        position: { x: 1260, y: 840 },
        data: {
          type: "slack_action_send_message",
          title: "Notify Operations",
          description: "Share trending update in Slack",
          providerId: "slack",
          config: {
            channelId: "",
            message: "{{node.monitor-notify.output.content}}",
          },
          validationState: { missingRequired: ["channelId"] },
        },
      },
    ],
    connections: [
      { id: "inventory-edge-0", source: "airtable-trigger-1", target: "inventory-router" },
      {
        id: "inventory-edge-1",
        source: "inventory-router",
        target: "critical-summary",
        sourceHandle: "critical_low",
      },
      { id: "inventory-edge-2", source: "critical-summary", target: "critical-supplier-email" },
      { id: "inventory-edge-3", source: "critical-supplier-email", target: "critical-rush-body" },
      { id: "inventory-edge-4", source: "critical-rush-body", target: "critical-rush-subject" },
      { id: "inventory-edge-5", source: "critical-rush-subject", target: "chain-1-gmail" },
      { id: "inventory-edge-6", source: "chain-1-gmail", target: "critical-alert" },
      { id: "inventory-edge-7", source: "critical-alert", target: "chain-1-slack" },
      {
        id: "inventory-edge-8",
        source: "inventory-router",
        target: "reorder-summary",
        sourceHandle: "reorder_point",
      },
      { id: "inventory-edge-9", source: "reorder-summary", target: "reorder-item" },
      { id: "inventory-edge-10", source: "reorder-item", target: "reorder-quantity" },
      { id: "inventory-edge-11", source: "reorder-quantity", target: "chain-2-airtable" },
      { id: "inventory-edge-12", source: "chain-2-airtable", target: "reorder-supplier-email" },
      { id: "inventory-edge-13", source: "reorder-supplier-email", target: "reorder-po-body" },
      { id: "inventory-edge-14", source: "reorder-po-body", target: "reorder-po-subject" },
      { id: "inventory-edge-15", source: "reorder-po-subject", target: "chain-2-gmail" },
      {
        id: "inventory-edge-16",
        source: "inventory-router",
        target: "monitor-summary",
        sourceHandle: "monitor_trend",
      },
      { id: "inventory-edge-17", source: "monitor-summary", target: "chain-3-airtable" },
      { id: "inventory-edge-18", source: "chain-3-airtable", target: "monitor-notify" },
      { id: "inventory-edge-19", source: "monitor-notify", target: "chain-3-slack" },
    ],
  },
  // Meeting Automation Suite
  "9743c453-c795-475f-8778-308976894751": {
    nodes: [
      {
        id: "gmail-trigger-1",
        type: "custom",
        position: { x: 750, y: 50 },
        data: {
          type: "gmail_trigger_new_email",
          title: "Meeting Request Email",
          description: "Detect incoming meeting requests",
          isTrigger: true,
          providerId: "gmail",
          config: {
            labelId: "INBOX",
          },
        },
      },
      {
        id: "meeting-router",
        type: "custom",
        position: { x: 750, y: 240 },
        data: {
          type: "ai_router",
          title: "Classify Meeting Type",
          description: "Route meeting request to the right workflow",
          config: {
            template: "custom",
            systemPrompt:
              "You are an executive assistant. Classify the meeting request email into client_meeting (external), internal_sync (internal check-in), or brainstorming_session (creative collaboration).",
            model: "gpt-4o-mini",
            apiSource: "chainreact",
            memory: "workflow",
            outputPaths: [
              {
                id: "client_meeting",
                name: "Client Meeting",
                description: "External stakeholder meeting",
                color: "#2563eb",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "internal_sync",
                name: "Internal Sync",
                description: "Internal status update",
                color: "#f97316",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "brainstorming_session",
                name: "Brainstorm Session",
                description: "Creative collaboration request",
                color: "#8b5cf6",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "manual_review",
                name: "Manual Review",
                description: "Unclear request",
                color: "#6b7280",
                condition: { type: "fallback" },
              },
            ],
            decisionMode: "single",
            includeReasoning: true,
            temperature: 0.2,
            maxRetries: 1,
            timeout: 30,
            costLimit: 0.3,
          },
        },
      },
      // Client meeting branch
      {
        id: "client-summary",
        type: "custom",
        position: { x: 240, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Client Request",
          description: "Summarize the client meeting request",
          config: {
            inputText: "{{trigger.email.body}}",
            maxLength: 200,
            style: "brief",
            focus: "client, goals, proposed timing",
          },
        },
      },
      {
        id: "client-title",
        type: "custom",
        position: { x: 240, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Create Meeting Title",
          description: "Generate professional title for the meeting",
          config: {
            inputData: {
              summary: "{{node.client-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "client-agenda",
        type: "custom",
        position: { x: 240, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "Draft Client Agenda",
          description: "Generate a detailed agenda for the client meeting",
          config: {
            inputData: {
              summary: "{{node.client-summary.output.summary}}",
            },
            contentType: "report",
            tone: "professional",
            length: "medium",
          },
        },
      },
      {
        id: "chain-1-notion",
        type: "custom",
        position: { x: 240, y: 840 },
        data: {
          type: "notion_action_create_page",
          title: "Create Client Agenda",
          description: "Log agenda in Notion",
          providerId: "notion",
          config: {
            databaseId: "",
            title: "{{node.client-title.output.content}}",
            content: "{{node.client-agenda.output.content}}",
          },
          validationState: { missingRequired: ["databaseId"] },
        },
      },
      {
        id: "client-attendees",
        type: "custom",
        position: { x: 240, y: 980 },
        data: {
          type: "ai_action_generate",
          title: "Identify Attendees",
          description: "List the participants for the meeting invite",
          config: {
            inputData: {
              summary: "{{node.client-summary.output.summary}}",
              original: "{{trigger.email.body}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "client-invite-body",
        type: "custom",
        position: { x: 240, y: 1120 },
        data: {
          type: "ai_action_generate",
          title: "Compose Invite Body",
          description: "Draft a polished invite message",
          config: {
            inputData: {
              summary: "{{node.client-summary.output.summary}}",
            },
            contentType: "email",
            tone: "friendly",
            length: "medium",
          },
        },
      },
      {
        id: "client-invite-subject",
        type: "custom",
        position: { x: 240, y: 1260 },
        data: {
          type: "ai_action_generate",
          title: "Create Invite Subject",
          description: "Generate subject for calendar invite",
          config: {
            inputData: {
              title: "{{node.client-title.output.content}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-1-gmail",
        type: "custom",
        position: { x: 240, y: 1400 },
        data: {
          type: "gmail_action_send_email",
          title: "Send Client Invite",
          description: "Send calendar invite email",
          providerId: "gmail",
          config: {
            to: "{{node.client-attendees.output.content}}",
            subject: "{{node.client-invite-subject.output.content}}",
            body: "{{node.client-invite-body.output.content}}",
          },
        },
      },
      // Internal sync branch
      {
        id: "internal-summary",
        type: "custom",
        position: { x: 750, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Internal Request",
          description: "Summarize the internal sync request",
          config: {
            inputText: "{{trigger.email.body}}",
            maxLength: 160,
            style: "brief",
            focus: "objective, team, timeframe",
          },
        },
      },
      {
        id: "internal-title",
        type: "custom",
        position: { x: 750, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Create Sync Title",
          description: "Generate meeting title for internal sync",
          config: {
            inputData: {
              summary: "{{node.internal-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "internal-template",
        type: "custom",
        position: { x: 750, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "Prepare Sync Notes Template",
          description: "Draft notes template for the sync",
          config: {
            inputData: {
              summary: "{{node.internal-summary.output.summary}}",
            },
            contentType: "report",
            tone: "professional",
            length: "medium",
          },
        },
      },
      {
        id: "chain-2-notion",
        type: "custom",
        position: { x: 750, y: 840 },
        data: {
          type: "notion_action_create_page",
          title: "Create Sync Doc",
          description: "Log sync meeting doc",
          providerId: "notion",
          config: {
            databaseId: "",
            title: "{{node.internal-title.output.content}}",
            content: "{{node.internal-template.output.content}}",
          },
          validationState: { missingRequired: ["databaseId"] },
        },
      },
      {
        id: "internal-reminder",
        type: "custom",
        position: { x: 750, y: 980 },
        data: {
          type: "ai_action_generate",
          title: "Compose Slack Reminder",
          description: "Create reminder for team members",
          config: {
            inputData: {
              summary: "{{node.internal-summary.output.summary}}",
            },
            contentType: "response",
            tone: "friendly",
            length: "short",
          },
        },
      },
      {
        id: "chain-2-slack",
        type: "custom",
        position: { x: 750, y: 1120 },
        data: {
          type: "slack_action_send_message",
          title: "Send Sync Reminder",
          description: "Notify team in Slack",
          providerId: "slack",
          config: {
            channelId: "",
            message: "{{node.internal-reminder.output.content}}",
          },
          validationState: { missingRequired: ["channelId"] },
        },
      },
      // Brainstorm branch
      {
        id: "brainstorm-summary",
        type: "custom",
        position: { x: 1260, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Brainstorm Request",
          description: "Summarize brainstorming goals",
          config: {
            inputText: "{{trigger.email.body}}",
            maxLength: 160,
            style: "brief",
            focus: "topic, desired outcomes, participants",
          },
        },
      },
      {
        id: "brainstorm-title",
        type: "custom",
        position: { x: 1260, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Create Brainstorm Title",
          description: "Generate title for brainstorming session",
          config: {
            inputData: {
              summary: "{{node.brainstorm-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "friendly",
            length: "short",
          },
        },
      },
      {
        id: "brainstorm-template",
        type: "custom",
        position: { x: 1260, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "Brainstorm Template",
          description: "Create collaborative template for session",
          config: {
            inputData: {
              summary: "{{node.brainstorm-summary.output.summary}}",
            },
            contentType: "report",
            tone: "friendly",
            length: "medium",
          },
        },
      },
      {
        id: "chain-3-notion",
        type: "custom",
        position: { x: 1260, y: 840 },
        data: {
          type: "notion_action_create_page",
          title: "Create Brainstorm Board",
          description: "Add brainstorming template to Notion",
          providerId: "notion",
          config: {
            databaseId: "",
            title: "{{node.brainstorm-title.output.content}}",
            content: "{{node.brainstorm-template.output.content}}",
          },
          validationState: { missingRequired: ["databaseId"] },
        },
      },
      {
        id: "brainstorm-prep",
        type: "custom",
        position: { x: 1260, y: 980 },
        data: {
          type: "ai_action_generate",
          title: "Prep Message",
          description: "Draft pre-work instructions",
          config: {
            inputData: {
              summary: "{{node.brainstorm-summary.output.summary}}",
            },
            contentType: "response",
            tone: "friendly",
            length: "short",
          },
        },
      },
      {
        id: "chain-3-slack",
        type: "custom",
        position: { x: 1260, y: 1120 },
        data: {
          type: "slack_action_send_message",
          title: "Share Pre-Work",
          description: "Send prep notes via Slack",
          providerId: "slack",
          config: {
            channelId: "",
            message: "{{node.brainstorm-prep.output.content}}",
          },
          validationState: { missingRequired: ["channelId"] },
        },
      },
    ],
    connections: [
      { id: "meeting-edge-0", source: "gmail-trigger-1", target: "meeting-router" },
      {
        id: "meeting-edge-1",
        source: "meeting-router",
        target: "client-summary",
        sourceHandle: "client_meeting",
      },
      { id: "meeting-edge-2", source: "client-summary", target: "client-title" },
      { id: "meeting-edge-3", source: "client-title", target: "client-agenda" },
      { id: "meeting-edge-4", source: "client-agenda", target: "chain-1-notion" },
      { id: "meeting-edge-5", source: "chain-1-notion", target: "client-attendees" },
      { id: "meeting-edge-6", source: "client-attendees", target: "client-invite-body" },
      { id: "meeting-edge-7", source: "client-invite-body", target: "client-invite-subject" },
      { id: "meeting-edge-8", source: "client-invite-subject", target: "chain-1-gmail" },
      {
        id: "meeting-edge-9",
        source: "meeting-router",
        target: "internal-summary",
        sourceHandle: "internal_sync",
      },
      { id: "meeting-edge-10", source: "internal-summary", target: "internal-title" },
      { id: "meeting-edge-11", source: "internal-title", target: "internal-template" },
      { id: "meeting-edge-12", source: "internal-template", target: "chain-2-notion" },
      { id: "meeting-edge-13", source: "chain-2-notion", target: "internal-reminder" },
      { id: "meeting-edge-14", source: "internal-reminder", target: "chain-2-slack" },
      {
        id: "meeting-edge-15",
        source: "meeting-router",
        target: "brainstorm-summary",
        sourceHandle: "brainstorming_session",
      },
      { id: "meeting-edge-16", source: "brainstorm-summary", target: "brainstorm-title" },
      { id: "meeting-edge-17", source: "brainstorm-title", target: "brainstorm-template" },
      { id: "meeting-edge-18", source: "brainstorm-template", target: "chain-3-notion" },
      { id: "meeting-edge-19", source: "chain-3-notion", target: "brainstorm-prep" },
      { id: "meeting-edge-20", source: "brainstorm-prep", target: "chain-3-slack" },
    ],
  },
  // HR Onboarding Automation
  "160ed804-2a1c-4f63-8da8-1c00d409af86": {
    nodes: [
      {
        id: "airtable-trigger-1",
        type: "custom",
        position: { x: 750, y: 50 },
        data: {
          type: "airtable_trigger_new_record",
          title: "New Hire Added",
          description: "New employee record created",
          isTrigger: true,
          providerId: "airtable",
          config: { baseId: "", tableName: "" },
          validationState: { missingRequired: ["baseId", "tableName"] },
        },
      },
      {
        id: "onboarding-router",
        type: "custom",
        position: { x: 750, y: 240 },
        data: {
          type: "ai_router",
          title: "Classify Onboarding Track",
          description: "Choose the onboarding plan based on role",
          config: {
            template: "custom",
            systemPrompt:
              "You are a people-ops assistant. Based on the new hire data, classify into engineering_onboarding, sales_onboarding, or general_onboarding. Choose engineering_onboarding for technical roles (engineer, developer, product, design). Choose sales_onboarding for sales, success, or revenue roles. Otherwise choose general_onboarding.",
            model: "gpt-4o-mini",
            apiSource: "chainreact",
            memory: "workflow",
            outputPaths: [
              {
                id: "engineering_onboarding",
                name: "Engineering",
                description: "Technical onboarding track",
                color: "#2563eb",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "sales_onboarding",
                name: "Sales & GTM",
                description: "Sales and revenue onboarding track",
                color: "#f97316",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "general_onboarding",
                name: "General",
                description: "General onboarding track",
                color: "#10b981",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "manual_review",
                name: "Manual Review",
                description: "Unable to determine track",
                color: "#6b7280",
                condition: { type: "fallback" },
              },
            ],
            decisionMode: "single",
            includeReasoning: true,
            temperature: 0.2,
            maxRetries: 1,
            timeout: 30,
            costLimit: 0.35,
          },
        },
      },
      // Engineering track
      {
        id: "eng-summary",
        type: "custom",
        position: { x: 240, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Engineering Hire",
          description: "Summarize background for planning tasks",
          config: {
            inputText: "{{trigger.fields}}",
            maxLength: 160,
            style: "brief",
            focus: "role, start date, tools required",
          },
        },
      },
      {
        id: "eng-due-date",
        type: "custom",
        position: { x: 240, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Set Due Date",
          description: "Recommend due date for onboarding tasks",
          config: {
            inputData: {
              summary: "{{node.eng-summary.output.summary}}",
              startDate: "{{trigger.fields.start_date}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "eng-task-list",
        type: "custom",
        position: { x: 240, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "Engineering Tasks",
          description: "Generate structured onboarding tasks",
          config: {
            inputData: {
              summary: "{{node.eng-summary.output.summary}}",
            },
            contentType: "report",
            tone: "professional",
            length: "medium",
          },
        },
      },
      {
        id: "chain-1-airtable",
        type: "custom",
        position: { x: 240, y: 840 },
        data: {
          type: "airtable_action_create_record",
          title: "Create Engineering Task",
          description: "Log onboarding tasks for engineering",
          providerId: "airtable",
          config: {
            baseId: "",
            tableName: "",
            fields: {
              "Due Date": "{{node.eng-due-date.output.content}}",
              Tasks: "{{node.eng-task-list.output.content}}",
              Track: "Engineering",
            },
          },
          validationState: { missingRequired: ["baseId", "tableName"] },
        },
      },
      {
        id: "eng-email",
        type: "custom",
        position: { x: 240, y: 980 },
        data: {
          type: "ai_action_generate",
          title: "Engineering Welcome Email",
          description: "Draft welcome email for engineering hire",
          config: {
            inputData: {
              summary: "{{node.eng-summary.output.summary}}",
            },
            contentType: "email",
            tone: "friendly",
            length: "medium",
          },
        },
      },
      {
        id: "eng-email-address",
        type: "custom",
        position: { x: 240, y: 1120 },
        data: {
          type: "ai_action_generate",
          title: "Determine Email",
          description: "Confirm the employee email address",
          config: {
            inputData: {
              original: "{{trigger.fields}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-1-gmail",
        type: "custom",
        position: { x: 240, y: 1260 },
        data: {
          type: "gmail_action_send_email",
          title: "Send Engineering Welcome",
          description: "Send onboarding email",
          providerId: "gmail",
          config: {
            to: "{{node.eng-email-address.output.content}}",
            subject: "Welcome to the Engineering Team!",
            body: "{{node.eng-email.output.content}}",
          },
        },
      },
      // Sales track
      {
        id: "sales-summary",
        type: "custom",
        position: { x: 750, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Sales Hire",
          description: "Summarize new GTM team hire details",
          config: {
            inputText: "{{trigger.fields}}",
            maxLength: 160,
            style: "brief",
            focus: "territory, role focus, ramp goals",
          },
        },
      },
      {
        id: "sales-due-date",
        type: "custom",
        position: { x: 750, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Set Sales Due Date",
          description: "Recommend due dates for sales onboarding tasks",
          config: {
            inputData: {
              summary: "{{node.sales-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "sales-task-list",
        type: "custom",
        position: { x: 750, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "Sales Onboarding Tasks",
          description: "Create tasks for sales enablement",
          config: {
            inputData: {
              summary: "{{node.sales-summary.output.summary}}",
            },
            contentType: "report",
            tone: "professional",
            length: "medium",
          },
        },
      },
      {
        id: "chain-2-airtable",
        type: "custom",
        position: { x: 750, y: 840 },
        data: {
          type: "airtable_action_create_record",
          title: "Create Sales Task",
          description: "Log onboarding tasks for sales",
          providerId: "airtable",
          config: {
            baseId: "",
            tableName: "",
            fields: {
              "Due Date": "{{node.sales-due-date.output.content}}",
              Tasks: "{{node.sales-task-list.output.content}}",
              Track: "Sales",
            },
          },
          validationState: { missingRequired: ["baseId", "tableName"] },
        },
      },
      {
        id: "sales-email",
        type: "custom",
        position: { x: 750, y: 980 },
        data: {
          type: "ai_action_generate",
          title: "Sales Welcome Email",
          description: "Draft welcome email for the sales hire",
          config: {
            inputData: {
              summary: "{{node.sales-summary.output.summary}}",
            },
            contentType: "email",
            tone: "friendly",
            length: "medium",
          },
        },
      },
      {
        id: "sales-email-address",
        type: "custom",
        position: { x: 750, y: 1120 },
        data: {
          type: "ai_action_generate",
          title: "Determine Sales Email",
          description: "Confirm the sales hire's email address",
          config: {
            inputData: {
              original: "{{trigger.fields}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-2-gmail",
        type: "custom",
        position: { x: 750, y: 1260 },
        data: {
          type: "gmail_action_send_email",
          title: "Send Sales Welcome",
          description: "Send onboarding email to sales hire",
          providerId: "gmail",
          config: {
            to: "{{node.sales-email-address.output.content}}",
            subject: "Welcome to the Sales Team!",
            body: "{{node.sales-email.output.content}}",
          },
        },
      },
      // General track
      {
        id: "general-summary",
        type: "custom",
        position: { x: 1260, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize New Hire",
          description: "Summarize general onboarding details",
          config: {
            inputText: "{{trigger.fields}}",
            maxLength: 160,
            style: "brief",
            focus: "role, start date, key stakeholders",
          },
        },
      },
      {
        id: "general-due-date",
        type: "custom",
        position: { x: 1260, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Set General Due Date",
          description: "Recommend due date for general onboarding tasks",
          config: {
            inputData: {
              summary: "{{node.general-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "general-tasks",
        type: "custom",
        position: { x: 1260, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "General Onboarding Tasks",
          description: "Draft tasks for the onboarding checklist",
          config: {
            inputData: {
              summary: "{{node.general-summary.output.summary}}",
            },
            contentType: "report",
            tone: "professional",
            length: "medium",
          },
        },
      },
      {
        id: "chain-3-airtable",
        type: "custom",
        position: { x: 1260, y: 840 },
        data: {
          type: "airtable_action_create_record",
          title: "Create General Task",
          description: "Log onboarding tasks for general roles",
          providerId: "airtable",
          config: {
            baseId: "",
            tableName: "",
            fields: {
              "Due Date": "{{node.general-due-date.output.content}}",
              Tasks: "{{node.general-tasks.output.content}}",
              Track: "General",
            },
          },
          validationState: { missingRequired: ["baseId", "tableName"] },
        },
      },
      {
        id: "team-intro",
        type: "custom",
        position: { x: 1260, y: 980 },
        data: {
          type: "ai_action_generate",
          title: "Team Introduction Message",
          description: "Prepare a message to introduce new hire",
          config: {
            inputData: {
              summary: "{{node.general-summary.output.summary}}",
            },
            contentType: "response",
            tone: "friendly",
            length: "short",
          },
        },
      },
      {
        id: "chain-3-slack",
        type: "custom",
        position: { x: 1260, y: 1120 },
        data: {
          type: "slack_action_send_message",
          title: "Announce in Slack",
          description: "Share introduction message with the team",
          providerId: "slack",
          config: {
            channelId: "",
            message: "{{node.team-intro.output.content}}",
          },
          validationState: { missingRequired: ["channelId"] },
        },
      },
    ],
    connections: [
      { id: "onboard-edge-0", source: "airtable-trigger-1", target: "onboarding-router" },
      {
        id: "onboard-edge-1",
        source: "onboarding-router",
        target: "eng-summary",
        sourceHandle: "engineering_onboarding",
      },
      { id: "onboard-edge-2", source: "eng-summary", target: "eng-due-date" },
      { id: "onboard-edge-3", source: "eng-due-date", target: "eng-task-list" },
      { id: "onboard-edge-4", source: "eng-task-list", target: "chain-1-airtable" },
      { id: "onboard-edge-5", source: "chain-1-airtable", target: "eng-email" },
      { id: "onboard-edge-6", source: "eng-email", target: "eng-email-address" },
      { id: "onboard-edge-7", source: "eng-email-address", target: "chain-1-gmail" },
      {
        id: "onboard-edge-8",
        source: "onboarding-router",
        target: "sales-summary",
        sourceHandle: "sales_onboarding",
      },
      { id: "onboard-edge-9", source: "sales-summary", target: "sales-due-date" },
      { id: "onboard-edge-10", source: "sales-due-date", target: "sales-task-list" },
      { id: "onboard-edge-11", source: "sales-task-list", target: "chain-2-airtable" },
      { id: "onboard-edge-12", source: "chain-2-airtable", target: "sales-email" },
      { id: "onboard-edge-13", source: "sales-email", target: "sales-email-address" },
      { id: "onboard-edge-14", source: "sales-email-address", target: "chain-2-gmail" },
      {
        id: "onboard-edge-15",
        source: "onboarding-router",
        target: "general-summary",
        sourceHandle: "general_onboarding",
      },
      { id: "onboard-edge-16", source: "general-summary", target: "general-due-date" },
      { id: "onboard-edge-17", source: "general-due-date", target: "general-tasks" },
      { id: "onboard-edge-18", source: "general-tasks", target: "chain-3-airtable" },
      { id: "onboard-edge-19", source: "chain-3-airtable", target: "team-intro" },
      { id: "onboard-edge-20", source: "team-intro", target: "chain-3-slack" },
    ],
  },
  // Invoice Processing & Approval
  "7669b7c8-ebb2-484b-a57a-3e9abe0f8e3f": {
    nodes: [
      {
        id: "gmail-trigger-1",
        type: "custom",
        position: { x: 750, y: 50 },
        data: {
          type: "gmail_trigger_new_email",
          title: "Invoice Email",
          description: "New invoice received via email",
          isTrigger: true,
          providerId: "gmail",
          config: {
            labelIds: [],
            includeSpamTrash: false,
          },
        },
      },
      {
        id: "invoice-router",
        type: "custom",
        position: { x: 750, y: 240 },
        data: {
          type: "ai_router",
          title: "Classify Invoice",
          description: "Decide approval path based on amount and vendor",
          config: {
            template: "custom",
            systemPrompt:
              "You are a finance assistant. Review the invoice email content and categorize into executive_approval (large/high risk), manager_review (standard invoices), or accounting_processing (reconciliation/batched). Prefer executive_approval when the amount is unusually high or vendor is strategic.",
            model: "gpt-4o-mini",
            apiSource: "chainreact",
            memory: "workflow",
            outputPaths: [
              {
                id: "executive_approval",
                name: "Executive Approval",
                description: "High-value invoices needing executive sign-off",
                color: "#f97316",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "manager_review",
                name: "Manager Review",
                description: "Operational invoices routed to managers",
                color: "#0ea5e9",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "accounting_processing",
                name: "Accounting Queue",
                description: "Routine invoices for accounting processing",
                color: "#22c55e",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "manual_review",
                name: "Needs Manual Review",
                description: "Unclear routing, flag manually",
                color: "#6b7280",
                condition: { type: "fallback" },
              },
            ],
            decisionMode: "single",
            includeReasoning: true,
            temperature: 0.15,
            maxRetries: 1,
            timeout: 30,
            costLimit: 0.35,
          },
        },
      },
      // Executive branch
      {
        id: "exec-summary",
        type: "custom",
        position: { x: 240, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Invoice (Executive)",
          description: "Summarize invoice details for executive review",
          config: {
            inputText: "{{trigger.email.body}}",
            maxLength: 180,
            style: "brief",
            focus: "vendor, amount, due date, purpose",
          },
        },
      },
      {
        id: "exec-vendor",
        type: "custom",
        position: { x: 240, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Identify Vendor",
          description: "Extract the vendor name",
          config: {
            inputData: {
              summary: "{{node.exec-summary.output.summary}}",
              original: "{{trigger.email.body}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "exec-amount",
        type: "custom",
        position: { x: 240, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "Extract Amount",
          description: "Provide the total invoice amount in currency format",
          config: {
            inputData: {
              summary: "{{node.exec-summary.output.summary}}",
              original: "{{trigger.email.body}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-1-airtable",
        type: "custom",
        position: { x: 240, y: 840 },
        data: {
          type: "airtable_action_create_record",
          title: "Log Executive Invoice",
          description: "Create record for executive approval",
          providerId: "airtable",
          config: {
            baseId: "",
            tableName: "",
            fields: {
              Vendor: "{{node.exec-vendor.output.content}}",
              Amount: "{{node.exec-amount.output.content}}",
              Status: "Pending Executive Approval",
            },
          },
          validationState: {
            missingRequired: ["baseId", "tableName"],
          },
        },
      },
      {
        id: "exec-notify",
        type: "custom",
        position: { x: 240, y: 980 },
        data: {
          type: "ai_action_generate",
          title: "Executive Approval Request",
          description: "Draft message requesting approval",
          config: {
            inputData: {
              summary: "{{node.exec-summary.output.summary}}",
              vendor: "{{node.exec-vendor.output.content}}",
              amount: "{{node.exec-amount.output.content}}",
            },
            contentType: "response",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-1-slack",
        type: "custom",
        position: { x: 240, y: 1120 },
        data: {
          type: "slack_action_send_message",
          title: "Alert Executive Team",
          description: "Notify execs about pending approval",
          providerId: "slack",
          config: {
            channelId: "",
            message: "{{node.exec-notify.output.content}}",
          },
          validationState: {
            missingRequired: ["channelId"],
          },
        },
      },
      // Manager branch
      {
        id: "mgr-summary",
        type: "custom",
        position: { x: 750, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Invoice (Manager)",
          description: "Summarize invoice details for manager review",
          config: {
            inputText: "{{trigger.email.body}}",
            maxLength: 160,
            style: "brief",
            focus: "vendor, item/service, total, due date",
          },
        },
      },
      {
        id: "mgr-vendor",
        type: "custom",
        position: { x: 750, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Vendor (Manager)",
          description: "Extract vendor for manager workflow",
          config: {
            inputData: {
              summary: "{{node.mgr-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "mgr-amount",
        type: "custom",
        position: { x: 750, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "Amount (Manager)",
          description: "Extract invoice amount",
          config: {
            inputData: {
              summary: "{{node.mgr-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-2-airtable",
        type: "custom",
        position: { x: 750, y: 840 },
        data: {
          type: "airtable_action_create_record",
          title: "Log Manager Invoice",
          description: "Create record for manager approval queue",
          providerId: "airtable",
          config: {
            baseId: "",
            tableName: "",
            fields: {
              Vendor: "{{node.mgr-vendor.output.content}}",
              Amount: "{{node.mgr-amount.output.content}}",
              Status: "Pending Manager Review",
            },
          },
          validationState: {
            missingRequired: ["baseId", "tableName"],
          },
        },
      },
      {
        id: "mgr-notify",
        type: "custom",
        position: { x: 750, y: 980 },
        data: {
          type: "ai_action_generate",
          title: "Manager Approval Message",
          description: "Draft message for manager review",
          config: {
            inputData: {
              summary: "{{node.mgr-summary.output.summary}}",
              vendor: "{{node.mgr-vendor.output.content}}",
              amount: "{{node.mgr-amount.output.content}}",
            },
            contentType: "response",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-2-slack",
        type: "custom",
        position: { x: 750, y: 1120 },
        data: {
          type: "slack_action_send_message",
          title: "Notify Manager",
          description: "Send the approval request to the manager channel",
          providerId: "slack",
          config: {
            channelId: "",
            message: "{{node.mgr-notify.output.content}}",
          },
          validationState: {
            missingRequired: ["channelId"],
          },
        },
      },
      // Accounting branch
      {
        id: "acct-summary",
        type: "custom",
        position: { x: 1260, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Invoice (Accounting)",
          description: "Summarize for accounting reconciliation",
          config: {
            inputText: "{{trigger.email.body}}",
            maxLength: 150,
            style: "brief",
            focus: "vendor, invoice number, total, due date, notes",
          },
        },
      },
      {
        id: "acct-vendor",
        type: "custom",
        position: { x: 1260, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Vendor (Accounting)",
          description: "Extract vendor for accounting entry",
          config: {
            inputData: {
              summary: "{{node.acct-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "acct-amount",
        type: "custom",
        position: { x: 1260, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "Amount (Accounting)",
          description: "Extract amount for accounting record",
          config: {
            inputData: {
              summary: "{{node.acct-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-3-airtable",
        type: "custom",
        position: { x: 1260, y: 840 },
        data: {
          type: "airtable_action_create_record",
          title: "Queue for Accounting",
          description: "Log invoice for accounting processing",
          providerId: "airtable",
          config: {
            baseId: "",
            tableName: "",
            fields: {
              Vendor: "{{node.acct-vendor.output.content}}",
              Amount: "{{node.acct-amount.output.content}}",
              Status: "In Accounting Queue",
            },
          },
          validationState: {
            missingRequired: ["baseId", "tableName"],
          },
        },
      },
      {
        id: "acct-notify",
        type: "custom",
        position: { x: 1260, y: 980 },
        data: {
          type: "ai_action_generate",
          title: "Accounting Notification",
          description: "Draft update for accounting channel",
          config: {
            inputData: {
              summary: "{{node.acct-summary.output.summary}}",
              vendor: "{{node.acct-vendor.output.content}}",
              amount: "{{node.acct-amount.output.content}}",
            },
            contentType: "response",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-3-slack",
        type: "custom",
        position: { x: 1260, y: 1120 },
        data: {
          type: "slack_action_send_message",
          title: "Notify Accounting",
          description: "Share invoice details with accounting",
          providerId: "slack",
          config: {
            channelId: "",
            message: "{{node.acct-notify.output.content}}",
          },
          validationState: {
            missingRequired: ["channelId"],
          },
        },
      },
    ],
    connections: [
      { id: "invoice-edge-0", source: "gmail-trigger-1", target: "invoice-router" },
      {
        id: "invoice-edge-1",
        source: "invoice-router",
        target: "exec-summary",
        sourceHandle: "executive_approval",
      },
      { id: "invoice-edge-2", source: "exec-summary", target: "exec-vendor" },
      { id: "invoice-edge-3", source: "exec-vendor", target: "exec-amount" },
      { id: "invoice-edge-4", source: "exec-amount", target: "chain-1-airtable" },
      { id: "invoice-edge-5", source: "chain-1-airtable", target: "exec-notify" },
      { id: "invoice-edge-6", source: "exec-notify", target: "chain-1-slack" },
      {
        id: "invoice-edge-7",
        source: "invoice-router",
        target: "mgr-summary",
        sourceHandle: "manager_review",
      },
      { id: "invoice-edge-8", source: "mgr-summary", target: "mgr-vendor" },
      { id: "invoice-edge-9", source: "mgr-vendor", target: "mgr-amount" },
      { id: "invoice-edge-10", source: "mgr-amount", target: "chain-2-airtable" },
      { id: "invoice-edge-11", source: "chain-2-airtable", target: "mgr-notify" },
      { id: "invoice-edge-12", source: "mgr-notify", target: "chain-2-slack" },
      {
        id: "invoice-edge-13",
        source: "invoice-router",
        target: "acct-summary",
        sourceHandle: "accounting_processing",
      },
      { id: "invoice-edge-14", source: "acct-summary", target: "acct-vendor" },
      { id: "invoice-edge-15", source: "acct-vendor", target: "acct-amount" },
      { id: "invoice-edge-16", source: "acct-amount", target: "chain-3-airtable" },
      { id: "invoice-edge-17", source: "chain-3-airtable", target: "acct-notify" },
      { id: "invoice-edge-18", source: "acct-notify", target: "chain-3-slack" },
    ],
  },
  // Customer Feedback Analysis & Routing
  "b5eeeb0b-3765-4bf8-9dfe-b6f32ecd5cba": {
    nodes: [
      {
        id: "airtable-trigger-1",
        type: "custom",
        position: { x: 750, y: 50 },
        data: {
          type: "airtable_trigger_new_record",
          title: "New Survey Response",
          description: "Customer feedback submitted",
          isTrigger: true,
          providerId: "airtable",
          config: { baseId: "", tableName: "" },
          validationState: {
            missingRequired: ["baseId", "tableName"],
          },
        },
      },
      {
        id: "feedback-router",
        type: "custom",
        position: { x: 750, y: 240 },
        data: {
          type: "ai_router",
          title: "Categorize Feedback",
          description: "Route feedback to product, support, or success teams",
          config: {
            template: "custom",
            systemPrompt:
              "You are a customer insights assistant. Review the feedback details and categorize into: product_feature (feature ideas), support_issue (bugs/friction), or customer_praise (positive feedback). Choose customer_praise only when no action is needed.",
            model: "gpt-4o-mini",
            apiSource: "chainreact",
            memory: "workflow",
            outputPaths: [
              {
                id: "product_feature",
                name: "Product Feature Request",
                description: "Ideas and enhancement requests for product",
                color: "#10b981",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "support_issue",
                name: "Bug or Support Issue",
                description: "Bugs, outages, or customer problems",
                color: "#ef4444",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "customer_praise",
                name: "Positive Feedback",
                description: "Testimonials and praise to share internally",
                color: "#6366f1",
                condition: { type: "ai_decision", minConfidence: 0.55 },
              },
              {
                id: "manual_review",
                name: "Needs Manual Review",
                description: "Unable to classify confidently",
                color: "#6b7280",
                condition: { type: "fallback" },
              },
            ],
            decisionMode: "single",
            includeReasoning: true,
            temperature: 0.15,
            maxRetries: 1,
            timeout: 30,
            costLimit: 0.35,
          },
        },
      },
      {
        id: "product-summary",
        type: "custom",
        position: { x: 240, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Feature Idea",
          description: "Summarize the request to capture the core idea",
          config: {
            inputText: "{{trigger.fields}}",
            maxLength: 220,
            style: "brief",
            focus: "user need, requested change, motivation",
          },
        },
      },
      {
        id: "product-details",
        type: "custom",
        position: { x: 240, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Outline Feature Details",
          description: "Provide structured detail for product planning",
          config: {
            inputData: {
              summary: "{{node.product-summary.output.summary}}",
              original: "{{trigger.fields}}",
            },
            contentType: "report",
            tone: "professional",
            length: "medium",
          },
        },
      },
      {
        id: "product-title",
        type: "custom",
        position: { x: 240, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "Create Feature Title",
          description: "Generate a concise feature name",
          config: {
            inputData: {
              summary: "{{node.product-summary.output.summary}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-1-notion",
        type: "custom",
        position: { x: 240, y: 840 },
        data: {
          type: "notion_action_create_page",
          title: "Log Feature Idea",
          description: "Create a backlog entry for product review",
          providerId: "notion",
          config: {
            databaseId: "",
            title: "{{node.product-title.output.content}}",
            content: "{{node.product-details.output.content}}",
          },
          validationState: {
            missingRequired: ["databaseId"],
          },
        },
      },
      {
        id: "product-notify",
        type: "custom",
        position: { x: 240, y: 980 },
        data: {
          type: "ai_action_generate",
          title: "Notify Product Team",
          description: "Share highlights with the product team",
          config: {
            inputData: {
              summary: "{{node.product-summary.output.summary}}",
              title: "{{node.product-title.output.content}}",
            },
            contentType: "response",
            tone: "friendly",
            length: "short",
          },
        },
      },
      {
        id: "chain-1-slack",
        type: "custom",
        position: { x: 240, y: 1120 },
        data: {
          type: "slack_action_send_message",
          title: "Alert Product Team",
          description: "Let product know about new feedback",
          providerId: "slack",
          config: {
            channelId: "",
            message: "{{node.product-notify.output.content}}",
          },
          validationState: {
            missingRequired: ["channelId"],
          },
        },
      },
      {
        id: "support-summary",
        type: "custom",
        position: { x: 750, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Support Issue",
          description: "Capture the core problem reported",
          config: {
            inputText: "{{trigger.fields}}",
            maxLength: 200,
            style: "brief",
            focus: "issue symptoms, impacted user, urgency signals",
          },
        },
      },
      {
        id: "support-customer",
        type: "custom",
        position: { x: 750, y: 560 },
        data: {
          type: "ai_action_generate",
          title: "Identify Customer",
          description: "Provide the customer's name or company",
          config: {
            inputData: {
              original: "{{trigger.fields}}",
            },
            contentType: "summary",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "support-priority",
        type: "custom",
        position: { x: 750, y: 700 },
        data: {
          type: "ai_action_classify",
          title: "Set Priority",
          description: "Classify the urgency of the issue",
          config: {
            inputText: "{{node.support-summary.output.summary}}",
            categories: ["Critical", "High", "Medium", "Low"],
            confidence: true,
          },
        },
      },
      {
        id: "chain-2-airtable",
        type: "custom",
        position: { x: 750, y: 840 },
        data: {
          type: "airtable_action_create_record",
          title: "Create Support Ticket",
          description: "Log the issue for support follow-up",
          providerId: "airtable",
          config: {
            baseId: "",
            tableName: "",
            fields: {
              Issue: "{{node.support-summary.output.summary}}",
              Customer: "{{node.support-customer.output.content}}",
              Priority: "{{node.support-priority.output.classification}}",
            },
          },
          validationState: {
            missingRequired: ["baseId", "tableName"],
          },
        },
      },
      {
        id: "support-alert",
        type: "custom",
        position: { x: 750, y: 980 },
        data: {
          type: "ai_action_generate",
          title: "Support Alert Message",
          description: "Draft an alert for the support channel",
          config: {
            inputData: {
              summary: "{{node.support-summary.output.summary}}",
              priority: "{{node.support-priority.output.classification}}",
              customer: "{{node.support-customer.output.content}}",
            },
            contentType: "response",
            tone: "professional",
            length: "short",
          },
        },
      },
      {
        id: "chain-2-slack",
        type: "custom",
        position: { x: 750, y: 1120 },
        data: {
          type: "slack_action_send_message",
          title: "Notify Support Team",
          description: "Alert support about the new issue",
          providerId: "slack",
          config: {
            channelId: "",
            message: "{{node.support-alert.output.content}}",
          },
          validationState: {
            missingRequired: ["channelId"],
          },
        },
      },
      {
        id: "praise-summary",
        type: "custom",
        position: { x: 1250, y: 420 },
        data: {
          type: "ai_action_summarize",
          title: "Summarize Praise",
          description: "Capture the customer praise details",
          config: {
            inputText: "{{trigger.fields}}",
            maxLength: 180,
            style: "brief",
            focus: "customer sentiment, product area, highlight quotes",
          },
        },
      },
      {
        id: "chain-3-airtable",
        type: "custom",
        position: { x: 1250, y: 560 },
        data: {
          type: "airtable_action_update_record",
          title: "Tag as Success Story",
          description: "Mark the record for CS follow-up",
          providerId: "airtable",
          config: {
            baseId: "",
            tableName: "",
            recordId: "{{trigger.recordId}}",
            fields: {
              Status: "Celebration",
              Notes: "{{node.praise-summary.output.summary}}",
            },
          },
          validationState: {
            missingRequired: ["baseId", "tableName"],
          },
        },
      },
      {
        id: "praise-message",
        type: "custom",
        position: { x: 1250, y: 700 },
        data: {
          type: "ai_action_generate",
          title: "Celebrate with Team",
          description: "Create a celebratory message for the team",
          config: {
            inputData: {
              summary: "{{node.praise-summary.output.summary}}",
            },
            contentType: "response",
            tone: "friendly",
            length: "short",
          },
        },
      },
      {
        id: "chain-3-slack",
        type: "custom",
        position: { x: 1250, y: 840 },
        data: {
          type: "slack_action_send_message",
          title: "Share Win in Slack",
          description: "Post the praise in a celebrations channel",
          providerId: "slack",
          config: {
            channelId: "",
            message: "{{node.praise-message.output.content}}",
          },
          validationState: {
            missingRequired: ["channelId"],
          },
        },
      },
    ],
    connections: [
      { id: "feedback-edge-0", source: "airtable-trigger-1", target: "feedback-router" },
      {
        id: "feedback-edge-1",
        source: "feedback-router",
        target: "product-summary",
        sourceHandle: "product_feature",
      },
      { id: "feedback-edge-2", source: "product-summary", target: "product-details" },
      { id: "feedback-edge-3", source: "product-details", target: "product-title" },
      { id: "feedback-edge-4", source: "product-title", target: "chain-1-notion" },
      { id: "feedback-edge-5", source: "product-title", target: "product-notify" },
      { id: "feedback-edge-6", source: "chain-1-notion", target: "product-notify" },
      { id: "feedback-edge-7", source: "product-notify", target: "chain-1-slack" },
      {
        id: "feedback-edge-8",
        source: "feedback-router",
        target: "support-summary",
        sourceHandle: "support_issue",
      },
      { id: "feedback-edge-9", source: "support-summary", target: "support-customer" },
      { id: "feedback-edge-10", source: "support-customer", target: "support-priority" },
      { id: "feedback-edge-11", source: "support-priority", target: "chain-2-airtable" },
      { id: "feedback-edge-12", source: "chain-2-airtable", target: "support-alert" },
      { id: "feedback-edge-13", source: "support-alert", target: "chain-2-slack" },
      {
        id: "feedback-edge-14",
        source: "feedback-router",
        target: "praise-summary",
        sourceHandle: "customer_praise",
      },
      { id: "feedback-edge-15", source: "praise-summary", target: "chain-3-airtable" },
      { id: "feedback-edge-16", source: "chain-3-airtable", target: "praise-message" },
      { id: "feedback-edge-17", source: "praise-message", target: "chain-3-slack" },
    ],
  },
}

Object.values(templateUpdates).forEach(template => {
  template.nodes = layoutNodes(template.nodes, template.connections)
})

async function run() {
  for (const [templateId, payload] of Object.entries(templateUpdates)) {
    console.log(`Updating template ${templateId}...`)

    const { error } = await supabase
      .from("templates")
      .update({
        nodes: payload.nodes,
        connections: payload.connections,
      })
      .eq("id", templateId)

    if (error) {
      console.error(`❌ Failed to update template ${templateId}`, error)
      process.exitCode = 1
    } else {
      console.log(`✅ Updated template ${templateId}`)
    }
  }
}

run()
  .then(() => {
    if (!process.exitCode) {
      console.log("All template updates complete.")
    }
  })
  .catch((error) => {
    console.error("Unexpected error while updating templates:", error)
    process.exit(1)
  })
