/**
 * Dynamic Prompt Generation System
 * 
 * Creates context-aware, field-specific prompts with platform optimization
 * and few-shot examples for enhanced AI generation quality.
 */

import { FieldType, FieldClassification, GenerationStrategy } from '../schema/fieldClassifier';

export interface PromptContext {
  triggerData: any;
  previousResults: Record<string, any>;
  fieldValue?: any;
  userPreferences: UserPreferences;
  platformContext: PlatformContext;
}

export interface UserPreferences {
  tone?: 'formal' | 'casual' | 'friendly' | 'humorous' | 'concise' | 'detailed';
  voice?: 'professional' | 'conversational' | 'authoritative' | 'supportive';
  style?: 'direct' | 'diplomatic' | 'enthusiastic' | 'technical';
  includeEmojis?: boolean;
  language?: string;
  customInstructions?: string;
}

export interface PlatformContext {
  providerId: string;
  actionType: string;
  maxLength?: number;
  supportsMarkdown?: boolean;
  supportsHtml?: boolean;
  requiresHashtags?: boolean;
  characterLimit?: number;
}

export interface GeneratedPrompt {
  systemPrompt: string;
  userPrompt: string;
  constraints: string[];
  examples?: Array<{ input: string; output: string }>;
  validationRules: string[];
}

/**
 * Dynamic Prompt Generator
 */
export class PromptGenerator {
  
  /**
   * Generate field-specific prompt with context and examples
   */
  static generateFieldPrompt(
    field: any,
    classification: FieldClassification,
    context: PromptContext
  ): GeneratedPrompt {
    const systemPrompt = this.buildSystemPrompt(classification, context);
    const userPrompt = this.buildUserPrompt(field, classification, context);
    const constraints = this.buildConstraints(field, classification, context);
    const examples = this.getExamples(classification.type, context.platformContext);
    const validationRules = this.buildValidationRules(field, classification);

    return {
      systemPrompt,
      userPrompt,
      constraints,
      examples,
      validationRules
    };
  }

  /**
   * Build system prompt with role definition and platform awareness
   */
  private static buildSystemPrompt(
    classification: FieldClassification,
    context: PromptContext
  ): string {
    const { platformContext, userPreferences } = context;
    
    let systemPrompt = `You are an expert content generator for workflow automation systems. `;
    
    // Add platform-specific expertise
    switch (platformContext.providerId) {
      case 'slack':
        systemPrompt += `You specialize in Slack messaging with casual, engaging tone and appropriate emoji usage. `;
        break;
      case 'discord':
        systemPrompt += `You specialize in Discord community messaging with friendly, approachable tone. `;
        break;
      case 'gmail':
      case 'outlook':
        systemPrompt += `You specialize in professional email communication with proper structure and etiquette. `;
        break;
      case 'twitter':
        systemPrompt += `You specialize in Twitter content with engagement-focused, concise messaging and strategic hashtag usage. `;
        break;
      case 'github':
      case 'gitlab':
        systemPrompt += `You specialize in technical documentation and issue tracking with clear, structured format. `;
        break;
      case 'linkedin':
        systemPrompt += `You specialize in professional networking content with business-appropriate tone. `;
        break;
      default:
        systemPrompt += `You adapt your communication style to the target platform. `;
    }

    // Add field-type expertise
    switch (classification.type) {
      case FieldType.SUBJECT:
      case FieldType.TITLE:
        systemPrompt += `Generate concise, descriptive titles that capture the key message or purpose. `;
        break;
      case FieldType.BODY:
      case FieldType.MESSAGE:
        systemPrompt += `Generate well-structured content with clear messaging and appropriate calls-to-action. `;
        break;
      case FieldType.TAGS:
        systemPrompt += `Generate relevant, searchable keywords and tags that categorize content effectively. `;
        break;
      case FieldType.DESCRIPTION:
        systemPrompt += `Generate informative descriptions that provide context and details. `;
        break;
    }

    // Add tone and style preferences
    if (userPreferences.tone) {
      systemPrompt += `Use a ${userPreferences.tone} tone throughout. `;
    }
    
    if (userPreferences.voice) {
      systemPrompt += `Adopt a ${userPreferences.voice} voice. `;
    }

    if (userPreferences.style) {
      systemPrompt += `Write in a ${userPreferences.style} style. `;
    }

    systemPrompt += `Generate ONLY the requested content without explanations, headers, or metadata.`;

    return systemPrompt;
  }

  /**
   * Build user prompt with context and specific instructions
   */
  private static buildUserPrompt(
    field: any,
    classification: FieldClassification,
    context: PromptContext
  ): string {
    let prompt = `Generate ${field.label || field.name} content.\n\n`;

    // Add context information
    prompt += `CONTEXT:\n`;
    prompt += this.formatContext(context);

    // Add field-specific instructions
    prompt += `\nFIELD REQUIREMENTS:\n`;
    prompt += `- Type: ${classification.type}\n`;
    prompt += `- Priority: ${classification.priority}\n`;
    prompt += `- Required: ${classification.constraints.required}\n`;
    
    if (classification.constraints.maxLength) {
      prompt += `- Max Length: ${classification.constraints.maxLength} characters\n`;
    }
    
    if (classification.constraints.options) {
      prompt += `- Available Options: ${classification.constraints.options.join(', ')}\n`;
    }

    // Add platform constraints
    if (context.platformContext.characterLimit) {
      prompt += `- Platform Limit: ${context.platformContext.characterLimit} characters\n`;
    }

    // Add generation strategy
    prompt += `\nGENERATION STRATEGY:\n`;
    prompt += `- Tone: ${classification.generationStrategy.tone}\n`;
    prompt += `- Length: ${classification.generationStrategy.length}\n`;
    
    if (context.userPreferences.includeEmojis && this.shouldIncludeEmojis(context.platformContext)) {
      prompt += `- Include relevant emojis where appropriate\n`;
    }

    // Add custom instructions
    if (context.userPreferences.customInstructions) {
      prompt += `\nCUSTOM INSTRUCTIONS:\n${context.userPreferences.customInstructions}\n`;
    }

    prompt += `\nGenerate the content now:`;

    return prompt;
  }

  /**
   * Format context information for the prompt
   */
  private static formatContext(context: PromptContext): string {
    let contextStr = '';

    // Format trigger data
    if (context.triggerData) {
      contextStr += `Trigger Data:\n`;
      
      // Extract key information based on trigger type
      if (context.triggerData.message) {
        contextStr += `- Message: "${context.triggerData.message.content || context.triggerData.content}"\n`;
        contextStr += `- Author: ${context.triggerData.message.author?.username || context.triggerData.author?.username || 'Unknown'}\n`;
        if (context.triggerData.channel_id) {
          contextStr += `- Channel: ${context.triggerData.channel_id}\n`;
        }
      } else if (context.triggerData.subject || context.triggerData.from) {
        contextStr += `- Subject: ${context.triggerData.subject || 'No subject'}\n`;
        contextStr += `- From: ${context.triggerData.from || 'Unknown sender'}\n`;
        if (context.triggerData.body) {
          contextStr += `- Body: "${context.triggerData.body.substring(0, 200)}${context.triggerData.body.length > 200 ? '...' : ''}"\n`;
        }
      } else if (context.triggerData.text) {
        contextStr += `- Text: "${context.triggerData.text}"\n`;
        contextStr += `- User: ${context.triggerData.user || 'Unknown'}\n`;
      } else {
        // Generic data formatting
        const keys = Object.keys(context.triggerData).slice(0, 5);
        keys.forEach(key => {
          const value = context.triggerData[key];
          if (typeof value === 'string' && value.length > 100) {
            contextStr += `- ${key}: "${value.substring(0, 100)}..."\n`;
          } else {
            contextStr += `- ${key}: ${JSON.stringify(value)}\n`;
          }
        });
      }
    }

    // Format previous results
    if (context.previousResults && Object.keys(context.previousResults).length > 0) {
      contextStr += `\nPrevious Workflow Results:\n`;
      Object.entries(context.previousResults).forEach(([nodeId, result]) => {
        if (result && typeof result === 'object' && result.output) {
          contextStr += `- ${nodeId}: ${JSON.stringify(result.output).substring(0, 100)}...\n`;
        }
      });
    }

    return contextStr || 'No specific context available';
  }

  /**
   * Build constraints for AI generation
   */
  private static buildConstraints(
    field: any,
    classification: FieldClassification,
    context: PromptContext
  ): string[] {
    const constraints: string[] = [];

    // Length constraints
    if (classification.constraints.maxLength) {
      constraints.push(`Maximum ${classification.constraints.maxLength} characters`);
    }

    // Platform-specific constraints
    const { platformContext } = context;
    if (platformContext.characterLimit) {
      constraints.push(`Platform limit: ${platformContext.characterLimit} characters`);
    }

    // Format constraints
    if (platformContext.supportsMarkdown) {
      constraints.push('Use Markdown formatting where appropriate');
    } else if (platformContext.supportsHtml) {
      constraints.push('Use HTML formatting where appropriate');
    } else {
      constraints.push('Use plain text only');
    }

    // Field-specific constraints
    switch (classification.type) {
      case FieldType.EMAIL:
        constraints.push('Must be valid email format');
        break;
      case FieldType.URL:
        constraints.push('Must be valid URL format');
        break;
      case FieldType.DATE:
        constraints.push('Must be valid date format (YYYY-MM-DD)');
        break;
      case FieldType.TAGS:
        constraints.push('Comma-separated values, no spaces in individual tags');
        break;
    }

    // Required field constraint
    if (classification.constraints.required) {
      constraints.push('This field is required and cannot be empty');
    }

    return constraints;
  }

  /**
   * Get few-shot examples for field type and platform
   */
  private static getExamples(
    fieldType: FieldType,
    platformContext: PlatformContext
  ): Array<{ input: string; output: string }> {
    const examples: Array<{ input: string; output: string }> = [];

    // Platform and field-type specific examples
    if (platformContext.providerId === 'slack' && fieldType === FieldType.MESSAGE) {
      examples.push(
        {
          input: 'Discord message: "Hey team, the API is down"',
          output: '🚨 **Alert**: API is currently down\n\nReceived from Discord: "Hey team, the API is down"\n\nLet\'s investigate this ASAP! 🔧'
        },
        {
          input: 'Email subject: "Bug Report - Login Issues"',
          output: '🐛 **Bug Report**: Login Issues\n\nThis came in via email - looks like we need to check the authentication system.\n\nWho can take a look? 👀'
        }
      );
    }

    if (platformContext.providerId === 'gmail' && fieldType === FieldType.SUBJECT) {
      examples.push(
        {
          input: 'Discord message: "When is the next team meeting?"',
          output: 'Re: Team Meeting Schedule Inquiry'
        },
        {
          input: 'Slack message: "Can someone review my PR?"',
          output: 'Re: Pull Request Review Request'
        }
      );
    }

    if (platformContext.providerId === 'twitter' && fieldType === FieldType.MESSAGE) {
      examples.push(
        {
          input: 'Product launch announcement',
          output: '🚀 Excited to announce our new product launch! This game-changing solution will transform how you work. Get early access now! #ProductLaunch #Innovation #Tech'
        }
      );
    }

    if (platformContext.providerId === 'github' && fieldType === FieldType.TITLE) {
      examples.push(
        {
          input: 'Bug report: "App crashes on mobile"',
          output: '[BUG] Application crashes on mobile devices'
        },
        {
          input: 'Feature request: "Add dark mode"',
          output: '[FEATURE] Implement dark mode toggle'
        }
      );
    }

    return examples;
  }

  /**
   * Build validation rules for generated content
   */
  private static buildValidationRules(
    field: any,
    classification: FieldClassification
  ): string[] {
    const rules: string[] = [];

    // Basic validation
    if (classification.constraints.required) {
      rules.push('Content cannot be empty');
    }

    if (classification.constraints.minLength) {
      rules.push(`Minimum length: ${classification.constraints.minLength} characters`);
    }

    if (classification.constraints.maxLength) {
      rules.push(`Maximum length: ${classification.constraints.maxLength} characters`);
    }

    // Type-specific validation
    switch (classification.type) {
      case FieldType.EMAIL:
        rules.push('Must contain valid email address format');
        break;
      case FieldType.URL:
        rules.push('Must be valid HTTP/HTTPS URL');
        break;
      case FieldType.DATE:
        rules.push('Must be valid ISO date format');
        break;
      case FieldType.TAGS:
        rules.push('Must be comma-separated without spaces in tags');
        break;
      case FieldType.PHONE:
        rules.push('Must be valid phone number format');
        break;
    }

    // Pattern validation
    if (classification.constraints.pattern) {
      rules.push(`Must match pattern: ${classification.constraints.pattern}`);
    }

    return rules;
  }

  /**
   * Determine if emojis should be included based on platform
   */
  private static shouldIncludeEmojis(platformContext: PlatformContext): boolean {
    const emojiPlatforms = ['slack', 'discord', 'twitter', 'facebook', 'instagram'];
    return emojiPlatforms.includes(platformContext.providerId);
  }

  /**
   * Generate follow-up prompt for refinement
   */
  static generateRefinementPrompt(
    originalContent: string,
    validationErrors: string[],
    constraints: string[]
  ): string {
    let prompt = `The generated content needs refinement. Here's what was generated:\n\n`;
    prompt += `"${originalContent}"\n\n`;
    
    if (validationErrors.length > 0) {
      prompt += `VALIDATION ERRORS:\n`;
      validationErrors.forEach(error => prompt += `- ${error}\n`);
      prompt += `\n`;
    }
    
    prompt += `CONSTRAINTS TO FOLLOW:\n`;
    constraints.forEach(constraint => prompt += `- ${constraint}\n`);
    
    prompt += `\nGenerate improved content that addresses all issues:`;
    
    return prompt;
  }

  /**
   * Generate prompt for content splitting (for length limits)
   */
  static generateSplitPrompt(
    content: string,
    maxLength: number,
    platform: string
  ): string {
    return `The following content exceeds the ${platform} character limit of ${maxLength}:

"${content}"

Split this into multiple parts that:
1. Each part is under ${maxLength} characters
2. Maintains coherent meaning in each part
3. Uses appropriate continuation indicators
4. Follows ${platform} formatting conventions

Generate the split content:`;
  }
}