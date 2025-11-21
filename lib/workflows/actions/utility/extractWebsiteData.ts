import { ActionResult } from '../core/executeWait';
import { resolveValue } from '../core/resolveValue';
import { logger } from '@/lib/utils/logger';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { optionalImport } from '@/lib/utils/optionalImport';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Supabase client for usage tracking
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Check if user can use browser automation and hasn't exceeded limits
 */
async function checkBrowserAutomationLimits(userId: string): Promise<{
  allowed: boolean;
  reason?: string;
  tier?: string;
  used?: number;
  limit?: number;
}> {
  try {
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('subscription_tier, browser_automation_seconds_used, browser_automation_seconds_limit')
      .eq('user_id', userId)
      .single();

    if (error || !profile) {
      logger.error('[ExtractWebsiteData] Failed to fetch user profile', { error, userId });
      return { allowed: true }; // Fail open - don't block if we can't check
    }

    const tier = profile.subscription_tier || 'free';
    const used = profile.browser_automation_seconds_used || 0;
    const limit = profile.browser_automation_seconds_limit || 1800; // 30 minutes default

    // Pro/Enterprise users have unlimited usage (limit = -1 or very high)
    if (tier === 'pro' || tier === 'enterprise' || limit === -1 || limit > 100000) {
      return { allowed: true, tier };
    }

    // Check if free user has exceeded limit
    if (used >= limit) {
      return {
        allowed: false,
        reason: `Browser automation limit reached. You've used ${Math.floor(used / 60)} of ${Math.floor(limit / 60)} minutes this month. Upgrade to Pro for unlimited usage.`,
        tier,
        used,
        limit
      };
    }

    return { allowed: true, tier, used, limit };
  } catch (error: any) {
    logger.error('[ExtractWebsiteData] Error checking limits', { error: error.message });
    return { allowed: true }; // Fail open
  }
}

/**
 * Track browser automation usage
 */
async function trackBrowserAutomationUsage(
  userId: string,
  durationSeconds: number,
  workflowId?: string,
  executionId?: string,
  hadScreenshot?: boolean,
  hadDynamicContent?: boolean,
  url?: string
): Promise<void> {
  try {
    // Log the usage
    await supabase.from('browser_automation_logs').insert({
      user_id: userId,
      workflow_id: workflowId,
      execution_id: executionId,
      duration_seconds: durationSeconds,
      had_screenshot: hadScreenshot,
      had_dynamic_content: hadDynamicContent,
      url
    });

    // Increment user's usage counter
    await supabase.rpc('increment_browser_automation_usage', {
      p_user_id: userId,
      p_seconds: durationSeconds
    });

    logger.info('[ExtractWebsiteData] Tracked browser automation usage', {
      userId,
      durationSeconds,
      hadScreenshot,
      hadDynamicContent
    });
  } catch (error: any) {
    logger.error('[ExtractWebsiteData] Failed to track usage', { error: error.message });
    // Don't fail the request if tracking fails
  }
}

/**
 * Execute Website Data Extraction
 *
 * Production implementation using:
 * - Cheerio for CSS selector extraction (fast, lightweight)
 * - OpenAI GPT-4 for AI-powered extraction
 * - Puppeteer for dynamic content and screenshots
 *
 * Premium features (dynamic content + screenshots) are gated by subscription tier.
 */
export async function executeExtractWebsiteData(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  const startTime = Date.now();

  try {
    const resolvedConfig = resolveValue(config, input);

    const {
      url,
      extractionMethod = 'ai',
      extractionPrompt,
      cssSelectors,
      userAgent,
      timeout = 30000,
      includeScreenshot = false,
      waitForElement = false,
      waitSelector
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
      usesPuppeteer: waitForElement || includeScreenshot,
      userId
    });

    let html: string;
    let screenshotBase64: string | null = null;
    let puppeteerStartTime: number | null = null;

    // Use Puppeteer for dynamic content or screenshot capture
    if (waitForElement || includeScreenshot) {
      // Check usage limits before using browser automation
      const limitsCheck = await checkBrowserAutomationLimits(userId);

      if (!limitsCheck.allowed) {
        return {
          success: false,
          output: {},
          message: limitsCheck.reason || 'Browser automation limit reached. Upgrade to Pro for unlimited usage.'
        };
      }

      // Log usage info
      if (limitsCheck.tier === 'free') {
        const remaining = (limitsCheck.limit || 1800) - (limitsCheck.used || 0);
        logger.info('[ExtractWebsiteData] Free user browser automation', {
          used: limitsCheck.used,
          limit: limitsCheck.limit,
          remaining: remaining,
          remainingMinutes: Math.floor(remaining / 60)
        });
      }

      try {
        puppeteerStartTime = Date.now();

        const puppeteerResult = await fetchWithPuppeteer(
          url,
          userAgent,
          timeout,
          waitForElement,
          waitSelector,
          includeScreenshot
        );

        html = puppeteerResult.html;
        screenshotBase64 = puppeteerResult.screenshot;

        // Track usage
        const puppeteerDuration = Math.ceil((Date.now() - puppeteerStartTime) / 1000);
        await trackBrowserAutomationUsage(
          userId,
          puppeteerDuration,
          input.workflowId,
          input.executionId,
          includeScreenshot,
          waitForElement,
          url
        );

        logger.info('[ExtractWebsiteData] Fetched HTML with Puppeteer', {
          contentLength: html.length,
          hasScreenshot: !!screenshotBase64,
          durationSeconds: puppeteerDuration
        });
      } catch (puppeteerError: any) {
        logger.warn('[ExtractWebsiteData] Puppeteer failed, falling back to standard fetch', {
          error: puppeteerError.message
        });

        // Fallback to standard fetch if Puppeteer fails
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

        html = await response.text();
        logger.info('[ExtractWebsiteData] Fetched HTML with fallback', {
          contentLength: html.length,
          note: 'Puppeteer unavailable - dynamic content may not be rendered'
        });
      }
    } else {
      // Use standard fetch for static sites
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

      html = await response.text();
      logger.info('[ExtractWebsiteData] Fetched HTML', {
        contentLength: html.length,
        contentType: response.headers.get('content-type')
      });
    }

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

    const output: any = {
      data: extractedData,
      url,
      timestamp: new Date().toISOString(),
      extractionMethod,
      executionTime
    };

    // Include screenshot if captured
    if (screenshotBase64) {
      output.screenshot = screenshotBase64;
      output.screenshotUrl = `data:image/png;base64,${screenshotBase64}`;
    }

    return {
      success: true,
      output,
      message: `Successfully extracted data from ${parsedUrl.hostname} in ${executionTime}ms${screenshotBase64 ? ' (with screenshot)' : ''}`
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
 * Fetch webpage using Puppeteer for dynamic content
 * Supports both local development (puppeteer) and production serverless (@sparticuz/chromium)
 */
async function fetchWithPuppeteer(
  url: string,
  userAgent?: string,
  timeout: number = 30000,
  waitForElement: boolean = false,
  waitSelector?: string,
  includeScreenshot: boolean = false
): Promise<{ html: string; screenshot: string | null }> {
  let browser = null;
  const isProduction = process.env.NODE_ENV === 'production';

  try {
    logger.info('[ExtractWebsiteData] Launching Puppeteer', { isProduction });

    if (isProduction) {
      const puppeteerCoreModule = await optionalImport<typeof import('puppeteer-core')>('puppeteer-core');
      const chromiumModule = await optionalImport<typeof import('@sparticuz/chromium')>('@sparticuz/chromium');

      if (puppeteerCoreModule?.default && chromiumModule?.default) {
        browser = await puppeteerCoreModule.default.launch({
          args: chromiumModule.default.args,
          defaultViewport: chromiumModule.default.defaultViewport,
          executablePath: await chromiumModule.default.executablePath(),
          headless: chromiumModule.default.headless,
        });
      } else {
        logger.warn('[ExtractWebsiteData] Optional Chromium dependencies missing, falling back to bundled Puppeteer');
      }
    }

    if (!browser) {
      const puppeteerModule = await optionalImport<typeof import('puppeteer')>('puppeteer');
      if (!puppeteerModule?.default) {
        throw new Error('Puppeteer is not available. Install "puppeteer" or "@sparticuz/chromium" to enable dynamic content capture.');
      }
      browser = await puppeteerModule.default.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--single-process'
        ]
      });
    }

    const page = await browser.newPage();

    // Set user agent if provided
    if (userAgent) {
      await page.setUserAgent(userAgent);
    }

    // Set viewport for consistent screenshots
    await page.setViewport({ width: 1280, height: 800 });

    // Block unnecessary resources to speed up loading
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      // Block images, stylesheets, fonts unless screenshot is needed
      if (!includeScreenshot && ['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // Navigate to URL with timeout
    await page.goto(url, {
      waitUntil: waitForElement ? 'networkidle2' : 'domcontentloaded', // Faster for static sites
      timeout
    });

    // Wait for specific element if requested
    if (waitForElement && waitSelector) {
      logger.info('[ExtractWebsiteData] Waiting for selector:', waitSelector);
      try {
        await page.waitForSelector(waitSelector, { timeout: Math.min(timeout, 10000) });
      } catch (selectorError) {
        logger.warn('[ExtractWebsiteData] Selector not found, continuing anyway', {
          selector: waitSelector
        });
      }
    } else if (waitForElement) {
      // Wait a bit for JavaScript to execute
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Get HTML content
    const html = await page.content();

    // Capture screenshot if requested
    let screenshot: string | null = null;
    if (includeScreenshot) {
      logger.info('[ExtractWebsiteData] Capturing screenshot');
      try {
        const screenshotBuffer = await page.screenshot({
          type: 'png',
          fullPage: false, // Viewport only - faster and smaller
          quality: 80 // Reduce quality slightly for smaller size
        });
        screenshot = screenshotBuffer.toString('base64');
      } catch (screenshotError: any) {
        logger.warn('[ExtractWebsiteData] Screenshot failed:', screenshotError.message);
        // Continue without screenshot
      }
    }

    // Close browser
    await browser.close();

    return { html, screenshot };

  } catch (error: any) {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        logger.warn('[ExtractWebsiteData] Failed to close browser:', closeError);
      }
    }

    // Provide helpful error messages
    if (error.message.includes('timeout')) {
      throw new Error(`Page load timeout after ${timeout}ms. Try increasing timeout or disabling "Wait for Dynamic Content".`);
    }

    if (error.message.includes('net::ERR_')) {
      throw new Error(`Network error: ${error.message}. Check if the URL is accessible.`);
    }

    throw new Error(`Puppeteer fetch failed: ${error.message}`);
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
