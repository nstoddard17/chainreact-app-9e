import { logger } from '@/lib/utils/logger'

/**
 * AI Field Generation Templates and Service
 * 
 * This module provides AI-powered field generation for workflow actions
 * based on context, trigger data, and predefined templates.
 */

export interface AIFieldTemplate {
  generation: string;
  template: string | object;
  style: string;
  max_length?: number;
  formatting?: string;
  constraints?: string[];
}

export interface WorkflowContext {
  nodes: any[];
  edges: any[];
  triggerData: any;
  previousResults: Record<string, any>;
}

export interface AIGenerationRequest {
  actionType: string;
  fieldName: string;
  context: WorkflowContext;
  userPreferences?: {
    tone?: 'professional' | 'casual' | 'friendly';
    length?: 'short' | 'medium' | 'long';
    includeEmojis?: boolean;
  };
}

/**
 * AI Field Generation Templates by Action Type
 */
export const AI_FIELD_TEMPLATES: Record<string, Record<string, AIFieldTemplate>> = {
  // Email Actions
  'gmail_action_send_email': {
    subject: {
      generation: 'contextual_summary',
      template: 'Re: {trigger_context} - {action_summary}',
      style: 'professional, concise',
      max_length: 78,
      formatting: 'plain_text'
    },
    body: {
      generation: 'structured_email',
      template: {
        greeting: 'Hi {recipient_name},',
        opening: 'Thank you for {trigger_context}. I wanted to follow up regarding {main_topic}.',
        main_content: '{context_analysis_and_response}',
        call_to_action: '{next_steps_if_applicable}',
        closing: 'Best regards'
      },
      style: 'professional, helpful, actionable',
      formatting: 'html_with_paragraphs'
    }
  },

  'outlook_action_send_email': {
    subject: {
      generation: 'contextual_summary',
      template: 'Re: {trigger_context} - {action_summary}',
      style: 'professional, concise',
      max_length: 78,
      formatting: 'plain_text'
    },
    body: {
      generation: 'structured_email',
      template: {
        greeting: 'Hello {recipient_name},',
        opening: 'I hope this message finds you well. I am writing regarding {main_topic}.',
        main_content: '{context_analysis_and_response}',
        call_to_action: '{next_steps_if_applicable}',
        closing: 'Kind regards'
      },
      style: 'professional, formal, actionable',
      formatting: 'html_with_paragraphs'
    }
  },

  // Communication Actions
  'slack_action_send_message': {
    text: {
      generation: 'slack_message',
      template: '{greeting_emoji} {main_message}\n\n{context_details}\n\n{call_to_action_if_needed}',
      style: 'casual, friendly, emoji-appropriate',
      formatting: 'slack_markdown',
      max_length: 4000
    },
    username: {
      generation: 'bot_name',
      template: '{workflow_name} Bot',
      style: 'descriptive, professional'
    }
  },

  'discord_action_send_message': {
    content: {
      generation: 'discord_message',
      template: '**{title}**\n\n{main_content}\n\n{additional_info}',
      style: 'casual, engaging, community-friendly',
      formatting: 'discord_markdown',
      max_length: 2000
    },
    username: {
      generation: 'bot_name',
      template: '{workflow_name} Assistant',
      style: 'friendly, approachable'
    }
  },

  // Social Media Actions
  'twitter_action_post': {
    text: {
      generation: 'twitter_post',
      template: '{hook_or_emoji} {main_message} {hashtags}',
      style: 'engaging, conversational, hashtag-optimized',
      max_length: 280,
      formatting: 'twitter_optimized'
    }
  },

  // Productivity Actions
  'notion_action_create_page': {
    title: {
      generation: 'notion_title',
      template: '{content_type}: {main_topic} - {date}',
      style: 'descriptive, organized, searchable',
      max_length: 200
    },
    content: {
      generation: 'notion_content',
      template: '# {title}\n\n## Summary\n{overview}\n\n## Details\n{main_content}\n\n## Next Steps\n{action_items}',
      style: 'structured, comprehensive, actionable',
      formatting: 'notion_markdown'
    }
  },

  'trello_action_create_card': {
    name: {
      generation: 'trello_title',
      template: '{action_verb}: {brief_description}',
      style: 'action-oriented, concise',
      max_length: 256
    },
    desc: {
      generation: 'trello_description',
      template: '**Background:**\n{context}\n\n**Requirements:**\n{details}\n\n**Acceptance Criteria:**\n{criteria}',
      style: 'clear, actionable, detailed',
      formatting: 'markdown'
    }
  },

  // Developer Tools
  'github_action_create_issue': {
    title: {
      generation: 'github_issue_title',
      template: '[{issue_type}] {brief_description}',
      style: 'clear, categorized, searchable',
      max_length: 256
    },
    body: {
      generation: 'github_issue_body',
      template: '## Description\n{problem_description}\n\n## Steps to Reproduce\n{steps_if_applicable}\n\n## Expected Behavior\n{expected_outcome}\n\n## Additional Context\n{context_details}',
      style: 'technical, structured, actionable',
      formatting: 'github_markdown'
    }
  },

  // E-commerce Actions
  'shopify_action_create_product': {
    title: {
      generation: 'product_title',
      template: '{descriptive_name} - {key_feature}',
      style: 'marketable, SEO-friendly, clear',
      max_length: 255
    },
    body_html: {
      generation: 'product_description',
      template: '<h3>Key Features</h3><ul><li>{feature_1}</li><li>{feature_2}</li></ul><h3>Description</h3><p>{detailed_description}</p>',
      style: 'persuasive, informative, SEO-optimized',
      formatting: 'html'
    },
    tags: {
      generation: 'product_tags',
      template: '{category}, {features}, {use_cases}',
      style: 'searchable, relevant, comma-separated'
    }
  }
};

/**
 * AI Field Generation Service
 */
export class AIFieldGenerator {
  /**
   * Generate content for a specific field using AI
   */
  async generateField(request: AIGenerationRequest): Promise<string> {
    const template = this.getTemplate(request.actionType, request.fieldName);
    if (!template) {
      throw new Error(`No template found for ${request.actionType}.${request.fieldName}`);
    }

    const prompt = this.buildPrompt(template, request);
    const generatedContent = await this.callAI(prompt, template);
    
    return this.postProcessContent(generatedContent, template);
  }

  /**
   * Get template for specific action and field
   */
  private getTemplate(actionType: string, fieldName: string): AIFieldTemplate | null {
    return AI_FIELD_TEMPLATES[actionType]?.[fieldName] || null;
  }

  /**
   * Build AI prompt from template and context
   */
  private buildPrompt(template: AIFieldTemplate, request: AIGenerationRequest): string {
    const { context, userPreferences } = request;
    
    // Extract context information
    const triggerType = this.getTriggerType(context);
    const triggerData = this.extractTriggerData(context);
    const previousResults = this.extractPreviousResults(context);

    return `You are an AI assistant helping to generate ${template.generation} content.

CONTEXT:
- Trigger Type: ${triggerType}
- Trigger Data: ${JSON.stringify(triggerData, null, 2)}
- Previous Results: ${JSON.stringify(previousResults, null, 2)}
- User Preferences: ${JSON.stringify(userPreferences || {}, null, 2)}

REQUIREMENTS:
- Style: ${template.style}
- Template: ${typeof template.template === 'string' ? template.template : JSON.stringify(template.template, null, 2)}
- Max Length: ${template.max_length || 'No limit'}
- Formatting: ${template.formatting || 'Plain text'}

INSTRUCTIONS:
1. Generate content that follows the template structure
2. Use the provided context to make the content relevant and specific
3. Match the required style and tone
4. Stay within length limits if specified
5. Use appropriate formatting for the platform

Generate ONLY the content, no explanations or metadata.`;
  }

  /**
   * Call AI service to generate content
   */
  private async callAI(prompt: string, template: AIFieldTemplate): Promise<string> {
    try {
      // Import OpenAI dynamically
      const { OpenAI } = await import('openai');
      
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      if (!process.env.OPENAI_API_KEY) {
        throw new Error("OpenAI API key not configured");
      }

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a professional content generator. Generate content exactly as requested without any preamble or explanation.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: template.max_length ? Math.min(template.max_length * 2, 1000) : 1000,
        temperature: 0.7
      });

      return completion.choices[0]?.message?.content?.trim() || '';
    } catch (error: any) {
      logger.error("AI generation failed:", error);
      return this.getFallbackContent(template);
    }
  }

  /**
   * Post-process generated content
   */
  private postProcessContent(content: string, template: AIFieldTemplate): string {
    // Apply length constraints
    if (template.max_length && content.length > template.max_length) {
      content = `${content.substring(0, template.max_length - 3) }...`;
    }

    // Apply formatting constraints
    if (template.formatting === 'plain_text') {
      content = content.replace(/<[^>]*>/g, ''); // Strip HTML
    }

    return content;
  }

  /**
   * Extract trigger type from context
   */
  private getTriggerType(context: WorkflowContext): string {
    const triggerNode = context.nodes.find(node => node.data?.isTrigger);
    return triggerNode?.data?.type || 'manual';
  }

  /**
   * Extract relevant trigger data
   */
  private extractTriggerData(context: WorkflowContext): any {
    return context.triggerData || {};
  }

  /**
   * Extract previous workflow results
   */
  private extractPreviousResults(context: WorkflowContext): any {
    return context.previousResults || {};
  }

  /**
   * Get fallback content if AI generation fails
   */
  private getFallbackContent(template: AIFieldTemplate): string {
    const fallbacks: Record<string, string> = {
      'contextual_summary': 'Follow-up Required',
      'structured_email': 'Thank you for your message. I will get back to you soon.',
      'slack_message': 'Update from workflow automation',
      'discord_message': 'Workflow notification',
      'twitter_post': 'Update from ChainReact workflow',
      'notion_title': 'New Page Created',
      'trello_title': 'New Task',
      'github_issue_title': 'Issue Created via Automation',
      'product_title': 'New Product'
    };

    return fallbacks[template.generation] || 'Generated by ChainReact';
  }
}

/**
 * Utility function to check if a field supports AI generation
 */
export function supportsAIGeneration(actionType: string, fieldName: string): boolean {
  return !!(AI_FIELD_TEMPLATES[actionType]?.[fieldName]);
}

/**
 * Get all AI-generateable fields for an action
 */
export function getAIGenerateableFields(actionType: string): string[] {
  return Object.keys(AI_FIELD_TEMPLATES[actionType] || {});
}

/**
 * Get template for preview purposes
 */
export function getFieldTemplate(actionType: string, fieldName: string): AIFieldTemplate | null {
  return AI_FIELD_TEMPLATES[actionType]?.[fieldName] || null;
}

// Export singleton instance
export const aiFieldGenerator = new AIFieldGenerator();