import { SlackDataHandler, SlackIntegration } from '../types'
import { validateSlackIntegration, makeSlackApiRequest } from '../utils'
import allEmojisData from '@/lib/discord/allEmojis.json'

type StandardEmojiEntry = [string, { slug: string; name: string }]

interface SlackEmojiCatalogItem {
  value: string
  label: string
  name: string
  url: string
  isCustom: boolean
  isAlias: boolean
  native?: string
}

const buildStandardEmojiCatalog = (): SlackEmojiCatalogItem[] => {
  return Object.entries(allEmojisData as Record<string, any>).map(([native, data]) => {
    const rawSlug = (data?.slug || data?.name || native).toString()
    const name = rawSlug.replace(/-/g, '_')
    return {
      value: name,
      label: `:${name}:`,
      name,
      url: native,
      native,
      isCustom: false,
      isAlias: false,
    }
  })
}

export const getSlackEmojiCatalog: SlackDataHandler<SlackEmojiCatalogItem> = async (integration: SlackIntegration) => {
  validateSlackIntegration(integration)

  const standardEmojis = buildStandardEmojiCatalog()

  try {
    console.log('😄 [Slack Emoji] Fetching emoji catalog')

    const response = await makeSlackApiRequest(
      'https://slack.com/api/emoji.list',
      integration.access_token
    )

    const data = await response.json()

    if (!data.ok) {
      if (data.error === 'invalid_auth' || data.error === 'token_revoked') {
        throw new Error('Slack authentication expired. Please reconnect your account.')
      }
      if (data.error === 'missing_scope') {
        throw new Error('Slack workspace is missing emoji.list scope. Reinstall the Slack app with emoji access.')
      }
      throw new Error(`Slack API error: ${data.error}`)
    }

    const emojiMap: Record<string, string> = data.emoji || {}

    const customEmojis: SlackEmojiCatalogItem[] = Object.entries(emojiMap).map(([name, urlOrAlias]) => {
      let resolvedUrl = String(urlOrAlias)
      let isAlias = false

      if (resolvedUrl.startsWith('alias:')) {
        isAlias = true
        const aliasName = resolvedUrl.replace('alias:', '')
        const resolved = emojiMap[aliasName]
        if (resolved && typeof resolved === 'string') {
          resolvedUrl = resolved
        }
      }

      const isCustom = resolvedUrl.startsWith('http://') || resolvedUrl.startsWith('https://')

      return {
        value: name,
        label: `:${name}:`,
        name,
        url: resolvedUrl,
        isCustom,
        isAlias,
      }
    })

    const allEmojis = [...standardEmojis, ...customEmojis].sort((a, b) => a.name.localeCompare(b.name))

    console.log(`✅ [Slack Emoji] Retrieved ${allEmojis.length} emoji`)

    return allEmojis
  } catch (error: any) {
    console.error('❌ [Slack Emoji] Failed to load emoji catalog', error)
    if (error instanceof Error && error.message?.includes('authentication')) {
      throw error
    }
    return standardEmojis
  }
}
