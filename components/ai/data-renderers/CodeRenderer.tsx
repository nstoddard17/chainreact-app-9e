"use client"

import React, { useState } from "react"
import { Code as CodeIcon, Copy, Check } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { sanitizeHtml } from "@/lib/utils/sanitize-html"

interface CodeRendererProps {
  code: string
  language?: string
  fileName?: string
  lineNumbers?: boolean
  className?: string
  maxHeight?: string
  highlightLines?: number[]
}

export function CodeRenderer({
  code,
  language = "text",
  fileName,
  lineNumbers = true,
  className,
  maxHeight = "600px",
  highlightLines = []
}: CodeRendererProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const lines = code.split('\n')

  // Simple syntax highlighting (basic implementation)
  const highlightSyntax = (line: string, lang: string): JSX.Element => {
    // This is a very basic syntax highlighter
    // For production, consider using a library like prism-react-renderer or highlight.js

    const keywords = [
      'function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return',
      'class', 'interface', 'type', 'import', 'export', 'from', 'default',
      'async', 'await', 'try', 'catch', 'throw', 'new', 'this', 'extends',
      'public', 'private', 'protected', 'static', 'readonly'
    ]

    // First, escape HTML entities in the input to prevent XSS
    let highlighted = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')

    // Comments
    if (lang === 'javascript' || lang === 'typescript' || lang === 'jsx' || lang === 'tsx') {
      highlighted = highlighted.replace(/(\/\/.*$)/g, '<span class="text-gray-500 italic">$1</span>')
      highlighted = highlighted.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="text-gray-500 italic">$1</span>')
    } else if (lang === 'python') {
      highlighted = highlighted.replace(/(#.*$)/g, '<span class="text-gray-500 italic">$1</span>')
    }

    // Strings (match escaped quotes)
    highlighted = highlighted.replace(/(&quot;.*?&quot;|&#039;.*?&#039;|`.*?`)/g, '<span class="text-green-600 dark:text-green-400">$1</span>')

    // Numbers
    highlighted = highlighted.replace(/\b(\d+)\b/g, '<span class="text-blue-600 dark:text-blue-400">$1</span>')

    // Keywords
    keywords.forEach(keyword => {
      const regex = new RegExp(`\\b(${keyword})\\b`, 'g')
      highlighted = highlighted.replace(regex, '<span class="text-purple-600 dark:text-purple-400 font-semibold">$1</span>')
    })

    // Sanitize the final output to ensure only our span tags are allowed
    const sanitized = sanitizeHtml(highlighted, {
      ALLOWED_TAGS: ['span'],
      ALLOWED_ATTR: ['class']
    })

    return <span dangerouslySetInnerHTML={{ __html: sanitized }} />
  }

  const getLanguageLabel = (lang: string) => {
    const labels: Record<string, string> = {
      'javascript': 'JavaScript',
      'typescript': 'TypeScript',
      'jsx': 'JSX',
      'tsx': 'TSX',
      'python': 'Python',
      'java': 'Java',
      'cpp': 'C++',
      'csharp': 'C#',
      'go': 'Go',
      'rust': 'Rust',
      'ruby': 'Ruby',
      'php': 'PHP',
      'html': 'HTML',
      'css': 'CSS',
      'json': 'JSON',
      'yaml': 'YAML',
      'markdown': 'Markdown',
      'bash': 'Bash',
      'sql': 'SQL'
    }

    return labels[lang.toLowerCase()] || lang.toUpperCase()
  }

  return (
    <div className={cn("mt-3 space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CodeIcon className="w-5 h-5 text-primary" />
          {fileName && (
            <span className="font-medium text-sm font-mono">{fileName}</span>
          )}
          <Badge variant="secondary" className="text-xs">
            {getLanguageLabel(language)}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {lines.length} {lines.length === 1 ? 'line' : 'lines'}
          </Badge>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={handleCopy}
          className="h-8 text-xs"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 mr-1" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 mr-1" />
              Copy
            </>
          )}
        </Button>
      </div>

      {/* Code Display */}
      <Card className="overflow-hidden">
        <div
          className="overflow-auto bg-slate-50 dark:bg-slate-900"
          style={{ maxHeight }}
        >
          <table className="w-full font-mono text-xs">
            <tbody>
              {lines.map((line, index) => (
                <tr
                  key={index}
                  className={cn(
                    "hover:bg-muted/50 transition-colors",
                    highlightLines.includes(index + 1) && "bg-yellow-100 dark:bg-yellow-900/20"
                  )}
                >
                  {lineNumbers && (
                    <td className="px-4 py-1 text-right text-muted-foreground select-none border-r w-12">
                      {index + 1}
                    </td>
                  )}
                  <td className="px-4 py-1 whitespace-pre">
                    {highlightSyntax(line, language)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
