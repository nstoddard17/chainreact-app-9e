import { ClassifiedField } from './fieldClassifier.js';

export interface TokenBudget {
  maxTokens: number;
  reservedTokens: number;
  availableTokens: number;
  inputLimit: number;
  outputLimit: number;
  safetyMargin: number;
}

export interface PlatformLimits {
  provider: 'openai' | 'anthropic' | 'google' | 'mistral';
  models: Map<string, ModelLimits>;
  defaultModel: string;
}

export interface ModelLimits {
  maxContextTokens: number;
  maxOutputTokens: number;
  tokensPerMinute?: number;
  tokensPerDay?: number;
  costPer1kTokens?: {
    input: number;
    output: number;
  };
  characterToTokenRatio: number;
}

export interface TokenEstimation {
  estimatedTokens: number;
  method: 'character_count' | 'word_count' | 'api_call' | 'ml_model';
  confidence: number;
  breakdown: {
    prompt: number;
    content: number;
    metadata: number;
  };
}

export interface BudgetCheckResult {
  withinBudget: boolean;
  estimatedTokens: number;
  maxTokens: number;
  utilizationPercentage: number;
  recommendations: string[];
  truncationRequired: boolean;
  truncationStrategy?: TruncationStrategy;
}

export interface TruncationStrategy {
  method: 'truncate_end' | 'truncate_middle' | 'summarize' | 'prioritize_fields' | 'remove_examples';
  targetLength: number;
  preserveImportant: boolean;
  fieldPriorities?: string[];
}

export interface UsageTracking {
  totalTokensUsed: number;
  totalCost: number;
  requestCount: number;
  averageTokensPerRequest: number;
  peakUsage: number;
  dailyUsage: Map<string, number>;
  modelUsage: Map<string, number>;
}

export class TokenBudgetManager {
  private platformLimits: PlatformLimits;
  private usageTracking: UsageTracking;
  private customLimits: Map<string, ModelLimits>;

  constructor(provider: 'openai' | 'anthropic' | 'google' | 'mistral') {
    this.platformLimits = this.initializePlatformLimits(provider);
    this.usageTracking = this.initializeUsageTracking();
    this.customLimits = new Map();
  }

  checkTokenBudget(
    input: string,
    fields: ClassifiedField[],
    model?: string,
    reservedOutputTokens?: number
  ): BudgetCheckResult {
    const modelName = model || this.platformLimits.defaultModel;
    const limits = this.getModelLimits(modelName);
    
    if (!limits) {
      throw new Error(`Model limits not found for: ${modelName}`);
    }

    // Estimate input tokens
    const inputEstimation = this.estimateTokens(input, modelName);
    
    // Estimate prompt overhead tokens
    const promptOverhead = this.estimatePromptOverhead(fields);
    
    // Calculate total estimated tokens
    const totalInputTokens = inputEstimation.estimatedTokens + promptOverhead;
    const outputTokens = reservedOutputTokens || Math.min(limits.maxOutputTokens, 1000);
    const totalEstimatedTokens = totalInputTokens + outputTokens;

    // Check against limits
    const maxTokens = limits.maxContextTokens;
    const withinBudget = totalEstimatedTokens <= maxTokens;
    const utilizationPercentage = (totalEstimatedTokens / maxTokens) * 100;

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      totalEstimatedTokens,
      maxTokens,
      inputEstimation,
      fields
    );

    // Determine if truncation is needed
    const truncationRequired = !withinBudget;
    let truncationStrategy: TruncationStrategy | undefined;

    if (truncationRequired) {
      truncationStrategy = this.determineTruncationStrategy(
        totalEstimatedTokens,
        maxTokens,
        fields,
        input.length
      );
    }

    return {
      withinBudget,
      estimatedTokens: totalEstimatedTokens,
      maxTokens,
      utilizationPercentage,
      recommendations,
      truncationRequired,
      truncationStrategy
    };
  }

  estimateTokens(text: string, model?: string): TokenEstimation {
    const modelName = model || this.platformLimits.defaultModel;
    const limits = this.getModelLimits(modelName);
    
    if (!limits) {
      throw new Error(`Model limits not found for: ${modelName}`);
    }

    // Character-based estimation (most common fallback)
    const charCount = text.length;
    const estimatedByChars = Math.ceil(charCount / limits.characterToTokenRatio);

    // Word-based estimation (alternative method)
    const wordCount = text.split(/\s+/).length;
    const estimatedByWords = Math.ceil(wordCount * 1.3); // Average 1.3 tokens per word

    // Use the more conservative estimate
    const estimatedTokens = Math.max(estimatedByChars, estimatedByWords);

    // Adjust for model-specific characteristics
    const adjustedTokens = this.applyModelSpecificAdjustments(
      estimatedTokens,
      this.platformLimits.provider,
      text
    );

    return {
      estimatedTokens: adjustedTokens,
      method: 'character_count',
      confidence: this.calculateEstimationConfidence(text, limits),
      breakdown: {
        prompt: Math.ceil(adjustedTokens * 0.1), // Assume 10% for prompt overhead
        content: Math.ceil(adjustedTokens * 0.85), // 85% for actual content
        metadata: Math.ceil(adjustedTokens * 0.05) // 5% for metadata
      }
    };
  }

  estimatePromptOverhead(fields: ClassifiedField[]): number {
    // Base prompt overhead
    let overhead = 200; // Base instruction tokens
    
    // Add tokens for field descriptions
    overhead += fields.length * 25; // ~25 tokens per field description
    
    // Add tokens for examples
    const fieldsWithExamples = fields.filter(f => f.examples && f.examples.length > 0);
    overhead += fieldsWithExamples.length * 50; // ~50 tokens per example
    
    // Add tokens for complex fields
    const complexFields = fields.filter(f => f.complexity === 'complex');
    overhead += complexFields.length * 30; // Additional instructions for complex fields
    
    // Add tokens for dependencies
    const dependentFields = fields.filter(f => f.dependencies && f.dependencies.length > 0);
    overhead += dependentFields.length * 20; // Dependency descriptions

    return overhead;
  }

  truncateInput(input: string, targetTokens: number, strategy?: TruncationStrategy): string {
    const currentEstimation = this.estimateTokens(input);
    
    if (currentEstimation.estimatedTokens <= targetTokens) {
      return input; // No truncation needed
    }

    const truncationRatio = targetTokens / currentEstimation.estimatedTokens;
    const targetLength = Math.floor(input.length * truncationRatio * 0.9); // 10% safety margin

    const finalStrategy = strategy || {
      method: 'truncate_end',
      targetLength,
      preserveImportant: true
    };

    switch (finalStrategy.method) {
      case 'truncate_end':
        return this.truncateFromEnd(input, targetLength, finalStrategy.preserveImportant);
      
      case 'truncate_middle':
        return this.truncateFromMiddle(input, targetLength);
      
      case 'summarize':
        return this.summarizeContent(input, targetLength);
      
      case 'prioritize_fields':
        return this.prioritizeFieldContent(input, targetLength, finalStrategy.fieldPriorities || []);
      
      case 'remove_examples':
        return this.removeExamples(input, targetLength);
      
      default:
        return this.truncateFromEnd(input, targetLength, true);
    }
  }

  private truncateFromEnd(input: string, targetLength: number, preserveImportant: boolean): string {
    if (input.length <= targetLength) {
      return input;
    }

    let truncated = input.substring(0, targetLength);
    
    if (preserveImportant) {
      // Try to preserve important sections (headers, structured data)
      const importantSections = this.identifyImportantSections(input);
      
      if (importantSections.length > 0) {
        // Ensure important sections are included
        let preservedContent = '';
        let remainingLength = targetLength;
        
        for (const section of importantSections) {
          if (section.content.length <= remainingLength) {
            preservedContent += section.content + '\n';
            remainingLength -= section.content.length + 1;
          }
        }
        
        // Fill remaining space with regular content
        if (remainingLength > 0) {
          const regularContent = input.replace(
            new RegExp(importantSections.map(s => this.escapeRegex(s.content)).join('|'), 'g'),
            ''
          );
          preservedContent += regularContent.substring(0, remainingLength);
        }
        
        truncated = preservedContent;
      }
    }

    // Ensure we don't cut off in the middle of a word
    const lastSpaceIndex = truncated.lastIndexOf(' ');
    if (lastSpaceIndex > targetLength * 0.8) {
      truncated = truncated.substring(0, lastSpaceIndex);
    }

    return truncated + '\n[Content truncated for token limit]';
  }

  private truncateFromMiddle(input: string, targetLength: number): string {
    if (input.length <= targetLength) {
      return input;
    }

    const keepStart = Math.floor(targetLength * 0.4);
    const keepEnd = Math.floor(targetLength * 0.4);
    const markerLength = '\n[... content truncated ...]\n'.length;
    
    const start = input.substring(0, keepStart);
    const end = input.substring(input.length - keepEnd);
    
    return start + '\n[... content truncated ...]\n' + end;
  }

  private summarizeContent(input: string, targetLength: number): string {
    // Simple extractive summarization
    const sentences = input.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    if (sentences.length <= 3) {
      return this.truncateFromEnd(input, targetLength, true);
    }

    // Score sentences by importance (length, position, keywords)
    const scoredSentences = sentences.map((sentence, index) => ({
      sentence: sentence.trim(),
      score: this.scoreSentenceImportance(sentence, index, sentences.length)
    }));

    // Sort by score and select top sentences
    scoredSentences.sort((a, b) => b.score - a.score);
    
    let summary = '';
    let currentLength = 0;
    
    for (const { sentence } of scoredSentences) {
      if (currentLength + sentence.length + 2 <= targetLength) {
        summary += sentence + '. ';
        currentLength += sentence.length + 2;
      } else {
        break;
      }
    }

    return summary + '\n[Content summarized for token limit]';
  }

  private prioritizeFieldContent(input: string, targetLength: number, fieldPriorities: string[]): string {
    if (fieldPriorities.length === 0) {
      return this.truncateFromEnd(input, targetLength, true);
    }

    let prioritizedContent = '';
    let remainingLength = targetLength;

    // Extract content related to high-priority fields first
    for (const fieldName of fieldPriorities) {
      const fieldContent = this.extractFieldRelatedContent(input, fieldName);
      if (fieldContent && fieldContent.length <= remainingLength) {
        prioritizedContent += fieldContent + '\n';
        remainingLength -= fieldContent.length + 1;
      }
    }

    // Fill remaining space with other content
    if (remainingLength > 0) {
      const remainingContent = this.removeFieldSpecificContent(input, fieldPriorities);
      prioritizedContent += remainingContent.substring(0, remainingLength);
    }

    return prioritizedContent + '\n[Content prioritized for token limit]';
  }

  private removeExamples(input: string, targetLength: number): string {
    // Remove example sections and sample data
    let cleaned = input.replace(/example[s]?:[\s\S]*?(?=\n[A-Z]|\n\n|$)/gi, '');
    cleaned = cleaned.replace(/sample[s]?:[\s\S]*?(?=\n[A-Z]|\n\n|$)/gi, '');
    cleaned = cleaned.replace(/for example[:\s][\s\S]*?(?=\n[A-Z]|\n\n|$)/gi, '');
    
    if (cleaned.length <= targetLength) {
      return cleaned + '\n[Examples removed for token limit]';
    }

    return this.truncateFromEnd(cleaned, targetLength, true);
  }

  private identifyImportantSections(input: string): { type: string; content: string; priority: number }[] {
    const sections: { type: string; content: string; priority: number }[] = [];

    // Headers (high priority)
    const headerMatches = input.match(/^[#\*\-=]+.*$/gm) || [];
    headerMatches.forEach(header => {
      sections.push({ type: 'header', content: header, priority: 90 });
    });

    // JSON-like structures (high priority)
    const jsonMatches = input.match(/\{[\s\S]*?\}/g) || [];
    jsonMatches.forEach(json => {
      if (json.length < 500) { // Only small JSON objects
        sections.push({ type: 'json', content: json, priority: 85 });
      }
    });

    // Email headers (medium-high priority)
    const emailHeaders = input.match(/^(From|To|Subject|Date):\s*.+$/gm) || [];
    emailHeaders.forEach(header => {
      sections.push({ type: 'email_header', content: header, priority: 80 });
    });

    // Key-value pairs (medium priority)
    const keyValuePairs = input.match(/^\w+:\s*.+$/gm) || [];
    keyValuePairs.forEach(pair => {
      sections.push({ type: 'key_value', content: pair, priority: 70 });
    });

    return sections.sort((a, b) => b.priority - a.priority);
  }

  private scoreSentenceImportance(sentence: string, index: number, totalSentences: number): number {
    let score = 0;

    // Length score (moderate length preferred)
    const length = sentence.length;
    if (length >= 50 && length <= 200) {
      score += 20;
    } else if (length < 50) {
      score += 5;
    }

    // Position score (first and last sentences are more important)
    if (index === 0) {
      score += 30;
    } else if (index === totalSentences - 1) {
      score += 20;
    } else if (index < totalSentences * 0.3) {
      score += 15;
    }

    // Keyword score
    const importantKeywords = ['important', 'required', 'must', 'should', 'critical', 'essential'];
    const keywordCount = importantKeywords.filter(keyword => 
      sentence.toLowerCase().includes(keyword)
    ).length;
    score += keywordCount * 10;

    // Structure score (sentences with colons, numbers, etc.)
    if (sentence.includes(':')) score += 10;
    if (/\d/.test(sentence)) score += 5;
    if (sentence.includes('@')) score += 15; // Email addresses
    if (sentence.includes('http')) score += 10; // URLs

    return score;
  }

  private extractFieldRelatedContent(input: string, fieldName: string): string | null {
    const patterns = [
      new RegExp(`${fieldName}[:\\s]+([^\\n]+)`, 'i'),
      new RegExp(`"${fieldName}"[:\\s]*"([^"]*)"`, 'i'),
      new RegExp(`<${fieldName}[^>]*>([^<]*)</${fieldName}>`, 'i')
    ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        return match[0];
      }
    }

    return null;
  }

  private removeFieldSpecificContent(input: string, fieldNames: string[]): string {
    let cleaned = input;
    
    for (const fieldName of fieldNames) {
      const patterns = [
        new RegExp(`${fieldName}[:\\s]+[^\\n]+\\n?`, 'gi'),
        new RegExp(`"${fieldName}"[:\\s]*"[^"]*"[,\\n]?`, 'gi'),
        new RegExp(`<${fieldName}[^>]*>[^<]*</${fieldName}>[\\n]?`, 'gi')
      ];

      patterns.forEach(pattern => {
        cleaned = cleaned.replace(pattern, '');
      });
    }

    return cleaned;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private generateRecommendations(
    estimatedTokens: number,
    maxTokens: number,
    estimation: TokenEstimation,
    fields: ClassifiedField[]
  ): string[] {
    const recommendations: string[] = [];
    const utilizationPercentage = (estimatedTokens / maxTokens) * 100;

    if (utilizationPercentage > 90) {
      recommendations.push('Token usage is very high (>90%) - consider input truncation');
    } else if (utilizationPercentage > 75) {
      recommendations.push('Token usage is high (>75%) - monitor for potential limits');
    }

    if (estimation.confidence < 70) {
      recommendations.push('Token estimation has low confidence - actual usage may vary');
    }

    if (fields.length > 20) {
      recommendations.push('Large number of fields detected - consider schema simplification');
    }

    const complexFields = fields.filter(f => f.complexity === 'complex').length;
    if (complexFields > fields.length * 0.5) {
      recommendations.push('Many complex fields detected - may increase prompt size');
    }

    if (estimatedTokens > maxTokens) {
      recommendations.push('Input exceeds token limit - truncation required');
      recommendations.push('Consider using a model with larger context window');
    }

    return recommendations;
  }

  private determineTruncationStrategy(
    currentTokens: number,
    maxTokens: number,
    fields: ClassifiedField[],
    inputLength: number
  ): TruncationStrategy {
    const reductionNeeded = currentTokens - maxTokens;
    const reductionPercentage = reductionNeeded / currentTokens;

    // For small reductions, just truncate the end
    if (reductionPercentage < 0.1) {
      return {
        method: 'truncate_end',
        targetLength: Math.floor(inputLength * 0.9),
        preserveImportant: true
      };
    }

    // For medium reductions, remove examples first
    if (reductionPercentage < 0.3) {
      return {
        method: 'remove_examples',
        targetLength: Math.floor(inputLength * (1 - reductionPercentage - 0.05)),
        preserveImportant: true
      };
    }

    // For large reductions, prioritize important fields
    if (reductionPercentage < 0.5) {
      const highPriorityFields = fields
        .filter(f => f.priority === 'high')
        .map(f => f.name);

      return {
        method: 'prioritize_fields',
        targetLength: Math.floor(inputLength * (1 - reductionPercentage - 0.1)),
        preserveImportant: true,
        fieldPriorities: highPriorityFields
      };
    }

    // For very large reductions, summarize content
    return {
      method: 'summarize',
      targetLength: Math.floor(inputLength * (1 - reductionPercentage - 0.1)),
      preserveImportant: true
    };
  }

  private applyModelSpecificAdjustments(
    baseEstimate: number,
    provider: string,
    text: string
  ): number {
    let adjusted = baseEstimate;

    switch (provider) {
      case 'openai':
        // OpenAI tends to use slightly more tokens for special characters
        if (/[^\x00-\x7F]/.test(text)) {
          adjusted *= 1.1;
        }
        break;

      case 'anthropic':
        // Anthropic is generally efficient with tokenization
        adjusted *= 0.95;
        break;

      case 'google':
        // Google models may use different tokenization
        adjusted *= 1.05;
        break;

      case 'mistral':
        // Mistral tokenization characteristics
        adjusted *= 1.02;
        break;
    }

    return Math.ceil(adjusted);
  }

  private calculateEstimationConfidence(text: string, limits: ModelLimits): number {
    let confidence = 70; // Base confidence

    // Higher confidence for typical text
    if (text.length > 100 && text.length < 10000) {
      confidence += 15;
    }

    // Lower confidence for very short or very long text
    if (text.length < 50 || text.length > 50000) {
      confidence -= 20;
    }

    // Lower confidence for special characters or non-English text
    if (/[^\x00-\x7F]/.test(text)) {
      confidence -= 10;
    }

    // Higher confidence if we have accurate character-to-token ratio
    if (limits.characterToTokenRatio > 0) {
      confidence += 10;
    }

    return Math.max(20, Math.min(confidence, 95));
  }

  private getModelLimits(modelName: string): ModelLimits | null {
    return this.customLimits.get(modelName) || this.platformLimits.models.get(modelName) || null;
  }

  private initializePlatformLimits(provider: 'openai' | 'anthropic' | 'google' | 'mistral'): PlatformLimits {
    const limits: PlatformLimits = {
      provider,
      models: new Map(),
      defaultModel: ''
    };

    switch (provider) {
      case 'openai':
        limits.defaultModel = 'gpt-4o-mini';
        limits.models.set('gpt-4o-mini', {
          maxContextTokens: 128000,
          maxOutputTokens: 16384,
          tokensPerMinute: 200000,
          tokensPerDay: undefined,
          costPer1kTokens: { input: 0.00015, output: 0.0006 },
          characterToTokenRatio: 4
        });
        limits.models.set('gpt-4o', {
          maxContextTokens: 128000,
          maxOutputTokens: 4096,
          tokensPerMinute: 30000,
          tokensPerDay: undefined,
          costPer1kTokens: { input: 0.005, output: 0.015 },
          characterToTokenRatio: 4
        });
        limits.models.set('gpt-3.5-turbo', {
          maxContextTokens: 16385,
          maxOutputTokens: 4096,
          tokensPerMinute: 160000,
          tokensPerDay: undefined,
          costPer1kTokens: { input: 0.0005, output: 0.0015 },
          characterToTokenRatio: 4
        });
        break;

      case 'anthropic':
        limits.defaultModel = 'claude-3-haiku';
        limits.models.set('claude-3-haiku', {
          maxContextTokens: 200000,
          maxOutputTokens: 4096,
          tokensPerMinute: 50000,
          tokensPerDay: undefined,
          costPer1kTokens: { input: 0.00025, output: 0.00125 },
          characterToTokenRatio: 3.5
        });
        limits.models.set('claude-3-sonnet', {
          maxContextTokens: 200000,
          maxOutputTokens: 4096,
          tokensPerMinute: 40000,
          tokensPerDay: undefined,
          costPer1kTokens: { input: 0.003, output: 0.015 },
          characterToTokenRatio: 3.5
        });
        limits.models.set('claude-3-opus', {
          maxContextTokens: 200000,
          maxOutputTokens: 4096,
          tokensPerMinute: 10000,
          tokensPerDay: undefined,
          costPer1kTokens: { input: 0.015, output: 0.075 },
          characterToTokenRatio: 3.5
        });
        break;

      case 'google':
        limits.defaultModel = 'gemini-1.5-flash';
        limits.models.set('gemini-1.5-flash', {
          maxContextTokens: 1048576,
          maxOutputTokens: 8192,
          tokensPerMinute: 2000000,
          tokensPerDay: undefined,
          costPer1kTokens: { input: 0.000075, output: 0.0003 },
          characterToTokenRatio: 4.5
        });
        limits.models.set('gemini-1.5-pro', {
          maxContextTokens: 2097152,
          maxOutputTokens: 8192,
          tokensPerMinute: 360000,
          tokensPerDay: undefined,
          costPer1kTokens: { input: 0.00125, output: 0.005 },
          characterToTokenRatio: 4.5
        });
        break;

      case 'mistral':
        limits.defaultModel = 'mistral-small';
        limits.models.set('mistral-small', {
          maxContextTokens: 32768,
          maxOutputTokens: 4096,
          tokensPerMinute: undefined,
          tokensPerDay: undefined,
          costPer1kTokens: { input: 0.001, output: 0.003 },
          characterToTokenRatio: 4.2
        });
        limits.models.set('mistral-medium', {
          maxContextTokens: 32768,
          maxOutputTokens: 4096,
          tokensPerMinute: undefined,
          tokensPerDay: undefined,
          costPer1kTokens: { input: 0.0025, output: 0.0075 },
          characterToTokenRatio: 4.2
        });
        limits.models.set('mistral-large', {
          maxContextTokens: 32768,
          maxOutputTokens: 4096,
          tokensPerMinute: undefined,
          tokensPerDay: undefined,
          costPer1kTokens: { input: 0.004, output: 0.012 },
          characterToTokenRatio: 4.2
        });
        break;
    }

    return limits;
  }

  private initializeUsageTracking(): UsageTracking {
    return {
      totalTokensUsed: 0,
      totalCost: 0,
      requestCount: 0,
      averageTokensPerRequest: 0,
      peakUsage: 0,
      dailyUsage: new Map(),
      modelUsage: new Map()
    };
  }

  // Public utility methods

  trackUsage(tokens: number, model: string, cost?: number): void {
    this.usageTracking.totalTokensUsed += tokens;
    this.usageTracking.requestCount += 1;
    this.usageTracking.averageTokensPerRequest = 
      this.usageTracking.totalTokensUsed / this.usageTracking.requestCount;

    if (tokens > this.usageTracking.peakUsage) {
      this.usageTracking.peakUsage = tokens;
    }

    if (cost) {
      this.usageTracking.totalCost += cost;
    }

    // Track daily usage
    const today = new Date().toISOString().split('T')[0];
    const dailyTotal = this.usageTracking.dailyUsage.get(today) || 0;
    this.usageTracking.dailyUsage.set(today, dailyTotal + tokens);

    // Track model usage
    const modelTotal = this.usageTracking.modelUsage.get(model) || 0;
    this.usageTracking.modelUsage.set(model, modelTotal + tokens);
  }

  calculateCost(tokens: number, model: string, type: 'input' | 'output' = 'input'): number {
    const limits = this.getModelLimits(model);
    if (!limits?.costPer1kTokens) {
      return 0;
    }

    const costPer1k = type === 'input' ? limits.costPer1kTokens.input : limits.costPer1kTokens.output;
    return (tokens / 1000) * costPer1k;
  }

  getUsageReport(): UsageTracking & { 
    topModels: { model: string; tokens: number }[];
    recentDays: { date: string; tokens: number }[];
  } {
    const topModels = Array.from(this.usageTracking.modelUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([model, tokens]) => ({ model, tokens }));

    const recentDays = Array.from(this.usageTracking.dailyUsage.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 7)
      .map(([date, tokens]) => ({ date, tokens }));

    return {
      ...this.usageTracking,
      topModels,
      recentDays
    };
  }

  addCustomModelLimits(modelName: string, limits: ModelLimits): void {
    this.customLimits.set(modelName, limits);
  }

  removeCustomModelLimits(modelName: string): void {
    this.customLimits.delete(modelName);
  }

  updatePlatformLimits(provider: 'openai' | 'anthropic' | 'google' | 'mistral'): void {
    this.platformLimits = this.initializePlatformLimits(provider);
  }

  getSupportedModels(): string[] {
    const platformModels = Array.from(this.platformLimits.models.keys());
    const customModels = Array.from(this.customLimits.keys());
    return [...platformModels, ...customModels];
  }

  getOptimalModel(
    estimatedTokens: number,
    prioritizeCost: boolean = false,
    requiresLargeOutput: boolean = false
  ): { model: string; reasons: string[] } {
    const availableModels = this.getSupportedModels();
    const candidates: { model: string; score: number; reasons: string[] }[] = [];

    for (const modelName of availableModels) {
      const limits = this.getModelLimits(modelName);
      if (!limits) continue;

      const reasons: string[] = [];
      let score = 0;

      // Check if model can handle the token requirement
      if (estimatedTokens <= limits.maxContextTokens) {
        score += 50;
        reasons.push('Sufficient context window');
      } else {
        continue; // Skip models that can't handle the tokens
      }

      // Output capacity check
      if (requiresLargeOutput && limits.maxOutputTokens >= 4096) {
        score += 20;
        reasons.push('Large output capacity');
      }

      // Cost consideration
      if (prioritizeCost && limits.costPer1kTokens) {
        const cost = limits.costPer1kTokens.input;
        if (cost < 0.001) {
          score += 30;
          reasons.push('Low cost');
        } else if (cost < 0.01) {
          score += 15;
          reasons.push('Moderate cost');
        }
      }

      // Speed consideration (inverse of cost often correlates with speed)
      if (limits.tokensPerMinute && limits.tokensPerMinute > 100000) {
        score += 10;
        reasons.push('High throughput');
      }

      candidates.push({ model: modelName, score, reasons });
    }

    if (candidates.length === 0) {
      return { 
        model: this.platformLimits.defaultModel, 
        reasons: ['Default model - no other models can handle the requirements'] 
      };
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
  }

  healthCheck(): boolean {
    return (
      this.platformLimits.models.size > 0 &&
      this.platformLimits.defaultModel !== '' &&
      this.usageTracking !== null
    );
  }

  resetUsageTracking(): void {
    this.usageTracking = this.initializeUsageTracking();
  }

  exportUsageData(): string {
    return JSON.stringify({
      usage: this.usageTracking,
      platform: this.platformLimits.provider,
      timestamp: new Date().toISOString()
    }, null, 2);
  }

  importUsageData(data: string): void {
    try {
      const parsed = JSON.parse(data);
      if (parsed.usage) {
        this.usageTracking = {
          ...this.usageTracking,
          ...parsed.usage,
          dailyUsage: new Map(Object.entries(parsed.usage.dailyUsage || {})),
          modelUsage: new Map(Object.entries(parsed.usage.modelUsage || {}))
        };
      }
    } catch (error) {
      throw new Error(`Failed to import usage data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export default TokenBudgetManager;