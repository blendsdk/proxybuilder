# 🔧 Proxybuilder

> Nginx reverse proxy configuration builder with SSL, load balancing, and maintenance mode.

[![npm](https://img.shields.io/npm/v/@blendsdk/proxybuilder)](https://www.npmjs.com/package/@blendsdk/proxybuilder)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

Proxybuilder builds and manages nginx reverse proxy configurations on Ubuntu servers. It handles SSL certificate provisioning via Let's Encrypt (including wildcard certificates through DNS-01 challenges), supports round-robin load balancing to multiple upstream servers, and provides a file-based maintenance mode that requires no nginx reloads — making it ideal for CI/CD pipelines. Two proxy modes are available: **passthrough** (SSL termination + routing only) and **full** (adds security headers, gzip, and logging).

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Internet                      │
└────────────────────┬────────────────────────────┘
                     │ HTTPS (443) / HTTP (80)
                     ▼
┌─────────────────────────────────────────────────┐
│                Nginx Proxy                      │
│           (managed by proxybuilder)             │
│                                                 │
│  ┌──────────────┐ ┌──────────┐ ┌─────────────┐  │
│  │     SSL      │ │ Routing  │ │ Maintenance │  │
│  │ Termination  │ │ by domain│ │ Mode Check  │  │
│  └──────────────┘ └──────────┘ └─────────────┘  │
└──┬──────────────────┬────────────────┬──────────┘
   │                  │                │
   ▼                  ▼                ▼
┌──────────┐   ┌──────────┐   ┌───────────────┐
│ Upstream │   │ Upstream │   │ Upstream      │
│ App 1    │   │ App 2    │   │ App 3 (x3)    │
│ :3000    │   │ :4000    │   │ :8080,:8081   │
│          │   │ (nginx)  │   │ :8082         │
└──────────┘   └──────────┘   └───────────────┘
```

## Features

- ✅ **SSL via Let's Encrypt** — automatic certificate provisioning with auto-renewal
- ✅ **Wildcard certificates** — `*.example.com` via DNS-01 challenge (ClouDNS, Namecheap)
- ✅ **Round-robin load balancing** — multiple upstream servers per domain
- ✅ **Passthrough mode** — SSL termination only (upstream handles the rest)
- ✅ **Full mode** — security headers, gzip compression, access logging
- ✅ **Maintenance mode** — no nginx reload needed, CI/CD friendly
- ✅ **Auto-renewal** — daily cron job for certificate renewal
- ✅ **Let's Encrypt staging** — `--staging` flag for testing without rate limits
- ✅ **Comprehensive status** — system health, cert expiry, domain overview

## Quick Start

```bash
# 1. Install proxybuilder
npm install -g @blendsdk/proxybuilder

# 2. Install system prerequisites (on server, as root)
sudo proxybuilder setup

# 3. Initialize proxybuilder
proxybuilder init --email info@example.com

# 4. Add your first domain
proxybuilder create --domain api.example.com --upstream 127.0.0.1:3000

# 5. Verify
proxybuilder list
```

## Prerequisites

- **Ubuntu 22.04+** (Debian-based)
- **Node.js >= 20 LTS**
- **Root/sudo access** (for nginx, certbot, firewall configuration)
- **Domain DNS** pointing to the server's public IP address

## Installation

```bash
# Option A: Global install via npm
npm install -g @blendsdk/proxybuilder

# Option B: Global install via yarn
yarn global add @blendsdk/proxybuilder
```

## System Setup

The `setup` command installs all system-level prerequisites on a fresh Ubuntu server:

```bash
sudo proxybuilder setup
```

**What it does:**

1. Updates package lists (`apt-get update`)
2. Installs base packages (curl, wget, ca-certificates, etc.)
3. Installs nginx
4. Installs certbot via snap
5. Configures UFW firewall (allows OpenSSH + Nginx Full)
6. Verifies all installations

**Options:**

| Flag | Description |
|------|-------------|
| `--dry-run` | Show what would be installed without executing |

```bash
# Preview what would be installed
sudo proxybuilder setup --dry-run
```

## Command Reference

All commands accept these global options:

| Flag | Alias | Default | Description |
|------|-------|---------|-------------|
| `--target` | `-t` | `/opt/proxybuilder` | Target folder for proxybuilder data |
| `--verbose` | | `false` | Enable debug output |
| `--quiet` | | `false` | Suppress all output except errors |
| `--version` | | | Show version number |
| `--help` | `-h` | | Show help |

---

### `setup` — Install system prerequisites

```bash
sudo proxybuilder setup [--dry-run]
```

| Flag | Description |
|------|-------------|
| `--dry-run` | Show what would happen without executing |

---

### `init` — Initialize working directory

Creates the full directory structure, generates DH parameters, self-signed certificate, nginx config, and installs the renewal cron job.

```bash
proxybuilder init --email info@example.com
```

| Flag | Alias | Required | Default | Description |
|------|-------|----------|---------|-------------|
| `--email` | `-e` | Yes | — | Let's Encrypt contact email |
| `--no-cron` | | No | `false` | Skip cron job installation |
| `--dry-run` | | No | `false` | Show what would happen |

---

### `create` — Add a domain

Creates a new domain with SSL certificate and nginx configuration.

```bash
# Standard domain (HTTP-01 webroot challenge)
proxybuilder create --domain api.example.com --upstream 127.0.0.1:3000

# Multiple upstreams (round-robin)
proxybuilder create --domain api.example.com \
  --upstream 127.0.0.1:3000 \
  --upstream 127.0.0.1:3001 \
  --upstream 127.0.0.1:3002

# Full mode (security headers, gzip, logging)
proxybuilder create --domain app.example.com --upstream 127.0.0.1:4000 --mode full

# Wildcard domain (DNS-01 challenge)
proxybuilder create --domain "*.example.com" --upstream 127.0.0.1:8080 --dns-provider cloudns

# Staging certificate (for testing)
proxybuilder create --domain test.example.com --upstream 127.0.0.1:5000 --staging
```

| Flag | Alias | Required | Default | Description |
|------|-------|----------|---------|-------------|
| `--domain` | `-d` | Yes | — | Domain name (or `*.example.com` for wildcard) |
| `--upstream` | `-u` | Yes | — | Upstream address(es) in `host:port` format |
| `--mode` | `-m` | No | `passthrough` | Proxy mode: `passthrough` or `full` |
| `--dns-provider` | | No | — | DNS provider for wildcard certs (`cloudns`, `namecheap`) |
| `--staging` | `-x` | No | `false` | Use Let's Encrypt staging environment |
| `--dry-run` | | No | `false` | Show what would happen |

---

### `delete` — Remove a domain

Fully removes a domain: revokes the certificate, deletes nginx configs and the app folder, and updates `proxybuilder.json`.

```bash
# Interactive (prompts for confirmation)
proxybuilder delete --domain api.example.com

# Non-interactive (skip prompt)
proxybuilder delete --domain api.example.com --force

# Keep the certificate
proxybuilder delete --domain api.example.com --force --keep-cert
```

| Flag | Alias | Required | Default | Description |
|------|-------|----------|---------|-------------|
| `--domain` | `-d` | Yes | — | Domain to delete |
| `--force` | `-f` | No | `false` | Skip confirmation prompt |
| `--keep-cert` | | No | `false` | Don't revoke the SSL certificate |

---

### `enable` — Enable a disabled domain

Moves the nginx config from `sites-disabled/` to `sites-enabled/` and reloads nginx.

```bash
proxybuilder enable --domain api.example.com
```

| Flag | Alias | Required | Description |
|------|-------|----------|-------------|
| `--domain` | `-d` | Yes | Domain to enable |

---

### `disable` — Disable a domain

Moves the nginx config to `sites-disabled/` without deleting anything. The certificate and app folder are preserved.

```bash
proxybuilder disable --domain api.example.com
```

| Flag | Alias | Required | Description |
|------|-------|----------|-------------|
| `--domain` | `-d` | Yes | Domain to disable |

---

### `update` — Update domain configuration

Changes upstream addresses and/or proxy mode for an existing domain. Re-renders nginx templates and reloads.

```bash
# Update upstreams
proxybuilder update --domain api.example.com \
  --upstream 127.0.0.1:4000 \
  --upstream 127.0.0.1:4001

# Change proxy mode
proxybuilder update --domain api.example.com --mode full

# Both at once
proxybuilder update --domain api.example.com \
  --upstream 127.0.0.1:5000 --mode passthrough
```

| Flag | Alias | Required | Default | Description |
|------|-------|----------|---------|-------------|
| `--domain` | `-d` | Yes | — | Domain to update |
| `--upstream` | `-u` | No | — | New upstream address(es) — replaces all existing |
| `--mode` | `-m` | No | — | New proxy mode: `passthrough` or `full` |

---

### `list` — List all domains

Displays all configured domains in a table or JSON format.

```bash
# Table output
proxybuilder list

# JSON output (for scripting)
proxybuilder list --json
```

| Flag | Default | Description |
|------|---------|-------------|
| `--json` | `false` | Output as JSON instead of table |

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

### `renew` — Renew SSL certificates

Renews certificates for one or all enabled domains. Uses the correct challenge method (webroot or DNS-01) based on each domain's stored configuration.

```bash
# Renew all enabled domains
proxybuilder renew

# Renew a specific domain
proxybuilder renew --domain api.example.com

# Force renewal (even if not expiring)
proxybuilder renew --force

# Check what would be renewed
proxybuilder renew --dry-run
```

| Flag | Alias | Required | Default | Description |
|------|-------|----------|---------|-------------|
| `--domain` | `-d` | No | — | Specific domain to renew (omit for all) |
| `--staging` | `-x` | No | `false` | Use Let's Encrypt staging environment |
| `--force` | `-f` | No | `false` | Force renewal even if not expiring |
| `--dry-run` | | No | `false` | Check what would be renewed |

---

### `revoke` — Revoke a certificate

Revokes the SSL certificate for a domain via certbot. The domain configuration is preserved.

```bash
# Interactive (prompts for confirmation)
proxybuilder revoke --domain api.example.com

# Non-interactive
proxybuilder revoke --domain api.example.com --force
```

| Flag | Alias | Required | Default | Description |
|------|-------|----------|---------|-------------|
| `--domain` | `-d` | Yes | — | Domain whose certificate to revoke |
| `--force` | `-f` | No | `false` | Skip confirmation prompt |

---

### `cert-info` — Certificate details

Displays detailed SSL certificate information including subject, issuer, validity, SANs, and key type.

```bash
proxybuilder cert-info --domain api.example.com
```

| Flag | Alias | Required | Description |
|------|-------|----------|-------------|
| `--domain` | `-d` | Yes | Domain to inspect |

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

---

### `maintenance` — Toggle maintenance mode

Enables or disables maintenance mode per domain using a file-based flag. **No nginx reload is needed** — nginx checks for the flag file on each request.

```bash
# Enable maintenance mode
proxybuilder maintenance --domain api.example.com --on

# Disable maintenance mode
proxybuilder maintenance --domain api.example.com --off

# Check current status
proxybuilder maintenance --domain api.example.com --status
```

| Flag | Alias | Required | Default | Description |
|------|-------|----------|---------|-------------|
| `--domain` | `-d` | Yes | — | Domain to toggle |
| `--on` | | No | `false` | Enable maintenance mode |
| `--off` | | No | `false` | Disable maintenance mode |
| `--status` | `-s` | No | `false` | Check current state |

**CI/CD pipeline example:**

```bash
# Deploy with zero-downtime maintenance window
ssh user@server "proxybuilder maintenance --domain api.example.com --on"
deploy_app
ssh user@server "proxybuilder maintenance --domain api.example.com --off"
```

**Custom maintenance page:**

```bash
# Replace the default page with your own
cp my-maintenance.html /opt/proxybuilder/apps/api.example.com/maintenance.html
```

---

### `dns-setup` — Configure DNS provider

Interactively configures DNS provider API credentials for DNS-01 challenges (required for wildcard certificates). Tests the credentials, saves them to the config, and generates certbot hook scripts.

```bash
proxybuilder dns-setup --provider cloudns
proxybuilder dns-setup --provider namecheap
```

| Flag | Alias | Required | Description |
|------|-------|----------|-------------|
| `--provider` | `-p` | Yes | DNS provider: `cloudns` or `namecheap` |

---

### `status` — Health overview

Displays system health, domain summary, and certificate expiry status.

```bash
# Formatted output
proxybuilder status

# JSON output (for monitoring)
proxybuilder status --json
```

| Flag | Default | Description |
|------|---------|-------------|
| `--json` | `false` | Output as JSON |

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

## Proxy Modes

### Passthrough Mode (default)

**When to use:** Your upstream has its own nginx (or web server) that handles security headers, gzip, logging, etc. You only need SSL termination and routing.

**What it does:**
- SSL termination (HTTPS → HTTP)
- Proxy headers (`Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`)
- Route traffic to upstream server(s)

**What it does NOT do:**
- No security headers (no HSTS, no X-Content-Type-Options, etc.)
- No gzip compression
- No favicon/robots.txt handling
- No access logging (handled by upstream)

```bash
proxybuilder create --domain api.example.com --upstream 127.0.0.1:3000
# or explicitly:
proxybuilder create --domain api.example.com --upstream 127.0.0.1:3000 --mode passthrough
```

### Full Mode

**When to use:** Your upstream is a bare HTTP application (Node.js, Python, Go) that doesn't have its own web server or security headers.

**What it adds on top of passthrough:**
- Security headers (HSTS, X-Content-Type-Options, X-Frame-Options, etc.)
- Gzip compression
- Favicon and robots.txt handling
- Access and error logging per domain

```bash
proxybuilder create --domain app.example.com --upstream 127.0.0.1:4000 --mode full
```

## Wildcard Certificates

Wildcard certificates cover `*.example.com` — all subdomains under a domain. They require DNS-01 challenge, which means proxybuilder needs API access to your DNS provider.

**Step 1: Configure your DNS provider**

```bash
proxybuilder dns-setup --provider cloudns
# Follow the prompts to enter API credentials
```

**Step 2: Create the wildcard domain**

```bash
proxybuilder create --domain "*.example.com" --upstream 127.0.0.1:8080 --dns-provider cloudns
```

**Supported DNS providers:**
- **ClouDNS** — Requires auth-id and auth-password
- **Namecheap** — Requires API user, API key, and client IP

## Multiple Upstreams (Load Balancing)

Proxybuilder supports round-robin load balancing across multiple upstream servers via nginx upstream blocks.

```bash
# Create with multiple upstreams
proxybuilder create --domain api.example.com \
  --upstream 127.0.0.1:3000 \
  --upstream 127.0.0.1:3001 \
  --upstream 127.0.0.1:3002

# Update upstreams later
proxybuilder update --domain api.example.com \
  --upstream 127.0.0.1:4000 \
  --upstream 127.0.0.1:4001
```

> **Note:** `--upstream` on `update` replaces all existing upstreams.

## Let's Encrypt Staging

For testing without hitting [Let's Encrypt rate limits](https://letsencrypt.org/docs/rate-limits/):

```bash
# Create with staging certificate (not trusted by browsers)
proxybuilder create --domain test.example.com --upstream 127.0.0.1:5000 --staging

# Renew with staging
proxybuilder renew --domain test.example.com --staging
```

> ⚠️ Staging certificates are **not trusted** by browsers. They are for testing only.

## Configuration File

Proxybuilder stores all state in a single JSON config file:

**Location:** `<target>/proxybuilder.json` (default: `/opt/proxybuilder/proxybuilder.json`)

**Schema:**

```json
{
  "version": "2.0",
  "email": "info@example.com",
  "targetFolder": "/opt/proxybuilder",
  "defaults": {
    "proxyMode": "passthrough",
    "certMethod": "webroot"
  },
  "domains": {
    "api.example.com": {
      "proxyMode": "passthrough",
      "upstreams": ["127.0.0.1:3000", "127.0.0.1:3001"],
      "certMethod": "webroot",
      "enabled": true,
      "maintenance": false,
      "wildcard": false,
      "staging": false,
      "created": "2026-03-15T10:00:00.000Z",
      "updated": "2026-03-15T10:00:00.000Z"
    }
  },
  "dns": {
    "cloudns": {
      "provider": "cloudns",
      "authId": "1234",
      "authPassword": "secret"
    }
  }
}
```

> This file is the single source of truth. All commands read from and write to it. Manual editing is possible but not recommended — use the CLI commands instead.

## Directory Structure

```
/opt/proxybuilder/
├── proxybuilder.json           # Configuration (single source of truth)
├── dhparam.pem                 # Diffie-Hellman parameters (2048-bit)
├── nginx/
│   ├── nginx.conf              # Main nginx config (symlinked to /etc/nginx/)
│   ├── sites-enabled/          # Active domain configs
│   ├── sites-disabled/         # Disabled domain configs
│   ├── modules-enabled/
│   └── conf.d/
├── proxy/
│   ├── proxy.conf              # Shared proxy headers
│   └── letsencrypt.conf        # ACME challenge location
├── ssl/
│   ├── self-ssl.key            # Self-signed key (default server fallback)
│   └── self-ssl.crt            # Self-signed cert (default server fallback)
├── apps/
│   └── <domain>/
│       ├── upstream.conf       # Upstream server list
│       ├── ssl.conf            # SSL certificate paths
│       ├── maintenance.conf    # Maintenance mode check
│       ├── maintenance.html    # Maintenance page (customisable)
│       ├── maintenance.flag    # Maintenance mode flag (when active)
│       └── (mode-specific: security.conf, general.conf, log.conf)
├── logs/
│   ├── access.log
│   ├── error.log
│   ├── renewal.log
│   └── <domain>.access.log    # Per-domain logs (full mode only)
├── letsencrypt/
│   ├── lib/                    # Certbot working directory
│   └── live/
│       └── <domain>/
│           ├── fullchain.pem
│           ├── privkey.pem
│           └── chain.pem
└── dns/
    ├── cloudns-auth.sh         # DNS-01 auth hook (auto-generated)
    └── cloudns-cleanup.sh      # DNS-01 cleanup hook (auto-generated)
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "nginx not found" | Run `sudo proxybuilder setup` |
| "certbot not found" | Run `sudo proxybuilder setup` |
| "Not initialized" | Run `proxybuilder init --email your@email.com` |
| Certificate request fails | Check domain DNS points to server, check firewall allows port 80/443 |
| 502 Bad Gateway | Check upstream is running on the specified port |
| Wildcard cert fails | Verify DNS credentials with `proxybuilder dns-setup --provider <name>` |
| Permission denied | Run `setup` as root (sudo), `init` as the target user |
| Rate limited by Let's Encrypt | Use `--staging` flag for testing |
| nginx config test fails | Run `nginx -t` manually to see the detailed error |
| Maintenance mode not working | Check `maintenance.flag` exists: `ls /opt/proxybuilder/apps/<domain>/` |

## Migration from v1

For users upgrading from `@truesoftware/proxybuilder`:

1. **Backup** your existing `/opt/proxybuilder/` directory
2. **Install v2:** `npm install -g @blendsdk/proxybuilder`
3. **Initialize:** `proxybuilder init --email your@email.com`
4. **Re-create domains:** For each existing domain, run `proxybuilder create ...`
5. **Certificates:** Existing certificates in `/opt/proxybuilder/ssl/live/` should still be valid

> v2 is a complete rewrite. It uses a new directory structure and config format (`proxybuilder.json`). Direct upgrade without re-creating domains is not supported.

## License

ISC
