"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Sparkles, Send, Zap, MessageSquare, Clock } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import ReactMarkdown from "react-markdown"

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  type?: 'calendar' | 'document' | 'email' | 'task' | 'generic' | 'table' | 'list'
  metadata?: any
  timestamp: Date
}

export function AIAssistantContent() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput("")
    setLoading(true)

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: input }
          ]
        })
      })

      const data = await response.json()

      if (data.success) {
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.content,
          type: data.type,
          metadata: data.metadata,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, aiMessage])
      } else {
        throw new Error(data.error || 'Failed to get response')
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive"
      })

      // Add error message
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'm sorry, I encountered an error processing your request. Please try again.",
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const suggestions = [
    { icon: Zap, text: "Show me my upcoming calendar events", category: "Calendar" },
    { icon: MessageSquare, text: "What workflows do I have active?", category: "Workflows" },
    { icon: Clock, text: "Summarize my recent workflow executions", category: "Analytics" },
  ]

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case 'calendar': return '📅'
      case 'document': return '📄'
      case 'email': return '📧'
      case 'task': return '✅'
      case 'table': return '📊'
      case 'list': return '📝'
      default: return ''
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Empty State / Suggestions */}
      {messages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-semibold mb-2">AI Assistant</h2>
          <p className="text-muted-foreground text-center max-w-md mb-8">
            I can help you create workflows, troubleshoot issues, and provide insights about your automations. I'll automatically format responses based on the data type!
          </p>

          {/* Suggestions */}
          <div className="w-full max-w-2xl space-y-3">
            <p className="text-sm text-muted-foreground mb-3">Try asking:</p>
            {suggestions.map((suggestion, index) => {
              const Icon = suggestion.icon
              return (
                <Card
                  key={index}
                  className="cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => setInput(suggestion.text)}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm">{suggestion.text}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {suggestion.category}
                    </Badge>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Messages */}
      {messages.length > 0 && (
        <div className="flex-1 overflow-y-auto pb-4 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <Avatar className="w-8 h-8 flex-shrink-0">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    <Sparkles className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
              )}
              <div
                className={`max-w-3xl rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                {message.type && message.role === 'assistant' && (
                  <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/50">
                    <span className="text-lg">{getTypeIcon(message.type)}</span>
                    <span className="text-xs font-medium opacity-70 capitalize">{message.type} Data</span>
                  </div>
                )}
                {message.role === 'assistant' ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm">{message.content}</p>
                )}
              </div>
              {message.role === 'user' && (
                <Avatar className="w-8 h-8 flex-shrink-0">
                  <AvatarFallback>U</AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-3 justify-start">
              <Avatar className="w-8 h-8 flex-shrink-0">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  <Sparkles className="w-4 h-4" />
                </AvatarFallback>
              </Avatar>
              <div className="max-w-2xl rounded-2xl px-4 py-3 bg-muted">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <div className="border-t pt-4">
        <div className="flex gap-2">
          <Input
            placeholder="Ask me anything..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="flex-1"
            disabled={loading}
          />
          <Button onClick={handleSend} disabled={!input.trim() || loading}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          AI responses are automatically formatted based on the data type (calendar, emails, documents, etc.)
        </p>
      </div>
    </div>
  )
}
