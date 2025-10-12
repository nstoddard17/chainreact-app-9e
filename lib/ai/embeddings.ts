import { logger } from '@/lib/utils/logger'

/**
 * Embeddings utilities for semantic search and similarity matching
 */

interface EmbeddingProvider {
  createEmbedding(text: string): Promise<number[]>;
  getDimensions(): number;
  getName(): string;
}

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string;
  private model: string;
  private baseURL: string;

  constructor(apiKey: string, model: string = 'text-embedding-ada-002') {
    this.apiKey = apiKey;
    this.model = model;
    this.baseURL = 'https://api.openai.com/v1';
  }

  async createEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.baseURL}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          input: text.replace(/\n/g, ' ').trim()
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.data || !data.data[0] || !data.data[0].embedding) {
        throw new Error('Invalid response from OpenAI embeddings API');
      }

      return data.data[0].embedding;

    } catch (error) {
      logger.error('Failed to create OpenAI embedding:', error);
      throw error;
    }
  }

  getDimensions(): number {
    switch (this.model) {
      case 'text-embedding-ada-002':
        return 1536;
      case 'text-embedding-3-small':
        return 1536;
      case 'text-embedding-3-large':
        return 3072;
      default:
        return 1536;
    }
  }

  getName(): string {
    return `openai-${this.model}`;
  }
}

class LocalEmbeddingProvider implements EmbeddingProvider {
  // Fallback provider using simple TF-IDF-like vectors for offline use
  private vocabulary: Map<string, number> = new Map();
  private idfScores: Map<string, number> = new Map();
  private dimensions: number = 300;

  constructor(dimensions: number = 300) {
    this.dimensions = dimensions;
  }

  async createEmbedding(text: string): Promise<number[]> {
    // Simple bag-of-words with TF-IDF-like weighting
    const words = this.tokenize(text);
    const wordCounts = new Map<string, number>();
    
    // Count word frequencies
    words.forEach(word => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    });

    // Create embedding vector
    const embedding = new Array(this.dimensions).fill(0);
    const totalWords = words.length;

    wordCounts.forEach((count, word) => {
      const tf = count / totalWords;
      const idf = this.getIDF(word);
      const weight = tf * idf;
      
      // Hash word to embedding dimension
      const index = this.hashToDimension(word);
      embedding[index] += weight;
    });

    // Normalize vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getName(): string {
    return 'local-tfidf';
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);
  }

  private getIDF(word: string): number {
    // Simple IDF approximation - in practice, you'd train this on a corpus
    if (this.idfScores.has(word)) {
      return this.idfScores.get(word)!;
    }

    // Approximate IDF based on word characteristics
    let idf = 1.0;
    
    // Common words get lower IDF
    const commonWords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'has', 'have', 'him', 'his', 'how', 'was', 'one', 'our', 'out', 'day', 'get', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use']);
    
    if (commonWords.has(word)) {
      idf = 0.1;
    } else if (word.length > 8) {
      idf = 2.0; // Longer words are often more specific
    } else if (word.length > 5) {
      idf = 1.5;
    }

    this.idfScores.set(word, idf);
    return idf;
  }

  private hashToDimension(word: string): number {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash + word.charCodeAt(i)) & 0xffffffff;
    }
    return Math.abs(hash) % this.dimensions;
  }
}

// Global embedding provider
let embeddingProvider: EmbeddingProvider;

/**
 * Initialize the embedding provider
 */
export function initializeEmbeddings(config: {
  provider: 'openai' | 'local';
  apiKey?: string;
  model?: string;
  dimensions?: number;
}): void {
  switch (config.provider) {
    case 'openai':
      if (!config.apiKey) {
        throw new Error('OpenAI API key is required');
      }
      embeddingProvider = new OpenAIEmbeddingProvider(config.apiKey, config.model);
      break;
    case 'local':
      embeddingProvider = new LocalEmbeddingProvider(config.dimensions);
      break;
    default:
      throw new Error(`Unknown embedding provider: ${config.provider}`);
  }
}

/**
 * Create an embedding for the given text
 */
export async function createEmbedding(text: string): Promise<number[]> {
  if (!embeddingProvider) {
    // Auto-initialize with local provider if none set
    initializeEmbeddings({ provider: 'local' });
  }

  if (!text || text.trim().length === 0) {
    return new Array(embeddingProvider.getDimensions()).fill(0);
  }

  return embeddingProvider.createEmbedding(text);
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i];
    magnitudeA += vectorA[i] * vectorA[i];
    magnitudeB += vectorB[i] * vectorB[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Calculate Euclidean distance between two vectors
 */
export function euclideanDistance(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    throw new Error('Vectors must have the same length');
  }

  let sum = 0;
  for (let i = 0; i < vectorA.length; i++) {
    const diff = vectorA[i] - vectorB[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * Find the most similar vectors to a query vector
 */
export function findMostSimilar(
  queryVector: number[],
  vectors: Array<{ vector: number[]; data: any }>,
  limit: number = 10,
  minSimilarity: number = 0.5
): Array<{ similarity: number; data: any }> {
  const similarities = vectors
    .map(item => ({
      similarity: cosineSimilarity(queryVector, item.vector),
      data: item.data
    }))
    .filter(item => item.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return similarities;
}

/**
 * Cluster vectors using k-means
 */
export function clusterVectors(
  vectors: number[][],
  k: number = 5,
  maxIterations: number = 100
): Array<{ centroid: number[]; members: number[] }> {
  if (vectors.length === 0 || k <= 0) {
    return [];
  }

  const dimensions = vectors[0].length;
  
  // Initialize centroids randomly
  let centroids: number[][] = [];
  for (let i = 0; i < k; i++) {
    const centroid = new Array(dimensions);
    for (let j = 0; j < dimensions; j++) {
      centroid[j] = Math.random() - 0.5;
    }
    centroids.push(centroid);
  }

  let assignments = new Array(vectors.length).fill(0);
  
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Assign each vector to the nearest centroid
    const newAssignments = vectors.map((vector, index) => {
      let bestCluster = 0;
      let bestDistance = euclideanDistance(vector, centroids[0]);
      
      for (let j = 1; j < k; j++) {
        const distance = euclideanDistance(vector, centroids[j]);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestCluster = j;
        }
      }
      
      return bestCluster;
    });

    // Check for convergence
    let hasChanged = false;
    for (let i = 0; i < assignments.length; i++) {
      if (assignments[i] !== newAssignments[i]) {
        hasChanged = true;
        break;
      }
    }

    assignments = newAssignments;

    if (!hasChanged) {
      break;
    }

    // Update centroids
    const newCentroids: number[][] = [];
    for (let j = 0; j < k; j++) {
      const clusterVectors = vectors.filter((_, index) => assignments[index] === j);
      
      if (clusterVectors.length === 0) {
        // Keep the old centroid if no vectors assigned
        newCentroids.push([...centroids[j]]);
        continue;
      }

      const centroid = new Array(dimensions).fill(0);
      clusterVectors.forEach(vector => {
        for (let d = 0; d < dimensions; d++) {
          centroid[d] += vector[d];
        }
      });

      for (let d = 0; d < dimensions; d++) {
        centroid[d] /= clusterVectors.length;
      }

      newCentroids.push(centroid);
    }

    centroids = newCentroids;
  }

  // Build result clusters
  const clusters: Array<{ centroid: number[]; members: number[] }> = [];
  for (let j = 0; j < k; j++) {
    const members = assignments
      .map((assignment, index) => assignment === j ? index : -1)
      .filter(index => index !== -1);

    clusters.push({
      centroid: centroids[j],
      members
    });
  }

  return clusters.filter(cluster => cluster.members.length > 0);
}

/**
 * Reduce vector dimensions using PCA (simplified version)
 */
export function reduceDimensions(
  vectors: number[][],
  targetDimensions: number
): number[][] {
  if (vectors.length === 0 || targetDimensions <= 0) {
    return [];
  }

  const originalDimensions = vectors[0].length;
  if (targetDimensions >= originalDimensions) {
    return vectors;
  }

  // Simplified PCA - just take the first N dimensions
  // In a real implementation, you'd calculate principal components
  return vectors.map(vector => vector.slice(0, targetDimensions));
}

/**
 * Get the current embedding provider info
 */
export function getEmbeddingProviderInfo(): {
  name: string;
  dimensions: number;
} | null {
  if (!embeddingProvider) {
    return null;
  }

  return {
    name: embeddingProvider.getName(),
    dimensions: embeddingProvider.getDimensions()
  };
}

/**
 * Batch create embeddings for multiple texts
 */
export async function createEmbeddingsBatch(
  texts: string[],
  batchSize: number = 10
): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchPromises = batch.map(text => createEmbedding(text));
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
}

// Auto-initialize with environment variables if available
if (typeof process !== 'undefined' && process.env) {
  const openaiKey = process.env.OPENAI_API_KEY || process.env.SMART_AI_API_KEY;
  
  if (openaiKey) {
    try {
      initializeEmbeddings({
        provider: 'openai',
        apiKey: openaiKey,
        model: process.env.SMART_AI_EMBEDDING_MODEL || 'text-embedding-ada-002'
      });
    } catch (error) {
      logger.warn('Failed to initialize OpenAI embeddings, falling back to local:', error);
      initializeEmbeddings({ provider: 'local' });
    }
  } else {
    // Use local embeddings as fallback
    initializeEmbeddings({ provider: 'local' });
  }
}