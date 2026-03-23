# Cron Auto-Renewal: Proxybuilder v2

> **Document**: 03-09-cron-renewal.md
> **Parent**: [Index](00-index.md)

## Overview

Automatic certificate renewal via cron ensures SSL certificates are renewed before they expire. Let's Encrypt certificates are valid for 90 days; certbot's `--keep-until-expiring` flag renews when a certificate has less than 30 days remaining.

## Architecture

### Cron Job

Installed during `proxybuilder init` (unless `--no-cron` is specified):

```
0 3 * * * /usr/local/bin/proxybuilder renew --target /opt/proxybuilder >> /opt/proxybuilder/logs/renewal.log 2>&1
```

**Schedule:** Daily at 3:00 AM (server local time)

### Why Daily?

- Let's Encrypt recommends running renewal twice daily
- Daily is a good balance between frequency and log noise
- `--keep-until-expiring` ensures only expiring certs are actually renewed
- Typical renewal window: 30 days before expiry

## Implementation Details

### Cron Job Installation

```typescript
export function installCronJob(target: string, logger: Logger, shell: Shell): void {
    const proxybuilderPath = getProxybuilderBinPath();
    const cronLine = `0 3 * * * ${proxybuilderPath} renew --target ${target} >> ${target}/logs/renewal.log 2>&1`;

    // Check if already installed
    const currentCrontab = shell.execCapture("crontab -l 2>/dev/null || true");
    
    if (currentCrontab.includes("proxybuilder renew")) {
        logger.info("Cron job already installed");
        return;
    }

    // Add to crontab
    const newCrontab = currentCrontab.trimEnd() + "\n" + cronLine + "\n";
    
    // Write to temp file and install
    fs.writeFileSync("/tmp/proxybuilder-crontab", newCrontab);
    shell.exec("crontab /tmp/proxybuilder-crontab");
    fs.unlinkSync("/tmp/proxybuilder-crontab");

    logger.success("Cron job installed: daily renewal at 03:00");
}
```

### Finding the Proxybuilder Binary Path

```typescript
function getProxybuilderBinPath(): string {
    // Try common locations
    const candidates = [
        "/usr/local/bin/proxybuilder",
        "/usr/bin/proxybuilder",
        process.argv[0],  // Current execution path
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    // Fallback: use `which`
    try {
        return shell.execCapture("which proxybuilder").trim();
    } catch {
        return "proxybuilder"; // Hope it's in PATH
    }
}
```

### Cron Job Removal

For uninstallation or when user runs `init --no-cron` after previously having cron:

```typescript
export function removeCronJob(logger: Logger, shell: Shell): void {
    const currentCrontab = shell.execCapture("crontab -l 2>/dev/null || true");
    
    if (!currentCrontab.includes("proxybuilder renew")) {
        logger.info("No cron job to remove");
        return;
    }

    const lines = currentCrontab.split("\n");
    const filtered = lines.filter(line => !line.includes("proxybuilder renew"));
    
    fs.writeFileSync("/tmp/proxybuilder-crontab", filtered.join("\n"));
    shell.exec("crontab /tmp/proxybuilder-crontab");
    fs.unlinkSync("/tmp/proxybuilder-crontab");

    logger.success("Cron job removed");
}
```

### Renewal Log

The cron job appends output to `<target>/logs/renewal.log`. Example log:

```
2026-03-23 03:00:00 [INFO]  ═══ Certificate Renewal Check ═══
2026-03-23 03:00:00 [INFO]  Checking 3 enabled domains

2026-03-23 03:00:00 [INFO]  api.example.com: Certificate valid until 2026-08-15 (145 days). No renewal needed.
2026-03-23 03:00:01 [INFO]  *.example.com: Certificate valid until 2026-04-10 (18 days). Renewing...
2026-03-23 03:00:01 [CMD]   certbot certonly --manual --preferred-challenges dns -d "*.example.com" ...
2026-03-23 03:02:30 [OK]    Certificate renewed for *.example.com
2026-03-23 03:02:30 [INFO]  app.example.com: Certificate valid until 2026-09-01 (162 days). No renewal needed.

2026-03-23 03:02:30 [CMD]   nginx -s reload
2026-03-23 03:02:31 [OK]    Nginx reloaded

2026-03-23 03:02:31 [INFO]  ═══ Renewal Summary ═══
2026-03-23 03:02:31 [INFO]  Checked: 3 | Renewed: 1 | Failed: 0 | Skipped: 2
```

### Renewal Logic Per Domain

```typescript
function shouldRenew(sslFolder: string, domain: string, force: boolean): boolean {
    if (force) return true;

    const certPath = path.join(sslFolder, "live", domain, "fullchain.pem");
    if (!fs.existsSync(certPath)) {
        // No cert exists — needs renewal
        return true;
    }

    const daysLeft = getCertDaysRemaining(certPath);
    return daysLeft <= 30;
}
```

### Handling Mixed Cert Methods

The renewal command handles both webroot and DNS-01 certificates transparently:

```typescript
for (const { domain, config } of domains) {
    if (config.certMethod === "webroot") {
        renewWithWebroot(domain, config);
    } else if (config.certMethod === "dns") {
        renewWithDns(domain, config);
    }
}
```

## Log Rotation Consideration

The renewal log can grow indefinitely. Options:
1. Let the user configure logrotate (documented in README)
2. Add a simple log rotation in the renewal command (e.g., keep last 90 days)
3. Use `>> renewal.log 2>&1` and leave rotation to system logrotate

For v2, we'll document the logrotate approach in the README and optionally add basic rotation later.

## Error Handling

| Error | Response |
|-------|----------|
| Cron daemon not running | Warn during install, suggest enabling cron |
| Permission denied on crontab | Suggest running init as the correct user |
| Renewal fails for one domain | Log error, continue with next domain |
| All renewals fail | Log summary with errors, exit 1 |
| nginx reload fails after renewal | Log error, don't exit (certs are renewed, nginx needs manual intervention) |

## Testing Requirements

- Cron job is correctly installed in crontab
- Cron job line contains correct paths
- Duplicate cron jobs are not created
- Cron job removal works correctly
- Renewal log format is correct
- Renewal skips non-expiring certificates
- Renewal handles mixed cert methods
- Renewal continues on per-domain failure
