# Ops Commands: Proxybuilder v2

> **Document**: 03-07-commands-ops.md
> **Parent**: [Index](00-index.md)

## Overview

Operational commands for day-to-day management: `maintenance` (toggle maintenance mode) and `status` (health overview).

## Command: `maintenance`

### Purpose

Toggle maintenance mode for a domain. When enabled, the domain returns a 503 response with a maintenance page. No nginx reload is required — uses a file-based flag that nginx checks per-request.

### Usage

```bash
proxybuilder maintenance --domain api.example.com --on
proxybuilder maintenance --domain api.example.com --off
proxybuilder maintenance --domain api.example.com --status
```

### Arguments

| Flag | Alias | Type | Required | Default | Description |
|------|-------|------|----------|---------|-------------|
| `--domain` | `-d` | string | yes | | Domain to toggle |
| `--on` | | boolean | no | false | Enable maintenance mode |
| `--off` | | boolean | no | false | Disable maintenance mode |
| `--status` | `-s` | boolean | no | false | Check current maintenance state |

**Note:** Exactly one of `--on`, `--off`, or `--status` must be specified.

### Workflow: `--on`

```
1. Validate domain exists in config
2. Check domain is enabled (warn if disabled — maintenance mode is irrelevant)
3. Create maintenance flag file: <target>/apps/<domain>/maintenance.flag
4. Verify flag file exists
5. Update proxybuilder.json (maintenance: true)
6. Log: "✅ Maintenance mode ON for api.example.com"
7. Log: "Requests will receive 503 with maintenance page"
```

**No nginx reload needed.** The nginx config checks for the flag file per-request using `if (-f ...)`.

### Workflow: `--off`

```
1. Validate domain exists in config
2. Remove maintenance flag file: <target>/apps/<domain>/maintenance.flag
3. Verify flag file is removed
4. Update proxybuilder.json (maintenance: false)
5. Log: "✅ Maintenance mode OFF for api.example.com"
6. Log: "Domain is now serving traffic normally"
```

### Workflow: `--status`

```
1. Validate domain exists in config
2. Check if maintenance flag file exists
3. Report:
   - "Maintenance mode is ON for api.example.com"
   or
   - "Maintenance mode is OFF for api.example.com"
```

### Custom Maintenance Page

When a domain is created, the default `maintenance.html` from templates is copied to `<target>/apps/<domain>/maintenance.html`. Users can replace this file with their own custom page.

The nginx config uses `try_files`:
```nginx
location @maintenance {
    root %appFolder%/%domain%;
    try_files /maintenance.html =503;
    internal;
}
```

This means:
1. If `<target>/apps/<domain>/maintenance.html` exists → serve it
2. Otherwise → return a bare 503

### CI/CD Integration Example

```bash
# In a deployment pipeline:
ssh proxybuilder@server "proxybuilder maintenance --domain api.example.com --on"

# ... deploy application ...

ssh proxybuilder@server "proxybuilder maintenance --domain api.example.com --off"
```

### Output Examples

```
# Enable
2026-03-23 14:30:00 [INFO]  ✅ Maintenance mode ON for api.example.com
2026-03-23 14:30:00 [INFO]  Requests will receive 503 with maintenance page
2026-03-23 14:30:00 [INFO]  Custom page: /opt/proxybuilder/apps/api.example.com/maintenance.html

# Disable
2026-03-23 14:30:00 [INFO]  ✅ Maintenance mode OFF for api.example.com
2026-03-23 14:30:00 [INFO]  Domain is now serving traffic normally

# Status check
2026-03-23 14:30:00 [INFO]  Maintenance mode is OFF for api.example.com
```

---

## Command: `status`

### Purpose

Display a comprehensive health overview of the proxybuilder installation, including nginx status, certificate health, domain statuses, and potential issues.

### Usage

```bash
proxybuilder status
```

### Arguments

| Flag | Alias | Type | Required | Default | Description |
|------|-------|------|----------|---------|-------------|
| `--json` | | boolean | no | false | Output as JSON |

### Information Gathered

```
1. System status:
   - nginx running? (check pid file or systemctl)
   - certbot installed? (version)
   - proxybuilder version

2. Configuration:
   - Target folder
   - Config file valid?
   - Total domains configured

3. Domain summary:
   - Enabled count
   - Disabled count
   - In maintenance count

4. Certificate health:
   - For each enabled domain:
     - Certificate exists?
     - Days until expiry
     - Flag if < 30 days (warning)
     - Flag if expired (error)
     - Staging cert? (warning)

5. Cron job:
   - Auto-renewal cron installed?
   - Next scheduled run

6. Disk usage:
   - Target folder size
   - Log folder size
```

### Output Example

```
2026-03-23 14:30:00 [INFO]  ═══ Proxybuilder Status ═══

  Version:    2.0.0
  Target:     /opt/proxybuilder
  Config:     ✓ Valid

─── System ───────────────────────────────────────
  nginx:      ✓ Running (pid 1234)
  certbot:    ✓ 2.9.0
  Cron:       ✓ Installed (daily 03:00)

─── Domains (4 total) ────────────────────────────
  Enabled:      3
  Disabled:     1
  Maintenance:  0

─── Certificate Health ───────────────────────────
  DOMAIN               EXPIRES      DAYS LEFT   STATUS
  api.example.com      2026-08-15   145         ✓ OK
  *.example.com        2026-09-01   162         ✓ OK
  old.example.com      2026-04-05   13          ⚠ Expiring soon
  test.example.com     N/A          N/A         ⚠ Staging cert

─── Disk Usage ───────────────────────────────────
  Target folder:  24 MB
  Logs:           12 MB
```

### JSON Output

```json
{
  "version": "2.0.0",
  "target": "/opt/proxybuilder",
  "system": {
    "nginx": { "running": true, "pid": 1234 },
    "certbot": { "installed": true, "version": "2.9.0" },
    "cron": { "installed": true, "schedule": "0 3 * * *" }
  },
  "domains": {
    "total": 4,
    "enabled": 3,
    "disabled": 1,
    "maintenance": 0
  },
  "certificates": [
    {
      "domain": "api.example.com",
      "expires": "2026-08-15",
      "daysLeft": 145,
      "status": "ok"
    },
    {
      "domain": "old.example.com",
      "expires": "2026-04-05",
      "daysLeft": 13,
      "status": "expiring"
    }
  ]
}
```

### Implementation Notes

**Check nginx running:**
```typescript
function isNginxRunning(): { running: boolean; pid?: number } {
    try {
        const pid = fs.readFileSync("/run/nginx.pid", "utf-8").trim();
        // Verify process exists
        process.kill(parseInt(pid), 0);
        return { running: true, pid: parseInt(pid) };
    } catch {
        return { running: false };
    }
}
```

**Check cron installed:**
```typescript
function isCronInstalled(target: string): boolean {
    const crontab = shell.execCapture("crontab -l", { fatal: false });
    return crontab.includes("proxybuilder renew") && crontab.includes(target);
}
```

**Certificate expiry thresholds:**
- `> 30 days` → ✓ OK (green)
- `15-30 days` → ⚠ Expiring soon (yellow)
- `< 15 days` → ⚠ Expiring very soon (red)
- `expired` → ✗ Expired (red)
- `staging` → ⚠ Staging cert (yellow)

## Error Handling

| Error | Response |
|-------|----------|
| Config not found | "Not initialized. Run 'proxybuilder init' first" + exit 1 |
| Domain not found (maintenance) | "Domain <x> not configured" + exit 1 |
| No flag specified (maintenance) | "Specify --on, --off, or --status" + exit 1 |
| Both --on and --off specified | "Specify either --on or --off, not both" + exit 1 |
| nginx not running (status) | Show as warning, not error |
| Cannot read crontab | Show as "Cron: Unknown" |

## Testing Requirements

- `maintenance --on` creates flag file
- `maintenance --off` removes flag file
- `maintenance --status` correctly reports state
- Maintenance mode does NOT require nginx reload
- Custom maintenance.html is served when present
- `status` shows correct information for all categories
- `status --json` outputs valid JSON
- Certificate expiry thresholds are correct
