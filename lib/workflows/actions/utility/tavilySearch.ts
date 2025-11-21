import { ActionResult } from '../core/executeWait';
import { resolveValue } from '../core/resolveValue';
import { logger } from '@/lib/utils/logger';

/**
 * Execute Tavily Search
 *
 * Production implementation using Tavily AI Search API.
 *
 * API Setup:
 * 1. Sign up at https://tavily.com
 * 2. Get API key from dashboard
 * 3. Set TAVILY_API_KEY environment variable
 *
 * API Endpoint: https://api.tavily.com/search
 * Features:
 * - AI-optimized search results
 * - Relevance scoring (0-1)
 * - Optional AI-generated answer summaries
 * - Domain filtering (include/exclude)
 * - Time range filtering
 * - Multiple search depths (basic/advanced)
 *
 * Docs: https://docs.tavily.com/
 */
export async function executeTavilySearch(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  const startTime = Date.now();

  try {
    const resolvedConfig = resolveValue(config, input);

    const {
      query,
      searchDepth = 'basic',
      maxResults = 5,
      includeAnswer = true,
      timeRange,
      includeDomains = [],
      excludeDomains = [],
      includeRawContent = false,
      includeImages = false,
      searchLanguage
    } = resolvedConfig;

    if (!query) {
      return {
        success: false,
        output: {},
        message: 'Search query is required'
      };
    }

    // Check for API key
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      logger.error('[TavilySearch] TAVILY_API_KEY not configured');
      return {
        success: false,
        output: {},
        message: 'Tavily API key not configured. Set TAVILY_API_KEY environment variable.'
      };
    }

    logger.info('[TavilySearch] Executing search', {
      query,
      searchDepth,
      maxResults,
      includeAnswer,
      userId
    });

    // Parse domain filters
    const includeDomainsArray = includeDomains
      ? includeDomains.split(',').map((d: string) => d.trim()).filter(Boolean)
      : [];
    const excludeDomainsArray = excludeDomains
      ? excludeDomains.split(',').map((d: string) => d.trim()).filter(Boolean)
      : [];

    // Build Tavily API request
    const requestBody: any = {
      api_key: apiKey,
      query,
      search_depth: searchDepth,
      max_results: Math.min(maxResults, 10),
      include_answer: includeAnswer,
      include_raw_content: includeRawContent || false,
      include_images: includeImages || false
    };

    // Add optional filters
    if (includeDomainsArray.length > 0) {
      requestBody.include_domains = includeDomainsArray;
    }
    if (excludeDomainsArray.length > 0) {
      requestBody.exclude_domains = excludeDomainsArray;
    }
    if (timeRange && timeRange !== 'any') {
      requestBody.days = timeRange === 'day' ? 1 : timeRange === 'week' ? 7 : timeRange === 'month' ? 30 : timeRange === 'year' ? 365 : undefined;
    }

    // Call Tavily API
    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('[TavilySearch] API error', {
          status: response.status,
          error: errorText
        });

        if (response.status === 401) {
          return {
            success: false,
            output: {},
            message: 'Tavily API key is invalid. Check your TAVILY_API_KEY.'
          };
        }

        if (response.status === 429) {
          return {
            success: false,
            output: {},
            message: 'Tavily API rate limit exceeded. Please try again later.'
          };
        }

        return {
          success: false,
          output: {},
          message: `Tavily API error: ${response.status} ${response.statusText}`
        };
      }

      const data = await response.json();
      const executionTime = Date.now() - startTime;

      // Parse Tavily response
      const output: any = {
        results: data.results || [],
        query,
        searchDepth,
        resultCount: (data.results || []).length,
        responseTime: executionTime
      };

      // Add answer if included
      if (includeAnswer && data.answer) {
        output.answer = data.answer;
      }

      // Add images if included
      if (includeImages && data.images) {
        output.images = data.images;
      }

      // Add filter information
      if (includeDomainsArray.length > 0) {
        output.includedDomains = includeDomainsArray;
      }
      if (excludeDomainsArray.length > 0) {
        output.excludedDomains = excludeDomainsArray;
      }

      logger.info('[TavilySearch] Search completed', {
        resultCount: output.resultCount,
        executionTime
      });

      return {
        success: true,
        output,
        message: `Found ${output.resultCount} AI-optimized results for "${query}" in ${executionTime}ms`
      };

    } catch (fetchError: any) {
      logger.error('[TavilySearch] Fetch error:', fetchError);
      return {
        success: false,
        output: {},
        message: `Failed to connect to Tavily API: ${fetchError.message}`
      };
    }

  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    logger.error('[TavilySearch] Search error:', error);

    return {
      success: false,
      output: {
        error: error.message,
        executionTime
      },
      message: `Tavily search failed: ${error.message}`
    };
  }
}
