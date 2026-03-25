# 07 — Maintenance Mode

> Zero-downtime maintenance mode for CI/CD pipelines — no nginx reload required.

[← Back to Index](00-index.md) · [Previous: SSL Certificates](06-ssl-certificates.md) · [Next: Monitoring & Status →](08-monitoring-and-status.md)

---

## How It Works

Proxybuilder uses a **file-based maintenance mode**. When enabled, nginx checks for a flag file on every request. If the flag exists, nginx returns a **503 Service Unavailable** with a maintenance HTML page. If it doesn't, traffic flows normally.

```
Request → nginx → Flag file exists? → Yes → 503 + maintenance.html
                                     → No  → Proxy to upstream
```

**Key benefit:** No nginx reload is needed to toggle maintenance mode. This makes it:
- ⚡ Instant — takes effect immediately
- 🔒 Safe — no risk of nginx failing to reload
- 🔄 CI/CD friendly — can be toggled from deployment scripts

---

## Enabling Maintenance Mode

```bash
proxybuilder maintenance --domain api.example.com --on
```

Output:

```
✓ Maintenance mode ON for api.example.com
  Requests will receive 503 with maintenance page
  Custom page: /opt/proxybuilder/apps/api.example.com/maintenance.html
```

**What happens:**
1. A `maintenance.flag` file is created at `/opt/proxybuilder/apps/api.example.com/maintenance.flag`
2. The domain status is updated in `proxybuilder.json`
3. All new requests to the domain immediately receive a 503 response with the maintenance page

---

## Disabling Maintenance Mode

```bash
proxybuilder maintenance --domain api.example.com --off
```

Output:

```
✓ Maintenance mode OFF for api.example.com
  Domain is now serving traffic normally
```

**What happens:**
1. The `maintenance.flag` file is deleted
2. The domain status is updated in `proxybuilder.json`
3. Traffic immediately resumes flowing to the upstream

---

## Checking Status

```bash
proxybuilder maintenance --domain api.example.com --status
```

Output:

```
Maintenance mode is ON for api.example.com
```

or

```
Maintenance mode is OFF for api.example.com
```

---

## Command Reference

```bash
proxybuilder maintenance [options]
```

| Flag | Alias | Required | Default | Description |
|------|-------|----------|---------|-------------|
| `--domain` | `-d` | Yes | — | Domain to toggle |
| `--on` | | No | `false` | Enable maintenance mode |
| `--off` | | No | `false` | Disable maintenance mode |
| `--status` | `-s` | No | `false` | Check current state |

> You must specify exactly one of `--on`, `--off`, or `--status`.

---

## CI/CD Pipeline Example

Maintenance mode is designed for deployment pipelines. Here's how to use it for zero-downtime deployments:

### Basic deployment script

```bash
#!/bin/bash
set -e

SERVER="user@your-server.com"
DOMAIN="api.example.com"

echo "🔧 Enabling maintenance mode..."
ssh $SERVER "proxybuilder maintenance --domain $DOMAIN --on"

echo "🚀 Deploying application..."
# Your deployment steps here:
# - Pull new code
# - Install dependencies
# - Run migrations
# - Restart application
ssh $SERVER "cd /opt/myapp && git pull && npm install && npm run build && pm2 restart myapp"

echo "✅ Disabling maintenance mode..."
ssh $SERVER "proxybuilder maintenance --domain $DOMAIN --off"

echo "🎉 Deployment complete!"
```

### GitHub Actions example

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Enable maintenance mode
        run: ssh ${{ secrets.SERVER }} "proxybuilder maintenance --domain api.example.com --on"

      - name: Deploy application
        run: |
          ssh ${{ secrets.SERVER }} "cd /opt/myapp && git pull && npm ci && npm run build"
          ssh ${{ secrets.SERVER }} "pm2 restart myapp"

      - name: Disable maintenance mode
        run: ssh ${{ secrets.SERVER }} "proxybuilder maintenance --domain api.example.com --off"
        # Always run this step, even if deploy fails
        if: always()
```

> 💡 **Tip:** Use `if: always()` on the disable step to ensure maintenance mode is turned off even if the deployment fails.

### Docker deployment example

```bash
#!/bin/bash
set -e

DOMAIN="api.example.com"

# Maintenance on
proxybuilder maintenance --domain $DOMAIN --on

# Deploy new container
docker-compose pull
docker-compose up -d

# Wait for health check
sleep 10
curl -sf http://127.0.0.1:3000/health || { echo "Health check failed!"; exit 1; }

# Maintenance off
proxybuilder maintenance --domain $DOMAIN --off
```

---

## Custom Maintenance Page

By default, proxybuilder installs a generic maintenance HTML page at:

```
/opt/proxybuilder/apps/<domain>/maintenance.html
```

### Replace with your own page

Simply overwrite the file:

```bash
cp my-custom-maintenance.html /opt/proxybuilder/apps/api.example.com/maintenance.html
```

### Example custom page

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Maintenance — api.example.com</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: #f5f5f5;
            color: #333;
        }
        .container {
            text-align: center;
            padding: 2rem;
        }
        h1 { font-size: 2rem; margin-bottom: 0.5rem; }
        p { font-size: 1.2rem; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔧 Under Maintenance</h1>
        <p>We're performing scheduled maintenance. We'll be back shortly.</p>
        <p style="font-size: 0.9rem; margin-top: 2rem;">
            Expected downtime: ~5 minutes
        </p>
    </div>
</body>
</html>
```

> 💡 **Tip:** Your custom page persists across updates. Only `proxybuilder delete` removes it.

---

## How It Works Internally

The maintenance check is built into the nginx configuration for each domain via an `if` directive that checks for the flag file:

```nginx
# Simplified version of what proxybuilder generates
location / {
    # Check for maintenance flag
    if (-f /opt/proxybuilder/apps/api.example.com/maintenance.flag) {
        return 503;
    }

    proxy_pass http://upstream;
}

error_page 503 /maintenance.html;
location = /maintenance.html {
    root /opt/proxybuilder/apps/api.example.com;
    internal;
}
```

Because nginx evaluates the `if (-f ...)` directive on every request, toggling the flag file takes effect immediately — no reload needed.

---

## Maintenance Mode vs Disabling a Domain

| Feature | Maintenance Mode | Disable |
|---------|-----------------|---------|
| Effect | Returns 503 with custom page | Domain removed from nginx entirely |
| nginx reload needed | ❌ No | ✅ Yes |
| Visitors see | Maintenance page | Connection refused / generic error |
| SSL certificate affected | No | No |
| Toggle speed | Instant | ~1-2 seconds (nginx reload) |
| Best for | Deployments, short outages | Long-term offline, decommissioning |

**Rule of thumb:**
- **Short outage** (deploying, migrating data) → Use maintenance mode
- **Long outage** (taking a service offline) → Use `disable`

---

## What's Next?

- → **[08 — Monitoring & Status](08-monitoring-and-status.md)** — Health checks and system overview
- → **[09 — Reference](09-reference.md)** — Directory structure, config schema, troubleshooting
