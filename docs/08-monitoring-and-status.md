# 08 — Monitoring & Status

> Health checks, system overview, and JSON output for monitoring integration.

[← Back to Index](00-index.md) · [Previous: Maintenance Mode](07-maintenance-mode.md) · [Next: Reference →](09-reference.md)

---

## The `status` Command

The `status` command gives you a complete health overview of your proxybuilder installation:

```bash
proxybuilder status
```

**Example output:**

```
─── Proxybuilder Status ──────────────────────────

  Version:    2.0.0
  Target:     /opt/proxybuilder
  Config:     ✓ Valid

─── System ───────────────────────────────────────
  nginx:      ✓ Running (pid 1234)
  certbot:    ✓ certbot 2.11.0
  Cron:       ✓ Installed

─── Domains (3 total) ────────────────────────────
  Enabled:      2
  Disabled:     1
  Maintenance:  0

─── Certificate Health ───────────────────────────
DOMAIN                  EXPIRES        DAYS LEFT     STATUS
──────────────────────  ─────────────  ────────────  ────────────────────
api.example.com         2026-06-15     82            ✓ OK
app.example.com         2026-04-10     16            ⚠ Expiring soon
staging.example.com     2026-06-15     82            ⚠ Staging cert
```

---

## What It Checks

### System Health

| Check | What it verifies |
|-------|-----------------|
| **nginx** | Is the process running? Reads `/run/nginx.pid` and verifies the process exists. |
| **certbot** | Is certbot installed? Runs `certbot --version` to get the version string. |
| **Cron** | Is the auto-renewal cron job installed? Checks the crontab for the renewal entry. |

### Domain Summary

| Metric | Description |
|--------|-------------|
| **Total** | Total number of domains in `proxybuilder.json` |
| **Enabled** | Domains currently active in nginx (in `sites-enabled/`) |
| **Disabled** | Domains that have been disabled (in `sites-disabled/`) |
| **Maintenance** | Domains currently in maintenance mode |

### Certificate Health

For each domain, the status command checks:

| Status | Meaning |
|--------|---------|
| ✓ OK | Certificate is valid and has > 30 days remaining |
| ⚠ Expiring soon | Certificate has < 30 days remaining |
| ⚠ Expiring very soon | Certificate has < 15 days remaining |
| ✗ Expired | Certificate has expired |
| ⚠ Staging cert | Certificate is from the staging environment (not trusted) |
| ? Unknown | Certificate couldn't be read or parsed |

---

## JSON Output

For scripting, monitoring tools, or dashboards, use the `--json` flag:

```bash
proxybuilder status --json
```

**Example JSON output:**

```json
{
  "version": "2.0.0",
  "target": "/opt/proxybuilder",
  "system": {
    "nginx": {
      "running": true,
      "pid": 1234
    },
    "certbot": {
      "installed": true,
      "version": "certbot 2.11.0"
    },
    "cron": {
      "installed": true
    }
  },
  "domains": {
    "total": 3,
    "enabled": 2,
    "disabled": 1,
    "maintenance": 0
  },
  "certificates": [
    {
      "domain": "api.example.com",
      "expires": "2026-06-15",
      "daysLeft": 82,
      "status": "✓ OK",
      "staging": false
    },
    {
      "domain": "app.example.com",
      "expires": "2026-04-10",
      "daysLeft": 16,
      "status": "⚠ Expiring soon",
      "staging": false
    },
    {
      "domain": "staging.example.com",
      "expires": "2026-06-15",
      "daysLeft": 82,
      "status": "⚠ Staging cert",
      "staging": true
    }
  ]
}
```

---

## Monitoring Integration Examples

### Simple health check script

```bash
#!/bin/bash
# Check if proxybuilder is healthy
STATUS=$(proxybuilder status --json)

# Check nginx is running
NGINX_RUNNING=$(echo "$STATUS" | jq -r '.system.nginx.running')
if [ "$NGINX_RUNNING" != "true" ]; then
    echo "CRITICAL: nginx is not running!"
    exit 2
fi

# Check for expiring certificates
EXPIRING=$(echo "$STATUS" | jq '[.certificates[] | select(.daysLeft != null and .daysLeft < 15)] | length')
if [ "$EXPIRING" -gt 0 ]; then
    echo "WARNING: $EXPIRING certificate(s) expiring within 15 days"
    exit 1
fi

echo "OK: All systems healthy"
exit 0
```

### Cron-based alert script

```bash
#!/bin/bash
# /etc/cron.daily/proxybuilder-check
# Sends an email alert if any cert expires within 14 days

ALERT_DAYS=14
STATUS=$(proxybuilder status --json 2>/dev/null)

EXPIRING=$(echo "$STATUS" | jq -r \
  ".certificates[] | select(.daysLeft != null and .daysLeft < $ALERT_DAYS) | .domain")

if [ -n "$EXPIRING" ]; then
    echo "The following certificates expire within $ALERT_DAYS days:" \
         $EXPIRING | mail -s "⚠ SSL Certificate Expiry Warning" admin@example.com
fi
```

### Prometheus / metrics endpoint

If you're running a metrics exporter, you can parse the JSON output:

```bash
# Extract cert days remaining for Prometheus textfile collector
proxybuilder status --json | jq -r \
  '.certificates[] | "proxybuilder_cert_days_remaining{domain=\"\(.domain)\"} \(.daysLeft // 0)"' \
  > /var/lib/node_exporter/proxybuilder.prom
```

---

## Quick Health Checks

### Is nginx running?

```bash
proxybuilder status --json | jq '.system.nginx.running'
# true
```

### How many domains?

```bash
proxybuilder status --json | jq '.domains.total'
# 3
```

### Any domains in maintenance?

```bash
proxybuilder status --json | jq '.domains.maintenance'
# 0
```

### Which certs are expiring soon?

```bash
proxybuilder status --json | jq '.certificates[] | select(.daysLeft < 30) | {domain, daysLeft}'
```

### Is the cron job installed?

```bash
proxybuilder status --json | jq '.system.cron.installed'
# true
```

---

## Command Reference

```bash
proxybuilder status [options]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--json` | `false` | Output as JSON instead of formatted table |

---

## What's Next?

- → **[09 — Reference](09-reference.md)** — Directory structure, config schema, global options, troubleshooting, command quick reference
