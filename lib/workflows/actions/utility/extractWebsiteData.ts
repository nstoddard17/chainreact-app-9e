import { ActionResult } from '../core/executeWait';
import { resolveValue } from '../core/resolveValue';
import { logger } from '@/lib/utils/logger';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Execute Website Data Extraction
 *
 * Production implementation using:
 * - Cheerio for CSS selector extraction (fast, lightweight)
 * - OpenAI GPT-4 for AI-powered extraction
 * - Native fetch for HTTP requests
 *
 * This works for 90% of websites. For JavaScript-heavy sites,
 * consider adding Puppeteer as a fallback.
 */
export async function executeExtractWebsiteData(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  const startTime = Date.now();

  try {
    const resolvedConfig = resolveValue(config, { input });

    const {
      url,
      extractionMethod = 'ai',
      extractionPrompt,
      cssSelectors,
      userAgent,
      timeout = 30000,
      includeScreenshot = false
    } = resolvedConfig;

    if (!url) {
      return {
        success: false,
        output: {},
        message: 'URL is required'
      };
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return {
        success: false,
        output: {},
        message: 'Invalid URL format. Must include http:// or https://'
      };
    }

    // Validate extraction method requirements
    if (extractionMethod === 'css' && (!cssSelectors || Object.keys(cssSelectors).length === 0)) {
      return {
        success: false,
        output: {},
        message: 'CSS selectors are required for CSS extraction method'
      };
    }

    if (extractionMethod === 'ai' && !extractionPrompt) {
      return {
        success: false,
        output: {},
        message: 'Extraction prompt is required for AI extraction method'
      };
    }

    logger.info('[ExtractWebsiteData] Fetching website', {
      url,
      extractionMethod,
      userId
    });

    // Fetch the webpage with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent || 'Mozilla/5.0 (compatible; ChainReact/1.0; +https://chainreact.app)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        output: {},
        message: `Failed to fetch URL: ${response.status} ${response.statusText}`
      };
    }

    const html = await response.text();
    logger.info('[ExtractWebsiteData] Fetched HTML', {
      contentLength: html.length,
      contentType: response.headers.get('content-type')
    });

    let extractedData: any;

    // Extract using appropriate method
    if (extractionMethod === 'css') {
      // CSS Selector extraction using Cheerio
      extractedData = await extractWithCss(html, cssSelectors);
      logger.info('[ExtractWebsiteData] CSS extraction completed', {
        fieldsExtracted: Object.keys(extractedData).length
      });
    } else {
      // AI extraction using OpenAI
      if (!process.env.OPENAI_API_KEY) {
        return {
          success: false,
          output: {},
          message: 'OpenAI API key not configured. Set OPENAI_API_KEY environment variable.'
        };
      }

      extractedData = await extractWithAI(html, extractionPrompt, url);
      logger.info('[ExtractWebsiteData] AI extraction completed');
    }

    const executionTime = Date.now() - startTime;

    return {
      success: true,
      output: {
        data: extractedData,
        url,
        timestamp: new Date().toISOString(),
        extractionMethod,
        executionTime
      },
      message: `Successfully extracted data from ${parsedUrl.hostname} in ${executionTime}ms`
    };

  } catch (error: any) {
    const executionTime = Date.now() - startTime;

    // Handle specific error types
    if (error.name === 'AbortError') {
      logger.error('[ExtractWebsiteData] Request timeout', { error });
      return {
        success: false,
        output: { error: 'Request timeout', executionTime },
        message: 'Website request timed out. The site may be slow or unreachable.'
      };
    }

    if (error.code === 'ENOTFOUND') {
      logger.error('[ExtractWebsiteData] DNS lookup failed', { error });
      return {
        success: false,
        output: { error: 'DNS lookup failed', executionTime },
        message: 'Could not find the website. Please check the URL.'
      };
    }

    logger.error('[ExtractWebsiteData] Extraction error:', error);
    return {
      success: false,
      output: {
        error: error.message,
        executionTime
      },
      message: `Website extraction failed: ${error.message}`
    };
  }
}

/**
 * Extract data using CSS selectors with Cheerio
 */
async function extractWithCss(
  html: string,
  selectors: Record<string, string>
): Promise<Record<string, any>> {
  const $ = cheerio.load(html);
  const extracted: Record<string, any> = {};

  for (const [fieldName, selector] of Object.entries(selectors)) {
    try {
      const elements = $(selector);

      if (elements.length === 0) {
        extracted[fieldName] = null;
        logger.warn(`[ExtractWebsiteData] No elements found for selector: ${selector}`);
      } else if (elements.length === 1) {
        // Single element - return as string
        extracted[fieldName] = elements.text().trim();
      } else {
        // Multiple elements - return as array
        extracted[fieldName] = elements.map((i, el) => $(el).text().trim()).get();
      }
    } catch (error: any) {
      logger.error(`[ExtractWebsiteData] Error extracting ${fieldName}:`, error);
      extracted[fieldName] = null;
    }
  }

  return extracted;
}

/**
 * Extract data using OpenAI GPT-4
 */
async function extractWithAI(
  html: string,
  extractionPrompt: string,
  url: string
): Promise<any> {
  // Clean HTML for better AI processing (remove scripts, styles)
  const $ = cheerio.load(html);
  $('script').remove();
  $('style').remove();
  $('noscript').remove();

  // Get text content and limit size for API
  const cleanedHtml = $.html();
  const htmlToSend = cleanedHtml.length > 100000
    ? cleanedHtml.substring(0, 100000) + '\n[...HTML truncated for length...]'
    : cleanedHtml;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are a web scraping assistant. Extract the requested data from HTML and return it as valid JSON. Be precise and only extract what is asked. If data is not found, use null for that field.'
        },
        {
          role: 'user',
          content: `URL: ${url}\n\nExtract the following data:\n${extractionPrompt}\n\nHTML:\n${htmlToSend}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1, // Low temperature for more consistent extraction
      max_tokens: 2000
    });

    const extractedText = completion.choices[0].message.content;
    if (!extractedText) {
      throw new Error('OpenAI returned empty response');
    }

    const extracted = JSON.parse(extractedText);
    return extracted;

  } catch (error: any) {
    logger.error('[ExtractWebsiteData] OpenAI extraction error:', error);

    if (error.code === 'insufficient_quota') {
      throw new Error('OpenAI API quota exceeded. Please check your billing.');
    }

    if (error.message?.includes('JSON')) {
      throw new Error('Failed to parse AI response. Try being more specific in your extraction prompt.');
    }

    throw new Error(`AI extraction failed: ${error.message}`);
  }
}
