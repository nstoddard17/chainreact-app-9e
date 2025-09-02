"use client"

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { 
  ChevronDown, 
  Copy, 
  Variable, 
  Bot, 
  Hash, 
  AtSign,
  Sparkles,
  BookOpen,
  Code,
  Lightbulb
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface QuickReferenceProps {
  onInsert?: (value: string) => void
}

export function AIAgentQuickReference({ onInsert }: QuickReferenceProps) {
  const { toast } = useToast()
  const [expandedSections, setExpandedSections] = useState<string[]>(['variables'])

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: "Copied",
      description: "Variable copied to clipboard"
    })
  }

  const handleInsert = (text: string) => {
    if (onInsert) {
      onInsert(text)
    } else {
      handleCopy(text)
    }
  }

  const toggleSection = (section: string) => {
    setExpandedSections(prev =>
      prev.includes(section)
        ? prev.filter(s => s !== section)
        : [...prev, section]
    )
  }

  const simpleVariables = [
    { var: '[name]', desc: 'Sender/user name', example: 'John Doe' },
    { var: '[email]', desc: 'Email address', example: 'john@example.com' },
    { var: '[subject]', desc: 'Email/form subject', example: 'Meeting Request' },
    { var: '[message]', desc: 'Message content', example: 'Hello, I need help...' },
    { var: '[date]', desc: 'Current date', example: '2024-01-15' },
    { var: '[time]', desc: 'Current time', example: '10:30 AM' },
    { var: '[username]', desc: 'Username', example: 'johndoe123' },
    { var: '[channel]', desc: 'Channel name', example: '#general' }
  ]

  const aiInstructions = [
    { var: '{{AI:summarize}}', desc: 'Summarize content', icon: '📝' },
    { var: '{{AI:extract_key_points}}', desc: 'Extract key points', icon: '🔍' },
    { var: '{{AI:generate_response}}', desc: 'Generate appropriate response', icon: '💬' },
    { var: '{{AI:assess_priority}}', desc: 'Determine priority level', icon: '⚡' },
    { var: '{{AI:categorize}}', desc: 'Categorize content', icon: '🏷️' },
    { var: '{{AI:format_professionally}}', desc: 'Professional formatting', icon: '👔' },
    { var: '{{AI:casual_greeting}}', desc: 'Casual greeting', icon: '👋' },
    { var: '{{AI:next_steps}}', desc: 'Suggest next steps', icon: '➡️' },
    { var: '{{AI:translate:spanish}}', desc: 'Translate to Spanish', icon: '🌐' },
    { var: '{{AI:sentiment_analysis}}', desc: 'Analyze sentiment', icon: '😊' }
  ]

  const triggerVariables = [
    { var: '{{trigger.email.from}}', desc: 'Email sender address' },
    { var: '{{trigger.email.subject}}', desc: 'Email subject line' },
    { var: '{{trigger.discord.content}}', desc: 'Discord message content' },
    { var: '{{trigger.discord.author.username}}', desc: 'Discord username' },
    { var: '{{trigger.slack.text}}', desc: 'Slack message text' },
    { var: '{{trigger.webhook.body}}', desc: 'Webhook payload' },
    { var: '{{trigger.form.fields}}', desc: 'Form submission data' }
  ]

  const promptTemplates = [
    {
      name: 'Customer Support Response',
      prompt: 'Analyze the customer inquiry in [message] and generate a helpful response addressing [subject]. Include {{AI:next_steps}} and maintain a [tone] tone.',
      tags: ['support', 'email']
    },
    {
      name: 'Content Summary',
      prompt: 'Review the content from {{trigger.email.body}} and {{AI:summarize}}. Extract the main points and {{AI:assess_priority}}.',
      tags: ['summary', 'analysis']
    },
    {
      name: 'Task Assignment',
      prompt: 'Based on the request in [message], determine the appropriate team and {{AI:generate_response}} with task assignment details.',
      tags: ['task', 'routing']
    },
    {
      name: 'Data Processing',
      prompt: 'Process the data from {{trigger.webhook.body}}, {{AI:extract_key_points}}, and format for insertion into database.',
      tags: ['data', 'automation']
    }
  ]

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <BookOpen className="w-5 h-5" />
          AI Agent Quick Reference
        </CardTitle>
        <CardDescription>
          Variables, instructions, and templates for AI field automation
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="variables" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="variables">Variables</TabsTrigger>
            <TabsTrigger value="instructions">AI Instructions</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[400px] mt-4">
            {/* Variables Tab */}
            <TabsContent value="variables" className="space-y-4">
              {/* Simple Variables */}
              <Collapsible 
                open={expandedSections.includes('simple')}
                onOpenChange={() => toggleSection('simple')}
              >
                <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <Variable className="w-4 h-4" />
                    <span className="font-medium">Simple Variables</span>
                    <Badge variant="secondary" className="text-xs">
                      {simpleVariables.length}
                    </Badge>
                  </div>
                  <ChevronDown className={cn(
                    "w-4 h-4 transition-transform",
                    expandedSections.includes('simple') && "rotate-180"
                  )} />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-1 mt-2">
                  {simpleVariables.map((v, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 hover:bg-muted rounded-lg group"
                    >
                      <div className="flex-1">
                        <code className="text-sm font-mono bg-background px-1 py-0.5 rounded">
                          {v.var}
                        </code>
                        <span className="text-xs text-muted-foreground ml-2">
                          {v.desc}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleInsert(v.var)}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>

              {/* Trigger Variables */}
              <Collapsible 
                open={expandedSections.includes('trigger')}
                onOpenChange={() => toggleSection('trigger')}
              >
                <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <AtSign className="w-4 h-4" />
                    <span className="font-medium">Trigger Variables</span>
                    <Badge variant="secondary" className="text-xs">
                      {triggerVariables.length}
                    </Badge>
                  </div>
                  <ChevronDown className={cn(
                    "w-4 h-4 transition-transform",
                    expandedSections.includes('trigger') && "rotate-180"
                  )} />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-1 mt-2">
                  {triggerVariables.map((v, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 hover:bg-muted rounded-lg group"
                    >
                      <div className="flex-1">
                        <code className="text-sm font-mono bg-background px-1 py-0.5 rounded text-xs">
                          {v.var}
                        </code>
                        <span className="text-xs text-muted-foreground ml-2">
                          {v.desc}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleInsert(v.var)}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            </TabsContent>

            {/* AI Instructions Tab */}
            <TabsContent value="instructions" className="space-y-2">
              {aiInstructions.map((instruction, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 hover:bg-muted rounded-lg group"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-lg">{instruction.icon}</span>
                    <div>
                      <code className="text-sm font-mono bg-background px-1 py-0.5 rounded">
                        {instruction.var}
                      </code>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {instruction.desc}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleInsert(instruction.var)}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              ))}

              <div className="mt-4 p-3 bg-muted rounded-lg">
                <div className="flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 text-yellow-500 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-medium">Custom Instructions</p>
                    <p className="text-muted-foreground">
                      You can create custom AI instructions using the format:
                    </p>
                    <code className="block bg-background px-2 py-1 rounded mt-1">
                      {'{{AI:your_custom_instruction}}'}
                    </code>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Templates Tab */}
            <TabsContent value="templates" className="space-y-3">
              {promptTemplates.map((template, idx) => (
                <Card key={idx} className="p-3">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <h4 className="font-medium text-sm">{template.name}</h4>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleInsert(template.prompt)}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                    <p className="text-xs font-mono bg-muted p-2 rounded">
                      {template.prompt}
                    </p>
                    <div className="flex gap-1">
                      {template.tags.map(tag => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </Card>
              ))}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </CardContent>
    </Card>
  )
}

// Helper function for className
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}