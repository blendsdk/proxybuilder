# 01 — Installation & Setup

> From a fresh Ubuntu server to a fully initialized proxybuilder in 4 steps.

[← Back to Index](00-index.md) · [Next: Creating Domains →](02-creating-domains.md)

---

## Prerequisites

Before you begin, make sure you have:

| Requirement | Details |
|-------------|---------|
| **Operating System** | Ubuntu 22.04+ (or any Debian-based distribution) |
| **Node.js** | Version 20 LTS or newer |
| **Root/sudo access** | Required for nginx, certbot, and firewall configuration |
| **Domain DNS** | Your domain's A record must point to this server's public IP address |
| **Open ports** | Port 80 (HTTP) and 443 (HTTPS) must be reachable from the internet |

> 💡 **Tip:** You can verify your DNS is set up correctly by running:
> ```bash
> dig +short api.example.com
> # Should return your server's IP address
> ```

---

## Step 1: Install Proxybuilder

Install the `proxybuilder` CLI tool globally on your server:

```bash
# Option A: Using npm
npm install -g @blendsdk/proxybuilder

# Option B: Using yarn
yarn global add @blendsdk/proxybuilder
```

Verify the installation:

```bash
proxybuilder --version
# 2.0.0

proxybuilder --help
# Shows all available commands
```

---

## Step 2: System Setup

The `setup` command installs all system-level prerequisites on a fresh Ubuntu server. **This must be run as root (sudo).**

```bash
sudo proxybuilder setup
```

### What it does (in order):

1. **Updates package lists** — `apt-get update`
2. **Installs base packages** — curl, wget, ca-certificates, gnupg-agent, software-properties-common
3. **Installs nginx** — via apt (skips if already installed)
4. **Installs certbot** — via snap (the recommended installation method)
5. **Configures the firewall (UFW)** — allows OpenSSH and Nginx Full (ports 80 + 443)
6. **Verifies** — checks that nginx, certbot, and openssl are available

### Preview mode (dry run)

Want to see what would be installed without actually doing it?

```bash
sudo proxybuilder setup --dry-run
```

This prints every command that _would_ be executed, without running any of them.

### Expected output

```
─── System Setup ─────────────────────────────────

─── Detecting system ─────────────────────────────
  OS: Ubuntu 24.04 LTS
  Architecture: x64

─── Installing system packages ───────────────────
  ✓ Package lists updated
  ✓ Base packages installed

─── Installing nginx ─────────────────────────────
  ✓ nginx installed

─── Installing certbot ───────────────────────────
  ✓ snapd installed
  ✓ certbot installed via snap
  ✓ certbot symlink created

─── Configuring firewall ─────────────────────────
  ✓ Firewall configured

─── Verification ─────────────────────────────────
  ✓ nginx: nginx version: nginx/1.24.0 (Ubuntu)
  ✓ certbot: certbot 2.11.0
  ✓ openssl: OpenSSL 3.0.13

  ✓ System setup complete!
  Next: run 'proxybuilder init --email your@email.com'
```

---

## Step 3: Initialize Proxybuilder

The `init` command creates the full working directory structure, generates SSL materials, configures nginx, and sets up automatic certificate renewal.

```bash
proxybuilder init --email you@example.com
```

> 📧 **The email address** is used for Let's Encrypt certificate registration. Let's Encrypt will send you expiry notifications to this address.

### What it does (in order):

1. **Creates directory structure** — All subdirectories under `/opt/proxybuilder/`
2. **Generates DH parameters** — 2048-bit Diffie-Hellman parameters (takes ~30-60 seconds)
3. **Generates self-signed certificate** — Fallback certificate for the default nginx server block
4. **Renders shared nginx configs** — `nginx.conf`, `proxy.conf`, `letsencrypt.conf`
5. **Installs nginx.conf symlink** — Links the generated config into `/etc/nginx/`
6. **Creates `proxybuilder.json`** — The configuration file (single source of truth)
7. **Installs cron job** — Daily certificate renewal at 3:00 AM
8. **Tests and reloads nginx** — Validates the config and applies it

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--email` / `-e` | _(required)_ | Let's Encrypt contact email |
| `--no-cron` | `false` | Skip cron job installation |
| `--dry-run` | `false` | Preview what would happen |
| `--target` / `-t` | `/opt/proxybuilder` | Custom data directory |

### Examples

```bash
# Standard init
proxybuilder init --email info@mycompany.com

# Skip cron (you'll handle renewal yourself)
proxybuilder init --email info@mycompany.com --no-cron

# Custom target directory
proxybuilder init --email info@mycompany.com --target /srv/proxybuilder

# Preview what would happen
proxybuilder init --email info@mycompany.com --dry-run
```

### Expected output

```
─── Proxybuilder Init ────────────────────────────

  Target directory: /opt/proxybuilder
  Email: info@mycompany.com
  Dry run: no
  Cron: install

─── Creating directory structure ─────────────────
  ✓ Created /opt/proxybuilder/nginx
  ✓ Created /opt/proxybuilder/nginx/sites-enabled
  ✓ Created /opt/proxybuilder/nginx/sites-disabled
  ✓ Created /opt/proxybuilder/proxy
  ✓ Created /opt/proxybuilder/ssl
  ✓ Created /opt/proxybuilder/apps
  ✓ Created /opt/proxybuilder/logs
  ✓ Created /opt/proxybuilder/dns
  ✓ Created /opt/proxybuilder/letsencrypt

─── Generating DH parameters ────────────────────
  ✓ DH parameters generated (2048-bit)

─── Generating self-signed certificate ──────────
  ✓ Self-signed certificate generated

─── Rendering shared configs ────────────────────
  ✓ nginx.conf rendered
  ✓ proxy.conf rendered
  ✓ letsencrypt.conf rendered

─── Installing nginx symlink ────────────────────
  ✓ nginx.conf symlinked to /etc/nginx/nginx.conf

─── Creating configuration file ─────────────────
  ✓ Configuration file created

─── Installing cron job ─────────────────────────
  ✓ Cron job installed (daily at 3:00 AM)

  ✓ nginx config test passed
  ✓ nginx reloaded

─── Init Complete ───────────────────────────────
  ✓ Proxybuilder initialized successfully!
  Target: /opt/proxybuilder
  Config: /opt/proxybuilder/proxybuilder.json

  Next steps:
    proxybuilder create example.com --upstream 127.0.0.1:3000
    proxybuilder list
```

---

## Step 4: Verify Everything Works

After init, run the status command to confirm everything is healthy:

```bash
proxybuilder status
```

You should see:

```
─── Proxybuilder Status ──────────────────────────

  Version:    2.0.0
  Target:     /opt/proxybuilder
  Config:     ✓ Valid

─── System ───────────────────────────────────────
  nginx:      ✓ Running (pid 1234)
  certbot:    ✓ certbot 2.11.0
  Cron:       ✓ Installed

─── Domains (0 total) ────────────────────────────
  Enabled:      0
  Disabled:     0
  Maintenance:  0
```

All green? You're ready to create your first domain.

---

## What's Next?

→ **[02 — Creating Domains](02-creating-domains.md)** — Add your first domain with SSL, learn about proxy modes, and set up load balancing.
