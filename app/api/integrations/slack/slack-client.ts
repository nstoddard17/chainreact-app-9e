interface SlackConfig {
  accessToken: string
}

interface SlackMessage {
  channel: string
  text: string
  blocks?: any[]
  attachments?: any[]
  thread_ts?: string
}

interface SlackChannel {
  id: string
  name: string
  is_private: boolean
  is_member: boolean
}

interface SlackUser {
  id: string
  name: string
  real_name: string
  email?: string
}

class SlackClient {
  private accessToken: string
  private baseUrl = "https://slack.com/api"

  constructor(config: SlackConfig) {
    this.accessToken = config.accessToken
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}/${endpoint}`
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

    const data = await response.json()
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`)
    }

    return data
  }

  // Message methods
  async sendMessage(message: SlackMessage) {
    return this.makeRequest("chat.postMessage", {
      method: "POST",
      body: JSON.stringify(message),
    })
  }

  async updateMessage(channel: string, ts: string, text: string) {
    return this.makeRequest("chat.update", {
      method: "POST",
      body: JSON.stringify({ channel, ts, text }),
    })
  }

  async deleteMessage(channel: string, ts: string) {
    return this.makeRequest("chat.delete", {
      method: "POST",
      body: JSON.stringify({ channel, ts }),
    })
  }

  // Channel methods
  async getChannels(): Promise<SlackChannel[]> {
    const response = await this.makeRequest("conversations.list")
    return response.channels || []
  }

  async getChannel(channelId: string) {
    return this.makeRequest(`conversations.info?channel=${channelId}`)
  }

  async createChannel(name: string, isPrivate = false) {
    return this.makeRequest("conversations.create", {
      method: "POST",
      body: JSON.stringify({ name, is_private: isPrivate }),
    })
  }

  // User methods
  async getUsers(): Promise<SlackUser[]> {
    const response = await this.makeRequest("users.list")
    return response.members || []
  }

  async getUser(userId: string) {
    return this.makeRequest(`users.info?user=${userId}`)
  }

  // File methods
  async uploadFile(file: File, channels: string[], title?: string) {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("channels", channels.join(","))
    if (title) formData.append("title", title)

    return fetch(`${this.baseUrl}/files.upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: formData,
    }).then((res) => res.json())
  }

  // Workspace info
  async getWorkspaceInfo() {
    return this.makeRequest("team.info")
  }
}

export function getSlackClient(accessToken: string): SlackClient {
  return new SlackClient({ accessToken })
}

export type { SlackMessage, SlackChannel, SlackUser }
