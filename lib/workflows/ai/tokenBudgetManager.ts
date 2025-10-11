/**
 * Token Budget Awareness System
 * 
 * Manages token usage, platform-specific length limits, content splitting,
 * and character count validation for optimal AI generation.
 */

export interface TokenBudget {
  platform: string;
  fieldType: string;
  maxTokens: number;
  maxCharacters: number;
  reservedTokens: number; // For system/formatting tokens
  contentTokens: number; // Available for actual content
  splitThreshold: number; // When to split content
  compressionRatio: number; // Expected chars per token
}

export interface ContentChunk {
  content: string;
  tokenCount: number;
  characterCount: number;
  index: number;
  isComplete: boolean;
  continuationHint?: string;
}

export interface SplitResult {
  chunks: ContentChunk[];
  totalTokens: number;
  requiresThreading: boolean;
  platform: string;
  splitStrategy: string;
}

export interface PlatformLimits {
  name: string;
  characterLimit: number;
  tokenLimit?: number;
  threadingSupport: boolean;
  continuationFormat: string;
  splitStrategy: 'sentence' | 'paragraph' | 'word' | 'character';
  preserveFormatting: boolean;
}

/**
 * Token Budget Manager for platform-aware content generation
 */
export class TokenBudgetManager {
  
  // Platform-specific limits and configurations
  private static readonly PLATFORM_LIMITS: Record<string, PlatformLimits> = {
    twitter: {
      name: 'Twitter',
      characterLimit: 280,
      tokenLimit: 70, // Approximate tokens
      threadingSupport: true,
      continuationFormat: '🧵 (1/{total})',
      splitStrategy: 'sentence',
      preserveFormatting: false
    },
    slack: {
      name: 'Slack',
      characterLimit: 4000,
      tokenLimit: 1000,
      threadingSupport: true,
      continuationFormat: '(continued...)',
      splitStrategy: 'paragraph',
      preserveFormatting: true
    },
    discord: {
      name: 'Discord',
      characterLimit: 2000,
      tokenLimit: 500,
      threadingSupport: false,
      continuationFormat: '(cont.)',
      splitStrategy: 'sentence',
      preserveFormatting: true
    },
    gmail: {
      name: 'Gmail',
      characterLimit: 100000, // Practical limit
      tokenLimit: 25000,
      threadingSupport: false,
      continuationFormat: '',
      splitStrategy: 'paragraph',
      preserveFormatting: true
    },
    github: {
      name: 'GitHub',
      characterLimit: 65536, // Issue/PR body limit
      tokenLimit: 16000,
      threadingSupport: false,
      continuationFormat: '',
      splitStrategy: 'paragraph',
      preserveFormatting: true
    },
    linkedin: {
      name: 'LinkedIn',
      characterLimit: 3000,
      tokenLimit: 750,
      threadingSupport: false,
      continuationFormat: '...',
      splitStrategy: 'sentence',
      preserveFormatting: false
    },
    sms: {
      name: 'SMS',
      characterLimit: 160,
      tokenLimit: 40,
      threadingSupport: true,
      continuationFormat: '({current}/{total})',
      splitStrategy: 'word',
      preserveFormatting: false
    }
  };

  // Field-specific token budgets
  private static readonly FIELD_BUDGETS: Record<string, Partial<TokenBudget>> = {
    subject: {
      maxCharacters: 78, // Email subject best practice
      maxTokens: 20,
      reservedTokens: 2,
      splitThreshold: 60
    },
    title: {
      maxCharacters: 256,
      maxTokens: 64,
      reservedTokens: 4,
      splitThreshold: 200
    },
    body: {
      maxCharacters: -1, // Platform dependent
      maxTokens: -1, // Platform dependent
      reservedTokens: 10,
      splitThreshold: 0.8 // 80% of limit
    },
    message: {
      maxCharacters: -1, // Platform dependent
      maxTokens: -1, // Platform dependent
      reservedTokens: 5,
      splitThreshold: 0.9 // 90% of limit
    },
    description: {
      maxCharacters: 500,
      maxTokens: 125,
      reservedTokens: 5,
      splitThreshold: 400
    },
    tags: {
      maxCharacters: 100,
      maxTokens: 25,
      reservedTokens: 2,
      splitThreshold: 80
    }
  };

  /**
   * Calculate token budget for a specific field and platform
   */
  static calculateTokenBudget(fieldType: string, platform: string): TokenBudget {
    const platformLimits = this.PLATFORM_LIMITS[platform];
    const fieldBudget = this.FIELD_BUDGETS[fieldType] || this.FIELD_BUDGETS.message;
    
    if (!platformLimits) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    // Calculate effective limits
    const maxCharacters = fieldBudget.maxCharacters === -1 
      ? platformLimits.characterLimit 
      : Math.min(fieldBudget.maxCharacters!, platformLimits.characterLimit);
      
    const maxTokens = fieldBudget.maxTokens === -1
      ? (platformLimits.tokenLimit || Math.floor(maxCharacters / 4))
      : Math.min(fieldBudget.maxTokens!, platformLimits.tokenLimit || maxCharacters / 4);

    const reservedTokens = fieldBudget.reservedTokens || 5;
    const contentTokens = Math.max(0, maxTokens - reservedTokens);
    
    const splitThreshold = typeof fieldBudget.splitThreshold === 'number' && fieldBudget.splitThreshold < 1
      ? Math.floor(maxCharacters * fieldBudget.splitThreshold)
      : (fieldBudget.splitThreshold as number) || Math.floor(maxCharacters * 0.8);

    return {
      platform,
      fieldType,
      maxTokens,
      maxCharacters,
      reservedTokens,
      contentTokens,
      splitThreshold,
      compressionRatio: 4 // Average characters per token
    };
  }

  /**
   * Estimate token count from text
   */
  static estimateTokenCount(text: string): number {
    // Simple estimation: ~4 characters per token for English text
    // In production, use a proper tokenizer like tiktoken
    const baseCount = Math.ceil(text.length / 4);
    
    // Adjust for special characters and formatting
    const specialChars = (text.match(/[^\w\s]/g) || []).length;
    const whitespace = (text.match(/\s/g) || []).length;
    
    return baseCount + Math.floor(specialChars * 0.5) - Math.floor(whitespace * 0.25);
  }

  /**
   * Validate content against token budget
   */
  static validateTokenBudget(
    content: string, 
    budget: TokenBudget
  ): { valid: boolean; tokenCount: number; characterCount: number; exceedsBy: number } {
    const tokenCount = this.estimateTokenCount(content);
    const characterCount = content.length;
    
    const exceedsTokens = Math.max(0, tokenCount - budget.maxTokens);
    const exceedsChars = Math.max(0, characterCount - budget.maxCharacters);
    const exceedsBy = Math.max(exceedsTokens, exceedsChars);
    
    return {
      valid: exceedsBy === 0,
      tokenCount,
      characterCount,
      exceedsBy
    };
  }

  /**
   * Split content into chunks that fit within platform limits
   */
  static splitContent(
    content: string,
    platform: string,
    fieldType: string = 'message'
  ): SplitResult {
    const budget = this.calculateTokenBudget(fieldType, platform);
    const platformLimits = this.PLATFORM_LIMITS[platform];
    
    if (!platformLimits) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    // Check if splitting is needed
    const validation = this.validateTokenBudget(content, budget);
    if (validation.valid) {
      return {
        chunks: [{
          content,
          tokenCount: validation.tokenCount,
          characterCount: validation.characterCount,
          index: 0,
          isComplete: true
        }],
        totalTokens: validation.tokenCount,
        requiresThreading: false,
        platform,
        splitStrategy: 'none'
      };
    }

    // Perform splitting based on platform strategy
    const chunks = this.performSplit(content, budget, platformLimits);
    const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0);

    return {
      chunks,
      totalTokens,
      requiresThreading: chunks.length > 1 && platformLimits.threadingSupport,
      platform,
      splitStrategy: platformLimits.splitStrategy
    };
  }

  /**
   * Perform content splitting based on strategy
   */
  private static performSplit(
    content: string,
    budget: TokenBudget,
    platformLimits: PlatformLimits
  ): ContentChunk[] {
    const chunks: ContentChunk[] = [];
    let remaining = content;
    let index = 0;

    // Reserve space for continuation indicators
    const continuationOverhead = platformLimits.continuationFormat.length;
    const effectiveLimit = budget.maxCharacters - continuationOverhead;

    while (remaining.length > 0) {
      let chunkContent = '';
      const chunkSize = 0;

      switch (platformLimits.splitStrategy) {
        case 'sentence':
          chunkContent = this.splitBySentence(remaining, effectiveLimit);
          break;
        case 'paragraph':
          chunkContent = this.splitByParagraph(remaining, effectiveLimit);
          break;
        case 'word':
          chunkContent = this.splitByWord(remaining, effectiveLimit);
          break;
        case 'character':
          chunkContent = this.splitByCharacter(remaining, effectiveLimit);
          break;
        default:
          chunkContent = this.splitBySentence(remaining, effectiveLimit);
      }

      // Add continuation indicator if not the last chunk
      const willHaveMore = remaining.length > chunkContent.length;
      if (willHaveMore && platformLimits.continuationFormat) {
        chunkContent += ` ${platformLimits.continuationFormat}`;
      }

      chunks.push({
        content: chunkContent,
        tokenCount: this.estimateTokenCount(chunkContent),
        characterCount: chunkContent.length,
        index,
        isComplete: !willHaveMore,
        continuationHint: willHaveMore ? platformLimits.continuationFormat : undefined
      });

      remaining = remaining.substring(chunkContent.length - (willHaveMore ? platformLimits.continuationFormat.length + 1 : 0));
      index++;
    }

    return chunks;
  }

  /**
   * Split by sentence boundaries
   */
  private static splitBySentence(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;

    const sentences = text.split(/[.!?]+\s+/);
    let result = '';
    
    for (const sentence of sentences) {
      const potential = result + (result ? '. ' : '') + sentence;
      if (potential.length > maxLength) {
        break;
      }
      result = potential;
    }

    return result || text.substring(0, maxLength);
  }

  /**
   * Split by paragraph boundaries
   */
  private static splitByParagraph(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;

    const paragraphs = text.split(/\n\s*\n/);
    let result = '';
    
    for (const paragraph of paragraphs) {
      const potential = result + (result ? '\n\n' : '') + paragraph;
      if (potential.length > maxLength) {
        break;
      }
      result = potential;
    }

    return result || text.substring(0, maxLength);
  }

  /**
   * Split by word boundaries
   */
  private static splitByWord(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;

    const words = text.split(/\s+/);
    let result = '';
    
    for (const word of words) {
      const potential = result + (result ? ' ' : '') + word;
      if (potential.length > maxLength) {
        break;
      }
      result = potential;
    }

    return result || text.substring(0, maxLength);
  }

  /**
   * Split by character count (hard truncation)
   */
  private static splitByCharacter(text: string, maxLength: number): string {
    return text.substring(0, maxLength);
  }

  /**
   * Generate continuation prompts for multi-part content
   */
  static generateContinuationPrompt(
    originalPrompt: string,
    previousChunks: ContentChunk[],
    remainingContent: string,
    budget: TokenBudget
  ): string {
    const chunkContext = previousChunks.map((chunk, i) => 
      `Part ${i + 1}: "${chunk.content.substring(0, 100)}..."`
    ).join('\n');

    return `Continue generating content for the same field. 

PREVIOUS PARTS:
${chunkContext}

REMAINING TO COVER:
"${remainingContent.substring(0, 200)}..."

CONSTRAINTS:
- Maximum ${budget.maxCharacters} characters
- Maximum ${budget.maxTokens} tokens
- Maintain consistency with previous parts
- This is part ${previousChunks.length + 1} of the content

Generate the next part:`;
  }

  /**
   * Optimize content for token budget
   */
  static optimizeForBudget(
    content: string,
    budget: TokenBudget,
    optimization: 'compress' | 'truncate' | 'split' = 'compress'
  ): { optimized: string; strategy: string; tokensSaved: number } {
    const originalTokens = this.estimateTokenCount(content);
    
    if (originalTokens <= budget.maxTokens) {
      return {
        optimized: content,
        strategy: 'no_optimization',
        tokensSaved: 0
      };
    }

    let optimized: string;
    let strategy: string;

    switch (optimization) {
      case 'compress':
        optimized = this.compressContent(content, budget);
        strategy = 'compression';
        break;
      case 'truncate':
        optimized = this.truncateContent(content, budget);
        strategy = 'truncation';
        break;
      case 'split':
        // Return first chunk only for single-field optimization
        const splitResult = this.splitContent(content, budget.platform, budget.fieldType);
        optimized = splitResult.chunks[0]?.content || content;
        strategy = 'splitting';
        break;
      default:
        optimized = content;
        strategy = 'none';
    }

    const optimizedTokens = this.estimateTokenCount(optimized);
    const tokensSaved = originalTokens - optimizedTokens;

    return {
      optimized,
      strategy,
      tokensSaved
    };
  }

  /**
   * Compress content by removing redundancy
   */
  private static compressContent(content: string, budget: TokenBudget): string {
    let compressed = content;

    // Remove extra whitespace
    compressed = compressed.replace(/\s+/g, ' ').trim();
    
    // Remove redundant phrases
    compressed = compressed.replace(/\b(very|really|quite|pretty|rather)\s+/gi, '');
    compressed = compressed.replace(/\b(in order to|in order that)\b/gi, 'to');
    compressed = compressed.replace(/\b(due to the fact that|owing to the fact that)\b/gi, 'because');
    
    // Compress common phrases
    compressed = compressed.replace(/\b(as a result of)\b/gi, 'from');
    compressed = compressed.replace(/\b(in the event that)\b/gi, 'if');
    compressed = compressed.replace(/\b(at this point in time)\b/gi, 'now');
    
    // If still too long, use more aggressive compression
    const currentTokens = this.estimateTokenCount(compressed);
    if (currentTokens > budget.maxTokens) {
      // Remove adjectives and adverbs
      compressed = compressed.replace(/\b\w+ly\b/g, ''); // Remove adverbs
      compressed = compressed.replace(/\s+/g, ' ').trim(); // Clean up spaces
    }

    return compressed;
  }

  /**
   * Truncate content to fit budget
   */
  private static truncateContent(content: string, budget: TokenBudget): string {
    const targetLength = Math.floor(budget.maxTokens * budget.compressionRatio * 0.9);
    
    if (content.length <= targetLength) {
      return content;
    }

    // Try to truncate at sentence boundary
    const truncated = content.substring(0, targetLength);
    const lastSentence = truncated.lastIndexOf('.');
    const lastQuestion = truncated.lastIndexOf('?');
    const lastExclamation = truncated.lastIndexOf('!');
    
    const lastPunctuation = Math.max(lastSentence, lastQuestion, lastExclamation);
    
    if (lastPunctuation > targetLength * 0.7) {
      return truncated.substring(0, lastPunctuation + 1);
    }

    // Fallback to word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > targetLength * 0.8) {
      return `${truncated.substring(0, lastSpace) }...`;
    }

    return `${truncated }...`;
  }

  /**
   * Get platform-specific formatting guidelines
   */
  static getPlatformGuidelines(platform: string): {
    recommendations: string[];
    constraints: string[];
    formatting: string[];
  } {
    const platformLimits = this.PLATFORM_LIMITS[platform];
    
    if (!platformLimits) {
      return {
        recommendations: ['Keep content concise and clear'],
        constraints: ['No specific platform constraints'],
        formatting: ['Use plain text formatting']
      };
    }

    const guidelines = {
      recommendations: [
        `Keep under ${platformLimits.characterLimit} characters`,
        `Use ${platformLimits.splitStrategy} breaks for readability`
      ],
      constraints: [
        `Hard limit: ${platformLimits.characterLimit} characters`,
        `Soft limit: ${Math.floor(platformLimits.characterLimit * 0.8)} characters recommended`
      ],
      formatting: [
        platformLimits.preserveFormatting ? 'Formatting preserved' : 'Plain text only'
      ]
    };

    // Platform-specific recommendations
    switch (platform) {
      case 'twitter':
        guidelines.recommendations.push('Use hashtags strategically', 'Consider thread if longer');
        guidelines.formatting.push('Emojis encouraged', 'No markdown support');
        break;
      case 'slack':
        guidelines.recommendations.push('Use threads for long discussions', 'Emojis add engagement');
        guidelines.formatting.push('Markdown supported', 'Code blocks available');
        break;
      case 'discord':
        guidelines.recommendations.push('Use embeds for rich content', 'Keep messages conversational');
        guidelines.formatting.push('Markdown supported', 'Embed formatting available');
        break;
      case 'gmail':
        guidelines.recommendations.push('Professional tone', 'Clear subject line');
        guidelines.formatting.push('HTML supported', 'Rich text available');
        break;
    }

    return guidelines;
  }
}