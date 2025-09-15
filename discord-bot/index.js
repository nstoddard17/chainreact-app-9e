#!/usr/bin/env node

/**
 * Standalone Discord Bot Service for ChainReact
 *
 * This runs as a separate process/service to maintain the persistent
 * WebSocket connection required by Discord, which isn't compatible
 * with serverless environments like Vercel.
 *
 * Deploy this to a service that supports long-running processes:
 * - Heroku
 * - Railway
 * - Render
 * - DigitalOcean App Platform
 * - AWS EC2 / ECS
 * - Google Cloud Run (with always-on instances)
 */

require('dotenv').config();
const WebSocket = require('ws');

class DiscordBotService {
  constructor() {
    this.ws = null;
    this.botToken = process.env.DISCORD_BOT_TOKEN;
    this.webhookUrl = process.env.CHAINREACT_WEBHOOK_URL || process.env.NEXT_PUBLIC_APP_URL;
    this.heartbeatInterval = null;
    this.heartbeatAck = true;
    this.sequence = null;
    this.sessionId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.isConnected = false;
  }

  async connect() {
    if (!this.botToken) {
      console.error('DISCORD_BOT_TOKEN not configured');
      process.exit(1);
    }

    if (!this.webhookUrl) {
      console.error('CHAINREACT_WEBHOOK_URL or NEXT_PUBLIC_APP_URL not configured');
      process.exit(1);
    }

    console.log(`🤖 Starting Discord Bot Service`);
    console.log(`📡 Will send events to: ${this.webhookUrl}`);

    try {
      // Get Gateway URL
      const response = await fetch('https://discord.com/api/v10/gateway/bot', {
        headers: {
          'Authorization': `Bot ${this.botToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get gateway URL: ${response.status}`);
      }

      const data = await response.json();
      const gatewayUrl = `${data.url}?v=10&encoding=json`;

      // Connect to Gateway
      this.ws = new WebSocket(gatewayUrl);

      this.ws.on('open', () => this.handleOpen());
      this.ws.on('message', (data) => this.handleMessage(data));
      this.ws.on('close', (code, reason) => this.handleClose(code, reason));
      this.ws.on('error', (error) => this.handleError(error));

    } catch (error) {
      console.error('Failed to connect to Discord:', error);
      this.scheduleReconnect();
    }
  }

  handleOpen() {
    console.log('✅ Connected to Discord Gateway');
    this.isConnected = true;
    this.reconnectAttempts = 0;
  }

  handleMessage(data) {
    const payload = JSON.parse(data);

    switch (payload.op) {
      case 10: // Hello
        this.handleHello(payload.d);
        break;
      case 11: // Heartbeat ACK
        this.heartbeatAck = true;
        break;
      case 0: // Dispatch
        this.sequence = payload.s;
        this.handleDispatch(payload.t, payload.d);
        break;
      case 1: // Heartbeat request
        this.sendHeartbeat();
        break;
      case 7: // Reconnect
        console.log('Discord requested reconnection');
        this.reconnect();
        break;
      case 9: // Invalid session
        console.log('Invalid session, reconnecting...');
        this.sessionId = null;
        setTimeout(() => this.sendIdentify(), 5000);
        break;
    }
  }

  handleHello(data) {
    // Start heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (!this.heartbeatAck) {
        console.error('Heartbeat timeout, reconnecting...');
        this.ws.close(1000);
        return;
      }
      this.heartbeatAck = false;
      this.sendHeartbeat();
    }, data.heartbeat_interval);

    // Send identify or resume
    if (this.sessionId) {
      this.sendResume();
    } else {
      this.sendIdentify();
    }
  }

  handleDispatch(eventType, eventData) {
    switch (eventType) {
      case 'READY':
        this.sessionId = eventData.session_id;
        console.log(`🎉 Discord bot ready! Session: ${this.sessionId}`);
        break;
      case 'RESUMED':
        console.log('Session resumed');
        break;
      case 'MESSAGE_CREATE':
        this.handleMessageCreate(eventData);
        break;
    }
  }

  async handleMessageCreate(messageData) {
    // Ignore bot messages
    if (messageData.author?.bot) {
      return;
    }

    console.log(`📨 New message in channel ${messageData.channel_id}: ${messageData.content?.substring(0, 50)}...`);

    try {
      // Send to ChainReact webhook endpoint
      const response = await fetch(`${this.webhookUrl}/api/workflow/discord`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Discord-Bot': 'true',
          'User-Agent': 'ChainReact-Discord-Bot/1.0'
        },
        body: JSON.stringify(messageData)
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Webhook delivered successfully:`, result);
      } else {
        console.error(`❌ Webhook delivery failed: ${response.status}`);
        const errorText = await response.text().catch(() => 'No error details');
        console.error('Error details:', errorText);
      }
    } catch (error) {
      console.error('Failed to send webhook:', error);
    }
  }

  handleClose(code, reason) {
    console.log(`Discord connection closed: ${code} - ${reason}`);
    this.isConnected = false;
    this.cleanup();

    if (code !== 1000) { // Not a normal closure
      this.scheduleReconnect();
    }
  }

  handleError(error) {
    console.error('Discord WebSocket error:', error);
  }

  sendHeartbeat() {
    this.send({ op: 1, d: this.sequence });
  }

  sendIdentify() {
    const intents =
      (1 << 0) | // GUILDS
      (1 << 9) | // GUILD_MESSAGES
      (1 << 15); // MESSAGE_CONTENT

    const identify = {
      token: this.botToken,
      properties: {
        os: 'linux',
        browser: 'ChainReact',
        device: 'ChainReact'
      },
      presence: {
        status: 'online',
        since: null,
        activities: [
          {
            name: 'workflows',
            type: 0 // Playing
          }
        ],
        afk: false
      },
      intents: intents
    };

    this.send({ op: 2, d: identify });
  }

  sendResume() {
    this.send({
      op: 6,
      d: {
        token: this.botToken,
        session_id: this.sessionId,
        seq: this.sequence
      }
    });
  }

  send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  cleanup() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached. Exiting...');
      process.exit(1);
    }

    this.reconnectAttempts++;
    const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts - 1), 300000);

    console.log(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay / 1000}s`);
    setTimeout(() => this.reconnect(), delay);
  }

  async reconnect() {
    this.cleanup();
    await this.connect();
  }

  // Health check endpoint
  startHealthServer() {
    const http = require('http');
    const port = process.env.PORT || 3002;

    const server = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: this.isConnected ? 'healthy' : 'unhealthy',
          connected: this.isConnected,
          sessionId: this.sessionId,
          reconnectAttempts: this.reconnectAttempts,
          timestamp: new Date().toISOString()
        }));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(port, () => {
      console.log(`📊 Health check server listening on port ${port}`);
    });
  }
}

// Start the bot
const bot = new DiscordBotService();
bot.connect();
bot.startHealthServer();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  bot.cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  bot.cleanup();
  process.exit(0);
});