import { z } from 'zod';
import { FieldClassifier } from './fieldClassifier';
import { PromptGenerator } from './promptGenerator';
import { SafetyValidator } from './safetyValidator';
import { FallbackHandler } from './fallbackHandler';
import { TokenBudgetManager } from './tokenBudgetManager';

export interface AIProviderConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'mistral';
  model: string;
  apiKey: string;
  baseURL?: string;
  maxTokens?: number;
  temperature?: number;
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
}

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

export interface ExtractionResult<T = Record<string, any>> {
  success: boolean;
  data: T;
  confidence: number;
  warnings: string[];
  errors: string[];
  metadata: {
    tokensUsed: number;
    processingTime: number;
    provider: string;
    model: string;
    attemptNumber: number;
    fallbackUsed: boolean;
    safetyFlags: string[];
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  confidence: number;
  safetyFlags: string[];
}

export class SmartAIAgent {
  private fieldClassifier: FieldClassifier;
  private promptGenerator: PromptGenerator;
  private safetyValidator: SafetyValidator;
  private fallbackHandler: FallbackHandler;
  private tokenBudgetManager: TokenBudgetManager;
  private config: SmartAgentConfig;

  constructor(config: SmartAgentConfig) {
    this.config = config;
    this.fieldClassifier = new FieldClassifier();
    this.promptGenerator = new PromptGenerator();
    this.safetyValidator = new SafetyValidator();
    this.fallbackHandler = new FallbackHandler();
    this.tokenBudgetManager = new TokenBudgetManager(config.aiProvider.provider);
  }

  async extractFields<T = Record<string, any>>(
    input: string,
    schema: FieldSchema[],
    context: ExtractionContext = { source: 'unknown' }
  ): Promise<ExtractionResult<T>> {
    const startTime = Date.now();
    let attemptNumber = 0;
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      // Classify and prioritize fields
      const classifiedFields = this.fieldClassifier.classifyFields(schema, context);
      
      // Check token budget constraints
      if (this.config.enableTokenManagement) {
        const tokenCheck = this.tokenBudgetManager.checkTokenBudget(input, classifiedFields);
        if (!tokenCheck.withinBudget) {
          warnings.push(`Input exceeds token budget: ${tokenCheck.estimatedTokens}/${tokenCheck.maxTokens}`);
          
          // Truncate input if possible
          input = this.tokenBudgetManager.truncateInput(input, tokenCheck.maxTokens * 0.8);
        }
      }

      let result: ExtractionResult<T> | null = null;

      // Main extraction loop with retries
      for (attemptNumber = 1; attemptNumber <= this.config.maxRetries; attemptNumber++) {
        try {
          // Generate context-aware prompt
          const prompt = this.promptGenerator.generateExtractionPrompt(
            input,
            classifiedFields,
            context,
            attemptNumber > 1
          );

          // Call AI provider
          const aiResponse = await this.callAIProvider(prompt);
          
          // Parse and validate response
          const parsedData = this.parseAIResponse(aiResponse, classifiedFields);
          
          // Safety validation
          let safetyFlags: string[] = [];
          if (this.config.enableSafety) {
            const safetyResult = await this.safetyValidator.validateOutput(
              parsedData,
              classifiedFields,
              context
            );
            
            if (!safetyResult.isValid) {
              safetyFlags = safetyResult.safetyFlags;
              errors.push(...safetyResult.errors);
              
              if (safetyResult.safetyFlags.includes('high_risk')) {
                throw new Error('High-risk content detected, aborting extraction');
              }
            }
            
            warnings.push(...safetyResult.warnings);
            safetyFlags = safetyResult.safetyFlags;
          }

          // Schema validation
          const validationResult = this.validateAgainstSchema(parsedData, classifiedFields);
          
          if (validationResult.isValid || attemptNumber === this.config.maxRetries) {
            result = {
              success: validationResult.isValid,
              data: parsedData as T,
              confidence: this.calculateConfidence(parsedData, classifiedFields, validationResult),
              warnings: [...warnings, ...validationResult.warnings],
              errors: [...errors, ...validationResult.errors],
              metadata: {
                tokensUsed: this.estimateTokensUsed(prompt, aiResponse),
                processingTime: Date.now() - startTime,
                provider: this.config.aiProvider.provider,
                model: this.config.aiProvider.model,
                attemptNumber,
                fallbackUsed: false,
                safetyFlags
              }
            };
            break;
          } else {
            errors.push(`Attempt ${attemptNumber} failed validation: ${validationResult.errors.join(', ')}`);
          }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Attempt ${attemptNumber} failed: ${errorMessage}`);
          
          if (attemptNumber === this.config.maxRetries) {
            throw error;
          }
        }
      }

      // Fallback handling if main extraction failed
      if (!result?.success && this.config.enableFallback) {
        const fallbackResult = await this.fallbackHandler.handleFailedExtraction(
          input,
          classifiedFields,
          context,
          errors
        );

        if (fallbackResult.success) {
          result = {
            ...fallbackResult,
            metadata: {
              ...fallbackResult.metadata,
              fallbackUsed: true,
              attemptNumber: attemptNumber + 1
            }
          } as ExtractionResult<T>;
        }
      }

      return result || {
        success: false,
        data: {} as T,
        confidence: 0,
        warnings,
        errors,
        metadata: {
          tokensUsed: 0,
          processingTime: Date.now() - startTime,
          provider: this.config.aiProvider.provider,
          model: this.config.aiProvider.model,
          attemptNumber,
          fallbackUsed: false,
          safetyFlags: []
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      return {
        success: false,
        data: {} as T,
        confidence: 0,
        warnings,
        errors: [...errors, errorMessage],
        metadata: {
          tokensUsed: 0,
          processingTime: Date.now() - startTime,
          provider: this.config.aiProvider.provider,
          model: this.config.aiProvider.model,
          attemptNumber,
          fallbackUsed: false,
          safetyFlags: []
        }
      };
    }
  }

  private async callAIProvider(prompt: string): Promise<string> {
    const { provider, model, apiKey, baseURL, maxTokens = 2048, temperature = 0.1 } = this.config.aiProvider;

    switch (provider) {
      case 'openai': {
        const response = await fetch(`${baseURL || 'https://api.openai.com/v1'}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens,
            temperature
          })
        });

        if (!response.ok) {
          throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.choices[0]?.message?.content || '';
      }

      case 'anthropic': {
        const response = await fetch(`${baseURL || 'https://api.anthropic.com'}/v1/messages`, {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            temperature,
            messages: [{ role: 'user', content: prompt }]
          })
        });

        if (!response.ok) {
          throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.content[0]?.text || '';
      }

      case 'google': {
        const response = await fetch(`${baseURL || 'https://generativelanguage.googleapis.com'}/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: maxTokens,
              temperature
            }
          })
        });

        if (!response.ok) {
          throw new Error(`Google API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.candidates[0]?.content?.parts[0]?.text || '';
      }

      case 'mistral': {
        const response = await fetch(`${baseURL || 'https://api.mistral.ai'}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens,
            temperature
          })
        });

        if (!response.ok) {
          throw new Error(`Mistral API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.choices[0]?.message?.content || '';
      }

      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }
  }

  private parseAIResponse(response: string, schema: FieldSchema[]): Record<string, any> {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback: extract values using regex patterns
      const result: Record<string, any> = {};
      
      for (const field of schema) {
        const patterns = this.generateExtractionPatterns(field);
        for (const pattern of patterns) {
          const match = response.match(pattern);
          if (match) {
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

  private generateExtractionPatterns(field: FieldSchema): RegExp[] {
    const name = field.name;
    return [
      new RegExp(`"${name}":\\s*"([^"]*)"`, 'i'),
      new RegExp(`"${name}":\\s*([^,}\\n]*)`, 'i'),
      new RegExp(`${name}:\\s*"([^"]*)"`, 'i'),
      new RegExp(`${name}:\\s*([^,}\\n]*)`, 'i'),
      new RegExp(`\\b${name}\\b[:\\s]+([^\\n,]*)`, 'i')
    ];
  }

  private parseFieldValue(value: string, type: FieldSchema['type']): any {
    const trimmed = value.trim().replace(/^["']|["']$/g, '');
    
    switch (type) {
      case 'number':
        const num = parseFloat(trimmed);
        return isNaN(num) ? null : num;
      case 'boolean':
        return ['true', '1', 'yes', 'on'].includes(trimmed.toLowerCase());
      case 'array':
        try {
          return JSON.parse(trimmed);
        } catch {
          return trimmed.split(',').map(s => s.trim());
        }
      case 'object':
        try {
          return JSON.parse(trimmed);
        } catch {
          return null;
        }
      case 'date':
        const date = new Date(trimmed);
        return isNaN(date.getTime()) ? null : date.toISOString();
      default:
        return trimmed;
    }
  }

  private validateAgainstSchema(data: Record<string, any>, schema: FieldSchema[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let isValid = true;

    for (const field of schema) {
      const value = data[field.name];

      // Check required fields
      if (field.required && (value === undefined || value === null || value === '')) {
        errors.push(`Required field '${field.name}' is missing`);
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

      // Custom validation with Zod schema
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

  private calculateConfidence(
    data: Record<string, any>,
    schema: FieldSchema[],
    validationResult: ValidationResult
  ): number {
    const totalFields = schema.length;
    const extractedFields = Object.keys(data).length;
    const requiredFields = schema.filter(f => f.required).length;
    const extractedRequiredFields = schema.filter(f => f.required && data[f.name] !== undefined).length;

    const completeness = totalFields > 0 ? extractedFields / totalFields : 0;
    const requiredCompleteness = requiredFields > 0 ? extractedRequiredFields / requiredFields : 1;
    const validityScore = validationResult.isValid ? 1 : Math.max(0, 1 - (validationResult.errors.length * 0.2));

    return Math.round((completeness * 0.3 + requiredCompleteness * 0.5 + validityScore * 0.2) * 100);
  }

  private calculateValidationConfidence(
    data: Record<string, any>,
    schema: FieldSchema[],
    errors: string[],
    warnings: string[]
  ): number {
    const errorPenalty = errors.length * 0.25;
    const warningPenalty = warnings.length * 0.1;
    return Math.max(0, Math.round((1 - errorPenalty - warningPenalty) * 100));
  }

  private estimateTokensUsed(prompt: string, response: string): number {
    // Rough estimation: 1 token ≈ 4 characters for English text
    return Math.ceil((prompt.length + response.length) / 4);
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; details: Record<string, any> }> {
    const checks = {
      aiProvider: false,
      tokenBudget: false,
      safety: false,
      fallback: false
    };

    try {
      // Test AI provider connectivity
      const testPrompt = 'Respond with "OK"';
      const response = await this.callAIProvider(testPrompt);
      checks.aiProvider = response.toLowerCase().includes('ok');
    } catch {
      checks.aiProvider = false;
    }

    // Test other components
    checks.tokenBudget = this.tokenBudgetManager.healthCheck();
    checks.safety = this.safetyValidator.healthCheck();
    checks.fallback = this.fallbackHandler.healthCheck();

    const healthyCount = Object.values(checks).filter(Boolean).length;
    const status = healthyCount === 4 ? 'healthy' : healthyCount >= 2 ? 'degraded' : 'unhealthy';

    return { status, details: checks };
  }

  updateConfig(newConfig: Partial<SmartAgentConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.aiProvider) {
      this.tokenBudgetManager = new TokenBudgetManager(newConfig.aiProvider.provider);
    }
  }

  getConfig(): SmartAgentConfig {
    return { ...this.config };
  }
}

export default SmartAIAgent;