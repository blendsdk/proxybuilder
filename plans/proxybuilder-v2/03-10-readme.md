# README Specification: Proxybuilder v2

> **Document**: 03-10-readme.md
> **Parent**: [Index](00-index.md)

## Overview

The README.md is the primary documentation for proxybuilder. It must be comprehensive yet approachable, guiding users from installation through all features with practical examples.

## README Structure

### 1. Title & Badges

```markdown
# 🔧 Proxybuilder

> Nginx reverse proxy configuration builder with SSL, load balancing, and maintenance mode.

[![npm](https://img.shields.io/npm/v/@blendsdk/proxybuilder)](https://www.npmjs.com/package/@blendsdk/proxybuilder)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
```

### 2. What It Does (overview paragraph)

One paragraph explaining:
- Builds and manages nginx reverse proxy configurations
- Handles SSL via Let's Encrypt (including wildcard certs)
- Supports round-robin load balancing to multiple upstreams
- Maintenance mode for CI/CD
- Two proxy modes: passthrough and full

### 3. Architecture Diagram

```
┌─────────────────────────────────────────────┐
│                 Internet                     │
└──────────────────┬──────────────────────────┘
                   │ HTTPS (443) / HTTP (80)
                   ▼
┌─────────────────────────────────────────────┐
│              Nginx Proxy                     │
│         (managed by proxybuilder)            │
│                                              │
│  ┌─────────┐ ┌─────────┐ ┌──────────────┐  │
│  │ SSL     │ │ Routing │ │ Maintenance  │  │
│  │ Termination│ │ by domain│ │ Mode Check │  │
│  └─────────┘ └─────────┘ └──────────────┘  │
└──┬────────────────┬───────────────┬─────────┘
   │                │               │
   ▼                ▼               ▼
┌──────────┐  ┌──────────┐  ┌──────────────┐
│ Upstream │  │ Upstream │  │ Upstream     │
│ App 1    │  │ App 2    │  │ App 3 (x3)   │
│ :3000    │  │ :4000    │  │ :8080,:8081  │
│          │  │ (nginx)  │  │ :8082        │
└──────────┘  └──────────┘  └──────────────┘
```

### 4. Features List

Bullet list of key features with emoji icons:
- ✅ SSL via Let's Encrypt (auto-renewal)
- ✅ Wildcard certificates (*.example.com)
- ✅ Round-robin load balancing
- ✅ Passthrough mode (SSL termination only)
- ✅ Full mode (security headers, gzip)
- ✅ Maintenance mode (no nginx reload!)
- ✅ CI/CD friendly (SSH + CLI)
- ✅ Auto-renewal via cron
- ✅ Let's Encrypt staging for testing

### 5. Quick Start

Step-by-step from zero to first domain:

```bash
# 1. Install proxybuilder
npm install -g @blendsdk/proxybuilder

# 2. Install system prerequisites (on server)
sudo proxybuilder setup

# 3. Initialize proxybuilder
proxybuilder init --email info@example.com

# 4. Add your first domain
proxybuilder create --domain api.example.com --upstream 127.0.0.1:3000

# 5. Verify
proxybuilder list
```

### 6. Prerequisites

- Ubuntu 22.04+ (Debian-based)
- Node.js >= 20 LTS
- Root/sudo access (for nginx, firewall)
- Domain pointing to the server's IP

### 7. Installation

```bash
# Option A: Global install via npm
npm install -g @blendsdk/proxybuilder

# Option B: Global install via yarn
yarn global add @blendsdk/proxybuilder
```

### 8. System Setup

Detailed walkthrough of `proxybuilder setup`:
- What it installs
- Firewall configuration
- Verification steps

### 9. Command Reference

For each command:
- Description
- Usage syntax
- Arguments table
- Example output

Commands:
1. `setup` — Install system prerequisites
2. `init` — Initialize working directory
3. `create` — Add a domain
4. `delete` — Remove a domain
5. `enable` — Enable a disabled domain
6. `disable` — Disable a domain
7. `update` — Update domain config
8. `list` — List all domains
9. `renew` — Renew certificates
10. `revoke` — Revoke a certificate
11. `maintenance` — Toggle maintenance mode
12. `status` — Health overview
13. `cert-info` — Certificate details
14. `dns-setup` — Configure DNS provider

### 10. Proxy Modes

#### Passthrough Mode (default)

When to use:
- Upstream has its own nginx with security headers, gzip, etc.
- You only need SSL termination and routing

What it does:
- SSL termination
- Minimal proxy headers (Host, X-Real-IP, X-Forwarded-*)
- Route to upstream

What it does NOT do:
- No security headers (no HSTS, no X-Content-Type-Options)
- No gzip compression
- No favicon/robots.txt handling
- No access logging (handled by upstream)

#### Full Mode

When to use:
- Upstream is a bare HTTP app (Node.js, Python, Go)
- Upstream doesn't have its own nginx

What it adds on top of passthrough:
- Security headers
- Gzip compression
- Favicon/robots.txt handling
- Access/error logging

### 11. Wildcard Certificates

Step-by-step guide:
1. Set up DNS provider credentials
2. Create wildcard domain
3. Add subdomains

```bash
# 1. Configure DNS provider
proxybuilder dns-setup --provider cloudns

# 2. Create wildcard domain
proxybuilder create --domain "*.example.com" --upstream 127.0.0.1:8080 --dns-provider cloudns
```

### 12. Multiple Upstreams (Load Balancing)

```bash
# Create with multiple upstreams (round-robin)
proxybuilder create --domain api.example.com \
  --upstream 127.0.0.1:3000 \
  --upstream 127.0.0.1:3001 \
  --upstream 127.0.0.1:3002

# Update upstreams later
proxybuilder update --domain api.example.com \
  --upstream 127.0.0.1:4000 \
  --upstream 127.0.0.1:4001
```

### 13. Maintenance Mode

```bash
# Enable maintenance
proxybuilder maintenance --domain api.example.com --on

# Disable maintenance
proxybuilder maintenance --domain api.example.com --off

# Check status
proxybuilder maintenance --domain api.example.com --status

# CI/CD pipeline example
ssh user@server "proxybuilder maintenance --domain api.example.com --on"
deploy_app
ssh user@server "proxybuilder maintenance --domain api.example.com --off"
```

Custom maintenance page:
```bash
# Replace default page with your own
cp my-maintenance.html /opt/proxybuilder/apps/api.example.com/maintenance.html
```

### 14. Let's Encrypt Staging

For testing without hitting rate limits:

```bash
# Create with staging cert (not trusted by browsers)
proxybuilder create --domain test.example.com --upstream 127.0.0.1:5000 --staging

# Renew with staging
proxybuilder renew --domain test.example.com --staging
```

### 15. Configuration File

Explain `proxybuilder.json`:
- Location: `<target>/proxybuilder.json`
- Schema
- Manual editing (when appropriate)

### 16. Directory Structure

```
/opt/proxybuilder/
├── proxybuilder.json         # Configuration
├── dhparam.pem               # DH parameters
├── nginx/
│   ├── nginx.conf            # Main nginx config (symlinked to /etc/nginx/)
│   ├── sites-enabled/        # Active domain configs
│   ├── sites-disabled/       # Disabled domain configs
│   ├── modules-enabled/
│   └── conf.d/
├── proxy/
│   ├── proxy.conf            # Shared proxy headers
│   └── letsencrypt.conf      # ACME challenge config
├── ssl/
│   ├── self-ssl.key          # Self-signed key (fallback)
│   ├── self-ssl.crt          # Self-signed cert (fallback)
│   └── live/                 # Let's Encrypt certificates
│       └── <domain>/
│           ├── fullchain.pem
│           ├── privkey.pem
│           └── chain.pem
├── apps/
│   └── <domain>/
│       ├── upstream.conf     # Upstream server list
│       ├── ssl.conf          # SSL cert paths
│       ├── maintenance.conf  # Maintenance mode check
│       ├── maintenance.html  # Maintenance page
│       └── (mode-specific configs...)
├── logs/
│   ├── access.log
│   ├── error.log
│   ├── renewal.log
│   └── <domain>.access.log
├── letsencrypt/
│   └── lib/                  # Certbot working directory
└── dns/
    ├── auth-hook.sh          # DNS challenge auth script
    └── cleanup-hook.sh       # DNS challenge cleanup script
```

### 17. Troubleshooting

Common issues and solutions:

| Issue | Solution |
|-------|----------|
| "nginx not found" | Run `sudo proxybuilder setup` |
| Certificate request fails | Check domain points to server, check firewall |
| 502 Bad Gateway | Check upstream is running on specified port |
| Wildcard cert fails | Verify DNS credentials with `dns-setup` |
| Permission denied | Run setup as root, init as the target user |
| Rate limited by Let's Encrypt | Use `--staging` for testing |

### 18. Migration from v1

For users upgrading from `@truesoftware/proxybuilder`:

1. Backup existing `/opt/proxybuilder/`
2. Install v2: `npm install -g @blendsdk/proxybuilder`
3. Run `proxybuilder init --email your@email.com`
4. For each existing domain, run `proxybuilder create ...`
5. Certificates in `/opt/proxybuilder/ssl/live/` should still be valid

### 19. License

ISC

## Writing Style

- **Clear and concise** — no jargon without explanation
- **Examples first** — show the command, then explain
- **Copy-pasteable** — all code blocks should work directly
- **Progressive disclosure** — quick start first, details later
- **Consistent formatting** — all commands follow same pattern

## Testing Requirements

- All code examples in README are valid commands
- Quick start guide works on a fresh Ubuntu 22.04 server
- Architecture diagram is accurate
- All command examples match actual CLI interface
