import TurndownService from 'turndown'

type FormatTarget = 'slack'

const slackTurndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  emDelimiter: '_',
  strongDelimiter: '*',
  codeBlockStyle: 'fenced'
})

slackTurndown.addRule('strikethrough', {
  filter: ['del', 's'],
  replacement: (content) => `~${content}~`
})

slackTurndown.keep(['table', 'thead', 'tbody', 'tr', 'td', 'th'])

function looksLikeHTML(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '  ')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function convertHtmlToSlackMarkdown(html: string): string {
  const markdown = slackTurndown.turndown(html)
  return normalizeWhitespace(markdown)
}

export function formatRichTextForTarget(value: unknown, target: FormatTarget): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return typeof value === 'string' ? value : undefined
  }

  // Preserve workflow variables so they can resolve later
  if (value.includes('{{') && value.includes('}}')) {
    return value
  }

  switch (target) {
    case 'slack': {
      if (looksLikeHTML(value)) {
        return convertHtmlToSlackMarkdown(value)
      }
      return normalizeWhitespace(value)
    }
    default:
      return value
  }
}
