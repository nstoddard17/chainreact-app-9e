"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Send,
  Sparkles,
  Loader2,
  ArrowLeft,
  Zap,
  CheckCircle,
  Flame,
  ArrowRight,
  Workflow,
  Sun
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/stores/authStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useToast } from "@/hooks/use-toast"
import { logger } from "@/lib/utils/logger"
import { AIAgentPreferenceModal } from "../AIAgentPreferenceModal"

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
    category: 'Notify',
    icon: <Flame className="w-5 h-5" />,
    color: 'from-orange-500 to-red-500',
    examples: [
      { display: 'Alert me on Slack when payments fail', prompt: 'Create a workflow that monitors Stripe for failed payments and sends me a Slack notification immediately with the customer details and error reason.' },
      { display: 'Send SMS when high-value lead comes in', prompt: 'Build a workflow that detects when a new lead over $10,000 is added to my CRM and sends me an SMS notification so I can respond quickly.' },
      { display: 'Daily digest of team activity', prompt: 'Create a workflow that compiles all team activity from Slack, GitHub, and Jira and sends me a summary email every morning at 8am.' },
    ]
  },
  {
    category: 'Sync',
    icon: <Workflow className="w-5 h-5" />,
    color: 'from-amber-500 to-orange-500',
    examples: [
      { display: 'Keep CRM and email list in sync', prompt: 'Build a two-way sync between HubSpot and Mailchimp so contacts are always up to date in both systems.' },
      { display: 'Mirror Notion tasks to Asana', prompt: 'Create a workflow that automatically creates Asana tasks whenever I add items to a specific Notion database.' },
      { display: 'Backup data to Google Sheets daily', prompt: 'Set up a nightly backup that exports key metrics from my database to Google Sheets for reporting.' },
    ]
  },
  {
    category: 'Automate',
    icon: <Zap className="w-5 h-5" />,
    color: 'from-rose-500 to-pink-500',
    examples: [
      { display: 'Auto-respond to support tickets', prompt: 'Create a workflow that automatically responds to common support questions with helpful answers and only escalates complex issues to a human.' },
      { display: 'Schedule social posts from content', prompt: 'When I publish a new blog post, automatically create and schedule social media posts for Twitter, LinkedIn, and Facebook.' },
      { display: 'Generate invoices on project completion', prompt: 'Build a workflow that automatically generates and sends invoices when I mark a project as complete in my project management tool.' },
    ]
  },
]

export function AIAgentCoralContent() {
  const router = useRouter()
  const { user, profile, updateProfile } = useAuthStore()
  const { getConnectedProviders } = useIntegrationStore()
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
          logger.warn("[AIAgentCoralContent] Failed to persist pending prompt", storageError)
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

  useEffect(() => {
    if (inputRef.current && messages.length === 0) {
      inputRef.current.focus()
    }
  }, [messages.length])

  useEffect(() => {
    let phraseIndex = 0
    let charIndex = 0
    let isDeleting = false
    let typingSpeed = 100

    const typeText = () => {
      const currentPhrase = TYPING_PHRASES[phraseIndex]

      if (isDeleting) {
        setPlaceholderText(currentPhrase.substring(0, charIndex - 1))
        charIndex--
        typingSpeed = 30
      } else {
        setPlaceholderText(currentPhrase.substring(0, charIndex + 1))
        charIndex++
        typingSpeed = 100
      }

      if (!isDeleting && charIndex === currentPhrase.length) {
        typingSpeed = 2000
        isDeleting = true
      } else if (isDeleting && charIndex === 0) {
        isDeleting = false
        phraseIndex = (phraseIndex + 1) % TYPING_PHRASES.length
        typingSpeed = 0
      }

      setTimeout(typeText, typingSpeed)
    }

    const timer = setTimeout(typeText, 500)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor(prev => !prev)
    }, 530)
    return () => clearInterval(interval)
  }, [])

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
    <div className="h-screen w-full bg-[#0A1628] flex flex-col relative overflow-hidden">
      {/* Warm gradient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Base gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0A1628] via-[#0F1D32] to-[#0A1628]" />

        {/* Warm accent blurs */}
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-to-br from-orange-500/10 via-rose-500/5 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-tr from-amber-500/10 via-orange-500/5 to-transparent rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-coral-500/5 rounded-full blur-3xl" />

        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)`,
            backgroundSize: '80px 80px',
          }}
        />
      </div>

      {/* Header */}
      <div className="border-b border-white/5 bg-[#0A1628]/80 backdrop-blur-xl relative z-10">
        <div className="w-full px-6 py-3.5">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSkipToBuilder}
                className="shrink-0 text-white/60 hover:text-white hover:bg-white/5 h-9 w-9"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                  <Sun className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-sm font-semibold text-white">Workflow Builder</h1>
                  <span className="text-xs text-white/40">Powered by AI</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge className="bg-orange-500/10 text-orange-400 border border-orange-500/20 text-xs">
                Beta
              </Badge>
              <Button
                size="sm"
                className="h-8 text-xs bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white border-0 shadow-lg shadow-orange-500/25"
              >
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
          <div className="h-full flex items-start justify-center px-6 pt-8 pb-8">
            <div className="max-w-3xl w-full space-y-8">
              {/* Hero */}
              <div className="text-center space-y-4">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-orange-500/10 to-rose-500/10 border border-orange-500/20">
                  <Sparkles className="w-4 h-4 text-orange-400" />
                  <span className="text-sm font-medium text-orange-300">
                    Describe any workflow
                  </span>
                </div>

                <h2 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
                  What would you like to
                  <br />
                  <span className="bg-gradient-to-r from-orange-400 via-rose-400 to-pink-400 bg-clip-text text-transparent">
                    automate today?
                  </span>
                </h2>

                <p className="text-white/50 text-base max-w-xl mx-auto">
                  Tell us what you need in plain English. We'll build and deploy your automation in minutes.
                </p>
              </div>

              {/* Input */}
              <div className="max-w-2xl mx-auto">
                <div className="relative group">
                  {/* Glow */}
                  <div className="absolute -inset-1 bg-gradient-to-r from-orange-500/20 via-rose-500/20 to-pink-500/20 rounded-2xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 blur-xl transition-all duration-500" />

                  <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 group-hover:border-orange-500/30 group-focus-within:border-orange-500/50">
                    {!input && (
                      <div className="absolute left-5 top-5 pointer-events-none text-white/30 flex">
                        <span>{placeholderText}</span>
                        <span
                          className={cn(
                            "w-0.5 bg-orange-400 ml-0.5",
                            showCursor ? "opacity-100" : "opacity-0"
                          )}
                          style={{ height: '1.25rem' }}
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
                      className="w-full text-base text-white pl-5 pr-16 py-5 bg-transparent border-0 outline-none focus:outline-none focus:ring-0 resize-none placeholder-transparent"
                      disabled={isLoading}
                    />

                    <button
                      onClick={handleSendMessage}
                      disabled={!input.trim() || isLoading}
                      className={cn(
                        "absolute right-4 bottom-4 p-3 rounded-xl transition-all duration-300",
                        input.trim() && !isLoading
                          ? "bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 hover:scale-105"
                          : "bg-white/5 text-white/20 cursor-not-allowed"
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
              </div>

              {/* Categories */}
              <div className="space-y-6">
                <div className="flex items-center justify-center gap-3">
                  {EXAMPLE_PROMPTS.map((cat) => (
                    <button
                      key={cat.category}
                      onClick={() => setSelectedCategory(
                        selectedCategory === cat.category ? null : cat.category
                      )}
                      className={cn(
                        "flex items-center gap-2 px-5 py-2.5 rounded-full border transition-all duration-300",
                        selectedCategory === cat.category
                          ? "bg-gradient-to-r " + cat.color + " text-white border-transparent shadow-lg"
                          : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:border-white/20"
                      )}
                    >
                      {cat.icon}
                      <span className="text-sm font-medium">{cat.category}</span>
                    </button>
                  ))}
                </div>

                {/* Examples */}
                {selectedCategory && (
                  <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="space-y-2">
                      {EXAMPLE_PROMPTS.find(c => c.category === selectedCategory)?.examples.map((example, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleExampleClick(example.prompt)}
                          onMouseEnter={() => setHoveredExample(idx)}
                          onMouseLeave={() => setHoveredExample(null)}
                          className={cn(
                            "w-full text-left p-4 rounded-xl border transition-all duration-300",
                            hoveredExample === idx
                              ? "bg-gradient-to-r from-orange-500/10 to-rose-500/10 border-orange-500/30"
                              : "bg-white/5 border-white/5 hover:bg-white/10"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-white/80 text-sm">{example.display}</span>
                            <ArrowRight className={cn(
                              "w-4 h-4 transition-all duration-300",
                              hoveredExample === idx
                                ? "text-orange-400 translate-x-1"
                                : "text-white/20"
                            )} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Skip link */}
                <div className="text-center">
                  <button
                    onClick={handleStartBuilding}
                    disabled={isCreatingWorkflow}
                    className="text-sm text-white/40 hover:text-white/70 transition-colors"
                  >
                    {isCreatingWorkflow ? "Creating..." : "Skip to visual builder →"}
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
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/20">
                        <Sun className="w-5 h-5 text-white" />
                      </div>
                    )}

                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl p-4",
                        message.role === 'user'
                          ? 'bg-gradient-to-r from-orange-500 to-rose-500 text-white'
                          : 'bg-white/5 backdrop-blur-sm border border-white/10 text-white'
                      )}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                      {message.status === 'complete' && message.role === 'assistant' && (
                        <div className="flex items-center gap-2 mt-2 text-xs text-white/50">
                          <CheckCircle className="w-3 h-3 text-green-400" />
                          <span>Ready</span>
                        </div>
                      )}
                    </div>

                    {message.role === 'user' && (
                      <div className="w-10 h-10 rounded-xl shrink-0 overflow-hidden bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-orange-500/20">
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
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                      <Sun className="w-5 h-5 text-white" />
                    </div>
                    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-orange-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-2 h-2 bg-rose-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-2 h-2 bg-pink-500 rounded-full animate-bounce" />
                        </div>
                        <span className="text-sm text-white/50">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Input Bar */}
            <div className="border-t border-white/5 bg-[#0A1628]/80 backdrop-blur-xl">
              <div className="container mx-auto px-6 py-4">
                <div className="max-w-3xl mx-auto">
                  <div className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-orange-500/20 to-rose-500/20 rounded-xl opacity-0 group-focus-within:opacity-100 blur transition-all duration-300" />
                    <div className="relative flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden group-focus-within:border-orange-500/50">
                      <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleSendMessage()
                          }
                        }}
                        placeholder="Describe your next step..."
                        className="flex-1 h-12 px-4 bg-transparent border-0 outline-none text-white placeholder-white/30"
                        disabled={isLoading}
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={!input.trim() || isLoading}
                        size="icon"
                        className={cn(
                          "mr-2 h-8 w-8 rounded-lg transition-all duration-300",
                          input.trim() && !isLoading
                            ? "bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-lg shadow-orange-500/30"
                            : "bg-white/5 text-white/30"
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

      <AIAgentPreferenceModal
        open={preferenceModalOpen}
        onOpenChange={setPreferenceModalOpen}
        onSelectPreference={handlePreferenceSelection}
      />
    </div>
  )
}
