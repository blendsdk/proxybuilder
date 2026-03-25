# 05 — Domain Management

> Enable, disable, update, and delete domains.

[← Back to Index](00-index.md) · [Previous: DNS — Namecheap](04-dns-namecheap.md) · [Next: SSL Certificates →](06-ssl-certificates.md)

---

## Listing Domains

Before managing domains, see what you have:

```bash
# Table format
proxybuilder list

# JSON format (for scripting)
proxybuilder list --json
```

**Example table output:**

```
DOMAIN                  STATUS      MODE            UPSTREAMS                       CERT EXPIRES    MAINT   STAGING
──────────────────────  ──────────  ──────────────  ──────────────────────────────  ──────────────  ───────  ────────
api.example.com         enabled     passthrough     127.0.0.1:3000,3001            2026-06-15      off     no
app.example.com         enabled     full            127.0.0.1:4000                 2026-06-15      off     no
*.example.com           enabled     passthrough     127.0.0.1:8080                 2026-06-15      off     no
staging.example.com     disabled    passthrough     127.0.0.1:5000                 2026-06-15      off     yes

Total: 4 domain(s)
```

---

## Disabling a Domain

Disabling a domain **temporarily removes it from nginx** without deleting anything. The SSL certificate, app folder, and config entry are all preserved.

```bash
proxybuilder disable --domain api.example.com
```

**What it does:**
- Moves the nginx site config from `sites-enabled/` to `sites-disabled/`
- Reloads nginx
- Updates the domain status in `proxybuilder.json`

**What it does NOT do:**
- Does NOT delete any files
- Does NOT revoke the SSL certificate
- Does NOT remove the domain from `proxybuilder.json`

> 💡 **Use case:** You're taking a service offline temporarily for maintenance, migration, or debugging — but you want to bring it back later without re-creating everything.

---

## Enabling a Domain

Re-enable a previously disabled domain:

```bash
proxybuilder enable --domain api.example.com
```

**What it does:**
- Moves the nginx site config from `sites-disabled/` back to `sites-enabled/`
- Reloads nginx
- Updates the domain status in `proxybuilder.json`

The domain is immediately live again with the same configuration and SSL certificate it had before.

---

## Updating a Domain

Change the upstream servers and/or proxy mode for an existing domain — without re-requesting a certificate.

### Update upstreams

```bash
# Replace all upstreams with new ones
proxybuilder update --domain api.example.com \
  --upstream 127.0.0.1:4000 \
  --upstream 127.0.0.1:4001
```

> ⚠️ **`--upstream` on update replaces ALL existing upstreams.** You must list every upstream you want, not just the new ones.

### Change proxy mode

```bash
# Switch from passthrough to full
proxybuilder update --domain api.example.com --mode full

# Switch from full to passthrough
proxybuilder update --domain app.example.com --mode passthrough
```

### Update both at once

```bash
proxybuilder update --domain api.example.com \
  --upstream 127.0.0.1:5000 \
  --mode full
```

### What happens on update

1. Validates inputs (upstreams, mode)
2. Re-renders all nginx config templates for the domain
3. Tests the nginx config (`nginx -t`)
4. Reloads nginx
5. Updates `proxybuilder.json`

### Command reference

| Flag | Alias | Required | Description |
|------|-------|----------|-------------|
| `--domain` | `-d` | Yes | Domain to update |
| `--upstream` | `-u` | No | New upstream(s) — replaces all existing |
| `--mode` | `-m` | No | New proxy mode: `passthrough` or `full` |

> 💡 You must provide at least one of `--upstream` or `--mode`.

---

## Deleting a Domain

Permanently removes a domain, its nginx configuration, app folder, and optionally its SSL certificate.

### Interactive deletion (with confirmation)

```bash
proxybuilder delete --domain api.example.com
```

You'll be prompted:

```
Are you sure you want to delete api.example.com? (y/N): y
```

### Non-interactive deletion (skip prompt)

```bash
proxybuilder delete --domain api.example.com --force
```

### Keep the certificate

If you want to delete the domain config but keep the SSL certificate (e.g., you plan to set it up again):

```bash
proxybuilder delete --domain api.example.com --force --keep-cert
```

### What `delete` does

1. Revokes the SSL certificate via certbot (unless `--keep-cert`)
2. Removes the nginx site config from `sites-enabled/` or `sites-disabled/`
3. Deletes the app folder (`/opt/proxybuilder/apps/<domain>/`)
4. Removes the domain entry from `proxybuilder.json`
5. Reloads nginx

### Command reference

| Flag | Alias | Required | Default | Description |
|------|-------|----------|---------|-------------|
| `--domain` | `-d` | Yes | — | Domain to delete |
| `--force` | `-f` | No | `false` | Skip confirmation prompt |
| `--keep-cert` | | No | `false` | Don't revoke the SSL certificate |

---

## Common Workflows

### Take a site offline temporarily

```bash
# Disable (preserves everything)
proxybuilder disable --domain api.example.com

# Later, bring it back
proxybuilder enable --domain api.example.com
```

### Migrate an app to a new port

```bash
# Your app moved from port 3000 to port 4000
proxybuilder update --domain api.example.com --upstream 127.0.0.1:4000
```

### Scale up, then scale down

```bash
# Scale up to 3 instances
proxybuilder update --domain api.example.com \
  --upstream 127.0.0.1:3000 \
  --upstream 127.0.0.1:3001 \
  --upstream 127.0.0.1:3002

# Scale back down to 1
proxybuilder update --domain api.example.com \
  --upstream 127.0.0.1:3000
```

### Switch a domain from passthrough to full mode

```bash
proxybuilder update --domain api.example.com --mode full
```

### Remove a domain completely

```bash
proxybuilder delete --domain old-api.example.com --force
```

---

## What's Next?

- → **[06 — SSL Certificates](06-ssl-certificates.md)** — Renew, revoke, inspect certificates
- → **[07 — Maintenance Mode](07-maintenance-mode.md)** — Zero-downtime maintenance for CI/CD
