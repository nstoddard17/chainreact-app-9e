"use client"

import { useState, useRef, useEffect, useCallback } from "react"
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
  CheckCircle,
  Bot,
  Cpu,
  Workflow,
  ArrowRight
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
    icon: '📈',
    examples: [
      {
        display: 'Monitor Twitter mentions and alert on Slack',
        prompt: `Create a workflow that monitors Twitter for mentions of my company name and brand keywords. When someone tweets about us:
1. Capture the tweet content, author, and link
2. Analyze the sentiment (positive, negative, or neutral)
3. Send me a Slack message with the tweet details and sentiment
4. Include a direct link to reply to the tweet`
      },
      {
        display: 'Automated welcome email series for new subscribers',
        prompt: `Build an automated email welcome series for new subscribers. When someone signs up:
1. Immediately send a welcome email with a thank you message
2. Wait 2 days, then send an email about our main features/benefits
3. Wait 3 more days, then send customer success stories
4. Wait 4 more days, then send a special offer or call-to-action`
      },
      {
        display: 'Cross-post content to all social platforms',
        prompt: `Create a workflow that automatically cross-posts content to all my social platforms. When I publish new content:
1. Detect when a new blog post or article is published
2. Generate platform-specific posts for Twitter, LinkedIn, and Facebook
3. Schedule the posts to go out at optimal times for engagement`
      }
    ]
  },
  {
    category: 'Operations',
    icon: '⚙️',
    examples: [
      {
        display: 'Sync CRM contacts with email marketing',
        prompt: `Build a two-way sync between my CRM and email marketing platform. This workflow should:
1. When a new contact is added to the CRM, automatically add them to my email list
2. When contact details are updated in either system, update the other
3. When someone unsubscribes from emails, update their status in the CRM`
      },
      {
        display: 'Auto-generate invoices and send reminders',
        prompt: `Create an automated invoicing and payment reminder system. When a project is completed:
1. Generate an invoice with all project details and costs
2. Email the invoice to the client
3. Send a friendly reminder 3 days before due date
4. Send a follow-up reminder on the due date`
      },
      {
        display: 'Weekly team metrics digest',
        prompt: `Build a weekly team digest that automatically compiles and sends key information. Every Monday at 9am:
1. Gather metrics from multiple tools (sales, support, analytics)
2. Compile a summary of last week's achievements
3. Send to the entire team via email and post in Slack`
      }
    ]
  },
  {
    category: 'Product',
    icon: '🚀',
    examples: [
      {
        display: 'Centralize feedback from all channels',
        prompt: `Create a central feedback collection system that gathers input from all channels. When customers provide feedback:
1. Monitor support tickets, emails, chat messages, and social media
2. Detect messages containing feedback, feature requests, or complaints
3. Extract the key points and categorize them automatically
4. Add all feedback to a master spreadsheet`
      },
      {
        display: 'App performance monitoring with alerts',
        prompt: `Build a comprehensive app performance monitoring and alerting system. Continuously monitor:
1. Server response times and API latency
2. Error rates and types
3. Page load speeds
When issues are detected, send immediate alerts via Slack and SMS`
      },
      {
        display: 'Smart auto-reply for feature requests',
        prompt: `Create an intelligent feature request response system. When customers request features:
1. Detect when someone asks about a feature
2. Check if this feature is already requested/planned/built
3. Send an appropriate automated response based on status
4. Add new requests to the product roadmap`
      }
    ]
  },
  {
    category: 'Data',
    icon: '📊',
    examples: [
      {
        display: 'Daily backup to Google Sheets',
        prompt: `Build a comprehensive daily data backup system. Every day at 2am:
1. Export data from all business systems
2. Save to organized Google Sheets
3. Verify backup completed successfully
4. Alert if backup fails`
      },
      {
        display: 'Weekly analytics report with charts',
        prompt: `Build an automated weekly analytics reporting system. Every Monday at 8am:
1. Gather data from all analytics sources
2. Generate charts and visualizations
3. Calculate week-over-week changes
4. Create a professional PDF report and email to stakeholders`
      },
      {
        display: 'Auto-merge duplicate CRM contacts',
        prompt: `Create an automated CRM data cleaning system. This workflow should:
1. Scan CRM database for potential duplicate contacts
2. Identify duplicates based on email, name, phone, and company
3. Merge duplicates intelligently, keeping the most complete information
4. Generate a report of all merges performed`
      }
    ]
  }
]

export function AIAgentV2Content() {
  const router = useRouter()
  const { user, profile, updateProfile } = useAuthStore()
  const { getConnectedProviders } = useIntegrationStore()
  const { createWorkflow: createLegacyWorkflow } = useWorkflowStore()
  const { toast } = useToast()

  const createFlow = useCallback(
    async (name: string, description: string, options?: { prompt?: string }) => {
      const response = await fetch("/workflows/v2/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText)
        throw new Error(errorText || "Failed to create Flow v2 definition")
      }

      const data = await response.json().catch(() => ({}))
      const flowId = data?.flowId

      if (!flowId) {
        throw new Error("Flow v2 API did not return a flowId")
      }

      if (options?.prompt && typeof window !== "undefined") {
        try {
          sessionStorage.setItem("flowv2:pendingPrompt", options.prompt)
        } catch (storageError) {
          logger.warn("[AIAgentV2Content] Failed to persist pending prompt", storageError)
        }
      }

      return { id: flowId }
    },
    []
  )

  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isCreatingWorkflow, setIsCreatingWorkflow] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [placeholderText, setPlaceholderText] = useState('')
  const [showCursor, setShowCursor] = useState(true)
  const [preferenceModalOpen, setPreferenceModalOpen] = useState(false)
  const [hoveredExample, setHoveredExample] = useState<number | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
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
        setShowCursor(true)
      } else {
        setPlaceholderText(currentPhrase.substring(0, charIndex + 1))
        charIndex++
        typingSpeed = 100
        setShowCursor(true)
      }

      if (!isDeleting && charIndex === currentPhrase.length) {
        typingSpeed = 2000
        isDeleting = true
        cursorBlinkInterval = setInterval(() => {
          setShowCursor(prev => !prev)
        }, 530)
        setTimeout(() => {
          clearInterval(cursorBlinkInterval)
          setShowCursor(true)
        }, 2000)
      } else if (isDeleting && charIndex === 0) {
        isDeleting = false
        phraseIndex = (phraseIndex + 1) % TYPING_PHRASES.length
        typingSpeed = 0
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

    const isFirstMessage = messages.length === 0
    const messageText = input

    if (isFirstMessage) {
      try {
        setIsLoading(true)
        const workflow = await createFlow("New Workflow", "Created from AI Agent", {
          prompt: messageText,
        })

        if (!workflow || !workflow.id) {
          throw new Error('Failed to create workflow')
        }

        const url = `/workflows/builder/${workflow.id}?prompt=${encodeURIComponent(messageText)}`
        await router.push(url)
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
      const workflow = await createFlow("New Workflow", "Created from React Agent")
      router.push(`/workflows/builder/${workflow.id}`)
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

  const handleSkipToBuilder = async () => {
    const currentPref = profile?.ai_agent_preference || 'always_show'
    const currentSkipCount = profile?.ai_agent_skip_count || 0
    const newSkipCount = currentSkipCount + 1

    try {
      await updateProfile({ ai_agent_skip_count: newSkipCount })
    } catch (error) {
      logger.error('Failed to update skip count:', error)
    }

    if (currentPref === 'always_show' && newSkipCount >= 3) {
      setPreferenceModalOpen(true)
    } else if (currentPref === 'ask_later' && newSkipCount >= 1) {
      setPreferenceModalOpen(true)
    } else {
      router.push('/workflows')
    }
  }

  const handlePreferenceSelection = async (preference: 'always_skip' | 'always_show' | 'ask_later') => {
    try {
      await updateProfile({
        ai_agent_preference: preference,
        ai_agent_skip_count: 0,
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
      {/* Futuristic animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Gradient mesh background */}
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-cyan-500/5 dark:from-violet-500/10 dark:via-transparent dark:to-cyan-500/10" />

        {/* Animated grid */}
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
          style={{
            backgroundImage: `
              linear-gradient(to right, hsl(var(--foreground)) 1px, transparent 1px),
              linear-gradient(to bottom, hsl(var(--foreground)) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
          }}
        />

        {/* Floating orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-500/20 dark:bg-violet-500/10 rounded-full blur-3xl animate-[blob_15s_ease-in-out_infinite]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/20 dark:bg-cyan-500/10 rounded-full blur-3xl animate-[blob_15s_ease-in-out_infinite_2s]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl animate-[blob_20s_ease-in-out_infinite_1s]" />

        {/* Scan line effect */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.02] to-transparent h-[2px] animate-[scan_4s_linear_infinite]" />
      </div>

      {/* Header */}
      <div className="border-b border-border/50 bg-background/60 backdrop-blur-xl relative z-10">
        <div className="w-full px-6 py-3.5">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSkipToBuilder}
                className="shrink-0 hover:bg-accent/50 transition-all duration-300 hover:scale-105"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-3 min-w-0 overflow-hidden">
                <div className="relative">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background animate-pulse" />
                </div>
                <div className="flex flex-col min-w-0">
                  <h1 className="text-sm font-semibold truncate">AI Workflow Builder</h1>
                  <span className="text-xs text-muted-foreground">Powered by ChainReact AI</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Badge
                variant="outline"
                className="h-6 text-xs bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20"
              >
                <Cpu className="w-3 h-3 mr-1" />
                v2
              </Badge>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs border-border/50 hover:bg-accent/50 hover:border-primary/30 transition-all duration-300"
              >
                <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                <span className="hidden sm:inline">Test</span>
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-700 hover:to-cyan-700 text-white border-0 shadow-lg shadow-violet-500/20 transition-all duration-300 hover:shadow-violet-500/40"
              >
                <Zap className="w-3.5 h-3.5 mr-1.5" />
                <span className="hidden sm:inline">Publish</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden relative z-0">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center px-6 py-8">
            <div className="max-w-4xl w-full space-y-8">
              {/* Hero Section */}
              <div className="text-center space-y-4">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-violet-500/10 to-cyan-500/10 border border-violet-500/20 dark:border-violet-500/30 backdrop-blur-sm">
                  <div className="relative">
                    <Sparkles className="w-4 h-4 text-violet-500" />
                    <div className="absolute inset-0 animate-ping">
                      <Sparkles className="w-4 h-4 text-violet-500 opacity-40" />
                    </div>
                  </div>
                  <span className="text-sm font-medium bg-gradient-to-r from-violet-600 to-cyan-600 dark:from-violet-400 dark:to-cyan-400 bg-clip-text text-transparent">
                    Next-Gen Workflow Automation
                  </span>
                </div>

                <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight">
                  <span className="bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text text-transparent">
                    Describe it.
                  </span>
                  <br />
                  <span className="bg-gradient-to-r from-violet-600 via-purple-600 to-cyan-600 dark:from-violet-400 dark:via-purple-400 dark:to-cyan-400 bg-clip-text text-transparent">
                    We build it.
                  </span>
                </h2>

                <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto">
                  Transform your ideas into powerful automations in seconds.
                  Just describe what you need, and our AI handles the rest.
                </p>
              </div>

              {/* Main Input */}
              <div className="max-w-2xl mx-auto">
                <div className="relative group">
                  {/* Glow effect */}
                  <div className="absolute -inset-1 bg-gradient-to-r from-violet-500 to-cyan-500 rounded-2xl opacity-0 group-hover:opacity-20 group-focus-within:opacity-30 blur-xl transition-all duration-500" />

                  {/* Input container */}
                  <div className="relative bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 overflow-hidden transition-all duration-300 group-hover:border-primary/30 group-focus-within:border-primary/50">
                    {/* Animated placeholder */}
                    {!input && (
                      <div className="absolute left-4 top-4 pointer-events-none text-base text-muted-foreground/60 flex">
                        <span>{placeholderText}</span>
                        <span
                          className={cn(
                            "inline-block w-0.5 bg-violet-500 ml-0.5 self-center",
                            showCursor ? "opacity-100" : "opacity-0"
                          )}
                          style={{ height: '1.25rem', transition: 'opacity 0.1s' }}
                        />
                      </div>
                    )}

                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSendMessage()
                        }
                      }}
                      placeholder=""
                      rows={3}
                      className="w-full text-base pl-4 pr-14 py-4 bg-transparent border-0 outline-none focus:outline-none focus:ring-0 resize-none"
                      disabled={isLoading}
                    />

                    {/* Send button */}
                    <button
                      onClick={handleSendMessage}
                      disabled={!input.trim() || isLoading}
                      className={cn(
                        "absolute right-3 bottom-3 p-3 rounded-xl transition-all duration-300",
                        input.trim() && !isLoading
                          ? "bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 hover:scale-105 cursor-pointer"
                          : "bg-muted text-muted-foreground cursor-not-allowed"
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

                {/* Quick action hint */}
                <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px]">Enter</kbd>
                    to send
                  </span>
                  <span className="flex items-center gap-1.5">
                    <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px]">Shift + Enter</kbd>
                    new line
                  </span>
                </div>
              </div>

              {/* Category Grid */}
              <div className="space-y-4">
                <p className="text-center text-sm font-medium text-muted-foreground">
                  Or explore by category
                </p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto">
                  {EXAMPLE_PROMPTS.map((category) => (
                    <button
                      key={category.category}
                      onClick={() => setSelectedCategory(
                        selectedCategory === category.category ? null : category.category
                      )}
                      className={cn(
                        "group relative p-4 rounded-xl border transition-all duration-300",
                        selectedCategory === category.category
                          ? "bg-gradient-to-br from-violet-500/10 to-cyan-500/10 border-violet-500/30 shadow-lg shadow-violet-500/10"
                          : "bg-card/50 border-border/50 hover:border-primary/30 hover:bg-card/80"
                      )}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-2xl">{category.icon}</span>
                        <span className={cn(
                          "text-sm font-medium transition-colors",
                          selectedCategory === category.category
                            ? "text-violet-600 dark:text-violet-400"
                            : "text-foreground"
                        )}>
                          {category.category}
                        </span>
                      </div>

                      {/* Selection indicator */}
                      {selectedCategory === category.category && (
                        <div className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-1 bg-gradient-to-r from-violet-500 to-cyan-500 rounded-full" />
                      )}
                    </button>
                  ))}
                </div>

                {/* Example Prompts */}
                {selectedCategory && (
                  <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="space-y-2 mt-4">
                      {EXAMPLE_PROMPTS.find(c => c.category === selectedCategory)?.examples.map((example, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleExampleClick(example.prompt)}
                          onMouseEnter={() => setHoveredExample(idx)}
                          onMouseLeave={() => setHoveredExample(null)}
                          className={cn(
                            "group w-full text-left p-4 rounded-xl border transition-all duration-300",
                            hoveredExample === idx
                              ? "bg-gradient-to-r from-violet-500/10 to-cyan-500/10 border-violet-500/30 shadow-lg"
                              : "bg-card/50 border-border/50 hover:bg-card/80"
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className={cn(
                                "w-2 h-2 rounded-full transition-all duration-300",
                                hoveredExample === idx
                                  ? "bg-gradient-to-r from-violet-500 to-cyan-500 scale-125"
                                  : "bg-muted-foreground/40"
                              )} />
                              <span className="text-sm truncate">{example.display}</span>
                            </div>
                            <ArrowRight className={cn(
                              "w-4 h-4 transition-all duration-300",
                              hoveredExample === idx
                                ? "text-violet-500 translate-x-1"
                                : "text-muted-foreground/40"
                            )} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Manual builder link */}
                <div className="text-center pt-4">
                  <button
                    onClick={handleStartBuilding}
                    disabled={isCreatingWorkflow}
                    className="group inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-all duration-300"
                  >
                    <Workflow className="w-4 h-4" />
                    <span>{isCreatingWorkflow ? "Creating..." : "Prefer manual building?"}</span>
                    <span className="text-violet-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      Start now
                    </span>
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
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/20">
                        <Bot className="w-5 h-5 text-white" />
                      </div>
                    )}

                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl p-4 shadow-lg",
                        message.role === 'user'
                          ? 'bg-gradient-to-r from-violet-600 to-cyan-600 text-white'
                          : 'bg-card/80 backdrop-blur-sm border border-border/50'
                      )}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                      {message.status === 'complete' && message.role === 'assistant' && (
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <CheckCircle className="w-3 h-3 text-green-500" />
                          <span>Ready</span>
                        </div>
                      )}
                    </div>

                    {message.role === 'user' && (
                      <div className="w-10 h-10 rounded-xl shrink-0 overflow-hidden bg-gradient-to-br from-violet-600 to-cyan-600 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-violet-500/20">
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
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
                      <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-2xl p-4 shadow-lg">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-violet-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" />
                        </div>
                        <span className="text-sm text-muted-foreground">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Input Bar */}
            <div className="border-t border-border/50 bg-card/60 backdrop-blur-xl">
              <div className="container mx-auto px-6 py-4">
                <div className="max-w-3xl mx-auto">
                  <div className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-violet-500 to-cyan-500 rounded-xl opacity-0 group-focus-within:opacity-20 blur transition-all duration-300" />
                    <div className="relative flex items-center bg-background border border-border/50 rounded-xl overflow-hidden group-focus-within:border-primary/50">
                      <Input
                        ref={inputRef as any}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleSendMessage()
                          }
                        }}
                        placeholder="Describe your next step..."
                        className="flex-1 h-12 border-0 focus-visible:ring-0 bg-transparent"
                        disabled={isLoading}
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={!input.trim() || isLoading}
                        size="icon"
                        className={cn(
                          "mr-2 h-8 w-8 rounded-lg transition-all duration-300",
                          input.trim() && !isLoading
                            ? "bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-lg shadow-violet-500/30"
                            : ""
                        )}
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
