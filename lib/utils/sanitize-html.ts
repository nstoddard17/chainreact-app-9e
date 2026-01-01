/**
 * HTML Sanitization Utility
 *
 * Provides DOMPurify-based sanitization for user-provided HTML content
 * to prevent XSS (Cross-Site Scripting) attacks.
 *
 * @see CLAUDE.md Security section
 */

import DOMPurify from 'dompurify';

/**
 * Default DOMPurify configuration for safe HTML rendering
 */
const DEFAULT_CONFIG: DOMPurify.Config = {
  // Allow safe HTML tags
  ALLOWED_TAGS: [
    'a', 'abbr', 'address', 'article', 'aside', 'b', 'bdi', 'bdo', 'blockquote',
    'br', 'caption', 'cite', 'code', 'col', 'colgroup', 'data', 'dd', 'del',
    'details', 'dfn', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'ins',
    'kbd', 'li', 'main', 'mark', 'nav', 'ol', 'p', 'pre', 'q', 'rp', 'rt',
    'ruby', 's', 'samp', 'section', 'small', 'span', 'strong', 'sub', 'summary',
    'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'u',
    'ul', 'var', 'wbr', 'font'
  ],
  // Allow safe attributes
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'class', 'id', 'style', 'target', 'rel',
    'width', 'height', 'colspan', 'rowspan', 'scope', 'data-*', 'aria-*',
    'role', 'tabindex', 'color', 'face', 'size', 'align', 'valign', 'bgcolor',
    'border', 'cellpadding', 'cellspacing'
  ],
  // Force all links to open in new tab and have safe rel
  ADD_ATTR: ['target', 'rel'],
  // Allow data URIs for images (base64 embedded images)
  ALLOW_DATA_ATTR: true,
  // Keep safe URI schemes
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

/**
 * Email-specific configuration with more permissive styling
 */
const EMAIL_CONFIG: DOMPurify.Config = {
  ...DEFAULT_CONFIG,
  // Allow inline styles commonly used in emails
  ALLOW_UNKNOWN_PROTOCOLS: false,
  // Don't strip style attributes (needed for email formatting)
  FORBID_ATTR: [],
};

/**
 * Strict configuration for minimal HTML (comments, descriptions)
 */
const STRICT_CONFIG: DOMPurify.Config = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'br', 'p', 'span'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
};

/**
 * Sanitizes HTML content to prevent XSS attacks
 *
 * @param html - The HTML string to sanitize
 * @param config - Optional DOMPurify configuration
 * @returns Sanitized HTML string safe for rendering
 *
 * @example
 * ```tsx
 * // Basic usage
 * const safeHtml = sanitizeHtml(userProvidedHtml);
 *
 * // With custom config
 * const safeHtml = sanitizeHtml(html, { ALLOWED_TAGS: ['p', 'br'] });
 * ```
 */
export function sanitizeHtml(html: string, config?: DOMPurify.Config): string {
  if (!html) return '';

  // Use server-side compatible check
  if (typeof window === 'undefined') {
    // On server, return empty or strip all HTML as fallback
    // DOMPurify requires DOM, so we do basic stripping server-side
    return html.replace(/<[^>]*>/g, '');
  }

  return DOMPurify.sanitize(html, config || DEFAULT_CONFIG);
}

/**
 * Sanitizes HTML specifically for email content
 * More permissive to allow email formatting
 */
export function sanitizeEmailHtml(html: string): string {
  if (!html) return '';

  if (typeof window === 'undefined') {
    return html.replace(/<script[^>]*>.*?<\/script>/gi, '');
  }

  return DOMPurify.sanitize(html, EMAIL_CONFIG);
}

/**
 * Strict sanitization for user comments, descriptions, etc.
 * Only allows basic formatting tags
 */
export function sanitizeStrictHtml(html: string): string {
  if (!html) return '';

  if (typeof window === 'undefined') {
    return html.replace(/<[^>]*>/g, '');
  }

  return DOMPurify.sanitize(html, STRICT_CONFIG);
}

/**
 * Strips all HTML tags, returning plain text
 */
export function stripHtml(html: string): string {
  if (!html) return '';

  if (typeof window === 'undefined') {
    return html.replace(/<[^>]*>/g, '');
  }

  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [] });
}

/**
 * Creates a sanitized props object for dangerouslySetInnerHTML
 *
 * @example
 * ```tsx
 * <div {...createSafeHtmlProps(userHtml)} />
 * ```
 */
export function createSafeHtmlProps(html: string, config?: DOMPurify.Config) {
  return {
    dangerouslySetInnerHTML: { __html: sanitizeHtml(html, config) }
  };
}

/**
 * Creates sanitized email HTML props
 */
export function createSafeEmailHtmlProps(html: string) {
  return {
    dangerouslySetInnerHTML: { __html: sanitizeEmailHtml(html) }
  };
}

export default sanitizeHtml;
