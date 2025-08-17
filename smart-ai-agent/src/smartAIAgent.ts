import { z } from 'zod';
import FieldClassifier, { ClassifiedField, FieldClassificationResult } from './fieldClassifier.js';
import PromptGenerator, { GeneratedPrompt, PromptGenerationOptions } from './promptGenerator.js';
import SafetyValidator, { SafetyConfig, ValidationResult } from './safetyValidator.js';
import FallbackHandler, { FallbackConfig } from './fallbackHandler.js';
import TokenBudgetManager, { BudgetCheckResult, TokenEstimation } from './tokenBudgetManager.js';

// Core configuration interfaces
export interface AIProviderConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'mistral';
  model: string;
  apiKey: string;
  baseURL?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  headers?: Record<string, string>;
}

export interface SmartAgentConfig {
  aiProvider: AIProviderConfig;
  maxRetries: number;
  timeout: number;
  enableSafety: boolean;
  enableFallback: boolean;
  enableTokenManagement: boolean;
  contextWindow: number;
  debugMode: boolean;
  safetyConfig?: Partial<SafetyConfig>;
  fallbackConfig?: Partial<FallbackConfig>;
  promptOptions?: Partial<PromptGenerationOptions>;
}

// Schema and context interfaces
export interface FieldSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'date' | 'email' | 'url';
  required: boolean;
  description?: string;
  validation?: z.ZodSchema;
  examples?: any[];
  priority?: 'high' | 'medium' | 'low';
  dependencies?: string[];
}

export interface ExtractionContext {
  source: string;
  domain?: string;
  language?: string;
  format?: 'email' | 'document' | 'form' | 'api' | 'web';
  metadata?: Record<string, any>;
  userInstructions?: string;
  previousAttempts?: number;
}

// Result interfaces
export interface ExtractionResult<T = Record<string, any>> {
  success: boolean;
  data: T;
  confidence: number;
  warnings: string[];
  errors: string[];
  metadata: ExtractionMetadata;
}

export interface ExtractionMetadata {
  tokensUsed: number;
  processingTime: number;
  provider: string;
  model: string;
  attemptNumber: number;
  fallbackUsed: boolean;
  safetyFlags: string[];
  classificationResult?: FieldClassificationResult;
  promptMetadata?: GeneratedPrompt['metadata'];
  tokenBudgetResult?: BudgetCheckResult;
  validationResult?: ValidationResult;
}

// Internal processing interfaces
interface ProcessingStep {
  name: string;
  startTime: number;
  endTime?: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

interface ProcessingContext {
  originalInput: string;
  processedInput: string;
  schema: FieldSchema[];
  classifiedFields: ClassifiedField[];
  context: ExtractionContext;
  steps: ProcessingStep[];
  currentAttempt: number;
  tokenBudget?: BudgetCheckResult;
}

// Provider response interfaces
interface ProviderResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  finishReason?: string;
}

export class SmartAIAgent {
  private fieldClassifier: FieldClassifier;
  private promptGenerator: PromptGenerator;
  private safetyValidator: SafetyValidator;
  private fallbackHandler: FallbackHandler;
  private tokenBudgetManager: TokenBudgetManager;
  private config: SmartAgentConfig;

  constructor(config: SmartAgentConfig) {
    this.config = this.validateAndNormalizeConfig(config);
    
    // Initialize components with configuration
    this.fieldClassifier = new FieldClassifier();
    this.promptGenerator = new PromptGenerator();
    this.safetyValidator = new SafetyValidator(config.safetyConfig);
    this.fallbackHandler = new FallbackHandler(config.fallbackConfig);
    this.tokenBudgetManager = new TokenBudgetManager(config.aiProvider.provider);

    if (this.config.debugMode) {
      console.log('SmartAIAgent initialized with config:', {
        provider: config.aiProvider.provider,
        model: config.aiProvider.model,
        enableSafety: config.enableSafety,
        enableFallback: config.enableFallback,
        enableTokenManagement: config.enableTokenManagement
      });
    }
  }

  /**
   * Main extraction method that coordinates the entire pipeline
   */
  async extractFields<T = Record<string, any>>(
    input: string,
    schema: FieldSchema[],
    context: ExtractionContext = { source: 'unknown' }
  ): Promise<ExtractionResult<T>> {
    const startTime = Date.now();
    const processingContext: ProcessingContext = {
      originalInput: input,
      processedInput: input,
      schema,
      classifiedFields: [],
      context: { ...context, previousAttempts: 0 },
      steps: [],
      currentAttempt: 0
    };

    try {
      // Step 1: Field Classification
      await this.executeStep(processingContext, 'field_classification', async () => {
        const classificationResult = this.fieldClassifier.classifyFields(schema, context);
        processingContext.classifiedFields = classificationResult.fields;
        
        if (this.config.debugMode) {
          console.log('Field classification completed:', {
            totalFields: classificationResult.fields.length,
            highPriority: classificationResult.priorityGroups.high.length,
            complexity: classificationResult.totalComplexity
          });
        }
        
        return { classificationResult };
      });

      // Step 2: Token Budget Management
      if (this.config.enableTokenManagement) {
        await this.executeStep(processingContext, 'token_budget_check', async () => {
          const budgetCheck = this.tokenBudgetManager.checkTokenBudget(
            input,
            processingContext.classifiedFields,
            this.config.aiProvider.model
          );
          
          processingContext.tokenBudget = budgetCheck;
          
          if (!budgetCheck.withinBudget) {
            if (this.config.debugMode) {
              console.log('Token budget exceeded, applying truncation:', {
                estimated: budgetCheck.estimatedTokens,
                max: budgetCheck.maxTokens,
                strategy: budgetCheck.truncationStrategy?.method
              });
            }
            
            processingContext.processedInput = this.tokenBudgetManager.truncateInput(
              input,
              budgetCheck.maxTokens * 0.8,
              budgetCheck.truncationStrategy
            );
          }
          
          return { budgetCheck };
        });
      }

      // Step 3: Main Extraction Loop with Retries
      let result: ExtractionResult<T> | null = null;
      let lastError: string | undefined;

      for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
        processingContext.currentAttempt = attempt;
        processingContext.context.previousAttempts = attempt - 1;

        try {
          result = await this.attemptExtraction<T>(processingContext);
          
          if (result.success) {
            if (this.config.debugMode) {
              console.log(`Extraction succeeded on attempt ${attempt}`);
            }
            break;
          } else {
            lastError = `Attempt ${attempt} failed: ${result.errors.join(', ')}`;
            if (this.config.debugMode) {
              console.log(lastError);
            }
          }
        } catch (error) {
          lastError = `Attempt ${attempt} threw error: ${error instanceof Error ? error.message : 'Unknown error'}`;
          if (this.config.debugMode) {
            console.error(lastError);
          }
        }
      }

      // Step 4: Fallback Handling
      if (!result?.success && this.config.enableFallback) {
        await this.executeStep(processingContext, 'fallback_handling', async () => {
          const fallbackResult = await this.fallbackHandler.handleFailedExtraction(
            processingContext.processedInput,
            processingContext.classifiedFields,
            processingContext.context,
            result?.errors || [lastError || 'Unknown error']
          );

          if (fallbackResult.success) {
            result = {
              ...fallbackResult,
              metadata: {
                ...fallbackResult.metadata,
                fallbackUsed: true,
                classificationResult: processingContext.steps.find(s => s.name === 'field_classification')?.metadata?.classificationResult,
                tokenBudgetResult: processingContext.tokenBudget
              }
            } as ExtractionResult<T>;
          }

          return { fallbackResult };
        });
      }

      // Step 5: Final Result Assembly
      const finalResult = result || this.createFailureResult<T>(
        processingContext,
        startTime,
        lastError || 'All extraction attempts failed'
      );

      // Update metadata with processing information
      finalResult.metadata = {
        ...finalResult.metadata,
        processingTime: Date.now() - startTime,
        classificationResult: processingContext.steps.find(s => s.name === 'field_classification')?.metadata?.classificationResult,
        tokenBudgetResult: processingContext.tokenBudget
      };

      // Track token usage
      if (finalResult.metadata.tokensUsed > 0) {
        this.tokenBudgetManager.trackUsage(
          finalResult.metadata.tokensUsed,
          finalResult.metadata.model,
          this.calculateCost(finalResult.metadata.tokensUsed, finalResult.metadata.model)
        );
      }

      if (this.config.debugMode) {
        console.log('Extraction completed:', {
          success: finalResult.success,
          confidence: finalResult.confidence,
          tokensUsed: finalResult.metadata.tokensUsed,
          processingTime: finalResult.metadata.processingTime,
          steps: processingContext.steps.length
        });
      }

      return finalResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      if (this.config.debugMode) {
        console.error('Critical error in extraction pipeline:', errorMessage);
      }

      return this.createFailureResult<T>(processingContext, startTime, errorMessage);
    }
  }

  /**
   * Attempt a single extraction with the full pipeline
   */
  private async attemptExtraction<T>(processingContext: ProcessingContext): Promise<ExtractionResult<T>> {
    const attemptStartTime = Date.now();
    
    // Step 1: Generate Prompt
    const promptResult = await this.executeStep(processingContext, 'prompt_generation', async () => {
      const generatedPrompt = this.promptGenerator.generateExtractionPrompt(
        processingContext.processedInput,
        processingContext.classifiedFields,
        processingContext.context,
        processingContext.currentAttempt > 1,
        this.config.promptOptions
      );

      if (this.config.debugMode) {
        console.log('Prompt generated:', {
          wordCount: generatedPrompt.metadata.wordCount,
          estimatedTokens: generatedPrompt.metadata.estimatedTokens,
          complexity: generatedPrompt.metadata.complexity
        });
      }

      return { generatedPrompt };
    });

    const generatedPrompt = promptResult.metadata?.generatedPrompt as GeneratedPrompt;
    
    // Step 2: AI Provider Call
    const aiResponse = await this.executeStep(processingContext, 'ai_provider_call', async () => {
      const response = await this.callAIProvider(generatedPrompt.content);
      
      if (this.config.debugMode) {
        console.log('AI provider response received:', {
          provider: this.config.aiProvider.provider,
          model: response.model,
          contentLength: response.content.length,
          tokensUsed: response.usage?.totalTokens
        });
      }

      return { response };
    });

    const response = aiResponse.metadata?.response as ProviderResponse;

    // Step 3: Parse AI Response
    const parseResult = await this.executeStep(processingContext, 'response_parsing', async () => {
      const parsedData = this.parseAIResponse(response.content, processingContext.classifiedFields);
      
      if (this.config.debugMode) {
        console.log('Response parsed:', {
          fieldsExtracted: Object.keys(parsedData).length,
          expectedFields: processingContext.classifiedFields.length
        });
      }

      return { parsedData };
    });

    const parsedData = parseResult.metadata?.parsedData as Record<string, any>;

    // Step 4: Safety Validation
    let validationResult: ValidationResult | undefined;
    if (this.config.enableSafety) {
      const safetyResult = await this.executeStep(processingContext, 'safety_validation', async () => {
        const result = await this.safetyValidator.validateOutput(
          parsedData,
          processingContext.classifiedFields,
          processingContext.context
        );

        if (this.config.debugMode) {
          console.log('Safety validation completed:', {
            isValid: result.isValid,
            safetyFlags: result.safetyFlags.length,
            confidence: result.confidence
          });
        }

        return { validationResult: result };
      });

      validationResult = safetyResult.metadata?.validationResult as ValidationResult;

      // Check for critical safety violations
      if (!validationResult.isValid && validationResult.safetyFlags.includes('high_risk')) {
        throw new Error('Critical safety violation detected - extraction aborted');
      }
    }

    // Step 5: Schema Validation
    const schemaValidationResult = await this.executeStep(processingContext, 'schema_validation', async () => {
      const result = this.validateAgainstSchema(parsedData, processingContext.classifiedFields);
      
      if (this.config.debugMode) {
        console.log('Schema validation completed:', {
          isValid: result.isValid,
          errors: result.errors.length,
          warnings: result.warnings.length
        });
      }

      return { schemaValidation: result };
    });

    const schemaValidation = schemaValidationResult.metadata?.schemaValidation as ValidationResult;

    // Step 6: Calculate Final Confidence
    const confidence = this.calculateConfidence(
      parsedData,
      processingContext.classifiedFields,
      schemaValidation,
      validationResult
    );

    // Step 7: Assemble Result
    const warnings = [
      ...(validationResult?.warnings || []),
      ...schemaValidation.warnings
    ];

    const errors = [
      ...(validationResult?.errors || []),
      ...schemaValidation.errors
    ];

    const safetyFlags = validationResult?.safetyFlags || [];

    const success = schemaValidation.isValid && (validationResult?.isValid !== false);

    return {
      success,
      data: parsedData as T,
      confidence,
      warnings,
      errors,
      metadata: {
        tokensUsed: response.usage?.totalTokens || this.estimateTokensUsed(generatedPrompt.content, response.content),
        processingTime: Date.now() - attemptStartTime,
        provider: this.config.aiProvider.provider,
        model: response.model,
        attemptNumber: processingContext.currentAttempt,
        fallbackUsed: false,
        safetyFlags,
        promptMetadata: generatedPrompt.metadata,
        validationResult,
        classificationResult: processingContext.steps.find(s => s.name === 'field_classification')?.metadata?.classificationResult,
        tokenBudgetResult: processingContext.tokenBudget
      }
    };
  }

  /**
   * Execute a processing step with error handling and timing
   */
  private async executeStep<T>(
    context: ProcessingContext,
    stepName: string,
    operation: () => Promise<T>
  ): Promise<{ success: boolean; metadata?: T; error?: string }> {
    const step: ProcessingStep = {
      name: stepName,
      startTime: Date.now(),
      success: false
    };

    try {
      const result = await operation();
      step.endTime = Date.now();
      step.success = true;
      step.metadata = result as any;
      
      context.steps.push(step);
      
      return { success: true, metadata: result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      step.endTime = Date.now();
      step.error = errorMessage;
      
      context.steps.push(step);
      
      if (this.config.debugMode) {
        console.error(`Step ${stepName} failed:`, errorMessage);
      }
      
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Call the configured AI provider
   */
  private async callAIProvider(prompt: string): Promise<ProviderResponse> {
    const { provider, model, apiKey, baseURL, maxTokens = 2048, temperature = 0.1, timeout = 30000, headers = {} } = this.config.aiProvider;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      let response: Response;
      let responseData: any;

      switch (provider) {
        case 'openai': {
          response = await fetch(`${baseURL || 'https://api.openai.com/v1'}/chat/completions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              ...headers
            },
            body: JSON.stringify({
              model,
              messages: [{ role: 'user', content: prompt }],
              max_tokens: maxTokens,
              temperature,
              stream: false
            }),
            signal: controller.signal
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
          }

          responseData = await response.json();
          
          return {
            content: responseData.choices[0]?.message?.content || '',
            usage: responseData.usage ? {
              promptTokens: responseData.usage.prompt_tokens,
              completionTokens: responseData.usage.completion_tokens,
              totalTokens: responseData.usage.total_tokens
            } : undefined,
            model: responseData.model,
            finishReason: responseData.choices[0]?.finish_reason
          };
        }

        case 'anthropic': {
          response = await fetch(`${baseURL || 'https://api.anthropic.com'}/v1/messages`, {
            method: 'POST',
            headers: {
              'x-api-key': apiKey,
              'Content-Type': 'application/json',
              'anthropic-version': '2023-06-01',
              ...headers
            },
            body: JSON.stringify({
              model,
              max_tokens: maxTokens,
              temperature,
              messages: [{ role: 'user', content: prompt }]
            }),
            signal: controller.signal
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Anthropic API error: ${response.status} ${response.statusText} - ${errorText}`);
          }

          responseData = await response.json();
          
          return {
            content: responseData.content[0]?.text || '',
            usage: responseData.usage ? {
              promptTokens: responseData.usage.input_tokens,
              completionTokens: responseData.usage.output_tokens,
              totalTokens: responseData.usage.input_tokens + responseData.usage.output_tokens
            } : undefined,
            model: responseData.model,
            finishReason: responseData.stop_reason
          };
        }

        case 'google': {
          response = await fetch(`${baseURL || 'https://generativelanguage.googleapis.com'}/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...headers
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                maxOutputTokens: maxTokens,
                temperature
              }
            }),
            signal: controller.signal
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Google API error: ${response.status} ${response.statusText} - ${errorText}`);
          }

          responseData = await response.json();
          
          return {
            content: responseData.candidates[0]?.content?.parts[0]?.text || '',
            usage: responseData.usageMetadata ? {
              promptTokens: responseData.usageMetadata.promptTokenCount,
              completionTokens: responseData.usageMetadata.candidatesTokenCount,
              totalTokens: responseData.usageMetadata.totalTokenCount
            } : undefined,
            model,
            finishReason: responseData.candidates[0]?.finishReason
          };
        }

        case 'mistral': {
          response = await fetch(`${baseURL || 'https://api.mistral.ai'}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              ...headers
            },
            body: JSON.stringify({
              model,
              messages: [{ role: 'user', content: prompt }],
              max_tokens: maxTokens,
              temperature
            }),
            signal: controller.signal
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Mistral API error: ${response.status} ${response.statusText} - ${errorText}`);
          }

          responseData = await response.json();
          
          return {
            content: responseData.choices[0]?.message?.content || '',
            usage: responseData.usage ? {
              promptTokens: responseData.usage.prompt_tokens,
              completionTokens: responseData.usage.completion_tokens,
              totalTokens: responseData.usage.total_tokens
            } : undefined,
            model: responseData.model,
            finishReason: responseData.choices[0]?.finish_reason
          };
        }

        default:
          throw new Error(`Unsupported AI provider: ${provider}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse AI response into structured data
   */
  private parseAIResponse(response: string, schema: ClassifiedField[]): Record<string, any> {
    try {
      // First, try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (typeof parsed === 'object' && parsed !== null) {
            return parsed;
          }
        } catch {
          // JSON parsing failed, continue with fallback methods
        }
      }

      // Fallback: extract values using regex patterns
      const result: Record<string, any> = {};
      
      for (const field of schema) {
        const patterns = this.generateExtractionPatterns(field);
        for (const pattern of patterns) {
          const match = response.match(pattern);
          if (match && match[1] !== undefined) {
            result[field.name] = this.parseFieldValue(match[1], field.type);
            break;
          }
        }
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate regex patterns for field extraction
   */
  private generateExtractionPatterns(field: ClassifiedField): RegExp[] {
    const name = field.name;
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    return [
      // JSON-style with quotes
      new RegExp(`"${escapedName}"\\s*:\\s*"([^"]*)"`, 'i'),
      new RegExp(`"${escapedName}"\\s*:\\s*([^,}\\n]*)`, 'i'),
      
      // Key-value without quotes
      new RegExp(`${escapedName}\\s*:\\s*"([^"]*)"`, 'i'),
      new RegExp(`${escapedName}\\s*:\\s*([^,}\\n]*)`, 'i'),
      
      // Natural language patterns
      new RegExp(`\\b${escapedName}\\b[:\\s]+([^\\n,]*)`, 'i'),
      
      // Markdown-style
      new RegExp(`\\*\\*${escapedName}\\*\\*[:\\s]*([^\\n]*)`, 'i'),
      
      // Form-style
      new RegExp(`${escapedName}\\s*=\\s*([^\\n;]*)`, 'i')
    ];
  }

  /**
   * Parse field value according to its type
   */
  private parseFieldValue(value: string, type: FieldSchema['type']): any {
    const trimmed = value.trim().replace(/^["']|["']$/g, '');
    
    if (trimmed === '' || trimmed.toLowerCase() === 'null') {
      return null;
    }
    
    switch (type) {
      case 'number': {
        // Remove common formatting
        const cleaned = trimmed.replace(/[$,\s]/g, '').replace(/[^\d.-]/g, '');
        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
      }
      
      case 'boolean': {
        const lower = trimmed.toLowerCase();
        if (['true', '1', 'yes', 'on', 'enabled', 'active', 'checked'].includes(lower)) {
          return true;
        }
        if (['false', '0', 'no', 'off', 'disabled', 'inactive', 'unchecked'].includes(lower)) {
          return false;
        }
        return null;
      }
      
      case 'array': {
        try {
          // Try JSON parsing first
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        } catch {
          // Fallback to manual splitting
        }
        
        // Split on common delimiters
        return trimmed
          .split(/[,;|]/)
          .map(s => s.trim().replace(/^["']|["']$/g, ''))
          .filter(s => s !== '');
      }
      
      case 'object': {
        try {
          const parsed = JSON.parse(trimmed);
          return typeof parsed === 'object' && parsed !== null ? parsed : null;
        } catch {
          return null;
        }
      }
      
      case 'date': {
        const date = new Date(trimmed);
        return isNaN(date.getTime()) ? null : date.toISOString();
      }
      
      case 'email': {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(trimmed) ? trimmed : null;
      }
      
      case 'url': {
        try {
          const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
          return url.toString();
        } catch {
          return /^https?:\/\/.+/.test(trimmed) ? trimmed : null;
        }
      }
      
      default:
        return trimmed;
    }
  }

  /**
   * Validate extracted data against schema
   */
  private validateAgainstSchema(data: Record<string, any>, schema: ClassifiedField[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let isValid = true;

    // Check required fields
    for (const field of schema) {
      const value = data[field.name];

      if (field.required && (value === undefined || value === null || value === '')) {
        errors.push(`Required field '${field.name}' is missing or empty`);
        isValid = false;
        continue;
      }

      // Skip validation for optional missing fields
      if (value === undefined || value === null) {
        continue;
      }

      // Type validation
      if (!this.validateFieldType(value, field.type)) {
        errors.push(`Field '${field.name}' has invalid type. Expected ${field.type}, got ${typeof value}`);
        isValid = false;
      }

      // Custom Zod validation
      if (field.validation) {
        try {
          field.validation.parse(value);
        } catch (zodError) {
          if (zodError instanceof z.ZodError) {
            errors.push(`Field '${field.name}' validation failed: ${zodError.errors.map(e => e.message).join(', ')}`);
            isValid = false;
          }
        }
      }
    }

    // Check for unexpected fields
    const expectedFields = new Set(schema.map(f => f.name));
    for (const key of Object.keys(data)) {
      if (!expectedFields.has(key)) {
        warnings.push(`Unexpected field found: '${key}'`);
      }
    }

    return {
      isValid,
      errors,
      warnings,
      confidence: this.calculateValidationConfidence(data, schema, errors, warnings),
      safetyFlags: []
    };
  }

  /**
   * Validate field type
   */
  private validateFieldType(value: any, expectedType: FieldSchema['type']): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'date':
        return typeof value === 'string' && !isNaN(Date.parse(value));
      case 'email':
        return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      case 'url':
        return typeof value === 'string' && /^https?:\/\/.+/.test(value);
      default:
        return true;
    }
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidence(
    data: Record<string, any>,
    schema: ClassifiedField[],
    schemaValidation: ValidationResult,
    safetyValidation?: ValidationResult
  ): number {
    const totalFields = schema.length;
    const extractedFields = Object.keys(data).length;
    const requiredFields = schema.filter(f => f.required).length;
    const extractedRequiredFields = schema.filter(f => f.required && data[f.name] !== undefined).length;

    // Base scores
    const completeness = totalFields > 0 ? (extractedFields / totalFields) * 30 : 0;
    const requiredCompleteness = requiredFields > 0 ? (extractedRequiredFields / requiredFields) * 40 : 40;
    const schemaValidityScore = schemaValidation.confidence * 0.25;
    const safetyScore = safetyValidation ? safetyValidation.confidence * 0.05 : 5;

    // Penalties
    const errorPenalty = schemaValidation.errors.length * 5;
    const warningPenalty = schemaValidation.warnings.length * 2;

    const finalScore = completeness + requiredCompleteness + schemaValidityScore + safetyScore - errorPenalty - warningPenalty;
    
    return Math.max(0, Math.min(100, Math.round(finalScore)));
  }

  /**
   * Calculate validation confidence
   */
  private calculateValidationConfidence(
    data: Record<string, any>,
    schema: ClassifiedField[],
    errors: string[],
    warnings: string[]
  ): number {
    const errorPenalty = errors.length * 25;
    const warningPenalty = warnings.length * 10;
    return Math.max(0, Math.round((1 - (errorPenalty + warningPenalty) / 100) * 100));
  }

  /**
   * Estimate tokens used when not provided by API
   */
  private estimateTokensUsed(prompt: string, response: string): number {
    // Rough estimation: 1 token ≈ 4 characters for English text
    return Math.ceil((prompt.length + response.length) / 4);
  }

  /**
   * Calculate cost for token usage
   */
  private calculateCost(tokensUsed: number, model: string): number {
    return this.tokenBudgetManager.calculateCost(tokensUsed, model, 'input') +
           this.tokenBudgetManager.calculateCost(tokensUsed * 0.1, model, 'output'); // Estimate 10% for output
  }

  /**
   * Create a failure result
   */
  private createFailureResult<T>(
    context: ProcessingContext,
    startTime: number,
    errorMessage: string
  ): ExtractionResult<T> {
    return {
      success: false,
      data: {} as T,
      confidence: 0,
      warnings: [],
      errors: [errorMessage],
      metadata: {
        tokensUsed: 0,
        processingTime: Date.now() - startTime,
        provider: this.config.aiProvider.provider,
        model: this.config.aiProvider.model,
        attemptNumber: context.currentAttempt,
        fallbackUsed: false,
        safetyFlags: [],
        classificationResult: context.steps.find(s => s.name === 'field_classification')?.metadata?.classificationResult,
        tokenBudgetResult: context.tokenBudget
      }
    };
  }

  /**
   * Validate and normalize configuration
   */
  private validateAndNormalizeConfig(config: SmartAgentConfig): SmartAgentConfig {
    // Validate required fields
    if (!config.aiProvider?.provider) {
      throw new Error('AI provider is required');
    }
    if (!config.aiProvider?.model) {
      throw new Error('AI model is required');
    }
    if (!config.aiProvider?.apiKey) {
      throw new Error('API key is required');
    }

    // Set defaults
    return {
      maxRetries: 3,
      timeout: 30000,
      enableSafety: true,
      enableFallback: true,
      enableTokenManagement: true,
      contextWindow: 8192,
      debugMode: false,
      ...config,
      aiProvider: {
        maxTokens: 2048,
        temperature: 0.1,
        timeout: 30000,
        ...config.aiProvider
      }
    };
  }

  // Public utility methods

  /**
   * Perform health check on all components
   */
  async healthCheck(): Promise<{ 
    status: 'healthy' | 'degraded' | 'unhealthy'; 
    details: Record<string, any>;
    timestamp: string;
  }> {
    const checks = {
      aiProvider: false,
      tokenBudget: false,
      safety: false,
      fallback: false,
      fieldClassifier: true, // No external dependencies
      promptGenerator: true  // No external dependencies
    };

    const details: Record<string, any> = {};

    try {
      // Test AI provider connectivity with a minimal request
      const testPrompt = 'Respond with "OK" only.';
      const response = await this.callAIProvider(testPrompt);
      checks.aiProvider = response.content.toLowerCase().includes('ok');
      details.aiProvider = { 
        connected: checks.aiProvider,
        provider: this.config.aiProvider.provider,
        model: this.config.aiProvider.model
      };
    } catch (error) {
      checks.aiProvider = false;
      details.aiProvider = { 
        connected: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Test other components
    checks.tokenBudget = this.tokenBudgetManager.healthCheck();
    details.tokenBudget = { healthy: checks.tokenBudget };

    checks.safety = this.safetyValidator.healthCheck();
    details.safety = { healthy: checks.safety };

    checks.fallback = this.fallbackHandler.healthCheck();
    details.fallback = { healthy: checks.fallback };

    const healthyCount = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.keys(checks).length;
    
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (healthyCount === totalChecks) {
      status = 'healthy';
    } else if (healthyCount >= totalChecks * 0.6) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      details: {
        ...details,
        summary: {
          healthy: healthyCount,
          total: totalChecks,
          percentage: Math.round((healthyCount / totalChecks) * 100)
        }
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Update agent configuration
   */
  updateConfig(newConfig: Partial<SmartAgentConfig>): void {
    this.config = this.validateAndNormalizeConfig({ ...this.config, ...newConfig });
    
    // Reinitialize components if their configuration changed
    if (newConfig.safetyConfig) {
      this.safetyValidator = new SafetyValidator(this.config.safetyConfig);
    }
    
    if (newConfig.fallbackConfig) {
      this.fallbackHandler = new FallbackHandler(this.config.fallbackConfig);
    }
    
    if (newConfig.aiProvider?.provider && newConfig.aiProvider.provider !== this.config.aiProvider.provider) {
      this.tokenBudgetManager = new TokenBudgetManager(newConfig.aiProvider.provider);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): SmartAgentConfig {
    return { ...this.config };
  }

  /**
   * Get usage statistics
   */
  getUsageStats() {
    return this.tokenBudgetManager.getUsageReport();
  }

  /**
   * Reset usage tracking
   */
  resetUsageStats(): void {
    this.tokenBudgetManager.resetUsageTracking();
  }
}

export default SmartAIAgent;