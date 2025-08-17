import SmartAIAgent, { 
  SmartAgentConfig, 
  FieldSchema, 
  ExtractionContext, 
  ExtractionResult 
} from './smartAIAgent';
import { supabase } from '../supabase-client';
import { logAIUsage } from './aiUsageLogger';

export interface WorkflowNode {
  id: string;
  type: string;
  provider: string;
  action: string;
  inputs: Record<string, any>;
  config: {
    useSmartAI?: boolean;
    aiContext?: ExtractionContext;
    fallbackToUser?: boolean;
    previewMode?: boolean;
  };
  schema?: FieldSchema[];
}

export interface WorkflowContext {
  workflowId: string;
  userId: string;
  executionId?: string;
  upstreamData: Record<string, any>;
  variables: Record<string, any>;
  nodeOutputs: Record<string, any>;
}

export interface SmartAIResult {
  success: boolean;
  extractedFields: Record<string, any>;
  confidence: number;
  preview?: boolean;
  fallbackUsed: boolean;
  tokensUsed: number;
  cost?: number;
  warnings: string[];
  errors: string[];
  previewHints?: string[];
}

export interface AIPreferences {
  userId: string;
  preferredTone: 'professional' | 'casual' | 'friendly' | 'formal';
  retryPolicy: 'aggressive' | 'standard' | 'conservative';
  safetyLevel: 'high' | 'medium' | 'low';
  enableAI: boolean;
  preferredProvider?: 'openai' | 'anthropic' | 'google' | 'mistral';
  maxTokensPerExecution?: number;
  enableFunctionCalling?: boolean;
  language?: string;
}

class WorkflowSmartAI {
  private agent: SmartAIAgent | null = null;
  private preferences: Map<string, AIPreferences> = new Map();

  constructor() {
    this.initializeAgent();
  }

  private async initializeAgent(): Promise<void> {
    try {
      // Get AI configuration from environment
      const aiConfig: SmartAgentConfig = {
        aiProvider: {
          provider: (process.env.SMART_AI_PROVIDER as any) || 'openai',
          model: process.env.SMART_AI_MODEL || 'gpt-4o-mini',
          apiKey: process.env.SMART_AI_API_KEY || process.env.OPENAI_API_KEY || '',
          maxTokens: parseInt(process.env.SMART_AI_MAX_TOKENS || '2048'),
          temperature: parseFloat(process.env.SMART_AI_TEMPERATURE || '0.1')
        },
        maxRetries: parseInt(process.env.SMART_AI_MAX_RETRIES || '3'),
        timeout: parseInt(process.env.SMART_AI_TIMEOUT || '30000'),
        enableSafety: process.env.SMART_AI_ENABLE_SAFETY !== 'false',
        enableFallback: process.env.SMART_AI_ENABLE_FALLBACK !== 'false',
        enableTokenManagement: process.env.SMART_AI_ENABLE_TOKEN_MANAGEMENT !== 'false',
        contextWindow: parseInt(process.env.SMART_AI_CONTEXT_WINDOW || '8192'),
        debugMode: process.env.NODE_ENV === 'development'
      };

      this.agent = new SmartAIAgent(aiConfig);
      console.log('Smart AI Agent initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Smart AI Agent:', error);
    }
  }

  /**
   * Main wrapper function to run node with Smart AI
   */
  async runWithSmartAI(
    node: WorkflowNode,
    context: WorkflowContext
  ): Promise<SmartAIResult> {
    try {
      // Check if AI is enabled for this node
      if (!node.config.useSmartAI || !this.agent) {
        return {
          success: false,
          extractedFields: {},
          confidence: 0,
          fallbackUsed: true,
          tokensUsed: 0,
          warnings: ['Smart AI not enabled for this node'],
          errors: []
        };
      }

      // Get user preferences
      const userPrefs = await this.getUserPreferences(context.userId);
      
      // Check if user has AI enabled
      if (!userPrefs.enableAI) {
        return {
          success: false,
          extractedFields: {},
          confidence: 0,
          fallbackUsed: true,
          tokensUsed: 0,
          warnings: ['Smart AI disabled in user preferences'],
          errors: []
        };
      }

      // Prepare input data from upstream context
      const inputText = this.prepareInputFromContext(context);
      
      // Get or generate schema for the node
      const schema = node.schema || await this.generateSchemaForNode(node);
      
      // Prepare extraction context
      const extractionContext: ExtractionContext = {
        source: `${node.provider}_${node.action}`,
        domain: this.getDomainFromProvider(node.provider),
        format: this.getFormatFromAction(node.action),
        language: userPrefs.language || 'en',
        userInstructions: this.buildUserInstructions(userPrefs),
        metadata: {
          workflowId: context.workflowId,
          nodeId: node.id,
          provider: node.provider,
          action: node.action,
          userId: context.userId
        },
        ...node.config.aiContext
      };

      // Execute Smart AI extraction
      const result = await this.agent.extractFields<Record<string, any>>(
        inputText,
        schema,
        extractionContext
      );

      // Process result and apply to node inputs
      const processedResult = await this.processExtractionResult(
        result,
        node,
        context,
        userPrefs
      );

      // Log usage to Supabase
      await this.logUsage(result, node, context, userPrefs);

      return processedResult;

    } catch (error) {
      console.error('Smart AI execution failed:', error);
      
      const fallbackResult = await this.handleFallback(node, context);
      
      return {
        success: false,
        extractedFields: fallbackResult,
        confidence: 0,
        fallbackUsed: true,
        tokensUsed: 0,
        warnings: [],
        errors: [error instanceof Error ? error.message : 'Unknown AI error']
      };
    }
  }

  /**
   * Preview AI-generated values before execution
   */
  async previewAIExtraction(
    node: WorkflowNode,
    context: WorkflowContext
  ): Promise<SmartAIResult> {
    const result = await this.runWithSmartAI(node, context);
    
    return {
      ...result,
      preview: true,
      previewHints: this.generatePreviewHints(result, node)
    };
  }

  /**
   * Apply AI-extracted values to node inputs
   */
  applyExtractedValues(
    node: WorkflowNode,
    extractedFields: Record<string, any>,
    mergeStrategy: 'replace' | 'merge' | 'fill_empty' = 'fill_empty'
  ): WorkflowNode {
    const updatedNode = { ...node };
    
    switch (mergeStrategy) {
      case 'replace':
        updatedNode.inputs = { ...extractedFields };
        break;
      case 'merge':
        updatedNode.inputs = { ...node.inputs, ...extractedFields };
        break;
      case 'fill_empty':
        for (const [key, value] of Object.entries(extractedFields)) {
          if (!node.inputs[key] || node.inputs[key] === '') {
            updatedNode.inputs[key] = value;
          }
        }
        break;
    }

    return updatedNode;
  }

  private async getUserPreferences(userId: string): Promise<AIPreferences> {
    // Check cache first
    if (this.preferences.has(userId)) {
      return this.preferences.get(userId)!;
    }

    try {
      const { data, error } = await supabase
        .from('ai_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found error
        throw error;
      }

      const preferences: AIPreferences = {
        userId,
        preferredTone: data?.preferred_tone || 'professional',
        retryPolicy: data?.retry_policy || 'standard',
        safetyLevel: data?.safety_level || 'high',
        enableAI: data?.enable_ai ?? true,
        preferredProvider: data?.preferred_provider,
        maxTokensPerExecution: data?.max_tokens_per_execution || 2048,
        enableFunctionCalling: data?.enable_function_calling ?? false,
        language: data?.language || 'en'
      };

      // Cache preferences
      this.preferences.set(userId, preferences);
      
      return preferences;
    } catch (error) {
      console.error('Failed to fetch user AI preferences:', error);
      
      // Return default preferences
      const defaultPrefs: AIPreferences = {
        userId,
        preferredTone: 'professional',
        retryPolicy: 'standard',
        safetyLevel: 'high',
        enableAI: true,
        language: 'en'
      };
      
      this.preferences.set(userId, defaultPrefs);
      return defaultPrefs;
    }
  }

  private prepareInputFromContext(context: WorkflowContext): string {
    const contextData = {
      upstreamData: context.upstreamData,
      variables: context.variables,
      nodeOutputs: context.nodeOutputs
    };

    // Convert context to a natural language description
    let inputText = '';

    // Add upstream data
    if (context.upstreamData && Object.keys(context.upstreamData).length > 0) {
      inputText += 'Previous step data:\n';
      for (const [key, value] of Object.entries(context.upstreamData)) {
        if (typeof value === 'string' || typeof value === 'number') {
          inputText += `${key}: ${value}\n`;
        } else if (typeof value === 'object') {
          inputText += `${key}: ${JSON.stringify(value)}\n`;
        }
      }
      inputText += '\n';
    }

    // Add variables
    if (context.variables && Object.keys(context.variables).length > 0) {
      inputText += 'Workflow variables:\n';
      for (const [key, value] of Object.entries(context.variables)) {
        inputText += `${key}: ${value}\n`;
      }
      inputText += '\n';
    }

    // Add previous node outputs
    if (context.nodeOutputs && Object.keys(context.nodeOutputs).length > 0) {
      inputText += 'Previous node outputs:\n';
      for (const [nodeId, output] of Object.entries(context.nodeOutputs)) {
        if (typeof output === 'object') {
          const outputSummary = this.summarizeObject(output);
          inputText += `${nodeId}: ${outputSummary}\n`;
        }
      }
    }

    return inputText || 'No context data available';
  }

  private summarizeObject(obj: any, maxDepth: number = 2): string {
    if (maxDepth <= 0 || typeof obj !== 'object' || obj === null) {
      return String(obj);
    }

    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';
      if (obj.length === 1) return `[${this.summarizeObject(obj[0], maxDepth - 1)}]`;
      return `[${this.summarizeObject(obj[0], maxDepth - 1)}, ... ${obj.length} items]`;
    }

    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';
    
    const summaryPairs = keys.slice(0, 3).map(key => 
      `${key}: ${this.summarizeObject(obj[key], maxDepth - 1)}`
    );
    
    if (keys.length > 3) {
      summaryPairs.push(`... ${keys.length - 3} more fields`);
    }
    
    return `{${summaryPairs.join(', ')}}`;
  }

  private async generateSchemaForNode(node: WorkflowNode): Promise<FieldSchema[]> {
    // Load predefined schema for common integrations
    try {
      const schemaModule = await import(`../workflows/actions/${node.provider}/schema`);
      const actionSchema = schemaModule[node.action];
      if (actionSchema) {
        return actionSchema;
      }
    } catch (error) {
      // Schema file doesn't exist, continue with fallback
    }

    // Fallback: generate basic schema based on node type
    return this.generateBasicSchema(node);
  }

  private generateBasicSchema(node: WorkflowNode): FieldSchema[] {
    const commonSchemas: Record<string, FieldSchema[]> = {
      email: [
        { name: 'to', type: 'email', required: true, description: 'Recipient email address' },
        { name: 'subject', type: 'string', required: true, description: 'Email subject line' },
        { name: 'body', type: 'string', required: true, description: 'Email content' },
        { name: 'cc', type: 'array', required: false, description: 'CC recipients' },
        { name: 'attachments', type: 'array', required: false, description: 'File attachments' }
      ],
      message: [
        { name: 'text', type: 'string', required: true, description: 'Message content' },
        { name: 'channel', type: 'string', required: false, description: 'Channel or recipient' },
        { name: 'mentions', type: 'array', required: false, description: 'User mentions' }
      ],
      task: [
        { name: 'title', type: 'string', required: true, description: 'Task title' },
        { name: 'description', type: 'string', required: false, description: 'Task description' },
        { name: 'dueDate', type: 'date', required: false, description: 'Due date' },
        { name: 'priority', type: 'string', required: false, description: 'Priority level' }
      ],
      record: [
        { name: 'name', type: 'string', required: true, description: 'Record name' },
        { name: 'description', type: 'string', required: false, description: 'Record description' },
        { name: 'status', type: 'string', required: false, description: 'Record status' }
      ]
    };

    // Determine schema type based on action
    const actionLower = node.action.toLowerCase();
    if (actionLower.includes('email') || actionLower.includes('send')) {
      return commonSchemas.email;
    } else if (actionLower.includes('message') || actionLower.includes('chat')) {
      return commonSchemas.message;
    } else if (actionLower.includes('task') || actionLower.includes('todo')) {
      return commonSchemas.task;
    } else {
      return commonSchemas.record;
    }
  }

  private getDomainFromProvider(provider: string): string {
    const domainMap: Record<string, string> = {
      gmail: 'email',
      outlook: 'email',
      slack: 'communication',
      discord: 'communication',
      teams: 'communication',
      notion: 'productivity',
      trello: 'productivity',
      airtable: 'database',
      github: 'development',
      gitlab: 'development',
      hubspot: 'crm',
      stripe: 'finance',
      paypal: 'finance'
    };

    return domainMap[provider.toLowerCase()] || 'general';
  }

  private getFormatFromAction(action: string): ExtractionContext['format'] {
    const actionLower = action.toLowerCase();
    
    if (actionLower.includes('email')) return 'email';
    if (actionLower.includes('api') || actionLower.includes('webhook')) return 'api';
    if (actionLower.includes('form')) return 'form';
    if (actionLower.includes('document')) return 'document';
    
    return 'document';
  }

  private buildUserInstructions(preferences: AIPreferences): string {
    let instructions = `Use a ${preferences.preferredTone} tone. `;
    
    switch (preferences.safetyLevel) {
      case 'high':
        instructions += 'Be very conservative with extraction and flag any uncertain content. ';
        break;
      case 'medium':
        instructions += 'Balance accuracy with extraction completeness. ';
        break;
      case 'low':
        instructions += 'Extract as much as possible even with some uncertainty. ';
        break;
    }

    return instructions;
  }

  private async processExtractionResult(
    result: ExtractionResult,
    node: WorkflowNode,
    context: WorkflowContext,
    preferences: AIPreferences
  ): Promise<SmartAIResult> {
    const cost = this.calculateCost(result.metadata.tokensUsed, result.metadata.provider);

    return {
      success: result.success,
      extractedFields: result.data,
      confidence: result.confidence,
      fallbackUsed: result.metadata.fallbackUsed,
      tokensUsed: result.metadata.tokensUsed,
      cost,
      warnings: result.warnings,
      errors: result.errors
    };
  }

  private calculateCost(tokensUsed: number, provider: string): number {
    // Cost calculation based on provider pricing (as of 2024)
    const pricing: Record<string, { input: number; output: number }> = {
      openai: { input: 0.0005, output: 0.0015 }, // GPT-3.5-turbo per 1K tokens
      anthropic: { input: 0.00025, output: 0.00125 }, // Claude-3 Haiku per 1K tokens
      google: { input: 0.000075, output: 0.0003 }, // Gemini Flash per 1K tokens
      mistral: { input: 0.001, output: 0.003 } // Mistral Small per 1K tokens
    };

    const rates = pricing[provider] || pricing.openai;
    // Assume 80% input, 20% output tokens
    const inputTokens = tokensUsed * 0.8;
    const outputTokens = tokensUsed * 0.2;
    
    return ((inputTokens * rates.input) + (outputTokens * rates.output)) / 1000;
  }

  private generatePreviewHints(result: SmartAIResult, node: WorkflowNode): string[] {
    const hints: string[] = [];

    if (result.confidence < 70) {
      hints.push('⚠️ Low confidence - review extracted values carefully');
    }

    if (result.fallbackUsed) {
      hints.push('🔄 Fallback method was used - values may be incomplete');
    }

    if (result.warnings.length > 0) {
      hints.push(`⚠️ ${result.warnings.length} warning(s) detected`);
    }

    if (result.tokensUsed > 1000) {
      hints.push('💰 High token usage - consider optimizing input data');
    }

    hints.push(`🤖 Extracted ${Object.keys(result.extractedFields).length} field(s) using AI`);

    return hints;
  }

  private async handleFallback(
    node: WorkflowNode,
    context: WorkflowContext
  ): Promise<Record<string, any>> {
    // Try to use default values or templates
    if (node.config.fallbackToUser) {
      // Return existing user inputs if available
      return node.inputs || {};
    }

    // Try to extract basic information using simple patterns
    const inputText = this.prepareInputFromContext(context);
    const basicExtraction: Record<string, any> = {};

    // Email extraction
    const emailMatch = inputText.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (emailMatch) {
      basicExtraction.email = emailMatch[0];
      basicExtraction.to = emailMatch[0];
    }

    // Simple text extraction for common fields
    const lines = inputText.split('\n').filter(line => line.trim());
    if (lines.length > 0) {
      basicExtraction.subject = lines[0].substring(0, 100);
      basicExtraction.title = lines[0].substring(0, 100);
      basicExtraction.text = lines.join(' ').substring(0, 500);
      basicExtraction.body = lines.join('\n').substring(0, 1000);
    }

    return basicExtraction;
  }

  private async logUsage(
    result: ExtractionResult,
    node: WorkflowNode,
    context: WorkflowContext,
    preferences: AIPreferences
  ): Promise<void> {
    try {
      await logAIUsage({
        userId: context.userId,
        workflowId: context.workflowId,
        executionId: context.executionId,
        nodeId: node.id,
        actionName: `${node.provider}_${node.action}`,
        provider: result.metadata.provider,
        model: result.metadata.model,
        tokensUsed: result.metadata.tokensUsed,
        costEstimate: this.calculateCost(result.metadata.tokensUsed, result.metadata.provider),
        confidenceScore: result.confidence,
        fallbackUsed: result.metadata.fallbackUsed,
        success: result.success,
        processingTime: result.metadata.processingTime,
        safetyFlags: result.metadata.safetyFlags
      });
    } catch (error) {
      console.error('Failed to log AI usage:', error);
    }
  }

  /**
   * Clear cached preferences (useful for testing or when preferences change)
   */
  clearPreferencesCache(userId?: string): void {
    if (userId) {
      this.preferences.delete(userId);
    } else {
      this.preferences.clear();
    }
  }

  /**
   * Health check for the Smart AI system
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    agent: boolean;
    database: boolean;
    details: Record<string, any>;
  }> {
    const health = {
      status: 'healthy' as const,
      agent: false,
      database: false,
      details: {}
    };

    // Check agent health
    if (this.agent) {
      try {
        const agentHealth = await this.agent.healthCheck();
        health.agent = agentHealth.status === 'healthy';
        health.details.agent = agentHealth;
      } catch (error) {
        health.agent = false;
        health.details.agent = { error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }

    // Check database connectivity
    try {
      const { error } = await supabase.from('ai_preferences').select('count').limit(1);
      health.database = !error;
      health.details.database = { connected: !error };
    } catch (error) {
      health.database = false;
      health.details.database = { error: error instanceof Error ? error.message : 'Unknown error' };
    }

    // Determine overall status
    if (!health.agent || !health.database) {
      health.status = health.agent || health.database ? 'degraded' : 'unhealthy';
    }

    return health;
  }
}

// Export singleton instance
export const workflowSmartAI = new WorkflowSmartAI();

// Export utility functions
export async function runWithSmartAI(
  node: WorkflowNode,
  context: WorkflowContext
): Promise<SmartAIResult> {
  return workflowSmartAI.runWithSmartAI(node, context);
}

export async function previewAIExtraction(
  node: WorkflowNode,
  context: WorkflowContext
): Promise<SmartAIResult> {
  return workflowSmartAI.previewAIExtraction(node, context);
}

export function applyExtractedValues(
  node: WorkflowNode,
  extractedFields: Record<string, any>,
  mergeStrategy: 'replace' | 'merge' | 'fill_empty' = 'fill_empty'
): WorkflowNode {
  return workflowSmartAI.applyExtractedValues(node, extractedFields, mergeStrategy);
}

export default workflowSmartAI;