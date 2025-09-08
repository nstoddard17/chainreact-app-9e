import fetch from 'node-fetch'

const API_URL = process.env.DEBUG_API_URL || 'http://localhost:3000/api/dev/generate-workflow-debug'

const PROMPT = process.argv.slice(2).join(' ') || `I need help setting up something for our Discord server. We get a lot of messages in our support channel and it's getting overwhelming to manage. I want the bot to automatically read new messages and figure out what kind of help people need. Like if someone's reporting a bug, it should create a ticket somewhere and let them know we got it. If it's just a regular question, it should try to answer it. If someone says something is urgent or broken, it needs to alert our team right away. And for feature requests, maybe it could save those somewhere so we don't forget about them. Basically I want it to be smart enough to know what to do with different types of messages - like having different response paths depending on what people are asking about. Can it do all that automatically when someone posts in our Discord channel?`

async function main() {
  console.log('🔍 Generating workflow with debug mode...')
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: PROMPT, model: 'gpt-4o-mini', debug: true })
  })

  if (!res.ok) {
    console.error('❌ Request failed:', res.status, await res.text())
    process.exit(1)
  }

  const data = await res.json()

  console.log('\n✅ Request OK. Debug mode response received.')
  console.log('\n— Model:', data.debug?.model)
  console.log('— Detected Scenarios:', data.debug?.detectedScenarios?.join(', '))

  console.log('\n🧩 System Prompt (truncated):\n')
  console.log((data.debug?.systemPrompt || '').slice(0, 600))

  console.log('\n👤 User Prompt (constructed):\n')
  console.log(data.debug?.userPrompt || '')

  console.log('\n📦 Raw OpenAI Response (truncated):\n')
  console.log((data.debug?.rawResponse || '').slice(0, 800))

  console.log('\n🗺️  Generated Workflow (summary):')
  const gw = data.generated
  console.log('- Name:', gw?.name)
  console.log('- Nodes:', gw?.nodes?.length)
  const ai = gw?.nodes?.find(n => n?.data?.type === 'ai_agent')
  console.log('- AI Chains:', ai?.data?.config?.chains?.length || 0)
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
