/**
 * Edge Case and Fallback Handling System
 * 
 * Provides robust fallback strategies for missing context, failed AI generation,
 * and other edge cases to ensure workflow reliability.
 */

import { FieldType, FieldClassification, FieldPriority } from '../schema/fieldClassifier';

import { logger } from '@/lib/utils/logger'

export interface FallbackStrategy {
  type: 'template' | 'default_value' | 'user_input' | 'skip' | 'context_derived' | 'api_lookup';
  priority: number;
  condition?: (context: any) => boolean;
  value?: any;
  template?: string;
  requiresUserInput?: boolean;
  placeholder?: string;
}

export interface FallbackContext {
  field: any;
  classification: FieldClassification;
  triggerData: any;
  previousResults: Record<string, any>;
  userPreferences: any;
  platformContext: any;
  lastError?: string;
  retryCount?: number;
}

export interface FallbackResult {
  success: boolean;
  value: any;
  strategy: string;
  confidence: number;
  requiresUserInput: boolean;
  placeholder?: string;
  reasoning: string;
}

/**
 * Fallback Handler for edge cases and failures
 */
export class FallbackHandler {
  
  /**
   * Handle fallback generation when AI fails or context is insufficient
   */
  static async handleFallback(context: FallbackContext): Promise<FallbackResult> {
    logger.debug(`🔄 Handling fallback for field: ${context.field.name}`);
    
    const strategies = this.getFallbackStrategies(context);
    
    // Try each strategy in order of priority
    for (const strategy of strategies) {
      if (strategy.condition && !strategy.condition(context)) {
        continue;
      }
      
      const result = await this.executeStrategy(strategy, context);
      if (result.success) {
        logger.debug(`✅ Fallback successful using strategy: ${strategy.type}`);
        return result;
      }
    }
    
    // Ultimate fallback - use placeholder
    return this.getUltimateFallback(context);
  }

  /**
   * Get prioritized fallback strategies for a field
   */
  private static getFallbackStrategies(context: FallbackContext): FallbackStrategy[] {
    const { classification, field } = context;
    const strategies: FallbackStrategy[] = [];

    // Strategy 1: Context-derived values (highest priority)
    if (this.hasUsableContext(context)) {
      strategies.push({
        type: 'context_derived',
        priority: 1,
        condition: (ctx) => this.hasUsableContext(ctx)
      });
    }

    // Strategy 2: Field-specific templates
    strategies.push({
      type: 'template',
      priority: 2,
      template: this.getFieldTemplate(classification.type, context.platformContext?.providerId)
    });

    // Strategy 3: Default values based on field type
    strategies.push({
      type: 'default_value',
      priority: 3,
      value: this.getDefaultValue(classification.type, field)
    });

    // Strategy 4: User input for critical fields
    if (classification.priority === FieldPriority.CRITICAL) {
      strategies.push({
        type: 'user_input',
        priority: 4,
        requiresUserInput: true,
        placeholder: this.getUserInputPlaceholder(classification.type, field)
      });
    }

    // Strategy 5: Skip non-critical fields
    if (classification.priority === FieldPriority.LOW || !classification.constraints.required) {
      strategies.push({
        type: 'skip',
        priority: 5
      });
    }

    return strategies.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Execute a specific fallback strategy
   */
  private static async executeStrategy(
    strategy: FallbackStrategy,
    context: FallbackContext
  ): Promise<FallbackResult> {
    
    try {
      switch (strategy.type) {
        case 'context_derived':
          return this.deriveFromContext(context);
          
        case 'template':
          return this.useTemplate(strategy, context);
          
        case 'default_value':
          return this.useDefaultValue(strategy, context);
          
        case 'user_input':
          return this.requestUserInput(strategy, context);
          
        case 'skip':
          return this.skipField(context);
          
        case 'api_lookup':
          return await this.performApiLookup(strategy, context);
          
        default:
          return {
            success: false,
            value: null,
            strategy: strategy.type,
            confidence: 0,
            requiresUserInput: false,
            reasoning: 'Unknown strategy type'
          };
      }
    } catch (error: any) {
      logger.error(`❌ Strategy ${strategy.type} failed:`, error);
      return {
        success: false,
        value: null,
        strategy: strategy.type,
        confidence: 0,
        requiresUserInput: false,
        reasoning: `Strategy execution failed: ${error.message}`
      };
    }
  }

  /**
   * Derive value from available context
   */
  private static deriveFromContext(context: FallbackContext): FallbackResult {
    const { classification, triggerData, previousResults } = context;
    
    let derivedValue: any = null;
    const confidence = 0.7;
    let reasoning = '';

    switch (classification.type) {
      case FieldType.SUBJECT:
      case FieldType.TITLE:
        derivedValue = this.deriveTitle(triggerData, previousResults);
        reasoning = 'Derived title from trigger data';
        break;
        
      case FieldType.EMAIL:
        derivedValue = this.deriveEmail(triggerData, previousResults);
        reasoning = 'Extracted email from context';
        break;
        
      case FieldType.NAME:
      case FieldType.USERNAME:
        derivedValue = this.deriveName(triggerData, previousResults);
        reasoning = 'Extracted name from context';
        break;
        
      case FieldType.DATE:
        derivedValue = this.deriveDate(triggerData);
        reasoning = 'Used current date/time';
        break;
        
      case FieldType.TAGS:
        derivedValue = this.deriveTags(triggerData, context.platformContext);
        reasoning = 'Generated tags from context';
        break;
        
      case FieldType.BODY:
      case FieldType.MESSAGE:
        derivedValue = this.deriveMessage(triggerData, context.platformContext);
        reasoning = 'Constructed message from available data';
        break;
    }

    if (derivedValue !== null) {
      return {
        success: true,
        value: derivedValue,
        strategy: 'context_derived',
        confidence,
        requiresUserInput: false,
        reasoning
      };
    }

    return {
      success: false,
      value: null,
      strategy: 'context_derived',
      confidence: 0,
      requiresUserInput: false,
      reasoning: 'Insufficient context for derivation'
    };
  }

  /**
   * Use template-based fallback
   */
  private static useTemplate(strategy: FallbackStrategy, context: FallbackContext): FallbackResult {
    if (!strategy.template) {
      return {
        success: false,
        value: null,
        strategy: 'template',
        confidence: 0,
        requiresUserInput: false,
        reasoning: 'No template available'
      };
    }

    // Simple template variable replacement
    let value = strategy.template;
    const { triggerData, platformContext } = context;
    
    // Replace common template variables
    if (triggerData) {
      value = value.replace('{trigger_type}', this.getTriggerType(triggerData));
      value = value.replace('{platform}', platformContext?.providerId || 'system');
      value = value.replace('{date}', new Date().toLocaleDateString());
      value = value.replace('{time}', new Date().toLocaleTimeString());
    }

    return {
      success: true,
      value,
      strategy: 'template',
      confidence: 0.6,
      requiresUserInput: false,
      reasoning: 'Used template fallback'
    };
  }

  /**
   * Use default value fallback
   */
  private static useDefaultValue(strategy: FallbackStrategy, context: FallbackContext): FallbackResult {
    return {
      success: true,
      value: strategy.value,
      strategy: 'default_value',
      confidence: 0.4,
      requiresUserInput: false,
      reasoning: 'Used default value for field type'
    };
  }

  /**
   * Request user input for critical fields
   */
  private static requestUserInput(strategy: FallbackStrategy, context: FallbackContext): FallbackResult {
    return {
      success: true,
      value: null,
      strategy: 'user_input',
      confidence: 0,
      requiresUserInput: true,
      placeholder: strategy.placeholder,
      reasoning: 'Critical field requires user input'
    };
  }

  /**
   * Skip optional fields
   */
  private static skipField(context: FallbackContext): FallbackResult {
    return {
      success: true,
      value: null,
      strategy: 'skip',
      confidence: 1.0,
      requiresUserInput: false,
      reasoning: 'Skipped optional field'
    };
  }

  /**
   * Perform API lookup (placeholder for future implementation)
   */
  private static async performApiLookup(
    strategy: FallbackStrategy, 
    context: FallbackContext
  ): Promise<FallbackResult> {
    // Future: Implement API lookups for dynamic data
    return {
      success: false,
      value: null,
      strategy: 'api_lookup',
      confidence: 0,
      requiresUserInput: false,
      reasoning: 'API lookup not implemented'
    };
  }

  /**
   * Ultimate fallback when all strategies fail
   */
  private static getUltimateFallback(context: FallbackContext): FallbackResult {
    const { classification, field } = context;
    
    if (classification.constraints.required) {
      return {
        success: true,
        value: null,
        strategy: 'user_input',
        confidence: 0,
        requiresUserInput: true,
        placeholder: `Please provide ${field.label || field.name}`,
        reasoning: 'All fallback strategies failed for required field'
      };
    }

    return {
      success: true,
      value: null,
      strategy: 'skip',
      confidence: 1.0,
      requiresUserInput: false,
      reasoning: 'All fallback strategies failed, skipping optional field'
    };
  }

  /**
   * Check if context has usable data
   */
  private static hasUsableContext(context: FallbackContext): boolean {
    const { triggerData, previousResults } = context;
    
    if (!triggerData && (!previousResults || Object.keys(previousResults).length === 0)) {
      return false;
    }

    // Check for meaningful data
    if (triggerData) {
      // Support both nested (old) and flat (new) Discord format
      if (triggerData.message?.content || triggerData.content || triggerData.text) {
        return true;
      }
      if (triggerData.subject || triggerData.body) {
        return true;
      }
      if (Object.keys(triggerData).length > 2) { // More than just metadata
        return true;
      }
    }

    return false;
  }

  /**
   * Derive title from context
   */
  private static deriveTitle(triggerData: any, previousResults: any): string | null {
    if (triggerData?.subject) {
      return `Re: ${triggerData.subject}`;
    }

    // Support both nested (old) and flat (new) Discord format
    const content = triggerData?.message?.content || triggerData?.content;
    if (content) {
      const firstLine = content.split('\n')[0];
      return firstLine.length > 50 ? `${firstLine.substring(0, 47)}...` : firstLine;
    }

    if (triggerData?.text) {
      const firstWords = triggerData.text.split(' ').slice(0, 8).join(' ');
      return firstWords.length > 0 ? firstWords : null;
    }

    return null;
  }

  /**
   * Derive email from context
   */
  private static deriveEmail(triggerData: any, previousResults: any): string | null {
    if (triggerData?.from && this.isValidEmail(triggerData.from)) {
      return triggerData.from;
    }
    
    if (triggerData?.email && this.isValidEmail(triggerData.email)) {
      return triggerData.email;
    }
    
    // Look in previous results
    for (const result of Object.values(previousResults || {})) {
      if (result && typeof result === 'object' && result.output?.email) {
        return result.output.email;
      }
    }
    
    return null;
  }

  /**
   * Derive name from context
   */
  private static deriveName(triggerData: any, previousResults: any): string | null {
    // Support both nested (old) and flat (new) Discord format
    if (triggerData?.message?.author?.username) {
      return triggerData.message.author.username;
    }

    // Flat format: authorName directly on triggerData
    if (triggerData?.authorName) {
      return triggerData.authorName;
    }

    if (triggerData?.author?.username) {
      return triggerData.author.username;
    }

    if (triggerData?.user) {
      return triggerData.user;
    }

    if (triggerData?.name) {
      return triggerData.name;
    }

    return null;
  }

  /**
   * Derive date from context
   */
  private static deriveDate(triggerData: any): string {
    if (triggerData?.timestamp) {
      return new Date(triggerData.timestamp).toISOString().split('T')[0];
    }
    
    if (triggerData?.created_at) {
      return new Date(triggerData.created_at).toISOString().split('T')[0];
    }
    
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Derive tags from context
   */
  private static deriveTags(triggerData: any, platformContext: any): string | null {
    const tags = ['automated'];
    
    if (platformContext?.providerId) {
      tags.push(platformContext.providerId);
    }
    
    if (triggerData?.message || triggerData?.text) {
      tags.push('message');
    }
    
    if (triggerData?.subject || triggerData?.email) {
      tags.push('email');
    }
    
    return tags.join(', ');
  }

  /**
   * Derive message from context
   */
  private static deriveMessage(triggerData: any, platformContext: any): string | null {
    if (!triggerData) return null;

    let message = '';

    // Support both nested (old) and flat (new) Discord format
    const content = triggerData.message?.content || triggerData.content || triggerData.text;
    if (content) {
      message = `Regarding: "${content}"`;
    } else if (triggerData.subject) {
      message = `Following up on: ${triggerData.subject}`;
    } else {
      message = 'Automated message from workflow';
    }

    // Add platform-specific formatting
    if (platformContext?.providerId === 'slack' || platformContext?.providerId === 'discord') {
      message = `👋 ${message}`;
    }

    return message;
  }

  /**
   * Get field template for specific types
   */
  private static getFieldTemplate(fieldType: FieldType, providerId?: string): string {
    const templates: Record<FieldType, Record<string, string>> = {
      [FieldType.SUBJECT]: {
        default: 'Follow-up: {trigger_type} from {platform}',
        gmail: 'Re: {trigger_type} Notification',
        slack: '📧 Email Update: {trigger_type}'
      },
      [FieldType.BODY]: {
        default: 'This is an automated message generated from a {trigger_type} trigger.',
        gmail: 'Hello,\n\nThis is an automated follow-up regarding your recent {trigger_type}.\n\nBest regards',
        slack: '👋 Automated update from {platform} workflow!'
      },
      [FieldType.TITLE]: {
        default: '{trigger_type} - {date}',
        github: '[AUTO] {trigger_type} Update',
        notion: '📝 {trigger_type} - {date}'
      },
      [FieldType.MESSAGE]: {
        default: 'Automated {trigger_type} notification',
        discord: '🤖 Workflow update: {trigger_type}',
        slack: '📢 {trigger_type} alert'
      },
      [FieldType.TAGS]: {
        default: 'automated, {platform}, {trigger_type}',
        github: 'automation, workflow, {trigger_type}',
        notion: 'auto-generated, {date}'
      }
    };

    const platformTemplates = templates[fieldType];
    if (!platformTemplates) return 'Generated by workflow automation';
    
    return platformTemplates[providerId || 'default'] || platformTemplates.default;
  }

  /**
   * Get default value for field type
   */
  private static getDefaultValue(fieldType: FieldType, field: any): any {
    const defaults: Record<FieldType, any> = {
      [FieldType.SUBJECT]: 'Automated Notification',
      [FieldType.TITLE]: 'Generated Title',
      [FieldType.BODY]: 'This is an automated message.',
      [FieldType.MESSAGE]: 'Automated workflow message',
      [FieldType.DESCRIPTION]: 'Generated by workflow automation',
      [FieldType.EMAIL]: '', // Empty for manual entry
      [FieldType.NAME]: 'System',
      [FieldType.USERNAME]: 'automation',
      [FieldType.DATE]: new Date().toISOString().split('T')[0],
      [FieldType.TIME]: new Date().toTimeString().split(' ')[0].substring(0, 5),
      [FieldType.TAGS]: 'automated',
      [FieldType.CATEGORY]: field.options?.[0] || 'general',
      [FieldType.STATUS]: field.options?.[0] || 'active',
      [FieldType.PRIORITY]: 'medium',
      [FieldType.BOOLEAN]: false,
      [FieldType.QUANTITY]: 1,
      [FieldType.AMOUNT]: 0,
      [FieldType.GENERIC]: ''
    };

    return defaults[fieldType] || '';
  }

  /**
   * Get user input placeholder
   */
  private static getUserInputPlaceholder(fieldType: FieldType, field: any): string {
    const placeholders: Record<FieldType, string> = {
      [FieldType.SUBJECT]: 'Enter email subject...',
      [FieldType.TITLE]: 'Enter title...',
      [FieldType.BODY]: 'Enter message content...',
      [FieldType.EMAIL]: 'Enter email address...',
      [FieldType.NAME]: 'Enter name...',
      [FieldType.DATE]: 'Select date...',
      [FieldType.TAGS]: 'Enter tags (comma-separated)...',
      [FieldType.GENERIC]: `Enter ${field.label || field.name}...`
    };

    return placeholders[fieldType] || `Enter ${field.label || field.name}...`;
  }

  /**
   * Get trigger type from data
   */
  private static getTriggerType(triggerData: any): string {
    if (triggerData?.message) return 'discord_message';
    if (triggerData?.subject || triggerData?.from) return 'email';
    if (triggerData?.text) return 'slack_message';
    if (triggerData?.event) return 'calendar_event';
    return 'webhook';
  }

  /**
   * Validate email format
   */
  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}