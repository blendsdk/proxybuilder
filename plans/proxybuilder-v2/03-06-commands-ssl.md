# SSL Commands: Proxybuilder v2

> **Document**: 03-06-commands-ssl.md
> **Parent**: [Index](00-index.md)

## Overview

SSL-related commands manage certificate lifecycle and DNS provider configuration: `renew`, `revoke`, `cert-info`, and `dns-setup`.

## Command: `renew`

### Purpose

Renew SSL certificates for one or all domains. Uses the appropriate challenge method (webroot or DNS-01) based on each domain's configuration.

### Usage

```bash
proxybuilder renew                              # Renew all domains
proxybuilder renew --domain api.example.com     # Renew specific domain
proxybuilder renew --staging                    # Renew using staging environment
```

### Arguments

| Flag | Alias | Type | Required | Default | Description |
|------|-------|------|----------|---------|-------------|
| `--domain` | `-d` | string | no | | Specific domain to renew (omit for all) |
| `--staging` | `-x` | boolean | no | false | Use Let's Encrypt staging |
| `--force` | `-f` | boolean | no | false | Force renewal even if not expiring |
| `--dry-run` | | boolean | no | false | Check what would be renewed |

### Workflow

```
1. Load config
2. If --domain specified:
   - Validate domain exists and is enabled
   - Renew that domain only
3. If no --domain:
   - Get all enabled domains from config
   - For each domain, attempt renewal

4. For each domain to renew:
   a. Determine cert method from config (webroot or dns)
   b. Build certbot command:
      - webroot: certbot certonly --webroot -d <domain> ...
      - dns: certbot certonly --manual --preferred-challenges dns -d <domain> ...
   c. Add flags:
      - --keep-until-expiring (unless --force)
      - --test-cert (if domain was created with staging, or --staging flag)
      - --agree-tos -n (non-interactive)
      - -m <email from config>
      - --work-dir, --logs-dir, --config-dir (within target folder)
   d. Execute certbot
   e. Log result

5. Reload nginx (once, after all renewals)
6. Log summary
```

### Certbot Commands

**Webroot renewal:**
```bash
certbot certonly \
  --webroot \
  -d api.example.com \
  --webroot-path /opt/proxybuilder/letsencrypt \
  --work-dir /opt/proxybuilder/letsencrypt/lib \
  --logs-dir /opt/proxybuilder/logs \
  --config-dir /opt/proxybuilder/ssl \
  --keep-until-expiring \
  -n --agree-tos \
  -m info@example.com \
  --expand
```

**DNS-01 renewal (wildcard):**
```bash
certbot certonly \
  --manual \
  --preferred-challenges dns \
  -d "*.example.com" \
  -d "example.com" \
  --manual-auth-hook "/opt/proxybuilder/dns/auth-hook.sh" \
  --manual-cleanup-hook "/opt/proxybuilder/dns/cleanup-hook.sh" \
  --work-dir /opt/proxybuilder/letsencrypt/lib \
  --logs-dir /opt/proxybuilder/logs \
  --config-dir /opt/proxybuilder/ssl \
  --keep-until-expiring \
  -n --agree-tos \
  -m info@example.com \
  --expand
```

**Staging flag:** Add `--test-cert` to use Let's Encrypt staging environment.

### Cron Integration

This command is called daily by the cron job installed during `init`:
```
0 3 * * * /usr/local/bin/proxybuilder renew --target /opt/proxybuilder >> /opt/proxybuilder/logs/renewal.log 2>&1
```

Certbot's `--keep-until-expiring` flag ensures certificates are only renewed when they're within 30 days of expiry.

---

## Command: `revoke`

### Purpose

Revoke the SSL certificate for a domain without removing the domain configuration.

### Usage

```bash
proxybuilder revoke --domain api.example.com [--force]
```

### Arguments

| Flag | Alias | Type | Required | Default | Description |
|------|-------|------|----------|---------|-------------|
| `--domain` | `-d` | string | yes | | Domain whose cert to revoke |
| `--force` | `-f` | boolean | no | false | Skip confirmation |

### Workflow

```
1. Validate domain exists in config
2. If not --force: prompt "Revoke SSL certificate for api.example.com? [y/N]"
3. Determine staging flag from domain config
4. Execute certbot revoke:
   certbot revoke \
     [--test-cert if staging] \
     --work-dir <target>/letsencrypt/lib \
     --logs-dir <target>/logs \
     --config-dir <target>/ssl \
     -n \
     --cert-name <domain>
5. Log result
```

**Note:** Revoking a certificate does NOT remove the nginx config. The domain will continue to be configured but with an invalid certificate. Typically you'd `delete` instead, or `revoke` then request a new cert with `renew --force`.

---

## Command: `cert-info`

### Purpose

Display detailed information about a domain's SSL certificate.

### Usage

```bash
proxybuilder cert-info --domain api.example.com
```

### Arguments

| Flag | Alias | Type | Required | Default | Description |
|------|-------|------|----------|---------|-------------|
| `--domain` | `-d` | string | yes | | Domain to inspect |

### Output Example

```
2026-03-23 14:30:00 [INFO]  ═══ Certificate Info: api.example.com ═══

  Subject:        CN=api.example.com
  Issuer:         C=US, O=Let's Encrypt, CN=R3
  Valid From:     2026-02-15 00:00:00 UTC
  Valid Until:    2026-05-16 23:59:59 UTC
  Days Remaining: 54
  Serial:         04:A3:B2:...
  SANs:           api.example.com
  Staging:        No
  Key Type:       RSA 2048-bit

  Certificate Path: /opt/proxybuilder/ssl/live/api.example.com/fullchain.pem
```

### Implementation

Uses `openssl x509` to read certificate details:
```typescript
const certPath = path.join(sslFolder, "live", domain, "fullchain.pem");
const output = shell.execCapture(`openssl x509 -in ${certPath} -noout -subject -issuer -dates -serial -ext subjectAltName`);
```

---

## Command: `dns-setup`

### Purpose

Configure DNS provider API credentials for DNS-01 certificate challenges (required for wildcard domains).

### Usage

```bash
proxybuilder dns-setup --provider cloudns
proxybuilder dns-setup --provider namecheap
```

### Arguments

| Flag | Alias | Type | Required | Default | Description |
|------|-------|------|----------|---------|-------------|
| `--provider` | `-p` | string | yes | | DNS provider: `cloudns` or `namecheap` |

### Workflow

```
1. Validate provider name
2. Load config
3. Prompt for provider-specific credentials:

   ClouDNS:
   - Auth ID (sub-auth-id or auth-id)
   - Auth Password

   Namecheap:
   - API User
   - API Key
   - Client IP (for API whitelist)

4. Test credentials (optional — make a simple API call to verify)
5. Store in proxybuilder.json under "dns" key
6. Generate auth-hook.sh and cleanup-hook.sh scripts in <target>/dns/
7. Set script permissions to 700
8. Log success
```

### DNS Hook Scripts

These are shell scripts called by certbot during DNS-01 challenge:

**`<target>/dns/auth-hook.sh`** — Called to create the TXT record:
```bash
#!/bin/bash
# Auto-generated by proxybuilder dns-setup
# Provider: cloudns
node /path/to/proxybuilder dns-challenge --action create \
  --domain "$CERTBOT_DOMAIN" \
  --token "$CERTBOT_VALIDATION" \
  --provider cloudns \
  --target /opt/proxybuilder
```

**`<target>/dns/cleanup-hook.sh`** — Called to remove the TXT record:
```bash
#!/bin/bash
# Auto-generated by proxybuilder dns-setup
node /path/to/proxybuilder dns-challenge --action cleanup \
  --domain "$CERTBOT_DOMAIN" \
  --token "$CERTBOT_VALIDATION" \
  --provider cloudns \
  --target /opt/proxybuilder
```

**Note:** The hook scripts call back into proxybuilder itself with an internal `dns-challenge` sub-command (not exposed to users) that handles the actual API calls. This keeps the DNS logic in TypeScript rather than bash.

### Credential Security

- Credentials stored in `proxybuilder.json` which has 600 permissions
- Hook scripts have 700 permissions (owner execute only)
- Credentials are never logged (shell.exec with `silent: true`)

## Error Handling

| Error | Response |
|-------|----------|
| Domain not found | "Domain <x> not configured" + exit 1 |
| Certificate not found | "No certificate found for <x>. Has it been provisioned?" + exit 1 |
| certbot renewal fails | Show certbot error, suggest checking challenge method |
| DNS credentials invalid | "DNS API test failed. Check credentials" + exit 1 |
| Unknown DNS provider | "Unsupported provider. Available: cloudns, namecheap" + exit 1 |
| certbot revoke fails | Show certbot error output |

## Testing Requirements

- `renew` with webroot builds correct certbot command
- `renew` with dns builds correct certbot command with hooks
- `renew` with `--staging` adds `--test-cert` flag
- `renew` all iterates over all enabled domains
- `revoke` calls certbot with correct parameters
- `cert-info` parses and displays all certificate fields
- `dns-setup` stores credentials securely
- `dns-setup` generates working hook scripts
