# Lifecycle Commands: Proxybuilder v2

> **Document**: 03-05-commands-lifecycle.md
> **Parent**: [Index](00-index.md)

## Overview

Domain lifecycle commands manage the full lifecycle of proxied domains: creation, deletion, enabling/disabling, updating configuration, and listing.

## Command: `create`

### Purpose

Add a new domain to the proxy with SSL certificate, upstream configuration, and proxy mode.

### Usage

```bash
proxybuilder create \
  --domain api.example.com \
  --upstream 127.0.0.1:3000 \
  [--upstream 127.0.0.1:3001] \
  [--mode passthrough] \
  [--dns-provider cloudns] \
  [--staging] \
  [--dry-run]
```

### Arguments

| Flag | Alias | Type | Required | Default | Description |
|------|-------|------|----------|---------|-------------|
| `--domain` | `-d` | string | yes | | Domain name (or `*.example.com` for wildcard) |
| `--upstream` | `-u` | array | yes | | Upstream address(es) in host:port format |
| `--mode` | `-m` | string | no | passthrough | Proxy mode: `passthrough` or `full` |
| `--dns-provider` | | string | no | | DNS provider for wildcard certs: `cloudns` or `namecheap` |
| `--staging` | `-x` | boolean | no | false | Use Let's Encrypt staging environment |
| `--dry-run` | | boolean | no | false | Show what would happen |

### Workflow

```
1. Validate inputs:
   - Domain format (standard or wildcard)
   - Upstream format(s) (host:port)
   - Proxy mode
   - If wildcard: dns-provider is required

2. Pre-flight checks:
   - Config loaded (init was run)
   - Domain doesn't already exist in config
   - nginx and certbot available

3. If staging: log LE_STAGING_NOTE warning

4. Create app folder: <target>/apps/<domain>/

5. Copy default maintenance.html to app folder

6. Render maintenance.conf template → <target>/apps/<domain>/maintenance.conf

7. Determine cert method:
   - Wildcard domain → dns (auto-detect)
   - Explicit --dns-provider → dns
   - Otherwise → webroot

8. Obtain SSL certificate:
   a. Render initial.conf (HTTP-only, for ACME challenge)
   b. Reload nginx
   c. Request certificate via certbot:
      - webroot: certbot certonly --webroot ...
      - dns: certbot certonly --manual --preferred-challenges dns ...
   d. If staging: use --test-cert flag

9. Render site config:
   - passthrough/site.conf or full/site.conf → <target>/nginx/sites-enabled/<domain>.conf
   - upstream.conf → <target>/apps/<domain>/upstream.conf
   - ssl.conf → <target>/apps/<domain>/ssl.conf
   - maintenance.conf → <target>/apps/<domain>/maintenance.conf
   - (full mode only) security.conf, general.conf, log.conf

10. Test nginx config (nginx -t)
11. Reload nginx (nginx -s reload)

12. Update proxybuilder.json:
    - Add domain entry with all settings
    - Save config

13. Log success with domain details
```

### Output Example

```
2026-03-23 14:30:00 [INFO]  ═══ Creating proxy for api.example.com ═══
2026-03-23 14:30:00 [INFO]  Mode: passthrough
2026-03-23 14:30:00 [INFO]  Upstreams: 127.0.0.1:3000, 127.0.0.1:3001
2026-03-23 14:30:00 [INFO]  Certificate: webroot (Let's Encrypt production)

2026-03-23 14:30:00 [INFO]  ─── Requesting SSL certificate ───
2026-03-23 14:30:00 [CMD]   certbot certonly --webroot -d api.example.com ...
2026-03-23 14:30:15 [OK]    Certificate obtained

2026-03-23 14:30:15 [INFO]  ─── Configuring nginx ───
2026-03-23 14:30:15 [INFO]  Rendered site.conf
2026-03-23 14:30:15 [INFO]  Rendered upstream.conf (2 servers, round-robin)
2026-03-23 14:30:15 [CMD]   nginx -t
2026-03-23 14:30:15 [OK]    Config test passed
2026-03-23 14:30:15 [CMD]   nginx -s reload
2026-03-23 14:30:16 [OK]    Nginx reloaded

2026-03-23 14:30:16 [OK]    ✅ Domain api.example.com created successfully
```

---

## Command: `delete`

### Purpose

Fully remove a domain: revoke SSL certificate, remove all config files, remove from proxybuilder.json.

### Usage

```bash
proxybuilder delete --domain api.example.com [--force] [--keep-cert]
```

### Arguments

| Flag | Alias | Type | Required | Default | Description |
|------|-------|------|----------|---------|-------------|
| `--domain` | `-d` | string | yes | | Domain to delete |
| `--force` | `-f` | boolean | no | false | Skip confirmation prompt |
| `--keep-cert` | | boolean | no | false | Don't revoke the SSL certificate |

### Workflow

```
1. Validate domain exists in config
2. If not --force: prompt "Delete api.example.com and revoke its certificate? [y/N]"
3. If not --keep-cert: revoke SSL certificate via certbot
4. Remove site config: <target>/nginx/sites-enabled/<domain>.conf
5. Remove disabled config (if exists): <target>/nginx/sites-disabled/<domain>.conf
6. Remove app folder: <target>/apps/<domain>/
7. Test nginx config (nginx -t)
8. Reload nginx
9. Remove domain from proxybuilder.json
10. Log success
```

### Confirmation Prompt

```
⚠️  This will permanently delete:
  - SSL certificate for api.example.com
  - Nginx configuration
  - App folder (/opt/proxybuilder/apps/api.example.com/)

  Continue? [y/N]:
```

---

## Command: `enable`

### Purpose

Re-enable a previously disabled domain.

### Usage

```bash
proxybuilder enable --domain api.example.com
```

### Arguments

| Flag | Alias | Type | Required | Default | Description |
|------|-------|------|----------|---------|-------------|
| `--domain` | `-d` | string | yes | | Domain to enable |

### Workflow

```
1. Validate domain exists in config
2. Check domain is currently disabled
3. Move config from sites-disabled/ to sites-enabled/
4. Update proxybuilder.json (enabled: true)
5. Test nginx config (nginx -t)
6. Reload nginx
7. Log success
```

---

## Command: `disable`

### Purpose

Temporarily disable a domain without deleting configuration or certificates.

### Usage

```bash
proxybuilder disable --domain api.example.com
```

### Arguments

| Flag | Alias | Type | Required | Default | Description |
|------|-------|------|----------|---------|-------------|
| `--domain` | `-d` | string | yes | | Domain to disable |

### Workflow

```
1. Validate domain exists in config
2. Check domain is currently enabled
3. Move config from sites-enabled/ to sites-disabled/
4. Update proxybuilder.json (enabled: false)
5. Test nginx config (nginx -t)
6. Reload nginx
7. Log success
```

### Implementation Note

The sites-disabled folder holds the config files for disabled domains. The nginx.conf only includes `sites-enabled/*.conf`, so moving a file out of that directory effectively disables it.

---

## Command: `update`

### Purpose

Modify the configuration of an existing domain (upstreams, mode, etc.) and re-render templates.

### Usage

```bash
proxybuilder update --domain api.example.com \
  [--upstream 127.0.0.1:4000] \
  [--upstream 127.0.0.1:4001] \
  [--mode full]
```

### Arguments

| Flag | Alias | Type | Required | Default | Description |
|------|-------|------|----------|---------|-------------|
| `--domain` | `-d` | string | yes | | Domain to update |
| `--upstream` | `-u` | array | no | | New upstream(s) — replaces all existing |
| `--mode` | `-m` | string | no | | New proxy mode |

### Workflow

```
1. Validate domain exists in config
2. Validate new values (upstream format, mode)
3. Update config in memory
4. Re-render all templates for the domain:
   - If mode changed: switch template set (passthrough ↔ full)
   - If upstreams changed: re-render upstream.conf
   - Re-render site.conf with current settings
5. Test nginx config (nginx -t)
6. Reload nginx
7. Save updated proxybuilder.json
8. Log changes
```

### Output Example

```
2026-03-23 14:30:00 [INFO]  ═══ Updating api.example.com ═══
2026-03-23 14:30:00 [INFO]  Changes:
2026-03-23 14:30:00 [INFO]    Upstreams: 127.0.0.1:3000 → 127.0.0.1:4000, 127.0.0.1:4001
2026-03-23 14:30:00 [INFO]    Mode: passthrough (unchanged)
2026-03-23 14:30:00 [INFO]  Re-rendering templates...
2026-03-23 14:30:00 [CMD]   nginx -t
2026-03-23 14:30:00 [OK]    ✅ Domain api.example.com updated
```

---

## Command: `list`

### Purpose

Display all configured domains in a formatted table.

### Usage

```bash
proxybuilder list [--json]
```

### Arguments

| Flag | Alias | Type | Required | Default | Description |
|------|-------|------|----------|---------|-------------|
| `--json` | | boolean | no | false | Output as JSON instead of table |

### Table Output

```
DOMAIN               STATUS    MODE          UPSTREAMS                    CERT EXPIRES   MAINT  STAGING
api.example.com      enabled   passthrough   127.0.0.1:3000,3001         2026-08-15     off    no
*.example.com        enabled   full          127.0.0.1:8080              2026-09-01     off    no
old.example.com      disabled  passthrough   127.0.0.1:4000              2026-07-20     off    no
test.example.com     enabled   passthrough   127.0.0.1:5000              N/A            on     yes
```

### JSON Output

```json
{
  "domains": [
    {
      "domain": "api.example.com",
      "status": "enabled",
      "mode": "passthrough",
      "upstreams": ["127.0.0.1:3000", "127.0.0.1:3001"],
      "certExpiry": "2026-08-15",
      "maintenance": false,
      "staging": false
    }
  ]
}
```

### Certificate Expiry Detection

Read the certificate file and extract expiry:
```typescript
function getCertExpiry(sslFolder: string, domain: string): string {
    const certPath = path.join(sslFolder, "live", domain, "fullchain.pem");
    if (!fs.existsSync(certPath)) return "N/A";
    
    const result = shell.execCapture(
        `openssl x509 -enddate -noout -in ${certPath}`
    );
    // Parse "notAfter=Aug 15 12:00:00 2026 GMT" → "2026-08-15"
    return parseDateFromOpenSSL(result);
}
```

## Error Handling (shared across lifecycle commands)

| Error | Response |
|-------|----------|
| Config not found | "Not initialized. Run 'proxybuilder init' first" + exit 1 |
| Domain not found | "Domain <x> not configured. Run 'proxybuilder list' to see domains" + exit 1 |
| Domain already exists (create) | "Domain <x> already exists. Use 'update' to modify" + exit 1 |
| Domain already enabled | "Domain <x> is already enabled" + exit 0 |
| Domain already disabled | "Domain <x> is already disabled" + exit 0 |
| nginx -t fails after changes | Roll back config changes, show nginx error, exit 1 |
| certbot fails | Show certbot error output, suggest checking DNS/firewall |
| No upstreams specified (create) | "At least one --upstream is required" + exit 1 |

## Testing Requirements

- `create` generates correct config for passthrough mode
- `create` generates correct config for full mode
- `create` with multiple upstreams generates correct upstream.conf
- `create --staging` uses Let's Encrypt staging environment
- `delete` removes all files and config entries
- `delete --force` skips confirmation
- `enable`/`disable` moves config between sites-enabled and sites-disabled
- `update --upstream` updates upstream.conf correctly
- `update --mode` switches template set
- `list` shows correct table with all domains
- `list --json` outputs valid JSON
