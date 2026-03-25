# 06 — SSL Certificates

> Renew, revoke, inspect certificates, use staging mode, and understand auto-renewal.

[← Back to Index](00-index.md) · [Previous: Domain Management](05-domain-management.md) · [Next: Maintenance Mode →](07-maintenance-mode.md)

---

## How SSL Works in Proxybuilder

When you create a domain, proxybuilder automatically provisions an SSL certificate from [Let's Encrypt](https://letsencrypt.org/). Here's what you need to know:

| Topic | Details |
|-------|---------|
| **Certificate Authority** | Let's Encrypt (free, automated) |
| **Certificate validity** | 90 days |
| **Auto-renewal** | Daily cron job at 3:00 AM |
| **Challenge types** | HTTP-01 (standard domains) or DNS-01 (wildcard domains) |
| **Storage location** | `/opt/proxybuilder/letsencrypt/live/<domain>/` |
| **Files** | `fullchain.pem`, `privkey.pem`, `chain.pem` |

---

## Inspecting Certificates

### View certificate details

```bash
proxybuilder cert-info --domain api.example.com
```

**Example output:**

```
  Subject:        CN = api.example.com
  Issuer:         C = US, O = Let's Encrypt, CN = R3
  Valid From:     Mar 15 00:00:00 2026 GMT
  Valid Until:    Jun 13 00:00:00 2026 GMT
  Days Remaining: 80
  Serial:         03:a1:b2:c3:...
  SANs:           api.example.com
  Staging:        No
  Key Type:       2048 bit

  Certificate Path: /opt/proxybuilder/letsencrypt/live/api.example.com/fullchain.pem
```

### What to look for

| Field | What it tells you |
|-------|-------------------|
| **Days Remaining** | How many days until expiry. Below 30 = expiring soon. |
| **Staging** | `Yes` means this is a test cert (not trusted by browsers). |
| **SANs** | Subject Alternative Names — which domains the cert covers. |
| **Issuer** | Should be "Let's Encrypt" for production certs. |

---

## Renewing Certificates

### Automatic renewal (recommended)

If you ran `proxybuilder init` without `--no-cron`, a cron job is already installed that runs daily at 3:00 AM:

```
0 3 * * * proxybuilder renew --target /opt/proxybuilder
```

This checks all enabled domains and renews any certificates that are close to expiry. **You don't need to do anything** — it just works.

### Manual renewal — all domains

```bash
proxybuilder renew
```

This checks all enabled domains and renews any that need it (typically within 30 days of expiry).

### Manual renewal — specific domain

```bash
proxybuilder renew --domain api.example.com
```

### Force renewal

Force renewal even if the certificate isn't close to expiry:

```bash
proxybuilder renew --force
proxybuilder renew --domain api.example.com --force
```

### Dry run (check what would be renewed)

```bash
proxybuilder renew --dry-run
```

### Command reference

| Flag | Alias | Required | Default | Description |
|------|-------|----------|---------|-------------|
| `--domain` | `-d` | No | _(all)_ | Specific domain to renew (omit for all) |
| `--staging` | `-x` | No | `false` | Use Let's Encrypt staging environment |
| `--force` | `-f` | No | `false` | Force renewal even if not expiring |
| `--dry-run` | | No | `false` | Check what would be renewed |

### How renewal works

For **standard domains** (HTTP-01 challenge):
1. Certbot places a verification file in the webroot
2. Let's Encrypt fetches the file via HTTP
3. New certificate is issued and saved
4. Nginx continues to serve the new cert automatically (via symlinks)

For **wildcard domains** (DNS-01 challenge):
1. Certbot invokes the auth hook script (e.g., `cloudns-auth.sh`)
2. The script creates a `_acme-challenge` TXT record via DNS API
3. Waits for DNS propagation (~2 minutes)
4. Let's Encrypt verifies the TXT record
5. New certificate is issued
6. Cleanup hook removes the TXT record

> 💡 **Renewal is seamless** — nginx doesn't need to be restarted because the certificate paths use Let's Encrypt symlinks that automatically point to the latest cert.

---

## Revoking Certificates

Revoke a certificate when you no longer need it (e.g., decommissioning a domain, compromised key).

### Interactive revocation

```bash
proxybuilder revoke --domain api.example.com
```

You'll be prompted for confirmation:

```
Are you sure you want to revoke the certificate for api.example.com? (y/N): y
```

### Non-interactive revocation

```bash
proxybuilder revoke --domain api.example.com --force
```

### What happens

1. Calls `certbot revoke` to revoke the certificate with Let's Encrypt
2. The domain configuration in `proxybuilder.json` is **preserved** — only the cert is revoked
3. The domain will serve an error until a new cert is obtained

> ⚠️ **After revoking**, the domain will use the self-signed fallback certificate. To get a new Let's Encrypt cert, delete and re-create the domain.

### Command reference

| Flag | Alias | Required | Default | Description |
|------|-------|----------|---------|-------------|
| `--domain` | `-d` | Yes | — | Domain whose certificate to revoke |
| `--force` | `-f` | No | `false` | Skip confirmation prompt |

---

## Let's Encrypt Staging

Let's Encrypt has [rate limits](https://letsencrypt.org/docs/rate-limits/) on production certificates:

| Limit | Value |
|-------|-------|
| Certificates per Registered Domain | 50 per week |
| Duplicate Certificates | 5 per week |
| Failed Validations | 5 per hour |

When testing or experimenting, use **staging mode** to avoid hitting these limits. Staging certificates are free and unlimited, but they are **not trusted by browsers**.

### Create with staging

```bash
proxybuilder create --domain test.example.com --upstream 127.0.0.1:5000 --staging
```

### Renew with staging

```bash
proxybuilder renew --domain test.example.com --staging
```

### Identify staging certificates

```bash
proxybuilder cert-info --domain test.example.com
# Shows "Staging: Yes"

proxybuilder list
# Shows "yes" in the STAGING column
```

### Switch from staging to production

```bash
# Delete the staging domain
proxybuilder delete --domain test.example.com --force

# Re-create with production cert
proxybuilder create --domain test.example.com --upstream 127.0.0.1:5000
```

> 💡 **When to use staging:**
> - First time setting up proxybuilder (test the full workflow)
> - Testing DNS provider credentials for wildcard certs
> - Debugging certificate issues
> - CI/CD pipelines that test the proxy setup

---

## Certificate Locations

Certificates are stored under the Let's Encrypt directory:

```
/opt/proxybuilder/letsencrypt/
├── lib/                         # Certbot internal data
└── live/
    └── api.example.com/
        ├── fullchain.pem        # Certificate + intermediate chain
        ├── privkey.pem          # Private key
        └── chain.pem            # Intermediate chain only
```

These are actually symlinks managed by certbot that always point to the latest certificate version. Nginx references these symlinks, so renewal is seamless.

---

## What's Next?

- → **[07 — Maintenance Mode](07-maintenance-mode.md)** — Zero-downtime maintenance for CI/CD
- → **[08 — Monitoring & Status](08-monitoring-and-status.md)** — Health checks and monitoring
