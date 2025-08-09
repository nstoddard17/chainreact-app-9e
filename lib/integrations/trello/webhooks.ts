import { createClient } from '@supabase/supabase-js'
import { getWebhookUrl } from '@/lib/utils/getBaseUrl'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function trelloFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Trello API error ${res.status}: ${t}`)
  }
  return res.json()
}

export async function registerTrelloWebhooksForUser(userId: string) {
  // Get user's Trello OAuth key/token from integrations table
  const { data: integ } = await supabase
    .from('integrations')
    .select('external_key, access_token')
    .eq('user_id', userId)
    .eq('provider', 'trello')
    .single()
  if (!integ) return

  const key = integ.external_key
  const token = integ.access_token
  const callbackURL = `${getWebhookUrl('trello')}`

  // List boards the user is a member of
  const boards = await trelloFetch(`https://api.trello.com/1/members/me/boards?key=${key}&token=${token}`)

  for (const b of boards) {
    // Create webhook for each board
    try {
      await trelloFetch(`https://api.trello.com/1/webhooks/?key=${key}&token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callbackURL, idModel: b.id, description: `ChainReact board ${b.name}` })
      })
    } catch (e) {
      // ignore duplicates
      // eslint-disable-next-line no-console
      console.warn('trello webhook create warn', e)
    }
  }
}


