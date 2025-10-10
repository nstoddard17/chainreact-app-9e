import { supabase } from '../supabase-client';
import { createEmbedding, cosineSimilarity } from './embeddings';

export interface MemoryEntry {
  id: string;
  userId: string;
  workflowId?: string;
  nodeId?: string;
  type: 'extraction' | 'user_correction' | 'workflow_pattern' | 'fallback_pattern';
  content: string;
  context: {
    provider?: string;
    action?: string;
    schema?: any[];
    timestamp: string;
    confidence?: number;
    metadata?: Record<string, any>;
  };
  embedding: number[];
  tags: string[];
  relevanceScore?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemorySearchOptions {
  userId: string;
  workflowId?: string;
  type?: MemoryEntry['type'];
  tags?: string[];
  limit?: number;
  minSimilarity?: number;
  timeWindow?: {
    start: Date;
    end: Date;
  };
}

export interface MemoryInsight {
  pattern: string;
  frequency: number;
  confidence: number;
  examples: string[];
  lastSeen: Date;
  relevantTags: string[];
}

export class MemoryManager {
  private embeddingCache = new Map<string, number[]>();
  private readonly EMBEDDING_DIMENSION = 1536; // OpenAI ada-002 dimension
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour

  /**
   * Store a new memory entry with automatic embedding generation
   */
  async storeMemory(entry: Omit<MemoryEntry, 'id' | 'embedding' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      // Generate embedding for the content
      const embedding = await this.getEmbedding(entry.content);
      
      // Extract meaningful tags from context
      const autoTags = this.extractTags(entry);
      const allTags = [...new Set([...entry.tags, ...autoTags])];

      const { data, error } = await supabase
        .from('ai_memory')
        .insert({
          user_id: entry.userId,
          workflow_id: entry.workflowId,
          node_id: entry.nodeId,
          type: entry.type,
          content: entry.content,
          context: entry.context,
          embedding: embedding,
          tags: allTags,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (error) {
        throw error;
      }

      return data.id;

    } catch (error) {
      console.error('Failed to store memory:', error);
      throw error;
    }
  }

  /**
   * Search for relevant memories using semantic similarity
   */
  async searchMemories(query: string, options: MemorySearchOptions): Promise<MemoryEntry[]> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.getEmbedding(query);

      // Build the query
      let dbQuery = supabase
        .from('ai_memory')
        .select('*')
        .eq('user_id', options.userId);

      // Add filters
      if (options.workflowId) {
        dbQuery = dbQuery.eq('workflow_id', options.workflowId);
      }

      if (options.type) {
        dbQuery = dbQuery.eq('type', options.type);
      }

      if (options.tags && options.tags.length > 0) {
        dbQuery = dbQuery.overlaps('tags', options.tags);
      }

      if (options.timeWindow) {
        dbQuery = dbQuery
          .gte('created_at', options.timeWindow.start.toISOString())
          .lte('created_at', options.timeWindow.end.toISOString());
      }

      dbQuery = dbQuery
        .order('created_at', { ascending: false })
        .limit(options.limit || 50);

      const { data, error } = await dbQuery;

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        return [];
      }

      // Calculate similarity scores and filter
      const minSimilarity = options.minSimilarity || 0.7;
      const memories: MemoryEntry[] = data
        .map(record => {
          const similarity = cosineSimilarity(queryEmbedding, record.embedding);
          return {
            id: record.id,
            userId: record.user_id,
            workflowId: record.workflow_id,
            nodeId: record.node_id,
            type: record.type,
            content: record.content,
            context: record.context,
            embedding: record.embedding,
            tags: record.tags,
            relevanceScore: similarity,
            createdAt: new Date(record.created_at),
            updatedAt: new Date(record.updated_at)
          };
        })
        .filter(memory => memory.relevanceScore! >= minSimilarity)
        .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

      return memories;

    } catch (error) {
      console.error('Failed to search memories:', error);
      return [];
    }
  }

  /**
   * Get relevant memories for a specific extraction context
   */
  async getRelevantMemories(
    context: {
      provider: string;
      action: string;
      inputText: string;
      schema: any[];
    },
    userId: string,
    workflowId?: string
  ): Promise<MemoryEntry[]> {
    const searchQuery = `${context.provider} ${context.action} ${context.inputText}`;
    
    const memories = await this.searchMemories(searchQuery, {
      userId,
      workflowId,
      type: 'extraction',
      tags: [context.provider, context.action],
      limit: 10,
      minSimilarity: 0.75
    });

    // Also search for user corrections that might be relevant
    const corrections = await this.searchMemories(searchQuery, {
      userId,
      type: 'user_correction',
      limit: 5,
      minSimilarity: 0.8
    });

    return [...memories, ...corrections];
  }

  /**
   * Store user correction as learning data
   */
  async storeUserCorrection(
    originalExtraction: any,
    correctedExtraction: any,
    context: {
      provider: string;
      action: string;
      inputText: string;
      schema: any[];
      userId: string;
      workflowId?: string;
      nodeId?: string;
    }
  ): Promise<void> {
    const correctionContent = `
Original: ${JSON.stringify(originalExtraction)}
Corrected: ${JSON.stringify(correctedExtraction)}
Input: ${context.inputText}
Schema: ${JSON.stringify(context.schema)}
`;

    await this.storeMemory({
      userId: context.userId,
      workflowId: context.workflowId,
      nodeId: context.nodeId,
      type: 'user_correction',
      content: correctionContent.trim(),
      context: {
        provider: context.provider,
        action: context.action,
        schema: context.schema,
        timestamp: new Date().toISOString(),
        metadata: {
          originalExtraction,
          correctedExtraction
        }
      },
      tags: [context.provider, context.action, 'correction', 'learning']
    });
  }

  /**
   * Store successful workflow patterns for reuse
   */
  async storeWorkflowPattern(
    pattern: {
      inputPattern: string;
      extractionStrategy: string;
      successMetrics: any;
    },
    context: {
      provider: string;
      action: string;
      userId: string;
      workflowId: string;
      confidence: number;
    }
  ): Promise<void> {
    const patternContent = `
Input Pattern: ${pattern.inputPattern}
Strategy: ${pattern.extractionStrategy}
Success Metrics: ${JSON.stringify(pattern.successMetrics)}
`;

    await this.storeMemory({
      userId: context.userId,
      workflowId: context.workflowId,
      type: 'workflow_pattern',
      content: patternContent.trim(),
      context: {
        provider: context.provider,
        action: context.action,
        timestamp: new Date().toISOString(),
        confidence: context.confidence,
        metadata: pattern
      },
      tags: [context.provider, context.action, 'pattern', 'success']
    });
  }

  /**
   * Get insights from stored memories
   */
  async getMemoryInsights(userId: string, workflowId?: string): Promise<MemoryInsight[]> {
    try {
      let query = supabase
        .from('ai_memory')
        .select('*')
        .eq('user_id', userId);

      if (workflowId) {
        query = query.eq('workflow_id', workflowId);
      }

      const { data, error } = await query
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Last 30 days
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        return [];
      }

      // Group by tags and analyze patterns
      const tagPatterns = new Map<string, {
        count: number;
        examples: string[];
        lastSeen: Date;
        avgConfidence: number;
        confidenceSum: number;
      }>();

      data.forEach(record => {
        record.tags.forEach((tag: string) => {
          if (!tagPatterns.has(tag)) {
            tagPatterns.set(tag, {
              count: 0,
              examples: [],
              lastSeen: new Date(record.created_at),
              avgConfidence: 0,
              confidenceSum: 0
            });
          }

          const pattern = tagPatterns.get(tag)!;
          pattern.count++;
          pattern.lastSeen = new Date(Math.max(pattern.lastSeen.getTime(), new Date(record.created_at).getTime()));
          
          if (pattern.examples.length < 3) {
            pattern.examples.push(`${record.content.substring(0, 100) }...`);
          }

          const confidence = record.context.confidence || 50;
          pattern.confidenceSum += confidence;
          pattern.avgConfidence = pattern.confidenceSum / pattern.count;
        });
      });

      // Convert to insights
      const insights: MemoryInsight[] = Array.from(tagPatterns.entries())
        .filter(([_, pattern]) => pattern.count >= 2) // Only patterns that appear multiple times
        .map(([tag, pattern]) => ({
          pattern: tag,
          frequency: pattern.count,
          confidence: pattern.avgConfidence,
          examples: pattern.examples,
          lastSeen: pattern.lastSeen,
          relevantTags: this.getRelatedTags(tag, tagPatterns)
        }))
        .sort((a, b) => b.frequency - a.frequency);

      return insights;

    } catch (error) {
      console.error('Failed to get memory insights:', error);
      return [];
    }
  }

  /**
   * Clean up old memories to manage storage
   */
  async cleanupOldMemories(userId: string, retentionDays: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      const { count, error } = await supabase
        .from('ai_memory')
        .delete()
        .eq('user_id', userId)
        .lt('created_at', cutoffDate.toISOString());

      if (error) {
        throw error;
      }

      return count || 0;

    } catch (error) {
      console.error('Failed to cleanup old memories:', error);
      return 0;
    }
  }

  /**
   * Get or generate embedding for text
   */
  private async getEmbedding(text: string): Promise<number[]> {
    const cacheKey = this.hashText(text);
    
    // Check cache first
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    // Generate new embedding
    const embedding = await createEmbedding(text);
    
    // Cache the result
    this.embeddingCache.set(cacheKey, embedding);
    
    // Clean cache if it gets too large
    if (this.embeddingCache.size > 1000) {
      const keys = Array.from(this.embeddingCache.keys());
      keys.slice(0, 500).forEach(key => this.embeddingCache.delete(key));
    }

    return embedding;
  }

  /**
   * Extract meaningful tags from memory entry context
   */
  private extractTags(entry: Omit<MemoryEntry, 'id' | 'embedding' | 'createdAt' | 'updatedAt'>): string[] {
    const tags: string[] = [];

    // Add provider and action tags
    if (entry.context.provider) {
      tags.push(entry.context.provider);
    }
    if (entry.context.action) {
      tags.push(entry.context.action);
    }

    // Add type-specific tags
    tags.push(entry.type);

    // Extract domain-specific tags from content
    const content = entry.content.toLowerCase();
    
    if (content.includes('email')) tags.push('email');
    if (content.includes('date') || content.includes('time')) tags.push('temporal');
    if (content.includes('name') || content.includes('person')) tags.push('identity');
    if (content.includes('phone') || content.includes('contact')) tags.push('contact');
    if (content.includes('address') || content.includes('location')) tags.push('location');
    if (content.includes('price') || content.includes('cost') || content.includes('$')) tags.push('financial');

    // Add confidence-based tags
    if (entry.context.confidence) {
      if (entry.context.confidence > 90) tags.push('high-confidence');
      else if (entry.context.confidence < 50) tags.push('low-confidence');
    }

    return tags;
  }

  /**
   * Get related tags based on co-occurrence
   */
  private getRelatedTags(
    targetTag: string, 
    tagPatterns: Map<string, any>
  ): string[] {
    // This is a simplified version - in production, you'd want more sophisticated analysis
    const related: string[] = [];
    
    for (const [tag, pattern] of tagPatterns.entries()) {
      if (tag !== targetTag && pattern.count >= 2) {
        related.push(tag);
      }
    }

    return related.slice(0, 3); // Return top 3 related tags
  }

  /**
   * Simple hash function for caching
   */
  private hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  /**
   * Get memory statistics for a user
   */
  async getMemoryStats(userId: string): Promise<{
    totalMemories: number;
    memoriesByType: Record<string, number>;
    memoryTrends: Array<{ date: string; count: number }>;
    avgConfidence: number;
    topTags: Array<{ tag: string; count: number }>;
  }> {
    try {
      const { data, error } = await supabase
        .from('ai_memory')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        return {
          totalMemories: 0,
          memoriesByType: {},
          memoryTrends: [],
          avgConfidence: 0,
          topTags: []
        };
      }

      // Calculate statistics
      const totalMemories = data.length;
      
      const memoriesByType: Record<string, number> = {};
      const tagCounts: Record<string, number> = {};
      let confidenceSum = 0;
      let confidenceCount = 0;

      data.forEach(record => {
        // Count by type
        memoriesByType[record.type] = (memoriesByType[record.type] || 0) + 1;

        // Count tags
        record.tags.forEach((tag: string) => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });

        // Calculate average confidence
        if (record.context.confidence) {
          confidenceSum += record.context.confidence;
          confidenceCount++;
        }
      });

      const avgConfidence = confidenceCount > 0 ? confidenceSum / confidenceCount : 0;

      // Top tags
      const topTags = Object.entries(tagCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([tag, count]) => ({ tag, count }));

      // Memory trends (simplified - group by day)
      const trendData: Record<string, number> = {};
      data.forEach(record => {
        const date = new Date(record.created_at).toISOString().split('T')[0];
        trendData[date] = (trendData[date] || 0) + 1;
      });

      const memoryTrends = Object.entries(trendData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));

      return {
        totalMemories,
        memoriesByType,
        memoryTrends,
        avgConfidence,
        topTags
      };

    } catch (error) {
      console.error('Failed to get memory stats:', error);
      return {
        totalMemories: 0,
        memoriesByType: {},
        memoryTrends: [],
        avgConfidence: 0,
        topTags: []
      };
    }
  }
}

// Export singleton instance
export const memoryManager = new MemoryManager();