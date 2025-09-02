"use client"

import React from "react"
import { AIFieldControl } from "./AIFieldControl"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Info, Sparkles, Brain, Zap } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

/**
 * Example configuration form that demonstrates AI field integration
 * This shows how to use AIFieldControl in actual workflow configuration modals
 */

interface ConfigurationFormWithAIProps {
  nodeType: string
  config: Record<string, any>
  onChange: (config: Record<string, any>) => void
  onSave: () => void
}

export function ConfigurationFormWithAI({
  nodeType,
  config,
  onChange,
  onSave
}: ConfigurationFormWithAIProps) {
  const { toast } = useToast()
  
  const handleFieldChange = (fieldName: string, value: any) => {
    onChange({
      ...config,
      [fieldName]: value
    })
  }

  const demonstrateAICapabilities = () => {
    toast({
      title: "AI Field Automation",
      description: "Fields marked with AI will be automatically populated based on workflow context during execution."
    })
  }

  // Example for Gmail Send Email configuration
  if (nodeType === 'gmail_send_email') {
    return (
      <div className="space-y-6">
        <Alert>
          <Sparkles className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-medium">AI-Powered Fields Available</p>
              <p className="text-sm">
                Click the AI button next to any field to let AI automatically populate it based on workflow context.
                Use [variables] in text fields for dynamic replacements.
              </p>
              <Button 
                size="sm" 
                variant="outline"
                onClick={demonstrateAICapabilities}
              >
                Learn More
              </Button>
            </div>
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>Email Configuration</CardTitle>
            <CardDescription>
              Configure email settings with AI assistance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* To Field */}
            <AIFieldControl
              fieldName="to"
              fieldLabel="To"
              fieldType="email"
              value={config.to}
              onChange={(value) => handleFieldChange('to', value)}
              placeholder="recipient@example.com"
              required
            />

            {/* Subject Field */}
            <AIFieldControl
              fieldName="subject"
              fieldLabel="Subject"
              fieldType="text"
              value={config.subject}
              onChange={(value) => handleFieldChange('subject', value)}
              placeholder="Email subject or use [subject] variable"
              required
              maxLength={200}
            />

            {/* Body Field with AI Variables */}
            <AIFieldControl
              fieldName="body"
              fieldLabel="Email Body"
              fieldType="textarea"
              value={config.body}
              onChange={(value) => handleFieldChange('body', value)}
              placeholder={`Hi [name],

Thank you for your inquiry about [subject].

{{AI:generate_response}}

Best regards,
[sender_name]`}
              required
              showVariableHelper={true}
            />

            {/* CC Field */}
            <AIFieldControl
              fieldName="cc"
              fieldLabel="CC (Optional)"
              fieldType="email"
              value={config.cc}
              onChange={(value) => handleFieldChange('cc', value)}
              placeholder="cc@example.com"
            />
          </CardContent>
        </Card>

        {/* Show AI status */}
        {Object.entries(config).some(([_, value]) => 
          typeof value === 'string' && (value.includes('{{AI_FIELD') || value.includes('['))
        ) && (
          <Card className="bg-purple-50 border-purple-200">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="w-4 h-4" />
                AI Configuration Active
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {Object.entries(config).map(([key, value]) => {
                  if (typeof value === 'string') {
                    if (value.includes('{{AI_FIELD')) {
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {key}
                          </Badge>
                          <span className="text-purple-700">
                            Will be auto-populated by AI
                          </span>
                        </div>
                      )
                    }
                    if (value.includes('[') || value.includes('{{AI:')) {
                      const variables = value.match(/\[([^\]]+)\]/g) || []
                      const instructions = value.match(/\{\{AI:([^}]+)\}\}/g) || []
                      
                      if (variables.length > 0 || instructions.length > 0) {
                        return (
                          <div key={key} className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {key}
                            </Badge>
                            <span className="text-purple-700">
                              Contains {variables.length + instructions.length} AI variable(s)
                            </span>
                          </div>
                        )
                      }
                    }
                  }
                  return null
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  // Example for Slack Post Message configuration
  if (nodeType === 'slack_post_message') {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Slack Message Configuration</CardTitle>
            <CardDescription>
              Configure Slack message with AI assistance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Channel Field */}
            <AIFieldControl
              fieldName="channel"
              fieldLabel="Channel"
              fieldType="text"
              value={config.channel}
              onChange={(value) => handleFieldChange('channel', value)}
              placeholder="#general or @username"
              required
            />

            {/* Message Field with AI Variables */}
            <AIFieldControl
              fieldName="text"
              fieldLabel="Message"
              fieldType="textarea"
              value={config.text}
              onChange={(value) => handleFieldChange('text', value)}
              placeholder={`:wave: Hey [name]!

{{AI:casual_greeting}}

**[subject]**
{{AI:summarize}}

{{AI:next_steps}}`}
              required
              showVariableHelper={true}
            />

            {/* Thread Timestamp (optional) */}
            <AIFieldControl
              fieldName="thread_ts"
              fieldLabel="Thread Timestamp (Optional)"
              fieldType="text"
              value={config.thread_ts}
              onChange={(value) => handleFieldChange('thread_ts', value)}
              placeholder="Reply in thread"
            />
          </CardContent>
        </Card>
      </div>
    )
  }

  // Example for Airtable Create Record
  if (nodeType === 'airtable_create_record') {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Airtable Record Configuration</CardTitle>
            <CardDescription>
              AI can populate record fields based on workflow data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Dynamic fields based on table schema */}
            <AIFieldControl
              fieldName="name"
              fieldLabel="Name"
              fieldType="text"
              value={config.name}
              onChange={(value) => handleFieldChange('name', value)}
              placeholder="[name] or let AI decide"
              required
            />

            <AIFieldControl
              fieldName="email"
              fieldLabel="Email"
              fieldType="email"
              value={config.email}
              onChange={(value) => handleFieldChange('email', value)}
              placeholder="[email] or AI auto-fill"
            />

            <AIFieldControl
              fieldName="status"
              fieldLabel="Status"
              fieldType="select"
              value={config.status}
              onChange={(value) => handleFieldChange('status', value)}
              options={[
                { value: 'new', label: 'New' },
                { value: 'in_progress', label: 'In Progress' },
                { value: 'completed', label: 'Completed' }
              ]}
            />

            <AIFieldControl
              fieldName="notes"
              fieldLabel="Notes"
              fieldType="textarea"
              value={config.notes}
              onChange={(value) => handleFieldChange('notes', value)}
              placeholder="{{AI:extract_key_points}}"
            />

            <AIFieldControl
              fieldName="priority"
              fieldLabel="Priority"
              fieldType="number"
              value={config.priority}
              onChange={(value) => handleFieldChange('priority', value)}
              placeholder="1-10"
            />
          </CardContent>
        </Card>
      </div>
    )
  }

  // Default/Generic configuration
  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          This node supports AI field automation. Click the AI button next to any field to enable automatic population.
        </AlertDescription>
      </Alert>
      
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            Configure this node with AI assistance
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Example of how to use in an actual modal:
 * 
 * <Dialog open={isOpen} onOpenChange={onClose}>
 *   <DialogContent>
 *     <DialogHeader>
 *       <DialogTitle>Configure {nodeTitle}</DialogTitle>
 *     </DialogHeader>
 *     <ConfigurationFormWithAI
 *       nodeType={nodeType}
 *       config={config}
 *       onChange={setConfig}
 *       onSave={handleSave}
 *     />
 *     <DialogFooter>
 *       <Button onClick={handleSave}>Save Configuration</Button>
 *     </DialogFooter>
 *   </DialogContent>
 * </Dialog>
 */