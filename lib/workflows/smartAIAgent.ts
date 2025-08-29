/**
 * Smart AI Agent - Autonomous Field Population
 * 
 * This AI agent automatically analyzes downstream action schemas and populates
 * all user-fillable fields based on upstream context, replicating n8n's AI Agent functionality.
 */

import { ALL_NODE_COMPONENTS } from './nodes';

export interface FieldSchema {
  name: string;
  label: string;
  type: string;
  required: boolean;
  options?: any[];
  placeholder?: string;
  description?: string;
  maxLength?: number;
  multiple?: boolean;
}

export interface ActionSchema {
  type: string;
  title: string;
  configSchema: FieldSchema[];
  outputSchema: any[];
  providerId: string;
}

export interface UpstreamContext {
  triggerData?: any;
  previousActionResults?: Record<string, any>;
  workflowMetadata?: {
    name?: string;
    description?: string;
    tags?: string[];
  };
}

export interface SmartAIAgentConfig {
  targetActionId: string;
  targetActionType: string;
  upstreamContext: UpstreamContext;
  userPreferences?: {
    tone?: 'professional' | 'casual' | 'friendly';
    length?: 'concise' | 'detailed' | 'comprehensive';
    includeEmojis?: boolean;
    language?: string;
  };
}

export interface GeneratedFields {
  [fieldName: string]: any;
}

/**
 * Field Type Classification for AI Generation
 */
const FIELD_CLASSIFIERS = {
  // Text content fields
  SUBJECT: ['subject', 'title', 'name', 'summary', 'headline'],
  BODY: ['body', 'content', 'message', 'text', 'description', 'details'],
  GREETING: ['greeting', 'salutation', 'opening'],
  CLOSING: ['closing', 'signature', 'ending'],
  
  // Contact fields
  EMAIL: ['email', 'to', 'from', 'recipient', 'sender'],
  NAME: ['name', 'username', 'displayName', 'author'],
  PHONE: ['phone', 'mobile', 'telephone'],
  
  // Date/Time fields
  DATE: ['date', 'dueDate', 'startDate', 'endDate', 'scheduledAt'],
  TIME: ['time', 'startTime', 'endTime', 'duration'],
  
  // Selection fields
  CATEGORY: ['category', 'type', 'status', 'priority', 'label'],
  TAGS: ['tags', 'labels', 'keywords', 'hashtags'],
  
  // URLs and files
  URL: ['url', 'link', 'website', 'avatar', 'image'],
  FILE: ['file', 'attachment', 'document', 'media'],
  
  // Numbers and amounts
  NUMBER: ['amount', 'price', 'quantity', 'count', 'number'],
  CURRENCY: ['price', 'cost', 'fee', 'amount', 'value'],
  
  // Platform-specific
  CHANNEL: ['channel', 'channelId', 'room', 'space'],
  THREAD: ['thread', 'threadId', 'conversation'],
  MENTION: ['mention', 'assignee', 'reviewer', 'participant']
};

/**
 * Smart AI Agent for Autonomous Field Population
 */
export class SmartAIAgent {
  
  /**
   * Main execution method - analyzes target action and populates all fields
   */
  async executeSmartGeneration(config: SmartAIAgentConfig): Promise<GeneratedFields> {
    try {
      // 1. Get the target action schema
      const actionSchema = this.getActionSchema(config.targetActionType);
      if (!actionSchema) {
        throw new Error(`Unknown action type: ${config.targetActionType}`);
      }

      // 2. Identify user-fillable fields
      const fillableFields = this.identifyFillableFields(actionSchema);
      
      // 3. Analyze upstream context for available data
      const contextAnalysis = this.analyzeUpstreamContext(config.upstreamContext);
      
      // 4. Generate values for each field
      const generatedFields: GeneratedFields = {};
      
      for (const field of fillableFields) {
        const generatedValue = await this.generateFieldValue(
          field,
          contextAnalysis,
          actionSchema,
          config.userPreferences
        );
        
        if (generatedValue !== null) {
          generatedFields[field.name] = generatedValue;
        }
      }

      console.log(`🤖 Smart AI Agent generated ${Object.keys(generatedFields).length} fields for ${actionSchema.title}`);
      console.log('🎯 Generated fields:', generatedFields);

      return generatedFields;

    } catch (error: any) {
      console.error('❌ Smart AI Agent execution failed:', error);
      throw error;
    }
  }

  /**
   * Get action schema from available nodes
   */
  private getActionSchema(actionType: string): ActionSchema | null {
    const nodeComponent = ALL_NODE_COMPONENTS.find(comp => comp.type === actionType);
    if (!nodeComponent) return null;

    return {
      type: actionType,
      title: nodeComponent.title,
      configSchema: nodeComponent.configSchema || [],
      outputSchema: nodeComponent.outputSchema || [],
      providerId: nodeComponent.providerId || ''
    };
  }

  /**
   * Identify which fields can be populated by AI
   */
  private identifyFillableFields(schema: ActionSchema): FieldSchema[] {
    return schema.configSchema.filter(field => {
      // Skip read-only or system fields
      if (field.type === 'info' || field.type === 'divider') return false;
      
      // Skip dynamic selection fields that require API calls
      if (field.type === 'select' && !field.options) return false;
      
      // Skip file uploads (for now)
      if (field.type === 'file') return false;
      
      // Include text, textarea, email, number, date, boolean fields
      const fillableTypes = [
        'text', 'textarea', 'email', 'number', 'date', 'time',
        'boolean', 'select', 'multiselect', 'email-rich-text', 
        'discord-rich-text'
      ];
      
      return fillableTypes.includes(field.type);
    });
  }

  /**
   * Analyze upstream context to extract useful data
   */
  private analyzeUpstreamContext(context: UpstreamContext) {
    const analysis = {
      triggerType: 'unknown',
      mainContent: '',
      sender: null,
      recipient: null,
      subject: '',
      timestamp: new Date().toISOString(),
      sentiment: 'neutral',
      urgency: 'normal',
      category: 'general',
      extractedData: {} as any
    };

    // Analyze trigger data
    if (context.triggerData) {
      const trigger = context.triggerData;
      
      // Discord message trigger
      if (trigger.message) {
        analysis.triggerType = 'discord_message';
        analysis.mainContent = trigger.message.content || trigger.content || '';
        analysis.sender = trigger.message.author?.username || trigger.author?.username;
        analysis.extractedData = {
          channelId: trigger.message.channel_id || trigger.channel_id,
          messageId: trigger.message.id || trigger.id,
          guildId: trigger.guild_id
        };
      }
      
      // Email trigger
      else if (trigger.subject || trigger.from || trigger.to) {
        analysis.triggerType = 'email';
        analysis.subject = trigger.subject || '';
        analysis.mainContent = trigger.body || trigger.bodyText || '';
        analysis.sender = trigger.from;
        analysis.recipient = trigger.to;
        analysis.extractedData = {
          messageId: trigger.messageId,
          threadId: trigger.threadId
        };
      }
      
      // Slack message trigger
      else if (trigger.text || trigger.channel) {
        analysis.triggerType = 'slack_message';
        analysis.mainContent = trigger.text || '';
        analysis.sender = trigger.user;
        analysis.extractedData = {
          channel: trigger.channel,
          timestamp: trigger.ts
        };
      }
      
      // Generic webhook/form data
      else {
        analysis.triggerType = 'webhook';
        analysis.mainContent = JSON.stringify(trigger);
        analysis.extractedData = trigger;
      }
    }

    // Analyze previous action results
    if (context.previousActionResults) {
      Object.entries(context.previousActionResults).forEach(([nodeId, result]) => {
        if (result && typeof result === 'object') {
          // Extract any useful data from previous actions
          if (result.output) analysis.mainContent += '\n' + result.output;
          if (result.subject) analysis.subject = result.subject;
          if (result.email_subject) analysis.subject = result.email_subject;
          if (result.email_body) analysis.mainContent += '\n' + result.email_body;
        }
      });
    }

    return analysis;
  }

  /**
   * Generate value for a specific field based on context
   */
  private async generateFieldValue(
    field: FieldSchema,
    context: any,
    actionSchema: ActionSchema,
    userPreferences?: any
  ): Promise<any> {
    
    const fieldClassification = this.classifyField(field);
    
    // Handle different field types
    switch (field.type) {
      case 'select':
      case 'multiselect':
        return this.generateSelectValue(field, context, actionSchema);
        
      case 'boolean':
        return this.generateBooleanValue(field, context);
        
      case 'date':
        return this.generateDateValue(field, context);
        
      case 'time':
        return this.generateTimeValue(field, context);
        
      case 'number':
        return this.generateNumberValue(field, context);
        
      case 'email':
        return this.generateEmailValue(field, context);
        
      case 'text':
      case 'textarea':
      case 'email-rich-text':
      case 'discord-rich-text':
      default:
        return await this.generateTextValue(field, context, actionSchema, fieldClassification, userPreferences);
    }
  }

  /**
   * Classify field type for appropriate generation
   */
  private classifyField(field: FieldSchema): string {
    const fieldName = field.name.toLowerCase();
    const fieldLabel = field.label?.toLowerCase() || '';
    const combined = `${fieldName} ${fieldLabel}`;

    for (const [category, keywords] of Object.entries(FIELD_CLASSIFIERS)) {
      if (keywords.some(keyword => combined.includes(keyword))) {
        return category;
      }
    }

    return 'GENERIC';
  }

  /**
   * Generate text values using AI
   */
  private async generateTextValue(
    field: FieldSchema,
    context: any,
    actionSchema: ActionSchema,
    classification: string,
    userPreferences?: any
  ): Promise<string> {
    
    const prompt = this.buildTextGenerationPrompt(field, context, actionSchema, classification, userPreferences);
    
    try {
      const { OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an AI assistant that generates contextually appropriate content for workflow automation. Generate ONLY the requested content without explanations or metadata.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: field.maxLength ? Math.min(field.maxLength, 500) : 300,
        temperature: 0.7
      });

      let generated = completion.choices[0]?.message?.content?.trim() || '';
      
      // Apply field-specific formatting
      generated = this.formatFieldContent(generated, field, classification);
      
      return generated;
      
    } catch (error) {
      console.error('AI generation failed, using fallback:', error);
      return this.getFallbackTextValue(field, context, classification);
    }
  }

  /**
   * Build prompt for text generation
   */
  private buildTextGenerationPrompt(
    field: FieldSchema,
    context: any,
    actionSchema: ActionSchema,
    classification: string,
    userPreferences?: any
  ): string {
    
    const tone = userPreferences?.tone || 'professional';
    const length = userPreferences?.length || 'concise';
    
    let basePrompt = `Generate ${field.label || field.name} for a ${actionSchema.title} action.\n\n`;
    
    // Add context
    basePrompt += `CONTEXT:\n`;
    basePrompt += `- Trigger: ${context.triggerType}\n`;
    basePrompt += `- Main Content: ${context.mainContent.substring(0, 500)}\n`;
    basePrompt += `- Sender: ${context.sender || 'Unknown'}\n`;
    basePrompt += `- Subject: ${context.subject || 'N/A'}\n\n`;
    
    // Add field-specific instructions
    basePrompt += `FIELD REQUIREMENTS:\n`;
    basePrompt += `- Field Type: ${field.type}\n`;
    basePrompt += `- Classification: ${classification}\n`;
    basePrompt += `- Required: ${field.required}\n`;
    if (field.maxLength) basePrompt += `- Max Length: ${field.maxLength} characters\n`;
    if (field.placeholder) basePrompt += `- Placeholder: ${field.placeholder}\n`;
    if (field.description) basePrompt += `- Description: ${field.description}\n`;
    
    basePrompt += `\nSTYLE: ${tone}, ${length}\n\n`;
    
    // Add classification-specific instructions
    switch (classification) {
      case 'SUBJECT':
        basePrompt += `Generate a concise, descriptive subject line that summarizes the main topic. No quotes.`;
        break;
      case 'BODY':
        basePrompt += `Generate a well-structured ${actionSchema.providerId === 'gmail' ? 'email body' : 'message'} with appropriate greeting, main content, and closing if needed.`;
        break;
      case 'EMAIL':
        basePrompt += `Generate an appropriate email address or extract from context if available.`;
        break;
      case 'NAME':
        basePrompt += `Generate or extract an appropriate name/username from the context.`;
        break;
      case 'DATE':
        basePrompt += `Generate a relevant date in YYYY-MM-DD format or extract from context.`;
        break;
      case 'TAGS':
        basePrompt += `Generate relevant tags/labels separated by commas based on the content.`;
        break;
      default:
        basePrompt += `Generate appropriate content for this ${field.type} field based on the context.`;
    }
    
    return basePrompt;
  }

  /**
   * Generate select field values
   */
  private generateSelectValue(field: FieldSchema, context: any, actionSchema: ActionSchema): any {
    if (!field.options || field.options.length === 0) {
      return null; // Skip dynamic fields
    }

    // For static options, choose the most appropriate one
    const options = field.options;
    
    // Simple heuristics for common selections
    if (field.name.includes('priority')) {
      return options.find(opt => opt.value === 'medium' || opt.value === 'normal') || options[0];
    }
    
    if (field.name.includes('status')) {
      return options.find(opt => opt.value === 'active' || opt.value === 'open' || opt.value === 'new') || options[0];
    }
    
    // Default to first option
    return field.multiple ? [options[0]] : options[0];
  }

  /**
   * Generate boolean values
   */
  private generateBooleanValue(field: FieldSchema, context: any): boolean {
    // Default heuristics for common boolean fields
    if (field.name.includes('notification') || field.name.includes('alert')) return true;
    if (field.name.includes('public') || field.name.includes('visible')) return false;
    if (field.name.includes('urgent') || field.name.includes('important')) {
      return context.urgency === 'high';
    }
    
    return false; // Conservative default
  }

  /**
   * Generate date values
   */
  private generateDateValue(field: FieldSchema, context: any): string {
    const now = new Date();
    
    if (field.name.includes('due') || field.name.includes('deadline')) {
      // Default to 1 week from now for due dates
      const dueDate = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
      return dueDate.toISOString().split('T')[0];
    }
    
    if (field.name.includes('start')) {
      return now.toISOString().split('T')[0];
    }
    
    return now.toISOString().split('T')[0];
  }

  /**
   * Generate time values
   */
  private generateTimeValue(field: FieldSchema, context: any): string {
    const now = new Date();
    return now.toTimeString().split(' ')[0].substring(0, 5); // HH:MM format
  }

  /**
   * Generate number values
   */
  private generateNumberValue(field: FieldSchema, context: any): number {
    if (field.name.includes('quantity') || field.name.includes('count')) return 1;
    if (field.name.includes('price') || field.name.includes('amount')) return 0;
    if (field.name.includes('duration')) return 30; // 30 minutes default
    
    return 1;
  }

  /**
   * Generate email values
   */
  private generateEmailValue(field: FieldSchema, context: any): string {
    if (context.sender && context.sender.includes('@')) {
      return context.sender;
    }
    
    if (context.recipient && context.recipient.includes('@')) {
      return context.recipient;
    }
    
    return ''; // Let user fill manually if no email in context
  }

  /**
   * Format content based on field requirements
   */
  private formatFieldContent(content: string, field: FieldSchema, classification: string): string {
    // Remove quotes if they were added by AI
    content = content.replace(/^["']|["']$/g, '');
    
    // Apply length limits
    if (field.maxLength && content.length > field.maxLength) {
      content = content.substring(0, field.maxLength - 3) + '...';
    }
    
    // Format based on field type
    if (field.type === 'email-rich-text') {
      // Ensure proper HTML formatting for emails
      if (!content.includes('<')) {
        content = content.split('\n').map(line => `<p>${line}</p>`).join('');
      }
    }
    
    return content.trim();
  }

  /**
   * Get fallback values when AI generation fails
   */
  private getFallbackTextValue(field: FieldSchema, context: any, classification: string): string {
    const fallbacks: Record<string, string> = {
      'SUBJECT': 'Follow-up Required',
      'BODY': 'Thank you for your message. I will review and respond accordingly.',
      'EMAIL': '',
      'NAME': context.sender || 'User',
      'TAGS': 'automated, workflow',
      'GENERIC': field.placeholder || `Generated ${field.label || field.name}`
    };

    return fallbacks[classification] || fallbacks['GENERIC'];
  }
}

/**
 * Export singleton instance
 */
export const smartAIAgent = new SmartAIAgent();