import { WebClient } from "@slack/web-api"

let slackClient: WebClient | null = null

export async function getSlackClient(token?: string): Promise<WebClient> {
  if (!slackClient || token) {
    const accessToken = token || process.env.SLACK_BOT_TOKEN

    if (!accessToken) {
      throw new Error("Slack access token is required")
    }

    slackClient = new WebClient(accessToken)
  }

  return slackClient
}

export async function sendSlackMessage(channel: string, text: string, token?: string): Promise<any> {
  const client = await getSlackClient(token)

  return client.chat.postMessage({
    channel,
    text,
  })
}

export async function getSlackChannels(token?: string): Promise<any> {
  const client = await getSlackClient(token)

  return client.conversations.list({
    types: "public_channel,private_channel",
  })
}

export async function getSlackUsers(token?: string): Promise<any> {
  const client = await getSlackClient(token)

  return client.users.list()
}
