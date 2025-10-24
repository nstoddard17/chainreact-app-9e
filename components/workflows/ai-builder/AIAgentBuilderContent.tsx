"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Send,
  Sparkles,
  Loader2,
  ArrowLeft,
  Wand2,
  Zap,
  Clock,
  CheckCircle
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/stores/authStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useWorkflowStore } from "@/stores/workflowStore"
import { useToast } from "@/hooks/use-toast"
import { logger } from "@/lib/utils/logger"
import { AIAgentPreferenceModal } from "../AIAgentPreferenceModal"

// Typing animation phrases
const TYPING_PHRASES = [
  "Send me a Slack message when someone fills out my contact form",
  "Create a daily summary of my Gmail inbox every morning at 8am",
  "Post my new blog articles to Twitter and LinkedIn automatically",
  "Add new Stripe customers to my Google Sheets spreadsheet",
  "Send a welcome email when someone signs up on my website"
]

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  status?: 'pending' | 'complete' | 'error'
}

const EXAMPLE_PROMPTS = [
  {
    category: 'Marketing',
    examples: [
      {
        display: 'Send me a Slack notification whenever someone mentions my company on Twitter',
        prompt: `Create a workflow that monitors Twitter for mentions of my company name and brand keywords. When someone tweets about us:
1. Capture the tweet content, author, and link
2. Analyze the sentiment (positive, negative, or neutral)
3. Send me a Slack message with the tweet details and sentiment
4. Include a direct link to reply to the tweet

Configure this to:
- Monitor for my company name and 3-5 brand keywords
- Check Twitter every 5 minutes
- Send alerts to my #social-media Slack channel
- Tag me (@username) if the sentiment is negative so I can respond quickly
- Include tweet metrics (likes, retweets) in the notification`
      },
      {
        display: 'Automatically send a welcome email series to new subscribers',
        prompt: `Build an automated email welcome series for new subscribers. When someone signs up:
1. Immediately send a welcome email with a thank you message
2. Wait 2 days, then send an email about our main features/benefits
3. Wait 3 more days, then send customer success stories
4. Wait 4 more days, then send a special offer or call-to-action

Configure this to:
- Trigger when a new subscriber is added to my email list
- Use my company's email template design
- Personalize each email with the subscriber's first name
- Track email opens and clicks
- Stop the sequence if they make a purchase or unsubscribe
- Send me a notification when someone completes the entire sequence`
      },
      {
        display: 'Post my new content to all my social media accounts at once',
        prompt: `Create a workflow that automatically cross-posts content to all my social platforms. When I publish new content:
1. Detect when a new blog post or article is published
2. Generate platform-specific posts for Twitter, LinkedIn, and Facebook
3. Optimize the message length and hashtags for each platform
4. Schedule the posts to go out at optimal times for engagement
5. Track engagement metrics across all platforms

Configure this to:
- Monitor my blog RSS feed for new posts
- Extract the title, excerpt, and featured image
- Create a short version for Twitter (with relevant hashtags)
- Create a professional version for LinkedIn (with @company mention)
- Create an engaging version for Facebook (with call-to-action)
- Post to Twitter immediately, LinkedIn at 9am next business day, Facebook at 2pm
- Send me a daily summary of post performance`
      }
    ]
  },
  {
    category: 'Operations',
    examples: [
      {
        display: 'Keep customer information synced between my CRM and email marketing tool',
        prompt: `Build a two-way sync between my CRM and email marketing platform. This workflow should:
1. When a new contact is added to the CRM, automatically add them to my email list
2. When contact details are updated in either system, update the other
3. When someone unsubscribes from emails, update their status in the CRM
4. When a deal is won in the CRM, add the contact to a "customers" segment in email marketing

Configure this to:
- Sync every 15 minutes to keep data fresh
- Map all standard fields (name, email, phone, company, etc.)
- Include custom fields (industry, deal size, lead source)
- Prevent duplicate entries
- Log all sync activities for troubleshooting
- Send me a weekly report of sync statistics (contacts added, updated, errors)
- Alert me immediately if a sync fails`
      },
      {
        display: 'Automatically create invoices and send payment reminders',
        prompt: `Create an automated invoicing and payment reminder system. When a project is completed:
1. Generate an invoice with all project details and costs
2. Email the invoice to the client
3. Track the invoice status (sent, viewed, paid)
4. Send a friendly reminder 3 days before due date
5. Send a follow-up reminder on the due date
6. Send a final reminder 3 days after due date
7. Notify me if payment is 7 days overdue

Configure this to:
- Trigger when I mark a project as "Complete" in my project management tool
- Pull project details, hours worked, and rate from the PM tool
- Generate a professional PDF invoice with my company branding
- Email from my business email address
- Track when the client opens the invoice email
- Update the invoice status when payment is received
- Send me a monthly report of paid vs. outstanding invoices`
      },
      {
        display: 'Send my team a weekly summary of important metrics and updates',
        prompt: `Build a weekly team digest that automatically compiles and sends key information. Every Monday at 9am:
1. Gather metrics from multiple tools (sales, support, analytics)
2. Compile a summary of last week's achievements
3. List upcoming deadlines and priorities
4. Include any important announcements or updates
5. Format everything into an easy-to-read email
6. Send to the entire team via email and post in Slack

Configure this to:
- Pull sales data (deals closed, revenue) from CRM
- Pull support metrics (tickets resolved, customer satisfaction) from help desk
- Pull website analytics (visitors, conversions) from Google Analytics
- Pull project status from project management tool
- Create charts/graphs for visual metrics
- Include a "wins of the week" section
- Add a "what's coming this week" section
- Send every Monday at 9am
- Post the same summary in our #team-updates Slack channel`
      }
    ]
  },
  {
    category: 'Product',
    examples: [
      {
        display: 'Collect all customer feedback from different channels into one place',
        prompt: `Create a central feedback collection system that gathers input from all channels. When customers provide feedback:
1. Monitor support tickets, emails, chat messages, and social media
2. Detect messages containing feedback, feature requests, or complaints
3. Extract the key points and categorize them (bug, feature request, complaint, praise)
4. Add all feedback to a master spreadsheet with source, category, and date
5. Tag and organize by theme/topic
6. Notify the product team in Slack about high-priority items

Configure this to:
- Monitor Gmail for emails with keywords like "feedback", "suggestion", "issue"
- Check support ticket system for feedback-tagged tickets
- Monitor Twitter and Facebook for mentions and comments
- Use AI to categorize feedback automatically (bug, feature, UX, performance)
- Add sentiment analysis (positive, negative, neutral)
- Create a Google Sheets master list with columns: Date, Source, Customer, Category, Sentiment, Feedback
- Send a notification to #product-feedback Slack channel for urgent issues
- Generate a weekly summary report of top themes and trends`
      },
      {
        display: 'Get notified when app performance drops below acceptable levels',
        prompt: `Build a comprehensive app performance monitoring and alerting system. Continuously monitor:
1. Server response times and API latency
2. Error rates and types
3. Page load speeds
4. Database query performance
5. Server resource usage (CPU, memory)

When issues are detected:
- Send immediate alerts for critical problems
- Create detailed incident reports
- Notify the on-call engineer
- Log all issues for later analysis

Configure this to:
- Check performance metrics every 2 minutes
- Alert if average response time exceeds 2 seconds
- Alert if error rate exceeds 1%
- Alert if any page takes longer than 5 seconds to load
- Send critical alerts via Slack and SMS
- Send warning alerts via Slack only
- Include performance graphs in alert messages
- Automatically create a GitHub issue for each incident
- Track when issues are resolved
- Generate daily performance reports`
      },
      {
        display: 'Automatically reply to common feature requests with status updates',
        prompt: `Create an intelligent feature request response system. When customers request features:
1. Detect when someone asks about a feature
2. Check if this feature is already requested/planned/built
3. Send an appropriate automated response based on status
4. Add new requests to the product roadmap
5. Notify the product team about trending requests

Configure this to:
- Monitor support tickets, emails, and chat for feature-related keywords
- Maintain a database of feature requests with status (planned, in progress, completed, not planned)
- If feature is already completed: Send info about the feature and how to use it
- If feature is in progress: Send timeline and expected release date
- If feature is planned: Send acknowledgment and add them to update list
- If feature is new: Thank them, add to roadmap, and notify product team
- Track which features are most requested
- Send monthly report to product team with top requests
- Auto-update customers when requested features are released`
      }
    ]
  },
  {
    category: 'Data',
    examples: [
      {
        display: 'Backup all my important business data to Google Sheets every day',
        prompt: `Build a comprehensive daily data backup system. Every day at 2am:
1. Export data from all business systems
2. Save to organized Google Sheets
3. Verify backup completed successfully
4. Alert if backup fails

Export and backup:
- Customer list from CRM (name, email, company, status, value)
- Sales data (deals, amounts, stages, close dates)
- Support tickets (open, in progress, closed, customer satisfaction)
- Website analytics (visitors, conversions, top pages)
- Email campaign results (sent, opened, clicked, unsubscribed)
- Financial transactions (invoices, payments, outstanding)

Configure this to:
- Run automatically every night at 2am
- Create a new folder in Google Drive for each month
- Name files with date: "CRM_Backup_2024-01-15.xlsx"
- Keep backups for 90 days, then auto-delete old ones
- Send confirmation email when backup completes
- Send urgent alert (email + Slack) if any backup fails
- Include row count in confirmation to verify data completeness`
      },
      {
        display: 'Create and email a weekly analytics report with charts and insights',
        prompt: `Build an automated weekly analytics reporting system. Every Monday at 8am:
1. Gather data from all analytics sources
2. Generate charts and visualizations
3. Calculate week-over-week changes
4. Highlight key insights and trends
5. Create a professional PDF report
6. Email to stakeholders

The report should include:
- Website traffic (sessions, users, pageviews, bounce rate)
- Conversion metrics (signups, trials, purchases, conversion rates)
- Revenue data (total revenue, average order value, recurring revenue)
- Marketing performance (email open rates, social engagement, ad performance)
- Customer metrics (new customers, churn rate, lifetime value)
- Top performing pages and content

Configure this to:
- Pull data from Google Analytics, Stripe, email marketing, and social media
- Create beautiful charts for each metric section
- Show comparison to previous week (% change, up/down indicators)
- Highlight significant changes (>20% increase or decrease)
- Include AI-generated insights and recommendations
- Generate a mobile-friendly PDF report
- Email to leadership team with summary in email body
- Post key metrics in #analytics Slack channel
- Archive reports in Google Drive`
      },
      {
        display: 'Find and merge duplicate contacts in my CRM automatically',
        prompt: `Create an automated CRM data cleaning system. This workflow should:
1. Scan CRM database for potential duplicate contacts
2. Identify duplicates based on email, name, phone, and company
3. Merge duplicates intelligently, keeping the most complete information
4. Standardize data formats (phone numbers, addresses, company names)
5. Fill in missing information where possible
6. Flag uncertain matches for manual review

Configure this to:
- Run automatically every Sunday at 3am
- Find duplicates by matching: exact email match, similar names with same company
- When merging, keep: most recent activity date, most complete contact info
- Standardize: phone numbers to (555) 555-5555 format
- Standardize: company names (remove Inc., LLC, etc.)
- Capitalize names properly
- Remove extra spaces and special characters
- Fill in missing job titles from LinkedIn
- Fill in missing company info from company database
- Create a report of all merges performed
- Flag matches with <80% confidence for manual review
- Send weekly summary: contacts cleaned, duplicates merged, fields updated
- Never auto-merge contacts with different email addresses`
      }
    ]
  },
  {
    category: 'Builders',
    examples: [
      {
        display: 'Create a reusable template for onboarding new team members',
        prompt: `Build a comprehensive new employee onboarding workflow template. When a new hire starts:
1. Create accounts in all necessary tools
2. Send welcome email with first-day information
3. Assign onboarding tasks with due dates
4. Schedule introduction meetings with team
5. Deliver training materials progressively
6. Track onboarding progress
7. Collect feedback after 30 days

The template should include:
- Day 1: Send welcome email, create email account, send equipment info
- Day 1: Create accounts (Slack, project management, CRM, etc.)
- Day 2: Send company handbook and policies
- Day 3: Schedule 1-on-1 meetings with manager and team members
- Week 1: Send role-specific training materials
- Week 2: Assign first project or task
- Day 30: Send onboarding survey for feedback

Configure this to:
- Trigger when HR marks someone as "Starting Soon" in HRIS
- Pull new hire info: name, email, role, department, start date
- Auto-generate company email address from name
- Send automated emails on schedule
- Create task list in project management tool
- Assign tasks to appropriate people (IT, HR, manager)
- Send reminders for incomplete tasks
- Track completion percentage
- Alert manager if onboarding is behind schedule
- Collect and compile 30-day feedback survey results`
      },
      {
        display: 'Build a system to automatically test and validate new integrations',
        prompt: `Create an automated integration testing workflow. When a new integration is deployed:
1. Run a series of automated test scenarios
2. Validate data flows correctly between systems
3. Check for errors or data loss
4. Verify API responses and timing
5. Test edge cases and error handling
6. Generate detailed test report
7. Alert team if tests fail

Configure this to:
- Trigger when code is deployed to integration endpoints
- Test scenarios: create record, update record, delete record, batch operations
- Validate: correct data format, all fields mapped, no data loss
- Test error handling: invalid data, API timeouts, authentication failures
- Check performance: response times, rate limits, concurrency
- Test with sample data that covers edge cases
- Run tests in staging environment first
- Generate detailed test report with: pass/fail status, response times, error logs
- If all tests pass: auto-deploy to production and notify team
- If any test fails: block deployment and alert engineers
- Send test results to #engineering Slack channel
- Archive test results for compliance`
      },
      {
        display: 'Design a workflow that automatically scales based on usage',
        prompt: `Build an intelligent auto-scaling workflow system. This should:
1. Monitor workflow execution volume and performance
2. Detect when processing is slowing down
3. Automatically add more processing capacity
4. Scale back down during low usage periods
5. Optimize costs by running only what's needed
6. Alert if scaling issues occur

Configure this to:
- Monitor: number of workflows running, queue depth, average processing time
- Scale up when: queue depth exceeds 100 items, or processing time exceeds 5 minutes
- Scale down when: queue is empty for 15 minutes and processing time is under 2 minutes
- Scaling actions: add parallel workers, increase API rate limits, allocate more memory
- Cost optimization: use cheaper slow processing for non-urgent workflows
- Priority system: urgent workflows get processed first
- Track metrics: total workflows processed, average processing time, cost per workflow
- Alert if: queue depth exceeds 500, processing time exceeds 15 minutes, error rate exceeds 5%
- Send daily report: workflows processed, peak usage times, scaling events, costs
- Automatically adjust scaling thresholds based on usage patterns`
      }
    ]
  }
]

export function AIAgentBuilderContent() {
  const router = useRouter()
  const { user, profile, updateProfile } = useAuthStore()
  const { getConnectedProviders } = useIntegrationStore()
  const { createWorkflow } = useWorkflowStore()
  const { toast } = useToast()
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isCreatingWorkflow, setIsCreatingWorkflow] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [placeholderText, setPlaceholderText] = useState('')
  const [showCursor, setShowCursor] = useState(true)
  const [preferenceModalOpen, setPreferenceModalOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  const connectedProviders = getConnectedProviders()

  // Auto-focus input on page load
  useEffect(() => {
    if (inputRef.current && messages.length === 0) {
      inputRef.current.focus()
    }
  }, [messages.length])

  // Typing animation effect with cursor
  useEffect(() => {
    let phraseIndex = 0
    let charIndex = 0
    let isDeleting = false
    let typingSpeed = 100
    let cursorBlinkInterval: NodeJS.Timeout

    const typeText = () => {
      const currentPhrase = TYPING_PHRASES[phraseIndex]

      if (isDeleting) {
        setPlaceholderText(currentPhrase.substring(0, charIndex - 1))
        charIndex--
        typingSpeed = 30
        setShowCursor(true) // Show cursor while typing/deleting
      } else {
        setPlaceholderText(currentPhrase.substring(0, charIndex + 1))
        charIndex++
        typingSpeed = 100
        setShowCursor(true) // Show cursor while typing/deleting
      }

      if (!isDeleting && charIndex === currentPhrase.length) {
        // Finished typing, pause and blink cursor
        typingSpeed = 2000
        isDeleting = true
        // Start cursor blinking
        cursorBlinkInterval = setInterval(() => {
          setShowCursor(prev => !prev)
        }, 530)
        setTimeout(() => {
          clearInterval(cursorBlinkInterval)
          setShowCursor(true)
        }, 2000)
      } else if (isDeleting && charIndex === 0) {
        // Finished deleting, immediately start typing next phrase
        isDeleting = false
        phraseIndex = (phraseIndex + 1) % TYPING_PHRASES.length
        typingSpeed = 0 // Start immediately with no delay
      }

      setTimeout(typeText, typingSpeed)
    }

    const timer = setTimeout(typeText, 500)
    return () => {
      clearTimeout(timer)
      if (cursorBlinkInterval) clearInterval(cursorBlinkInterval)
    }
  }, [])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [messages])

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return

    // Check if this is the first message BEFORE updating any state
    const isFirstMessage = messages.length === 0
    const messageText = input // Store before clearing

    if (isFirstMessage) {
      // Redirect immediately without updating UI state
      try {
        setIsLoading(true)

        // Create a new workflow
        const workflow = await createWorkflow("New Workflow", "Created from AI Agent")

        if (!workflow || !workflow.id) {
          throw new Error('Failed to create workflow')
        }

        logger.info('Created workflow:', workflow.id)

        // Redirect immediately - no toast, no delay
        const url = `/workflows/builder/${workflow.id}?aiChat=true&initialPrompt=${encodeURIComponent(messageText)}`
        logger.info('Redirecting to:', url)
        router.push(url)

        return
      } catch (error) {
        logger.error('Failed to create workflow:', error)
        toast({
          title: "Error",
          description: "Failed to create workflow. Please try again.",
          variant: "destructive"
        })
        setIsLoading(false)
        return
      }
    }

    // Only update UI state if NOT redirecting (for subsequent messages)
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {

      // For subsequent messages (shouldn't happen on this page, but just in case)
      const response = await fetch('/api/ai/workflow-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          connectedIntegrations: connectedProviders,
          conversationHistory: messages.slice(-5)
        })
      })

      if (!response.ok) throw new Error('Failed to get AI response')

      const data = await response.json()

      // Add AI response
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
        status: data.status || 'complete'
      }

      setMessages(prev => [...prev, assistantMessage])

    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'system',
        content: "I'm sorry, I encountered an error. Please try again.",
        timestamp: new Date(),
        status: 'error'
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleExampleClick = (prompt: string) => {
    setInput(prompt)
    setTimeout(() => {
      inputRef.current?.focus()
    }, 100)
  }

  const handleStartBuilding = async () => {
    setIsCreatingWorkflow(true)
    try {
      const workflow = await createWorkflow("New Workflow", "Created from React Agent")
      router.push(`/workflows/builder/${workflow.id}?reactAgent=true`)
    } catch (error) {
      logger.error("Failed to create workflow:", error)
      toast({
        title: "Error",
        description: "Failed to create workflow. Please try again.",
        variant: "destructive"
      })
      setIsCreatingWorkflow(false)
    }
  }

  // Handle skipping to manual builder with preference tracking
  const handleSkipToBuilder = async () => {
    const currentPref = profile?.ai_agent_preference || 'always_show'
    const currentSkipCount = profile?.ai_agent_skip_count || 0

    // Increment skip count
    const newSkipCount = currentSkipCount + 1

    // Update skip count in database
    try {
      await updateProfile({
        ai_agent_skip_count: newSkipCount
      })
    } catch (error) {
      logger.error('Failed to update skip count:', error)
    }

    // Check if we should show the preference modal
    if (currentPref === 'always_show' && newSkipCount >= 3) {
      // User has skipped 3 times - show preference modal
      setPreferenceModalOpen(true)
    } else if (currentPref === 'ask_later' && newSkipCount >= 1) {
      // User said "ask later" and has skipped again - show modal
      setPreferenceModalOpen(true)
    } else {
      // Just skip to builder
      router.push('/workflows')
    }
  }

  // Handle preference selection from modal
  const handlePreferenceSelection = async (preference: 'always_skip' | 'always_show' | 'ask_later') => {
    try {
      await updateProfile({
        ai_agent_preference: preference,
        ai_agent_skip_count: 0, // Reset counter
        ai_agent_preference_updated_at: new Date().toISOString()
      })

      toast({
        title: "Preference Saved",
        description: preference === 'always_skip'
          ? "You'll go straight to the builder next time."
          : preference === 'always_show'
          ? "We'll continue showing the AI agent."
          : "We'll ask you again next time."
      })

      // Navigate to workflows page
      router.push('/workflows')
    } catch (error) {
      logger.error('Failed to update preference:', error)
      toast({
        title: "Error",
        description: "Failed to save preference. Please try again.",
        variant: "destructive"
      })
    }
  }

  return (
    <div className="h-screen w-full bg-background flex flex-col relative overflow-hidden">
      {/* Dotted background pattern - matching workflow builder */}
      <div
        className="absolute inset-0 pointer-events-none opacity-50"
        style={{
          backgroundImage: 'radial-gradient(circle, hsl(var(--foreground) / 0.1) 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }}
      />

      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur-lg relative z-10">
        <div className="w-full px-6 py-3.5">
          <div className="flex items-center justify-between w-full">
            {/* Left side - Back button and workflow title */}
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSkipToBuilder}
                className="shrink-0 hover:bg-accent"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold">New Workflow</h1>
                <Badge variant="secondary" className="h-5 text-xs">
                  Not Scheduled
                </Badge>
              </div>
            </div>

            {/* Right side - Action buttons */}
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-8 text-xs">
                <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                Test
              </Button>
              <Button size="sm" className="h-8 text-xs">
                <Zap className="w-3.5 h-3.5 mr-1.5" />
                Publish
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden relative z-0">
        {messages.length === 0 ? (
          // Welcome Screen (Kadabra-style)
          <div className="h-full flex items-center justify-center px-6 py-8">
            <div className="max-w-5xl w-full space-y-6">
              {/* Header Section */}
              <div className="text-center space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/10 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-medium text-primary">AI-Powered Workflow Builder</span>
                </div>
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight">
                  Type any task, Get a working AI automation.
                </h2>
                <p className="text-muted-foreground text-sm md:text-base max-w-4xl mx-auto">
                  Describe your idea and React Agent builds the automation, tests, and deploys it in under 3 minutes.
                </p>
              </div>

              {/* Main Input */}
              <div className="max-w-3xl mx-auto">
                <div className="relative group">
                  {/* Animated placeholder with cursor */}
                  {!input && (
                    <div className="absolute left-4 pointer-events-none text-base text-muted-foreground/70 flex z-10" style={{ top: '1rem', lineHeight: '1.5rem' }}>
                      <span style={{ lineHeight: '1.5rem' }}>{placeholderText}</span>
                      <span
                        className={cn(
                          "inline-block w-0.5 bg-muted-foreground/70 ml-0.5 self-center",
                          showCursor ? "opacity-100" : "opacity-0"
                        )}
                        style={{
                          height: '1.25rem',
                          transition: 'opacity 0.1s'
                        }}
                      />
                    </div>
                  )}
                  <textarea
                    ref={inputRef as any}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSendMessage()
                      }
                    }}
                    placeholder=""
                    rows={4}
                    className="w-full text-base pl-4 pr-14 py-4 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-2xl transition-all duration-200 outline-none focus:outline-none focus:ring-0 focus:border-gray-200 dark:focus:border-zinc-700 shadow-md hover:shadow-lg focus:shadow-xl resize-none"
                    style={{ lineHeight: '1.5rem' }}
                    disabled={isLoading}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!input.trim() || isLoading}
                    className={cn(
                      "absolute right-3 bottom-3 p-2.5 rounded-xl transition-all duration-200",
                      input.trim() && !isLoading
                        ? "text-primary hover:bg-primary/10 cursor-pointer"
                        : "text-muted-foreground/40 cursor-not-allowed"
                    )}
                  >
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Category Examples */}
              <div className="space-y-6">
                <div className="space-y-3">
                  <p className="text-center text-sm font-medium text-muted-foreground">
                    Not sure where to start? Explore examples by category
                  </p>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    {EXAMPLE_PROMPTS.map((category) => (
                      <Button
                        key={category.category}
                        variant={selectedCategory === category.category ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedCategory(
                          selectedCategory === category.category ? null : category.category
                        )}
                        className={cn(
                          "rounded-full transition-all duration-200 h-8 px-4 text-xs",
                          selectedCategory === category.category && "shadow-md"
                        )}
                      >
                        {category.category}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Example Prompts */}
                {selectedCategory && (
                  <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="grid gap-2">
                      {EXAMPLE_PROMPTS.find(c => c.category === selectedCategory)?.examples.map((example, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleExampleClick(example.prompt)}
                          className="group text-left p-3 rounded-xl border bg-card/50 hover:bg-card hover:border-primary/30 hover:shadow-sm transition-all duration-200 text-sm flex items-center gap-2.5"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-primary/40 group-hover:bg-primary group-hover:scale-125 transition-all" />
                          <span className="flex-1">{example.display}</span>
                          <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary rotate-180 transition-all" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bottom Note - uniform spacing */}
                <div className="text-center">
                  <button
                    onClick={handleStartBuilding}
                    disabled={isCreatingWorkflow}
                    className="relative text-xs text-muted-foreground/80 hover:text-foreground transition-all duration-200 px-3 py-1.5 rounded-full hover:bg-accent border border-transparent hover:border-border disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                  >
                    <span className="relative z-10">
                      {isCreatingWorkflow ? "Creating workflow..." : "Start building with React AI agent"}
                    </span>
                    {!isCreatingWorkflow && (
                      <span
                        className="absolute inset-0 w-[200%] animate-[shimmer_3s_ease-in-out_infinite]"
                        style={{
                          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                        }}
                      />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Chat View
          <div className="h-full flex flex-col">
            <ScrollArea ref={scrollAreaRef} className="flex-1 px-6 py-8">
              <div className="max-w-3xl mx-auto space-y-6">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex gap-4",
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    {message.role !== 'user' && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center shrink-0">
                        <Sparkles className="w-4 h-4 text-primary" />
                      </div>
                    )}

                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl p-4",
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-card border'
                      )}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      {message.status === 'complete' && message.role === 'assistant' && (
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <CheckCircle className="w-3 h-3" />
                          <span>Ready</span>
                        </div>
                      )}
                    </div>

                    {message.role === 'user' && (
                      <div className="w-8 h-8 rounded-full shrink-0 overflow-hidden bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-primary-foreground text-xs font-bold">
                        {user?.user_metadata?.avatar_url ? (
                          <img
                            src={user.user_metadata.avatar_url}
                            alt="User avatar"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span>{user?.email?.charAt(0).toUpperCase() || 'U'}</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-primary" />
                    </div>
                    <div className="bg-card border rounded-2xl p-4">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Input Bar */}
            <div className="border-t bg-card">
              <div className="container mx-auto px-6 py-4">
                <div className="max-w-3xl mx-auto">
                  <div className="relative">
                    <Input
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSendMessage()
                        }
                      }}
                      placeholder="Describe your next step..."
                      className="h-12 pr-14"
                      disabled={isLoading}
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!input.trim() || isLoading}
                      size="icon"
                      className="absolute right-2 top-2 h-8 w-8"
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AI Agent Preference Modal */}
      <AIAgentPreferenceModal
        open={preferenceModalOpen}
        onOpenChange={setPreferenceModalOpen}
        onSelectPreference={handlePreferenceSelection}
      />
    </div>
  )
}
