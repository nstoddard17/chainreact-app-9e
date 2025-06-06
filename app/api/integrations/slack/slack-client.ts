interface SlackConfig {
  accessToken: string
  teamId?: string
}

export class SlackClient {
  private accessToken: string
  private teamId?: string

  constructor(config: SlackConfig) {
    this.accessToken = config.accessToken
    this.teamId = config.teamId
  }

  async makeRequest(endpoint: string, options: RequestInit = {}) {
    const url = `https://slack.com/api/${endpoint}`

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    })

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  async postMessage(channel: string, text: string) {
    return this.makeRequest("chat.postMessage", {
      method: "POST",
      body: JSON.stringify({
        channel,
        text,
      }),
    })
  }

  async getChannels() {
    return this.makeRequest("conversations.list")
  }

  async getUserInfo() {
    return this.makeRequest("auth.test")
  }
}

export function getSlackClient(config: SlackConfig): SlackClient {
  return new SlackClient(config)
}
