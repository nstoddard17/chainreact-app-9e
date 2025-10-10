# Cloudflare Tunnel Development Setup

This guide explains how to set up a permanent development URL that doesn't change like ngrok.

## Why This Setup?

- **Permanent URLs**: No more updating webhooks when restarting development
- **Multi-developer support**: Each developer gets their own subdomain
- **Zero production impact**: Only affects development subdomains
- **Free**: Cloudflare Tunnel is completely free
- **Professional**: Use your actual domain (dev-nathan.chainreact.app)

## Assigned Subdomains

- Nathan: `dev-nathan.chainreact.app`
- Marcus: `dev-marcus.chainreact.app`
- Shared/Testing: `dev.chainreact.app`

## Initial Setup (One-Time)

### 1. Install Cloudflared

**macOS:**
```bash
brew install cloudflared
```

**Windows:**
```bash
winget install --id Cloudflare.cloudflared
# Or download from: https://github.com/cloudflare/cloudflared/releases
```

### 2. Authenticate

```bash
cloudflared tunnel login
```

### 3. Create Your Tunnel

Replace `yourname` with your actual name:
```bash
cloudflared tunnel create chainreact-yourname
```

Save the tunnel ID shown in the output!

### 4. Configure Your Tunnel

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: YOUR-TUNNEL-ID-HERE
credentials-file: /Users/YOUR-USERNAME/.cloudflared/YOUR-TUNNEL-ID.json

ingress:
  - hostname: dev-yourname.chainreact.app
    service: http://localhost:3000
  - service: http_status:404
```

### 5. DNS Setup (Admin Only)

Ask Nathan to add your CNAME record in Vercel:
- Name: `dev-yourname`
- Value: `YOUR-TUNNEL-ID.cfargotunnel.com`

## Daily Usage

### Starting Development

1. Start your dev server:
```bash
npm run dev
```

2. In another terminal, start your tunnel:
```bash
cloudflared tunnel run chainreact-yourname
```

3. Your app is now live at: `https://dev-yourname.chainreact.app`

### Stopping Development

1. Stop the tunnel: `Ctrl+C` in tunnel terminal
2. Stop dev server: `Ctrl+C` in dev server terminal

## Webhook Configuration

Update all your webhook URLs to use your permanent subdomain:

**Airtable:**
- Webhook URL: `https://dev-yourname.chainreact.app/api/webhooks/airtable`

**Gmail:**
- Push notification URL: `https://dev-yourname.chainreact.app/api/webhooks/gmail`

**Other integrations:**
- Just replace the ngrok URL with your permanent subdomain

## Quick Commands

```bash
# Check if tunnel is configured
cloudflared tunnel list

# Run tunnel (after setup)
cloudflared tunnel run chainreact-yourname

# Run tunnel without config file
cloudflared tunnel run --url http://localhost:3000 chainreact-yourname

# Check tunnel status
cloudflared tunnel info chainreact-yourname
```

## Troubleshooting

### "Tunnel not found"
- Make sure you're using the right tunnel name
- Run `cloudflared tunnel list` to see your tunnels

### "DNS not resolving"
- DNS changes can take 5-10 minutes to propagate
- Try `nslookup dev-yourname.chainreact.app` to check

### "Connection refused"
- Make sure your dev server is running on port 3000
- Check that tunnel is running in another terminal

### "Certificate errors"
- Cloudflare provides valid SSL certificates automatically
- Clear browser cache if seeing cert warnings

## Benefits Over Ngrok

| Feature | Ngrok Free | Cloudflare Tunnel |
|---------|------------|-------------------|
| Permanent URL | ❌ Changes | ✅ Never changes |
| Custom subdomain | ❌ Random | ✅ Your choice |
| Multiple developers | ❌ Difficult | ✅ Easy |
| SSL Certificate | ✅ Yes | ✅ Yes |
| Price | Free (limited) | Free (unlimited) |
| Setup time | 2 min | 10 min (once) |

## Security Notes

- Tunnel only works when actively running `cloudflared tunnel run`
- No security risk when tunnel is off (subdomain won't resolve)
- Each developer has isolated tunnel credentials
- No impact on production environment
- Cloudflare provides DDoS protection automatically

## Need Help?

1. Check the [Cloudflare Tunnel docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
2. Ask in team Slack/Discord
3. Nathan has admin access to DNS records