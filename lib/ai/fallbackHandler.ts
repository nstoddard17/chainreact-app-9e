import { ClassifiedField } from './fieldClassifier';
import { ExtractionContext, ExtractionResult } from './smartAIAgent';

export interface FallbackStrategy {
  id: string;
  name: string;
  priority: number;
  canHandle: (context: ExtractionContext, fields: ClassifiedField[], errors: string[]) => boolean;
  execute: (
    input: string,
    fields: ClassifiedField[],
    context: ExtractionContext,
    errors: string[]
  ) => Promise<ExtractionResult>;
}

export interface FallbackTemplate {
  id: string;
  name: string;
  pattern: string;
  applicableTypes: string[];
  confidence: number;
  priority: number;
}

export interface FallbackConfig {
  enableTemplateMatching: boolean;
  enablePatternExtraction: boolean;
  enableContextualGuessing: boolean;
  enablePartialExtraction: boolean;
  maxFallbackAttempts: number;
  minimumConfidenceThreshold: number;
  preferredStrategies: string[];
}

export interface FallbackAnalysis {
  recommendedStrategy: string;
  confidence: number;
  reasoning: string[];
  alternatives: string[];
  expectedSuccess: number;
}

export class FallbackHandler {
  private strategies: Map<string, FallbackStrategy>;
  private templates: Map<string, FallbackTemplate>;
  private patterns: Map<string, RegExp[]>;
  private config: FallbackConfig;

  constructor(config: Partial<FallbackConfig> = {}) {
    this.config = {
      enableTemplateMatching: true,
      enablePatternExtraction: true,
      enableContextualGuessing: true,
      enablePartialExtraction: true,
      maxFallbackAttempts: 3,
      minimumConfidenceThreshold: 30,
      preferredStrategies: ['template_matching', 'pattern_extraction', 'partial_extraction'],
      ...config
    };

    this.strategies = new Map();
    this.templates = new Map();
    this.patterns = new Map();

    this.initializeStrategies();
    this.initializeTemplates();
    this.initializePatterns();
  }

  async handleFailedExtraction(
    input: string,
    fields: ClassifiedField[],
    context: ExtractionContext,
    errors: string[]
  ): Promise<ExtractionResult> {
    const startTime = Date.now();

    try {
      // Analyze the failure to determine best fallback strategy
      const analysis = this.analyzeFallbackNeeds(context, fields, errors);
      
      // Get applicable strategies
      const applicableStrategies = this.getApplicableStrategies(context, fields, errors);
      
      if (applicableStrategies.length === 0) {
        return this.createFailureResult(input, fields, errors, startTime, 'No applicable fallback strategies');
      }

      // Sort strategies by priority and preference
      const sortedStrategies = this.sortStrategiesByPriority(applicableStrategies);

      let lastError = 'All fallback strategies failed';
      
      // Try each strategy
      for (const strategy of sortedStrategies.slice(0, this.config.maxFallbackAttempts)) {
        try {
          const result = await strategy.execute(input, fields, context, errors);
          
          // Check if result meets minimum confidence threshold
          if (result.confidence >= this.config.minimumConfidenceThreshold) {
            result.metadata.fallbackUsed = true;
            result.metadata.processingTime = Date.now() - startTime;
            return result;
          } else {
            lastError = `Strategy '${strategy.name}' produced low confidence result: ${result.confidence}%`;
          }
        } catch (error) {
          lastError = `Strategy '${strategy.name}' failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
          continue;
        }
      }

      // If all strategies failed, try partial extraction as last resort
      if (this.config.enablePartialExtraction) {
        const partialResult = await this.executePartialExtraction(input, fields, context);
        if (partialResult.success) {
          partialResult.metadata.fallbackUsed = true;
          partialResult.metadata.processingTime = Date.now() - startTime;
          return partialResult;
        }
      }

      return this.createFailureResult(input, fields, errors, startTime, lastError);

    } catch (error) {
      return this.createFailureResult(
        input,
        fields,
        errors,
        startTime,
        `Fallback handler error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private analyzeFallbackNeeds(
    context: ExtractionContext,
    fields: ClassifiedField[],
    errors: string[]
  ): FallbackAnalysis {
    const reasoning: string[] = [];
    let recommendedStrategy = 'template_matching';
    let confidence = 70;

    // Analyze error patterns
    const hasParsingErrors = errors.some(error => 
      error.toLowerCase().includes('parse') || error.toLowerCase().includes('json')
    );
    const hasValidationErrors = errors.some(error => 
      error.toLowerCase().includes('validation') || error.toLowerCase().includes('required')
    );
    const hasTypeErrors = errors.some(error => 
      error.toLowerCase().includes('type') || error.toLowerCase().includes('format')
    );

    if (hasParsingErrors) {
      reasoning.push('Parsing errors detected - template matching may be effective');
      recommendedStrategy = 'template_matching';
      confidence += 10;
    }

    if (hasValidationErrors) {
      reasoning.push('Validation errors detected - partial extraction might help');
      if (recommendedStrategy === 'template_matching') {
        recommendedStrategy = 'partial_extraction';
      }
      confidence += 5;
    }

    if (hasTypeErrors) {
      reasoning.push('Type errors detected - pattern extraction could resolve format issues');
      recommendedStrategy = 'pattern_extraction';
      confidence += 8;
    }

    // Context-based recommendations
    if (context.format === 'email') {
      reasoning.push('Email format detected - email-specific patterns available');
      confidence += 15;
    }

    if (context.format === 'form') {
      reasoning.push('Form format detected - template matching highly effective');
      confidence += 12;
    }

    // Field complexity analysis
    const complexFields = fields.filter(f => f.complexity === 'complex').length;
    const totalFields = fields.length;
    
    if (complexFields / totalFields > 0.5) {
      reasoning.push('High complexity fields detected - reducing confidence');
      confidence -= 10;
    }

    const alternatives = ['template_matching', 'pattern_extraction', 'partial_extraction']
      .filter(s => s !== recommendedStrategy);

    return {
      recommendedStrategy,
      confidence: Math.max(20, Math.min(confidence, 90)),
      reasoning,
      alternatives,
      expectedSuccess: Math.max(30, confidence - 10)
    };
  }

  private getApplicableStrategies(
    context: ExtractionContext,
    fields: ClassifiedField[],
    errors: string[]
  ): FallbackStrategy[] {
    const applicable: FallbackStrategy[] = [];

    for (const strategy of this.strategies.values()) {
      if (strategy.canHandle(context, fields, errors)) {
        applicable.push(strategy);
      }
    }

    return applicable;
  }

  private sortStrategiesByPriority(strategies: FallbackStrategy[]): FallbackStrategy[] {
    return strategies.sort((a, b) => {
      // First sort by preference order
      const aIndex = this.config.preferredStrategies.indexOf(a.id);
      const bIndex = this.config.preferredStrategies.indexOf(b.id);
      
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      
      // Then by priority
      return b.priority - a.priority;
    });
  }

  private async executePartialExtraction(
    input: string,
    fields: ClassifiedField[],
    context: ExtractionContext
  ): Promise<ExtractionResult> {
    const extractedData: Record<string, any> = {};
    const warnings: string[] = [];
    const errors: string[] = [];
    let extractedCount = 0;

    // Try to extract each field individually using simple patterns
    for (const field of fields) {
      try {
        const value = await this.extractSingleField(input, field, context);
        if (value !== null && value !== undefined) {
          extractedData[field.name] = value;
          extractedCount++;
        } else if (field.required) {
          errors.push(`Could not extract required field: ${field.name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (field.required) {
          errors.push(`Error extracting required field ${field.name}: ${errorMessage}`);
        } else {
          warnings.push(`Error extracting optional field ${field.name}: ${errorMessage}`);
        }
      }
    }

    const totalFields = fields.length;
    const requiredFields = fields.filter(f => f.required).length;
    const extractedRequired = fields.filter(f => f.required && extractedData[f.name] !== undefined).length;

    const success = extractedCount > 0 && (requiredFields === 0 || extractedRequired > 0);
    const confidence = Math.round((extractedCount / totalFields) * 100);

    return {
      success,
      data: extractedData,
      confidence,
      warnings,
      errors,
      metadata: {
        tokensUsed: 0,
        processingTime: 0,
        provider: 'fallback',
        model: 'partial_extraction',
        attemptNumber: 1,
        fallbackUsed: true,
        safetyFlags: []
      }
    };
  }

  private async extractSingleField(
    input: string,
    field: ClassifiedField,
    context: ExtractionContext
  ): Promise<any> {
    // Try different extraction methods for single field
    
    // 1. Try field-specific patterns
    const patterns = this.patterns.get(field.type) || [];
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match && match[1]) {
        return this.parseFieldValue(match[1], field.type);
      }
    }

    // 2. Try template matching
    if (this.config.enableTemplateMatching) {
      const templates = Array.from(this.templates.values())
        .filter(t => t.applicableTypes.includes(field.type));
      
      for (const template of templates) {
        const result = this.applyTemplate(input, field, template);
        if (result !== null) {
          return result;
        }
      }
    }

    // 3. Try contextual extraction based on field name
    return this.extractByFieldName(input, field);
  }

  private applyTemplate(input: string, field: ClassifiedField, template: FallbackTemplate): any {
    try {
      // Replace placeholders in template pattern
      const pattern = template.pattern
        .replace('{FIELD_NAME}', field.name)
        .replace('{FIELD_TYPE}', field.type);

      const regex = new RegExp(pattern, 'i');
      const match = input.match(regex);
      
      if (match && match[1]) {
        return this.parseFieldValue(match[1], field.type);
      }
    } catch (error) {
      // Template application failed
    }
    
    return null;
  }

  private extractByFieldName(input: string, field: ClassifiedField): any {
    const fieldName = field.name.toLowerCase();
    const variations = this.generateFieldNameVariations(fieldName);
    
    for (const variation of variations) {
      // Try different patterns with field name variations
      const patterns = [
        new RegExp(`${variation}[:\\s]+([^\\n,;]+)`, 'i'),
        new RegExp(`"${variation}"[:\\s]*"([^"]*)"`, 'i'),
        new RegExp(`${variation}[:\\s]*=\\s*"?([^"\\n,;]+)"?`, 'i'),
        new RegExp(`<${variation}[^>]*>([^<]*)</${variation}>`, 'i')
      ];

      for (const pattern of patterns) {
        const match = input.match(pattern);
        if (match && match[1]) {
          const value = match[1].trim();
          if (value && value !== '') {
            return this.parseFieldValue(value, field.type);
          }
        }
      }
    }

    return null;
  }

  private generateFieldNameVariations(fieldName: string): string[] {
    const variations = [fieldName];

    // Camel case to snake case
    const snakeCase = fieldName.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (snakeCase !== fieldName) variations.push(snakeCase);

    // Kebab case
    const kebabCase = fieldName.replace(/([A-Z])/g, '-$1').toLowerCase();
    if (kebabCase !== fieldName) variations.push(kebabCase);

    // Spaced version
    const spaced = fieldName.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
    if (spaced !== fieldName) variations.push(spaced);

    // Remove common prefixes/suffixes
    const cleaned = fieldName.replace(/(field|value|data|info)$/i, '').toLowerCase();
    if (cleaned !== fieldName.toLowerCase() && cleaned.length > 2) {
      variations.push(cleaned);
    }

    return variations;
  }

  private parseFieldValue(value: string, type: string): any {
    const trimmed = value.trim().replace(/^["']|["']$/g, '');
    
    switch (type) {
      case 'number':
        const num = parseFloat(trimmed.replace(/[^\d.-]/g, ''));
        return isNaN(num) ? null : num;
      case 'boolean':
        const lower = trimmed.toLowerCase();
        if (['true', '1', 'yes', 'on', 'enabled', 'active'].includes(lower)) return true;
        if (['false', '0', 'no', 'off', 'disabled', 'inactive'].includes(lower)) return false;
        return null;
      case 'array':
        try {
          return JSON.parse(trimmed);
        } catch {
          return trimmed.split(/[,;|]/).map(s => s.trim()).filter(s => s !== '');
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
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
      case 'url':
        return /^https?:\/\/.+/.test(trimmed) ? trimmed : null;
      default:
        return trimmed || null;
    }
  }

  private createFailureResult(
    input: string,
    fields: ClassifiedField[],
    errors: string[],
    startTime: number,
    additionalError: string
  ): ExtractionResult {
    return {
      success: false,
      data: {},
      confidence: 0,
      warnings: [],
      errors: [...errors, additionalError],
      metadata: {
        tokensUsed: 0,
        processingTime: Date.now() - startTime,
        provider: 'fallback',
        model: 'failed',
        attemptNumber: 1,
        fallbackUsed: true,
        safetyFlags: []
      }
    };
  }

  private initializeStrategies(): void {
    // Template Matching Strategy
    this.strategies.set('template_matching', {
      id: 'template_matching',
      name: 'Template Matching',
      priority: 80,
      canHandle: (context, fields, errors) => {
        return this.config.enableTemplateMatching && 
               (context.format === 'form' || context.format === 'email' || 
                errors.some(e => e.toLowerCase().includes('parse')));
      },
      execute: async (input, fields, context, errors) => {
        return this.executeTemplateMatching(input, fields, context);
      }
    });

    // Pattern Extraction Strategy
    this.strategies.set('pattern_extraction', {
      id: 'pattern_extraction',
      name: 'Pattern Extraction',
      priority: 70,
      canHandle: (context, fields, errors) => {
        return this.config.enablePatternExtraction &&
               fields.some(f => ['email', 'url', 'date', 'number'].includes(f.type));
      },
      execute: async (input, fields, context, errors) => {
        return this.executePatternExtraction(input, fields, context);
      }
    });

    // Contextual Guessing Strategy
    this.strategies.set('contextual_guessing', {
      id: 'contextual_guessing',
      name: 'Contextual Guessing',
      priority: 60,
      canHandle: (context, fields, errors) => {
        return this.config.enableContextualGuessing &&
               context.domain !== undefined;
      },
      execute: async (input, fields, context, errors) => {
        return this.executeContextualGuessing(input, fields, context);
      }
    });

    // Partial Extraction Strategy
    this.strategies.set('partial_extraction', {
      id: 'partial_extraction',
      name: 'Partial Extraction',
      priority: 50,
      canHandle: (context, fields, errors) => {
        return this.config.enablePartialExtraction;
      },
      execute: async (input, fields, context, errors) => {
        return this.executePartialExtraction(input, fields, context);
      }
    });

    // Heuristic Extraction Strategy
    this.strategies.set('heuristic_extraction', {
      id: 'heuristic_extraction',
      name: 'Heuristic Extraction',
      priority: 40,
      canHandle: (context, fields, errors) => {
        return fields.length <= 5; // Only for simple schemas
      },
      execute: async (input, fields, context, errors) => {
        return this.executeHeuristicExtraction(input, fields, context);
      }
    });
  }

  private async executeTemplateMatching(
    input: string,
    fields: ClassifiedField[],
    context: ExtractionContext
  ): Promise<ExtractionResult> {
    const extractedData: Record<string, any> = {};
    const warnings: string[] = [];
    const errors: string[] = [];

    // Sort templates by confidence and priority
    const sortedTemplates = Array.from(this.templates.values())
      .sort((a, b) => b.confidence - a.confidence || b.priority - a.priority);

    for (const field of fields) {
      let extracted = false;
      
      for (const template of sortedTemplates) {
        if (template.applicableTypes.includes(field.type) || template.applicableTypes.includes('any')) {
          const value = this.applyTemplate(input, field, template);
          if (value !== null) {
            extractedData[field.name] = value;
            extracted = true;
            break;
          }
        }
      }

      if (!extracted && field.required) {
        errors.push(`Could not extract required field using templates: ${field.name}`);
      }
    }

    const success = Object.keys(extractedData).length > 0;
    const confidence = Math.round((Object.keys(extractedData).length / fields.length) * 80); // Max 80% for fallback

    return {
      success,
      data: extractedData,
      confidence,
      warnings,
      errors,
      metadata: {
        tokensUsed: 0,
        processingTime: 0,
        provider: 'fallback',
        model: 'template_matching',
        attemptNumber: 1,
        fallbackUsed: true,
        safetyFlags: []
      }
    };
  }

  private async executePatternExtraction(
    input: string,
    fields: ClassifiedField[],
    context: ExtractionContext
  ): Promise<ExtractionResult> {
    const extractedData: Record<string, any> = {};
    const warnings: string[] = [];
    const errors: string[] = [];

    for (const field of fields) {
      const patterns = this.patterns.get(field.type) || [];
      let extracted = false;

      for (const pattern of patterns) {
        const matches = [...input.matchAll(new RegExp(pattern.source, 'gi'))];
        if (matches.length > 0) {
          if (field.type === 'array' && matches.length > 1) {
            extractedData[field.name] = matches.map(m => this.parseFieldValue(m[1] || m[0], 'string'));
          } else {
            const match = matches[0];
            extractedData[field.name] = this.parseFieldValue(match[1] || match[0], field.type);
          }
          extracted = true;
          break;
        }
      }

      if (!extracted && field.required) {
        errors.push(`No pattern match found for required field: ${field.name}`);
      }
    }

    const success = Object.keys(extractedData).length > 0;
    const confidence = Math.round((Object.keys(extractedData).length / fields.length) * 75);

    return {
      success,
      data: extractedData,
      confidence,
      warnings,
      errors,
      metadata: {
        tokensUsed: 0,
        processingTime: 0,
        provider: 'fallback',
        model: 'pattern_extraction',
        attemptNumber: 1,
        fallbackUsed: true,
        safetyFlags: []
      }
    };
  }

  private async executeContextualGuessing(
    input: string,
    fields: ClassifiedField[],
    context: ExtractionContext
  ): Promise<ExtractionResult> {
    const extractedData: Record<string, any> = {};
    const warnings: string[] = ['Contextual guessing used - results may be inaccurate'];
    const errors: string[] = [];

    // Domain-specific extraction logic
    for (const field of fields) {
      const value = this.extractByContext(input, field, context);
      if (value !== null) {
        extractedData[field.name] = value;
      } else if (field.required) {
        errors.push(`Could not guess value for required field: ${field.name}`);
      }
    }

    const success = Object.keys(extractedData).length > 0;
    const confidence = Math.min(60, Math.round((Object.keys(extractedData).length / fields.length) * 60));

    return {
      success,
      data: extractedData,
      confidence,
      warnings,
      errors,
      metadata: {
        tokensUsed: 0,
        processingTime: 0,
        provider: 'fallback',
        model: 'contextual_guessing',
        attemptNumber: 1,
        fallbackUsed: true,
        safetyFlags: ['low_confidence_extraction']
      }
    };
  }

  private extractByContext(input: string, field: ClassifiedField, context: ExtractionContext): any {
    const lowerInput = input.toLowerCase();
    const fieldName = field.name.toLowerCase();

    // Domain-specific heuristics
    if (context.domain === 'finance') {
      if (fieldName.includes('amount') || fieldName.includes('price')) {
        const match = input.match(/\$?\d+(?:,\d{3})*(?:\.\d{2})?/);
        return match ? this.parseFieldValue(match[0], 'number') : null;
      }
    }

    if (context.domain === 'healthcare') {
      if (fieldName.includes('date') && field.type === 'date') {
        const match = input.match(/\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/);
        return match ? this.parseFieldValue(match[0], 'date') : null;
      }
    }

    // General heuristics
    if (field.type === 'email') {
      const match = input.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      return match ? match[0] : null;
    }

    if (field.type === 'url') {
      const match = input.match(/https?:\/\/[^\s]+/);
      return match ? match[0] : null;
    }

    return null;
  }

  private async executeHeuristicExtraction(
    input: string,
    fields: ClassifiedField[],
    context: ExtractionContext
  ): Promise<ExtractionResult> {
    const extractedData: Record<string, any> = {};
    const warnings: string[] = ['Heuristic extraction used - results are best-effort'];
    const errors: string[] = [];

    // Simple heuristics for common field types
    for (const field of fields) {
      let value = null;

      // Try multiple heuristic approaches
      value = value || this.extractByFieldName(input, field);
      value = value || this.extractByType(input, field.type);
      value = value || this.extractByPosition(input, field, fields);

      if (value !== null) {
        extractedData[field.name] = value;
      } else if (field.required) {
        errors.push(`Heuristic extraction failed for required field: ${field.name}`);
      }
    }

    const success = Object.keys(extractedData).length > 0;
    const confidence = Math.min(50, Math.round((Object.keys(extractedData).length / fields.length) * 50));

    return {
      success,
      data: extractedData,
      confidence,
      warnings,
      errors,
      metadata: {
        tokensUsed: 0,
        processingTime: 0,
        provider: 'fallback',
        model: 'heuristic_extraction',
        attemptNumber: 1,
        fallbackUsed: true,
        safetyFlags: ['low_confidence_extraction']
      }
    };
  }

  private extractByType(input: string, type: string): any {
    const patterns = this.patterns.get(type);
    if (!patterns) return null;

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        return this.parseFieldValue(match[1] || match[0], type);
      }
    }

    return null;
  }

  private extractByPosition(input: string, field: ClassifiedField, allFields: ClassifiedField[]): any {
    // Try to extract based on field position in schema
    const fieldIndex = allFields.indexOf(field);
    const lines = input.split('\n').filter(line => line.trim() !== '');
    
    if (fieldIndex < lines.length) {
      const line = lines[fieldIndex];
      const match = line.match(/:\s*(.+)$|=\s*(.+)$/);
      if (match) {
        return this.parseFieldValue(match[1] || match[2], field.type);
      }
    }

    return null;
  }

  private initializeTemplates(): void {
    // Common templates for various formats
    this.templates.set('email_header', {
      id: 'email_header',
      name: 'Email Header Template',
      pattern: '(?:^|\\n){FIELD_NAME}:\\s*(.+)$',
      applicableTypes: ['string', 'email', 'date'],
      confidence: 85,
      priority: 90
    });

    this.templates.set('json_like', {
      id: 'json_like',
      name: 'JSON-like Template',
      pattern: '"{FIELD_NAME}"\\s*:\\s*"([^"]*)"',
      applicableTypes: ['string', 'email', 'url'],
      confidence: 80,
      priority: 85
    });

    this.templates.set('form_field', {
      id: 'form_field',
      name: 'Form Field Template',
      pattern: '{FIELD_NAME}\\s*[=:]\\s*(.+?)(?:\\n|$)',
      applicableTypes: ['string', 'number', 'email'],
      confidence: 75,
      priority: 80
    });

    this.templates.set('xml_tag', {
      id: 'xml_tag',
      name: 'XML Tag Template',
      pattern: '<{FIELD_NAME}[^>]*>([^<]*)</{FIELD_NAME}>',
      applicableTypes: ['string', 'number', 'date'],
      confidence: 90,
      priority: 95
    });

    this.templates.set('key_value', {
      id: 'key_value',
      name: 'Key-Value Template',
      pattern: '{FIELD_NAME}\\s*[:|=]\\s*([^\\n,;]+)',
      applicableTypes: ['any'],
      confidence: 70,
      priority: 75
    });

    this.templates.set('table_row', {
      id: 'table_row',
      name: 'Table Row Template',
      pattern: '{FIELD_NAME}\\s*\\|\\s*([^\\|\\n]+)',
      applicableTypes: ['string', 'number'],
      confidence: 65,
      priority: 70
    });
  }

  private initializePatterns(): void {
    this.patterns.set('email', [
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g
    ]);

    this.patterns.set('url', [
      /(https?:\/\/[^\s]+)/g,
      /(www\.[^\s]+)/g
    ]);

    this.patterns.set('date', [
      /(\d{4}-\d{2}-\d{2})/g,
      /(\d{1,2}\/\d{1,2}\/\d{4})/g,
      /(\d{1,2}-\d{1,2}-\d{4})/g,
      /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})/gi
    ]);

    this.patterns.set('number', [
      /(\d+\.?\d*)/g,
      /(\$?\d+,?\d*\.?\d*)/g
    ]);

    this.patterns.set('phone', [
      /(\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/g
    ]);

    this.patterns.set('boolean', [
      /(true|false)/gi,
      /(yes|no)/gi,
      /(on|off)/gi
    ]);
  }

  // Public utility methods

  addStrategy(strategy: FallbackStrategy): void {
    this.strategies.set(strategy.id, strategy);
  }

  removeStrategy(strategyId: string): void {
    this.strategies.delete(strategyId);
  }

  addTemplate(template: FallbackTemplate): void {
    this.templates.set(template.id, template);
  }

  removeTemplate(templateId: string): void {
    this.templates.delete(templateId);
  }

  addPattern(type: string, patterns: RegExp[]): void {
    this.patterns.set(type, patterns);
  }

  updateConfig(newConfig: Partial<FallbackConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): FallbackConfig {
    return { ...this.config };
  }

  listStrategies(): FallbackStrategy[] {
    return Array.from(this.strategies.values());
  }

  listTemplates(): FallbackTemplate[] {
    return Array.from(this.templates.values());
  }

  healthCheck(): boolean {
    return (
      this.strategies.size > 0 &&
      this.templates.size > 0 &&
      this.patterns.size > 0
    );
  }

  async testStrategy(
    strategyId: string,
    input: string,
    fields: ClassifiedField[],
    context: ExtractionContext
  ): Promise<ExtractionResult> {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) {
      throw new Error(`Strategy not found: ${strategyId}`);
    }

    return strategy.execute(input, fields, context, []);
  }

  getStrategyRecommendations(
    context: ExtractionContext,
    fields: ClassifiedField[],
    errors: string[]
  ): { strategy: string; confidence: number; reason: string }[] {
    const recommendations: { strategy: string; confidence: number; reason: string }[] = [];
    
    for (const [id, strategy] of this.strategies.entries()) {
      if (strategy.canHandle(context, fields, errors)) {
        let confidence = strategy.priority;
        let reason = `Strategy ${strategy.name} can handle this context`;

        // Adjust confidence based on context match
        if (id === 'template_matching' && ['form', 'email'].includes(context.format || '')) {
          confidence += 10;
          reason += ' and matches the input format well';
        }

        if (id === 'pattern_extraction' && fields.some(f => ['email', 'url', 'date'].includes(f.type))) {
          confidence += 8;
          reason += ' and field types are pattern-friendly';
        }

        recommendations.push({ strategy: id, confidence, reason });
      }
    }

    return recommendations.sort((a, b) => b.confidence - a.confidence);
  }
}

export default FallbackHandler;